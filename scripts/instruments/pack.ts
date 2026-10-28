/**
 * Builds an instrument pack from draft zones (whatever the source: SFZ, a recipe, chopped
 * recordings): thins velocity layers / round robins, renders each zone's layers (mic mixes)
 * into one stereo sample, normalises the whole pack with ONE gain (so soft layers stay soft),
 * trims silent tails, encodes, and writes
 *   public/instruments/<id>/instrument.json + samples/,
 *   public/instruments/index.json, public/instruments/CREDITS.md,
 *   shared/instruments/catalog.ts (the app's device list).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InstrumentPack, PackArticulation, PackKind, PackLane, PackLicense, PackModWheelFade, PackZone } from '../../shared/instruments/types.ts';
import type { PackEntry } from '../../shared/instruments/catalogTypes.ts';
import { packSwitchesFromZones } from '../../shared/instruments/zones.ts';
import { autoLoop, bakeDecay, capLength, detectPitch, fadeIn, isMono, mixInto, peakingEq, peakOf, reverse, sfzFilter, slice, trimTail } from './analyze.ts';
import { decode, emptyPcm, encodeRaw, PACK_RATE, writeRaw, type OutFormat, type Pcm } from './pcm.ts';
import type { SfzEq, SfzFilter } from './sfz.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const PACKS_DIR = path.join(ROOT, 'public', 'instruments');
const INDEX = path.join(PACKS_DIR, 'index.json');
const CATALOG = path.join(ROOT, 'shared', 'instruments', 'catalog.ts');
const CREDITS = path.join(PACKS_DIR, 'CREDITS.md');

export interface Layer {
  /** Absolute path of the source recording. */
  file: string;
  gain: number;
  /** -1..1 */
  pan: number;
  offsetSec: number;
  endSec: number | null;
  reverse: boolean;
  filters: SfzFilter[];
  eqs: SfzEq[];
  env: { hold: number; decay: number; sustain: number } | null;
}

export interface DraftZone {
  /** Empty = silent zone (only chokes). */
  layers: Layer[];
  lokey: number;
  hikey: number;
  root: number | null;
  lovel: number;
  hivel: number;
  seq?: number;
  seqLength?: number;
  lorand?: number;
  hirand?: number;
  tune: number;
  groups: number[];
  offBy: number[];
  attack: number;
  release: number;
  velCurve?: [number, number][];
  velocityFadeIn?: [number, number];
  velocityFadeOut?: [number, number];
  velocityFadeCurve?: 'gain' | 'power';
  modWheelFade?: PackModWheelFade;
  articulation?: string;
  swDown?: number;
  swUp?: number;
  swPrevious?: number;
  trigger?: 'attack' | 'release';
  /** 'auto' = find a loop; [start, end] = seconds from the zone's sample start. */
  loop?: 'auto' | [number, number];
}

export interface PackMeta {
  id: string;
  name: string;
  kind: PackKind;
  category: string;
  description: string;
  license: PackLicense;
  lanes?: PackLane[];
  notePolyphony?: number;
  oneShot?: boolean;
  release?: number;
  articulations?: PackArticulation[];
}

export interface BuildOptions {
  maxLayers?: number;
  maxRr?: number;
  /** Longest sample (s); per-key overrides for cymbals etc. */
  maxSeconds?: number;
  maxSecondsByKey?: Record<number, number>;
  /** Tail cut level after normalisation (dBFS). */
  tailDb?: number;
  format?: OutFormat;
  quality?: number;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

// ---------------------------------------------------------------- thinning

const slotKey = (z: DraftZone) => `${z.trigger ?? 'attack'}|${z.articulation ?? ''}|${z.swDown ?? ''}|${z.swUp ?? ''}|${z.swPrevious ?? ''}|${z.lokey}-${z.hikey}-${z.root}`;

/** Keeps at most `max` velocity layers per key range (evenly spread, always the loudest). */
export function thinLayers(zones: DraftZone[], max: number): DraftZone[] {
  const out: DraftZone[] = zones.filter((z) => !z.layers.length);
  const slots = new Map<string, DraftZone[]>();
  for (const z of zones) if (z.layers.length) (slots.get(slotKey(z)) ?? slots.set(slotKey(z), []).get(slotKey(z))!).push(z);
  for (const list of slots.values()) {
    const ranges = [...new Map(list.map((z) => [`${z.lovel}-${z.hivel}`, [z.lovel, z.hivel] as const])).values()].sort((a, b) => a[1] - b[1]);
    if (ranges.length <= max) {
      out.push(...list);
      continue;
    }
    const keep = Array.from({ length: max }, (_, k) => ranges[Math.round(((k + 1) * ranges.length) / max) - 1]);
    keep.forEach(([lo, hi], k) => {
      const newLo = k === 0 ? 1 : keep[k - 1][1] + 1;
      const newHi = k === keep.length - 1 ? 127 : hi;
      for (const z of list) if (z.lovel === lo && z.hivel === hi) out.push({ ...z, lovel: newLo, hivel: newHi, velCurve: undefined });
    });
  }
  return out;
}

/** Keeps at most `max` round robins (sequential and random) per key range + layer. */
export function thinRoundRobins(zones: DraftZone[], max: number): DraftZone[] {
  const seqKept = zones.flatMap((z) => (z.seqLength && z.seqLength > max ? ((z.seq ?? 1) > max ? [] : [{ ...z, seqLength: max }]) : [z]));
  const out: DraftZone[] = [];
  const groups = new Map<string, DraftZone[]>();
  for (const z of seqKept) {
    if (z.lorand === undefined || z.hirand === undefined || (z.lorand <= 0 && z.hirand >= 1)) out.push(z);
    else {
      const k = `${slotKey(z)}|${z.lovel}|${z.seq ?? 0}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(z);
    }
  }
  for (const list of groups.values()) {
    // zones sharing one random range are layers of the same hit: keep or drop whole ranges
    const keep = [...new Set(list.map((z) => z.lorand!))].sort((x, y) => x - y).slice(0, max);
    for (const z of list) {
      const i = keep.indexOf(z.lorand!);
      if (i >= 0) out.push({ ...z, lorand: i / keep.length, hirand: (i + 1) / keep.length });
    }
  }
  return out;
}

/** Melodic: keeps every `step`-th sampled note per layer and widens the key ranges to match. */
export function thinKeys(zones: DraftZone[], step: number): DraftZone[] {
  if (step <= 1) return zones;
  const out: DraftZone[] = zones.filter((z) => !z.layers.length || z.root === null);
  const groups = new Map<string, DraftZone[]>();
  for (const z of zones) {
    if (!z.layers.length || z.root === null) continue;
    const k = `${z.trigger ?? 'attack'}|${z.articulation ?? ''}|${z.swDown ?? ''}|${z.swUp ?? ''}|${z.swPrevious ?? ''}|${z.lovel}|${z.hivel}|${z.seq ?? 0}|${z.lorand ?? ''}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(z);
  }
  for (const list of groups.values()) {
    const roots = [...new Set(list.map((z) => z.root!))].sort((a, b) => a - b);
    const keep = roots.filter((_, i) => i % step === 0 || i === roots.length - 1);
    const lo = Math.min(...list.map((z) => z.lokey));
    const hi = Math.max(...list.map((z) => z.hikey));
    keep.forEach((root, i) => {
      const lokey = i === 0 ? lo : Math.floor((keep[i - 1] + root) / 2) + 1;
      const hikey = i === keep.length - 1 ? hi : Math.floor((root + keep[i + 1]) / 2);
      for (const z of list) if (z.root === root) out.push({ ...z, lokey, hikey });
    });
  }
  return out;
}

// ---------------------------------------------------------------- rendering

function layerSig(l: Layer): string {
  return JSON.stringify([l.file, +l.gain.toFixed(5), +l.pan.toFixed(3), +l.offsetSec.toFixed(5), l.endSec, l.reverse, l.filters, l.eqs, l.env]);
}

const decoded = new Map<string, Pcm>();
function source(file: string): Pcm {
  let p = decoded.get(file);
  if (!p) {
    if (decoded.size > 24) decoded.delete(decoded.keys().next().value!);
    p = decode(file);
    decoded.set(file, p);
  }
  return p;
}

function renderLayers(layers: Layer[]): Pcm {
  const parts = layers.map((l) => {
    let p = source(l.file);
    p = slice(p, l.offsetSec * p.rate, l.endSec !== null ? l.endSec * p.rate : p.frames);
    if (l.reverse) p = reverse(p);
    else p = { ...p, data: p.data.slice() };
    for (const f of l.filters) sfzFilter(p, f.type, f.cutoff, f.resonance);
    for (const e of l.eqs) peakingEq(p, e.freq, e.bw, e.gain);
    if (l.env) bakeDecay(p, l.env.hold, l.env.decay, l.env.sustain);
    return { p, l };
  });
  const out = emptyPcm(Math.max(1, ...parts.map((x) => x.p.frames)), PACK_RATE);
  for (const { p, l } of parts) mixInto(out, p, l.gain, l.pan);
  return out;
}

function readRaw(file: string): Pcm {
  const b = fs.readFileSync(file);
  const data = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { rate: PACK_RATE, frames: data.length / 2, data };
}

// ---------------------------------------------------------------- index / catalog / credits

interface PackIndex {
  format: 'unbox-instrument-index';
  version: 1;
  packs: PackEntry[];
}

export function readIndex(): PackIndex {
  try {
    const j = JSON.parse(fs.readFileSync(INDEX, 'utf8')) as PackIndex;
    if (j.format === 'unbox-instrument-index' && Array.isArray(j.packs)) return j;
  } catch {
    // no index yet
  }
  return { format: 'unbox-instrument-index', version: 1, packs: [] };
}

export function writeIndex(index: PackIndex): void {
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
  const body = JSON.stringify(index.packs, null, 2).replace(/"(\w+)":/g, '$1:');
  fs.writeFileSync(
    CATALOG,
    `// GENERATED by scripts/instruments (npm run instrument) from public/instruments/index.json.
// Do not hand-edit: rebuild or remove packs with the tool. Each pack becomes a rack device
// (shared/rack/devices/sampled.ts) of type \`rec_<id>\`, which saved projects reference.
import type { PackEntry } from './catalogTypes.ts';

export const INSTRUMENT_PACKS: readonly PackEntry[] = ${body};
`
  );
  const lines = [
    '# Instrument pack credits',
    '',
    'Recorded instruments bundled with THE UNBOX APP. Generated by `npm run instrument`; every pack keeps its original license.',
    '',
    'Attribution names can identify a library creator, mapper, curator, or uploader. They are not performer credits unless the source explicitly identifies that role.',
    '',
  ];
  for (const p of index.packs) {
    lines.push(`## ${p.name}`, '', `- Attribution: ${p.author}`, `- License: ${p.spdx}`, `- Source: ${p.source}`);
    const notes = readPackNotes(p.id);
    if (notes) lines.push(`- Notes: ${notes}`);
    lines.push('');
  }
  fs.writeFileSync(CREDITS, lines.join('\n'));
}

function readPackNotes(id: string): string | undefined {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, id, 'instrument.json'), 'utf8')) as InstrumentPack;
    return j.license.notes;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- build

const MB = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

export function buildPack(meta: PackMeta, draft: DraftZone[], o: BuildOptions = {}): InstrumentPack {
  const log = o.log ?? console.log;
  if (!/^[a-z0-9-]+$/.test(meta.id)) throw new Error(`pack id "${meta.id}": use lowercase letters, digits and dashes`);
  let zones = draft;
  if (o.maxLayers) zones = thinLayers(zones, o.maxLayers);
  if (o.maxRr) zones = thinRoundRobins(zones, o.maxRr);
  if (!zones.some((z) => z.layers.length)) throw new Error('no sounding zones');

  // one render per distinct layer mix
  const renders = new Map<string, { layers: Layer[]; loop?: DraftZone['loop']; key: number; root: number | null }>();
  const zoneRender = zones.map((z) => {
    if (!z.layers.length) return '';
    const sig = JSON.stringify([z.layers.map(layerSig), z.loop ?? null]);
    if (!renders.has(sig)) renders.set(sig, { layers: z.layers, loop: z.loop, key: z.root ?? z.lokey, root: z.root });
    return sig;
  });
  const sourceFiles = new Set(zones.flatMap((z) => z.layers.map((l) => l.file)));
  log(`${meta.name}: ${zones.length} zones → ${renders.size} samples from ${sourceFiles.size} recordings`);
  if (o.dryRun) return { format: 'unbox-instrument', version: 1, ...meta, zones: [] } as InstrumentPack;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `unbox-pack-${meta.id}-`));
  const outDir = path.join(PACKS_DIR, meta.id);
  const stage = `${outDir}.building`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'samples'), { recursive: true });
  try {
    // pass 1: mix, loop, measure
    const info = new Map<string, { raw: string; peak: number; loop: [number, number] | null }>();
    let n = 0;
    for (const [sig, r] of renders) {
      const pcm = renderLayers(r.layers);
      let loop: [number, number] | null = null;
      if (r.loop === 'auto') {
        const pitch = detectPitch(pcm);
        const period = pitch ? PACK_RATE / (440 * Math.pow(2, (pitch.midi - 69) / 12)) : null;
        loop = autoLoop(pcm, period);
      } else if (Array.isArray(r.loop)) loop = [Math.round(r.loop[0] * PACK_RATE), Math.round(r.loop[1] * PACK_RATE)];
      fadeIn(pcm, 8); // de-click if the cut landed mid-wave
      const raw = path.join(tmp, `${n}.f32`);
      writeRaw(raw, pcm);
      info.set(sig, { raw, peak: peakOf(pcm), loop });
      if (++n % 25 === 0 || n === renders.size) log(`  mixed ${n}/${renders.size}`);
    }
    decoded.clear();
    const peak = Math.max(...[...info.values()].map((i) => i.peak), 1e-9);
    const gain = 0.891 / peak; // −1 dBFS for the loudest hit of the pack
    const floor = Math.pow(10, (o.tailDb ?? -66) / 20);
    log(`  pack gain ${(20 * Math.log10(gain)).toFixed(1)} dB`);

    // pass 2: normalise, trim, encode
    const fmt = o.format ?? 'ogg';
    const files = new Map<string, { file: string; loop: [number, number] | null }>();
    let bytes = 0;
    let k = 0;
    let monoCount = 0;
    for (const [sig, r] of renders) {
      const it = info.get(sig)!;
      let pcm = readRaw(it.raw);
      for (let i = 0; i < pcm.data.length; i++) pcm.data[i] *= gain;
      if (it.loop) pcm = slice(pcm, 0, Math.min(pcm.frames, it.loop[1] + Math.round(PACK_RATE * 0.05)));
      else {
        pcm = trimTail(pcm, floor);
        const max = o.maxSecondsByKey?.[r.key] ?? o.maxSeconds;
        if (max) pcm = capLength(pcm, max);
      }
      writeRaw(it.raw, pcm);
      const name = `samples/${String(k++).padStart(4, '0')}.${fmt}`;
      const mono = isMono(pcm);
      if (mono) monoCount++;
      encodeRaw(it.raw, path.join(stage, name), PACK_RATE, 0, fmt, o.quality ?? 5, mono);
      bytes += fs.statSync(path.join(stage, name)).size;
      files.set(sig, { file: name, loop: it.loop });
      fs.rmSync(it.raw);
      if (k % 50 === 0 || k === renders.size) log(`  encoded ${k}/${renders.size} (${MB(bytes)})`);
    }

    const packZones: PackZone[] = zones.map((z, i) => {
      const f = zoneRender[i] ? files.get(zoneRender[i])! : null;
      const pz: PackZone = { file: f?.file ?? '', lokey: z.lokey, hikey: z.hikey, root: z.root, lovel: z.lovel, hivel: z.hivel };
      if (z.articulation) pz.articulation = z.articulation;
      if (z.swDown !== undefined) pz.swDown = z.swDown;
      if (z.swUp !== undefined) pz.swUp = z.swUp;
      if (z.swPrevious !== undefined) pz.swPrevious = z.swPrevious;
      if (z.trigger === 'release') pz.trigger = 'release';
      if (z.seqLength && z.seqLength > 1) Object.assign(pz, { seq: z.seq ?? 1, seqLength: z.seqLength });
      if (z.lorand !== undefined && z.hirand !== undefined && (z.lorand > 0 || z.hirand < 1)) Object.assign(pz, { lorand: +z.lorand.toFixed(4), hirand: +z.hirand.toFixed(4) });
      if (Math.abs(z.tune) > 0.5) pz.tune = Math.round(z.tune * 10) / 10;
      if (f?.loop) pz.loop = [+(f.loop[0] / PACK_RATE).toFixed(5), +(f.loop[1] / PACK_RATE).toFixed(5)];
      if (z.groups.length) pz.groups = z.groups;
      if (z.offBy.length) pz.offBy = z.offBy;
      if (z.attack > 0.0015) pz.attack = +z.attack.toFixed(4);
      if (z.release > 0) pz.release = +z.release.toFixed(3);
      if (z.velCurve) pz.velCurve = z.velCurve.map(([v, g]) => [v, +g.toFixed(4)]);
      if (z.velocityFadeIn) pz.velocityFadeIn = z.velocityFadeIn;
      if (z.velocityFadeOut) pz.velocityFadeOut = z.velocityFadeOut;
      if (z.velocityFadeCurve) pz.velocityFadeCurve = z.velocityFadeCurve;
      if (z.modWheelFade) pz.modWheelFade = z.modWheelFade;
      return pz;
    });

    const lanes = meta.lanes?.filter((l) => packZones.some((z) => z.file && l.note >= z.lokey && l.note <= z.hikey));
    const dropped = meta.lanes?.filter((l) => !lanes?.includes(l)).map((l) => l.name);
    if (dropped?.length) log(`  lanes without samples (left out): ${dropped.join(', ')}`);
    const pack: InstrumentPack = {
      format: 'unbox-instrument',
      version: 1,
      id: meta.id,
      name: meta.name,
      kind: meta.kind,
      category: meta.category,
      description: meta.description,
      license: meta.license,
      ...(lanes?.length ? { lanes } : {}),
      ...(meta.notePolyphony ? { notePolyphony: meta.notePolyphony } : {}),
      ...(meta.oneShot ? { oneShot: true } : {}),
      ...(meta.release !== undefined ? { release: meta.release } : {}),
      ...(meta.articulations?.length ? { articulations: meta.articulations } : {}),
      zones: packZones,
      bytes,
    };
    fs.writeFileSync(path.join(stage, 'instrument.json'), JSON.stringify(pack) + '\n');
    fs.rmSync(outDir, { recursive: true, force: true });
    try {
      fs.renameSync(stage, outDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EACCES')) throw error;
      log('  Windows denied the staged-directory rename; copying the completed pack instead');
      try {
        fs.cpSync(stage, outDir, { recursive: true, errorOnExist: true, force: false });
      } catch (copyError) {
        fs.rmSync(outDir, { recursive: true, force: true });
        throw copyError;
      }
      fs.rmSync(stage, { recursive: true, force: true });
    }

    const index = readIndex();
    const switches = packSwitchesFromZones(packZones);
    const entry: PackEntry = {
      id: pack.id,
      name: pack.name,
      kind: pack.kind,
      category: pack.category,
      description: pack.description,
      spdx: pack.license.spdx,
      author: pack.license.author,
      source: pack.license.source,
      ...(pack.lanes ? { lanes: pack.lanes } : {}),
      ...(pack.articulations ? { articulations: pack.articulations } : {}),
      ...(switches.length ? { switches } : {}),
      ...(pack.oneShot ? { oneShot: true } : {}),
      ...(pack.release !== undefined ? { release: pack.release } : {}),
      bytes,
    };
    const at = index.packs.findIndex((p) => p.id === pack.id);
    if (at >= 0) index.packs[at] = entry;
    else index.packs.push(entry);
    writeIndex(index);
    log(`  wrote public/instruments/${pack.id} (${files.size} samples${monoCount ? `, ${monoCount} mono` : ''}, ${MB(bytes)})`);
    return pack;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

export function removePack(id: string): boolean {
  const index = readIndex();
  const at = index.packs.findIndex((p) => p.id === id);
  fs.rmSync(path.join(PACKS_DIR, id), { recursive: true, force: true });
  if (at < 0) return false;
  index.packs.splice(at, 1);
  writeIndex(index);
  return true;
}
