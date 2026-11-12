/**
 * Instrument pack tool — turns real recordings into rack instruments.
 *
 *   npm run instrument -- sfz <program.sfz | github:owner/repo/path/program.sfz> --id <id> --name <name>
 *        --kind drums|melodic --category <cat> --spdx <license> --author <who> [--source <url>]
 *        [--description <text>] [--notes <text>] [--sample-root <relative-path>] [--lanes "Kick=36:kick,Snare=38:snare,…"]
 *        [--remap 35=36,…] [--keys 21-108] [--key-shift -12] [--all-keys] [--all-articulations] [--cc 64=0,…] [--channel 1] [--max-layers N] [--max-rr N]
 *        [--key-step N] [--max-seconds S] [--max-seconds-key 49=5,…] [--tail-db -66] [--release S]
 *        [--note-polyphony N] [--format ogg|flac] [--quality 0-10] [--keep-cache] [--dry-run]
 *   npm run instrument -- recipe <recipe.json> [--dry-run] [--quality N]
 *   npm run instrument -- chop <recording> --out <folder> [--threshold -40] [--gap 0.12] [--pitch] [--prefix hit]
 *   npm run instrument -- list
 *   npm run instrument -- remove <id>
 *
 * Needs ffmpeg + ffprobe on PATH. GitHub downloads go to data/instrument-cache/ and are deleted
 * after a successful build unless --keep-cache.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DrumRole, PackLane } from '../../shared/instruments/types.ts';
import { detectPitch, fadeIn, fadeOut, findHits, slice } from './analyze.ts';
import { buildPack, PACKS_DIR, readIndex, removePack, ROOT, thinKeys, thinLayers, thinRoundRobins, type BuildOptions, type PackMeta } from './pack.ts';
import { checkFfmpeg, decode, writeWav16, type OutFormat } from './pcm.ts';
import { loadRecipe } from './recipe.ts';
import { readSfz } from './sfz.ts';
import { bindFiles, folderSource, githubSource, regionsToDraft } from './sources.ts';

const CACHE = path.join(ROOT, 'data', 'instrument-cache');
const log = (m: string) => console.log(m);

function args(argv: string[]): { pos: string[]; flags: Record<string, string | true> } {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const numFlag = (f: Record<string, string | true>, k: string): number | undefined => {
  const v = f[k];
  if (v === undefined || v === true) return undefined;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`--${k} needs a number`);
  return n;
};
const strFlag = (f: Record<string, string | true>, k: string): string | undefined => (typeof f[k] === 'string' ? (f[k] as string) : undefined);
const pairs = (v: string | undefined): Record<number, number> =>
  Object.fromEntries((v ?? '').split(',').filter(Boolean).map((p) => p.split('=').map(Number) as [number, number]));

function parseLanes(v: string | undefined): PackLane[] | undefined {
  if (!v) return undefined;
  return v.split(',').map((item) => {
    const m = /^\s*(.+?)=(\d+)(?::(\w+))?\s*$/.exec(item);
    if (!m) throw new Error(`lane "${item}": use Name=note[:role]`);
    return { name: m[1], note: Number(m[2]), ...(m[3] ? { role: m[3] as DrumRole } : {}) };
  });
}

function buildOpts(f: Record<string, string | true>): BuildOptions {
  return {
    maxLayers: numFlag(f, 'max-layers'),
    maxRr: numFlag(f, 'max-rr'),
    maxSeconds: numFlag(f, 'max-seconds'),
    maxSecondsByKey: f['max-seconds-key'] ? pairs(strFlag(f, 'max-seconds-key')) : undefined,
    tailDb: numFlag(f, 'tail-db'),
    format: (strFlag(f, 'format') as OutFormat | undefined) ?? 'ogg',
    quality: numFlag(f, 'quality'),
    dryRun: f['dry-run'] === true,
    log,
  };
}

async function cmdSfz(pos: string[], f: Record<string, string | true>): Promise<void> {
  const spec = pos[0];
  if (!spec) throw new Error('sfz: give a .sfz file or github:owner/repo/path.sfz');
  const kind = strFlag(f, 'kind');
  if (kind !== 'drums' && kind !== 'melodic') throw new Error('--kind drums|melodic');
  const id = strFlag(f, 'id');
  const name = strFlag(f, 'name');
  const spdx = strFlag(f, 'spdx');
  const author = strFlag(f, 'author');
  if (!id || !name || !spdx || !author) throw new Error('--id, --name, --spdx and --author are required (credit the recordings)');
  const isGithub = spec.startsWith('github:');
  const src = isGithub ? await githubSource(spec, CACHE, log) : folderSource(spec);

  const cc = pairs(strFlag(f, 'cc'));
  const channel = numFlag(f, 'channel');
  if (channel !== undefined && (!Number.isInteger(channel) || channel < 1 || channel > 16)) {
    throw new Error('--channel must be an integer from 1 to 16');
  }
  const keyShift = numFlag(f, 'key-shift') ?? 0;
  if (!Number.isInteger(keyShift) || Math.abs(keyShift) > 48) throw new Error('--key-shift must be a whole number of semitones, -48 to 48');
  const prog = readSfz(src.program, (rel) => src.read(rel), {
    cc,
    channel,
    keyShift,
    allArticulations: f['all-articulations'] === true,
    liveModWheel: cc[1] === undefined,
  });
  log(`${src.program}: ${prog.regions.length} sounding regions` + (Object.keys(prog.dropped).length ? ` (skipped: ${Object.entries(prog.dropped).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''));
  const keys = strFlag(f, 'keys')?.split('-').map(Number) as [number, number] | undefined;
  const programDir = path.posix.dirname(src.program);
  const o = buildOpts(f);
  let zones = regionsToDraft(prog, { kind, remap: pairs(strFlag(f, 'remap')), keys });
  const sampleRoot = strFlag(f, 'sample-root')?.replace(/\\/g, '/');
  if (sampleRoot) {
    if (path.posix.isAbsolute(sampleRoot) || /^[A-Za-z]:/.test(sampleRoot)) {
      throw new Error('--sample-root must be relative to the SFZ program directory');
    }
    for (const zone of zones) {
      for (const layer of zone.layers) layer.file = path.posix.join(sampleRoot, layer.file);
    }
  }
  const lanes = parseLanes(strFlag(f, 'lanes'));
  // kits: only the keys that have a lane (unless --all-keys), so unused articulations don't cost memory
  if (kind === 'drums' && lanes && f['all-keys'] !== true) zones = zones.filter((z) => lanes.some((l) => l.note >= z.lokey && l.note <= z.hikey));
  if (o.maxLayers) zones = thinLayers(zones, o.maxLayers);
  if (o.maxRr) zones = thinRoundRobins(zones, o.maxRr);
  const keyStep = numFlag(f, 'key-step');
  if (keyStep) zones = thinKeys(zones, keyStep);

  // coverage report: helps choose --lanes / --keys
  const cover = new Map<number, number>();
  for (const z of zones) if (z.layers.length) for (let k = z.lokey; k <= z.hikey; k++) cover.set(k, (cover.get(k) ?? 0) + 1);
  const keysWith = [...cover.keys()].sort((a, b) => a - b);
  log(kind === 'drums' ? `keys: ${keysWith.map((k) => `${k}(${cover.get(k)})`).join(' ')}` : `keys ${keysWith[0]}–${keysWith[keysWith.length - 1]}`);

  const rels = [...new Set(zones.flatMap((z) => z.layers.map((l) => path.posix.join(programDir, l.file))))];
  const size = src.sizeOf(rels);
  log(`needs ${rels.length} recordings${size ? ` (${(size / 1048576).toFixed(0)} MB)` : ''}`);
  const meta: PackMeta = {
    id,
    name,
    kind,
    category: strFlag(f, 'category') ?? (kind === 'drums' ? 'drums' : 'sampler'),
    description: strFlag(f, 'description') ?? '',
    license: { spdx, author, source: strFlag(f, 'source') ?? src.url, ...(strFlag(f, 'notes') ? { notes: strFlag(f, 'notes') } : {}) },
    lanes,
    notePolyphony: numFlag(f, 'note-polyphony') ?? (prog.regions.some((r) => r.notePolyphony) ? Math.min(...prog.regions.flatMap((r) => (r.notePolyphony ? [r.notePolyphony] : []))) : undefined),
    oneShot: kind === 'drums',
    release: kind === 'melodic' ? numFlag(f, 'release') ?? median(zones.map((z) => z.release)) : undefined,
    articulations: f['all-articulations'] === true ? prog.articulations : undefined,
  };
  if (o.dryRun) {
    buildPack(meta, zones, { ...o, maxLayers: undefined, maxRr: undefined });
    return;
  }
  for (const z of zones) for (const l of z.layers) l.file = path.posix.join(programDir, l.file);
  const files = await src.fetch(rels);
  bindFiles(zones, files);
  buildPack(meta, zones, { ...o, maxLayers: undefined, maxRr: undefined });
  if (isGithub && f['keep-cache'] !== true) {
    src.cleanup?.();
    log('  removed downloaded originals for this GitHub source');
  }
}

function median(v: number[]): number {
  const s = v.filter((x) => x > 0).sort((a, b) => a - b);
  return s.length ? +Math.min(4, Math.max(0.05, s[Math.floor(s.length / 2)])).toFixed(3) : 0.3;
}

function cmdChop(pos: string[], f: Record<string, string | true>): void {
  const file = pos[0];
  const out = strFlag(f, 'out');
  if (!file || !out) throw new Error('chop <recording> --out <folder>');
  const pcm = decode(file);
  const hits = findHits(pcm, numFlag(f, 'threshold') ?? -40, numFlag(f, 'gap') ?? 0.12);
  fs.mkdirSync(out, { recursive: true });
  const prefix = strFlag(f, 'prefix') ?? 'hit';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  hits.forEach((h, i) => {
    const part = slice(pcm, h.start, h.end);
    fadeIn(part, 16);
    fadeOut(part, Math.round(pcm.rate * 0.01));
    let tag = '';
    if (f.pitch === true) {
      const p = detectPitch(part);
      if (p) {
        const n = Math.round(p.midi);
        tag = `_${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
      }
    }
    const name = `${prefix}_${String(i + 1).padStart(3, '0')}${tag}.wav`;
    writeWav16(path.join(out, name), part);
    log(`${name}  ${(h.start / pcm.rate).toFixed(2)}s  ${((h.end - h.start) / pcm.rate).toFixed(2)}s`);
  });
  log(`${hits.length} hits → ${out}`);
}

function cmdList(): void {
  const idx = readIndex();
  if (!idx.packs.length) return log('no instrument packs yet (public/instruments)');
  for (const p of idx.packs) log(`${p.id.padEnd(24)} ${p.kind.padEnd(8)} ${(p.bytes / 1048576).toFixed(1).padStart(6)} MB  ${p.name} — ${p.author} (${p.spdx})`);
  log(`folder: ${PACKS_DIR}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = args(rest);
  if (cmd === 'list') return cmdList();
  if (cmd === 'remove') {
    if (!pos[0]) throw new Error('remove <id>');
    log(removePack(pos[0]) ? `removed ${pos[0]} (projects using it will miss that device)` : `no pack ${pos[0]}`);
    return;
  }
  checkFfmpeg();
  if (cmd === 'sfz') return cmdSfz(pos, flags);
  if (cmd === 'chop') return cmdChop(pos, flags);
  if (cmd === 'recipe') {
    if (!pos[0]) throw new Error('recipe <recipe.json>');
    const { meta, zones, opts } = loadRecipe(pos[0], log);
    const o = buildOpts(flags);
    buildPack(meta, zones, { ...opts, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)), log });
    return;
  }
  log('usage: npm run instrument -- sfz|recipe|chop|list|remove …  (see scripts/instruments/cli.ts)');
  process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
