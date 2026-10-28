/**
 * Schema of the plugin / content library manifest (data/vsr-manifest.json).
 * Pure types: imported by the Node scanner, the API routes, the AI planner and the browser.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

export type ItemKind =
  | 'plugin'
  | 'instrument'
  | 'preset'
  | 'sample'
  | 'sample-pack'
  | 'installer'
  | 'archive'
  | 'document';

export const ITEM_KINDS: ItemKind[] = [
  'plugin',
  'instrument',
  'preset',
  'sample',
  'sample-pack',
  'installer',
  'archive',
  'document',
];

export type PluginFormat = 'vst2' | 'vst3' | 'aax' | 'clap';
export type Arch = 'x64' | 'x86' | 'arm64' | 'unknown';
export type UnitRole = 'effect' | 'instrument';

/** Drives search, AI selection and which Web Audio proxy a mounted unit runs. */
export type SoundCategory =
  | 'eq'
  | 'dynamics'
  | 'limiter'
  | 'saturation'
  | 'pitch'
  | 'reverb'
  | 'delay'
  | 'modulation'
  | 'filter'
  | 'utility'
  | 'piano'
  | 'keys'
  | 'strings'
  | 'brass'
  | 'winds'
  | 'orchestral'
  | 'choir'
  | 'drums'
  | 'percussion'
  | 'guitar'
  | 'bass'
  | 'synth'
  | 'sampler'
  | 'unknown';

/** Where a category / vendor came from, best evidence first. */
export type MetadataSource = 'moduleinfo' | 'known-profile' | 'nicnt' | 'version-info' | 'name-heuristic' | 'none';

export type MacroId = 'macro1' | 'macro2' | 'macro3' | 'macro4';

export interface MacroSpec {
  id: MacroId;
  label: string;
  /** Normalised 0..1 default. */
  default: number;
}

export interface ItemBase {
  /** Stable id derived from root + relative path. */
  id: string;
  kind: ItemKind;
  name: string;
  /** Absolute path on disk ('' in the in-app library bundle). */
  path: string;
  /** Path relative to its root, forward slashes ('' in the bundle). */
  relPath: string;
  root: string;
  productId: string;
  sizeBytes: number;
  modifiedAt: string;
  /** Lowercase search tags. */
  tags: string[];
  /** Id of the canonical copy when the same file exists elsewhere. */
  duplicateOf?: string;
}

export interface PluginItem extends ItemBase {
  kind: 'plugin';
  format: PluginFormat;
  arch: Arch;
  /** VST3 / AAX bundle directory instead of a single binary. */
  bundle: boolean;
  /** The binary that would be loaded (inside the bundle for bundles). */
  binaryPath: string;
  /** Relevant entry-point exports found in the binary. */
  entryPoints: string[];
  vendor?: string;
  version?: string;
  description?: string;
  role: UnitRole;
  category: SoundCategory;
  categorySource: MetadataSource;
  /** A 64-bit Windows VST2/VST3/CLAP host could load this binary. */
  hostable: boolean;
  hostIssue?: string;
  macros: MacroSpec[];
  /** Same plugin in other formats/architectures shares this key (e.g. TDR Nova VST2/VST3/AAX). */
  variantKey: string;
  /** Best variant of its group (hostable, x64, VST3 > VST2 > CLAP > AAX). */
  primaryVariant: boolean;
}

export interface InstrumentItem extends ItemBase {
  kind: 'instrument';
  /** `kontakt` = a .nki patch, `library` = a vendor sample library folder. */
  format: 'kontakt' | 'library';
  /** The player it needs (Kontakt, Ample Guitar SC, …). */
  engine: string;
  vendor?: string;
  category: SoundCategory;
  categorySource: MetadataSource;
  macros: MacroSpec[];
  /** Sample item id of an audio preview, if any. */
  previewId?: string;
  presetIds: string[];
}

export interface PresetItem extends ItemBase {
  kind: 'preset';
  /** File extension: nksn, nkm, fxp, fxb, vstpreset, … */
  format: string;
  /** Instrument / plugin this preset belongs to. */
  targetId?: string;
  /** Sub-folder grouping, e.g. "Pianos" or "Textures". */
  group?: string;
  previewId?: string;
}

export interface SampleItem extends ItemBase {
  kind: 'sample';
  format: string;
  /** Decodable by the browser (wav, ogg, flac, mp3, aif). */
  playable: boolean;
  /** NI-style `.previews` audio for an instrument or preset. */
  isPreview: boolean;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  /** In-app bundle: URL of the copied audio, relative to the app root (library/audio/<id>.<ext>). */
  file?: string;
}

export interface SamplePackItem extends ItemBase {
  kind: 'sample-pack';
  /** Dominant proprietary extension (ncw, nkx, ascf, obw, …). */
  format: string;
  fileCount: number;
  formats: Record<string, number>;
  /** What reads these files (Kontakt, Ample Sound, Toontrack, …). */
  engine: string;
}

export interface InstallerItem extends ItemBase {
  kind: 'installer';
  platform: 'windows' | 'macos';
  role: 'installer' | 'updater' | 'tool';
  vendor?: string;
  version?: string;
}

export interface ArchiveItem extends ItemBase {
  kind: 'archive';
  format: 'zip' | '7z' | 'rar';
  /** Number of volumes for multi-part archives (.rar + .r00…). */
  parts: number;
  /** Entry count from the zip central directory (zip only). */
  entryCount?: number;
}

export interface DocumentItem extends ItemBase {
  kind: 'document';
  format: string;
  role: 'manual' | 'changelog' | 'readme' | 'license' | 'other';
}

export type ManifestItem =
  | PluginItem
  | InstrumentItem
  | PresetItem
  | SampleItem
  | SamplePackItem
  | InstallerItem
  | ArchiveItem
  | DocumentItem;

/** Plugins and instruments can be mounted as rack units. */
export type MountableItem = PluginItem | InstrumentItem;

export const isMountable = (item: ManifestItem): item is MountableItem =>
  item.kind === 'plugin' || item.kind === 'instrument';

export interface Product {
  id: string;
  name: string;
  /** Product folder (or the loose file for single-file products). */
  folder: string;
  vendor?: string;
  version?: string;
  kinds: ItemKind[];
  itemIds: string[];
  sizeBytes: number;
  /** Set when every item of this product duplicates another product. */
  duplicateOf?: string;
}

export interface ScanIssue {
  path: string;
  message: string;
}

export interface VstManifest {
  schemaVersion: number;
  generatedAt: string;
  /** 'bundled' = the in-app copy (no paths, audio copied next to it); default is a raw scan. */
  source?: 'scan' | 'bundled';
  roots: string[];
  scan: {
    durationMs: number;
    filesSeen: number;
    dirsSeen: number;
    bytesSeen: number;
    /** Files that are not library content (images, configs, installer payloads, …). */
    otherFiles: number;
    /** Items that are copies of another indexed item. */
    duplicates: number;
    issues: ScanIssue[];
  };
  /** Item counts per kind, duplicates excluded. */
  stats: Record<ItemKind, number>;
  products: Product[];
  items: ManifestItem[];
}
