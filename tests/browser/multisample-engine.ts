import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

interface NamedBuffer extends ArrayBuffer {
  sampleName?: string;
}

interface NamedAudioBuffer extends AudioBuffer {
  sampleName?: string;
}

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

function wavSample(frequency: number): ArrayBuffer {
  const rate = 44_100;
  const frames = 4_410;
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame++) {
    view.setInt16(44 + frame * 2, Math.round(Math.sin((2 * Math.PI * frequency * frame) / rate) * 10_000), true);
  }
  return bytes;
}

async function run(): Promise<void> {
  const id = 'browser-sw-previous-probe';
  const pack = {
    format: 'unbox-instrument',
    version: 1,
    id,
    name: 'Browser Selector Probe',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test fixture', source: 'local browser probe' },
    zones: [
      { file: 'samples/first.wav', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127 },
      { file: 'samples/previous-60.wav', lokey: 62, hikey: 62, root: 62, lovel: 1, hivel: 127, swPrevious: 60 },
      { file: 'samples/release-60.wav', lokey: 62, hikey: 62, root: 62, lovel: 1, hivel: 127, swPrevious: 60, trigger: 'release' },
    ],
  };
  const sampleFiles = new Map([
    ['first.wav', 440],
    ['previous-60.wav', 554],
    ['release-60.wav', 659],
  ]);
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (url.pathname === `/instruments/${id}/instrument.json`) {
      return { ok: true, json: async () => pack } as Response;
    }
    const sampleName = url.pathname.split('/').at(-1) ?? '';
    const frequency = sampleFiles.get(sampleName);
    if (url.pathname.startsWith(`/instruments/${id}/samples/`) && frequency !== undefined) {
      const bytes = wavSample(frequency) as NamedBuffer;
      bytes.sampleName = sampleName;
      return { ok: true, arrayBuffer: async () => bytes } as Response;
    }
    return originalFetch(input);
  };

  const ctx = new OfflineAudioContext(2, 44_100, 44_100);
  const playedSamples: string[] = [];
  const originalDecode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    const decoded = (await originalDecode(bytes)) as NamedAudioBuffer;
    decoded.sampleName = (bytes as NamedBuffer).sampleName;
    return decoded;
  };
  const originalCreateSource = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = (): AudioBufferSourceNode => {
    const source = originalCreateSource();
    const originalStart = source.start.bind(source);
    source.start = (when = 0, offset = 0, duration?: number): void => {
      playedSamples.push((source.buffer as NamedAudioBuffer | null)?.sampleName ?? 'unmarked');
      if (duration === undefined) originalStart(when, offset);
      else originalStart(when, offset, duration);
    };
    return source;
  };

  const output = ctx.createGain();
  output.connect(ctx.destination);
  const host = {
    ctx,
    spec: { pads: [] },
    cfg: { pack: id },
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

  try {
    resultNode.textContent = 'Loading sampler fixture…';
    const engine = multisampleEngine(host);
    await engine.ready?.();
    resultNode.textContent = 'Sampler fixture loaded; scheduling notes…';
    engine.noteOn?.(60, 0.85, 0.05);
    engine.noteOn?.(62, 0.85, 0.15);
    engine.noteOff?.(62, 0.23);
    engine.noteOn?.(61, 0.85, 0.35);
    engine.noteOn?.(62, 0.85, 0.45);
    engine.allNotesOff?.(0.6);
    engine.noteOn?.(62, 0.85, 0.7);

    resultNode.textContent = 'Rendering offline AudioContext…';
    const rendered = await ctx.startRendering();
    resultNode.textContent = 'Checking rendered samples…';
    const samples = rendered.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const expected = ['first.wav', 'previous-60.wav', 'release-60.wav'];
    if (JSON.stringify(playedSamples) !== JSON.stringify(expected)) {
      throw new Error(`Selected samples ${JSON.stringify(playedSamples)}, expected ${JSON.stringify(expected)}`);
    }
    if (!(rms > 0.01)) throw new Error(`Offline render was silent (RMS ${rms})`);
    engine.dispose?.();
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - selected ${playedSamples.join(', ')} - offline RMS ${rms.toFixed(4)}`;
  } finally {
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
