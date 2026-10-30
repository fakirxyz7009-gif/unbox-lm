/**
 * The key of a clip: its average pitch-class energy (a chroma vector) is correlated with the twelve major and
 * twelve minor key profiles of Krumhansl and Kessler, and the best match is the key. The chroma is built from
 * a long spectrum, so low notes keep their pitch class. Pure math; no DOM or Node APIs.
 */
import { fft } from '../transcription/fft.ts';

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface KeyEstimate {
  /** Tonic pitch class: 0 = C … 11 = B (the same numbering as the engine's rootKey). */
  root: number;
  mode: 'major' | 'minor';
  /** For example "A minor". */
  name: string;
  /** Pearson correlation of the clip's chroma with the key's profile, from -1 to 1. */
  correlation: number;
  /** The lead of this key over the runner-up, 0 to 1. About 0.1 is a clear lead; near 0 the clip is ambiguous. */
  clarity: number;
}

/** Krumhansl and Kessler (1982) key profiles, from the tonic up. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const WINDOW = 8192;
const HOP = 4096;
const MIN_HZ = 55;
const MAX_HZ = 2000;
/** Only the first two minutes are read: a key is the same across a song's sections, and this keeps the work small. */
const MAX_SECONDS = 120;
/** Frames quieter than this share of the loudest frame are silence or a fade, not harmony. */
const QUIET_SHARE = 0.05;

/** The clip's chroma: energy per pitch class, each frame normalised to a unit sum, averaged over the loud frames. */
export function chromaOf(samples: Float32Array, sampleRate: number): Float64Array | null {
  const length = Math.min(samples.length, Math.round(MAX_SECONDS * sampleRate));
  const binHz = sampleRate / WINDOW;
  const pitchClass = new Int8Array(WINDOW / 2);
  for (let k = 0; k < WINDOW / 2; k++) {
    const hz = k * binHz;
    pitchClass[k] = hz < MIN_HZ || hz > MAX_HZ ? -1 : ((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12;
  }
  const hann = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);

  const frames: Float64Array[] = [];
  const energies: number[] = [];
  for (let start = 0; start + WINDOW <= length; start += HOP) {
    for (let i = 0; i < WINDOW; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const chroma = new Float64Array(12);
    let total = 0;
    for (let k = 1; k < WINDOW / 2; k++) {
      const pc = pitchClass[k];
      if (pc < 0) continue;
      const power = re[k] * re[k] + im[k] * im[k];
      chroma[pc] += power;
      total += power;
    }
    frames.push(chroma);
    energies.push(total);
  }
  const loudest = Math.max(0, ...energies);
  if (!(loudest > 0)) return null;

  const sum = new Float64Array(12);
  let used = 0;
  frames.forEach((chroma, f) => {
    if (energies[f] < QUIET_SHARE * loudest) return;
    for (let pc = 0; pc < 12; pc++) sum[pc] += chroma[pc] / energies[f];
    used++;
  });
  if (used === 0) return null;
  for (let pc = 0; pc < 12; pc++) sum[pc] /= used;
  return sum;
}

/** The profile for a tonic at `root`: the value for pitch class p is profile[(p - root) mod 12]. */
function rotated(profile: readonly number[], root: number): number[] {
  return Array.from({ length: 12 }, (_, pc) => profile[(pc - root + 12) % 12]);
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < 12; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= 12;
  meanB /= 12;
  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < 12; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cross += da * db;
    varA += da * da;
    varB += db * db;
  }
  return varA > 0 && varB > 0 ? cross / Math.sqrt(varA * varB) : 0;
}

/** The most likely key of a clip, or null when it has no pitched content. */
export function detectKey(samples: Float32Array, sampleRate: number): KeyEstimate | null {
  const chroma = chromaOf(samples, sampleRate);
  if (!chroma) return null;
  const scores: { root: number; mode: 'major' | 'minor'; correlation: number }[] = [];
  for (let root = 0; root < 12; root++) {
    scores.push({ root, mode: 'major', correlation: pearson(chroma, rotated(MAJOR_PROFILE, root)) });
    scores.push({ root, mode: 'minor', correlation: pearson(chroma, rotated(MINOR_PROFILE, root)) });
  }
  scores.sort((a, b) => b.correlation - a.correlation);
  const [best, runnerUp] = scores;
  return {
    root: best.root,
    mode: best.mode,
    name: `${PITCH_NAMES[best.root]} ${best.mode}`,
    correlation: best.correlation,
    clarity: Math.max(0, Math.min(1, best.correlation - runnerUp.correlation)),
  };
}
