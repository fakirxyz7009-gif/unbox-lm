/**
 * AudioWorklet ladder low-pass ('unbox-ladder') for the 'ladder' filter: four one-pole stages in
 * zero-delay (topology-preserving) form, with the last stage fed back to the input. The feedback is
 * solved within the same sample, so the resonance lands where the cutoff says, even at high cutoffs.
 * Past the top of the resonance range the loop self-oscillates, and a soft limit above full scale on each stage keeps it
 * bounded. The stages run at twice the sample rate, with a half-band filter on the way in and out, so
 * the saturation's harmonics fold back much less.
 *
 * The processor is a self-contained function loaded through a Blob URL (see workletLoader.ts).
 */
import { loadWorklet } from './workletLoader.ts';

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

export function ladderProcessorSource(): void {
  const TAPS = 31;
  const HALF = (TAPS - 1) / 2;
  /** Highest cutoff, as a fraction of the sample rate. */
  const CEILING = 0.4;

  /** Half-band low-pass at a quarter of the doubled rate (Blackman window), unity gain at DC. */
  function halfBand(): Float64Array {
    const h = new Float64Array(TAPS);
    let sum = 0;
    for (let n = 0; n < TAPS; n++) {
      const x = n - HALF;
      const sinc = x === 0 ? 1 : Math.sin((Math.PI * x) / 2) / ((Math.PI * x) / 2);
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (TAPS - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (TAPS - 1));
      h[n] = 0.5 * sinc * w;
      sum += h[n];
    }
    for (let n = 0; n < TAPS; n++) h[n] /= sum;
    return h;
  }
  const H = halfBand();

  /** Filter a ring buffer whose newest sample is at `pos`, newest first. */
  function fir(hist: Float64Array, pos: number): number {
    let acc = 0;
    let i = pos;
    for (let k = 0; k < TAPS; k++) {
      acc += H[k] * hist[i];
      i = i === 0 ? TAPS - 1 : i - 1;
    }
    return acc;
  }

  /** Unity below full scale, then a soft limit toward 2. This is the loop's only nonlinearity. */
  function limit(v: number): number {
    if (v > 1) return 1 + Math.tanh(v - 1);
    if (v < -1) return -1 - Math.tanh(-v - 1);
    return v;
  }

  /** Output stage: linear below 0.9, then a soft curve that tops out just under full scale. */
  function ceil(v: number): number {
    const a = Math.abs(v);
    if (a <= 0.9) return v;
    return Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
  }

  /**
   * One sample of the ladder. For one-pole stages with prewarped coefficient G, the loop solves in
   * closed form, with no delay in the feedback. The stage states are then limited above full scale.
   */
  function ladderStep(s: Float64Array, u: number, G: number, k: number, drive: number): number {
    const xd = Math.tanh(drive * u);
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G2 * G2;
    const S = (1 - G) * (G3 * s[0] + G2 * s[1] + G * s[2] + s[3]);
    const y4 = (G4 * xd + S) / (1 + k * G4);
    let input = xd - k * y4;
    let out = 0;
    for (let i = 0; i < 4; i++) {
      const v = G * (input - s[i]);
      out = v + s[i];
      s[i] = out + v;
      input = out;
    }
    for (let i = 0; i < 4; i++) s[i] = limit(s[i]);
    return out;
  }

  class Channel {
    readonly stages = new Float64Array(4);
    /** Doubled-rate input (zero-stuffed) and ladder output, each as a ring buffer. */
    readonly up = new Float64Array(TAPS);
    readonly down = new Float64Array(TAPS);
    upPos = 0;
    downPos = 0;
  }

  class Ladder extends AudioWorkletProcessor {
    private readonly channels: Channel[];

    static get parameterDescriptors() {
      return [
        { name: 'cutoff', defaultValue: 1200, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
        { name: 'resonance', defaultValue: 0.3, minValue: 0, maxValue: 1.15, automationRate: 'k-rate' },
        { name: 'drive', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }

    constructor() {
      super();
      this.channels = [new Channel(), new Channel()];
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
      const input = inputs[0];
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const cutoff = params.cutoff;
      const k = 4 * params.resonance[0];
      const drive = 1 + 3 * params.drive[0];
      const wetGain = 1 + 0.5 * k;
      const doubledRate = 2 * sampleRate;
      const ceiling = CEILING * sampleRate;
      for (let ch = 0; ch < output.length; ch++) {
        const c = this.channels[Math.min(ch, this.channels.length - 1)];
        const x = input && input.length > 0 ? input[Math.min(ch, input.length - 1)] : null;
        const y = output[ch];
        for (let n = 0; n < y.length; n++) {
          const fc = Math.min(cutoff.length > 1 ? cutoff[n] : cutoff[0], ceiling);
          // Prewarped one-pole coefficient, at the doubled rate.
          const g = Math.tan((Math.PI * fc) / doubledRate);
          const G = g / (1 + g);
          // Two doubled-rate samples per input sample: the input (gain 2, for zero-stuffing), then zero.
          c.upPos = c.upPos + 1 < TAPS ? c.upPos + 1 : 0;
          c.up[c.upPos] = 2 * (x ? x[n] : 0);
          c.downPos = c.downPos + 1 < TAPS ? c.downPos + 1 : 0;
          c.down[c.downPos] = ladderStep(c.stages, fir(c.up, c.upPos), G, k, drive);
          c.upPos = c.upPos + 1 < TAPS ? c.upPos + 1 : 0;
          c.up[c.upPos] = 0;
          c.downPos = c.downPos + 1 < TAPS ? c.downPos + 1 : 0;
          c.down[c.downPos] = ladderStep(c.stages, fir(c.up, c.upPos), G, k, drive);
          y[n] = ceil(fir(c.down, c.downPos) * wetGain);
        }
      }
      return true;
    }
  }
  registerProcessor('unbox-ladder', Ladder);
}

/** Loads the ladder processor into a context once. Resolves false where AudioWorklet is unavailable. */
export function ensureLadderWorklet(ctx: BaseAudioContext): Promise<boolean> {
  return loadWorklet(ctx, ladderProcessorSource);
}
