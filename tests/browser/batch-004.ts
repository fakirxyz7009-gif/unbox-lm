import { INSTRUMENT_PACKS } from '../../shared/instruments/catalog.ts';
import { parsePack, type InstrumentPack } from '../../shared/instruments/types.ts';
import { ALL_PLAYABLE_INSTRUMENTS } from '../../src/audio/instrumentCatalog.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';
import { multisampleEngine } from '../../src/audio/spec/engines/multisample.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

interface TaggedBytes extends ArrayBuffer { sampleName?: string; }
interface TaggedAudio extends AudioBuffer { sampleName?: string; }

const BATCH = [
  'vcsl-didgeridoo',
  'vcsl-strumstick',
  'vcsl-wine-glasses',
  'vcsl-mbira-dzavadzimu',
  'vcsl-clash-cymbals',
  'vsco-bassoon-staccato',
  'vsco-contrabass-spiccato',
  'vsco-flute-staccato',
  'vsco-trombone-staccato',
  'vsco-tuba-staccato',
  'freepats-jazz-electric-guitar',
  'freepats-distorted-electric-guitar',
  'freepats-synth-strings',
  'freepats-synth-brass',
  'freepats-synth-bass',
  'karoryfer-bobobo',
  'karoryfer-gogodze-drum-kit',
  'karoryfer-sneakybass',
  'karoryfer-cowsynth-pad',
  'karoryfer-swirly-drums',
] as const;

const licenseFor = (_id: string): string => 'CC0-1.0';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

function rmsBetween(samples: Float32Array, rate: number, start: number, end: number): number {
  const first = Math.max(0, Math.round(start * rate));
  const last = Math.min(samples.length, Math.round(end * rate));
  let sum = 0;
  for (let i = first; i < last; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / Math.max(1, last - first));
}

function representativeNote(pack: InstrumentPack): { note: number; velocity: number } {
  if (pack.kind === 'drums') {
    const note = pack.lanes?.[0]?.note ?? pack.zones[0]?.lokey ?? 60;
    return { note, velocity: 104 };
  }
  const zones = [...pack.zones].filter((zone) => zone.trigger !== 'release').sort((a, b) => (a.root ?? 0) - (b.root ?? 0));
  const zone = zones[Math.floor(zones.length / 2)] ?? zones[0];
  if (!zone) throw new Error(`${pack.id} has no playable melodic zones`);
  const note = zone.root ?? Math.round((zone.lokey + zone.hikey) / 2);
  return { note, velocity: Math.max(48, Math.round((zone.lovel + zone.hivel) / 2)) };
}

async function renderPack(pack: InstrumentPack): Promise<{ decoded: number; samples: number; rms: number; note: number }> {
  const ctx = new OfflineAudioContext(2, 72_000, 48_000);
  const decoded = new Set<string>();
  const decode = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = async (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    const buffer = (await decode(bytes)) as TaggedAudio;
    buffer.sampleName = (bytes as TaggedBytes).sampleName;
    if (buffer.sampleName) decoded.add(buffer.sampleName);
    return buffer;
  };
  const output = ctx.createGain();
  output.connect(ctx.destination);
  const host = {
    ctx,
    spec: { pads: [] },
    cfg: { pack: pack.id },
    p: (key: string, fallback = 0) => key === 'vary' ? 0 : fallback,
    opt: () => '',
    ins: [], sc: null, ret: null, outs: [output], aux: null,
    clock: { bpm: () => 120, isPlaying: () => false },
    modWheel: () => 0,
    modWheelTouched: () => false,
    gateCv: () => 0,
    changed: () => undefined,
  } as unknown as SpecHost;
  const engine = multisampleEngine(host);
  try {
    await engine.ready?.();
    const status = engine.meter?.();
    if (status?.failed || status?.loaded !== 1) {
      throw new Error(`${pack.id} failed to load: ${JSON.stringify(status)}`);
    }
    const { note, velocity } = representativeNote(pack);
    engine.noteOn?.(note, velocity / 127, 0.02);
    engine.noteOff?.(note, 0.5);
    const rendered = await ctx.startRendering();
    const rms = rmsBetween(rendered.getChannelData(0), ctx.sampleRate, 0.06, 0.55);
    if (!(rms > 1e-5)) throw new Error(`${pack.id} rendered silence at MIDI ${note} (RMS ${rms}).`);
    return { decoded: decoded.size, samples: new Set(pack.zones.map((zone) => zone.file)).size, rms, note };
  } finally {
    engine.dispose?.();
  }
}

async function run(): Promise<void> {
  const creditsResponse = await fetch('/instruments/CREDITS.md');
  if (!creditsResponse.ok) throw new Error(`CREDITS.md returned HTTP ${creditsResponse.status}`);
  const credits = await creditsResponse.text();

  const entries = BATCH.map((id) => INSTRUMENT_PACKS.find((entry) => entry.id === id));
  if (entries.some((entry) => !entry)) throw new Error('One or more fourth-batch packs are missing from the instrument catalog');
  if (new Set(entries.map((entry) => entry!.id)).size !== BATCH.length) throw new Error('The fourth-batch catalog list has duplicate IDs');

  const packs: InstrumentPack[] = [];
  for (const entry of entries) {
    const packEntry = entry!;
    const expectedLicense = licenseFor(packEntry.id);
    if (packEntry.spdx !== expectedLicense) throw new Error(`${packEntry.id} is ${packEntry.spdx}, expected ${expectedLicense}`);
    if (!packEntry.author.trim()) throw new Error(`${packEntry.id} has no attribution`);
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{40}(?:\/|$)/i.test(packEntry.source)) {
      throw new Error(`${packEntry.id} source is not a pinned 40-character GitHub revision`);
    }
    if (!credits.includes(`## ${packEntry.name}\n\n- Attribution: ${packEntry.author}\n- License: ${expectedLicense}`)) {
      throw new Error(`${packEntry.name} is missing its generated attribution/license credits`);
    }
    const response = await fetch(`/instruments/${packEntry.id}/instrument.json`);
    if (!response.ok) throw new Error(`${packEntry.id}/instrument.json returned HTTP ${response.status}`);
    const pack = parsePack(await response.json() as unknown);
    if (!pack) throw new Error(`${packEntry.id}/instrument.json failed schema validation`);
    if (pack.id !== packEntry.id || pack.license.spdx !== expectedLicense || !pack.license.author.trim() || !pack.license.source.trim()) {
      throw new Error(`${packEntry.id} manifest license metadata does not match the catalog`);
    }
    if (!pack.zones.length || !pack.zones.every((zone) => zone.file.startsWith('samples/'))) {
      throw new Error(`${packEntry.id} has no encoded sample zones`);
    }
    const type = `rec_${packEntry.id.replace(/-/g, '_')}`;
    if (!ALL_PLAYABLE_INSTRUMENTS.some((device) => device.type === type)) throw new Error(`${packEntry.id} is missing from the playable-instrument catalog`);
    if (!DEVICE_SPECS.some((device) => device.type === type && device.engineConfig?.pack === packEntry.id)) {
      throw new Error(`${packEntry.id} is missing its multisample rack device`);
    }
    packs.push(pack);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const fetched = await originalFetch(input, init);
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
    if (!url.pathname.startsWith('/instruments/') || !url.pathname.includes('/samples/')) return fetched;
    const bytes = (await fetched.arrayBuffer()) as TaggedBytes;
    bytes.sampleName = url.pathname.split('/').at(-1);
    return { ok: fetched.ok, status: fetched.status, arrayBuffer: async () => bytes } as Response;
  };

  try {
    const reports: { id: string; note: number; decoded: number; samples: number; rms: number }[] = [];
    for (const [index, pack] of packs.entries()) {
      resultNode.textContent = `Loading and playing ${index + 1}/${packs.length}: ${pack.name}…`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const report = await renderPack(pack);
      if (report.decoded !== report.samples) {
        throw new Error(`${pack.id} decoded ${report.decoded}/${report.samples} unique samples`);
      }
      reports.push({ id: pack.id, ...report });
    }
    const decoded = reports.reduce((sum, report) => sum + report.decoded, 0);
    const minRms = Math.min(...reports.map((report) => report.rms));
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · 20/20 packs (all CC0), ${decoded} unique recordings decoded; all 20 played a mapped note with audible output (minimum RMS ${minRms.toFixed(4)}). ${reports.map((report) => `${report.id}:${report.note}`).join(' ')}`;
  } finally {
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
