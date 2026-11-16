/**
 * Level-spread probe: measures the level every calibrated instrument and recorded pack actually
 * produces after its trim, and fails when they are no longer within a couple of dB of each other.
 *
 * This is the guard on src/audio/levelCalibration.ts. `npm test` can only check that every type HAS
 * an entry; only a browser can prove the DSP still renders where the table expects it to. A stale
 * table, a changed engine default or a new pack that skipped calibration all show up here as spread.
 *
 * The method mirrors the generator (scripts/calibrate-levels.mjs): gate a chord at velocity 0.85 on
 * an OfflineAudioContext, take the peak, multiply by the trim the engine installs, and compare.
 * Recorded packs gate notes they actually sample, because their key maps are thinned.
 *
 * It fails on the typical (median) deviation and on any gross outlier, not on worst-to-best spread:
 * a randomised engine legitimately moves ~1.5 dB between passes, so a max-min rule at a couple of
 * dB would fail on the probe's own noise, while a table that drifted moves every entry.
 *
 * Coverage is every calibrated type, which is ~260 renders. That fits the runner's budget because
 * one pass costs about 0.3 s; the deadline below keeps a pathological pack from eating the rest.
 */
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { CALIBRATION_TARGET_PEAK, MEASURED_TYPE_TRIM, levelTrimFor } from '../../src/audio/levelCalibration.ts';
import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

type DeviceTypeArg = Parameters<typeof audioEngine.createDevice>[0];

/** "A couple of dB" for the typical instrument. */
const DEFAULT_LIMIT_DB = 2;
/** A level this far off is not noise on any engine — it is a stale entry or a changed gain stage. */
const GROSS_DB = 8;
/** Independent render passes per instrument; the median of them is the reading. */
const PASSES = 3;
/** A pack that renders this far under target was probably still decoding; measure it once more.
 *  Loading is one-sided (a half-decoded pack reads low, never high), so re-reading and keeping the
 *  louder value cannot inflate a genuine level error. */
const LOW_RETRY_DB = 4;
const MIN_PEAK = 0.001;
/** Leave the runner's 480 s ceiling room to report instead of being killed mid-run. */
const DEADLINE_MS = 400_000;

const limitDb = (() => {
  const asked = Number(new URLSearchParams(location.search).get('limit'));
  return Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_LIMIT_DB;
})();

const dbOf = (value: number) => 20 * Math.log10(Math.max(value, 1e-9));

interface ZoneRow {
  file?: string;
  lovel?: number;
  hivel?: number;
  root?: number | null;
  lokey?: number;
  trigger?: string;
}

/** Notes to gate for this type: pads for kits, sampled roots for packs, else the standard chord. */
async function notesFor(type: string): Promise<number[]> {
  const spec = SPEC_BY_TYPE.get(type);
  const pads = spec?.pads ?? [];
  if (pads.length) return pads.slice(0, 3).map((pad) => pad.note);
  const packId = (spec?.engineConfig as { pack?: string } | undefined)?.pack;
  if (!packId) return [60, 64, 67];
  try {
    const manifest = (await fetch(`/instruments/${packId}/instrument.json`).then((response) => response.json())) as { zones?: ZoneRow[] };
    const roots = [
      ...new Set(
        (manifest.zones ?? [])
          .filter((zone) => zone.file && (zone.lovel ?? 0) <= 108 && (zone.hivel ?? 127) >= 108 && zone.trigger !== 'release')
          .map((zone) => zone.root ?? zone.lokey ?? 60),
      ),
    ].sort((a, b) => a - b);
    if (!roots.length) return [60, 64, 67];
    return [...new Set([roots[0], roots[Math.floor(roots.length / 2)], roots[roots.length - 1]])];
  } catch {
    return [60, 64, 67];
  }
}

/**
 * Peak of the rendered chord, which is what actually plays. Phase interference between randomised
 * engines moves a single render by a dB or two, so callers take the median of several passes.
 */
async function peakOnce(type: string, notes: readonly number[]): Promise<number> {
  const ctx = new OfflineAudioContext(2, 48000 * 1.5, 48000);
  const device = audioEngine.createDeviceOnContext(ctx, type as DeviceTypeArg, `level_spread_${type}_${Date.now()}`, 'level spread');
  device.isPowered = true;
  const left = device.audioOutputs.get('out_l');
  const right = device.audioOutputs.get('out_r');
  if (!left || !right) return 0;
  left.connect(ctx.destination);
  right.connect(ctx.destination);
  await device.ready?.();
  for (const note of notes) device.noteOn(note, 0.85, 0);
  const buffer = await ctx.startRendering();
  let peak = 0;
  for (const channel of [buffer.getChannelData(0), buffer.getChannelData(1)]) {
    for (let i = 0; i < channel.length; i++) {
      const value = Math.abs(channel[i]);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

async function peakFor(type: string, notes: readonly number[], passes = PASSES): Promise<number> {
  const sums: number[] = [];
  for (let pass = 0; pass < passes; pass++) sums.push(await peakOnce(type, notes));
  sums.sort((a, b) => a - b);
  return sums[Math.floor(sums.length / 2)] ?? 0;
}

async function main(): Promise<void> {
  const started = performance.now();
  // Boot the DAW context first, exactly as the other probes do: recorded packs decode their samples
  // through the engine's context, and measuring before it exists reads silence or wrong peaks.
  await audioEngine.resumeContext();
  const measured = Object.keys(MEASURED_TYPE_TRIM);
  // A page loaded while the generator was rewriting the table can hold an empty module, and every
  // lookup would then fall back to 1 and report a uniform 9 dB error. Say that instead.
  if (!measured.length) {
    result!.textContent = 'FAIL · the calibration table loaded empty, so no level could be compared';
    result!.dataset.status = 'failed';
    return;
  }

  // Packs first: they hold decoded sample buffers, so measuring them after the instrument sweep is
  // what used to make the tail of the run read silence.
  const packs = measured.filter((type) => type.startsWith('rec_'));
  const synths = measured.filter((type) => !type.startsWith('rec_'));

  const rows: { type: string; db: number }[] = [];
  const silent: string[] = [];
  const skipped: string[] = [];
  const targetDb = dbOf(CALIBRATION_TARGET_PEAK);

  const read = async (type: string, isPack: boolean): Promise<number> => {
    const notes = await notesFor(type);
    // Packs play deterministically, so one pass is enough; instruments take the median of three.
    let peak = await peakFor(type, notes, isPack ? 1 : PASSES);
    if (isPack && dbOf(peak * levelTrimFor(type)) < targetDb - LOW_RETRY_DB) {
      // Loading is one-sided: a half-decoded pack can only read low, never high, so a second look
      // after the decode settles is safe and fixes the occasional short read.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      peak = Math.max(peak, await peakFor(type, notes, 1));
    }
    return peak;
  };

  const run = async (types: string[], isPack: boolean, label: string) => {
    for (let index = 0; index < types.length; index++) {
      const type = types[index];
      if (performance.now() - started > DEADLINE_MS) {
        skipped.push(...types.slice(index));
        return;
      }
      const peak = await read(type, isPack);
      if (peak <= MIN_PEAK) silent.push(type);
      else rows.push({ type, db: dbOf(peak * levelTrimFor(type)) });
      result!.textContent =
        `${label}: ${index + 1}/${types.length} · ${rows.length} measured · latest ${type} ` +
        `${rows.length ? rows[rows.length - 1].db.toFixed(1) : 'silent'} dBFS`;
    }
  };

  await run(packs, true, 'Recorded packs');
  await run(synths, false, 'Instruments');

  const dbs = rows.map((row) => row.db);
  const spread = dbs.length ? Math.max(...dbs) - Math.min(...dbs) : 0;
  // Judge the typical type, not the worst one: a single randomised engine varies ~1.5 dB between
  // passes, so a max-min rule would fail on its own noise while a drifted table moves every entry.
  const deviations = rows.map((row) => Math.abs(row.db - targetDb)).sort((a, b) => a - b);
  const median = deviations.length ? deviations[Math.floor(deviations.length / 2)] : 0;
  const gross = rows.filter((row) => Math.abs(row.db - targetDb) > GROSS_DB);
  const worst = [...rows].sort((a, b) => Math.abs(b.db - targetDb) - Math.abs(a.db - targetDb)).slice(0, 6);

  const problems: string[] = [];
  if (skipped.length) problems.push(`${skipped.length} type(s) not measured inside the time budget: ${skipped.slice(0, 8).join(', ')}`);
  if (silent.length) problems.push(`${silent.length} calibrated type(s) produced no audio: ${silent.join(', ')}`);
  if (!rows.length) problems.push('nothing produced audio');
  if (median > limitDb) problems.push(`typical deviation ${median.toFixed(2)} dB exceeds the ${limitDb.toFixed(1)} dB limit`);
  if (gross.length) {
    problems.push(`${gross.length} type(s) more than ${GROSS_DB} dB from target: ${gross.map((row) => `${row.type} ${row.db.toFixed(1)}`).join(', ')}`);
  }

  const summary =
    `${rows.length}/${measured.length} types (${packs.length} recorded packs, ${synths.length} instruments) · ` +
    `target ${targetDb.toFixed(1)} dBFS · typical ${median.toFixed(2)} dB off · worst-to-best ${spread.toFixed(2)} dB · ` +
    `limit ${limitDb.toFixed(1)} dB · ${((performance.now() - started) / 1000).toFixed(0)}s`;
  const detail = `Widest: ${worst.map((row) => `${row.type} ${row.db.toFixed(1)}`).join(', ')}`;

  if (problems.length) {
    result!.textContent = `FAIL · ${summary}\n${problems.join('\n')}\n${detail}`;
    result!.dataset.status = 'failed';
    return;
  }
  result!.textContent = `PASS · ${summary}\n${detail}`;
  result!.dataset.status = 'passed';
}

main().catch((error: unknown) => {
  result!.textContent = `FAIL · ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  result!.dataset.status = 'failed';
});
