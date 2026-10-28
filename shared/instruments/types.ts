/**
 * Instrument packs: recorded multisample instruments shipped in public/instruments/<id>/
 * (instrument.json + samples/). Built offline by scripts/instruments (SFZ libraries, folders of
 * recordings), listed in ./catalog.ts and played by the 'multisample' engine
 * (src/audio/spec/engines/multisample.ts). Pure data + validation — no DOM / Node APIs.
 */

export type PackKind = 'drums' | 'melodic';

/** Drum role of a lane (becomes PadDef.voice, so pattern generators find kick / snare / hats). */
export type DrumRole = 'kick' | 'snare' | 'rim' | 'clap' | 'hatC' | 'hatP' | 'hatO' | 'tom' | 'cymbal' | 'ride' | 'perc';

export interface PackLicense {
  /** SPDX id, e.g. CC0-1.0, CC-BY-4.0. */
  spdx: string;
  author: string;
  /** Where the recordings come from (URL). */
  source: string;
  notes?: string;
}

export interface PackLane {
  name: string;
  note: number;
  role?: DrumRole;
}

export interface PackZone {
  /** Sample file relative to the pack folder; '' = silent zone that only chokes (SFZ *silence). */
  file: string;
  lokey: number;
  hikey: number;
  /** Key at which the sample plays at its recorded pitch; null = no pitch tracking (drums). */
  root: number | null;
  lovel: number;
  hivel: number;
  /** Round robin: plays on hit seq of every seqLength hits of the same key. */
  seq?: number;
  seqLength?: number;
  /** Random round robin: plays when a 0..1 random number falls in [lorand, hirand). */
  lorand?: number;
  hirand?: number;
  /** Linear gain. */
  gain?: number;
  /** Cents. */
  tune?: number;
  /** -1..1 */
  pan?: number;
  /** Sustain loop (seconds). */
  loop?: [number, number];
  /** Choke: starting this zone silences voices whose offBy contains one of these groups. */
  groups?: number[];
  offBy?: number[];
  /** Seconds. */
  attack?: number;
  release?: number;
  /** Velocity (1..127) → gain points, from the library's own curve. */
  velCurve?: [number, number][];
  /** SFZ velocity crossfade in/out ranges and curve; fades combine multiplicatively. */
  velocityFadeIn?: [number, number];
  velocityFadeOut?: [number, number];
  velocityFadeCurve?: 'gain' | 'power';
  /** SFZ CC1 dynamic-layer crossfade; defaults to the source program's set_cc1 value. */
  modWheelFade?: PackModWheelFade;
  /** Sticky keyswitch-selected articulation. Missing means the pack default. */
  articulation?: string;
  /** SFZ momentary switches: this region requires the named keyswitch held. */
  swDown?: number;
  /** SFZ momentary switches: this region is active only while the named key is not held. */
  swUp?: number;
  /** SFZ selector: this region matches only when the immediately previous note-on had this note. */
  swPrevious?: number;
  /** SFZ release-trigger sample; omitted / attack zones play on key-down. */
  trigger?: 'attack' | 'release';
}

export interface PackModWheelFade {
  in?: [number, number];
  out?: [number, number];
  curve: 'gain' | 'power';
  default: number;
}

export interface PackArticulation {
  id: string;
  label: string;
  /** MIDI keyswitch note; null means selectable only as the default. */
  keyswitch: number | null;
  default: boolean;
}

export interface InstrumentPack {
  format: 'unbox-instrument';
  version: 1;
  id: string;
  name: string;
  kind: PackKind;
  /** SoundCategory (piano, drums, bass, guitar, percussion …). */
  category: string;
  description: string;
  license: PackLicense;
  /** Drum kits: one lane per playable sound. */
  lanes?: PackLane[];
  /** Voices per key; 1 = re-striking a key damps the previous note (piano). */
  notePolyphony?: number;
  /** Ignore note-off (drums, one-shots). */
  oneShot?: boolean;
  /** Default release (s) for the device's Release knob. */
  release?: number;
  /** SFZ sticky keyswitch articulations. */
  articulations?: PackArticulation[];
  zones: PackZone[];
  /** Sample data size in bytes (tooling / UI info). */
  bytes?: number;
}

// ---------------------------------------------------------------- validation

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const ints = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((x) => Number.isInteger(x)) ? (v as number[]) : undefined;

/** Safe relative sample path inside the pack folder (no '..', no absolute paths). */
export function isSafeSamplePath(p: string): boolean {
  return p === '' || (/^[\w\-./ ]+$/.test(p) && !p.split('/').includes('..') && !p.startsWith('/'));
}

function parseZone(raw: unknown): PackZone | null {
  if (!isObj(raw)) return null;
  const file = str(raw.file);
  const lokey = num(raw.lokey, 0, 127);
  const hikey = num(raw.hikey, 0, 127);
  const lovel = num(raw.lovel, 0, 127);
  const hivel = num(raw.hivel, 0, 127);
  const root = raw.root === null ? null : num(raw.root, -24, 151);
  if (file === undefined || !isSafeSamplePath(file) || lokey === undefined || hikey === undefined) return null;
  if (lovel === undefined || hivel === undefined || root === undefined) return null;
  const z: PackZone = { file, lokey, hikey, root, lovel, hivel };
  if (raw.trigger !== undefined) {
    if (raw.trigger !== 'attack' && raw.trigger !== 'release') return null;
    if (raw.trigger === 'release') z.trigger = 'release';
  }
  const seq = num(raw.seq, 1, 128);
  const seqLength = num(raw.seqLength, 1, 128);
  if (seq !== undefined && seqLength !== undefined) Object.assign(z, { seq, seqLength });
  const lorand = num(raw.lorand, 0, 1);
  const hirand = num(raw.hirand, 0, 1);
  if (lorand !== undefined && hirand !== undefined) Object.assign(z, { lorand, hirand });
  const opt: [keyof PackZone, number, number][] = [
    ['gain', 0, 64],
    ['tune', -4800, 4800],
    ['pan', -1, 1],
    ['attack', 0, 30],
    ['release', 0, 30],
  ];
  for (const [k, lo, hi] of opt) {
    const v = num(raw[k], lo, hi);
    if (v !== undefined) (z as unknown as Record<string, number>)[k] = v;
  }
  if (Array.isArray(raw.loop) && raw.loop.length === 2) {
    const a = num(raw.loop[0], 0, 3600);
    const b = num(raw.loop[1], 0, 3600);
    if (a !== undefined && b !== undefined && b > a) z.loop = [a, b];
  }
  const groups = ints(raw.groups);
  const offBy = ints(raw.offBy);
  if (groups?.length) z.groups = groups;
  if (offBy?.length) z.offBy = offBy;
  if (Array.isArray(raw.velCurve)) {
    const pts = raw.velCurve.filter(
      (p): p is [number, number] => Array.isArray(p) && num(p[0], 0, 127) !== undefined && num(p[1], 0, 16) !== undefined
    );
    if (pts.length) z.velCurve = pts.map(([v, g]) => [v, g]);
  }
  for (const key of ['velocityFadeIn', 'velocityFadeOut'] as const) {
    const rawFade = raw[key];
    if (rawFade === undefined) continue;
    if (!Array.isArray(rawFade) || rawFade.length !== 2) return null;
    const start = num(rawFade[0], 0, 127);
    const end = num(rawFade[1], 0, 127);
    if (start === undefined || end === undefined || !Number.isInteger(start) || !Number.isInteger(end)) return null;
    z[key] = [start, end];
  }
  if (raw.velocityFadeCurve !== undefined) {
    if (raw.velocityFadeCurve !== 'gain' && raw.velocityFadeCurve !== 'power') return null;
    z.velocityFadeCurve = raw.velocityFadeCurve;
  }
  if (raw.modWheelFade !== undefined) {
    if (!isObj(raw.modWheelFade)) return null;
    const fade = raw.modWheelFade;
    if (fade.curve !== 'gain' && fade.curve !== 'power') return null;
    const defaultValue = num(fade.default, 0, 127);
    if (defaultValue === undefined || !Number.isInteger(defaultValue)) return null;
    const controllerFade: PackModWheelFade = { curve: fade.curve, default: defaultValue };
    for (const key of ['in', 'out'] as const) {
      const range = fade[key];
      if (range === undefined) continue;
      if (!Array.isArray(range) || range.length !== 2) return null;
      const start = num(range[0], 0, 127);
      const end = num(range[1], 0, 127);
      if (start === undefined || end === undefined || !Number.isInteger(start) || !Number.isInteger(end)) return null;
      controllerFade[key] = [start, end];
    }
    if (!controllerFade.in && !controllerFade.out) return null;
    z.modWheelFade = controllerFade;
  }
  const articulation = str(raw.articulation);
  if (articulation && /^[a-z0-9-]+$/.test(articulation)) z.articulation = articulation;
  for (const key of ['swDown', 'swUp'] as const) {
    const value = num(raw[key], 0, 127);
    if (raw[key] !== undefined && (value === undefined || !Number.isInteger(value))) return null;
    if (value !== undefined) z[key] = value;
  }
  const swPrevious = num(raw.swPrevious, 0, 127);
  if (raw.swPrevious !== undefined && (swPrevious === undefined || !Number.isInteger(swPrevious))) return null;
  if (swPrevious !== undefined) z.swPrevious = swPrevious;
  return z;
}

/** Validates instrument.json (fetched data is never trusted). */
export function parsePack(raw: unknown): InstrumentPack | null {
  if (!isObj(raw) || raw.format !== 'unbox-instrument' || raw.version !== 1) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const kind = raw.kind === 'drums' || raw.kind === 'melodic' ? raw.kind : undefined;
  if (!id || !/^[a-z0-9-]+$/.test(id) || !name || !kind || !isObj(raw.license) || !Array.isArray(raw.zones)) return null;
  const lic = raw.license;
  const zones = raw.zones.map(parseZone).filter((z): z is PackZone => !!z);
  if (!zones.length) return null;
  let articulations: PackArticulation[] | undefined;
  if (raw.articulations !== undefined) {
    if (!Array.isArray(raw.articulations) || raw.articulations.length > 64) return null;
    articulations = [];
    for (const rawArt of raw.articulations) {
      if (!isObj(rawArt)) return null;
      const artId = str(rawArt.id);
      const label = str(rawArt.label);
      const keyswitch = rawArt.keyswitch === null ? null : num(rawArt.keyswitch, 0, 127);
      if (!artId || !/^[a-z0-9-]+$/.test(artId) || !label || keyswitch === undefined || (keyswitch !== null && !Number.isInteger(keyswitch)) || typeof rawArt.default !== 'boolean') return null;
      articulations.push({ id: artId, label, keyswitch, default: rawArt.default });
    }
    const ids = new Set(articulations.map((art) => art.id));
    const switches = articulations.filter((art) => art.keyswitch !== null).map((art) => art.keyswitch);
    if (ids.size !== articulations.length || new Set(switches).size !== switches.length || articulations.filter((art) => art.default).length > 1) return null;
    if (zones.some((zone) => zone.articulation && !ids.has(zone.articulation))) return null;
  }
  if (zones.some((zone) => zone.articulation) && !articulations?.length) return null;
  const pack: InstrumentPack = {
    format: 'unbox-instrument',
    version: 1,
    id,
    name,
    kind,
    category: str(raw.category) ?? (kind === 'drums' ? 'drums' : 'sampler'),
    description: str(raw.description) ?? '',
    license: { spdx: str(lic.spdx) ?? 'unknown', author: str(lic.author) ?? '', source: str(lic.source) ?? '', notes: str(lic.notes) },
    zones,
    ...(articulations?.length ? { articulations } : {}),
  };
  if (Array.isArray(raw.lanes)) {
    pack.lanes = raw.lanes.flatMap((l) => {
      if (!isObj(l)) return [];
      const n = str(l.name);
      const note = num(l.note, 0, 127);
      return n && note !== undefined ? [{ name: n, note, role: str(l.role) as DrumRole | undefined }] : [];
    });
  }
  const np = num(raw.notePolyphony, 1, 64);
  if (np !== undefined) pack.notePolyphony = np;
  if (raw.oneShot === true) pack.oneShot = true;
  const rel = num(raw.release, 0, 30);
  if (rel !== undefined) pack.release = rel;
  const bytes = num(raw.bytes, 0, Number.MAX_SAFE_INTEGER);
  if (bytes !== undefined) pack.bytes = bytes;
  return pack;
}
