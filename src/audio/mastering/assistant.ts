/**
 * Mix analysis and auto-mastering, measured on an offline render of the song:
 * loudness (BS.1770), octave-band spectrum and slope, stereo correlation (full band and lows).
 * Auto-master turns the measurements into mastering-chain settings with rule-of-thumb targets,
 * then re-renders and corrects the limiter gain until the loudness goal is met.
 */
import type { AudioEngine } from '../AudioEngine.ts';
import { measureLoudness, type LoudnessResult } from '../analysis/loudness.ts';
import { renderSong } from '../render/renderSong.ts';
import { DEFAULT_MASTERING, type MasteringState } from './MasteringChain.ts';

export interface MasterTarget {
  id: string;
  label: string;
  lufs: number;
  ceiling: number;
  style: 'gentle' | 'standard' | 'loud';
}

export const MASTER_TARGETS: MasterTarget[] = [
  { id: 'streaming', label: 'Streaming (Spotify / YouTube) −14 LUFS', lufs: -14, ceiling: -1, style: 'standard' },
  { id: 'apple', label: 'Apple Music / podcast −16 LUFS', lufs: -16, ceiling: -1, style: 'gentle' },
  { id: 'loud', label: 'Loud master (CD) −9 LUFS', lufs: -9, ceiling: -0.5, style: 'loud' },
  { id: 'club', label: 'Club / DJ −7 LUFS', lufs: -7, ceiling: -0.3, style: 'loud' },
];

/** Octave band centres (Hz). */
export const OCTAVES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** Typical slope of a finished modern mix (octave-band energy, 125 Hz–8 kHz). */
const REF_TILT = -3.5;

export interface MixAnalysis {
  loudness: LoudnessResult;
  /** Energy per octave band (dB, loudest band = 0). */
  octaves: number[];
  /** Slope of the octave-band energy 125 Hz–8 kHz, dB per octave. */
  tilt: number;
  /** Band energy minus the fitted slope (dB): where the mix bulges or dips. */
  residual: number[];
  /** L/R correlation of the whole mix and below 150 Hz (1 = mono, 0 = wide, < 0 = out of phase). */
  correlation: number;
  lowCorrelation: number;
  /** Side energy relative to mid (dB). */
  sideDb: number;
  seconds: number;
}

/* ------------------------------------------------------------------ analysis */

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const dB = (p: number) => (p > 1e-20 ? 10 * Math.log10(p) : -200);

export function analyzeChannels(L: Float32Array, R: Float32Array, sampleRate: number): MixAnalysis {
  const loudness = measureLoudness([L, R], sampleRate);
  // correlation (full band and lows through two one-pole low-passes at 150 Hz)
  const a = Math.exp((-2 * Math.PI * 150) / sampleRate);
  let lr = 0, ll = 0, rr = 0, mm = 0, ss = 0;
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0, blr = 0, bll = 0, brr = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const r = R[i];
    lr += l * r;
    ll += l * l;
    rr += r * r;
    mm += (l + r) * (l + r);
    ss += (l - r) * (l - r);
    l1 += (1 - a) * (l - l1);
    l2 += (1 - a) * (l1 - l2);
    r1 += (1 - a) * (r - r1);
    r2 += (1 - a) * (r1 - r2);
    blr += l2 * r2;
    bll += l2 * l2;
    brr += r2 * r2;
  }
  const corr = (x: number, y: number, z: number) => (y > 0 && z > 0 ? x / Math.sqrt(y * z) : 1);

  // average power spectrum of the mono sum over non-silent frames
  const N = 8192;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const power = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let frames = 0;
  for (let off = 0; off + N <= L.length; off += N) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const m = (L[off + i] + R[off + i]) * 0.5;
      e += m * m;
      re[i] = m * win[i];
      im[i] = 0;
    }
    if (e / N < 1e-6) continue; // below −60 dBFS: skip silence
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const band = OCTAVES.map((fc) => {
    const k0 = Math.max(1, Math.floor(((fc / Math.SQRT2) / sampleRate) * N));
    const k1 = Math.min(N / 2, Math.ceil(((fc * Math.SQRT2) / sampleRate) * N));
    let e = 0;
    for (let k = k0; k < k1; k++) e += power[k];
    return dB(e / Math.max(1, frames));
  });
  const top = Math.max(...band);
  const octaves = band.map((v) => Math.max(-90, v - top));
  // least-squares slope over 125 Hz … 8 kHz
  const idx = OCTAVES.map((f, i) => i).filter((i) => OCTAVES[i] >= 125 && OCTAVES[i] <= 8000);
  const xs = idx.map((i) => Math.log2(OCTAVES[i]));
  const ys = idx.map((i) => octaves[i]);
  const mx = xs.reduce((p, v) => p + v, 0) / xs.length;
  const my = ys.reduce((p, v) => p + v, 0) / ys.length;
  const tilt = xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0) / xs.reduce((p, x) => p + (x - mx) ** 2, 0);
  const residual = OCTAVES.map((f, i) => octaves[i] - (my + tilt * (Math.log2(f) - mx)));
  return {
    loudness,
    octaves,
    tilt,
    residual,
    correlation: corr(lr, ll, rr),
    lowCorrelation: corr(blr, bll, brr),
    sideDb: dB(ss) - dB(mm),
    seconds: L.length / sampleRate,
  };
}

/** Renders the song with the given mastering settings (null = mastering off). */
async function renderMix(engine: AudioEngine, mastering: MasteringState | null, onProgress?: (f: number) => void): Promise<AudioBuffer> {
  const chain = engine.mastering;
  const prev = chain.renderOverride;
  chain.renderOverride = mastering ?? { ...chain.state, enabled: false };
  try {
    return await renderSong(engine, {
      startPos: 0,
      endPos: engine.renderLength16ths(),
      sampleRate: 44100,
      tailSec: 1,
      masterProcessing: true,
      onProgress: onProgress && ((f) => onProgress(f)),
    });
  } finally {
    chain.renderOverride = prev;
  }
}

const channelsOf = (b: AudioBuffer): [Float32Array, Float32Array] => [b.getChannelData(0), b.getChannelData(b.numberOfChannels > 1 ? 1 : 0)];

export async function analyzeMix(engine: AudioEngine, withMastering: boolean, onProgress?: (f: number) => void): Promise<MixAnalysis> {
  const buf = await renderMix(engine, withMastering ? engine.mastering.state : null, onProgress);
  return analyzeChannels(...channelsOf(buf), buf.sampleRate);
}

/* ------------------------------------------------------------------ suggestions */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Mastering settings for a measured mix and a loudness goal, with the reasons. */
export function suggestMastering(m: MixAnalysis, target: MasterTarget): { state: MasteringState; notes: string[] } {
  const s = structuredClone(DEFAULT_MASTERING);
  const notes: string[] = [];
  s.enabled = true;
  const res = (hz: number) => m.residual[OCTAVES.indexOf(hz)] ?? 0;

  // low-cut: sub-sonic energy close to the bass octave is rumble
  if (m.octaves[0] > m.octaves[1] - 4) {
    s.eq.hp = 30;
    notes.push('Strong energy below 40 Hz: high-pass at 30 Hz.');
  } else s.eq.hp = 20;

  // overall tone vs a typical finished mix
  const dTilt = m.tilt - REF_TILT;
  if (dTilt < -1.5) {
    s.eq.bands[4].gain = r1(clamp(-dTilt * 1.2, 0.5, 3));
    notes.push(`Mix is dark (${r1(m.tilt)} dB/oct): +${s.eq.bands[4].gain} dB high shelf.`);
  } else if (dTilt > 1.5) {
    s.eq.bands[4].gain = -r1(clamp(dTilt * 1.2, 0.5, 3));
    notes.push(`Mix is bright (${r1(m.tilt)} dB/oct): ${s.eq.bands[4].gain} dB high shelf.`);
  }
  // bulges against the mix's own slope
  const low = (res(63) + res(125)) / 2;
  if (low > 3) {
    s.eq.bands[0].gain = -r1(clamp(low - 2, 0.5, 3));
    notes.push(`Heavy low end (+${r1(low)} dB): ${s.eq.bands[0].gain} dB low shelf.`);
  } else if (low < -4) {
    s.eq.bands[0].gain = r1(clamp(-low - 3, 0.5, 2.5));
    notes.push(`Thin low end (${r1(low)} dB): +${s.eq.bands[0].gain} dB low shelf.`);
  }
  const mud = (res(250) + res(500)) / 2;
  if (mud > 2.5) {
    s.eq.bands[1] = { type: 'peaking', freq: 300, gain: -r1(clamp(mud - 1.5, 0.5, 2.5)), q: 1, target: 'stereo' };
    notes.push(`Muddy low mids (+${r1(mud)} dB): ${s.eq.bands[1].gain} dB at 300 Hz.`);
  }
  const harsh = (res(2000) + res(4000)) / 2;
  if (harsh > 3) {
    s.eq.bands[3] = { type: 'peaking', freq: 3500, gain: -r1(clamp(harsh - 2, 0.5, 2.5)), q: 1.2, target: 'stereo' };
    notes.push(`Harsh upper mids (+${r1(harsh)} dB): ${s.eq.bands[3].gain} dB at 3.5 kHz.`);
  }

  // stereo
  s.imager.on = true;
  s.imager.width = 1;
  if (m.lowCorrelation < 0.7) {
    s.imager.monoBelow = 120;
    notes.push(`Wide bass (low correlation ${r1(m.lowCorrelation)}): bass made mono below 120 Hz.`);
  }
  if (m.correlation < 0.1) {
    s.imager.width = 0.85;
    notes.push(`Very wide / phasey mix (correlation ${r1(m.correlation)}): width reduced — check it in mono.`);
  } else if (m.sideDb < -45) {
    notes.push('The mix is mono: the imager cannot widen it — pan parts, or use stereo reverbs / chorus in the mix.');
  } else if (m.sideDb < -24) {
    s.imager.width = 1.15;
    notes.push('Almost mono mix: width +15 %.');
  }

  // dynamics by style
  if (target.style !== 'gentle') {
    s.multiband.on = true;
    s.multiband.bands.forEach((b) => {
      b.ratio = target.style === 'loud' ? 2.5 : 1.8;
      b.threshold = target.style === 'loud' ? -22 : -20;
    });
  }
  if (target.style === 'loud') {
    s.saturation = { on: true, mode: 'tape', drive: 0.3, mix: 0.5 };
    s.clipper = { on: true, driveDb: 1.5 };
    notes.push('Loud style: multiband glue, tape saturation and a soft clipper before the limiter.');
  }
  if (m.loudness.plr > 16 && target.style !== 'gentle') notes.push(`Very dynamic material (PLR ${r1(m.loudness.plr)} dB): expect audible limiting at this target.`);

  // loudness: the limiter makes up the difference (or the input trims a mix that is already louder)
  const diff = target.lufs - m.loudness.integrated;
  s.limiter = { on: true, gainDb: r1(Math.max(0, diff)), ceiling: target.ceiling, release: target.style === 'loud' ? 0.08 : 0.15, lookaheadMs: 5 };
  s.inputDb = r1(Math.min(0, diff));
  return { state: s, notes };
}

export interface AutoMasterResult {
  state: MasteringState;
  before: MixAnalysis;
  after: MixAnalysis;
  notes: string[];
}

/** Measures the mix, suggests settings and re-renders until the loudness lands within ±0.5 LU. */
export async function autoMaster(engine: AudioEngine, target: MasterTarget, onProgress?: (f: number, label: string) => void): Promise<AutoMasterResult> {
  onProgress?.(0, 'Rendering the mix');
  const before = await analyzeMix(engine, false, (f) => onProgress?.(f * 0.3, 'Rendering the mix'));
  if (!(before.loudness.integrated > -60)) throw new Error('The song is silent — add notes or audio first.');
  const { state, notes } = suggestMastering(before, target);
  let after = before;
  for (let pass = 0; pass < 4; pass++) {
    const label = `Loudness pass ${pass + 1}`;
    const buf = await renderMix(engine, state, (f) => onProgress?.(0.3 + (pass + f) * 0.17, label));
    after = analyzeChannels(...channelsOf(buf), buf.sampleRate);
    const diff = target.lufs - after.loudness.integrated;
    if (Math.abs(diff) <= 0.5) break;
    // positive: more limiter gain; negative: trim the input first
    const total = state.limiter.gainDb + state.inputDb + diff;
    state.limiter.gainDb = r1(clamp(total, 0, 24));
    state.inputDb = r1(clamp(Math.min(0, total), -24, 0));
    if (total > 24) {
      notes.push('The mix is too quiet to reach the target cleanly — raise the channel levels.');
      break;
    }
  }
  onProgress?.(1, 'Done');
  return { state, before, after, notes };
}
