/**
 * Note estimates from a separated stem. No trained model: drums come from spectral onsets, each
 * classified by its band energy (kick / snare / hat); a monophonic line (bass, vocals) comes from a
 * YIN pitch track. Several notes at once (keys, guitar, the "other" stem) are left to polyphonic.ts.
 * Pure math; no DOM or Node APIs, so it runs in the browser and in tests.
 */
import { fft } from './fft.ts';

export type DrumClass = 'kick' | 'snare' | 'hat';

export interface DrumHit {
  /** Seconds from the start of the stem. */
  time: number;
  cls: DrumClass;
  /** 0–1, from the strength of the onset. */
  velocity: number;
}

export interface TimedNote {
  /** Seconds from the start of the stem. */
  start: number;
  end: number;
  /** MIDI note number. */
  note: number;
  /** 0–1. */
  velocity: number;
}

/** The Redrum kit lanes the drum hits are written to (Kick, Snare, Closed Hat). */
export const DRUM_LANE_NOTE: Record<DrumClass, number> = { kick: 60, snare: 61, hat: 62 };

const FRAME = 1024;
/** Drum analysis frames per second (10 ms hop). */
const DRUM_FRAME_RATE = 100;
const COMPRESS = 1000;
/** Flux below this, in the whole clip, is no attack at all. */
const MIN_FLUX = 1e-3;
/** Band strength (0–1, relative to the loudest onset of the band) an onset needs to count as that drum. */
const KICK_MIN = 0.4;
const SNARE_MIN = 0.5;
const HAT_MIN = 0.4;
/**
 * A low onset is a kick only when this share of the attack's energy is below 100 Hz. Measured: a kick
 * reads 0.4–0.5 (less with a snare on the same beat), a snare about 0.1.
 */
const KICK_BASS_SHARE = 0.3;
const PITCH_RATE = 8000;
const PITCH_WINDOW = 384;
const YIN_THRESHOLD = 0.15;
const MIN_HZ = 40;
const MAX_HZ = 1000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Per analysis frame, for three bands: 30–100 Hz (kick), 100 Hz–4 kHz (snare body), 4–12 kHz (snap, hats). */
interface BandFrames {
  /** Spectral flux: a large value is an attack in that band. */
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  /** Energy per hop of the signal below 100 Hz, and of the whole signal: the bass share of an attack. */
  bassPower: Float32Array;
  totalPower: Float32Array;
}

function bandFrames(samples: Float32Array, sampleRate: number): BandFrames {
  const hop = Math.max(1, Math.round(sampleRate / DRUM_FRAME_RATE));
  const count = samples.length < FRAME ? 0 : Math.floor((samples.length - FRAME) / hop) + 1;
  const binHz = sampleRate / FRAME;
  const bin = (hz: number) => Math.round(hz / binHz);
  const lo = bin(30);
  const hi = Math.min(FRAME / 2, bin(12000));
  // The kick band stops at 100 Hz: above that a snare's body leaks into the lowest bins and reads as a kick.
  const lowEnd = bin(100);
  const midEnd = bin(4000);
  // Mean flux per bin, so a band with many bins (the highs) does not outweigh the others.
  const binsLow = Math.max(1, lowEnd - lo + 1);
  const binsMid = Math.max(1, midEnd - lowEnd);
  const binsHigh = Math.max(1, hi - midEnd);
  const hann = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const prevLog = new Float64Array(FRAME / 2 + 1);
  const low = new Float32Array(count);
  const mid = new Float32Array(count);
  const high = new Float32Array(count);
  // Second-order low-pass at 100 Hz on the time signal: the bass energy of each hop, beside the total.
  const w0 = (2 * Math.PI * 100) / sampleRate;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const norm = 1 + alpha;
  const b0 = (1 - cosW) / 2 / norm;
  const b1 = (1 - cosW) / norm;
  const a1 = (-2 * cosW) / norm;
  const a2 = (1 - alpha) / norm;
  const blocks = Math.ceil(samples.length / hop);
  const bassPower = new Float32Array(blocks);
  const totalPower = new Float32Array(blocks);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < samples.length; n++) {
    const x = samples[n];
    const y = b0 * (x + x2) + b1 * x1 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    const block = Math.floor(n / hop);
    bassPower[block] += y * y;
    totalPower[block] += x * x;
  }

  for (let f = 0; f < count; f++) {
    const start = f * hop;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let fLow = 0;
    let fMid = 0;
    let fHigh = 0;
    for (let k = lo; k <= hi; k++) {
      const mag = Math.hypot(re[k], im[k]) / FRAME;
      const logMag = Math.log(1 + COMPRESS * mag);
      const rise = f > 0 && logMag > prevLog[k] ? logMag - prevLog[k] : 0;
      prevLog[k] = logMag;
      if (k <= lowEnd) fLow += rise;
      else if (k <= midEnd) fMid += rise;
      else fHigh += rise;
    }
    low[f] = fLow / binsLow;
    mid[f] = fMid / binsMid;
    high[f] = fHigh / binsHigh;
  }
  return { low, mid, high, bassPower, totalPower };
}

/** Median of flux over [from, to), used as the local level an onset must rise above. */
function localMedian(values: Float32Array, from: number, to: number): number {
  const around = values.slice(Math.max(0, from), Math.min(values.length, to));
  around.sort();
  return around[around.length >> 1] ?? 0;
}

interface Onset {
  /** Analysis frame of the attack. */
  frame: number;
  cls: DrumClass;
  /** The attack's flux relative to the loudest attack of its band, 0–1. */
  strength: number;
}

/** Local maxima of one band's flux that rise above the local level, at least 60 ms apart. */
function bandOnsets(flux: Float32Array, cls: DrumClass): Onset[] {
  let max = 0;
  for (let i = 0; i < flux.length; i++) if (flux[i] > max) max = flux[i];
  // A steady tone's flux is rounding noise (about 1e-6): without a floor, its noise peaks read as onsets.
  if (!(max > MIN_FLUX)) return [];
  const floor = 0.12 * max;
  const found: Onset[] = [];
  for (let f = 1; f < flux.length - 1; f++) {
    const v = flux[f];
    if (v <= flux[f - 1] || v < flux[f + 1]) continue;
    let isMax = true;
    for (let k = Math.max(0, f - 3); k <= Math.min(flux.length - 1, f + 3); k++) {
      if (flux[k] > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    if (v < localMedian(flux, f - 20, f + 21) + floor) continue;
    const onset: Onset = { frame: f, cls, strength: v / max };
    const last = found[found.length - 1];
    if (last && f - last.frame < 6) {
      if (onset.strength > last.strength) found[found.length - 1] = onset;
    } else {
      found.push(onset);
    }
  }
  return found;
}

/** Share of an attack's energy below 100 Hz, over its first 50 ms. */
function bassShare(frames: BandFrames, frame: number): number {
  let bass = 0;
  let total = 0;
  for (let k = Math.max(0, frame - 1); k <= Math.min(frames.totalPower.length - 1, frame + 3); k++) {
    bass += frames.bassPower[k];
    total += frames.totalPower[k];
  }
  return total > 0 ? bass / total : 0;
}

/**
 * Onsets of the three bands, grouped into attacks (onsets within 40 ms are one attack). Each band
 * votes for its drum: a strong low onset that carries bass energy is a kick, a strong mid onset a
 * snare, a strong high onset without a snare a hat. A kick and a snare on the same beat are both
 * kept. Measured on a separated drum stem: kick attacks read low ~0.9, snare attacks mid ~0.9, hat
 * attacks high ~0.75 with mid ~0.27. A snare's body leaks into the low band, so the bass share
 * decides the kick: a synthetic snare read low 0.64 but a bass share of 0.3.
 */
function drumOnsets(frames: BandFrames): Onset[] {
  const all = [
    ...bandOnsets(frames.low, 'kick'),
    ...bandOnsets(frames.mid, 'snare'),
    ...bandOnsets(frames.high, 'hat'),
  ].sort((a, b) => a.frame - b.frame);
  const attacks: Onset[][] = [];
  for (const onset of all) {
    const last = attacks[attacks.length - 1];
    if (last && onset.frame - last[last.length - 1].frame < 4) last.push(onset);
    else attacks.push([onset]);
  }
  const hits: Onset[] = [];
  for (const attack of attacks) {
    const strongest = (cls: DrumClass) => attack.filter((o) => o.cls === cls).sort((a, b) => b.strength - a.strength)[0];
    const kick = strongest('kick');
    const snare = strongest('snare');
    const hat = strongest('hat');
    if (kick && kick.strength >= KICK_MIN && bassShare(frames, attack[0].frame) >= KICK_BASS_SHARE) hits.push(kick);
    if (snare && snare.strength >= SNARE_MIN) hits.push(snare);
    if (hat && hat.strength >= HAT_MIN && !(snare && snare.strength >= SNARE_MIN)) hits.push(hat);
  }
  return hits.sort((a, b) => a.frame - b.frame);
}

/** Tempo from the intervals between onsets, folded into 70–180 BPM. Null without enough onsets. */
export function estimateTempo(times: number[]): number | null {
  const counts = new Float64Array(181);
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length && times[j] - times[i] <= 2; j++) {
      const gap = times[j] - times[i];
      // Simultaneous hits (one attack, two drums) have no spacing to read.
      if (!(gap > 0)) continue;
      let bpm = 60 / gap;
      while (bpm < 70) bpm *= 2;
      while (bpm >= 180) bpm /= 2;
      counts[Math.round(bpm)] += 1;
    }
  }
  let best = -1;
  let bestScore = 0;
  for (let b = 70; b < 180; b++) {
    const score = counts[b] + 0.5 * (counts[b - 1] + counts[b + 1]);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Drum hits of a percussion stem, with the tempo their spacing suggests. */
export function transcribeDrums(samples: Float32Array, sampleRate: number): { hits: DrumHit[]; tempo: number | null } {
  const hop = Math.max(1, Math.round(sampleRate / DRUM_FRAME_RATE));
  const hits: DrumHit[] = drumOnsets(bandFrames(samples, sampleRate)).map((o) => ({
    time: (o.frame * hop + FRAME / 2) / sampleRate,
    cls: o.cls,
    velocity: clamp(0.4 + 0.6 * o.strength, 0.3, 1),
  }));
  return { hits, tempo: estimateTempo(hits.map((h) => h.time)) };
}

export interface PitchFrame {
  /** Seconds from the start of the stem. */
  time: number;
  /** Fundamental in Hz; 0 when the frame is unvoiced. */
  f0: number;
  rms: number;
}

/** Decimates to about 8 kHz (windowed-sinc low-pass), which keeps bass and voice fundamentals. */
function decimate(samples: Float32Array, sampleRate: number): { x: Float32Array; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / PITCH_RATE));
  const rate = sampleRate / factor;
  if (factor === 1) return { x: samples, rate };
  const taps = 31;
  const half = (taps - 1) / 2;
  const cutoff = (0.4 * rate) / sampleRate;
  const kernel = new Float64Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - half;
    const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    kernel[i] = sinc * w;
    sum += kernel[i];
  }
  for (let i = 0; i < taps; i++) kernel[i] /= sum;
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let o = 0; o < out.length; o++) {
    const centre = o * factor;
    let acc = 0;
    for (let i = 0; i < taps; i++) {
      const idx = centre + i - half;
      if (idx >= 0 && idx < samples.length) acc += kernel[i] * samples[idx];
    }
    out[o] = acc;
  }
  return { x: out, rate };
}

/** YIN pitch track (de Cheveigné & Kawahara, 2002) on a decimated copy of the stem. */
export function trackPitch(samples: Float32Array, sampleRate: number): PitchFrame[] {
  const { x, rate } = decimate(samples, sampleRate);
  const W = PITCH_WINDOW;
  const hop = Math.max(1, Math.round(rate * 0.016));
  const tauMin = Math.max(2, Math.floor(rate / MAX_HZ));
  const tauMax = Math.min(W - 1, Math.ceil(rate / MIN_HZ));
  const diff = new Float64Array(tauMax + 1);
  const cmnd = new Float64Array(tauMax + 1);
  const frames: PitchFrame[] = [];
  for (let s = 0; s + W + tauMax < x.length; s += hop) {
    let energy = 0;
    for (let j = 0; j < W; j++) energy += x[s + j] * x[s + j];
    for (let tau = 1; tau <= tauMax; tau++) {
      let acc = 0;
      for (let j = 0; j < W; j++) {
        const d = x[s + j] - x[s + j + tau];
        acc += d * d;
      }
      diff[tau] = acc;
    }
    let running = 0;
    cmnd[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau];
      cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmnd[t] < YIN_THRESHOLD) {
        let best = t;
        while (best + 1 < tauMax && cmnd[best + 1] < cmnd[best]) best++;
        tau = best;
        break;
      }
    }
    let f0 = 0;
    if (tau > 0 && tau + 1 <= tauMax) {
      const a = cmnd[tau - 1];
      const b = cmnd[tau];
      const c = cmnd[tau + 1];
      const curvature = a - 2 * b + c;
      const shift = curvature !== 0 ? (0.5 * (a - c)) / curvature : 0;
      const hz = rate / (tau + shift);
      if (hz >= MIN_HZ && hz <= MAX_HZ) f0 = hz;
    }
    frames.push({ time: (s + W / 2) / rate, f0, rms: Math.sqrt(energy / W) });
  }
  return frames;
}

/**
 * Notes of a monophonic pitch track: the MIDI pitch per voiced frame, smoothed over three frames,
 * merged while the pitch holds (a gap of up to two unvoiced frames is bridged), and dropped below 80 ms.
 */
export function melodyNotes(frames: PitchFrame[]): TimedNote[] {
  if (frames.length === 0) return [];
  const hop = frames.length > 1 ? frames[1].time - frames[0].time : 0.016;
  const raw = frames.map((f) => (f.f0 > 0 ? Math.round(69 + 12 * Math.log2(f.f0 / 440)) : null));
  const smooth = raw.map((m, i) => {
    if (m === null) return null;
    const around = [raw[i - 1], m, raw[i + 1]].filter((v): v is number => v !== null && v !== undefined).sort((a, b) => a - b);
    return around[Math.floor(around.length / 2)];
  });
  const voiced = frames.filter((f) => f.f0 > 0).map((f) => f.rms).sort((a, b) => a - b);
  const reference = voiced.length ? voiced[Math.floor(0.95 * (voiced.length - 1))] : 1;
  const notes: { note: number; start: number; end: number; peak: number }[] = [];
  let current: (typeof notes)[number] | null = null;
  let gap = 0;
  for (let i = 0; i < frames.length; i++) {
    const m = smooth[i];
    if (m === null || m === undefined || m < 0 || m > 127) {
      gap++;
      if (current && gap > 2) {
        notes.push(current);
        current = null;
      }
      continue;
    }
    gap = 0;
    if (current && current.note === m) {
      current.end = frames[i].time + hop;
      current.peak = Math.max(current.peak, frames[i].rms);
    } else {
      if (current) notes.push(current);
      current = { note: m, start: frames[i].time, end: frames[i].time + hop, peak: frames[i].rms };
    }
  }
  if (current) notes.push(current);
  return notes
    .filter((n) => n.end - n.start >= 0.08)
    .map((n) => ({ start: n.start, end: n.end, note: n.note, velocity: clamp(0.35 + (0.65 * n.peak) / (reference || 1), 0.3, 1) }));
}

/** Notes of a monophonic stem (bass, vocals). */
export function transcribeMelody(samples: Float32Array, sampleRate: number): TimedNote[] {
  return melodyNotes(trackPitch(samples, sampleRate));
}

/** Seconds to 16th-note steps at a tempo (the piano roll's unit). */
export function secondsToSteps(seconds: number, bpm: number): number {
  return (seconds * bpm * 4) / 60;
}
