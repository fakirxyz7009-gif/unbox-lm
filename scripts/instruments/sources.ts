/**
 * Sources for the instrument converter.
 *  - SFZ programs on GitHub (`github:owner/repo[@ref]/path/program.sfz`, e.g. the
 *    sfzinstruments.github.io libraries): mirrors the .sfz text files first, then downloads only
 *    the samples the converted instrument uses, into a cache folder.
 *  - SFZ programs on disk.
 * Both turn the flat SFZ regions into draft zones (mic layers of the same hit merged).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DraftZone, Layer } from './pack.ts';
import { probeRate, wavLoop } from './pcm.ts';
import type { FlatRegion, SfzProgram } from './sfz.ts';

export interface SfzSource {
  /** Root program, relative to the repo / folder. */
  program: string;
  /** Text of a file relative to the repo / folder root (null if missing). */
  read(rel: string): string | null;
  /** Makes the given repo-relative files available on disk; returns rel → absolute path. */
  fetch(rels: string[]): Promise<Map<string, string>>;
  /** Total download size of the given files, if known. */
  sizeOf(rels: string[]): number | null;
  /** Repo / folder URL for credits. */
  url: string;
  /** Remove this source's downloaded cache without affecting other sources. */
  cleanup?(): void;
}

export async function githubSource(spec: string, cacheRoot: string, log: (m: string) => void): Promise<SfzSource> {
  const m = /^github:([\w.-]+)\/([\w.-]+)(?:@([\w.\-/]+?))?\/(.+\.sfz)$/i.exec(spec);
  if (!m) throw new Error('expected github:owner/repo[@ref]/path/to/program.sfz');
  const [, owner, repo, ref = 'HEAD', program] = m;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, { headers: { 'User-Agent': 'unbox-studio-instrument-tool' } });
  if (!res.ok) throw new Error(`GitHub tree ${owner}/${repo}: HTTP ${res.status}`);
  const tree = (await res.json()) as { tree?: { path: string; type: string; size?: number }[]; truncated?: boolean };
  const blobs = new Map<string, { path: string; size: number }>();
  for (const t of tree.tree ?? []) if (t.type === 'blob') blobs.set(t.path.toLowerCase(), { path: t.path, size: t.size ?? 0 });
  if (tree.truncated) log('  (GitHub listing truncated — some files may be missing)');
  const base = path.join(cacheRoot, `${owner}.${repo}`);
  const local = (repoPath: string) => path.join(base, ...repoPath.split('/'));
  const raw = (repoPath: string) => `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${repoPath.split('/').map(encodeURIComponent).join('/')}`;

  async function download(repoPath: string): Promise<string> {
    const dst = local(repoPath);
    const size = blobs.get(repoPath.toLowerCase())?.size;
    if (fs.existsSync(dst) && (size === undefined || fs.statSync(dst).size === size)) return dst;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(raw(repoPath));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
        return dst;
      } catch (e) {
        if (attempt >= 3) throw new Error(`download ${repoPath}: ${(e as Error).message}`);
      }
    }
  }
  async function many(paths: string[], label: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < paths.length) {
        const p = paths[next++];
        out.set(p, await download(p));
        if (++done % 50 === 0 || done === paths.length) log(`  ${label} ${done}/${paths.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, paths.length) }, worker));
    return out;
  }

  const sfzFiles = [...blobs.values()].filter((b) => b.path.toLowerCase().endsWith('.sfz')).map((b) => b.path);
  await many(sfzFiles, 'SFZ files');
  const resolve = (rel: string) => blobs.get(path.posix.normalize(rel).toLowerCase())?.path ?? null;
  return {
    program,
    url: `https://github.com/${owner}/${repo}`,
    read(rel) {
      const p = resolve(rel);
      return p && fs.existsSync(local(p)) ? fs.readFileSync(local(p), 'utf8') : null;
    },
    async fetch(rels) {
      const real = rels.map((r) => {
        const p = resolve(r);
        if (!p) throw new Error(`sample not in repository: ${r}`);
        return [r, p] as const;
      });
      const got = await many([...new Set(real.map(([, p]) => p))], 'samples');
      return new Map(real.map(([r, p]) => [r, got.get(p)!]));
    },
    sizeOf(rels) {
      return rels.reduce((s, r) => s + (blobs.get(path.posix.normalize(r).toLowerCase())?.size ?? 0), 0);
    },
    cleanup() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

export function folderSource(programFile: string): SfzSource {
  const abs = path.resolve(programFile);
  const root = path.dirname(abs).replace(/\\/g, '/');
  // Samples are read from inside the program's folder only; a '..' or absolute path would read other files.
  const full = (rel: string) => {
    const file = path.posix.join(root, rel);
    if (!file.startsWith(`${root}/`)) throw new Error(`sample outside the instrument folder: ${rel}`);
    return file;
  };
  return {
    program: path.basename(abs),
    url: root,
    read: (rel) => (fs.existsSync(full(rel)) ? fs.readFileSync(full(rel), 'utf8') : null),
    async fetch(rels) {
      const missing = rels.filter((r) => !fs.existsSync(full(r)));
      if (missing.length) throw new Error(`missing samples: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`);
      return new Map(rels.map((r) => [r, full(r)]));
    },
    sizeOf: (rels) => rels.reduce((s, r) => s + (fs.existsSync(full(r)) ? fs.statSync(full(r)).size : 0), 0),
  };
}

// ---------------------------------------------------------------- SFZ regions → draft zones

export interface DraftOptions {
  kind: 'drums' | 'melodic';
  /** Drums: move single-key zones (e.g. 35 → 36). */
  remap?: Record<number, number>;
  keys?: [number, number];
}

/** Draft zones whose layer `file` is the sample path relative to the program's folder (fetch later). */
export function regionsToDraft(prog: SfzProgram, o: DraftOptions): DraftZone[] {
  const groups = new Map<string, FlatRegion[]>();
  prog.regions.forEach((r, i) => {
    const looping = r.loopMode === 'loop_continuous' || r.loopMode === 'loop_sustain';
    const root = r.keytrack === 0 || (o.kind === 'drums' && r.lokey === r.hikey) ? null : r.keycenter;
    const sig = [r.trigger, r.articulationId ?? '', r.swDown ?? '', r.swUp ?? '', r.swPrevious ?? '', r.lokey, r.hikey, r.lovel, r.hivel, r.velocityFadeIn?.join('-') ?? '', r.velocityFadeOut?.join('-') ?? '', r.velocityFadeCurve, JSON.stringify(r.modWheelFade), r.seqLength, r.seqPosition, r.lorand, r.hirand, root, Math.round(r.tune), looping ? `loop${i}` : ''].join('|');
    (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(r);
  });
  const zones: DraftZone[] = [];
  for (const list of groups.values()) {
    const r0 = list[0];
    let lokey = r0.lokey;
    let hikey = r0.hikey;
    let root = r0.keytrack === 0 || (o.kind === 'drums' && r0.lokey === r0.hikey) ? null : r0.keycenter;
    if (o.remap && lokey === hikey && o.remap[lokey] !== undefined) {
      const remappedKey = o.remap[lokey];
      if (root !== null) root += remappedKey - lokey;
      lokey = hikey = remappedKey;
    }
    if (o.keys) {
      if (hikey < o.keys[0] || lokey > o.keys[1]) continue;
      lokey = Math.max(lokey, o.keys[0]);
      hikey = Math.min(hikey, o.keys[1]);
    }
    const sounding = list.filter((r) => r.sample);
    const layers: Layer[] = sounding.map((r) => ({
      file: r.sample,
      gain: r.gain,
      pan: r.pan / 100,
      offsetSec: r.offset, // frames for now; converted once the file's rate is known
      endSec: r.end,
      reverse: r.reverse,
      filters: r.filters,
      eqs: r.eqs,
      env: r.ampeg.sustain < 0.999 ? { hold: r.ampeg.attack + r.ampeg.hold, decay: r.ampeg.decay, sustain: r.ampeg.sustain } : null,
    }));
    const velCurve = list.find((r) => r.velCurve)?.velCurve ?? (list.every((r) => r.ampVeltrack === 0) ? ([[1, 1], [127, 1]] as [number, number][]) : undefined);
    const looping = r0.loopMode === 'loop_continuous' || r0.loopMode === 'loop_sustain';
    zones.push({
      layers,
      lokey,
      hikey,
      root,
      lovel: r0.lovel,
      hivel: r0.hivel,
      ...(r0.seqLength > 1 ? { seq: r0.seqPosition, seqLength: r0.seqLength } : {}),
      ...(r0.lorand > 0 || r0.hirand < 1 ? { lorand: r0.lorand, hirand: r0.hirand } : {}),
      tune: r0.tune,
      groups: [...new Set(list.map((r) => r.group).filter((g): g is number => !!g))],
      // a silent region's own off_by only silences the silence, so only sounding regions count
      offBy: [...new Set(sounding.map((r) => r.offBy).filter((g): g is number => !!g))],
      attack: Math.max(...list.map((r) => r.ampeg.attack)),
      release: Math.max(...list.map((r) => r.ampeg.release)),
      velCurve,
      ...(r0.velocityFadeIn ? { velocityFadeIn: r0.velocityFadeIn } : {}),
      ...(r0.velocityFadeOut ? { velocityFadeOut: r0.velocityFadeOut } : {}),
      ...(r0.velocityFadeIn || r0.velocityFadeOut ? { velocityFadeCurve: r0.velocityFadeCurve } : {}),
      ...(r0.modWheelFade ? { modWheelFade: r0.modWheelFade } : {}),
      ...(r0.trigger === 'release' ? { trigger: 'release' as const } : {}),
      ...(r0.articulationId ? { articulation: r0.articulationId } : {}),
      ...(r0.swDown !== undefined ? { swDown: r0.swDown } : {}),
      ...(r0.swUp !== undefined ? { swUp: r0.swUp } : {}),
      ...(r0.swPrevious !== undefined ? { swPrevious: r0.swPrevious } : {}),
      ...(looping && sounding.length === 1 ? { loop: 'auto' as const } : {}),
    });
    // keep the SFZ's own loop points when it has them (resolved after download)
    if (looping && sounding.length === 1 && r0.loopStart !== null && r0.loopEnd !== null) {
      (zones[zones.length - 1] as DraftZone & { sfzLoop?: [number, number] }).sfzLoop = [r0.loopStart, r0.loopEnd];
    }
  }
  return zones;
}

/** Swaps relative sample paths for downloaded files and converts frame offsets / loops to seconds. */
export function bindFiles(zones: DraftZone[], files: Map<string, string>): void {
  const rates = new Map<string, number>();
  const rateOf = (f: string) => rates.get(f) ?? (rates.set(f, probeRate(f)), rates.get(f)!);
  for (const z of zones) {
    for (const l of z.layers) {
      const abs = files.get(l.file);
      if (!abs) throw new Error(`no file for ${l.file}`);
      l.file = abs;
      if (l.offsetSec > 0 || l.endSec !== null) {
        const rate = rateOf(abs);
        l.offsetSec /= rate;
        if (l.endSec !== null) l.endSec /= rate;
      }
    }
    const zl = z as DraftZone & { sfzLoop?: [number, number] };
    if (z.loop === 'auto' && z.layers.length === 1) {
      const l = z.layers[0];
      const pts = zl.sfzLoop ?? wavLoop(l.file);
      if (pts) {
        const rate = rateOf(l.file);
        z.loop = [pts[0] / rate - l.offsetSec, pts[1] / rate - l.offsetSec];
      }
    }
    delete zl.sfzLoop;
  }
}
