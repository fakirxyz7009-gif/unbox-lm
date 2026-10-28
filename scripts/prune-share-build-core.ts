/** Share build pruning kept callable so the exact filesystem behavior can be tested in isolation. */
import fs from 'node:fs';
import path from 'node:path';
import { isRedistributable, redistributablePacks } from '../shared/instruments/catalogTypes.ts';

interface PackIndex {
  packs: { id: string; name: string; spdx: string }[];
}

export interface SharePruneResult {
  dropped: { id: string; name: string }[];
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function safeChild(root: string, target: string): string {
  const within = (base: string, file: string) => {
    const relative = path.relative(base, file);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const absolute = path.resolve(target);
  if (!within(path.resolve(root), absolute)) throw new Error(`Path is outside the share build: ${target}`);
  if (fs.lstatSync(absolute, { throwIfNoEntry: false })) {
    if (!within(fs.realpathSync(root), fs.realpathSync(absolute))) throw new Error(`Resolved path is outside the share build: ${target}`);
  }
  return absolute;
}

function readIndex(file: string): PackIndex & Record<string, unknown> {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isObject(raw) || !Array.isArray(raw.packs)) throw new Error('Share instrument index must contain a packs array');
  const seen = new Set<string>();
  const packs = raw.packs.map((entry: unknown) => {
    if (!isObject(entry) || typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id) || seen.has(entry.id)) {
      throw new Error('Invalid or duplicate instrument pack id in share index');
    }
    if (typeof entry.name !== 'string' || typeof entry.spdx !== 'string') throw new Error(`Invalid share metadata for ${entry.id}`);
    seen.add(entry.id);
    return entry as PackIndex['packs'][number];
  });
  return { ...raw, packs };
}

export function pruneShareBuild(distRoot: string): SharePruneResult {
  const dist = path.resolve(distRoot);
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Share build entry page is missing — run `vite build --mode share` first');
  safeChild(dist, path.join(dist, 'index.html'));
  const instruments = path.join(dist, 'instruments');
  const indexPath = path.join(instruments, 'index.json');
  if (!fs.existsSync(indexPath)) throw new Error('dist/instruments/index.json is missing — run `vite build --mode share` first');
  safeChild(dist, instruments);
  safeChild(instruments, indexPath);
  const index = readIndex(indexPath);
  const dropped = index.packs.filter((pack) => !isRedistributable(pack.spdx));
  const removals = [
    safeChild(dist, path.join(dist, 'library')),
    safeChild(dist, path.join(dist, 'stems')),
    ...dropped.map((pack) => safeChild(instruments, path.join(instruments, pack.id))),
  ];
  const creditsPath = safeChild(instruments, path.join(instruments, 'CREDITS.md'));
  // Validate every mutation target before deleting anything, including junction destinations.
  for (const target of removals) fs.rmSync(target, { recursive: true, force: true });
  index.packs = redistributablePacks(index.packs);
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  if (fs.existsSync(creditsPath)) {
    const names = new Set(dropped.map((pack) => pack.name));
    const parts = fs.readFileSync(creditsPath, 'utf8').split(/(?=^## )/m);
    fs.writeFileSync(creditsPath, parts.filter((part) => !(part.startsWith('## ') && names.has(part.slice(3).split('\n')[0].trim()))).join(''));
  }

  return { dropped: dropped.map(({ id, name }) => ({ id, name })) };
}
