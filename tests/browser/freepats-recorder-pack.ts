import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

const PACK_ID = 'freepats-recorder';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${PACK_ID}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  if (pack.id !== PACK_ID || pack.license.spdx !== 'CC0-1.0' ||
      !pack.license.author.includes('Eugene Vlaskin (performer and recording)')) {
    throw new Error('Recorder pack is missing its CC0 license or verified performer credit.');
  }
  if (pack.zones.length !== 34 || pack.zones.some((zone) => !zone.loop)) {
    throw new Error(`Expected 34 looped recorder zones, got ${pack.zones.length}.`);
  }
  for (let note = 57; note <= 88; note++) {
    if (!pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note)) {
      throw new Error(`MIDI ${note} is missing from the recorder mapping.`);
    }
  }

  const events = [
    { note: 57, velocity: 0.75, at: 0.05, offAt: 0.5 },
    { note: 72, velocity: 0.85, at: 0.8, offAt: 3.05 },
    { note: 88, velocity: 0.7, at: 3.5, offAt: 3.9 },
  ];
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
    if (status?.failed || status?.loaded !== 1) throw new Error(`Recorder samples failed to load: ${JSON.stringify(status)}`);
    for (const event of events) {
      engine.noteOn?.(event.note, event.velocity, event.at);
      engine.noteOff?.(event.note, event.offAt);
    }
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    const rmsBetween = (start: number, end: number): number => {
      const samples = data.slice(Math.floor(start * context.sampleRate), Math.floor(end * context.sampleRate));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    const sustainRms = rmsBetween(2.1, 2.8);
    const tailRms = rmsBetween(4.6, 4.9);
    if (!(sustainRms > 0.005)) throw new Error(`Sustain loop is too quiet (RMS ${sustainRms}).`);
    if (!(tailRms < sustainRms * 0.15)) throw new Error(`Recorder key-up did not release the loop: ${sustainRms} → ${tailRms} RMS.`);

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 34/34 looped recorder zones loaded; MIDI 57–88 mapped; sustain RMS ${sustainRms.toFixed(4)}; release RMS ${tailRms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
