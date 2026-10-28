/**
 * Shareable build, step 2 (after `vite build --mode share`): removes from dist/ what must not be
 * given to other people — the in-app library made from your own plugin folder, the song stems and
 * playable patches in public/stems (separated from recordings you may not pass on), and every
 * instrument pack whose license is not redistributable (CC0 / CC-BY) — and rewrites the pack index
 * and the credits to match. Your own build (`npm run dist:win`) rebuilds dist/ with everything.
 */
import path from 'node:path';
import { pruneShareBuild } from './prune-share-build-core.ts';

const target = path.resolve(process.argv[2] || 'dist');
const { dropped } = pruneShareBuild(target);

console.log(`Shareable build: pruned ${target}; removed the in-app library, stems and ${dropped.length} pack(s) not licensed for sharing${dropped.length ? `: ${dropped.map((p) => p.name).join(', ')}` : ''}.`);
