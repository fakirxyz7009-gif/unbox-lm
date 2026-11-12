/**
 * Stem / sound library index (server builds it from the user's audio folders, the browser lists
 * it and loads items as sampler instruments). Pure: no DOM, no Node APIs.
 */

export const STEM_TYPES = ['Dholak', 'Tumbi', 'Harmonium', 'Vocal Chop', 'Full Stems', 'Other'] as const;
export type StemType = (typeof STEM_TYPES)[number];

export type StemLoopMode = 'no_loop' | 'one_shot' | 'loop_continuous' | 'loop_sustain';

/**
 * Provenance for an item in the local stem library. The library deliberately
 * distinguishes a human recording from an unknown file: names, folder names
 * and an audio header cannot establish authorship or whether a sound was made
 * by an AI system.
 */
export type StemSourceKind = 'recorded' | 'generated' | 'unknown';
export type StemRights = 'private' | 'redistributable' | 'unverified';

export interface StemProvenance {
  /**
   * `verified` = a declaration checked by the local server: a per-file entry in the folder's
   * `unbox-stem-library.json`, or the declaration made for the whole folder in the app.
   */
  status: 'verified' | 'unverified';
  /** Only `recorded` items may be loaded by the stem library. */
  sourceKind: StemSourceKind;
  /** `private` stays on this computer; only CC0 / CC-BY entries may be shared. */
  rights: StemRights;
  /** SPDX identifier, for example CC0-1.0, CC-BY-4.0, or Custom for private work. */
  license: string | null;
  /** Performer / recording credit, or an honest private-recording description. */
  performer: string | null;
  /** Original source URL or an owner-maintained private source record. */
  source: string | null;
  /** Required attribution text where the license requires it. */
  attribution: string | null;
}

/** One SFZ region, already resolved to an indexed sample file. */
export interface StemRegion {
  fileId: string;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  keycenter: number;
  /** Cents. */
  tune: number;
  /** Linear gain. */
  gain: number;
  attack: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
  loopMode: StemLoopMode | null;
  /** Frames at the sample file's own rate (convert with `sampleRate`). */
  loopStart: number | null;
  loopEnd: number | null;
  offset: number;
  /** The sample file's rate; 0 when its header could not be read. */
  sampleRate: number;
}

export interface StemItem {
  /** Stable id (root + relative path). */
  id: string;
  /** Display name: the file name without its extension. */
  name: string;
  /** The song (or folder) the item belongs to. */
  song: string;
  type: StemType;
  kind: 'audio' | 'sfz';
  /** File extension, lower case. */
  format: string;
  size: number;
  /** Index of the root folder in `StemIndex.roots`. */
  root: number;
  /** Path relative to the root, with forward slashes (shown as a tooltip). */
  rel: string;
  /** Audio: seconds when the header says so. */
  durationSec?: number;
  sampleRate?: number;
  /** SFZ: the regions (empty when none of its samples is indexed). */
  regions?: StemRegion[];
  /** File played by the preview button (the audio itself, or the patch's first sample). */
  previewId: string | null;
  /** Auditable source and redistribution status for this item. */
  provenance: StemProvenance;
}

/**
 * A declaration the user made in the app for every file of a folder (kept by the app, never written
 * into the folder). A per-file entry in the folder's own `unbox-stem-library.json` takes precedence.
 */
export interface StemFolderDeclaration {
  rights: 'private' | 'redistributable';
  /** `Custom` for private recordings, else CC0-1.0 or CC-BY-x. */
  license: string;
  performer: string;
  source: string;
  attribution: string | null;
  declaredAt: string;
}

export interface StemRoot {
  path: string;
  label: string;
  exists: boolean;
  /** Added in the app or through STEM_LIBRARY_ROOTS (can be removed in the app when added there). */
  custom: boolean;
  removable: boolean;
  /** Files of this folder refused at the last scan (no valid declaration). */
  blocked?: number;
  /** The folder-wide declaration made in the app, if any. */
  declaration?: StemFolderDeclaration | null;
}

export interface StemIndex {
  roots: StemRoot[];
  items: StemItem[];
  /** Audio files that only an SFZ patch plays (hidden from the list, still loadable by id). */
  sampleFiles: number;
  scannedAt: string;
  durationMs: number;
  /** Files deliberately refused because their recorded-source declaration is absent or invalid. */
  blockedFiles: number;
  issues: string[];
}

export const STEM_AUDIO_EXT = ['wav', 'wave', 'mp3', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff', 'm4a'] as const;
export const isStemAudioExt = (ext: string): boolean => (STEM_AUDIO_EXT as readonly string[]).includes(ext.toLowerCase());

/** A redistributed item must use a license the packaged build is allowed to carry. */
export function isRedistributableStemLicense(license: string | null | undefined): boolean {
  return license === 'CC0-1.0' || /^CC-BY-(?:[1-4](?:\.0)?)$/i.test(license ?? '');
}

/** Unknown / generated files are never eligible for the real-recording stem workflow. */
export function canLoadStemItem(item: Pick<StemItem, 'provenance'>): boolean {
  return item.provenance.status === 'verified' && item.provenance.sourceKind === 'recorded'
    && (item.provenance.rights === 'private' || item.provenance.rights === 'redistributable');
}

/** Separated-stem file names (Demucs and similar tools). */
const STEM_NAMES = new Set(['vocals', 'drums', 'bass', 'other', 'guitar', 'piano', 'no_vocals', 'accompaniment', 'instrumental']);

/** Instrument type from the file name (and the folder it sits in). */
export function classifyStem(fileName: string, relDir: string, rootLabel: string): StemType {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  if (/\bdhol(ak|aki|ki)?\b/.test(base)) return 'Dholak';
  if (/\b(tumbi|toombi|tumbe)\b/.test(base)) return 'Tumbi';
  if (/\bharmonium\b|\bpeti\b|\bvaja\b/.test(base)) return 'Harmonium';
  if (/\bvocal ?chops?\b|\bchops?\b/.test(base)) return 'Vocal Chop';
  if (STEM_NAMES.has(base.replace(/ /g, '_')) || /htdemucs|demucs|stems?$/i.test(rootLabel) || /(^|\/)(htdemucs|mdx\w*|stems?)(\/|$)/i.test(relDir)) {
    return 'Full Stems';
  }
  return 'Other';
}

/** Song name from the item's folder below the root ("" = a file directly in the root). */
export function songName(relDir: string, rootLabel: string): string {
  const first = relDir.split('/').filter(Boolean)[0];
  const raw = first ?? rootLabel;
  return raw
    .replace(/\.(mp4|mp3|wav|m4a|webm|mkv)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || rootLabel;
}

/** Folder label shown in the UI ("Playable_Patches" → "Playable Patches"). */
export function rootLabelOf(folder: string): string {
  const parts = folder.replace(/[\\/]+$/, '').split(/[\\/]/);
  return (parts[parts.length - 1] || folder).replace(/_/g, ' ');
}
