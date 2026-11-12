import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_SCHEMA_VERSION, type ManifestItem, type VstManifest } from '../../shared/vst/manifestTypes.ts';
import { APP_LIBRARY_FILE, bundleAppLibrary, readAppLibrary } from './appLibrary.ts';
import { scanLibrary, type ScanProgress } from './scanner.ts';

export interface LibraryConfig {
  roots: string[];
  /** Raw scan output (absolute paths, machine-specific). */
  manifestPath: string;
  /** Writable in-app library bundle (library.json + audio/), served at /library. */
  bundleDir: string;
  /** Read-only bundle shipped with the build (dist/library), used when bundleDir has none. */
  bundleFallbackDir?: string;
  /** Serve /api/vst to non-loopback clients (off by default). */
  allowRemote: boolean;
}

export function libraryConfigFromEnv(baseDir: string, bundleDir?: string): LibraryConfig {
  const roots = (process.env.VST_LIBRARY_ROOTS || 'D:\\vsr')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    roots,
    manifestPath: path.resolve(baseDir, process.env.VST_MANIFEST_PATH || path.join('data', 'vsr-manifest.json')),
    bundleDir: bundleDir ?? path.resolve(baseDir, 'public', 'library'),
    allowRemote: process.env.VST_LIBRARY_ALLOW_REMOTE === '1',
  };
}

/**
 * The app runs from the in-app bundle. A scan of the library roots (only needed to refresh it)
 * writes the raw manifest and rebuilds the bundle; nothing else touches the roots.
 */
export class ManifestStore {
  private cache: { manifest: VstManifest; key: string; byId: Map<string, ManifestItem> } | null = null;
  private scanning: Promise<VstManifest> | null = null;
  public progress: ScanProgress | null = null;

  public readonly config: LibraryConfig;

  constructor(config: LibraryConfig) {
    this.config = config;
  }

  get isScanning(): boolean {
    return this.scanning !== null;
  }

  /** Folder the current bundle is read from (writable one first). */
  get activeBundleDir(): string | null {
    const dirs = [this.config.bundleDir, this.config.bundleFallbackDir].filter((d): d is string => !!d);
    return dirs.find((d) => existsSync(path.join(d, APP_LIBRARY_FILE))) ?? null;
  }

  /** True when at least one library root exists on this computer (a rescan can run). */
  get rootsAvailable(): boolean {
    return this.config.roots.some((r) => existsSync(r));
  }

  async get(): Promise<VstManifest | null> {
    let dir = this.activeBundleDir;
    // First run after an older scan: build the bundle from the raw manifest once.
    if (!dir) {
      const raw = await this.readRaw();
      if (!raw) return null;
      await bundleAppLibrary(raw, this.config.bundleDir);
      dir = this.config.bundleDir;
    }
    const file = path.join(dir, APP_LIBRARY_FILE);
    const key = `${file}@${(await stat(file)).mtimeMs}`;
    if (this.cache && this.cache.key === key) return this.cache.manifest;
    const manifest = await readAppLibrary(dir);
    if (manifest) this.remember(manifest, key);
    return manifest;
  }

  async item(id: string): Promise<ManifestItem | undefined> {
    await this.get();
    return this.cache?.byId.get(id);
  }

  rescan(onProgress?: (p: ScanProgress) => void): Promise<VstManifest> {
    if (this.scanning) return this.scanning;
    this.scanning = (async () => {
      try {
        if (!this.rootsAvailable) throw new Error(`No library folder found (${this.config.roots.join(', ')}). The in-app library keeps working.`);
        const manifest = await scanLibrary({
          roots: this.config.roots,
          onProgress: (p) => {
            this.progress = p;
            onProgress?.(p);
          },
        });
        const file = this.config.manifestPath;
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(manifest, null, 2), 'utf8');
        await rename(`${file}.tmp`, file);
        await bundleAppLibrary(manifest, this.config.bundleDir);
        const bundled = await this.get();
        if (!bundled) throw new Error('The in-app library could not be written.');
        return bundled;
      } finally {
        this.scanning = null;
        this.progress = null;
      }
    })();
    return this.scanning;
  }

  /** Raw scan output, or null. */
  async readRaw(): Promise<VstManifest | null> {
    try {
      const parsed = JSON.parse(await readFile(this.config.manifestPath, 'utf8')) as VstManifest;
      return parsed && parsed.schemaVersion === MANIFEST_SCHEMA_VERSION && Array.isArray(parsed.items) ? parsed : null;
    } catch {
      return null;
    }
  }

  private remember(manifest: VstManifest, key: string): void {
    this.cache = { manifest, key, byId: new Map(manifest.items.map((i) => [i.id, i])) };
  }
}
