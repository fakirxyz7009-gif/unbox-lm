import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

interface TaggedBytes extends ArrayBuffer { sampleName?: string; }
interface TaggedAudio extends AudioBuffer { sampleName?: string; }
interface PlayedSample { file: string; rate: number; }

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode = result;
const packId = 'vcsl-marimba';

function rms(samples: Float32Array, rate: number, start: number, end: number): number {
  const first = Math.round(start * rate);
  const last = Math.min(samples.length, Math.round(end * rate));
  let sum = 0;
  for (let i = first; i < last; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / Math.max(1, last - first));
}

function frequencyNear(samples: Float32Array, rate: number, expected: number): number {
  const minLag = Math.floor(rate / (expected * 1.15));
  const maxLag = Math.ceil(rate / (expected * 0.85));
  const errors = new Map<number, number>();
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let difference = 0;
    let energy = 0;
    for (let i = Math.round(rate * 0.15); i < Math.round(rate * 0.55); i++) {
      const a = samples[i];
      const b = samples[i + lag];
      difference += (a - b) ** 2;
      energy += a * a + b * b;
    }
    const error = difference / Math.max(1e-12, energy);
    errors.set(lag, error);
    if (error < (errors.get(best) ?? Infinity)) best = lag;
  }
  const a = errors.get(best - 1) ?? errors.get(best)!;
  const b = errors.get(best)!;
  const c = errors.get(best + 1) ?? b;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (best + (Math.abs(shift) < 1 ? shift : 0));
}

async function renderCase(pack: InstrumentPack, note: number, velocity: number, length = 1) {
  const ctx = new OfflineAudioContext(2, 144_000, 48_000);
  const decoded = new Set<string>();
  let decodedBytes = 0;
  const decode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    const buffer = (await decode(bytes)) as TaggedAudio;
    buffer.sampleName = (bytes as TaggedBytes).sampleName;
    decoded.add(buffer.sampleName ?? '');
    decodedBytes += buffer.length * buffer.numberOfChannels * 4;
    return buffer;
  };
  const played: PlayedSample[] = [];
  const createSource = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = (): AudioBufferSourceNode => {
    const source = createSource();
    const start = source.start.bind(source);
    source.start = (when = 0, offset = 0, duration?: number): void => {
      played.push({ file: (source.buffer as TaggedAudio | null)?.sampleName ?? '', rate: source.playbackRate.value });
      if (duration === undefined) start(when, offset);
      else start(when, offset, duration);
    };
    return source;
  };
  const output = ctx.createGain();
  output.connect(ctx.destination);
  const host = {
    ctx, spec: { pads: [] }, cfg: { pack: packId },
    p: (key: string, fallback = 0) => key === 'vary' ? 0 : key === 'decay' ? length : fallback,
    opt: () => '', ins: [], sc: null, ret: null, outs: [output], aux: null,
    clock: { bpm: () => 120, isPlaying: () => false },
    modWheel: () => 0, modWheelTouched: () => false, gateCv: () => 0, changed: () => undefined,
  } as unknown as SpecHost;
  const engine = multisampleEngine(host);
  try {
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Marimba load failed: ${JSON.stringify(status)}`);
    engine.noteOn?.(note, velocity / 127, 0.05);
    engine.noteOff?.(note, 0.1);
    const rendered = await ctx.startRendering();
    const samples = rendered.getChannelData(0);
    const zone = pack.zones.find((candidate) => candidate.lokey <= note && candidate.hikey >= note && candidate.lovel <= velocity && candidate.hivel >= velocity);
    const expectedFile = zone?.file.split('/').at(-1);
    const expectedRate = Math.pow(2, (note - (zone?.root ?? note)) / 12);
    if (played.length !== 1 || played[0].file !== expectedFile || Math.abs(played[0].rate - expectedRate) > 1e-6) {
      throw new Error(`MIDI ${note}/${velocity} selected ${JSON.stringify(played)}; expected ${expectedFile} at rate ${expectedRate}.`);
    }
    return {
      file: played[0].file,
      earlyRms: rms(samples, ctx.sampleRate, 0.05, 0.55),
      lateRms: rms(samples, ctx.sampleRate, 0.8, 1.2),
      frequency: note === 72 && length === 1 ? frequencyNear(samples, ctx.sampleRate, 523.2511306) : null,
      decoded: decoded.size,
      decodedMiB: decodedBytes / 1048576,
    };
  } finally {
    engine.dispose?.();
  }
}

async function run(): Promise<void> {
  const response = await fetch(`/instruments/${packId}/instrument.json`);
  if (!response.ok) throw new Error(`instrument.json returned HTTP ${response.status}`);
  const pack = (await response.json()) as InstrumentPack;
  if (!pack.oneShot || pack.license.spdx !== 'CC0-1.0' || pack.zones.length !== 30 || !pack.license.source.includes('c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e')) {
    throw new Error('Marimba pack is missing its one-shot mode, three recorded layers, or pinned CC0 source.');
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const fetched = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith(`/instruments/${packId}/samples/`)) return fetched;
    const bytes = (await fetched.arrayBuffer()) as TaggedBytes;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: fetched.ok, status: fetched.status, arrayBuffer: async () => bytes } as Response;
  };
  try {
    resultNode.textContent = 'Checking recorded marimba layers, pitch, key-up tails and Length…';
    const soft = await renderCase(pack, 72, 30);
    const medium = await renderCase(pack, 72, 64);
    const loud = await renderCase(pack, 72, 110);
    const low = await renderCase(pack, 41, 100);
    const high = await renderCase(pack, 96, 100);
    const shortened = await renderCase(pack, 72, 64, 0.12);
    if (soft.decoded !== 30) throw new Error(`Only ${soft.decoded}/30 marimba samples decoded.`);
    if (new Set([soft.file, medium.file, loud.file]).size !== 3) throw new Error('Velocity did not choose all three recorded dynamic layers.');
    if (!(medium.earlyRms > soft.earlyRms * 1.1 && loud.earlyRms > medium.earlyRms * 1.1 && low.earlyRms > 1e-4 && high.earlyRms > 1e-4)) {
      throw new Error(`Unexpected dynamic or range output: ${JSON.stringify({ soft, medium, loud, low, high })}`);
    }
    const cents = medium.frequency === null ? Infinity : 1200 * Math.log2(medium.frequency / 523.2511306);
    if (Math.abs(cents) > 35) throw new Error(`MIDI 72 was ${medium.frequency} Hz (${cents.toFixed(1)} cents from C5); the source octave map is wrong.`);
    if (!(medium.lateRms > 1e-5 && shortened.lateRms < medium.lateRms * 0.02)) {
      throw new Error(`Key-up tail or Length failed: natural RMS ${medium.lateRms}, shortened RMS ${shortened.lateRms}.`);
    }
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · decoded 30 CC0 marimba samples (${soft.decodedMiB.toFixed(1)} MiB); F2–C7 rendered; MIDI 72 measured ${medium.frequency!.toFixed(2)} Hz; velocity-layer RMS ${soft.earlyRms.toFixed(4)} / ${medium.earlyRms.toFixed(4)} / ${loud.earlyRms.toFixed(4)}; key-up tail RMS ${medium.lateRms.toFixed(5)} and Length 12% tail ${shortened.lateRms.toExponential(2)}.`;
  } finally {
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
