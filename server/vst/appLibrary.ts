/**
 * In-app library bundle: a copy of the scanned manifest that the app uses at runtime, so nothing
 * needs D:\vsr (or any other external folder) once it has been built.
 *
 *  - Only music content is kept: plugins, instruments, presets, samples, sample packs.
 *    Documents, installers and archives are left out.
 *  - Absolute paths are removed; every playable sample is copied next to the JSON
 *    (`audio/<id>.<ext>`) and referenced by a relative URL (`item.file`).
 *
 * Reading the library root is read-only (copyFile only reads the source).
 */
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MANIFEST_SCHEMA_VERSION,
  type ItemKind,
  type ManifestItem,
  type Product,
  type VstManifest,
} from '../../shared/vst/manifestTypes.ts';

export const APP_LIBRARY_KINDS: ItemKind[] = ['plugin', 'instrument', 'preset', 'sample', 'sample-pack'];
export const APP_LIBRARY_FILE = 'library.json';
/** URL prefix the browser loads bundled files from (the bundle folder is served at /library). */
const URL_PREFIX = 'library';
/** Folder-name noise that is not useful as a search tag. */
const TAG_STOPLIST = new Set(['rutracker', 'org', 'deepstatus', 'uget', 'ateam', 'activated', 'pre', 'temp', 'extracted', 'win']);

export interface BundleResult {
  items: number;
  audioFiles: number;
  audioBytes: number;
  skipped: string[];
}

function sanitize(item: ManifestItem): ManifestItem {
  const tags = item.tags.filter((t) => !TAG_STOPLIST.has(t));
  const base = { ...item, path: '', relPath: '', root: '', tags };
  return base.kind === 'plugin' ? { ...base, binaryPath: '' } : base;
}

/** Writes `<outDir>/library.json` and `<outDir>/audio/*` from a scanned manifest. */
export async function bundleAppLibrary(manifest: VstManifest, outDir: string): Promise<BundleResult> {
  const audioDir = path.join(outDir, 'audio');
  await mkdir(audioDir, { recursive: true });
  const keep = manifest.items.filter((i) => APP_LIBRARY_KINDS.includes(i.kind));
  const keepIds = new Set(keep.map((i) => i.id));
  const skipped: string[] = [];
  const wanted = new Set<string>();
  let audioFiles = 0;
  let audioBytes = 0;

  const items: ManifestItem[] = [];
  for (const raw of keep) {
    const item = sanitize(raw);
    if (item.kind === 'sample' && raw.kind === 'sample' && raw.playable) {
      const ext = (raw.format || path.extname(raw.path).slice(1) || 'bin').toLowerCase();
      const name = `${raw.id}.${ext}`;
      const dest = path.join(audioDir, name);
      try {
        const src = await stat(raw.path);
        const have = await stat(dest).catch(() => null);
        if (!have || have.size !== src.size) {
          await copyFile(raw.path, `${dest}.tmp`);
          await rename(`${dest}.tmp`, dest);
        }
        wanted.add(name);
        audioFiles++;
        audioBytes += src.size;
        items.push({ ...item, kind: 'sample', file: `${URL_PREFIX}/audio/${name}` } as ManifestItem);
        continue;
      } catch {
        // Source missing (library unplugged): keep the existing bundled copy if there is one.
        const have = await stat(dest).catch(() => null);
        if (have) {
          wanted.add(name);
          audioFiles++;
          audioBytes += have.size;
          items.push({ ...item, kind: 'sample', file: `${URL_PREFIX}/audio/${name}` } as ManifestItem);
          continue;
        }
        skipped.push(raw.name);
        items.push({ ...item, playable: false } as ManifestItem);
        continue;
      }
    }
    items.push(item);
  }

  // Remove bundled audio that is no longer in the library.
  for (const f of await readdir(audioDir)) {
    if (!wanted.has(f)) await unlink(path.join(audioDir, f)).catch(() => undefined);
  }

  const products: Product[] = manifest.products
    .map((p) => ({
      ...p,
      folder: '',
      kinds: p.kinds.filter((k) => APP_LIBRARY_KINDS.includes(k)),
      itemIds: p.itemIds.filter((id) => keepIds.has(id)),
      sizeBytes: p.itemIds.reduce((n, id) => n + (keep.find((i) => i.id === id)?.sizeBytes ?? 0), 0),
    }))
    .filter((p) => p.itemIds.length > 0);

  const stats = { ...manifest.stats, installer: 0, archive: 0, document: 0 };
  const bundle: VstManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'bundled',
    roots: [],
    scan: { ...manifest.scan, issues: [] },
    stats,
    products,
    items,
  };
  const file = path.join(outDir, APP_LIBRARY_FILE);
  await writeFile(`${file}.tmp`, JSON.stringify(bundle), 'utf8');
  await rename(`${file}.tmp`, file);
  return { items: items.length, audioFiles, audioBytes, skipped };
}

/** Reads a bundle written by bundleAppLibrary (null when missing or invalid). */
export async function readAppLibrary(dir: string): Promise<VstManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(dir, APP_LIBRARY_FILE), 'utf8')) as VstManifest;
    return parsed && parsed.schemaVersion === MANIFEST_SCHEMA_VERSION && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}
