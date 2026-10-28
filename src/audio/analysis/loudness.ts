/**
 * Loudness analysis after ITU-R BS.1770-4 / EBU R128: K-weighting, gated integrated loudness,
 * max momentary (400 ms) and short-term (3 s), loudness range (LRA), true peak (4× oversampled),
 * sample peak, RMS and crest factor. Pure functions (used for export normalization and meters).
 */

export interface LoudnessResult {
  integrated: number;
  momentaryMax: number;
  shortTermMax: number;
  lra: number;
  truePeakDb: number;
  samplePeakDb: number;
  rmsDb: number;
  /** Peak-to-loudness ratio (true peak − integrated). */
  plr: number;
  /** Short-term loudness every 100 ms (for graphs). */
  shortTerm: Float32Array;
}

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** BS.1770 K-weighting filters for any sample rate (pre-filter shelf + RLB high-pass). */
export function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

function filterInPlace(x: Float64Array, f: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

const lufs = (ms: number) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
const db = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

/** Bessel I0 for the Kaiser window. */
function i0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 30; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
  }
  return sum;
}

let TP_KERNEL: Float64Array[] | null = null;
const TP_TAPS = 48;

/** 4× polyphase interpolation kernels (Kaiser-windowed sinc, 48 taps per phase). */
function tpKernel(): Float64Array[] {
  if (TP_KERNEL) return TP_KERNEL;
  const phases = 4;
  const beta = 7;
  const half = TP_TAPS / 2;
  TP_KERNEL = [];
  for (let p = 1; p < phases; p++) {
    const k = new Float64Array(TP_TAPS);
    for (let t = 0; t < TP_TAPS; t++) {
      const n = t - half + 1 - p / phases;
      const sinc = n === 0 ? 1 : Math.sin(Math.PI * n) / (Math.PI * n);
      const r = n / half;
      k[t] = Math.abs(r) >= 1 ? 0 : sinc * (i0(beta * Math.sqrt(1 - r * r)) / i0(beta));
    }
    TP_KERNEL.push(k);
  }
  return TP_KERNEL;
}

/** 4× oversampled true peak (linear). Interpolates around every sample pair that could exceed the running peak. */
export function truePeak(x: Float32Array): number {
  const kernel = tpKernel();
  const half = TP_TAPS / 2;
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > peak) peak = v;
  }
  for (let i = 0; i < x.length - 1; i++) {
    // an inter-sample peak needs at least one loud neighbour
    if (Math.abs(x[i]) + Math.abs(x[i + 1]) < peak * 0.6) continue;
    for (const k of kernel) {
      let s = 0;
      for (let t = 0; t < TP_TAPS; t++) {
        const j = i + t - half + 1;
        if (j >= 0 && j < x.length) s += x[j] * k[t];
      }
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  const [shelf, hp] = kWeighting(sampleRate);
  const len = channels[0]?.length ?? 0;
  const block = Math.round(sampleRate * 0.4);
  const hop = Math.round(sampleRate * 0.1);
  // per-100 ms mean squares (summed over channels)
  const hops = Math.floor(len / hop);
  const sq = new Float64Array(hops);
  let samplePeak = 0;
  let rmsSum = 0;
  for (const ch of channels.slice(0, 2)) {
    const w = Float64Array.from(ch);
    filterInPlace(w, shelf);
    filterInPlace(w, hp);
    for (let h = 0; h < hops; h++) {
      let s = 0;
      for (let i = h * hop, e = i + hop; i < e; i++) s += w[i] * w[i];
      sq[h] += s;
    }
    for (let i = 0; i < len; i++) {
      const v = Math.abs(ch[i]);
      if (v > samplePeak) samplePeak = v;
      rmsSum += ch[i] * ch[i];
    }
  }
  // momentary blocks (400 ms = 4 hops)
  const perBlock = block / hop;
  const blocks: number[] = [];
  let momentaryMax = -Infinity;
  for (let h = 0; h + perBlock <= hops; h++) {
    let s = 0;
    for (let k = 0; k < perBlock; k++) s += sq[h + k];
    const ms = s / block;
    blocks.push(ms);
    momentaryMax = Math.max(momentaryMax, lufs(ms));
  }
  // gating
  const abs = blocks.filter((ms) => lufs(ms) > -70);
  const ungated = abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : 0;
  const rel = lufs(ungated) - 10;
  const gated = abs.filter((ms) => lufs(ms) > rel);
  const integrated = gated.length ? lufs(gated.reduce((a, b) => a + b, 0) / gated.length) : -Infinity;
  // short-term (3 s = 30 hops) and LRA
  const st: number[] = [];
  for (let h = 0; h + 30 <= hops; h++) {
    let s = 0;
    for (let k = 0; k < 30; k++) s += sq[h + k];
    st.push(lufs(s / (30 * hop)));
  }
  const shortTermMax = st.length ? Math.max(...st) : momentaryMax;
  const stAbs = st.filter((v) => v > -70);
  const stMean = stAbs.length ? lufs(stAbs.map((v) => Math.pow(10, (v + 0.691) / 10)).reduce((a, b) => a + b, 0) / stAbs.length) : -Infinity;
  const stGated = stAbs.filter((v) => v > stMean - 20).sort((a, b) => a - b);
  const pct = (p: number) => stGated[Math.min(stGated.length - 1, Math.max(0, Math.round((p / 100) * (stGated.length - 1))))];
  const lra = stGated.length > 1 ? pct(95) - pct(10) : 0;
  const tp = Math.max(...channels.slice(0, 2).map(truePeak));
  return {
    integrated,
    momentaryMax,
    shortTermMax,
    lra,
    truePeakDb: db(tp),
    samplePeakDb: db(samplePeak),
    rmsDb: db(Math.sqrt(rmsSum / Math.max(1, len * Math.min(2, channels.length)))),
    plr: db(tp) - integrated,
    shortTerm: Float32Array.from(st),
  };
}
