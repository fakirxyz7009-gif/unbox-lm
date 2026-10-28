import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';
import type { InstrumentPack } from '../../shared/instruments/types.ts';

interface TaggedBuffer extends ArrayBuffer {
  sampleName?: string;
}

interface TaggedAudioBuffer extends AudioBuffer {
  sampleName?: string;
}

const packId = 'ganjo';
const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const packResponse = await fetch(`/instruments/${packId}/instrument.json`);
  if (!packResponse.ok) throw new Error(`instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  if (pack.license.spdx !== 'CC0-1.0' ||
    pack.license.source !== 'https://github.com/sfzinstruments/ganjo/tree/ccff5cd5cd3b513873a48994c07724d9d3c39e1c' ||
    !/itsclipping \(recorded, edited and mapped\)/.test(pack.license.author)) {
    throw new Error('The banjo pack is missing its pinned CC0 source and recording credit.');
  }
  const uniqueFiles = new Set(pack.zones.map((zone) => zone.file));
  if (uniqueFiles.size !== 38) throw new Error(`Expected 38 compact recorded sample files; found ${uniqueFiles.size}.`);
  for (let note = 38; note <= 72; note++) {
    if (!pack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note)) {
      throw new Error(`MIDI ${note} has no recorded banjo sample.`);
    }
  }

  const note = 58;
  const velocity = Math.round(0.85 * 127);
  const expectedFiles = new Set(pack.zones
    .filter((zone) => zone.lokey <= note && zone.hikey >= note && zone.lovel <= velocity && zone.hivel >= velocity)
    .map((zone) => zone.file.split('/').at(-1) ?? ''));
  if (expectedFiles.size !== 2) throw new Error(`MIDI 58 should have two retained round robins; found ${expectedFiles.size}.`);

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
    resultNode.textContent = 'Decoding the recorded banjo samples…';
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Banjo pack failed to load: ${JSON.stringify(status)}`);
    engine.noteOn?.(note, 0.85, 0.05);
    engine.noteOff?.(note, 0.25);
    engine.noteOn?.(note, 0.85, 0.55);
    engine.noteOff?.(note, 0.75);

    const rendered = await ctx.startRendering();
    const samples = rendered.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const selectedAt = (at: number) => played.filter((item) => Math.abs(item.at - at) < 1e-6).map((item) => item.file);
    const first = selectedAt(0.05);
    const second = selectedAt(0.55);
    if (first.length !== 1 || !expectedFiles.has(first[0])) throw new Error(`First MIDI 58 hit selected ${JSON.stringify(first)}; expected one of ${JSON.stringify([...expectedFiles])}.`);
    if (second.length !== 1 || !expectedFiles.has(second[0]) || first[0] === second[0]) {
      throw new Error(`MIDI 58 round robin did not alternate: ${JSON.stringify({ first, second, expected: [...expectedFiles] })}.`);
    }
    if (!(rms > 0.001)) throw new Error(`Rendered banjo was silent (RMS ${rms}).`);
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - decoded 38 recorded samples across MIDI 38–72; MIDI 58 alternated ${first[0]} → ${second[0]}; offline RMS ${rms.toFixed(4)}; source credit and CC0 license verified.`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
