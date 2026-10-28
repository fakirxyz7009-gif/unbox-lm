/**
 * Export pipeline: render (offline) → optional normalization (peak or LUFS, never past the
 * true-peak ceiling) → encode (WAV / AIFF / FLAC / MP3 / Ogg Opus / AAC) with metadata.
 * Stems render each chosen channel separately and come back as one zip.
 */
import type { AudioEngine } from '../AudioEngine.ts';
import { measureLoudness, type LoudnessResult } from '../analysis/loudness.ts';
import { renderSong } from '../render/renderSong.ts';
import { encodeAac, encodeMp3, encodeOggOpus } from './compressed.ts';
import { encodeFlac } from './flac.ts';
import { exportMidi } from './midi.ts';
import { encodeAiff, encodeWav, safeFileName, type AudioMeta } from './wav.ts';
import { writeZip } from '../../project/zip.ts';

export type ExportFormat = 'wav' | 'aiff' | 'flac' | 'mp3' | 'ogg' | 'aac';

export interface ExportSettings {
  what: 'mix' | 'stems' | 'midi';
  format: ExportFormat;
  sampleRate: number;
  bitDepth: 16 | 24 | 32;
  dither: boolean;
  kbps: number;
  normalize: 'off' | 'peak' | 'lufs';
  peakDb: number;
  lufs: number;
  /** Normalization never pushes the true peak above this (dBTP). */
  ceilingDb: number;
  range: 'song' | 'loop' | 'custom';
  startBar: number;
  endBar: number;
  tailSec: number;
  /** Stems: channel ids. */
  stems: string[];
  stemMode: 'wet' | 'dry';
  stemMaster: boolean;
  /** Stems: also write each instrument's notes (a .mid, drum pattern included) beside its audio. */
  stemNotes: boolean;
  /** Mix: run the master section (off = raw mix bus). */
  masterProcessing: boolean;
  fileName: string;
  meta: AudioMeta;
}

export const DEFAULT_EXPORT: ExportSettings = {
  what: 'mix', format: 'wav', sampleRate: 48000, bitDepth: 24, dither: true, kbps: 320, normalize: 'off', peakDb: -1, lufs: -14, ceilingDb: -1,
  range: 'song', startBar: 1, endBar: 9, tailSec: 2, stems: [], stemMode: 'wet', stemMaster: false, stemNotes: true, masterProcessing: true, fileName: '', meta: {},
};

export const FORMAT_INFO: Record<ExportFormat, { label: string; ext: string; lossy: boolean; rates: number[] }> = {
  wav: { label: 'WAV (PCM / float)', ext: 'wav', lossy: false, rates: [44100, 48000, 88200, 96000, 176400, 192000] },
  aiff: { label: 'AIFF (PCM)', ext: 'aif', lossy: false, rates: [44100, 48000, 88200, 96000, 176400, 192000] },
  flac: { label: 'FLAC (lossless)', ext: 'flac', lossy: false, rates: [44100, 48000, 88200, 96000, 176400, 192000] },
  mp3: { label: 'MP3', ext: 'mp3', lossy: true, rates: [44100, 48000] },
  ogg: { label: 'Ogg Opus', ext: 'ogg', lossy: true, rates: [48000] },
  aac: { label: 'AAC (ADTS)', ext: 'aac', lossy: true, rates: [44100, 48000] },
};

export interface ExportResult {
  files: { name: string; blob: Blob }[];
  loudness?: LoudnessResult;
  gainDb: number;
}

interface StemManifestEntry {
  name: string;
  kind: string;
  audio: string;
  notes: string | null;
}

/** manifest.json in a stems zip: the tempo and grid the notes were written with. */
function stemManifest(engine: AudioEngine, sampleRate: number, range: { start: number; end: number }, stems: StemManifestEntry[]) {
  return {
    software: 'Unbox Studio',
    bpm: engine.bpm,
    timeSignature: engine.timeSignature,
    sampleRate,
    stepsPerBar: engine.stepsPerBar,
    range16ths: range,
    notes: 'Each .mid holds one instrument (drums on channel 10) at 480 PPQ; the audio is the same stem rendered on its own.',
    stems,
  };
}

export function exportRange(engine: AudioEngine, s: ExportSettings): { start: number; end: number } {
  const spb = engine.stepsPerBar;
  if (s.range === 'loop') {
    const l = engine.getLoopRange();
    return { start: Math.round(l.start * spb), end: Math.round(l.end * spb) };
  }
  if (s.range === 'custom') return { start: Math.max(0, Math.round((s.startBar - 1) * spb)), end: Math.max(Math.round((s.startBar - 1) * spb) + 1, Math.round((s.endBar - 1) * spb)) };
  return { start: 0, end: engine.renderLength16ths() };
}

async function encode(buf: AudioBuffer, s: ExportSettings, onProgress: (f: number) => void): Promise<Blob> {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const meta = { ...s.meta, software: 'Unbox Studio' };
  switch (s.format) {
    case 'wav':
      return encodeWav(chans, buf.sampleRate, { bitDepth: s.bitDepth, float: s.bitDepth === 32, dither: s.dither }, meta);
    case 'aiff':
      return encodeAiff(chans, buf.sampleRate, { bitDepth: s.bitDepth === 32 ? 24 : s.bitDepth, dither: s.dither }, meta);
    case 'flac':
      return encodeFlac(chans, buf.sampleRate, s.bitDepth === 16 ? 16 : 24, meta, s.dither);
    case 'mp3':
      return encodeMp3(chans, buf.sampleRate, s.kbps, meta, onProgress);
    case 'ogg':
      return encodeOggOpus(chans, s.kbps, meta, onProgress);
    case 'aac':
      return encodeAac(chans, buf.sampleRate, s.kbps, onProgress);
  }
}

/** Applies the normalization gain in place; returns the gain used (dB). */
function normalize(buf: AudioBuffer, s: ExportSettings, l: LoudnessResult): number {
  if (s.normalize === 'off') return 0;
  let gain = s.normalize === 'peak' ? s.peakDb - l.truePeakDb : s.lufs - l.integrated;
  if (!Number.isFinite(gain)) return 0;
  // never push the true peak over the ceiling (no limiter here: stays below target instead)
  gain = Math.min(gain, s.ceilingDb - l.truePeakDb);
  const g = Math.pow(10, gain / 20);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return gain;
}

export async function runExport(engine: AudioEngine, s: ExportSettings, onProgress: (fraction: number, label: string) => void): Promise<ExportResult> {
  const base = safeFileName(s.fileName || 'Unbox Studio export');
  const range = exportRange(engine, s);
  if (s.what === 'midi') return { files: [{ name: `${base}.mid`, blob: exportMidi(engine, range) }], gainDb: 0 };
  const ext = FORMAT_INFO[s.format].ext;
  const rate = FORMAT_INFO[s.format].rates.includes(s.sampleRate) ? s.sampleRate : FORMAT_INFO[s.format].rates[0];
  const wasPlaying = engine.isPlaying;
  if (wasPlaying) engine.stopTransport();
  if (s.what === 'mix') {
    const buf = await renderSong(engine, {
      startPos: range.start, endPos: range.end, sampleRate: rate, tailSec: s.tailSec, masterProcessing: s.masterProcessing,
      onProgress: (f, l) => onProgress(f * 0.8, `Mix: ${l}`),
    });
    onProgress(0.82, 'Measuring loudness');
    const loud = measureLoudness(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate);
    const gainDb = normalize(buf, s, loud);
    onProgress(0.86, `Encoding ${ext.toUpperCase()}`);
    const blob = await encode(buf, s, (f) => onProgress(0.86 + f * 0.13, `Encoding ${ext.toUpperCase()}`));
    onProgress(1, 'Done');
    const after = gainDb ? measureLoudness(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate) : loud;
    return { files: [{ name: `${base}.${ext}`, blob }], loudness: after, gainDb };
  }

  // stems
  const files: { name: string; blob: Blob }[] = [];
  const manifest: StemManifestEntry[] = [];
  const chans = engine.mixer.channels().filter((c) => s.stems.includes(c.id));
  for (let i = 0; i < chans.length; i++) {
    const c = chans[i];
    const label = `Stem ${i + 1}/${chans.length} ${c.settings.name}`;
    const buf = await renderSong(engine, {
      startPos: range.start, endPos: range.end, sampleRate: rate, tailSec: s.tailSec,
      onlyChannels: new Set([c.id]), stemMode: s.stemMode, masterProcessing: s.stemMaster,
      onProgress: (f, l) => onProgress((i + f * 0.8) / chans.length, `${label}: ${l}`),
    });
    const blob = await encode(buf, { ...s, normalize: 'off' }, () => undefined);
    const stemBase = `${base} - ${String(i + 1).padStart(2, '0')} ${safeFileName(c.settings.name)}`;
    files.push({ name: `${stemBase}.${ext}`, blob });
    const trackId = c.kind === 'track' ? c.track?.id : undefined;
    const notesFile = s.stemNotes && trackId ? `${stemBase}.mid` : null;
    if (notesFile && trackId) files.push({ name: notesFile, blob: exportMidi(engine, range, new Set([trackId])) });
    manifest.push({ name: c.settings.name, kind: c.kind, audio: `${stemBase}.${ext}`, notes: notesFile });
  }
  files.push({
    name: 'manifest.json',
    blob: new Blob([JSON.stringify(stemManifest(engine, rate, range, manifest), null, 2)], { type: 'application/json' }),
  });
  onProgress(0.98, 'Packing stems');
  const zip = await writeZip(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
  onProgress(1, 'Done');
  return { files: [{ name: `${base} - stems.zip`, blob: zip }], gainDb: 0 };
}
