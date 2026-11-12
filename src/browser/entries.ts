/**
 * Everything the browser lists, as one entry type: built-in devices (sorted by what they are —
 * instrument, effect or utility — not by catalog group, and listed once), the plugin library
 * (proxy DSP units, presets, sample packs), library samples, the stem library and the project's own
 * audio. Hosts (rack, LOAD, piano roll) decide what an entry's actions do.
 */
import type { LucideIcon } from 'lucide-react';
import { AudioLines, Boxes, FolderOpen, Library, Piano, SlidersHorizontal, Waves } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { DeviceType } from '../audio/types.ts';
import { INSTRUMENT_CATEGORIES } from '../audio/instrumentCatalog.ts';
import { EFFECT_CATALOG } from '../audio/effectCatalog.ts';
import { audioStore, type AudioAsset } from '../audio/clips/audioStore.ts';
import { stemLibrary } from '../audio/stemLibraryClient.ts';
import { isRecordedInstrument } from '../studio/pages/deviceCatalogFilters.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';
import { CATEGORY_LABELS } from '../../shared/vst/categories.ts';
import { isMountable, type ItemKind, type ManifestItem, type VstManifest } from '../../shared/vst/manifestTypes.ts';
import { canLoadStemItem, type StemIndex, type StemItem, type StemType } from '../../shared/audio/stemLibrary.ts';
import { SHIPPED_PACKS } from '../../shared/instruments/packs.ts';
import { isRedistributable, packDeviceType } from '../../shared/instruments/catalogTypes.ts';

export type BrowserSection = 'instruments' | 'effects' | 'utilities' | 'stems' | 'samples' | 'library' | 'project';

export const SECTION_META: Record<BrowserSection, { label: string; icon: LucideIcon; blurb: string }> = {
  instruments: { label: 'Instruments', icon: Piano, blurb: 'Built-in synths, recorded instruments, drum machines and samplers.' },
  effects: { label: 'Effects', icon: SlidersHorizontal, blurb: 'Built-in effects: reverb, delay, dynamics, EQ, distortion, mastering.' },
  utilities: { label: 'Utilities', icon: Boxes, blurb: 'Players (arpeggiators, generators), CV, mixers and routing.' },
  stems: { label: 'Stems', icon: Waves, blurb: 'Your stem library: patches and stems grouped by song.' },
  samples: { label: 'Samples', icon: AudioLines, blurb: 'Samples and previews shipped in the in-app library.' },
  library: { label: 'Plugins', icon: Library, blurb: 'Your plugin index. Units run as labelled Web Audio proxy DSP, not the plugin binaries.' },
  project: { label: 'Project', icon: FolderOpen, blurb: 'Audio files in this project (imports, recordings, renders).' },
};

export type BuiltinRole = 'instrument' | 'effect' | 'utility';

export type EntryRef =
  | { kind: 'builtin'; type: DeviceType; name: string; role: BuiltinRole }
  | { kind: 'library'; item: ManifestItem }
  | { kind: 'stem'; item: StemItem }
  | { kind: 'asset'; asset: AudioAsset };

export type PreviewRef = { kind: 'library'; id: string } | { kind: 'stem'; item: StemItem } | { kind: 'asset'; asset: AudioAsset };

export type BadgeTone = 'gold' | 'green' | 'amber' | 'grey' | 'red' | 'violet';
export interface Badge {
  text: string;
  tone: BadgeTone;
  title?: string;
}

export interface BrowserEntry {
  /** Unique and stable: `builtin:type:name`, `lib:id`, `stem:id`, `asset:id`. */
  key: string;
  section: BrowserSection;
  /** Heading inside the section. */
  group: string;
  name: string;
  detail: string;
  badges: Badge[];
  /** Lower-case text the search matches. */
  haystack: string;
  preview: PreviewRef | null;
  /** Why the entry cannot be used (shown, greyed out). */
  blocked?: string;
  /** Colour of the row's marker. */
  color: string;
  /** Recorded (sampled) instrument: the "Recorded only" filter keeps these. */
  recorded?: boolean;
  /** Stem type (stem entries). */
  stemType?: StemType;
  ref: EntryRef;
}

// ---------------------------------------------------------------------------------------------
// built-in devices

const EFFECT_TYPES = new Set<DeviceType>(EFFECT_CATALOG.map((e) => e.type));
const RECORDED_GROUPS = new Set(['Recorded Instruments', 'Recorded Drums & Percussion']);

/** Short group names (catalog labels carry long museum-style names). */
const GROUP_NAMES: Record<string, string> = {
  'Native Synths & Tone Generators': 'Synths',
  'Traditional Indian Classical & Folk Suite': 'Indian & folk',
  'Keyboard & Electronic Instruments (Electrophones)': 'Keys & electronic',
  'Stringed Instruments (Chordophones)': 'Strings',
  'Wind Instruments (Aerophones)': 'Winds & brass',
  'Percussion Instruments (Idiophones & Membranophones)': 'Percussion',
  'Recorded Drums & Percussion': 'Recorded kits',
  'Recorded Instruments': 'Recorded instruments',
  'Grooveboxes & Production Centers': 'Grooveboxes',
  'Outboard Compressors & EQ': 'Compressors & EQ',
  'Outboard DSP & Dynamics': 'Outboard DSP',
  'DI Boxes & Patchbays': 'DI & patchbays',
};
const groupName = (label: string) => {
  const g = GROUP_NAMES[label] ?? label.replace(/\s*\(.*\)\s*$/, '');
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase().replace(/\b(dsp|eq|di|cv|fm)\b/g, (m) => m.toUpperCase());
};

const ROLE_SECTION: Record<BuiltinRole, BrowserSection> = { instrument: 'instruments', effect: 'effects', utility: 'utilities' };
const ROLE_COLOR: Record<BuiltinRole, string> = { instrument: '#e1bc7e', effect: '#7fd1ff', utility: '#9aa3ad' };

export function roleOf(type: DeviceType): BuiltinRole {
  if (EFFECT_TYPES.has(type) || SPEC_BY_TYPE.get(type)?.kind === 'effect') return 'effect';
  return audioEngine.isPlayableInstrument(type) ? 'instrument' : 'utility';
}

/** "CC-BY-3.0" → "CC-BY": the badge stays narrow, its tooltip has the full id. */
const shortLicense = (spdx: string) => spdx.replace(/-\d+(\.\d+)*$/, '');

const PACK_BY_TYPE = new Map<string, (typeof SHIPPED_PACKS)[number]>(SHIPPED_PACKS.map((p) => [packDeviceType(p.id), p]));

let builtinCache: BrowserEntry[] | null = null;

/** Every built-in device once (the catalog lists recorded packs in two or three groups). */
export function builtinEntries(): BrowserEntry[] {
  if (builtinCache) return builtinCache;
  const seen = new Map<string, { entry: BrowserEntry; fromRecorded: boolean }>();
  for (const cat of INSTRUMENT_CATEGORIES) {
    const fromRecorded = RECORDED_GROUPS.has(cat.label);
    for (const it of cat.items) {
      const key = `builtin:${it.type}:${it.name}`;
      const prev = seen.get(key);
      // a pack listed under its family and under "Recorded …" keeps the family group
      if (prev && (fromRecorded || !prev.fromRecorded)) continue;
      const role = roleOf(it.type);
      const recorded = isRecordedInstrument(it.type);
      const pack = PACK_BY_TYPE.get(it.type);
      const badges: Badge[] = [];
      if (pack) {
        // the pack policy: credit as "Attribution", never claim who performed it
        const free = isRedistributable(pack.spdx);
        badges.push({ text: free ? shortLicense(pack.spdx) : 'CHECK RIGHTS', tone: free ? 'green' : 'amber', title: `Attribution: ${pack.author}\nLicense: ${pack.spdx}\nSource: ${pack.source}` });
      } else if (recorded) badges.push({ text: 'REC', tone: 'green', title: 'Made from recordings' });
      const group = groupName(cat.label);
      const entry: BrowserEntry = {
        key,
        section: ROLE_SECTION[role],
        group,
        name: it.name,
        detail: pack ? `${it.desc} · Attribution: ${pack.author}` : it.desc,
        badges,
        haystack: `${it.name} ${it.desc} ${group} ${cat.badge} ${it.type}`.toLowerCase(),
        preview: null,
        color: recorded ? '#b9e07a' : ROLE_COLOR[role],
        recorded,
        ref: { kind: 'builtin', type: it.type, name: it.name, role },
      };
      seen.set(key, { entry, fromRecorded });
    }
  }
  // A recorded pack listed under several names (its family name and its pack name) is one row: the
  // first (the family listing), found by the other names too.
  const byType = new Map<string, BrowserEntry>();
  builtinCache = [];
  for (const { entry } of seen.values()) {
    const type = entry.ref.kind === 'builtin' ? entry.ref.type : '';
    const first = type.startsWith('rec_') ? byType.get(type) : undefined;
    if (first) {
      first.haystack = `${first.haystack} ${entry.haystack}`;
      if (!first.detail.includes(entry.name)) first.detail = `${first.detail} · pack: ${entry.name}`;
      continue;
    }
    if (type.startsWith('rec_')) byType.set(type, entry);
    builtinCache.push(entry);
  }
  return builtinCache;
}

// ---------------------------------------------------------------------------------------------
// plugin library (in-app bundle)

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export const fmtSeconds = (s?: number) => {
  if (s === undefined || !Number.isFinite(s)) return '';
  if (s < 60) return `${s.toFixed(1)} s`;
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function libraryDetail(item: ManifestItem): string {
  switch (item.kind) {
    case 'plugin':
      return [item.vendor, CATEGORY_LABELS[item.category], `${item.format.toUpperCase()} ${item.arch}`, item.version && `v${item.version}`].filter(Boolean).join(' · ');
    case 'instrument':
      return [item.vendor, CATEGORY_LABELS[item.category], item.engine, item.presetIds.length ? `${item.presetIds.length} presets` : ''].filter(Boolean).join(' · ');
    case 'preset':
      return [item.group, item.targetId ? `for ${vstLibrary.item(item.targetId)?.name ?? 'instrument'}` : '', item.format.toUpperCase()].filter(Boolean).join(' · ');
    case 'sample':
      return [item.format.toUpperCase(), fmtSeconds(item.durationSec), item.sampleRate ? `${item.sampleRate / 1000} kHz` : '', item.isPreview && !/preview/i.test(item.name) ? 'preview' : ''].filter(Boolean).join(' · ');
    case 'sample-pack':
      return `${item.engine} · ${item.fileCount.toLocaleString()} files · ${formatBytes(item.sizeBytes)}`;
    default:
      return '';
  }
}

const LIBRARY_GROUP: Partial<Record<ItemKind, string>> = { plugin: 'Plugins', instrument: 'Instruments', preset: 'Presets', 'sample-pack': 'Sample packs' };

/** One library item as an entry; null for copies, other formats of a plugin, installers and docs. */
export function libraryEntry(item: ManifestItem): BrowserEntry | null {
  if (item.duplicateOf) return null;
  if (item.kind === 'plugin' && !item.primaryVariant) return null;
  const product = vstLibrary.product(item.productId)?.name ?? '';
  const base = { key: `lib:${item.id}`, name: item.name, detail: libraryDetail(item), ref: { kind: 'library', item } as EntryRef };
  if (item.kind === 'sample') {
    if (!item.playable) return null;
    return {
      ...base,
      section: 'samples',
      group: product || 'Library samples',
      badges: [],
      haystack: `${item.name} ${product} ${item.tags.join(' ')} sample`.toLowerCase(),
      preview: { kind: 'library', id: item.id },
      color: '#c6b4ff',
    };
  }
  const group = LIBRARY_GROUP[item.kind];
  if (!group) return null;
  const previewId = 'previewId' in item ? item.previewId : undefined;
  const badges: Badge[] = [];
  if (item.kind === 'plugin' || item.kind === 'instrument') badges.push({ text: 'PROXY', tone: 'amber', title: 'Runs as Web Audio proxy DSP in the rack, not the plugin binary' });
  const target = item.kind === 'preset' ? vstLibrary.item(item.targetId) : undefined;
  const blocked = isMountable(item)
    ? undefined
    : item.kind === 'preset'
    ? target && isMountable(target) ? undefined : 'No instrument in the library plays this preset'
    : 'Listed for reference: nothing in the app can play it';
  return {
    ...base,
    section: 'library',
    group: item.kind === 'plugin' ? (item.role === 'effect' ? 'Effect plugins' : 'Instrument plugins') : group,
    badges,
    haystack: `${item.name} ${product} ${base.detail} ${item.tags.join(' ')} ${item.kind}`.toLowerCase(),
    preview: previewId ? { kind: 'library', id: previewId } : null,
    blocked,
    color: item.kind === 'plugin' && item.role === 'effect' ? '#7fd1ff' : '#e1bc7e',
  };
}

/** Playable library content (one entry per plugin, its best format; no copies, installers or docs). */
export function libraryEntries(manifest: VstManifest | null): BrowserEntry[] {
  return (manifest?.items ?? []).flatMap((item) => libraryEntry(item) ?? []);
}

// ---------------------------------------------------------------------------------------------
// stems and project audio

export const STEM_COLOR: Record<StemType, string> = {
  Dholak: '#e6a35c',
  Tumbi: '#7fd1ff',
  Harmonium: '#b9e07a',
  'Vocal Chop': '#f08fb8',
  'Full Stems': '#c6b4ff',
  Other: '#9aa3ad',
};

export function stemEntry(item: StemItem): BrowserEntry {
  const p = item.provenance;
  const free = p.rights === 'redistributable';
  const zones = item.regions?.length ?? 0;
  return {
    key: `stem:${item.id}`,
    section: 'stems',
    group: item.song,
    name: item.name,
    detail: [item.type, item.kind === 'sfz' ? `SFZ · ${zones} zone${zones === 1 ? '' : 's'}` : `${item.format.toUpperCase()} ${fmtSeconds(item.durationSec)}`, p.performer].filter(Boolean).join(' · '),
    badges: [{ text: free ? (p.license ? shortLicense(p.license) : 'CLEARED') : 'PRIVATE', tone: free ? 'green' : 'amber', title: [p.performer, p.source, p.attribution].filter(Boolean).join('\n') || undefined }],
    haystack: `${item.name} ${item.song} ${item.type} ${p.performer ?? ''}`.toLowerCase(),
    preview: item.previewId ? { kind: 'stem', item } : null,
    blocked: canLoadStemItem(item) ? undefined : 'Not a verified human recording with declared rights',
    color: STEM_COLOR[item.type],
    stemType: item.type,
    ref: { kind: 'stem', item },
  };
}

export const stemEntries = (index: StemIndex | null): BrowserEntry[] => (index?.items ?? []).map(stemEntry);

export function assetEntry(asset: AudioAsset): BrowserEntry {
  const bpm = asset.sourceBpm ?? asset.detectedBpm;
  return {
    key: `asset:${asset.id}`,
    section: 'project',
    group: asset.id.startsWith('stem_') ? 'From the stem library' : asset.id.startsWith('lib_') ? 'From the library' : 'Imported & recorded',
    name: asset.name,
    detail: [fmtSeconds(asset.buffer.duration), asset.buffer.numberOfChannels === 1 ? 'mono' : 'stereo', bpm ? `${Math.round(bpm)} BPM` : '', asset.key ?? ''].filter(Boolean).join(' · '),
    badges: [],
    haystack: `${asset.name} audio project`.toLowerCase(),
    preview: { kind: 'asset', asset },
    color: '#9fd7b5',
    ref: { kind: 'asset', asset },
  };
}

export const assetEntries = (assets: AudioAsset[]): BrowserEntry[] => assets.slice().sort((a, b) => b.createdAt - a.createdAt).map(assetEntry);

/** dataTransfer type of a dragged browser row (value: the entry key). */
export const BROWSER_DRAG_TYPE = 'application/x-unbox-browser';

/** The entry a dragged key names (drop targets resolve it when the drop lands). */
export function entryForKey(key: string): BrowserEntry | null {
  const i = key.indexOf(':');
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (kind === 'builtin') return builtinEntries().find((e) => e.key === key) ?? null;
  if (kind === 'lib') {
    const item = vstLibrary.item(id);
    return item ? libraryEntry(item) : null;
  }
  if (kind === 'stem') {
    const item = stemLibrary.item(id);
    return item ? stemEntry(item) : null;
  }
  if (kind === 'asset') {
    const asset = audioStore.get(id);
    return asset ? assetEntry(asset) : null;
  }
  return null;
}

/** Entries that are audio files (they can become a sound or go on an audio track). */
export const isAudioEntry = (e: BrowserEntry): boolean =>
  e.ref.kind === 'stem' || e.ref.kind === 'asset' || (e.ref.kind === 'library' && e.ref.item.kind === 'sample');
