import { INSTRUMENT_PACKS } from '../../shared/instruments/catalog.ts';
import { parsePack, type InstrumentPack, type PackZone } from '../../shared/instruments/types.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../../src/audio/instrumentCatalog.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';
import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

interface TaggedBytes extends ArrayBuffer { sampleName?: string; }
interface TaggedAudio extends AudioBuffer { sampleName?: string; }

const BATCH = [
  'vcsl-ball-whistle',
  'vcsl-baroque-alto-recorder',
  'vcsl-ocarina-small',
  'vcsl-concert-harp',
  'vcsl-cajon',
  'vcsl-finger-cymbals',
  'vcsl-glockenspiel',
  'vcsl-hi-hat',
  'vcsl-shaker-small',
  'vcsl-xylophone',
  'vcsl-snare-modern-1',
  'vcsl-snare-modern-2',
  'vcsl-snare-rope-tension',
  'vcsl-timpani-1',
  'vcsl-tom-1',
  'vcsl-tubular-bells-1',
  'vcsl-harpsichord-flemish',
  'vcsl-harpsichord-english',
  'vcsl-harmonica-chromatic',
  'vcsl-grand-piano',
] as const;

const licenseFor = (_id: string): string => 'CC0-1.0';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

function rmsBetween(samples: Float32Array, rate: number, start: number, end: number): number {
  const first = Math.max(0, Math.round(start * rate));
  const last = Math.min(samples.length, Math.round(end * rate));
  let sum = 0;
  for (let i = first; i < last; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / Math.max(1, last - first));
}

interface SweepPoint {
  note: number;
  velocity: number;
}

/** Every playable key with one point inside each velocity layer that covers that key. */
function sweepFor(pack: InstrumentPack): { points: SweepPoint[]; keys: number } {
  const zones: PackZone[] = pack.zones.filter((zone) =>
    (zone.trigger ?? 'attack') === 'attack' &&
    zone.swDown === undefined &&
    zone.swUp === undefined &&
    zone.swPrevious === undefined &&
    zone.hivel >= 1
  );
  if (!zones.length) throw new Error(`${pack.id} has no playable attack zones`);

  let keys: number[];
  if (pack.kind === 'drums') {
    const notes = new Set<number>((pack.lanes ?? []).map((lane) => lane.note));
    for (const zone of zones) {
      for (let note = zone.lokey; note <= zone.hikey; note++) notes.add(note);
    }
    keys = [...notes].sort((a, b) => a - b);
  } else {
    const low = Math.min(...zones.map((zone) => zone.lokey));
    const high = Math.max(...zones.map((zone) => zone.hikey));
    keys = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  }

  const points: SweepPoint[] = [];
  for (const note of keys) {
    const layers = new Map<string, [number, number]>();
    for (const zone of zones) {
      if (note < zone.lokey || note > zone.hikey) continue;
      layers.set(`${zone.lovel}:${zone.hivel}`, [zone.lovel, zone.hivel]);
    }
    if (!layers.size) throw new Error(`${pack.id} has no playable zone for MIDI ${note}`);
    for (const [low, high] of layers.values()) {
      // Stay near the loud end of each layer so the measured output is the layer, not the
      // pack's deliberately quiet soft edge.
      const velocity = Math.max(1, Math.min(127, Math.round(low + (high - low) * 0.85)));
      points.push({ note, velocity });
    }
  }
  return { points, keys: keys.length };
}

function rmsAnyChannel(buffer: AudioBuffer, start: number, end: number): number {
  let best = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    best = Math.max(best, rmsBetween(buffer.getChannelData(channel), buffer.sampleRate, start, end));
  }
  return best;
}

async function renderPack(pack: InstrumentPack): Promise<{ decoded: number; samples: number; rms: number; notes: number; keys: number }> {
  const sweep = sweepFor(pack);
  const step = 0.2;
  const lead = 0.05;
  const duration = lead + sweep.points.length * step + 0.35;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * 48_000), 48_000);
  const decoded = new Set<string>();
  const decode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    const buffer = (await decode(bytes)) as TaggedAudio;
    buffer.sampleName = (bytes as TaggedBytes).sampleName;
    if (buffer.sampleName) decoded.add(buffer.sampleName);
    return buffer;
  };
  const output = ctx.createGain();
  output.connect(ctx.destination);
  const host = {
    id: pack.id,
    ctx,
    spec: {
      pads: pack.kind === 'drums'
        ? (pack.lanes ?? []).map((lane) => ({ note: lane.note, name: lane.name, voice: lane.role ?? 'perc' }))
        : [],
    },
    cfg: { pack: pack.id },
    p: (key: string, fallback = 0) => key === 'vary' ? 0 : fallback,
    opt: () => '',
    ins: [], sc: null, ret: null, outs: [output], aux: null,
    clock: { bpm: () => 120, isPlaying: () => false },
    modWheel: () => 0,
    modWheelTouched: () => false,
    gateCv: () => 0,
    changed: () => undefined,
  } as unknown as SpecHost;
  const engine = multisampleEngine(host);
  try {
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) {
      throw new Error(`${pack.id} failed to load: ${JSON.stringify(status)}`);
    }
    for (const [index, point] of sweep.points.entries()) {
      const t = lead + index * step;
      engine.allNotesOff?.(t - 0.03);
      engine.noteOn?.(point.note, point.velocity / 127, t);
      engine.noteOff?.(point.note, t + 0.15);
    }
    const rendered = await ctx.startRendering();
    let rms = Infinity;
    let worst: SweepPoint | null = null;
    for (const [index, point] of sweep.points.entries()) {
      const t = lead + index * step;
      const level = rmsAnyChannel(rendered, t + 0.02, t + 0.12);
      if (level < rms) {
        rms = level;
        worst = point;
      }
    }
    if (!(rms > 1e-5)) {
      throw new Error(`${pack.id} rendered silence at MIDI ${worst?.note ?? '?'} velocity ${worst?.velocity ?? '?'} (RMS ${rms}).`);
    }
    const sampleFiles = new Set(pack.zones.map((zone) => zone.file).filter(Boolean));
    return { decoded: decoded.size, samples: sampleFiles.size, rms, notes: sweep.points.length, keys: sweep.keys };
  } finally {
    engine.dispose?.();
  }
}

async function run(): Promise<void> {
  const creditsResponse = await fetch('/instruments/CREDITS.md');
  if (!creditsResponse.ok) throw new Error(`CREDITS.md returned HTTP ${creditsResponse.status}`);
  const credits = await creditsResponse.text();

  const entries = BATCH.map((id) => INSTRUMENT_PACKS.find((entry) => entry.id === id));
  if (entries.some((entry) => !entry)) throw new Error('One or more seventh-batch packs are missing from the instrument catalog');
  if (new Set(entries.map((entry) => entry!.id)).size !== BATCH.length) throw new Error('The seventh-batch catalog list has duplicate IDs');

  const packs: InstrumentPack[] = [];
  for (const entry of entries) {
    const packEntry = entry!;
    const expectedLicense = licenseFor(packEntry.id);
    if (packEntry.spdx !== expectedLicense) throw new Error(`${packEntry.id} is ${packEntry.spdx}, expected ${expectedLicense}`);
    if (!packEntry.author.trim()) throw new Error(`${packEntry.id} has no attribution`);
    const pinnedSource = /^https:\/\/github\.com\/sgossner\/VCSL\/tree\/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e(?:\/|$)/i.test(packEntry.source);
    if (!pinnedSource) {
      throw new Error(`${packEntry.id} source is not pinned to the VCSL revision`);
    }
    if (!credits.includes(`## ${packEntry.name}\n\n- Attribution: ${packEntry.author}\n- License: ${expectedLicense}`)) {
      throw new Error(`${packEntry.name} is missing its generated attribution/license credits`);
    }
    const response = await fetch(`/instruments/${packEntry.id}/instrument.json`);
    if (!response.ok) throw new Error(`${packEntry.id}/instrument.json returned HTTP ${response.status}`);
    const pack = parsePack(await response.json() as unknown);
    if (!pack) throw new Error(`${packEntry.id}/instrument.json failed schema validation`);
    if (pack.id !== packEntry.id || pack.license.spdx !== expectedLicense || !pack.license.author.trim() || !pack.license.source.trim()) {
      throw new Error(`${packEntry.id} manifest license metadata does not match the catalog`);
    }
    if (!pack.zones.length || !pack.zones.every((zone) => zone.file.startsWith('samples/'))) {
      throw new Error(`${packEntry.id} has no encoded sample zones`);
    }
    const type = `rec_${packEntry.id.replace(/-/g, '_')}`;
    if (!ALL_PLAYABLE_INSTRUMENTS.some((device) => device.type === type)) throw new Error(`${packEntry.id} is missing from the playable-instrument catalog`);
    if (!DEVICE_SPECS.some((device) => device.type === type && device.engineConfig?.pack === packEntry.id)) {
      throw new Error(`${packEntry.id} is missing its multisample rack device`);
    }
    packs.push(pack);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const fetched = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith('/instruments/') || !url.pathname.includes('/samples/')) return fetched;
    const bytes = (await fetched.arrayBuffer()) as TaggedBytes;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: fetched.ok, status: fetched.status, arrayBuffer: async () => bytes } as Response;
  };

  try {
    const reports: { id: string; notes: number; keys: number; decoded: number; samples: number; rms: number }[] = [];
    for (const [index, pack] of packs.entries()) {
      resultNode.textContent = `Sweeping ${index + 1}/${packs.length}: ${pack.name}…`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const report = await renderPack(pack);
      if (report.decoded !== report.samples) {
        throw new Error(`${pack.id} decoded ${report.decoded}/${report.samples} unique samples`);
      }
      reports.push({ id: pack.id, ...report });
    }
    const decoded = reports.reduce((sum, report) => sum + report.decoded, 0);
    const totalNotes = reports.reduce((sum, report) => sum + report.notes, 0);
    const totalKeys = reports.reduce((sum, report) => sum + report.keys, 0);
    const minRms = Math.min(...reports.map((report) => report.rms));
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 20/20 packs (all CC0), ${decoded} unique recordings decoded; every key and velocity layer produced audible output — ${totalNotes} key/velocity notes across ${totalKeys} pack keys (minimum RMS ${minRms.toFixed(4)}). ${reports.map((report) => `${report.id}:${report.notes}/${report.keys}`).join(' ')}`;
  } finally {
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
