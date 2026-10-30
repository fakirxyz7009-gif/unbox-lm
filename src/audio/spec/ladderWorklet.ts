/**
 * AudioWorklet ladder low-pass ('unbox-ladder') for the 'ladder' filter. Four one-pole stages, each
 * with a tanh, and the last stage fed back to the input: past the top of the resonance range the
 * loop self-oscillates, and the tanh keeps it bounded. The feedback is one sample late (explicit
 * integration), so the cutoff reads a little flat above about a tenth of the sample rate.
 *
 * The processor is a self-contained function loaded through a Blob URL (see workletLoader.ts).
 */
import { loadWorklet } from './workletLoader.ts';

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

export function ladderProcessorSource(): void {
  class Ladder extends AudioWorkletProcessor {
    private readonly stages: Float64Array[];

    static get parameterDescriptors() {
      return [
        { name: 'cutoff', defaultValue: 1200, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
        { name: 'resonance', defaultValue: 0.3, minValue: 0, maxValue: 1.15, automationRate: 'k-rate' },
        { name: 'drive', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }

    constructor() {
      super();
      this.stages = [new Float64Array(4), new Float64Array(4)];
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
      const input = inputs[0];
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const cutoff = params.cutoff;
      const k = 4 * params.resonance[0];
      const drive = 1 + 3 * params.drive[0];
      const wetGain = 1 + 0.5 * k;
      const ceiling = 0.45 * sampleRate;
      for (let ch = 0; ch < output.length; ch++) {
        const x = input && input.length > 0 ? input[Math.min(ch, input.length - 1)] : null;
        const y = output[ch];
        const s = this.stages[Math.min(ch, this.stages.length - 1)];
        for (let n = 0; n < y.length; n++) {
          const fc = Math.min(cutoff.length > 1 ? cutoff[n] : cutoff[0], ceiling);
          const g = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
          const u = Math.tanh(drive * (x ? x[n] : 0) - k * s[3]);
          s[0] += g * (u - Math.tanh(s[0]));
          s[1] += g * (Math.tanh(s[0]) - Math.tanh(s[1]));
          s[2] += g * (Math.tanh(s[1]) - Math.tanh(s[2]));
          s[3] += g * (Math.tanh(s[2]) - Math.tanh(s[3]));
          y[n] = s[3] * wetGain;
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
