/**
 * Audio used by audio clips (recordings, imports, bounces, processed copies). Buffers live in
 * memory while the app runs and in the app database (IndexedDB) between sessions, so projects
 * never depend on files outside the app.
 */
import { sharedAudioContext } from '../AudioEngineGraph.ts';
import { dbAll, dbGet, dbKeys, dbPut } from '../../project/db.ts';

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
        const v = d[i];
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
    for (let i = 0; i < length; i++) {
      sum += src[i];
    }
    const mean = sum / Math.max(1, length);
    for (let i = 0; i < length; i++) {
      dst[i] = src[i] - mean;
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
      sumSq += d[i] * d[i];
      count++;
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
        energy += channel[i] * channel[i];
        count++;
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

/** Estimates a steady tempo from transient energy in the first 60 seconds of audio. */
export function detectTempoBpm(buffer: AudioBuffer): number | null {
  const framesPerSecond = 50;
  const frameSamples = Math.max(1, Math.round(buffer.sampleRate / framesPerSecond));
  const frameCount = Math.min(framesPerSecond * 60, Math.floor(buffer.length / frameSamples));
  if (frameCount < framesPerSecond * 3) return null;

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSamples;
    const end = Math.min(buffer.length, start + frameSamples);
    let energy = 0;
    let count = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        energy += channel[i] * channel[i];
        count++;
      }
    }
    rms[frame] = count ? Math.sqrt(energy / count) : 0;
  }

  const onset = new Float32Array(frameCount);
  let mean = 0;
  for (let i = 1; i < frameCount; i++) {
    onset[i] = Math.max(0, rms[i] - rms[i - 1]);
    mean += onset[i];
  }
  mean /= frameCount;
  let energy = 0;
  for (let i = 0; i < frameCount; i++) {
    onset[i] -= mean;
    energy += onset[i] * onset[i];
  }
  if (energy < 1e-8) return null;

  let bestBpm = 0;
  let bestScore = -1;
  for (let bpm = 50; bpm <= 220; bpm += 0.5) {
    const lag = (framesPerSecond * 60) / bpm;
    const first = Math.ceil(lag);
    let cross = 0;
    let aEnergy = 0;
    let bEnergy = 0;
    for (let i = first; i < frameCount; i++) {
      const delayedAt = i - lag;
      const lo = Math.floor(delayedAt);
      const frac = delayedAt - lo;
      const delayed = onset[lo] * (1 - frac) + onset[Math.min(frameCount - 1, lo + 1)] * frac;
      const current = onset[i];
      cross += current * delayed;
      aEnergy += current * current;
      bEnergy += delayed * delayed;
    }
    const score = aEnergy && bEnergy ? cross / Math.sqrt(aEnergy * bEnergy) : 0;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestScore >= 0.12 ? Math.round(bestBpm * 10) / 10 : null;
}

const newId = () => `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

class AudioStore {
  private assets = new Map<string, AudioAsset>();
  private reversed = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioAsset | null>>();
  private listeners = new Set<() => void>();
  /** Ids that a project referenced but that are in neither memory nor the database. */
  readonly missing = new Set<string>();

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
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

  /** Adds a buffer (and saves it to the app database in the background). */
  add(name: string, buffer: AudioBuffer, meta: { sourceBpm?: number; detectedBpm?: number; key?: string; id?: string } = {}): AudioAsset {
    const asset: AudioAsset = { id: meta.id ?? newId(), name, buffer, peaks: computePeaks(buffer), sourceBpm: meta.sourceBpm, detectedBpm: meta.detectedBpm, key: meta.key, createdAt: Date.now() };
    this.assets.set(asset.id, asset);
    this.missing.delete(asset.id);
    void this.persist(asset).catch((e) => console.warn('Audio could not be saved to the app database:', e));
    this.notify();
    return asset;
  }

  update(id: string, patch: Partial<Pick<AudioAsset, 'name' | 'sourceBpm' | 'detectedBpm' | 'key'>>): void {
    const a = this.assets.get(id);
    if (!a) return;
    Object.assign(a, patch);
    void this.persist(a);
    this.notify();
  }

  /** Replaces an asset's audio buffer in place (e.g. after DC offset removal or normalization) and updates peaks. */
  replaceBuffer(id: string, newBuffer: AudioBuffer): void {
    const a = this.assets.get(id);
    if (!a) return;
    a.buffer = newBuffer;
    a.peaks = computePeaks(newBuffer);
    this.reversed.delete(id);
    void this.persist(a);
    this.notify();
  }

  /** Decodes an audio file (wav, mp3, ogg, flac, m4a, aif…) into the store. */
  async importFile(file: File | Blob, name?: string): Promise<AudioAsset> {
    const data = await file.arrayBuffer();
    const buffer = await sharedAudioContext.decodeAudioData(data);
    const label = name ?? ('name' in file ? (file as File).name.replace(/\.[^.]+$/, '') : 'Audio');
    const sourceBpm = bpmFromName(label);
    const detectedBpm = sourceBpm === undefined ? detectTempoBpm(buffer) ?? undefined : undefined;
    return this.add(label, buffer, { sourceBpm, detectedBpm });
  }

  private async persist(a: AudioAsset): Promise<void> {
    try {
      const channels: ArrayBuffer[] = [];
      for (let c = 0; c < a.buffer.numberOfChannels; c++) channels.push(a.buffer.getChannelData(c).slice().buffer);
      const rec: StoredAudio = { id: a.id, name: a.name, sampleRate: a.buffer.sampleRate, length: a.buffer.length, channels, sourceBpm: a.sourceBpm, detectedBpm: a.detectedBpm, key: a.key, createdAt: a.createdAt };
      await dbPut('audio', rec);
    } catch (err) {
      console.warn(`[audioStore] Failed to persist asset "${a.name}" to IndexedDB (storage quota or serialization error):`, err);
    }
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
          const asset: AudioAsset = { id: rec.id, name: rec.name, buffer, peaks: computePeaks(buffer), sourceBpm: rec.sourceBpm, detectedBpm: rec.detectedBpm, key: rec.key, createdAt: rec.createdAt };
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

  /** Metadata of everything saved in the app database (for the media manager). */
  async storedIds(): Promise<string[]> {
    return dbKeys('audio');
  }

  async storedSummaries(): Promise<{ id: string; name: string; seconds: number; bytes: number }[]> {
    const all = await dbAll<StoredAudio>('audio');
    return all.map((r) => ({ id: r.id, name: r.name, seconds: r.length / r.sampleRate, bytes: r.length * 4 * r.channels.length }));
  }
}

/** "Drum Loop 124bpm" / "loop_90_bpm" → 124 / 90. */
export function bpmFromName(name: string): number | undefined {
  const m = /(?:^|[^0-9])(\d{2,3})\s*_?-?\s*bpm/i.exec(name) ?? /bpm\s*_?-?\s*(\d{2,3})/i.exec(name);
  const v = m ? Number(m[1]) : NaN;
  return v >= 50 && v <= 220 ? v : undefined;
}

export const audioStore = new AudioStore();
