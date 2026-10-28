import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
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

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const packResponse = await fetch('/instruments/freepats-ocarina/instrument.json');
  if (!packResponse.ok) throw new Error(`instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  const packSampleCount = new Set(pack.zones.map((zone) => zone.file).filter(Boolean)).size;
  const note = 72;
  const zone = pack.zones.find((item) => item.lokey <= note && item.hikey >= note);
  if (!zone?.loop) throw new Error(`MIDI ${note} has no sustain-loop zone.`);

  const played: PlayedSource[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith('/instruments/freepats-ocarina/samples/')) return response;
    const bytes = (await response.arrayBuffer()) as TaggedBuffer;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: response.ok, status: response.status, arrayBuffer: async () => bytes } as Response;
  };

  const ctx = new OfflineAudioContext(2, 120_000, 48_000);
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
    cfg: { pack: 'freepats-ocarina' },
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
    resultNode.textContent = 'Decoding the bundled ocarina recordings…';
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Ocarina pack failed to load completely: ${JSON.stringify(status)}`);

    engine.noteOn?.(note, 0.85, 0.05);
    engine.noteOff?.(note, 1.6);

    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const rmsBetween = (start: number, end: number): number => {
      const samples = data.slice(Math.floor(start * ctx.sampleRate), Math.floor(end * ctx.sampleRate));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    const sustainRms = rmsBetween(0.3, 1.4);
    const releasedRms = rmsBetween(2.1, 2.4);
    const sample = played.find((item) => Math.abs(item.at - 0.05) < 1e-6);
    const expectedFile = zone.file.split('/').at(-1) ?? '';
    if (!sample || sample.file !== expectedFile) throw new Error(`MIDI ${note} played ${sample?.file ?? 'no file'}, expected ${expectedFile}.`);
    if (!sample.loop || Math.abs(sample.loopStart - zone.loop[0]) > 1e-5 || Math.abs(sample.loopEnd - zone.loop[1]) > 1e-5) {
      throw new Error(`Sample loop ${sample.loop} [${sample.loopStart}, ${sample.loopEnd}] does not match zone ${JSON.stringify(zone.loop)}.`);
    }
    if (!(sustainRms > 0.005)) throw new Error(`Rendered recording was too quiet during sustain (RMS ${sustainRms}).`);
    if (!(releasedRms < sustainRms * 0.15)) throw new Error(`Key-up did not release the voice: sustain RMS ${sustainRms}, tail RMS ${releasedRms}.`);
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - loaded ${pack.zones.length} looped zones / ${packSampleCount} samples; MIDI ${note} played ${sample.file}; sustain RMS ${sustainRms.toFixed(4)}, post-release RMS ${releasedRms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
