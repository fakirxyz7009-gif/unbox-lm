/**
 * Band-limited resampling: each output sample is a Blackman-windowed sinc over the nearest input samples, with
 * the cutoff at 90 % of the lower of the two Nyquist frequencies, so no energy above the new Nyquist aliases in.
 * Pure math; no DOM or Node APIs.
 */
const HALF_TAPS = 16;

export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  // Cutoff as a fraction of the input's Nyquist frequency.
  const cutoff = 0.9 * Math.min(1, 1 / ratio);
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let o = 0; o < out.length; o++) {
    const centre = o * ratio;
    const first = Math.max(0, Math.ceil(centre - HALF_TAPS));
    const last = Math.min(samples.length - 1, Math.floor(centre + HALF_TAPS));
    let acc = 0;
    let norm = 0;
    for (let i = first; i <= last; i++) {
      const d = i - centre;
      const sinc = Math.abs(d) < 1e-9 ? cutoff : (Math.sin(Math.PI * cutoff * d) / (Math.PI * d));
      const window = 0.42 + 0.5 * Math.cos((Math.PI * d) / HALF_TAPS) + 0.08 * Math.cos((2 * Math.PI * d) / HALF_TAPS);
      const weight = sinc * window;
      acc += samples[i] * weight;
      norm += weight;
    }
    out[o] = norm !== 0 ? acc / norm : 0;
  }
  return out;
}
