import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

interface TaggedBuffer extends ArrayBuffer {
  sampleName?: string;
}

interface TaggedAudioBuffer extends AudioBuffer {
  sampleName?: string;
}

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

async function run(): Promise<void> {
  const packResponse = await fetch('/instruments/vcsl-pipe-organ/instrument.json');
  if (!packResponse.ok) throw new Error(`instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  const note = 60;
  const zone = pack.zones.find((item) => item.lokey <= note && item.hikey >= note && item.lovel <= 108 && item.hivel >= 108);
  if (!zone?.file || !zone.loop) throw new Error('MIDI 60 has no recorded looping zone.');
  const expectedFile = zone.file.split('/').at(-1) ?? '';
  const played: string[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith('/instruments/vcsl-pipe-organ/samples/')) return response;
    const bytes = (await response.arrayBuffer()) as TaggedBuffer;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: response.ok, status: response.status, arrayBuffer: async () => bytes } as Response;
  };

  const ctx = new OfflineAudioContext(2, 96_000, 48_000);
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
      played.push((source.buffer as TaggedAudioBuffer | null)?.sampleName ?? '');
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
    cfg: { pack: 'vcsl-pipe-organ' },
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
    if (status?.failed || status?.loaded !== 1) throw new Error(`Pipe-organ pack failed to load completely: ${JSON.stringify(status)}`);
    engine.noteOn?.(note, 0.85, 0.05);
    engine.noteOff?.(note, 1.05);
    const rendered = await ctx.startRendering();
    const samples = rendered.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (played.length !== 1 || played[0] !== expectedFile) throw new Error(`MIDI ${note} played ${JSON.stringify(played)}; expected ${expectedFile}`);
    if (!(rms > 0.001)) throw new Error(`Rendered recording was silent (RMS ${rms}).`);
    result!.dataset.status = 'passed';
    result!.textContent = `PASS - loaded ${pack.zones.length} organ zones / ${new Set(pack.zones.map((item) => item.file)).size} samples; MIDI ${note} selected ${expectedFile}; offline RMS ${rms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
