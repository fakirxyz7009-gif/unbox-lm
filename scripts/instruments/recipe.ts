/**
 * Recipes: a JSON file describing an instrument made from a folder of recordings (your own
 * hits / notes, downloads, chopped takes). Paths are relative to the recipe file.
 *
 * {
 *   "id": "my-kit", "name": "My Kit", "kind": "drums", "category": "drums",
 *   "description": "…", "license": { "spdx": "CC0-1.0", "author": "Me", "source": "own recordings" },
 *   "lanes": [                                   // drums: one lane per sound
 *     { "name": "Kick", "note": 36, "role": "kick", "samples": ["kick1.wav", "kick2.wav"] },   // several = round robins
 *     { "name": "Closed Hat", "note": 42, "role": "hatC", "choke": 1,
 *       "samples": [{ "file": "hat_soft.wav", "vel": [1, 70] }, { "file": "hat_hard.wav", "vel": [71, 127] }] }
 *   ],
 *   "notes": "notes/*.wav",                       // melodic: a glob, or a list of { file, root?, vel?, gain? }
 *   "keyRange": [24, 84],                          // optional playable MIDI range
 *   "loop": "auto",                               // sustained sounds: find seamless loops
 *   "oneShot": true,                              // melodic mallets: let strikes ring after key-up
 *   "length": 4,                                  // use only the first 4 s of each file (before looping)
 *   "dir": "../recordings"                        // where the files are, relative to the recipe (default: its folder)
 * }
 * A note's root comes from "root", else a note name in the file name (C3, F#2, Bb4), else pitch
 * detection. Leading silence is skipped unless "trimStart": false.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PackLane, PackLicense, DrumRole } from '../../shared/instruments/types.ts';
import { detectPitch, peakOf } from './analyze.ts';
import type { BuildOptions, DraftZone, Layer, PackMeta } from './pack.ts';
import { decode } from './pcm.ts';
import { parseKey } from './sfz.ts';

interface RecipeSample {
  file: string;
  vel?: [number, number];
  /** dB */
  gain?: number;
  /** Seconds into the file. */
  start?: number;
  end?: number;
  root?: string | number;
}

interface RecipeLane {
  name: string;
  note: number;
  role?: DrumRole;
  choke?: number;
  samples: (string | RecipeSample)[];
}

export interface Recipe {
  id: string;
  name: string;
  kind: 'drums' | 'melodic';
  category?: string;
  description?: string;
  license: PackLicense;
  lanes?: RecipeLane[];
  notes?: string | (string | RecipeSample)[];
  loop?: 'auto' | false;
  /** Let percussive melodic recordings ring to their natural end after key-up. */
  oneShot?: boolean;
  /** Folder of the recordings, relative to the recipe file. */
  dir?: string;
  keyRange?: [number, number];
  /** Seconds of each file to use (sustained notes get looped inside this). */
  length?: number;
  trimStart?: boolean;
  release?: number;
  notePolyphony?: number;
  maxSeconds?: number;
  quality?: number;
}

const NOTE_IN_NAME = /(?:^|[^A-Za-z])([A-Ga-g])(#|b|s|♯|♭)?(-?[0-8])(?![0-9])/g;

/** Last note name in a file name (Harmonium-G#3.wav → 56), or null. */
export function noteFromName(file: string): number | null {
  const base = path.basename(file, path.extname(file));
  let last: number | null = null;
  for (const m of base.matchAll(NOTE_IN_NAME)) last = parseKey(`${m[1]}${m[2] === 's' ? '#' : m[2] ?? ''}${m[3]}`);
  return last;
}

function glob(dir: string, pattern: string): string[] {
  const rel = pattern.replace(/\\/g, '/');
  const folder = path.join(dir, path.posix.dirname(rel));
  const re = new RegExp(`^${path.posix.basename(rel).replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => re.test(f)).sort().map((f) => path.join(folder, f)) : [];
}

/** Seconds of silence before the first sound (−45 dB under the file's peak, minus 3 ms). */
function leadingSilence(file: string): number {
  const p = decode(file);
  const floor = peakOf(p) * Math.pow(10, -45 / 20);
  for (let i = 0; i < p.frames; i++) {
    if (Math.abs(p.data[i * 2]) > floor || Math.abs(p.data[i * 2 + 1]) > floor) return Math.max(0, i / p.rate - 0.003);
  }
  return 0;
}

const asSample = (s: string | RecipeSample): RecipeSample => (typeof s === 'string' ? { file: s } : s);

export function loadRecipe(file: string, log: (m: string) => void): { meta: PackMeta; zones: DraftZone[]; opts: BuildOptions } {
  const r = JSON.parse(fs.readFileSync(file, 'utf8')) as Recipe;
  const dir = path.resolve(path.dirname(path.resolve(file)), r.dir ?? '.');
  if (!r.id || !r.name || (r.kind !== 'drums' && r.kind !== 'melodic') || !r.license?.spdx) throw new Error('recipe needs id, name, kind (drums|melodic) and license.spdx');
  if (r.oneShot !== undefined && typeof r.oneShot !== 'boolean') throw new Error('oneShot must be a boolean');
  if (r.keyRange && (!Number.isInteger(r.keyRange[0]) || !Number.isInteger(r.keyRange[1]) || r.keyRange[0] < 0 || r.keyRange[1] > 127 || r.keyRange[0] > r.keyRange[1])) {
    throw new Error('keyRange must be an ordered pair of MIDI notes from 0 to 127');
  }
  const trim = r.trimStart !== false;
  const layer = (s: RecipeSample): Layer => {
    const abs = path.resolve(dir, s.file);
    if (!fs.existsSync(abs)) throw new Error(`missing file: ${s.file}`);
    const offsetSec = s.start ?? (trim ? leadingSilence(abs) : 0);
    return {
      file: abs,
      gain: Math.pow(10, (s.gain ?? 0) / 20),
      pan: 0,
      offsetSec,
      endSec: s.end ?? (r.length ? offsetSec + r.length : null),
      reverse: false,
      filters: [],
      eqs: [],
      env: null,
    };
  };
  const zones: DraftZone[] = [];
  const base = { tune: 0, groups: [] as number[], offBy: [] as number[], attack: 0, release: r.release ?? 0.3 };

  for (const lane of r.lanes ?? []) {
    const byVel = new Map<string, RecipeSample[]>();
    for (const s of lane.samples.map(asSample)) {
      const k = (s.vel ?? [1, 127]).join('-');
      (byVel.get(k) ?? byVel.set(k, []).get(k)!).push(s);
    }
    for (const [k, list] of byVel) {
      const [lovel, hivel] = k.split('-').map(Number);
      list.forEach((s, i) =>
        zones.push({
          ...base,
          layers: [layer(s)],
          lokey: lane.note,
          hikey: lane.note,
          root: null,
          lovel,
          hivel,
          ...(list.length > 1 ? { seq: i + 1, seqLength: list.length } : {}),
          groups: lane.choke ? [lane.choke] : [],
          offBy: lane.choke ? [lane.choke] : [],
        })
      );
    }
  }

  if (r.notes) {
    const list: RecipeSample[] = typeof r.notes === 'string' ? glob(dir, r.notes).map((f) => ({ file: path.relative(dir, f) })) : r.notes.map(asSample);
    const notes = list.map((s) => {
      let root = s.root !== undefined ? parseKey(String(s.root)) : noteFromName(s.file);
      let how = s.root !== undefined ? 'given' : 'file name';
      if (root === null) {
        const pitch = detectPitch(decode(path.resolve(dir, s.file)));
        if (!pitch) throw new Error(`no clear pitch in ${s.file}: give it a "root"`);
        root = Math.round(pitch.midi);
        how = `detected ${pitch.midi.toFixed(2)}`;
      }
      log(`  ${s.file} → note ${root} (${how})`);
      return { s, root };
    });
    const byVel = new Map<string, typeof notes>();
    for (const n of notes) {
      const k = (n.s.vel ?? [1, 127]).join('-');
      (byVel.get(k) ?? byVel.set(k, []).get(k)!).push(n);
    }
    for (const [k, list] of byVel) {
      const [lovel, hivel] = k.split('-').map(Number);
      const roots = [...new Set(list.map((n) => n.root))].sort((a, b) => a - b);
      roots.forEach((root, i) => {
        const lokey = i === 0 ? 0 : Math.floor((roots[i - 1] + root) / 2) + 1;
        const hikey = i === roots.length - 1 ? 127 : Math.floor((root + roots[i + 1]) / 2);
        const takes = list.filter((n) => n.root === root);
        takes.forEach((n, j) =>
          zones.push({
            ...base,
            layers: [layer(n.s)],
            lokey,
            hikey,
            root,
            lovel,
            hivel,
            ...(takes.length > 1 ? { seq: j + 1, seqLength: takes.length } : {}),
            ...(r.loop === 'auto' ? { loop: 'auto' as const } : {}),
          })
        );
      });
    }
  }
  if (r.keyRange) {
    const [low, high] = r.keyRange;
    const clipped = zones.flatMap((z) => {
      const lokey = Math.max(low, z.lokey);
      const hikey = Math.min(high, z.hikey);
      return lokey <= hikey ? [{ ...z, lokey, hikey }] : [];
    });
    zones.splice(0, zones.length, ...clipped);
  }
  if (!zones.length) throw new Error('recipe has no lanes or notes');

  const lanes: PackLane[] | undefined = r.lanes?.map((l) => ({ name: l.name, note: l.note, ...(l.role ? { role: l.role } : {}) }));
  const meta: PackMeta = {
    id: r.id,
    name: r.name,
    kind: r.kind,
    category: r.category ?? (r.kind === 'drums' ? 'drums' : 'sampler'),
    description: r.description ?? '',
    license: r.license,
    lanes,
    notePolyphony: r.notePolyphony,
    oneShot: r.oneShot ?? (r.kind === 'drums'),
    release: r.kind === 'melodic' ? r.release ?? 0.3 : undefined,
  };
  return { meta, zones, opts: { maxSeconds: r.maxSeconds, quality: r.quality } };
}
