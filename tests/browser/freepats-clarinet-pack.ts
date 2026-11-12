import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import { matchingPackZones } from '../../shared/instruments/zones.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

interface TaggedBuffer extends ArrayBuffer {
  sampleName?: string;
}

interface TaggedAudioBuffer extends AudioBuffer {
  sampleName?: string;
}

interface PlayedSource {
  at: number;
  file: string;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

const PACK_ID = 'freepats-clarinet';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${PACK_ID}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  const sampleCount = new Set(pack.zones.map((zone) => zone.file).filter(Boolean)).size;
  if (pack.id !== PACK_ID || pack.license.spdx !== 'CC0-1.0' ||
      !pack.license.author.includes('Kaili Dence (performer)') ||
      !pack.license.author.includes('Tyler Dence (recording engineer)')) {
    throw new Error('Clarinet pack is missing its CC0 license or performer/recording-engineer credits.');
  }
  if (pack.zones.length !== 9 || sampleCount !== 9 || pack.zones.some((zone) => !zone.loop)) {
    throw new Error(`Expected nine unique looped recordings, got ${pack.zones.length} zones / ${sampleCount} samples.`);
  }
  for (let note = 45; note <= 91; note++) {
    if (!pack.zones.some((zone) => zone.trigger !== 'release' && zone.lokey <= note && zone.hikey >= note)) {
      throw new Error(`MIDI ${note} is missing from the Clarinet mapping.`);
    }
  }

  const events = [
    { note: 45, velocity: 0.7, at: 0.05, offAt: 0.5 },
    { note: 69, velocity: 0.85, at: 0.8, offAt: 3.05 },
    { note: 91, velocity: 0.7, at: 3.5, offAt: 3.9 },
  ];
  const expectedByTime = new Map<number, string[]>();
  for (const event of events) {
    const velocity = Math.round(event.velocity * 127);
    const zones = matchingPackZones(pack, event.note, velocity, null, 'attack', 0, 0.5);
    if (!zones.length) throw new Error(`No zone for MIDI ${event.note}.`);
    expectedByTime.set(event.at, zones.map((zone) => zone.file.split('/').at(-1) ?? ''));
  }

  const played: PlayedSource[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const fetched = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith(`/instruments/${PACK_ID}/samples/`)) return fetched;
    const bytes = (await fetched.arrayBuffer()) as TaggedBuffer;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: fetched.ok, status: fetched.status, arrayBuffer: async () => bytes } as Response;
  };

  const ctx = new OfflineAudioContext(2, 240_000, 48_000);
  const decode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    const buffer = (await decode(bytes)) as TaggedAudioBuffer;
    buffer.sampleName = (bytes as TaggedBuffer).sampleName;
    return buffer;
  };
  const createSource = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = (): AudioBufferSourceNode => {
    const source = createSource();
    const start = source.start.bind(source);
    source.start = (when = 0, offset = 0, duration?: number): void => {
      played.push({
        at: when,
        file: (source.buffer as TaggedAudioBuffer | null)?.sampleName ?? '',
        loop: source.loop,
        loopStart: source.loopStart,
        loopEnd: source.loopEnd,
      });
      if (duration === undefined) start(when, offset);
      else start(when, offset, duration);
    };
    return source;
  };

  const output = ctx.createGain();
  output.connect(ctx.destination);
  const host = {
    ctx,
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
    resultNode.textContent = 'Decoding the pinned FreePats clarinet recordings…';
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Clarinet samples failed to load: ${JSON.stringify(status)}`);
    for (const event of events) {
      engine.noteOn?.(event.note, event.velocity, event.at);
      engine.noteOff?.(event.note, event.offAt);
    }

    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const rmsBetween = (start: number, end: number): number => {
      const samples = data.slice(Math.floor(start * ctx.sampleRate), Math.floor(end * ctx.sampleRate));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    const sustainRms = rmsBetween(2.1, 2.8);
    const tailRms = rmsBetween(4.6, 4.9);
    if (!(sustainRms > 0.005)) throw new Error(`Sustain loop is too quiet (RMS ${sustainRms}).`);
    if (!(tailRms < sustainRms * 0.15)) throw new Error(`Clarinet key-up did not release the loop: ${sustainRms} → ${tailRms} RMS.`);

    for (const [at, expectedFiles] of expectedByTime) {
      const actual = played.filter((source) => Math.abs(source.at - at) < 1e-6).map((source) => source.file).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...expectedFiles].sort())) {
        throw new Error(`At ${at}s, played ${JSON.stringify(actual)} instead of ${JSON.stringify(expectedFiles)}.`);
      }
    }
    const center = played.find((source) => Math.abs(source.at - 0.8) < 1e-6);
    const centerZone = pack.zones.find((zone) => zone.lokey <= 69 && zone.hikey >= 69);
    if (!center || !centerZone?.loop || !center.loop ||
        Math.abs(center.loopStart - centerZone.loop[0]) > 1e-5 ||
        Math.abs(center.loopEnd - centerZone.loop[1]) > 1e-5) {
      throw new Error(`MIDI 69 did not use its mapped sustain loop: ${JSON.stringify(center)} / ${JSON.stringify(centerZone?.loop)}.`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 9/9 recorded samples decoded; all MIDI 45–91 keys map; low/mid/high notes use the expected samples; MIDI 69 sustain loop passed; release RMS ${tailRms.toFixed(4)} after sustain RMS ${sustainRms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
