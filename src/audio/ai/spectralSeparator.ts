/**
 * Source separation without a trained model. Pure: typed arrays in, typed arrays out (it runs in a
 * worker, see separatorWorker.ts, and in the Node tests).
 *
 * It works on the short-time spectrum of the stereo mix. Every frequency bin of every frame is shared
 * between the stems by three cues that can be measured:
 *  - percussive or harmonic: energy that is wide in frequency and short in time is a drum hit, energy
 *    that stays on its frequency is a held note (a median along each axis of the spectrogram);
 *  - stereo position: the same level and phase in both channels is the centre (lead vocal, bass, kick);
 *  - frequency: held lows are the bass.
 * The last stem of a mode is always "what is left", so the stems add up to the source exactly.
 *
 * This is signal processing, not a model that knows instruments: expect bleed (a kick's ring in the
 * bass, breathy or strongly bending notes in the drums). The trained separator is the cleaner one.
 */
import { fft } from '../../../shared/transcription/fft.ts';

export type StemSplitMode = '4stem' | '6stem' | '8stem';

export interface StemChannels {
  L: Float32Array;
  R: Float32Array;
}

/** Stems of each mode, in the order they are shown. The last one is the remainder. */
export const SPECTRAL_STEMS: Record<StemSplitMode, readonly string[]> = {
  '4stem': ['vocals', 'drums', 'bass', 'other'],
  '6stem': ['vocals', 'kick', 'snare', 'hat', 'bass', 'other'],
  '8stem': ['vocals', 'backing', 'kick', 'snare', 'hat', 'bass', 'wide', 'other'],
};

/**
 * Frames on each side of a frame that the "held note" test looks at, and their spacing: 3 frames = 64 ms,
 * so a hit (which the 85 ms window smears over the frames next to it) is in one of the five only.
 */
const TIME_STEP = 3;
const LAG = TIME_STEP * 2;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Middle value of five. */
function median5(a: number, b: number, c: number, d: number, e: number): number {
  // sorting network on the pairs, then the median of the middle candidates
  if (a > b) [a, b] = [b, a];
  if (d > e) [d, e] = [e, d];
  if (a > d) {
    [a, d] = [d, a];
    [b, e] = [e, b];
  }
  // a is the smallest of a, b, d, e: the median of five is the second smallest of b, c, d, e
  if (c > b) {
    if (b > d) return Math.min(b, e);
    return Math.min(c, d);
  }
  if (c > d) return Math.min(c, e);
  return Math.min(b, d);
}

/** Second smallest of five: high only when at least four of them are. */
function low5(a: number, b: number, c: number, d: number, e: number): number {
  let m1 = a;
  let m2 = Infinity;
  for (const v of [b, c, d, e]) {
    if (v < m1) {
      m2 = m1;
      m1 = v;
    } else if (v < m2) m2 = v;
  }
  return m2;
}

interface Frame {
  lr: Float32Array;
  li: Float32Array;
  rr: Float32Array;
  ri: Float32Array;
  mag: Float32Array;
  /** `mag` with each bin raised to its louder neighbour, so a note that bends a little still counts as held. */
  wide: Float32Array;
}

/**
 * Splits a stereo mix. `onProgress` is called with 0..1. The returned stems have the length of the
 * input; their sum is the input.
 */
export function separateSpectral(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  mode: StemSplitMode = '4stem',
  onProgress?: (done: number) => void
): Record<string, StemChannels> {
  const ids = SPECTRAL_STEMS[mode] ?? SPECTRAL_STEMS['4stem'];
  const len = Math.min(left.length, right.length);
  const out: Record<string, StemChannels> = {};
  for (const id of ids) out[id] = { L: new Float32Array(len), R: new Float32Array(len) };
  if (len === 0) return out;

  // an 85 ms window: fine enough in frequency to see between the partials of a low chord
  const N = sampleRate > 60000 ? 8192 : 4096;
  const hop = N / 4;
  const bins = N / 2 + 1;
  const binHz = sampleRate / N;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  // sqrt-Hann on both sides at a quarter-window hop overlaps to 2
  const olaGain = 0.5;

  // frequency weights
  const lowW = new Float32Array(bins); // held lows: bass
  const voiceW = new Float32Array(bins); // where a voice lives
  const kickW = new Float32Array(bins);
  const hatW = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const f = k * binHz;
    lowW[k] = 1 - smoothstep(110, 250, f);
    voiceW[k] = smoothstep(110, 220, f) * (1 - smoothstep(9000, 14000, f));
    kickW[k] = 1 - smoothstep(140, 260, f);
    hatW[k] = smoothstep(3500, 6000, f);
  }
  const fStep = Math.max(2, Math.round(95 / binHz)); // spacing of the "wide in frequency" test

  const frames: Frame[] = Array.from({ length: 2 * LAG + 1 }, () => ({
    lr: new Float32Array(bins),
    li: new Float32Array(bins),
    rr: new Float32Array(bins),
    ri: new Float32Array(bins),
    mag: new Float32Array(bins),
    wide: new Float32Array(bins),
  }));
  const ring = (i: number) => frames[((i % frames.length) + frames.length) % frames.length];

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const analyse = (src: Float32Array, start: number, outRe: Float32Array, outIm: Float32Array) => {
    for (let i = 0; i < N; i++) {
      const p = start + i;
      re[i] = p >= 0 && p < len ? src[p] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      outRe[k] = re[k];
      outIm[k] = im[k];
    }
  };
  /** Inverse transform of a half spectrum, windowed and added into `dst` at `start`. */
  const synth = (sr: Float32Array, si: Float32Array, dst: Float32Array, start: number) => {
    // the inverse of a real signal's spectrum by the forward transform of its conjugate
    for (let k = 0; k < bins; k++) {
      re[k] = sr[k];
      im[k] = -si[k];
    }
    for (let k = 1; k < bins - 1; k++) {
      re[N - k] = sr[k];
      im[N - k] = si[k];
    }
    fft(re, im);
    const g = olaGain / N;
    for (let i = 0; i < N; i++) {
      const p = start + i;
      if (p >= 0 && p < len) dst[p] += re[i] * win[i] * g;
    }
  };

  // work spectra of the stems of one frame
  const spec = () => ({ r: new Float32Array(bins), i: new Float32Array(bins) });
  const sVoc = spec();
  const sBackL = spec();
  const sBackR = spec();
  const sWideL = spec();
  const sWideR = spec();
  const sBassL = spec();
  const sBassR = spec();
  const sDrum = [spec(), spec(), spec(), spec(), spec(), spec()]; // [kick L, kick R, snare L, snare R, hat L, hat R] or [drums L, drums R]
  const splitDrums = mode !== '4stem';
  const eight = mode === '8stem';

  const lowBins = Math.ceil(260 / binHz);
  const gateDecay = Math.exp(-hop / sampleRate / 0.09);
  let kickGate = 0;

  const first = -3; // frames start before the audio, so its first samples get their full overlap
  const lastFrame = Math.ceil(len / hop);
  const total = lastFrame - first + 1 + LAG;
  for (let t = first, n = 0; t <= lastFrame + LAG; t++, n++) {
    // analyse frame t (silence past the end keeps the centre frames complete)
    const fr = ring(t - first);
    if (t <= lastFrame) {
      analyse(left, t * hop, fr.lr, fr.li);
      analyse(right, t * hop, fr.rr, fr.ri);
      for (let k = 0; k < bins; k++) fr.mag[k] = Math.sqrt(fr.lr[k] * fr.lr[k] + fr.li[k] * fr.li[k] + fr.rr[k] * fr.rr[k] + fr.ri[k] * fr.ri[k]);
    } else {
      fr.lr.fill(0);
      fr.li.fill(0);
      fr.rr.fill(0);
      fr.ri.fill(0);
      fr.mag.fill(0);
    }
    // One bin to each side only: looking further (for wide vibrato) made every bin near a chord's
    // partials count as held, and a hi-hat over a chord went to the instruments.
    for (let k = 0; k < bins; k++) {
      const a = fr.mag[k > 0 ? k - 1 : 0];
      const b = fr.mag[k < bins - 1 ? k + 1 : k];
      fr.wide[k] = Math.max(fr.mag[k], a, b);
    }

    const c = t - LAG; // the frame that now has its neighbours on both sides
    if (c < first) continue;
    const at = (d: number): Frame | null => (c + d < first ? null : ring(c + d - first));
    const cur = at(0)!;
    const m8 = at(-LAG);
    const m4 = at(-TIME_STEP);
    const p4 = at(TIME_STEP)!;
    const p8 = at(LAG)!;
    const { lr, li, rr, ri, mag } = cur;

    // low-end attack: the energy below ~250 Hz jumps against 40 ms earlier; it opens a gate that fades in ~0.2 s
    let lowNow = 0;
    let lowBefore = 0;
    for (let k = 0; k < lowBins; k++) {
      lowNow += mag[k] * mag[k];
      if (m4) lowBefore += m4.mag[k] * m4.mag[k];
    }
    kickGate *= gateDecay;
    if (lowNow > 1e-10 && lowNow > 2.2 * lowBefore) kickGate = 1;

    for (let k = 0; k < bins; k++) {
      const m0 = mag[k];
      if (m0 < 1e-9) {
        sVoc.r[k] = sVoc.i[k] = 0;
        sBassL.r[k] = sBassL.i[k] = sBassR.r[k] = sBassR.i[k] = 0;
        for (const s of sDrum) s.r[k] = s.i[k] = 0;
        if (eight) sBackL.r[k] = sBackL.i[k] = sBackR.r[k] = sBackR.i[k] = sWideL.r[k] = sWideL.i[k] = sWideR.r[k] = sWideR.i[k] = 0;
        continue;
      }
      // held over time?
      const held = median5(m8 ? m8.wide[k] : 0, m4 ? m4.wide[k] : 0, m0, p4.wide[k], p8.wide[k]);
      // wide in frequency? (bins mirrored at the edges)
      const k1 = Math.abs(k - fStep);
      const k2 = Math.abs(k - 2 * fStep);
      const k3 = k + fStep < bins ? k + fStep : 2 * (bins - 1) - (k + fStep);
      const k4 = k + 2 * fStep < bins ? k + 2 * fStep : 2 * (bins - 1) - (k + 2 * fStep);
      // a drum hit fills (nearly) all of them; the partials of a chord leave gaps
      const broad = low5(mag[k2], mag[k1], m0, mag[k3], mag[k4]);
      const h2 = held * held;
      const p2 = broad * broad;
      let harm = h2 / (h2 + p2 + 1e-18);
      // A kick's body is a low tone, narrow like a bass note. What tells it apart is that it dies away
      // within a tenth of a second of a low-end attack, while a bass note holds.
      if (kickGate > 0.02 && kickW[k] > 0) {
        // only the part that will be gone 64 ms later: a bass note under the kick keeps its share
        const dying = Math.min(1, 1.25 * Math.max(0, 1 - p4.mag[k] / m0));
        harm = Math.min(harm, 1 - dying * kickGate * kickW[k]);
      }
      const perc = 1 - harm;

      // stereo position: 1 = the same in both channels, 0 = one side only, below 0 = out of phase
      const cross = lr[k] * rr[k] + li[k] * ri[k];
      const pw = m0 * m0;
      const psi = (2 * cross) / pw;
      const centre = smoothstep(0.7, 0.96, psi);

      const low = lowW[k];
      const bass = harm * low;
      sBassL.r[k] = lr[k] * bass;
      sBassL.i[k] = li[k] * bass;
      sBassR.r[k] = rr[k] * bass;
      sBassR.i[k] = ri[k] * bass;

      // the voice is taken from the centre signal, so a side instrument in the same bin stays out of it
      const voc = harm * (1 - low) * voiceW[k] * centre * 0.5;
      sVoc.r[k] = (lr[k] + rr[k]) * voc;
      sVoc.i[k] = (li[k] + ri[k]) * voc;

      if (splitDrums) {
        const kick = perc * kickW[k];
        const hat = perc * hatW[k];
        const snare = perc - kick - hat;
        sDrum[0].r[k] = lr[k] * kick;
        sDrum[0].i[k] = li[k] * kick;
        sDrum[1].r[k] = rr[k] * kick;
        sDrum[1].i[k] = ri[k] * kick;
        sDrum[2].r[k] = lr[k] * snare;
        sDrum[2].i[k] = li[k] * snare;
        sDrum[3].r[k] = rr[k] * snare;
        sDrum[3].i[k] = ri[k] * snare;
        sDrum[4].r[k] = lr[k] * hat;
        sDrum[4].i[k] = li[k] * hat;
        sDrum[5].r[k] = rr[k] * hat;
        sDrum[5].i[k] = ri[k] * hat;
      } else {
        sDrum[0].r[k] = lr[k] * perc;
        sDrum[0].i[k] = li[k] * perc;
        sDrum[1].r[k] = rr[k] * perc;
        sDrum[1].i[k] = ri[k] * perc;
      }

      if (eight) {
        // held notes that are near the centre but not on it, and the ones that are out of phase
        const mid = harm * (1 - low);
        const back = mid * voiceW[k] * (smoothstep(0.3, 0.7, psi) - centre);
        const wide = mid * smoothstep(0, -0.5, psi);
        sBackL.r[k] = lr[k] * back;
        sBackL.i[k] = li[k] * back;
        sBackR.r[k] = rr[k] * back;
        sBackR.i[k] = ri[k] * back;
        sWideL.r[k] = lr[k] * wide;
        sWideL.i[k] = li[k] * wide;
        sWideR.r[k] = rr[k] * wide;
        sWideR.i[k] = ri[k] * wide;
      }
    }

    const start = c * hop;
    synth(sBassL.r, sBassL.i, out.bass.L, start);
    synth(sBassR.r, sBassR.i, out.bass.R, start);
    synth(sVoc.r, sVoc.i, out.vocals.L, start);
    if (splitDrums) {
      synth(sDrum[0].r, sDrum[0].i, out.kick.L, start);
      synth(sDrum[1].r, sDrum[1].i, out.kick.R, start);
      synth(sDrum[2].r, sDrum[2].i, out.snare.L, start);
      synth(sDrum[3].r, sDrum[3].i, out.snare.R, start);
      synth(sDrum[4].r, sDrum[4].i, out.hat.L, start);
      synth(sDrum[5].r, sDrum[5].i, out.hat.R, start);
    } else {
      synth(sDrum[0].r, sDrum[0].i, out.drums.L, start);
      synth(sDrum[1].r, sDrum[1].i, out.drums.R, start);
    }
    if (eight) {
      synth(sBackL.r, sBackL.i, out.backing.L, start);
      synth(sBackR.r, sBackR.i, out.backing.R, start);
      synth(sWideL.r, sWideL.i, out.wide.L, start);
      synth(sWideR.r, sWideR.i, out.wide.R, start);
    }
    if (onProgress && n % 64 === 0) onProgress(Math.min(0.99, n / total));
  }

  // the centre voice is one signal for both sides
  out.vocals.R.set(out.vocals.L);
  // what is left
  const rest = out[ids[ids.length - 1]];
  rest.L.set(left.subarray(0, len));
  rest.R.set(right.subarray(0, len));
  for (let s = 0; s < ids.length - 1; s++) {
    const st = out[ids[s]];
    for (let i = 0; i < len; i++) {
      rest.L[i] -= st.L[i];
      rest.R[i] -= st.R[i];
    }
  }
  onProgress?.(1);
  return out;
}
