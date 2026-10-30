/**
 * AudioWorklet plucked string ('unbox-string'): one Karplus-Strong loop per voice. The loop is a
 * fractional delay of one period (linear interpolation) with a two-point average for brightness.
 * A DelayNode loop cannot be shorter than one render quantum (128 samples, about 375 Hz at 48 kHz),
 * so the loop lives in the worklet, which keeps every note in tune. A noise burst excites the loop
 * while `gate` is high. `loop` is the per-pass gain (how long it rings), `average` the brightness
 * (1 = no averaging, 0.5 = full two-point average), `level` the burst level, `velocity` the output.
 *
 * The processor is a self-contained function loaded through a Blob URL (see workletLoader.ts).
 */
import { loadWorklet } from './workletLoader.ts';

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

export function stringProcessorSource(): void {
  const SIZE = 8192;
  const BURST_SECONDS = 0.012;

  class Pluck extends AudioWorkletProcessor {
    private readonly line: Float32Array;
    private write = 0;
    private prev = 0;
    private burst = 0;
    private gateWas = false;
    private seed: number;

    static get parameterDescriptors() {
      return [
        { name: 'frequency', defaultValue: 220, minValue: 10, maxValue: 8000, automationRate: 'k-rate' },
        { name: 'loop', defaultValue: 0.99, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'average', defaultValue: 0.75, minValue: 0.5, maxValue: 1, automationRate: 'k-rate' },
        { name: 'level', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'velocity', defaultValue: 0.8, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }

    constructor(options?: { processorOptions?: { seed?: number } }) {
      super();
      this.line = new Float32Array(SIZE);
      // Each pluck's noise comes from its own seed, so two plucks of one note do not sound identical.
      this.seed = ((options?.processorOptions?.seed ?? 1) >>> 0) || 1;
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
      const out = outputs[0][0];
      if (!out) return true;
      const gate = params.gate[0] > 0.5;
      if (gate && !this.gateWas) this.burst = Math.round(BURST_SECONDS * sampleRate);
      this.gateWas = gate;
      const average = params.average[0];
      // The loop filter's group delay is (1 - average) samples, so the line is that much shorter.
      const period = Math.min(SIZE - 2, Math.max(2, sampleRate / params.frequency[0] - (1 - average)));
      const loop = params.loop[0];
      const level = params.level[0];
      const velocity = params.velocity[0];
      for (let n = 0; n < out.length; n++) {
        let r = this.write - period;
        if (r < 0) r += SIZE;
        const i0 = Math.floor(r);
        const frac = r - i0;
        const x = this.line[i0] * (1 - frac) + this.line[i0 + 1 < SIZE ? i0 + 1 : 0] * frac;
        let excite = 0;
        if (this.burst > 0) {
          this.burst--;
          this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
          excite = (this.seed / 4294967296) * 2 - 1;
          excite *= level;
        }
        this.line[this.write] = loop * (average * x + (1 - average) * this.prev) + excite;
        this.prev = x;
        this.write = this.write + 1 < SIZE ? this.write + 1 : 0;
        out[n] = x * velocity;
      }
      return true;
    }
  }
  registerProcessor('unbox-string', Pluck);
}

/** Loads the string processor into a context once. Resolves false where AudioWorklet is unavailable. */
export function ensureStringWorklet(ctx: BaseAudioContext): Promise<boolean> {
  return loadWorklet(ctx, stringProcessorSource);
}
