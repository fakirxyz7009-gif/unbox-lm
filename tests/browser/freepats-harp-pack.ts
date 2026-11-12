import { matchingPackZones } from '../../shared/instruments/zones.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../../src/audio/instrumentCatalog.ts';
import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

const PACK_ID = 'freepats-concert-harp';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${PACK_ID}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  if (pack.id !== PACK_ID || pack.license.spdx !== 'CC0-1.0' ||
      !pack.license.author.includes('K. Smith (performer)')) {
    throw new Error('Concert Harp pack is missing its CC0 license or verified performer credit.');
  }
  if (pack.zones.length !== 36 || pack.zones.some((zone) => zone.loop)) {
    throw new Error(`Expected 36 non-looped concert-harp zones, got ${pack.zones.length}.`);
  }
  for (let note = 28; note <= 102; note++) {
    if (!pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note)) {
      throw new Error(`MIDI ${note} is missing from the concert-harp mapping.`);
    }
  }
  if (new Set(pack.zones.map((zone) => zone.file)).size !== 36) {
    throw new Error('Concert-harp zones do not retain all 36 distinct recordings.');
  }
  const lowVelocity = matchingPackZones(pack, 60, 40, null, 'attack', 0, 0);
  const highVelocity = matchingPackZones(pack, 60, 110, null, 'attack', 0, 0);
  if (lowVelocity.length !== 1 || highVelocity.length !== 1 || lowVelocity[0]?.file === highVelocity[0]?.file) {
    throw new Error('MIDI 60 does not switch between its recorded low- and high-velocity layers.');
  }
  const device = ALL_PLAYABLE_INSTRUMENTS.find((item) => item.type === 'rec_freepats_concert_harp');
  const spec = DEVICE_SPECS.find((item) => item.type === 'rec_freepats_concert_harp');
  if (device?.name !== 'FreePats Concert Harp' || spec?.engineConfig?.pack !== PACK_ID) {
    throw new Error('The playable-instrument and rack-device catalogs are missing the harp pack.');
  }

  const context = new OfflineAudioContext(2, 384_000, 48_000);
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
    if (status?.failed || status?.loaded !== 1) throw new Error(`Concert-harp samples failed to load: ${JSON.stringify(status)}`);

    const notes = [
      { note: 28, velocity: 0.72, start: 0.05 },
      { note: 60, velocity: 0.3, start: 1.05 },
      { note: 60, velocity: 0.9, start: 2.05 },
      { note: 101, velocity: 0.72, start: 3.05 },
    ];
    for (const item of notes) {
      engine.noteOn?.(item.note, item.velocity, item.start);
      engine.noteOff?.(item.note, item.start + 0.45);
    }
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    const rmsBetween = (start: number, end: number): number => {
      const samples = data.slice(Math.floor(start * context.sampleRate), Math.floor(end * context.sampleRate));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    const rms = notes.map((item) => rmsBetween(item.start + 0.06, item.start + 0.3));
    if (rms.some((value) => !(value > 0.003))) {
      throw new Error(`Concert harp rendered a silent low/mid/high note: ${rms.map((value) => value.toFixed(5)).join(', ')} RMS.`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 36/36 CC0 concert-harp recordings loaded; MIDI 28–102 mapped; velocity layers switch at MIDI 60; low/mid/high notes rendered (RMS ${rms.map((value) => value.toFixed(4)).join(' / ')})`;
  } finally {
    engine.dispose?.();
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
