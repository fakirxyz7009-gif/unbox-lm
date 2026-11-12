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
}

interface PackCase {
  id: 'pianet-t' | 'wurlitzer-ep200';
  low: number;
  high: number;
  zoneCount: number;
  uniqueSampleCount: number;
  centerVelocities: number[];
}

const CASES: readonly PackCase[] = [
  { id: 'pianet-t', low: 29, high: 88, zoneCount: 49, uniqueSampleCount: 49, centerVelocities: [0.2, 0.9] },
  { id: 'wurlitzer-ep200', low: 33, high: 96, zoneCount: 48, uniqueSampleCount: 45, centerVelocities: [0.2, 0.4, 0.6, 0.9] },
];

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function runPack(testCase: PackCase): Promise<string> {
  const packResponse = await fetch(`/instruments/${testCase.id}/instrument.json`);
  if (!packResponse.ok) throw new Error(`${testCase.id} instrument.json returned HTTP ${packResponse.status}`);
  const pack = (await packResponse.json()) as InstrumentPack;
  const playable = pack.zones.filter((zone) => zone.trigger !== 'release');
  const sampleCount = new Set(pack.zones.map((zone) => zone.file).filter(Boolean)).size;
  if (pack.id !== testCase.id || pack.license.spdx !== 'CC-BY-3.0') {
    throw new Error(`${testCase.id} pack identity or CC BY 3.0 license is incorrect.`);
  }
  if (pack.zones.length !== testCase.zoneCount || sampleCount !== testCase.uniqueSampleCount) {
    throw new Error(`${testCase.id} mapping changed: ${pack.zones.length} zones / ${sampleCount} samples.`);
  }
  if (!playable.some((zone) => zone.lokey <= testCase.low && zone.hikey >= testCase.low) ||
      !playable.some((zone) => zone.lokey <= testCase.high && zone.hikey >= testCase.high)) {
    throw new Error(`${testCase.id} does not cover its expected keyboard endpoints.`);
  }

  const events = [
    { note: testCase.low, velocity: 0.5 },
    ...testCase.centerVelocities.map((velocity) => ({ note: 60, velocity })),
    { note: testCase.high, velocity: 0.5 },
  ].map((event, index) => ({ ...event, at: 0.05 + index * 0.4 }));
  const expectedByTime = new Map<number, string[]>();
  for (const event of events) {
    const midiVelocity = Math.max(1, Math.min(127, Math.round(event.velocity * 127)));
    const matching = matchingPackZones(pack, event.note, midiVelocity, null, 'attack', 0, 0.5);
    if (!matching.length) throw new Error(`${testCase.id} has no sample for MIDI ${event.note}, velocity ${midiVelocity}.`);
    expectedByTime.set(event.at, matching.map((zone) => zone.file.split('/').at(-1) ?? ''));
  }

  const played: PlayedSource[] = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith(`/instruments/${testCase.id}/samples/`)) return response;
    const bytes = (await response.arrayBuffer()) as TaggedBuffer;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: response.ok, status: response.status, arrayBuffer: async () => bytes } as Response;
  };

  const ctx = new OfflineAudioContext(2, 144_000, 48_000);
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
    cfg: { pack: testCase.id },
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
    if (status?.failed || status?.loaded !== 1) throw new Error(`${testCase.id} failed to decode: ${JSON.stringify(status)}`);

    for (const event of events) {
      engine.noteOn?.(event.note, event.velocity, event.at);
      engine.noteOff?.(event.note, event.at + 0.22);
    }

    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    if (!(rms > 0.001)) throw new Error(`${testCase.id} rendered silence or near-silence (RMS ${rms}).`);

    for (const [at, expectedFiles] of expectedByTime) {
      const actualFiles = played.filter((source) => Math.abs(source.at - at) < 1e-6).map((source) => source.file).sort();
      if (JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())) {
        throw new Error(`${testCase.id} at ${at}s played ${JSON.stringify(actualFiles)}, expected ${JSON.stringify(expectedFiles)}.`);
      }
    }

    const centerFiles = events
      .filter((event) => event.note === 60)
      .flatMap((event) => played.filter((source) => Math.abs(source.at - event.at) < 1e-6).map((source) => source.file));
    const minimumLayerSamples = testCase.id === 'pianet-t' ? 2 : 4;
    if (new Set(centerFiles).size < minimumLayerSamples) {
      throw new Error(`${testCase.id} center-note velocities did not reach all expected recorded layers: ${centerFiles.join(', ')}.`);
    }

    return `${pack.name}: ${pack.zones.length} zones / ${sampleCount} samples; low, center velocity layers, and high notes rendered; RMS ${rms.toFixed(4)}`;
  } finally {
    engine.dispose?.();
    window.fetch = originalFetch;
  }
}

void (async () => {
  try {
    resultNode.textContent = 'Decoding and rendering Hohner Pianet T and Wurlitzer EP200 recordings…';
    const reports: string[] = [];
    for (const testCase of CASES) reports.push(await runPack(testCase));
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · ${reports.join(' · ')}`;
  } catch (error: unknown) {
    resultNode.dataset.status = 'failed';
    resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
  }
})();
