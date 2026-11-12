/**
 * Audio used by audio clips (recordings, imports, bounces, processed copies). Buffers live in
 * memory while the app runs and in the app database (IndexedDB) between sessions, so projects
 * never depend on files outside the app.
 */
import { sharedAudioContext } from '../AudioEngineGraph.ts';
import { estimateTempo } from '../../../shared/analysis/tempo.ts';
import { parseAudioProvenance, unknownAudioProvenance, userFileProvenance, type AudioProvenance } from '../../../shared/audio/provenance.ts';
import { dbDelete, dbGet, dbPut } from '../../project/db.ts';

export interface AudioAsset {
  id: string;
  name: string;
  buffer: AudioBuffer;
  /** min/max per bin (PEAK_BIN frames), interleaved, for waveform drawing. */
  peaks: Float32Array;
  sourceBpm?: number;
  /** Audio-derived tempo estimate, kept separate from explicit filename / user metadata. */
  detectedBpm?: number;
  /** Detected / entered key, e.g. "A minor". */
  key?: string;
  /** User-provided source/rights declaration, never an independently verified license. */
  provenance?: AudioProvenance;
  createdAt: number;
}

interface StoredAudio {
  id: string;
  name: string;
  sampleRate: number;
  length: number;
  channels: ArrayBuffer[];
  sourceBpm?: number;
  detectedBpm?: number;
  key?: string;
  provenance?: AudioProvenance;
  createdAt: number;
}

export const PEAK_BIN = 256;

export function computePeaks(buffer: AudioBuffer): Float32Array {
  const bins = Math.max(1, Math.ceil(buffer.length / PEAK_BIN));
  const out = new Float32Array(bins * 2);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let b = 0; b < bins; b++) {
    let lo = 0;
    let hi = 0;
    const end = Math.min(buffer.length, (b + 1) * PEAK_BIN);
    for (const d of chans) {
      for (let i = b * PEAK_BIN; i < end; i++) {
        const raw = d[i];
        const v = Number.isFinite(raw) ? raw : 0;
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
    }
    out[b * 2] = lo;
    out[b * 2 + 1] = hi;
  }
  return out;
}

/** Removes DC bias offset from an audio buffer, centering the waveform at 0V. */
export function removeDcOffset(buffer: AudioBuffer): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const out = new AudioBuffer({ numberOfChannels: numChannels, length, sampleRate });

  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < length; i++) {
      const s = src[i];
      if (Number.isFinite(s)) {
        sum += s;
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    for (let i = 0; i < length; i++) {
      const s = src[i];
      dst[i] = Number.isFinite(s) ? s - mean : 0;
    }
  }
  return out;
}

/** Finds the nearest zero-crossing sample position within a search window to prevent click artifacts. */
export function findNearestZeroCrossing(buffer: AudioBuffer, targetSec: number, windowSec = 0.005): number {
  const sr = buffer.sampleRate;
  const targetSample = Math.round(targetSec * sr);
  const windowSamples = Math.round(windowSec * sr);
  const start = Math.max(0, targetSample - windowSamples);
  const end = Math.min(buffer.length - 2, targetSample + windowSamples);
  const data = buffer.getChannelData(0);

  let bestSample = targetSample;
  let bestDist = Infinity;
  let minAbs = Math.abs(data[Math.min(buffer.length - 1, targetSample)]);

  for (let i = start; i <= end; i++) {
    if ((data[i] <= 0 && data[i + 1] >= 0) || (data[i] >= 0 && data[i + 1] <= 0)) {
      const crossingSample = Math.abs(data[i]) < Math.abs(data[i + 1]) ? i : i + 1;
      const dist = Math.abs(crossingSample - targetSample);
      const curAbs = Math.abs(data[crossingSample]);

      if (dist < bestDist || (dist === bestDist && curAbs < minAbs)) {
        bestDist = dist;
        minAbs = curAbs;
        bestSample = crossingSample;
      }
    }
  }
  return bestSample / sr;
}

/** Computes the RMS amplitude of a section of audio. */
export function calculateClipRms(buffer: AudioBuffer, startSec: number, durationSec: number): number {
  const sr = buffer.sampleRate;
  const i0 = Math.max(0, Math.floor(startSec * sr));
  const i1 = Math.min(buffer.length, Math.ceil((startSec + durationSec) * sr));
  if (i1 <= i0) return 0;
  let sumSq = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = i0; i < i1; i++) {
      const val = d[i];
      if (Number.isFinite(val)) {
        sumSq += val * val;
        count++;
      }
    }
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

/** Finds clear amplitude attacks for grid-based, non-destructive clip slicing. */
export function detectTransientTimes(buffer: AudioBuffer): number[] {
  const hop = Math.max(1, Math.round(buffer.sampleRate * 0.01));
  const frameCount = Math.floor(buffer.length / hop);
  if (frameCount < 3) return [];
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * hop;
    const end = Math.min(buffer.length, start + hop);
    let energy = 0;
    let count = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        const val = channel[i];
        if (Number.isFinite(val)) {
          energy += val * val;
          count++;
        }
      }
    }
    rms[frame] = count ? Math.sqrt(energy / count) : 0;
  }
  const flux = new Float32Array(frameCount);
  let mean = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    flux[frame] = Math.max(0, rms[frame] - rms[frame - 1]);
    mean += flux[frame];
  }
  mean /= frameCount;
  let variance = 0;
  let peak = 0;
  for (const value of flux) {
    variance += (value - mean) ** 2;
    peak = Math.max(peak, value);
  }
  const threshold = Math.max(0.003, mean + Math.sqrt(variance / frameCount) * 1.1, peak * 0.09);
  const refractory = Math.max(5, Math.round(0.07 * buffer.sampleRate / hop));
  const hits: number[] = [];
  let last = -refractory;
  for (let frame = 2; frame < frameCount - 2; frame++) {
    if (flux[frame] < threshold || rms[frame] < 0.012 || frame - last < refractory) continue;
    if (flux[frame] < flux[frame - 1] || flux[frame] < flux[frame + 1] || flux[frame] < flux[frame - 2] || flux[frame] < flux[frame + 2]) continue;
    hits.push((frame * hop) / buffer.sampleRate);
    last = frame;
  }
  return hits;
}

/** Estimates a steady tempo from the clip's onsets (see shared/analysis/tempo.ts). */
export function detectTempoBpm(buffer: AudioBuffer): number | null {
  const length = Math.min(buffer.length, Math.round(90 * buffer.sampleRate));
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return estimateTempo(mono, buffer.sampleRate)?.bpm ?? null;
}

const newId = () => `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

class AudioStore {
  private assets = new Map<string, AudioAsset>();
  private reversed = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioAsset | null>>();
  private writes = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private revision = 0;
  /** Ids that a project referenced but that are in neither memory nor the database. */
  readonly missing = new Set<string>();

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.revision++;
    this.listeners.forEach((cb) => cb());
  }

  /** Stable snapshot token for React views that list project audio assets. */
  getRevision(): number {
    return this.revision;
  }

  get(id: string | undefined): AudioAsset | undefined {
    return id ? this.assets.get(id) : undefined;
  }

  all(): AudioAsset[] {
    return [...this.assets.values()];
  }

  /** Reversed copy of an asset's buffer (cached). */
  reversedBuffer(id: string): AudioBuffer | undefined {
    const a = this.assets.get(id);
    if (!a) return undefined;
    let r = this.reversed.get(id);
    if (!r) {
      r = new AudioBuffer({ length: a.buffer.length, numberOfChannels: a.buffer.numberOfChannels, sampleRate: a.buffer.sampleRate });
      for (let c = 0; c < a.buffer.numberOfChannels; c++) {
        const src = a.buffer.getChannelData(c);
        const dst = r.getChannelData(c);
        for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
      }
      this.reversed.set(id, r);
    }
    return r;
  }

  /**
   * Adds a buffer (and saves it to the app database in the background). Every asset carries an
   * honest origin record: an omitted/invalid declaration is explicitly `unknown`, never silently
   * treated as user-owned or licensed.
   */
  add(name: string, buffer: AudioBuffer, meta: { sourceBpm?: number; detectedBpm?: number; key?: string; id?: string; provenance?: AudioProvenance } = {}): AudioAsset {
    const provenance = parseAudioProvenance(meta.provenance) ?? unknownAudioProvenance();
    const asset: AudioAsset = { id: meta.id ?? newId(), name, buffer, peaks: computePeaks(buffer), sourceBpm: meta.sourceBpm, detectedBpm: meta.detectedBpm, key: meta.key, provenance, createdAt: Date.now() };
    this.assets.set(asset.id, asset);
    this.missing.delete(asset.id);
    this.queuePersist(asset);
    this.notify();
    return asset;
  }

  update(id: string, patch: Partial<Pick<AudioAsset, 'name' | 'sourceBpm' | 'detectedBpm' | 'key' | 'provenance'>>): void {
    const a = this.assets.get(id);
    if (!a) return;
    const updatesProvenance = Object.prototype.hasOwnProperty.call(patch, 'provenance');
    const provenance = updatesProvenance ? parseAudioProvenance(patch.provenance) ?? unknownAudioProvenance() : undefined;
    Object.assign(a, { ...patch, ...(updatesProvenance ? { provenance } : {}) });
    this.queuePersist(a);
    this.notify();
  }

  /**
   * Resolves only once an in-memory asset has been written to IndexedDB. Recording recovery uses
   * this before it clears its take journal, so a project never holds the sole reference to audio
   * that has not reached durable storage yet.
   */
  async ensurePersisted(id: string): Promise<boolean> {
    const asset = this.assets.get(id);
    if (!asset) return false;
    await (this.writes.get(id) ?? this.queuePersist(asset));
    return true;
  }

  /** Decodes an audio file (wav, mp3, ogg, flac, m4a, aif…) into the store. */
  async importFile(file: File | Blob, name?: string, meta: { provenance?: AudioProvenance } = {}): Promise<AudioAsset> {
    const data = await file.arrayBuffer();
    const buffer = await sharedAudioContext.decodeAudioData(data);
    const label = name ?? ('name' in file ? (file as File).name.replace(/\.[^.]+$/, '') : 'Audio');
    const sourceBpm = bpmFromName(label);
    const detectedBpm = sourceBpm === undefined ? detectTempoBpm(buffer) ?? undefined : undefined;
    const fileName = 'name' in file && typeof (file as File).name === 'string' ? (file as File).name : label;
    return this.add(label, buffer, { sourceBpm, detectedBpm, provenance: meta.provenance ?? userFileProvenance(fileName) });
  }

  /** Imports multiple audio files in parallel. */
  async importFiles(files: (File | Blob)[]): Promise<AudioAsset[]> {
    const results: AudioAsset[] = [];
    for (const file of files) {
      try {
        const asset = await this.importFile(file);
        results.push(asset);
      } catch (err) {
        console.warn('[audioStore] Failed to import audio file:', err);
      }
    }
    return results;
  }

  /** Removes an audio asset from memory and IndexedDB. */
  async remove(id: string): Promise<boolean> {
    const existed = this.assets.delete(id);
    this.reversed.delete(id);
    this.missing.delete(id);
    this.loading.delete(id);
    await this.writes.get(id)?.catch(() => {});
    try {
      await dbDelete('audio', id);
    } catch (e) {
      console.warn(`[audioStore] Failed to remove asset ${id} from database:`, e);
    }
    if (existed) {
      this.notify();
    }
    return existed;
  }

  private queuePersist(asset: AudioAsset): Promise<void> {
    const previous = this.writes.get(asset.id);
    const snapshot = { ...asset };
    const write = previous ? previous.catch(() => {}).then(() => this.persist(snapshot)) : this.persist(snapshot);
    this.writes.set(asset.id, write);
    const settled = () => { if (this.writes.get(asset.id) === write) this.writes.delete(asset.id); };
    void write.then(settled, (error) => {
      settled();
      console.warn(`[audioStore] Failed to persist asset "${asset.name}" to IndexedDB:`, error);
    });
    return write;
  }

  private async persist(a: AudioAsset): Promise<void> {
    const channels: ArrayBuffer[] = [];
    for (let c = 0; c < a.buffer.numberOfChannels; c++) channels.push(a.buffer.getChannelData(c).slice().buffer);
    const rec: StoredAudio = { id: a.id, name: a.name, sampleRate: a.buffer.sampleRate, length: a.buffer.length, channels, sourceBpm: a.sourceBpm, detectedBpm: a.detectedBpm, key: a.key, provenance: a.provenance, createdAt: a.createdAt };
    await dbPut('audio', rec);
  }

  /** Loads an asset from the app database (null when it is not there). */
  load(id: string): Promise<AudioAsset | null> {
    const have = this.assets.get(id);
    if (have) return Promise.resolve(have);
    let p = this.loading.get(id);
    if (!p) {
      p = dbGet<StoredAudio>('audio', id)
        .then((rec) => {
          if (!rec) {
            this.missing.add(id);
            this.notify();
            return null;
          }
          const buffer = new AudioBuffer({ length: rec.length, numberOfChannels: rec.channels.length, sampleRate: rec.sampleRate });
          rec.channels.forEach((ch, c) => buffer.copyToChannel(new Float32Array(ch), c));
          const provenance = parseAudioProvenance(rec.provenance) ?? unknownAudioProvenance();
          const asset: AudioAsset = { id: rec.id, name: rec.name, buffer, peaks: computePeaks(buffer), sourceBpm: rec.sourceBpm, detectedBpm: rec.detectedBpm, key: rec.key, provenance, createdAt: rec.createdAt };
          this.assets.set(id, asset);
          this.missing.delete(id);
          this.notify();
          return asset;
        })
        .catch(() => null)
        .finally(() => this.loading.delete(id));
      this.loading.set(id, p);
    }
    return p;
  }

  /** Loads every id that is not in memory yet; resolves with the ids that are missing. */
  async ensure(ids: Iterable<string>): Promise<string[]> {
    const want = [...new Set(ids)].filter((id) => !this.assets.has(id));
    const got = await Promise.all(want.map((id) => this.load(id)));
    return want.filter((_, i) => !got[i]);
  }

}

/** "Drum Loop 124bpm" / "loop_90_bpm" → 124 / 90. */
export function bpmFromName(name: string): number | undefined {
  const m = /(?:^|[^0-9])(\d{2,3})\s*_?-?\s*bpm/i.exec(name) ?? /bpm\s*_?-?\s*(\d{2,3})/i.exec(name);
  const v = m ? Number(m[1]) : NaN;
  return v >= 50 && v <= 220 ? v : undefined;
}

export const audioStore = new AudioStore();
