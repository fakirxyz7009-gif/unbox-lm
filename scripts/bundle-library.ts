/**
 * Build the in-app library (public/library) from the last scan (data/vsr-manifest.json):
 * music items only, no absolute paths, playable audio copied in. After this the app needs no
 * external folder; `npm run build` ships it in dist/library.
 *   npm run bundle:library            (scans first when there is no scan yet)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { bundleAppLibrary } from '../server/vst/appLibrary.ts';
import { ManifestStore, libraryConfigFromEnv } from '../server/vst/manifestStore.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const config = libraryConfigFromEnv(projectRoot);
const store = new ManifestStore(config);
let raw = await store.readRaw();
if (!raw) {
  if (!store.rootsAvailable) {
    console.error(`No scan found and no library folder (${config.roots.join(', ')}) to scan.`);
    process.exit(1);
  }
  console.log('No scan yet — scanning (read-only)…');
  await store.rescan();
  raw = await store.readRaw();
}
if (!raw) throw new Error('Scan failed');
const r = await bundleAppLibrary(raw, config.bundleDir);
console.log(`In-app library: ${r.items} items, ${r.audioFiles} audio files (${(r.audioBytes / 1e6).toFixed(1)} MB) → ${config.bundleDir}`);
if (r.skipped.length) console.log(`Not copied (source missing): ${r.skipped.join(', ')}`);
