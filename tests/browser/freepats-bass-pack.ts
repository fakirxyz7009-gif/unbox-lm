import type { InstrumentPack } from '../../shared/instruments/types.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../../src/audio/instrumentCatalog.ts';
import { multisampleEngine, packStatus } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

const PACK_ID = 'freepats-fingerstyle-bass';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${PACK_ID}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  if (pack.id !== PACK_ID || pack.license.spdx !== 'CC0-1.0' ||
      !pack.license.author.includes('Andrea Biasior (recordings)')) {
    throw new Error('Fingerstyle bass pack is missing its CC0 license or verified recording credit.');
  }
  if (pack.zones.length !== 12 || pack.zones.some((zone) => zone.loop || zone.trigger === 'release')) {
    throw new Error(`Expected 12 non-looped fingerstyle-bass zones, got ${pack.zones.length}.`);
  }
  for (let note = 26; note <= 45; note++) {
    if (!pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note)) {
      throw new Error(`MIDI ${note} is missing from the fingerstyle-bass mapping.`);
    }
  }
  if (new Set(pack.zones.map((zone) => zone.file)).size !== 12) {
    throw new Error('Fingerstyle-bass zones do not retain all 12 distinct recordings.');
  }
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_fingerstyle_bass');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_fingerstyle_bass');
  if (device?.name !== 'FreePats Fingerstyle Electric Bass' || spec?.engineConfig?.pack !== PACK_ID) {
    throw new Error('Playable-instrument and rack-device catalogs are missing the bass pack.');
  }

  const context = new OfflineAudioContext(2, 192_000, 48_000);
  const output = context.createGain();
  output.connect(context.destination);
  const host = {
    ctx: context,
    spec: { pads: [] },
    cfg: { pack: PACK_ID },
    p: (_key: string, fallback = 0) => fallback,
    opt: () => '',
    ins: [],
    sc: null,
    ret: null,
    outs: [output],
    aux: null,
    clock: { bpm: () => 120, isPlaying: () => false },
    modWheel: () => 0,
    gateCv: () => 0,
    changed: () => undefined,
  } as unknown as SpecHost;
  const engine = multisampleEngine(host);
  const sharedEngine = multisampleEngine(host);
  let cacheRetainedAfterOneRelease = false;
  let cacheReleasedAfterFinalRelease = false;
  let rms: number[] = [];
  try {
    await Promise.all([engine.ready?.(), sharedEngine.ready?.()]);
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Bass samples failed to load: ${JSON.stringify(status)}`);
    const notes = [26, 35, 45];
    notes.forEach((note, index) => {
      const start = 0.05 + index * 1.1;
      engine.noteOn?.(note, 0.85, start);
      engine.noteOff?.(note, start + 0.7);
    });
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    rms = notes.map((_, index) => {
      const start = Math.floor((0.1 + index * 1.1) * context.sampleRate);
      const end = Math.floor((0.6 + index * 1.1) * context.sampleRate);
      const samples = data.slice(start, end);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    });
    if (rms.some((value) => !Number.isFinite(value) || value < 0.001)) {
      throw new Error(`Low/mid/high bass notes did not render audible signal: ${rms.map((value) => value.toFixed(6)).join(', ')}`);
    }
  } finally {
    engine.dispose?.();
    cacheRetainedAfterOneRelease = packStatus(PACK_ID)?.progress === 1;
    sharedEngine.dispose?.();
    cacheReleasedAfterFinalRelease = packStatus(PACK_ID) === null;
  }
  if (!cacheRetainedAfterOneRelease || !cacheReleasedAfterFinalRelease) {
    throw new Error(`Multisample cache lifecycle failed: retained after one release=${cacheRetainedAfterOneRelease}, released after final release=${cacheReleasedAfterFinalRelease}.`);
  }
  resultNode.dataset.status = 'passed';
  resultNode.textContent = `PASS · 12/12 CC0 fingerstyle-bass recordings loaded; MIDI 26–45 mapped; low/mid/high notes rendered (RMS ${rms.map((value) => value.toFixed(4)).join(' / ')}); shared cache retained until final device disposal.`;
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
