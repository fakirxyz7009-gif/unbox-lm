/**
 * Offline DSP for the instrument converter (plain float arrays, no audio APIs): layer mixing
 * with gain / pan / static filters / baked envelopes, tail trimming, onset detection (chopping
 * a recording of separate hits or notes), YIN pitch detection, and seamless sustain loops
 * (crossfade baked into the sample).
 */
import { emptyPcm, type Pcm } from './pcm.ts';

export function peakOf(p: Pcm): number {
  let m = 0;
  for (let i = 0; i < p.data.length; i++) {
    const a = Math.abs(p.data[i]);
    if (a > m) m = a;
  }
  return m;
}

/** Both channels carry the same signal (mono recording): store it as mono, half the memory. */
export function isMono(p: Pcm): boolean {
  const tol = Math.max(1e-6, peakOf(p) * 1e-4);
  for (let i = 0; i < p.frames; i++) if (Math.abs(p.data[i * 2] - p.data[i * 2 + 1]) > tol) return false;
  return true;
}

export function slice(p: Pcm, from: number, to = p.frames): Pcm {
  const a = Math.max(0, Math.min(p.frames, Math.round(from)));
  const b = Math.max(a, Math.min(p.frames, Math.round(to)));
  return { rate: p.rate, frames: b - a, data: p.data.slice(a * 2, b * 2) };
}

export function reverse(p: Pcm): Pcm {
  const out = emptyPcm(p.frames, p.rate);
  for (let i = 0; i < p.frames; i++) {
    out.data[i * 2] = p.data[(p.frames - 1 - i) * 2];
    out.data[i * 2 + 1] = p.data[(p.frames - 1 - i) * 2 + 1];
  }
  return out;
}

// ---------------------------------------------------------------- filters (RBJ biquads, in place)

type Coeffs = [number, number, number, number, number];

function biquad(type: 'lp' | 'hp' | 'bp' | 'peak', f: number, q: number, rate: number, gainDb = 0): Coeffs {
  const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.max(0.1, q));
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'hp') [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'bp') [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  else [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function runBiquad(p: Pcm, c: Coeffs): void {
  const [b0, b1, b2, a1, a2] = c;
  for (let ch = 0; ch < 2; ch++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = ch; i < p.data.length; i += 2) {
      const x = p.data[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      p.data[i] = y;
    }
  }
}

/** SFZ fil_type (lpf_1p/2p, hpf_1p/2p, bpf_2p …) at a fixed cutoff. Unknown types pass through. */
export function sfzFilter(p: Pcm, type: string, cutoff: number, resonanceDb: number): void {
  const kind = type.startsWith('lpf') ? 'lp' : type.startsWith('hpf') ? 'hp' : type.startsWith('bpf') ? 'bp' : null;
  if (!kind || !(cutoff > 0)) return;
  const q = 0.707 * Math.pow(10, resonanceDb / 20);
  runBiquad(p, biquad(kind, cutoff, q, p.rate));
  if (type.endsWith('_4p') || type.endsWith('_6p')) runBiquad(p, biquad(kind, cutoff, q, p.rate));
}

/** Peaking EQ; bandwidth in octaves. */
export function peakingEq(p: Pcm, freq: number, bwOct: number, gainDb: number): void {
  const q = Math.sqrt(Math.pow(2, bwOct)) / (Math.pow(2, bwOct) - 1 || 1);
  runBiquad(p, biquad('peak', freq, q, p.rate, gainDb));
}

// ---------------------------------------------------------------- envelopes / lengths

/** Bakes hold → decay → sustain (the part of an SFZ amp envelope that doesn't depend on note-off). */
export function bakeDecay(p: Pcm, holdSec: number, decaySec: number, sustain: number): void {
  if (sustain >= 0.999 || decaySec <= 0) return;
  const hold = Math.round(holdSec * p.rate);
  const tau = Math.max(1, (decaySec * p.rate) / 5);
  for (let i = hold; i < p.frames; i++) {
    const g = sustain + (1 - sustain) * Math.exp(-(i - hold) / tau);
    p.data[i * 2] *= g;
    p.data[i * 2 + 1] *= g;
  }
}

/** Mixes `src` into `dst` at frame `at` with gain and constant-power pan (-1..1). */
export function mixInto(dst: Pcm, src: Pcm, gain: number, pan: number, at = 0): void {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = gain * Math.cos(angle) * Math.SQRT2;
  const gr = gain * Math.sin(angle) * Math.SQRT2;
  const n = Math.min(src.frames, dst.frames - at);
  for (let i = 0; i < n; i++) {
    dst.data[(at + i) * 2] += src.data[i * 2] * gl;
    dst.data[(at + i) * 2 + 1] += src.data[i * 2 + 1] * gr;
  }
}

/** Cuts the tail once it stays below `floor` (absolute), with a short fade. */
export function trimTail(p: Pcm, floor: number, fadeSec = 0.015): Pcm {
  let last = 0;
  for (let i = p.frames - 1; i >= 0; i--) {
    if (Math.abs(p.data[i * 2]) > floor || Math.abs(p.data[i * 2 + 1]) > floor) {
      last = i;
      break;
    }
  }
  const fade = Math.round(fadeSec * p.rate);
  const out = slice(p, 0, Math.min(p.frames, last + fade));
  fadeOut(out, fade);
  return out;
}

export function fadeOut(p: Pcm, frames: number): void {
  const n = Math.min(frames, p.frames);
  for (let k = 0; k < n; k++) {
    const i = p.frames - n + k;
    const g = 1 - (k + 1) / n;
    p.data[i * 2] *= g;
    p.data[i * 2 + 1] *= g;
  }
}

export function fadeIn(p: Pcm, frames: number): void {
  const n = Math.min(frames, p.frames);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    p.data[i * 2] *= g;
    p.data[i * 2 + 1] *= g;
  }
}

/** Limits length to `maxSec`, fading the last part out naturally. */
export function capLength(p: Pcm, maxSec: number): Pcm {
  const max = Math.round(maxSec * p.rate);
  if (p.frames <= max) return p;
  const out = slice(p, 0, max);
  fadeOut(out, Math.round(Math.min(0.4, maxSec * 0.2) * p.rate));
  return out;
}

// ---------------------------------------------------------------- onsets (chopping)

export interface Hit {
  start: number;
  end: number;
}

/**
 * Splits a recording of separate hits / notes: a hit starts when the level jumps from below
 * `thresholdDb` (relative to the loudest part), and ends at the next hit or when the level
 * stays under the threshold for `minGapSec`.
 */
export function findHits(p: Pcm, thresholdDb = -40, minGapSec = 0.12, minLenSec = 0.04): Hit[] {
  const hop = Math.max(1, Math.round(p.rate * 0.005));
  const env: number[] = [];
  for (let i = 0; i < p.frames; i += hop) {
    let s = 0;
    const n = Math.min(hop, p.frames - i);
    for (let k = 0; k < n; k++) {
      const l = p.data[(i + k) * 2];
      const r = p.data[(i + k) * 2 + 1];
      s += l * l + r * r;
    }
    env.push(Math.sqrt(s / (2 * n)));
  }
  const top = Math.max(...env, 1e-9);
  const on = top * Math.pow(10, thresholdDb / 20);
  const off = on * 0.5;
  const gap = Math.max(1, Math.round((minGapSec * p.rate) / hop));
  const hits: Hit[] = [];
  let inHit = false;
  let quiet = 0;
  let start = 0;
  for (let j = 0; j < env.length; j++) {
    const v = env[j];
    if (!inHit) {
      if (v > on) {
        inHit = true;
        quiet = 0;
        // back up to where the rise started
        let s = j;
        while (s > 0 && env[s - 1] < env[s] && env[s - 1] > off * 0.25) s--;
        start = s;
      }
    } else {
      // a sharp new attack inside a hit starts the next one
      const prev = env[Math.max(0, j - 2)];
      if (v > on && prev < v * 0.25 && j - start > gap) {
        hits.push({ start: start * hop, end: j * hop });
        start = j;
        quiet = 0;
        continue;
      }
      quiet = v < off ? quiet + 1 : 0;
      if (quiet >= gap) {
        hits.push({ start: start * hop, end: (j - quiet + 1) * hop });
        inHit = false;
      }
    }
  }
  if (inHit) hits.push({ start: start * hop, end: p.frames });
  return hits.filter((h) => h.end - h.start >= minLenSec * p.rate);
}

// ---------------------------------------------------------------- pitch (YIN)

/** Fundamental of a tonal sample as a MIDI note (fractional), or null if it isn't clear. */
export function detectPitch(p: Pcm, minHz = 27, maxHz = 4200): { midi: number; clarity: number } | null {
  // steady part: skip the attack, analyse up to ~0.5 s
  const from = Math.min(Math.round(p.rate * 0.08), Math.floor(p.frames * 0.2));
  const len = Math.min(Math.round(p.rate * 0.5), p.frames - from);
  const maxLag = Math.floor(p.rate / minHz);
  const minLag = Math.max(2, Math.floor(p.rate / maxHz));
  if (len < maxLag * 2) return null;
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) x[i] = (p.data[(from + i) * 2] + p.data[(from + i) * 2 + 1]) / 2;
  const W = len - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const v = x[i] - x[i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  const cm = new Float32Array(maxLag + 1).fill(1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? (d[tau] * (tau - minLag + 1)) / run : 1;
  }
  let best = -1;
  for (let tau = minLag + 1; tau < maxLag; tau++) {
    if (cm[tau] < 0.15 && cm[tau] <= cm[tau - 1] && cm[tau] <= cm[tau + 1]) {
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let min = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++)
      if (cm[tau] < min) {
        min = cm[tau];
        best = tau;
      }
    if (min > 0.35) return null;
  }
  // parabolic interpolation
  const a = cm[best - 1] ?? cm[best];
  const b = cm[best];
  const c = cm[best + 1] ?? cm[best];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  const hz = p.rate / (best + (Math.abs(shift) < 1 ? shift : 0));
  return { midi: 69 + 12 * Math.log2(hz / 440), clarity: 1 - b };
}

// ---------------------------------------------------------------- sustain loops

/**
 * Finds a loop in the steady part of a sustained sample and bakes a crossfade so it repeats
 * without a click. Returns loop [start, end] in frames, or null when the sample is too short.
 */
export function autoLoop(p: Pcm, periodFrames: number | null): [number, number] | null {
  const len = p.frames;
  if (len < p.rate * 0.6) return null;
  const start = Math.round(len * 0.35);
  let end = Math.round(len * 0.85);
  const xf = Math.min(Math.round(p.rate * 0.06), Math.floor((end - start) / 3));
  // search around `end` for the best match with the loop start (one period window)
  const win = Math.max(64, Math.min(2048, periodFrames ? Math.round(periodFrames * 2) : 512));
  const span = Math.round(periodFrames ? periodFrames * 1.5 : p.rate * 0.01);
  let bestErr = Infinity;
  let bestEnd = end;
  for (let e = end - span; e <= end + span; e++) {
    if (e + win >= len) break;
    let err = 0;
    for (let i = 0; i < win; i++) {
      const dl = p.data[(start + i) * 2] - p.data[(e + i) * 2];
      const dr = p.data[(start + i) * 2 + 1] - p.data[(e + i) * 2 + 1];
      err += dl * dl + dr * dr;
    }
    if (err < bestErr) {
      bestErr = err;
      bestEnd = e;
    }
  }
  end = bestEnd;
  // crossfade: the frames before `end` blend into the frames before `start`
  for (let k = 0; k < xf; k++) {
    const t = (k + 1) / xf;
    const gIn = Math.sin((t * Math.PI) / 2);
    const gOut = Math.cos((t * Math.PI) / 2);
    const i = end - xf + k;
    const j = start - xf + k;
    if (j < 0) continue;
    for (let ch = 0; ch < 2; ch++) p.data[i * 2 + ch] = p.data[i * 2 + ch] * gOut + p.data[j * 2 + ch] * gIn;
  }
  return [start, end];
}
