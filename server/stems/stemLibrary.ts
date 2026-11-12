/**
 * Stem / sound library: a read-only recursive index of the user's audio folders. Defaults are
 * D:\audio stems\daw_instruments\Playable_Patches and …\htdemucs, STEM_LIBRARY_ROOTS (`;`-separated),
 * and folders added in the app (saved in stem-folders.json next to the library manifest) can be
 * indexed. A file is admitted only with a declaration of a human recording (or stems separated from
 * one), its performer / source and whether it is private or redistributable: a per-file entry in the
 * folder's `unbox-stem-library.json`, or the declaration the user made for the whole folder in the
 * app (stem-declarations.json, next to stem-folders.json). Names and folder structure are not
 * provenance, so undeclared / generated material is refused rather than presented as a real
 * musician recording. Items are grouped by song; .sfz patches are parsed into indexed samples.
 * Nothing is ever written to an audio folder, and files are served by indexed id only.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readSfz } from '../../scripts/instruments/sfz.ts';
import { readOggInfo } from '../vst/mediaMeta.ts';
import {
  classifyStem,
  isRedistributableStemLicense,
  isStemAudioExt,
  rootLabelOf,
  songName,
  type StemFolderDeclaration,
  type StemIndex,
  type StemItem,
  type StemProvenance,
  type StemRegion,
  type StemRoot,
} from '../../shared/audio/stemLibrary.ts';

export const DEFAULT_STEM_ROOTS = [
  'D:\\audio stems\\daw_instruments\\Playable_Patches',
  'D:\\audio stems\\daw_instruments\\htdemucs',
];

/** Folder declarations made in the app, kept next to the folder list (never in the audio folder). */
export const STEM_DECLARATIONS_FILE = 'stem-declarations.json';

/** The sidecar is intentionally local; it is never included in a share build. */
export const STEM_LIBRARY_MANIFEST = 'unbox-stem-library.json';

const MAX_DEPTH = 10;
const MAX_FILES = 50_000;
const MAX_REGIONS = 512;
const MAX_SFZ_BYTES = 4 * 1024 * 1024;

const norm = (p: string) => path.resolve(p).toLowerCase();
const idOf = (root: string, rel: string) => createHash('sha1').update(`${norm(root)}|${rel.toLowerCase()}`).digest('hex').slice(0, 16);

/**
 * True only for a child path, never a merely similarly named sibling
 * (`C:\\audio\\recordings` must not contain `C:\\audio\\recordings-copy`).
 */
export function isInsideStemRoot(root: string, candidate: string): boolean {
  const relative = path.relative(norm(root), norm(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

interface FileEntry {
  abs: string;
  rel: string;
  size: number;
  ext: string;
}

interface StemManifestEntry {
  sourceKind?: unknown;
  rights?: unknown;
  license?: unknown;
  performer?: unknown;
  source?: unknown;
  attribution?: unknown;
}

interface StemManifest {
  files?: unknown;
}

const asText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const manifestRel = (value: string): string | null => {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return normalized.toLowerCase();
};

function entryProvenance(value: unknown): { provenance?: StemProvenance; error?: string } {
  if (!value || typeof value !== 'object') return { error: 'entry must be an object' };
  const entry = value as StemManifestEntry;
  const sourceKind = entry.sourceKind;
  const rights = entry.rights;
  const license = asText(entry.license);
  const performer = asText(entry.performer);
  const source = asText(entry.source);
  const attribution = asText(entry.attribution);
  if (sourceKind !== 'recorded') return { error: 'sourceKind must be "recorded"; generated or unknown audio is not eligible' };
  if (rights !== 'private' && rights !== 'redistributable') return { error: 'rights must be "private" or "redistributable"' };
  if (!license || !performer || !source) return { error: 'license, performer and source are required' };
  if (rights === 'redistributable' && !isRedistributableStemLicense(license)) {
    return { error: 'redistributable entries must be CC0-1.0 or a CC-BY license' };
  }
  if (rights === 'redistributable' && /^CC-BY-/i.test(license) && !attribution) {
    return { error: 'CC-BY entries require attribution' };
  }
  return {
    provenance: {
      status: 'verified',
      sourceKind: 'recorded',
      rights,
      license,
      performer,
      source,
      attribution,
    },
  };
}

/**
 * Read the exact per-file allow-list. Invalid entries stay out of the playable index, and their keys
 * go into `refused`: a file its own folder calls generated is never admitted by a folder declaration.
 */
function readManifest(root: string, issues: string[], folderDeclared = false, refused?: Set<string>): Map<string, StemProvenance> {
  const out = new Map<string, StemProvenance>();
  const file = path.join(root, STEM_LIBRARY_MANIFEST);
  let raw: StemManifest;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as StemManifest;
  } catch (error) {
    // no file of its own is normal: the folder is declared in the app, or its scan says it is not yet
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return out;
    issues.push(`${root}: cannot read ${STEM_LIBRARY_MANIFEST}: ${(error as Error).message}; ${folderDeclared ? 'the folder declaration applies' : 'no audio from this folder was indexed'}`);
    return out;
  }
  if (!raw || typeof raw !== 'object' || !raw.files || typeof raw.files !== 'object' || Array.isArray(raw.files)) {
    issues.push(`${file}: expected { "files": { "relative/audio.wav": { … } } }; no audio from this folder was indexed`);
    return out;
  }
  for (const [rel, entry] of Object.entries(raw.files as Record<string, unknown>)) {
    const key = manifestRel(rel);
    if (!key) {
      issues.push(`${file}: ignored unsafe file key ${JSON.stringify(rel)}`);
      continue;
    }
    const parsed = entryProvenance(entry);
    if (!parsed.provenance) {
      refused?.add(key);
      issues.push(`${file}: ${rel}: ${parsed.error}`);
      continue;
    }
    out.set(key, parsed.provenance);
  }
  return out;
}

async function walk(root: string, issues: string[]): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      issues.push(`Cannot read ${dir}: ${(e as Error).message}`);
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) {
        issues.push(`Stopped at ${MAX_FILES} files in ${root}`);
        return;
      }
      if (e.isSymbolicLink()) continue; // never leave the folder through a link
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await visit(abs, depth + 1);
      else if (e.isFile()) {
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (ext !== 'sfz' && !isStemAudioExt(ext)) continue;
        let size = 0;
        try {
          size = (await fsp.stat(abs)).size;
        } catch {
          continue;
        }
        out.push({ abs, rel: path.relative(root, abs).split(path.sep).join('/'), size, ext });
      }
    }
  };
  await visit(root, 0);
  return out;
}

/** WAV rate and length from the first 64 KB (fmt + data chunk headers); big stems are never read whole. */
async function wavInfo(f: FileEntry): Promise<{ sampleRate?: number; durationSec?: number }> {
  const fh = await fsp.open(f.abs, 'r');
  try {
    const head = Buffer.alloc(Math.min(f.size, 65536));
    await fh.read(head, 0, head.length, 0);
    if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return {};
    let p = 12;
    let sampleRate: number | undefined;
    let byteRate: number | undefined;
    while (p + 8 <= head.length) {
      const id = head.toString('ascii', p, p + 4);
      const len = head.readUInt32LE(p + 4);
      if (id === 'fmt ' && p + 24 <= head.length) {
        sampleRate = head.readUInt32LE(p + 12);
        byteRate = head.readUInt32LE(p + 16);
      } else if (id === 'data') {
        const dataLen = Math.min(len, f.size - (p + 8));
        return { sampleRate, durationSec: byteRate ? Math.round((dataLen / byteRate) * 100) / 100 : undefined };
      }
      p += 8 + len + (len % 2);
    }
    return { sampleRate };
  } finally {
    await fh.close();
  }
}

async function audioInfo(f: FileEntry): Promise<{ sampleRate?: number; durationSec?: number }> {
  try {
    if (f.ext === 'wav' || f.ext === 'wave') return await wavInfo(f);
    if (f.ext === 'ogg' || f.ext === 'oga' || f.ext === 'opus') {
      const info = await readOggInfo(f.abs);
      return { sampleRate: info?.sampleRate, durationSec: info?.durationSec };
    }
  } catch {
    // unreadable header: listed without rate / length
  }
  return {};
}

/** What the app asks for when the user declares a whole folder. */
export interface StemFolderDeclarationInput {
  rights?: unknown;
  license?: unknown;
  performer?: unknown;
  source?: unknown;
  attribution?: unknown;
}

/** A folder declaration as the per-file record every item of the folder gets. */
function declarationProvenance(d: StemFolderDeclaration): StemProvenance {
  return { status: 'verified', sourceKind: 'recorded', rights: d.rights, license: d.license, performer: d.performer, source: d.source, attribution: d.attribution };
}

export class StemLibrary {
  private index: StemIndex | null = null;
  private scanning: Promise<StemIndex> | null = null;
  /** id → absolute path of every indexed audio file (the only files /file/:id serves). */
  private files = new Map<string, string>();
  private custom: string[] = [];
  /** norm(folder) → the declaration made for it in the app. */
  private declarations = new Map<string, StemFolderDeclaration>();
  private readonly declarationsFile: string;

  constructor(
    private readonly configFile: string,
    private readonly envRoots: string[] = (process.env.STEM_LIBRARY_ROOTS ?? '').split(';').map((s) => s.trim()).filter(Boolean),
  ) {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (raw && typeof raw === 'object' && Array.isArray((raw as { folders?: unknown }).folders)) {
        this.custom = ((raw as { folders: unknown[] }).folders).filter((f): f is string => typeof f === 'string' && path.isAbsolute(f));
      }
    } catch {
      // no saved folders yet
    }
    this.declarationsFile = path.join(path.dirname(configFile), STEM_DECLARATIONS_FILE);
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.declarationsFile, 'utf8'));
      const folders = raw && typeof raw === 'object' ? (raw as { folders?: unknown }).folders : null;
      if (folders && typeof folders === 'object' && !Array.isArray(folders)) {
        for (const [folder, value] of Object.entries(folders as Record<string, unknown>)) {
          // a saved declaration is checked again, like a sidecar entry
          const parsed = path.isAbsolute(folder) ? entryProvenance({ ...(value as object), sourceKind: 'recorded' }) : null;
          const declaredAt = asText((value as { declaredAt?: unknown } | null)?.declaredAt) ?? new Date(0).toISOString();
          if (parsed?.provenance) this.declarations.set(norm(folder), { ...this.toDeclaration(parsed.provenance), declaredAt });
        }
      }
    } catch {
      // nothing declared in the app yet
    }
  }

  private toDeclaration(p: StemProvenance): Omit<StemFolderDeclaration, 'declaredAt'> {
    return { rights: p.rights === 'redistributable' ? 'redistributable' : 'private', license: p.license ?? 'Custom', performer: p.performer ?? '', source: p.source ?? '', attribution: p.attribution };
  }

  /**
   * Declares every file of a library folder as a recording of a real performance (or stems separated
   * from one) with these rights, performer and source. The folder must be one of the library's roots.
   * The declaration is the user's statement: the app records it, it cannot verify it.
   */
  async declareFolder(folder: string, input: StemFolderDeclarationInput): Promise<StemIndex> {
    const root = this.roots().find((r) => norm(r.path) === norm(folder));
    if (!root) throw new Error('Declare a folder of the stem library (add it first).');
    const rights = input.rights === 'redistributable' ? 'redistributable' : input.rights === 'private' ? 'private' : null;
    if (!rights) throw new Error('Choose private, CC0 or CC BY.');
    const parsed = entryProvenance({
      sourceKind: 'recorded',
      rights,
      license: rights === 'private' ? 'Custom' : input.license,
      performer: typeof input.performer === 'string' ? input.performer.slice(0, 200) : input.performer,
      source: typeof input.source === 'string' ? input.source.slice(0, 500) : input.source,
      attribution: typeof input.attribution === 'string' ? input.attribution.slice(0, 300) : input.attribution,
    });
    if (!parsed.provenance) throw new Error(parsed.error ?? 'The declaration is incomplete.');
    this.declarations.set(norm(root.path), { ...this.toDeclaration(parsed.provenance), declaredAt: new Date().toISOString() });
    await this.saveDeclarations();
    return this.scan();
  }

  async withdrawDeclaration(folder: string): Promise<StemIndex> {
    this.declarations.delete(norm(folder));
    await this.saveDeclarations();
    return this.scan();
  }

  private async saveDeclarations(): Promise<void> {
    await fsp.mkdir(path.dirname(this.declarationsFile), { recursive: true });
    const folders: Record<string, StemFolderDeclaration> = {};
    for (const r of this.roots()) {
      const d = this.declarations.get(norm(r.path));
      if (d) folders[r.path] = d;
    }
    // declarations of folders that are no longer in the library are kept: adding the folder again restores them
    for (const [k, d] of this.declarations) if (!Object.keys(folders).some((f) => norm(f) === k)) folders[k] = d;
    const tmp = `${this.declarationsFile}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ folders }, null, 2));
    await fsp.rename(tmp, this.declarationsFile);
  }

  roots(): StemRoot[] {
    const seen = new Set<string>();
    const list: StemRoot[] = [];
    const push = (p: string, custom: boolean, removable: boolean) => {
      const k = norm(p);
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ path: path.resolve(p), label: rootLabelOf(p), exists: fs.existsSync(p), custom, removable });
    };
    DEFAULT_STEM_ROOTS.forEach((p) => push(p, false, false));
    this.envRoots.forEach((p) => push(p, true, false));
    this.custom.forEach((p) => push(p, true, true));
    return list;
  }

  filePath(id: string): string | undefined {
    return this.files.get(id);
  }

  /** The cached index (scanning once on first use). */
  get(): Promise<StemIndex> {
    return this.index ? Promise.resolve(this.index) : this.scan();
  }

  /** Re-reads every root; concurrent callers share one scan. */
  scan(): Promise<StemIndex> {
    this.scanning ??= this.doScan().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  async addFolder(folder: string): Promise<StemIndex> {
    const abs = path.resolve(folder);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st?.isDirectory()) throw new Error('That folder does not exist.');
    if (!this.roots().some((r) => norm(r.path) === norm(abs))) {
      this.custom.push(abs);
      await this.saveConfig();
    }
    return this.scan();
  }

  async removeFolder(folder: string): Promise<StemIndex> {
    const k = norm(folder);
    this.custom = this.custom.filter((f) => norm(f) !== k);
    await this.saveConfig();
    return this.scan();
  }

  private async saveConfig(): Promise<void> {
    await fsp.mkdir(path.dirname(this.configFile), { recursive: true });
    const tmp = `${this.configFile}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ folders: this.custom }, null, 2));
    await fsp.rename(tmp, this.configFile);
  }

  private async doScan(): Promise<StemIndex> {
    const t0 = Date.now();
    const issues: string[] = [];
    const roots = this.roots();
    const files = new Map<string, string>();
    const byAbs = new Map<string, { id: string; sampleRate?: number }>();
    const items: StemItem[] = [];
    const sfzs: { f: FileEntry; root: number; provenance: StemProvenance }[] = [];
    const audio: { f: FileEntry; root: number; id: string; info: { sampleRate?: number; durationSec?: number }; provenance: StemProvenance }[] = [];
    let blockedFiles = 0;

    for (let r = 0; r < roots.length; r++) {
      const root = roots[r];
      const declaration = this.declarations.get(norm(root.path)) ?? null;
      roots[r] = { ...root, blocked: 0, declaration };
      if (!root.exists) continue;
      const refused = new Set<string>();
      const manifest = readManifest(root.path, issues, !!declaration, refused);
      const folderProvenance = declaration ? declarationProvenance(declaration) : undefined;
      // A folder without any declaration is one line ("N files not declared yet"); in a folder that has
      // some, each file left out is listed, so its owner sees which ones the declaration misses.
      const listEach = manifest.size > 0 || refused.size > 0 || !!declaration;
      for (const f of await walk(root.path, issues)) {
        // a per-file entry of the folder's own file wins over the folder declaration, a refused one too
        const key = f.rel.toLowerCase();
        const provenance = manifest.get(key) ?? (refused.has(key) ? undefined : folderProvenance);
        if (!provenance) {
          blockedFiles++;
          roots[r].blocked = (roots[r].blocked ?? 0) + 1;
          if (listEach && issues.length < 200) issues.push(`${root.label}/${f.rel}: skipped (no valid recorded-source declaration)`);
          continue;
        }
        if (f.ext === 'sfz') {
          sfzs.push({ f, root: r, provenance });
          continue;
        }
        const id = idOf(root.path, f.rel);
        const info = await audioInfo(f);
        files.set(id, f.abs);
        byAbs.set(norm(f.abs), { id, sampleRate: info.sampleRate });
        audio.push({ f, root: r, id, info, provenance });
      }
      if (!listEach && roots[r].blocked) issues.push(`${root.path}: ${roots[r].blocked} files not declared yet; declare the folder in the app (or file by file in ${STEM_LIBRARY_MANIFEST}) to load them`);
    }

    // SFZ patches first, so the samples they play are not listed twice
    const used = new Set<string>();
    for (const { f, root, provenance } of sfzs) {
      const rootPath = roots[root].path;
      const relDir = path.posix.dirname(f.rel) === '.' ? '' : path.posix.dirname(f.rel);
      const regions: StemRegion[] = [];
      try {
        if (f.size > MAX_SFZ_BYTES) throw new Error('file too large');
        const sfzDir = path.dirname(f.abs);
        const program = readSfz(path.basename(f.abs), (rel) => {
          const target = path.resolve(sfzDir, rel);
          // #include may only read inside the same root
          if (!isInsideStemRoot(rootPath, target)) return null;
          try {
            return fs.readFileSync(target, 'utf8');
          } catch {
            return null;
          }
        });
        for (const reg of program.regions) {
          if (regions.length >= MAX_REGIONS) break;
          if (!reg.sample || reg.trigger !== 'attack') continue;
          const hit = byAbs.get(norm(path.resolve(sfzDir, reg.sample)));
          if (!hit) {
            issues.push(`${f.rel}: sample "${reg.sample}" is not in the library`);
            continue;
          }
          used.add(hit.id);
          regions.push({
            fileId: hit.id,
            lokey: reg.lokey,
            hikey: reg.hikey,
            lovel: reg.lovel,
            hivel: reg.hivel,
            keycenter: reg.keycenter,
            tune: reg.tune,
            gain: reg.gain,
            attack: reg.ampeg.attack,
            decay: reg.ampeg.decay,
            sustain: reg.ampeg.sustain,
            release: reg.ampeg.release,
            loopMode: reg.loopMode,
            loopStart: reg.loopStart,
            loopEnd: reg.loopEnd,
            offset: reg.offset,
            sampleRate: hit.sampleRate ?? 0,
          });
        }
      } catch (e) {
        issues.push(`${f.rel}: ${(e as Error).message}`);
      }
      const name = path.basename(f.rel).replace(/\.sfz$/i, '');
      items.push({
        id: idOf(rootPath, f.rel),
        name,
        song: songName(relDir, roots[root].label),
        type: classifyStem(name, relDir, roots[root].label),
        kind: 'sfz',
        format: 'sfz',
        size: f.size,
        root,
        rel: f.rel,
        regions,
        previewId: regions[0]?.fileId ?? null,
        provenance,
      });
    }

    for (const { f, root, id, info, provenance } of audio) {
      if (used.has(id)) continue;
      const relDir = path.posix.dirname(f.rel) === '.' ? '' : path.posix.dirname(f.rel);
      const name = path.basename(f.rel).replace(/\.[^.]+$/, '');
      items.push({
        id,
        name,
        song: songName(relDir, roots[root].label),
        type: classifyStem(name, relDir, roots[root].label),
        kind: 'audio',
        format: f.ext,
        size: f.size,
        root,
        rel: f.rel,
        durationSec: info.durationSec,
        sampleRate: info.sampleRate,
        previewId: id,
        provenance,
      });
    }

    items.sort((a, b) => a.song.localeCompare(b.song) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    this.files = files;
    this.index = {
      roots,
      items,
      sampleFiles: used.size,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      blockedFiles,
      issues: issues.slice(0, 200),
    };
    return this.index;
  }
}
