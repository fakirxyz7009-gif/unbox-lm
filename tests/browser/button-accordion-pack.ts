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
  const packResponse = await fetch('/instruments/button-accordion-hn/instrument.json');
  if (!packResponse.ok) throw new Error(`instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  const attack = pack.zones.find((zone) => zone.trigger !== 'release' && zone.lokey <= 47 && zone.hikey >= 47);
  const release = pack.zones.find((zone) => zone.trigger === 'release' && zone.lokey <= 47 && zone.hikey >= 47);
  if (!attack || !release) throw new Error('MIDI 47 needs both attack and release recordings.');
  if (attack.root !== 47) throw new Error(`MIDI 47 attack root should remain 47 after key-range clipping; got ${attack.root}.`);
  if (!attack.loop) throw new Error('MIDI 47 attack recording is missing its sustain loop.');

  const played: PlayedSource[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith('/instruments/button-accordion-hn/samples/')) return response;
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
    cfg: { pack: 'button-accordion-hn' },
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
    resultNode.textContent = 'Decoding the bundled accordion recordings…';
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) throw new Error(`Accordion pack failed to load completely: ${JSON.stringify(status)}`);

    engine.noteOn?.(47, 0.8, 0.08);
    engine.noteOff?.(47, 0.68);

    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    const attackFile = attack.file.split('/').at(-1) ?? '';
    const releaseFile = release.file.split('/').at(-1) ?? '';
    const attackSource = played.find((item) => Math.abs(item.at - 0.08) < 1e-6);
    const releaseSource = played.find((item) => Math.abs(item.at - 0.68) < 1e-6);

    if (!attackSource || attackSource.file !== attackFile) throw new Error(`MIDI 47 played ${attackSource?.file ?? 'no attack sample'}, expected ${attackFile}.`);
    if (!attackSource.loop || Math.abs(attackSource.loopStart - attack.loop[0]) > 1e-5 || Math.abs(attackSource.loopEnd - attack.loop[1]) > 1e-5) {
      throw new Error(`Attack loop does not match the pack zone: ${JSON.stringify(attackSource)} / ${JSON.stringify(attack.loop)}.`);
    }
    if (!releaseSource || releaseSource.file !== releaseFile) throw new Error(`Key-up played ${releaseSource?.file ?? 'no release sample'}, expected ${releaseFile}.`);
    if (!(rms > 0.001)) throw new Error(`Rendered accordion recording was silent (RMS ${rms}).`);

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - loaded ${pack.zones.length} attack/release zones; MIDI 47 played ${attackFile} with its sustain loop and ${releaseFile} on key-up; offline RMS ${rms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
