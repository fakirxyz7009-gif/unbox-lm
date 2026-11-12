/**
 * 'unbox-meter' AudioWorklet (pass-through): live loudness after BS.1770-4 / EBU R128 —
 * momentary (400 ms), short-term (3 s), gated integrated loudness and loudness range since the
 * last reset — plus 4× true peak, sample peak, RMS and L/R correlation. Posts a reading every
 * 100 ms. Self-contained (loaded through a Blob URL like the other worklets).
 */

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

export interface MeterReading {
  momentary: number;
  shortTerm: number;
  integrated: number;
  lra: number;
  truePeak: number;
  truePeakMax: number;
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
  correlation: number;
}

function meterProcessorSource(): void {
  const lufs = (ms: number) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
  class Meter extends AudioWorkletProcessor {
    private hop = Math.round(sampleRate * 0.1);
    private c: number[][] = [];
    private st = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    private hopSum = 0;
    private hopCount = 0;
    private hops: number[] = [];
    private blocks: number[] = [];
    private shorts: number[] = [];
    private tpMax = 0;
    private tpHop = 0;
    private pk = [0, 0];
    private sq = [0, 0];
    private lr = 0;
    private kernel: number[][] = [];
    private hist: [Float32Array, Float32Array] = [new Float32Array(48), new Float32Array(48)];
    private hpos = 0;
    constructor() {
      super();
      // K-weighting coefficients for this sample rate
      let f0 = 1681.974450955533;
      const G = 3.999843853973347;
      let Q = 0.7071752369554196;
      let K = Math.tan((Math.PI * f0) / sampleRate);
      const Vh = Math.pow(10, G / 20);
      const Vb = Math.pow(Vh, 0.4996667741545416);
      let a0 = 1 + K / Q + K * K;
      this.c.push([(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
      f0 = 38.13547087602444;
      Q = 0.5003270373238773;
      K = Math.tan((Math.PI * f0) / sampleRate);
      a0 = 1 + K / Q + K * K;
      this.c.push([1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
      // 4× true-peak interpolation kernels (Kaiser-windowed sinc, 48 taps)
      const i0 = (x: number) => {
        let s = 1;
        let t = 1;
        for (let k = 1; k < 25; k++) {
          t *= (x / (2 * k)) ** 2;
          s += t;
        }
        return s;
      };
      for (let p = 1; p < 4; p++) {
        const k: number[] = [];
        for (let t = 0; t < 48; t++) {
          const n = t - 23 - p / 4;
          const sinc = n === 0 ? 1 : Math.sin(Math.PI * n) / (Math.PI * n);
          const r = n / 24;
          k.push(Math.abs(r) >= 1 ? 0 : (sinc * i0(7 * Math.sqrt(1 - r * r))) / i0(7));
        }
        this.kernel.push(k);
      }
      this.port.onmessage = (e: MessageEvent) => {
        if (e.data === 'reset') {
          this.blocks = [];
          this.shorts = [];
          this.tpMax = 0;
        }
      };
    }
    private kw(ch: number, x: number): number {
      const s = this.st[ch];
      const [b0, b1, b2, a1, a2] = this.c[0];
      const y = b0 * x + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
      s[1] = s[0];
      s[0] = x;
      s[3] = s[2];
      s[2] = y;
      const [c0, c1, c2, d1, d2] = this.c[1];
      const z = c0 * y + c1 * s[4] + c2 * s[5] - d1 * s[6] - d2 * s[7];
      s[5] = s[4];
      s[4] = y;
      s[7] = s[6];
      s[6] = z;
      return z;
    }
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const inp = inputs[0];
      const out = outputs[0];
      const L = inp?.[0];
      const R = inp?.[1] ?? L;
      const n = out[0]?.length ?? 128;
      for (let i = 0; i < n; i++) {
        const l = L ? L[i] : 0;
        const r = R ? R[i] : 0;
        out[0][i] = l;
        if (out[1]) out[1][i] = r;
        const kl = this.kw(0, l);
        const kr = this.kw(1, r);
        this.hopSum += kl * kl + kr * kr;
        const al = Math.abs(l);
        const ar = Math.abs(r);
        if (al > this.pk[0]) this.pk[0] = al;
        if (ar > this.pk[1]) this.pk[1] = ar;
        this.sq[0] += l * l;
        this.sq[1] += r * r;
        this.lr += l * r;
        // true peak (interpolate between samples)
        this.hist[0][this.hpos] = l;
        this.hist[1][this.hpos] = r;
        this.hpos = (this.hpos + 1) % 48;
        let tp = Math.max(al, ar);
        if ((i & 1) === 0 || tp > this.tpHop * 0.5) {
          for (let ch = 0; ch < 2; ch++) {
            const h = this.hist[ch];
            for (const k of this.kernel) {
              let s = 0;
              for (let t = 0; t < 48; t++) s += h[(this.hpos + t) % 48] * k[t];
              const a = Math.abs(s);
              if (a > tp) tp = a;
            }
          }
        }
        if (tp > this.tpHop) this.tpHop = tp;
        if (++this.hopCount >= this.hop) this.flush();
      }
      return true;
    }
    private flush(): void {
      const ms = this.hopSum / this.hop;
      this.hops.push(ms);
      if (this.hops.length > 30) this.hops.shift();
      const avg = (k: number) => (this.hops.length >= k ? this.hops.slice(-k).reduce((a, b) => a + b, 0) / k : this.hops.reduce((a, b) => a + b, 0) / Math.max(1, this.hops.length));
      const m = avg(4);
      const s = avg(30);
      if (this.hops.length >= 4 && lufs(m) > -70) this.blocks.push(m);
      if (this.hops.length >= 30 && lufs(s) > -70) this.shorts.push(lufs(s));
      // gated integrated loudness
      let integrated = -Infinity;
      if (this.blocks.length) {
        const mean = this.blocks.reduce((a, b) => a + b, 0) / this.blocks.length;
        const gate = lufs(mean) - 10;
        let sum = 0;
        let cnt = 0;
        for (const b of this.blocks) if (lufs(b) > gate) {
          sum += b;
          cnt++;
        }
        integrated = cnt ? lufs(sum / cnt) : -Infinity;
      }
      // loudness range from short-term values (relative gate −20 LU)
      let lra = 0;
      if (this.shorts.length > 10) {
        const lin = this.shorts.map((v) => Math.pow(10, (v + 0.691) / 10));
        const mean = lufs(lin.reduce((a, b) => a + b, 0) / lin.length);
        const g = this.shorts.filter((v) => v > mean - 20).sort((a, b) => a - b);
        if (g.length > 1) lra = g[Math.round(0.95 * (g.length - 1))] - g[Math.round(0.1 * (g.length - 1))];
      }
      if (this.tpHop > this.tpMax) this.tpMax = this.tpHop;
      const den = Math.sqrt(this.sq[0] * this.sq[1]);
      this.port.postMessage({
        momentary: lufs(m), shortTerm: lufs(s), integrated, lra,
        truePeak: this.tpHop, truePeakMax: this.tpMax, peakL: this.pk[0], peakR: this.pk[1],
        rmsL: Math.sqrt(this.sq[0] / this.hop), rmsR: Math.sqrt(this.sq[1] / this.hop),
        correlation: den > 1e-12 ? this.lr / den : 0,
      });
      this.hopSum = 0;
      this.hopCount = 0;
      this.tpHop = 0;
      this.pk = [0, 0];
      this.sq = [0, 0];
      this.lr = 0;
    }
  }
  registerProcessor('unbox-meter', Meter);
}

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

export function ensureMeterWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
    if (!worklet) p = Promise.resolve(false);
    else {
      const url = URL.createObjectURL(new Blob([`(${meterProcessorSource.toString()})();`], { type: 'application/javascript' }));
      p = worklet
        .addModule(url)
        .then(() => true)
        .catch(() => false)
        .finally(() => URL.revokeObjectURL(url));
    }
    loaded.set(ctx, p);
  }
  return p;
}
