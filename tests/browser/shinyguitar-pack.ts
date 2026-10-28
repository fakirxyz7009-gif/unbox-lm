import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

interface TaggedBuffer extends ArrayBuffer {
  sampleName?: string;
}

interface TaggedAudioBuffer extends AudioBuffer {
  sampleName?: string;
}

const packId = 'shinyguitar-acoustic';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const packResponse = await fetch(`/instruments/${packId}/instrument.json`);
  if (!packResponse.ok) throw new Error(`instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  if (pack.license.spdx !== 'CC0-1.0' || !/D\. Smolken \(performer and mapper\)/.test(pack.license.author)) {
    throw new Error('The archtop pack is missing its recorded-source provenance.');
  }

  const note = 60;
  const velocity = Math.round(0.85 * 127);
  const expectedFiles = new Set(pack.zones
    .filter((zone) => zone.file && zone.lokey <= note && zone.hikey >= note && zone.lovel <= velocity && zone.hivel >= velocity)
    .map((zone) => zone.file.split('/').at(-1) ?? ''));
  if (!expectedFiles.size) throw new Error('The archtop has no sample mapped at MIDI 60.');

  const played: { at: number; file: string }[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith(`/instruments/${packId}/samples/`)) return response;
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
      played.push({ at: when, file: (source.buffer as TaggedAudioBuffer | null)?.sampleName ?? '' });
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
    cfg: { pack: packId },
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
    resultNode.textContent = 'Decoding the archtop recordings…';
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Archtop pack failed to load: ${JSON.stringify(status)}`);
    engine.noteOn?.(note, 0.85, 0.05);
    engine.noteOff?.(note, 0.2);

    const rendered = await ctx.startRendering();
    const samples = rendered.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const selected = played.filter((item) => Math.abs(item.at - 0.05) < 1e-6).map((item) => item.file);
    if (!selected.length || selected.some((file) => !expectedFiles.has(file))) {
      throw new Error(`MIDI 60 selected ${JSON.stringify(selected)}; expected ${JSON.stringify([...expectedFiles])}`);
    }
    if (!(rms > 0.001)) throw new Error(`Rendered archtop was silent (RMS ${rms}).`);
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - loaded ${pack.zones.length} zones; MIDI 60 selected ${selected.join(', ')}; offline RMS ${rms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
