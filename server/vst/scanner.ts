/**
 * Library scanner: walks the configured roots (default D:\vsr) and builds a VstManifest.
 * Strictly read-only — it reads directory listings, file sizes and small header blocks. It never
 * loads plugin binaries, runs installers or extracts archives.
 */
import { createHash } from 'node:crypto';
import { opendir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORY_KEYWORDS, EFFECT_CATEGORIES, macrosForCategory, roleForCategory } from '../../shared/vst/categories.ts';
import {
  ITEM_KINDS,
  MANIFEST_SCHEMA_VERSION,
  type ArchiveItem,
  type DocumentItem,
  type InstallerItem,
  type InstrumentItem,
  type ItemKind,
  type ManifestItem,
  type MetadataSource,
  type PluginFormat,
  type PluginItem,
  type PresetItem,
  type Product,
  type SampleItem,
  type SamplePackItem,
  type ScanIssue,
  type SoundCategory,
  type VstManifest,
} from '../../shared/vst/manifestTypes.ts';
import { tokenize } from '../../shared/vst/search.ts';
import { findProfile, type KnownProfile } from './knownPlugins.ts';
import {
  readChangelogVersion,
  readModuleInfo,
  readNicnt,
  readOggInfo,
  readWavInfo,
  readZipEntryCount,
  type ModuleInfo,
  type NicntInfo,
} from './mediaMeta.ts';
import { readPeInfo, type PeInfo } from './peFile.ts';

export const SCANNER_VERSION = '1.0.0';

export interface ScanProgress {
  phase: 'walk' | 'stat' | 'inspect' | 'done';
  files: number;
  dirs: number;
}

export interface ScanOptions {
  roots: string[];
  onProgress?: (p: ScanProgress) => void;
}

// ---------------------------------------------------------------------------------------------
// File classes
// ---------------------------------------------------------------------------------------------

const BUNDLE_EXT = new Set(['vst3', 'aaxplugin', 'clap', 'component', 'vst']);
const PLUGIN_FILE_EXT = new Set(['vst3', 'dll', 'clap']);
const INSTRUMENT_EXT = new Set(['nki']);
const PRESET_EXT = new Set(['nksn', 'nkm', 'nkb', 'fxp', 'fxb', 'vstpreset', 'aupreset', 'h2p']);
const PLAYABLE_AUDIO_EXT = new Set(['wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'mp3', 'aif', 'aiff', 'm4a']);
const SAMPLE_PACK_EXT = new Set(['ncw', 'nkx', 'nkc', 'nkr', 'ascf', 'obw', 'rx2', 'rex', 'sf2', 'sfz', 'exs']);
const INSTALLER_EXT = new Set(['exe', 'msi', 'pkg', 'mpkg', 'dmg']);
const DOCUMENT_EXT = new Set(['pdf', 'nfo', 'txt', 'rtf', 'html', 'htm', 'md']);
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', '__macosx', '.git', 'node_modules']);
/** Top-level folders that only hold other products (e.g. a temp extraction folder). */
const CONTAINER_DIR = /^(temp[_ -]?extracted|extracted|unpacked|temp|tmp|new folder)$/i;
/** Folder names that are structure, not meaning — excluded from tags. */
const GENERIC_SEGMENTS = new Set([
  'instruments', 'instrument', 'samples', 'sample', 'contents', 'content', 'documents', 'documentation', 'docs',
  'resources', 'data', 'library', 'installer', 'installers', 'windows', 'win', 'mac', 'macos', 'osx', 'x64', 'x86',
  'win32', 'win64', 'vst', 'vst2', 'vst3', 'aax', 'snapshots', 'previews', 'patch', 'bonus', 'temp', 'extracted',
  'update', 'setup',
]);
const ENTRY_EXPORTS = new Set(['VSTPluginMain', 'main', 'GetPluginFactory', 'InitDll', 'ExitDll', 'clap_entry', 'ACFRegisterPlugin']);
const ARTICULATIONS = [
  'legato', 'sustain', 'sustains', 'staccato', 'spiccato', 'spiccatos', 'pizzicato', 'pizzicatos', 'tremolo', 'tremolos',
  'trill', 'trills', 'marcato', 'marcatos', 'shorts', 'longs', 'fx', 'sordino', 'whisper', 'cluster', 'risers',
  'harmonics', 'portato', 'ensemble', 'solo', 'lite',
];

/** Instrument family checks, most specific first ("8 Basses" are strings, not bass synths). */
const INSTRUMENT_CATEGORY_ORDER: SoundCategory[] = [
  'piano', 'strings', 'brass', 'winds', 'choir', 'drums', 'percussion', 'guitar', 'keys', 'bass', 'synth', 'orchestral',
];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

interface Entry {
  abs: string;
  rel: string;
  root: string;
  name: string;
  stem: string;
  ext: string;
  isBundle: boolean;
  size: number;
  mtimeMs: number;
  segments: string[];
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

function stemOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function hashId(...parts: string[]): string {
  return createHash('sha1').update(parts.join('|').toLowerCase()).digest('hex').slice(0, 16);
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const NAME_NOISE = new Set([
  'vst', 'vst2', 'vst3', 'aax', 'au', 'rtas', 'tdm', 'standalone', 'x64', 'x86', 'x32', 'win', 'win32', 'win64', 'mac',
  'osx', 'macos', 'intel', 'incl', 'keygen', 'patched', 'cracked', 'repack', 'portable',
]);

/** Display name for a product folder: drops release tags, domains, formats and separators. */
export function cleanName(raw: string): string {
  const sceneStyle = !raw.includes(' ');
  let s = raw.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\b[\w-]+\.(org|com|net|me|ru|io|info|to)\b/gi, ' ');
  if (sceneStyle) {
    s = s.replace(/-[A-Za-z0-9]+$/, ''); // trailing "-GROUP"
    s = s.replace(/_/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  }
  s = s.replace(/\bpre[ _-]?activated\b/gi, ' ');
  s = s.replace(/\s+-\s+[A-Z0-9]{2,}\s*$/, ''); // trailing " - GROUP"
  const words = s.split(/\s+/).filter((w) => w && !NAME_NOISE.has(w.toLowerCase()));
  return words.join(' ').replace(/^[-\s]+|[-\s]+$/g, '').replace(/\s{2,}/g, ' ') || raw;
}

function prettySegment(seg: string): string {
  return seg.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function categoryFromText(text: string, allowed: 'instrument' | 'effect'): SoundCategory | undefined {
  const words = new Set(tokenize(text));
  const lower = ` ${text.toLowerCase()} `;
  const order = allowed === 'effect' ? EFFECT_CATEGORIES : INSTRUMENT_CATEGORY_ORDER;
  return order.find((cat) =>
    CATEGORY_KEYWORDS[cat].some((kw) => (kw.includes(' ') ? lower.includes(` ${kw} `) : words.has(kw)))
  );
}

function categoryFromModuleInfo(info: ModuleInfo | undefined): SoundCategory | undefined {
  if (!info) return undefined;
  const subs = info.subCategories.map((s) => s.toLowerCase());
  const has = (s: string) => subs.includes(s);
  if (has('eq')) return 'eq';
  if (has('dynamics')) return 'dynamics';
  if (has('reverb')) return 'reverb';
  if (has('delay')) return 'delay';
  if (has('distortion')) return 'saturation';
  if (has('pitch shift')) return 'pitch';
  if (has('modulation')) return 'modulation';
  if (has('filter')) return 'filter';
  if (has('drum')) return 'drums';
  if (has('piano')) return 'piano';
  if (has('sampler')) return 'sampler';
  if (has('synth') || has('instrument')) return 'synth';
  if (has('analyzer') || has('tools')) return 'utility';
  return undefined;
}

function docRole(name: string): DocumentItem['role'] {
  const n = name.toLowerCase();
  if (/manual|guide|user/.test(n)) return 'manual';
  if (/changelog|change log|release notes|whats ?new|version history/.test(n)) return 'changelog';
  if (/eula|license|licence|terms|third ?part/.test(n)) return 'license';
  if (/readme|read me|\.nfo$|info/.test(n)) return 'readme';
  return 'other';
}

function installerRole(name: string): InstallerItem['role'] {
  const n = name.toLowerCase();
  if (/setup|install/.test(n)) return 'installer';
  if (/update/.test(n)) return 'updater';
  return 'tool';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function stripFormatSuffix(name: string): string {
  return name.replace(/\s+(vst3?|vst2|aax|x64|x86|64-?bit|32-?bit|\(64-?bit\))$/i, '').trim();
}

// ---------------------------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------------------------

async function walkRoot(
  root: string,
  issues: ScanIssue[],
  counters: { files: number; dirs: number },
  onProgress?: (p: ScanProgress) => void
): Promise<Entry[]> {
  const entries: Entry[] = [];
  const stack: string[] = [root];
  const toRel = (abs: string) => path.relative(root, abs).split(path.sep).join('/');
  const make = (abs: string, isBundle: boolean): Entry => {
    const name = path.basename(abs);
    const rel = toRel(abs);
    return { abs, rel, root, name, stem: stemOf(name), ext: extOf(name), isBundle, size: 0, mtimeMs: 0, segments: rel.split('/') };
  };

  while (stack.length) {
    const dir = stack.pop() as string;
    counters.dirs++;
    try {
      for await (const d of await opendir(dir)) {
        if (d.isSymbolicLink()) continue;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) {
          if (SKIP_DIRS.has(d.name.toLowerCase())) continue;
          if (BUNDLE_EXT.has(extOf(d.name))) entries.push(make(abs, true));
          else stack.push(abs);
        } else if (d.isFile()) {
          entries.push(make(abs, false));
          counters.files++;
          if (counters.files % 2000 === 0) onProgress?.({ phase: 'walk', ...counters });
        }
      }
    } catch (e) {
      issues.push({ path: dir, message: `Cannot read folder: ${(e as Error).message}` });
    }
  }
  return entries;
}

/** Bundles are one item: sum their size and find the binary + moduleinfo inside. */
async function inspectBundle(entry: Entry): Promise<{ size: number; mtimeMs: number; binary?: string; moduleInfo?: ModuleInfo }> {
  let size = 0;
  let mtimeMs = 0;
  const files: string[] = [];
  const stack = [entry.abs];
  while (stack.length) {
    const dir = stack.pop() as string;
    try {
      for await (const d of await opendir(dir)) {
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) stack.push(abs);
        else if (d.isFile()) {
          files.push(abs);
          const st = await stat(abs);
          size += st.size;
          mtimeMs = Math.max(mtimeMs, st.mtimeMs);
        }
      }
    } catch {
      // unreadable bundle parts are reported by the binary lookup failing
    }
  }
  const lower = (p: string) => p.toLowerCase().split(path.sep).join('/');
  const preferred = ['/x86_64-win/', '/x64/', '/arm64x-win/', '/x86-win/', '/win32/'];
  const binaries = files.filter((f) => extOf(f) === entry.ext);
  binaries.sort((a, b) => {
    const rank = (f: string) => {
      const i = preferred.findIndex((p) => lower(f).includes(p));
      return i < 0 ? 99 : i;
    };
    return rank(a) - rank(b);
  });
  const moduleInfoPath = files.find((f) => path.basename(f).toLowerCase() === 'moduleinfo.json');
  return { size, mtimeMs, binary: binaries[0], moduleInfo: moduleInfoPath ? await readModuleInfo(moduleInfoPath) : undefined };
}

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

interface ProductAcc {
  id: string;
  key: string;
  root: string;
  folder: string;
  /** Depth of the product folder in root-relative segments. */
  depth: number;
  loose: boolean;
  /** Container folder this copy sits in (e.g. "temp_extracted"). */
  container?: string;
  rawName: string;
  name: string;
  displayName: string;
  profile?: KnownProfile;
  nicnt?: NicntInfo;
  changelogVersion?: string;
  vendor?: string;
  version?: string;
  items: ManifestItem[];
  size: number;
}

function productSegments(entry: Entry): { key: string; rawName: string; folderRel: string; loose: boolean } {
  const segs = entry.segments;
  if (segs.length === 1) {
    return { key: normKey(cleanName(entry.isBundle ? entry.stem : stemOf(entry.name))), rawName: entry.isBundle ? entry.stem : stemOf(entry.name), folderRel: entry.rel, loose: true };
  }
  if (CONTAINER_DIR.test(segs[0]) && segs.length > 2) {
    return { key: `${normKey(segs[0])}/${normKey(cleanName(segs[1]))}`, rawName: segs[1], folderRel: `${segs[0]}/${segs[1]}`, loose: false };
  }
  return { key: normKey(cleanName(segs[0])), rawName: segs[0], folderRel: segs[0], loose: false };
}

// ---------------------------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------------------------

export async function scanLibrary(opts: ScanOptions): Promise<VstManifest> {
  const started = Date.now();
  const issues: ScanIssue[] = [];
  const counters = { files: 0, dirs: 0 };
  const roots: string[] = [];
  let all: Entry[] = [];

  for (const rawRoot of opts.roots) {
    const root = path.resolve(rawRoot);
    try {
      if (!(await stat(root)).isDirectory()) throw new Error('not a folder');
    } catch (e) {
      issues.push({ path: root, message: `Library root unavailable: ${(e as Error).message}` });
      continue;
    }
    roots.push(root);
    all = all.concat(await walkRoot(root, issues, counters, opts.onProgress));
  }

  // Sizes / dates (bundles are measured while inspecting them).
  opts.onProgress?.({ phase: 'stat', ...counters });
  await mapLimit(all.filter((e) => !e.isBundle), 48, async (e) => {
    try {
      const st = await stat(e.abs);
      e.size = st.size;
      e.mtimeMs = st.mtimeMs;
    } catch (err) {
      issues.push({ path: e.abs, message: `Cannot stat: ${(err as Error).message}` });
    }
  });
  opts.onProgress?.({ phase: 'inspect', ...counters });

  // ---- Products ----
  const products = new Map<string, ProductAcc>();
  const productOf = new Map<Entry, ProductAcc>();
  // Folder products first so loose files with the same name merge into them (IVGI2/ + IVGI2.dll).
  const ordered = [...all].sort((a, b) => b.segments.length - a.segments.length);
  for (const e of ordered) {
    const seg = productSegments(e);
    const mapKey = `${e.root}|${seg.key}`;
    let p = products.get(mapKey);
    if (!p) {
      const name = cleanName(seg.rawName);
      const folderSegs = seg.folderRel.split('/');
      p = {
        id: hashId(e.root, 'product', seg.key),
        key: seg.key,
        root: e.root,
        folder: path.join(e.root, ...folderSegs),
        depth: folderSegs.length,
        loose: seg.loose,
        container: !seg.loose && folderSegs.length === 2 ? folderSegs[0] : undefined,
        rawName: seg.rawName,
        name,
        displayName: name,
        profile: findProfile(`${seg.rawName} ${name}`),
        items: [],
        size: 0,
      };
      products.set(mapKey, p);
    }
    productOf.set(e, p);
  }

  // Library-level metadata: NI .nicnt files and top-level changelogs (not ones from nested copies).
  for (const e of all) {
    const p = productOf.get(e) as ProductAcc;
    if (e.ext === 'nicnt' && !p.nicnt) p.nicnt = await readNicnt(e.abs);
    else if (
      e.ext === 'txt' &&
      e.segments.length === p.depth + 1 &&
      /changelog|change log|release notes|history/i.test(e.name) &&
      !p.changelogVersion
    ) {
      p.changelogVersion = await readChangelogVersion(e.abs);
    }
  }
  for (const p of products.values()) {
    const named = p.nicnt?.name ?? (p.loose && p.profile && p.profile.kind !== 'vendor' ? p.profile.name : p.name);
    p.displayName = p.container ? `${named} (${prettySegment(p.container)} copy)` : named;
  }

  const items: ManifestItem[] = [];
  const entryOfItem = new Map<ManifestItem, Entry>();
  let otherFiles = 0;

  /** Common item fields. `folderSegs` overrides the location for folder-level items (sample packs). */
  const base = <K extends ItemKind>(e: Entry, kind: K, name: string, extraTags: (string | undefined)[] = [], folderSegs?: string[]) => {
    const p = productOf.get(e) as ProductAcc;
    const rel = folderSegs ? folderSegs.join('/') : e.rel;
    const tagSegs = folderSegs ?? e.segments.slice(0, -1);
    const segTags = tagSegs.map(prettySegment).filter((s) => !GENERIC_SEGMENTS.has(s.toLowerCase()));
    const tags = new Set<string>();
    [name, p.name, ...segTags, ...extraTags, ...(p.profile?.tags ?? [])].forEach((t) => {
      if (!t) return;
      tokenize(t).forEach((w) => tags.add(w));
      if (t.includes(' ') && t.length < 32 && t === t.toLowerCase()) tags.add(t);
    });
    return {
      id: hashId(e.root, rel),
      kind,
      name,
      path: folderSegs ? path.join(e.root, ...folderSegs) : e.abs,
      relPath: rel,
      root: e.root,
      productId: p.id,
      sizeBytes: e.size,
      modifiedAt: new Date(e.mtimeMs || 0).toISOString(),
      tags: Array.from(tags).slice(0, 48),
    };
  };
  const push = (e: Entry, item: ManifestItem) => {
    items.push(item);
    entryOfItem.set(item, e);
    (productOf.get(e) as ProductAcc).items.push(item);
  };

  // ---- Plugins ----
  for (const e of all) {
    if (!(e.isBundle || PLUGIN_FILE_EXT.has(e.ext))) continue;
    const p = productOf.get(e) as ProductAcc;
    let binary: string | undefined = e.abs;
    let moduleInfo: ModuleInfo | undefined;
    if (e.isBundle) {
      const b = await inspectBundle(e);
      e.size = b.size;
      e.mtimeMs = b.mtimeMs;
      binary = b.binary;
      moduleInfo = b.moduleInfo;
    }
    const pe: PeInfo | null = binary ? await readPeInfo(binary) : null;
    const exportsFound = (pe?.exports ?? []).filter((x) => ENTRY_EXPORTS.has(x));
    let format: PluginFormat | null = null;
    if (e.ext === 'vst3') format = 'vst3';
    else if (e.ext === 'aaxplugin') format = 'aax';
    else if (e.ext === 'clap') format = 'clap';
    else if (e.ext === 'dll') {
      if (exportsFound.includes('VSTPluginMain') || exportsFound.includes('main')) format = 'vst2';
      else if (exportsFound.includes('GetPluginFactory')) format = 'vst3';
    }
    if (!format) {
      if (!e.isBundle) otherFiles++; // helper DLL / macOS bundle, not a Windows plugin
      continue;
    }

    const profile = findProfile(`${p.rawName} ${e.name}`, ['plugin']);
    const ver = pe?.version ?? {};
    const name = profile?.name ?? moduleInfo?.name ?? (ver.ProductName ? stripFormatSuffix(ver.ProductName) : undefined) ?? cleanName(e.stem);
    let category: SoundCategory = 'unknown';
    let categorySource: MetadataSource = 'none';
    const fromModule = categoryFromModuleInfo(moduleInfo);
    const fromText =
      categoryFromText(`${name} ${ver.FileDescription ?? ''}`, 'effect') ?? categoryFromText(`${name} ${ver.FileDescription ?? ''}`, 'instrument');
    if (profile?.category) [category, categorySource] = [profile.category, 'known-profile'];
    else if (fromModule) [category, categorySource] = [fromModule, 'moduleinfo'];
    else if (fromText) [category, categorySource] = [fromText, ver.FileDescription ? 'version-info' : 'name-heuristic'];
    const role = profile?.role ?? (category === 'unknown' ? 'effect' : roleForCategory(category));
    const arch = pe?.machine ?? 'unknown';
    const hasEntry =
      format === 'vst2' ? exportsFound.some((x) => x === 'VSTPluginMain' || x === 'main')
      : format === 'vst3' ? exportsFound.includes('GetPluginFactory')
      : format === 'clap' ? exportsFound.includes('clap_entry')
      : exportsFound.includes('ACFRegisterPlugin');
    let hostIssue: string | undefined;
    if (!pe) hostIssue = 'Binary could not be read';
    else if (format === 'aax') hostIssue = 'AAX plugins only load in Pro Tools';
    else if (!hasEntry) hostIssue = 'No plugin entry point export found';
    else if (arch === 'x86') hostIssue = '32-bit binary (needs a 32-bit bridge)';
    else if (arch !== 'x64') hostIssue = `${arch} binary`;
    const vendor = profile?.vendor ?? moduleInfo?.vendor ?? ver.CompanyName;
    const item: PluginItem = {
      ...base(e, 'plugin', name, [vendor, format, arch, category, role, profile?.description]),
      kind: 'plugin',
      format,
      arch,
      bundle: e.isBundle,
      binaryPath: binary ?? e.abs,
      entryPoints: exportsFound,
      vendor,
      version: moduleInfo?.version ?? ver.ProductVersion ?? ver.FileVersion ?? pe?.fixedVersion ?? p.changelogVersion,
      description: profile?.description ?? (ver.FileDescription && ver.FileDescription !== name ? ver.FileDescription : undefined),
      role,
      category,
      categorySource,
      hostable: !hostIssue,
      hostIssue,
      macros: macrosForCategory(role === 'effect' && category === 'unknown' ? 'utility' : category, profile?.macroLabels),
      variantKey: `${p.id}|${normKey(name)}`,
      primaryVariant: false,
    };
    push(e, item);
  }

  // ---- Kontakt instruments ----
  for (const e of all) {
    if (!INSTRUMENT_EXT.has(e.ext)) continue;
    const p = productOf.get(e) as ProductAcc;
    const folders = e.segments.slice(0, -1).join(' ');
    const fromName = categoryFromText(e.stem, 'instrument');
    const fromFolders = categoryFromText(folders, 'instrument');
    const category = fromName ?? fromFolders ?? p.profile?.category ?? 'sampler';
    const source: MetadataSource = fromName || fromFolders ? 'name-heuristic' : p.profile?.category ? 'known-profile' : 'none';
    const vendor = p.nicnt?.company ?? p.profile?.vendor;
    const articulations = ARTICULATIONS.filter((a) => tokenize(e.stem).includes(a));
    const item: InstrumentItem = {
      ...base(e, 'instrument', e.stem, [vendor, 'kontakt', category, ...articulations]),
      kind: 'instrument',
      format: 'kontakt',
      engine: p.nicnt?.poweredBy ?? 'Kontakt',
      vendor,
      category,
      categorySource: source,
      macros: macrosForCategory(category),
      presetIds: [],
    };
    push(e, item);
  }

  // ---- Presets ----
  for (const e of all) {
    if (!PRESET_EXT.has(e.ext)) continue;
    const group = e.segments.length >= 2 ? prettySegment(e.segments[e.segments.length - 2]) : undefined;
    const item: PresetItem = {
      ...base(e, 'preset', e.stem, [e.ext, group]),
      kind: 'preset',
      format: e.ext,
      group,
    };
    push(e, item);
  }

  // ---- Playable audio ----
  for (const e of all) {
    if (!PLAYABLE_AUDIO_EXT.has(e.ext)) continue;
    const isPreview = e.segments.some((s) => s.toLowerCase() === '.previews');
    const info = e.ext === 'wav' || e.ext === 'wave' ? await readWavInfo(e.abs) : ['ogg', 'oga', 'opus'].includes(e.ext) ? await readOggInfo(e.abs) : undefined;
    const name = isPreview ? `${stemOf(e.stem)} (preview)` : e.stem;
    const item: SampleItem = {
      ...base(e, 'sample', name, [isPreview ? 'preview' : 'sample', e.ext]),
      kind: 'sample',
      format: e.ext,
      playable: true,
      isPreview,
      durationSec: info?.durationSec,
      sampleRate: info?.sampleRate,
      channels: info?.channels,
    };
    push(e, item);
  }

  // ---- Sample packs (aggregated proprietary sample files) ----
  const packRoots = new Map<string, { entry: Entry; folderSegs: string[]; files: Entry[]; formats: Record<string, number> }>();
  for (const e of all) {
    if (!SAMPLE_PACK_EXT.has(e.ext)) continue;
    const segs = e.segments.slice(0, -1);
    const productDepth = productSegments(e).folderRel.split('/').length;
    let packDepth = segs.length;
    for (let i = segs.length; i > productDepth; i--) {
      if (/samples?|library|sounds?|content/i.test(segs[i - 1])) {
        packDepth = i;
        break;
      }
    }
    const folderSegs = segs.slice(0, Math.max(packDepth, Math.min(productDepth, segs.length)));
    const key = `${e.root}|${folderSegs.join('/')}`;
    let pack = packRoots.get(key);
    if (!pack) {
      pack = { entry: e, folderSegs, files: [], formats: {} };
      packRoots.set(key, pack);
    }
    pack.files.push(e);
    pack.formats[e.ext] = (pack.formats[e.ext] ?? 0) + 1;
  }
  const packFolderOf = (e: Entry) => {
    for (let n = e.segments.length - 1; n > 0; n--) {
      const pack = packRoots.get(`${e.root}|${e.segments.slice(0, n).join('/')}`);
      if (pack) return pack;
    }
    return undefined;
  };

  // ---- Installers, archives, documents, leftovers ----
  const archiveGroups = new Map<string, Entry[]>();
  for (const e of all) {
    if (e.isBundle) continue;
    const known =
      PLUGIN_FILE_EXT.has(e.ext) || INSTRUMENT_EXT.has(e.ext) || PRESET_EXT.has(e.ext) || PLAYABLE_AUDIO_EXT.has(e.ext) ||
      SAMPLE_PACK_EXT.has(e.ext) || e.ext === 'nicnt';
    if (known) continue;
    const p = productOf.get(e) as ProductAcc;
    if (INSTALLER_EXT.has(e.ext)) {
      if (/^unins\d*$/i.test(e.stem)) {
        otherFiles++;
        continue;
      }
      const pe = e.ext === 'exe' ? await readPeInfo(e.abs) : null;
      const ver = pe?.version ?? {};
      const productName = ver.ProductName && !/setup|launcher/i.test(ver.ProductName) ? ver.ProductName : p.displayName;
      const stemKey = normKey(e.stem);
      const name = stemKey.includes(normKey(productName)) || normKey(productName).includes(stemKey) ? cleanName(e.stem) : `${productName} — ${e.stem}`;
      const item: InstallerItem = {
        ...base(e, 'installer', name, ['installer', e.ext]),
        kind: 'installer',
        platform: e.ext === 'exe' || e.ext === 'msi' ? 'windows' : 'macos',
        role: installerRole(e.stem),
        vendor: p.profile?.vendor ?? ver.CompanyName,
        version: ver.ProductVersion ?? ver.FileVersion,
      };
      push(e, item);
    } else if (e.ext === 'zip' || e.ext === '7z' || e.ext === 'rar' || /^r\d{2}$/.test(e.ext)) {
      const key = `${path.dirname(e.abs)}|${e.stem.toLowerCase()}`;
      archiveGroups.set(key, [...(archiveGroups.get(key) ?? []), e]);
    } else if (DOCUMENT_EXT.has(e.ext)) {
      const item: DocumentItem = {
        ...base(e, 'document', e.name, ['document', e.ext]),
        kind: 'document',
        format: e.ext,
        role: docRole(e.name),
      };
      push(e, item);
    } else {
      const pack = packFolderOf(e);
      if (pack) {
        pack.files.push(e);
        const k = e.ext || 'data';
        pack.formats[k] = (pack.formats[k] ?? 0) + 1;
      } else otherFiles++;
    }
  }

  for (const parts of archiveGroups.values()) {
    const main = parts.find((x) => x.ext === 'zip' || x.ext === '7z' || x.ext === 'rar') ?? parts[0];
    const format: ArchiveItem['format'] = main.ext === 'zip' ? 'zip' : main.ext === '7z' ? '7z' : 'rar';
    const item: ArchiveItem = {
      ...base(main, 'archive', main.name, ['archive', format]),
      kind: 'archive',
      format,
      parts: parts.length,
      sizeBytes: parts.reduce((n, x) => n + x.size, 0),
      entryCount: format === 'zip' ? await readZipEntryCount(main.abs) : undefined,
    };
    push(main, item);
  }

  for (const pack of packRoots.values()) {
    const e = pack.entry;
    const p = productOf.get(e) as ProductAcc;
    const dominant = Object.entries(pack.formats)
      .filter(([k]) => SAMPLE_PACK_EXT.has(k))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.ext;
    const engine =
      ['ncw', 'nkx', 'nkc', 'nkr'].includes(dominant) ? 'Kontakt'
      : dominant === 'ascf' ? 'Ample Sound'
      : dominant === 'obw' ? 'Toontrack'
      : dominant === 'sf2' || dominant === 'sfz' ? 'SoundFont'
      : 'Sampler';
    const folderName = pack.folderSegs[pack.folderSegs.length - 1] ?? p.rawName;
    const name = normKey(folderName) === normKey(p.rawName) ? `${p.displayName} — library files` : `${p.displayName} — ${prettySegment(folderName)}`;
    const item: SamplePackItem = {
      ...base(e, 'sample-pack', name, [engine, dominant], pack.folderSegs),
      kind: 'sample-pack',
      format: dominant,
      fileCount: pack.files.length,
      formats: pack.formats,
      engine,
      sizeBytes: pack.files.reduce((n, x) => n + x.size, 0),
      modifiedAt: new Date(pack.files.reduce((m, x) => Math.max(m, x.mtimeMs), 0)).toISOString(),
    };
    push(e, item);
  }

  // ---- Library instruments for profiled libraries without .nki patches (e.g. Ample Guitar SC) ----
  for (const p of products.values()) {
    const prof = p.profile;
    if (prof?.kind !== 'library' || p.items.some((i) => i.kind === 'instrument')) continue;
    const packs = p.items.filter((i): i is SamplePackItem => i.kind === 'sample-pack');
    if (!packs.length) continue;
    const category = prof.category ?? 'sampler';
    const lib = packs.sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
    const item: InstrumentItem = {
      id: hashId(p.root, 'library-instrument', p.key),
      kind: 'instrument',
      name: prof.name,
      path: lib.path,
      relPath: lib.relPath,
      root: p.root,
      productId: p.id,
      sizeBytes: packs.reduce((n, x) => n + x.sizeBytes, 0),
      modifiedAt: lib.modifiedAt,
      tags: Array.from(new Set([...tokenize(`${prof.name} ${prof.vendor} ${category} library`), ...(prof.tags ?? [])])),
      format: 'library',
      engine: prof.engine ?? 'Sampler',
      vendor: prof.vendor,
      category,
      categorySource: 'known-profile',
      macros: macrosForCategory(category),
      presetIds: [],
    };
    items.push(item);
    p.items.push(item);
  }

  // ---- Link previews and presets ----
  const byPath = new Map<string, ManifestItem>();
  items.forEach((i) => byPath.set(i.path.toLowerCase(), i));
  for (const s of items) {
    if (s.kind !== 'sample' || !s.isPreview) continue;
    const e = entryOfItem.get(s) as Entry;
    const targetName = e.stem; // "Balanced.nksn.ogg" → "Balanced.nksn"
    const previewsDir = path.dirname(e.abs);
    const target = byPath.get(path.join(path.dirname(previewsDir), targetName).toLowerCase());
    if (target && (target.kind === 'instrument' || target.kind === 'preset')) target.previewId = s.id;
  }
  for (const pr of items) {
    if (pr.kind !== 'preset') continue;
    const p = Array.from(products.values()).find((x) => x.id === pr.productId) as ProductAcc;
    const instruments = p.items.filter((i): i is InstrumentItem => i.kind === 'instrument');
    const plugins = p.items.filter((i): i is PluginItem => i.kind === 'plugin');
    const segs = pr.relPath.split('/');
    const snap = segs.findIndex((s) => s.toLowerCase() === 'snapshots');
    let target: InstrumentItem | PluginItem | undefined;
    if (snap >= 0 && segs[snap + 1]) target = instruments.find((i) => normKey(i.name) === normKey(segs[snap + 1]));
    if (!target && instruments.length === 1) target = instruments[0];
    if (!target && ['fxp', 'fxb', 'vstpreset', 'h2p'].includes(pr.format)) target = plugins[0];
    if (target) {
      pr.targetId = target.id;
      if (target.kind === 'instrument') target.presetIds.push(pr.id);
    }
  }

  // ---- Duplicates (same file name + size elsewhere) ----
  const groups = new Map<string, ManifestItem[]>();
  for (const i of items) {
    const extra = i.kind === 'sample-pack' ? `|${i.fileCount}` : '';
    const key = `${i.kind}|${path.basename(i.path).toLowerCase()}|${i.sizeBytes}${extra}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  let duplicates = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length || a.relPath.localeCompare(b.relPath));
    g.slice(1).forEach((d) => {
      d.duplicateOf = g[0].id;
      duplicates++;
    });
  }

  // ---- Primary plugin variants ----
  const formatRank: Record<PluginFormat, number> = { vst3: 0, vst2: 1, clap: 2, aax: 3 };
  const variants = new Map<string, PluginItem[]>();
  items.forEach((i) => {
    if (i.kind === 'plugin' && !i.duplicateOf) variants.set(i.variantKey, [...(variants.get(i.variantKey) ?? []), i]);
  });
  for (const v of variants.values()) {
    v.sort(
      (a, b) =>
        Number(b.hostable) - Number(a.hostable) ||
        Number(b.arch === 'x64') - Number(a.arch === 'x64') ||
        formatRank[a.format] - formatRank[b.format]
    );
    v[0].primaryVariant = true;
  }

  // ---- Product summaries ----
  const productList: Product[] = [];
  for (const p of products.values()) {
    if (!p.items.length) continue;
    // Describe a product by its own items; nested copies of other products don't count.
    const own = p.items.filter((i) => !i.duplicateOf);
    const basis = own.length ? own : p.items;
    const vendors = basis.map((i) => ('vendor' in i ? i.vendor : undefined)).filter((v): v is string => !!v);
    p.vendor = p.profile?.vendor ?? p.nicnt?.company ?? vendors[0];
    const pluginVersion = basis.find((i): i is PluginItem => i.kind === 'plugin' && !!i.version)?.version;
    p.version = p.changelogVersion ?? pluginVersion ?? p.rawName.match(/\bv?(\d+\.\d+(?:\.\d+)*)\b/)?.[1];
    const canonicalProducts = new Set(
      p.items.map((i) => (i.duplicateOf ? items.find((x) => x.id === i.duplicateOf)?.productId : undefined))
    );
    const allDup = p.items.every((i) => i.duplicateOf);
    productList.push({
      id: p.id,
      name: p.displayName,
      folder: p.folder,
      vendor: p.vendor,
      version: p.version,
      kinds: ITEM_KINDS.filter((k) => basis.some((i) => i.kind === k)),
      itemIds: p.items.map((i) => i.id),
      // Library instruments re-count their sample packs, so they are left out of the total.
      sizeBytes: p.items.filter((i) => i.kind !== 'instrument' || i.format !== 'library').reduce((n, i) => n + i.sizeBytes, 0),
      duplicateOf: allDup && canonicalProducts.size === 1 ? Array.from(canonicalProducts)[0] : undefined,
    });
  }
  productList.sort((a, b) => a.name.localeCompare(b.name));

  const kindOrder = new Map(ITEM_KINDS.map((k, i) => [k, i]));
  const productName = new Map(productList.map((p) => [p.id, p.name]));
  items.sort(
    (a, b) =>
      (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0) ||
      (productName.get(a.productId) ?? '').localeCompare(productName.get(b.productId) ?? '') ||
      a.name.localeCompare(b.name)
  );

  const stats = Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Record<ItemKind, number>;
  items.forEach((i) => {
    if (!i.duplicateOf) stats[i.kind]++;
  });

  opts.onProgress?.({ phase: 'done', ...counters });
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    roots,
    scan: {
      durationMs: Date.now() - started,
      filesSeen: counters.files,
      dirsSeen: counters.dirs,
      bytesSeen: all.reduce((n, e) => n + e.size, 0),
      otherFiles,
      duplicates,
      issues: issues.slice(0, 200),
    },
    stats,
    products: productList,
    items,
  };
}
