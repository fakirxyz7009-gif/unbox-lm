/**
 * Browser side of the stem / sound library (server/stems/stemLibrary.ts): the index is fetched at
 * start-up; items preview by streaming, and become an instrument's sound — an audio file plays
 * chromatically from its root (keySampleDefaults: detected pitch, else C4; one-shot for percussive
 * sounds, a loop for held ones), an .sfz patch keeps its own key map, envelope and loop. The audio
 * is copied into the project's audio store under a stable id, so a project plays without the folder.
 */
import { useSyncExternalStore } from 'react';
import { audioEngine } from './AudioEngine.ts';
import { audioStore, type AudioAsset } from './clips/audioStore.ts';
import { detectPitch, findLoopPoints, keySampleDefaults, setKeySample, setMultiSample, type KeySample, type MultiSampleZone } from './deviceSamples.ts';
import { canLoadStemItem, type StemIndex, type StemItem, type StemRegion } from '../../shared/audio/stemLibrary.ts';
import type { AudioProvenance } from '../../shared/audio/provenance.ts';

/** dataTransfer type of a stem-library item being dragged (value: the item id). */
export const STEM_DRAG_TYPE = 'application/x-unbox-stem';

export type StemLibraryStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
export interface StemLibraryState {
  status: StemLibraryStatus;
  index: StemIndex | null;
  error: string | null;
  /** Id of the item whose preview is playing. */
  previewing: string | null;
}

const isIndex = (x: unknown): x is StemIndex =>
  !!x && typeof x === 'object' && Array.isArray((x as StemIndex).items) && Array.isArray((x as StemIndex).roots);

const hasProvenance = (item: unknown): item is StemItem => {
  const p = (item as Partial<StemItem> | null)?.provenance;
  return !!p && typeof p === 'object' && typeof p.status === 'string' && typeof p.rights === 'string';
};

/** Converts a server-checked human-recording declaration into the project-audio record. */
function itemAudioProvenance(item: StemItem): AudioProvenance {
  const record = item.provenance;
  const attribution = record.attribution ?? record.performer;
  const rights = record.rights === 'private'
    ? 'private'
    : record.license === 'CC0-1.0'
      ? 'cc0'
      : /^CC-BY-(?:[1-4](?:\.0)?)$/i.test(record.license ?? '')
        ? 'cc-by'
        : 'unknown';
  return {
    origin: 'stem-library',
    rights,
    source: record.source ?? `${item.song} · ${item.name}`,
    ...(attribution ? { attribution } : {}),
    ...(record.license ? { license: record.license } : {}),
    declaredAt: new Date().toISOString(),
  };
}

/** An item without a provenance record (e.g. from an older server) is refused, never shown as cleared. */
function cleanIndex(index: StemIndex): StemIndex {
  const items = index.items.filter(hasProvenance);
  const dropped = index.items.length - items.length;
  return dropped ? { ...index, items, blockedFiles: (index.blockedFiles ?? 0) + dropped } : index;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n: number) => `${NOTE[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

class StemLibraryClient {
  private state: StemLibraryState = { status: 'idle', index: null, error: null, previewing: null };
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private loadSeq = 0;
  private decoding = new Map<string, Promise<AudioAsset>>();
  private preview: HTMLAudioElement | null = null;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getState = (): StemLibraryState => this.state;

  private set(patch: Partial<StemLibraryState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((cb) => cb());
  }

  item(id: string): StemItem | undefined {
    return this.state.index?.items.find((i) => i.id === id);
  }

  /** Fetches the index (the server scanned at start-up); `rescan` reads the folders again. */
  load(rescan = false): Promise<void> {
    if (this.loading && !rescan) return this.loading;
    if (!this.state.index) this.set({ status: 'loading', error: null });
    const seq = ++this.loadSeq;
    const run = (async () => {
      try {
        const res = await fetch(`/api/stems/library${rescan ? '?rescan=1' : ''}`);
        if (res.status === 404 || res.status === 403) {
          this.set({ status: 'unavailable', index: null, error: 'The stem library is part of your own build on this computer.' });
          return;
        }
        const data: unknown = await res.json();
        if (!res.ok || !isIndex(data)) throw new Error((data as { error?: string } | null)?.error ?? `Server error ${res.status}`);
        this.set({ status: 'ready', index: cleanIndex(data), error: null });
      } catch (e) {
        // no server (static desktop fallback) or offline
        this.set({ status: this.state.index ? 'ready' : 'unavailable', error: (e as Error).message });
      } finally {
        if (this.loadSeq === seq) this.loading = null;
      }
    })();
    this.loading = run;
    return run;
  }

  private async folders(method: 'POST' | 'DELETE', path: string): Promise<void> {
    const res = await fetch('/api/stems/folders', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok || !isIndex(data)) throw new Error((data as { error?: string } | null)?.error ?? `Server error ${res.status}`);
    this.set({ status: 'ready', index: cleanIndex(data), error: null });
  }
  addFolder = (path: string) => this.folders('POST', path);
  removeFolder = (path: string) => this.folders('DELETE', path);

  private async declarations(method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<void> {
    const res = await fetch('/api/stems/declarations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok || !isIndex(data)) throw new Error((data as { error?: string } | null)?.error ?? `Server error ${res.status}`);
    this.set({ status: 'ready', index: cleanIndex(data), error: null });
  }
  /** The user's declaration for every file of a library folder (see server/stems/stemLibrary.ts). */
  declareFolder = (path: string, d: { rights: 'private' | 'redistributable'; license?: string; performer: string; source: string; attribution?: string }) =>
    this.declarations('POST', { path, recordings: true, ...d });
  withdrawDeclaration = (path: string) => this.declarations('DELETE', { path });

  fileUrl(fileId: string): string {
    return `/api/stems/file/${encodeURIComponent(fileId)}`;
  }

  /** Streams an item's preview (an .sfz plays its first sample); the same item again stops it. */
  togglePreview(item: StemItem): void {
    const same = this.state.previewing === item.id;
    this.stopPreview();
    if (same || !item.previewId) return;
    const el = new Audio(this.fileUrl(item.previewId));
    el.volume = 0.8;
    el.onended = () => this.stopPreview();
    el.onerror = () => {
      this.stopPreview();
      this.set({ error: `Could not play ${item.name}` });
    };
    void el.play().catch(() => this.stopPreview());
    this.preview = el;
    this.set({ previewing: item.id });
  }

  stopPreview(): void {
    if (this.preview) {
      this.preview.pause();
      this.preview.src = '';
      this.preview = null;
    }
    if (this.state.previewing) this.set({ previewing: null });
  }

  /** The file decoded into the audio store (once per page; the id stays the same in every project). */
  asset(fileId: string, name: string, item?: StemItem): Promise<AudioAsset> {
    const id = `stem_${fileId}`;
    const have = audioStore.get(id);
    const provenance = item ? itemAudioProvenance(item) : undefined;
    if (have) {
      if (provenance && have.provenance?.origin === 'unknown') audioStore.update(id, { provenance });
      return Promise.resolve(have);
    }
    let p = this.decoding.get(id);
    if (!p) {
      p = (async () => {
        const res = await fetch(this.fileUrl(fileId));
        if (!res.ok) throw new Error(res.status === 404 ? 'The file is no longer in the library — rescan it.' : `HTTP ${res.status}`);
        const buffer = await audioEngine.ctx.decodeAudioData(await res.arrayBuffer());
        return audioStore.add(name, buffer, { id, ...(provenance ? { provenance } : {}) });
      })().finally(() => this.decoding.delete(id));
      this.decoding.set(id, p);
    }
    return p;
  }
}

export const stemLibrary = new StemLibraryClient();

export function useStemLibrary(): StemLibraryState {
  return useSyncExternalStore(stemLibrary.subscribe, stemLibrary.getState, stemLibrary.getState);
}

/** Splits a cents offset into whole semitones (moved to the root) and the remaining fine tune. */
function rootAndTune(keycenter: number, cents: number): { root: number; tune: number } {
  const semis = Math.round(cents / 100);
  return { root: Math.max(0, Math.min(127, keycenter - semis)), tune: Math.max(-100, Math.min(100, cents - semis * 100)) };
}

function sfzKeySample(r: StemRegion, asset: AudioAsset): KeySample {
  const rate = r.sampleRate || asset.buffer.sampleRate;
  const loop = r.loopMode === 'loop_continuous' || r.loopMode === 'loop_sustain';
  let loopStart: number | undefined;
  let loopEnd: number | undefined;
  if (loop) {
    if (r.loopStart !== null && r.loopEnd !== null && r.loopEnd > r.loopStart) {
      loopStart = r.loopStart / rate;
      loopEnd = Math.min(asset.buffer.duration, (r.loopEnd + 1) / rate);
    } else {
      const lp = findLoopPoints(asset.buffer);
      if (lp) ({ start: loopStart, end: loopEnd } = lp);
    }
  }
  return {
    audioId: asset.id,
    ...rootAndTune(r.keycenter, r.tune),
    level: Math.max(0, Math.min(4, r.gain)),
    attack: Math.max(0.001, r.attack),
    decay: r.decay > 0 ? r.decay : 0.3,
    sustain: r.sustain,
    release: Math.max(0.01, r.release),
    loop,
    ...(loopStart !== undefined && loopEnd !== undefined ? { loopStart, loopEnd } : {}),
    mode: r.loopMode === 'one_shot' ? 'oneShot' : 'gate',
  };
}

/**
 * Makes a library item the sound of an instrument (keeps the instrument's notes, channel and
 * effects; "Own sound" on its sample bar brings the original back). Returns a short description.
 */
export async function applyStemToDevice(item: StemItem, deviceId: string): Promise<string> {
  if (!canLoadStemItem(item)) {
    throw new Error('This sound is not a verified human recording with declared rights, so Unbox will not load it from the stem library.');
  }
  const label = `${item.name} · ${item.song}`.slice(0, 80);
  if (item.kind === 'audio') {
    const asset = await stemLibrary.asset(item.id, label, item);
    const sample: KeySample = { ...keySampleDefaults(asset.buffer), audioId: asset.id };
    if (item.type === 'Full Stems') {
      // a whole song part: play it from the key's start to key-up, never loop it
      sample.loop = false;
      sample.mode = 'gate';
    } else if (item.type === 'Dholak') {
      sample.loop = false;
      sample.mode = 'oneShot';
    }
    setKeySample(deviceId, sample);
    audioEngine.changed();
    return `${item.name}: root ${noteName(sample.root)}, ${sample.loop ? 'loop' : sample.mode === 'oneShot' ? 'one-shot' : 'gate'}`;
  }
  const regions = item.regions ?? [];
  if (!regions.length) throw new Error(`${item.name}.sfz has no playable samples`);
  const assets = new Map<string, AudioAsset>();
  for (const id of new Set(regions.map((r) => r.fileId))) assets.set(id, await stemLibrary.asset(id, label, item));
  const r0 = regions[0];
  if (regions.length === 1 && r0.lovel <= 1 && r0.hivel >= 127) {
    const asset = assets.get(r0.fileId)!;
    const sample = sfzKeySample(r0, asset);
    // One-sample patches made by converters often say C4 whatever the recording plays: the
    // sample's own pitch decides when it has one, so the keys play in tune.
    const pitch = detectPitch(asset.buffer);
    const said = sample.root;
    if (pitch) Object.assign(sample, { root: pitch.note, tune: -pitch.cents });
    setKeySample(deviceId, sample);
    audioEngine.changed();
    const how = pitch ? (pitch.note === said ? ' (detected)' : ` (detected; the .sfz said ${noteName(said)})`) : '';
    return `${item.name}.sfz: root ${noteName(sample.root)}${how}, ${sample.loop ? 'loop' : sample.mode === 'oneShot' ? 'one-shot' : 'gate'}`;
  }
  const zones: MultiSampleZone[] = regions.map((r) => {
    const k = sfzKeySample(r, assets.get(r.fileId)!);
    return {
      audioId: k.audioId,
      keyLow: r.lokey,
      keyHigh: r.hikey,
      velLow: Math.max(0, r.lovel),
      velHigh: r.hivel,
      root: k.root,
      tune: k.tune,
      level: k.level,
      attack: k.attack,
      decay: k.decay,
      sustain: k.sustain,
      release: k.release,
      loop: k.loop,
      ...(k.loopStart !== undefined && k.loopEnd !== undefined ? { loopStart: k.loopStart, loopEnd: k.loopEnd } : {}),
    };
  });
  setMultiSample(deviceId, zones);
  audioEngine.changed();
  return `${item.name}.sfz: ${zones.length} zones`;
}

/** A new sampler part (Zone One sampler) named after the sound. Returns its device id. */
export function createSamplerPart(name: string): string {
  return audioEngine.runStructuralEdit('Add sampler part', () => audioEngine.createDevice('nn19', name.slice(0, 40))).id;
}
