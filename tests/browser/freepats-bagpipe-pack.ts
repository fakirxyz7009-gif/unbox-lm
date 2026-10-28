import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../../src/audio/instrumentCatalog.ts';

const PACK_ID = 'freepats-bagpipe';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${PACK_ID}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  if (pack.id !== PACK_ID || pack.license.spdx !== 'CC0-1.0' ||
      !pack.license.author.includes('Gilles Sadowski (performer and recording)')) {
    throw new Error('Bagpipe pack is missing its CC0 license or verified performer credit.');
  }
  if (pack.zones.length !== 14 || pack.zones.some((zone) => !zone.loop)) {
    throw new Error(`Expected 14 looped bagpipe zones, got ${pack.zones.length}.`);
  }
  for (const [min, max] of [[36, 59], [64, 81]]) {
    for (let note = min; note <= max; note++) {
      if (!pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note)) {
        throw new Error(`MIDI ${note} is missing from the bagpipe mapping.`);
      }
    }
  }
  if (pack.zones.some((zone) => zone.lokey <= 60 && zone.hikey >= 60)) {
    throw new Error('The bagpipe mapping should preserve the source SFZ gap between its drone and melodic ranges.');
  }
  if (new Set(pack.zones.map((zone) => zone.file)).size !== 14) {
    throw new Error('Bagpipe zones do not retain all 14 distinct recorded notes and drones.');
  }
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_bagpipe');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_bagpipe');
  if (device?.name !== 'FreePats Bagpipe in G' || spec?.engineConfig?.pack !== PACK_ID) {
    throw new Error('The playable-instrument and rack-device catalogs are missing the bagpipe pack.');
  }

  const context = new OfflineAudioContext(2, 240_000, 48_000);
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

  try {
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Bagpipe samples failed to load: ${JSON.stringify(status)}`);
    for (const note of [43, 55, 72]) {
      engine.noteOn?.(note, 0.8, 0.05);
      engine.noteOff?.(note, 3.7);
    }
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    const rmsBetween = (start: number, end: number): number => {
      const samples = data.slice(Math.floor(start * context.sampleRate), Math.floor(end * context.sampleRate));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    const sustainRms = rmsBetween(2.1, 2.8);
    const tailRms = rmsBetween(4.6, 4.9);
    if (!(sustainRms > 0.005)) throw new Error(`Sustained drone/notes are too quiet (RMS ${sustainRms}).`);
    if (!(tailRms < sustainRms * 0.15)) throw new Error(`Bagpipe note-off did not release the loop: ${sustainRms} → ${tailRms} RMS.`);

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 14/14 recorded bagpipe zones loaded; drone MIDI 36–59 and note MIDI 64–81 mapped; sustained RMS ${sustainRms.toFixed(4)}; release RMS ${tailRms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
