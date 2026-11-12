/**
 * The tempo of a clip. The onset strength (log-compressed spectral flux) is autocorrelated, and each candidate
 * tempo is scored with its beat multiples (a comb), so a clip whose beats repeat at 120 BPM is not read as 60
 * BPM, the half tempo that shares most of its peaks. A gentle prior favours tempi near 120 BPM, which breaks
 * the remaining ties between a tempo and its double. Pure math; no DOM or Node APIs.
 */
import { fft } from '../transcription/fft.ts';

const FRAME = 1024;
const HOP = 256;
const MIN_BPM = 50;
const MAX_BPM = 210;
const BPM_STEP = 0.25;
/** The first ninety seconds are enough for a tempo, and keep long files quick. */
const MAX_SECONDS = 90;
/** Beat multiples that vote for a candidate: the beat, the bar's halves and quarters. */
const COMB_WEIGHTS = [1, 0.5, 0.33, 0.25];
/** Half-octave-wide prior around 120 BPM (log2 units). */
const PRIOR_CENTRE = 120;
const PRIOR_WIDTH = 1.0;
/** Below this comb-to-energy ratio the onsets do not repeat: noise and steady tones fall under it. */
const MIN_STRENGTH = 0.08;

export interface TempoEstimate {
  /** Beats per minute, to a quarter of a BPM. */
  bpm: number;
  /** The beat's comb correlation over the onset envelope's energy, 0 to 1. A steady beat is well above 0.1. */
  strength: number;
}

/** Log-compressed spectral flux per hop: a large value is an attack. */
function onsetStrength(samples: Float32Array, sampleRate: number): Float64Array {
  const count = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const hann = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const bins = Math.floor((8000 / sampleRate) * FRAME);
  const previous = new Float64Array(bins);
  const flux = new Float64Array(count);
  for (let f = 0; f < count; f++) {
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let rise = 0;
    for (let k = 1; k < bins; k++) {
      const level = Math.log1p(100 * (Math.hypot(re[k], im[k]) / FRAME));
      if (level > previous[k]) rise += level - previous[k];
      previous[k] = level;
    }
    flux[f] = rise;
  }
  return flux;
}

/** The clip's tempo, or null when the clip has no steady beat. */
export function estimateTempo(samples: Float32Array, sampleRate: number): TempoEstimate | null {
  const length = Math.min(samples.length, Math.round(MAX_SECONDS * sampleRate));
  const flux = onsetStrength(samples.subarray(0, length), sampleRate);
  const framesPerSecond = sampleRate / HOP;
  if (flux.length < framesPerSecond * 2) return null;

  // Remove the slow drift (a one-second mean) so only the beats remain.
  const window = Math.round(framesPerSecond);
  const envelope = new Float64Array(flux.length);
  let running = 0;
  for (let i = 0; i < flux.length; i++) {
    running += flux[i];
    if (i >= window) running -= flux[i - window];
    const mean = running / Math.min(i + 1, window);
    envelope[i] = flux[i] - mean;
  }

  const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond * (COMB_WEIGHTS.length + 1));
  const autocorrelation = new Float64Array(Math.min(maxLag, envelope.length - 1) + 1);
  for (let lag = 0; lag < autocorrelation.length; lag++) {
    let sum = 0;
    for (let i = lag; i < envelope.length; i++) sum += envelope[i] * envelope[i - lag];
    autocorrelation[lag] = sum / (envelope.length - lag);
  }
  const at = (lag: number): number => {
    const whole = Math.floor(lag);
    if (whole + 1 >= autocorrelation.length) return 0;
    const frac = lag - whole;
    return autocorrelation[whole] * (1 - frac) + autocorrelation[whole + 1] * frac;
  };

  const energy = autocorrelation[0];
  if (!(energy > 0)) return null;
  const scores: { bpm: number; comb: number; score: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += BPM_STEP) {
    const lag = (60 / bpm) * framesPerSecond;
    let comb = 0;
    COMB_WEIGHTS.forEach((weight, i) => {
      comb += weight * at((i + 1) * lag);
    });
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / PRIOR_CENTRE) / PRIOR_WIDTH, 2));
    scores.push({ bpm, comb, score: comb * prior });
  }
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i].score > scores[best].score) best = i;
  // The beat's comb relative to the envelope's own energy: near 0 for noise and steady tones, well above for a beat.
  const strength = scores[best].comb / energy;
  if (!(scores[best].score > 0) || strength < MIN_STRENGTH) return null;
  return { bpm: Math.round(scores[best].bpm * 4) / 4, strength };
}
