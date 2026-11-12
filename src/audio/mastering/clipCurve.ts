/**
 * Soft-clipper curve for the mastering chain's WaveShaper. A WaveShaper reads its curve across inputs
 * in [-1, 1], so the curve is laid out over that span: below the knee the output equals the input
 * (unity gain), and full scale comes out just under 0 dBFS, leaving headroom for the limiter.
 */
export function clipCurve(n = 2049): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return c;
}
