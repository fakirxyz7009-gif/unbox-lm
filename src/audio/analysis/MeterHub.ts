/**
 * Metering hub (`audioEngine.meters`): the loudness worklet plus spectrum / scope analysers on a
 * selectable source (master by default, a mixer channel or the recording input).
 */
import { ensureMeterWorklet, type MeterReading } from './meterWorklet.ts';

export const SILENT_READING: MeterReading = {
  momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity, lra: 0, truePeak: 0, truePeakMax: 0, peakL: 0, peakR: 0, rmsL: 0, rmsR: 0, correlation: 0,
};

export class MeterHub {
  reading: MeterReading = { ...SILENT_READING };
  /** Short-term loudness history (one value per 100 ms, last 2 minutes). */
  readonly history: number[] = [];
  readonly spectrum: AnalyserNode;
  readonly scopeL: AnalyserNode;
  readonly scopeR: AnalyserNode;
  private input: GainNode;
  private node: AudioWorkletNode | null = null;
  private source: AudioNode | null = null;
  sourceLabel = 'Master';
  private listeners = new Set<(r: MeterReading) => void>();

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.spectrum = ctx.createAnalyser();
    this.spectrum.fftSize = 8192;
    this.spectrum.smoothingTimeConstant = 0.7;
    this.spectrum.minDecibels = -110;
    this.spectrum.maxDecibels = 0;
    this.scopeL = ctx.createAnalyser();
    this.scopeR = ctx.createAnalyser();
    this.scopeL.fftSize = 2048;
    this.scopeR.fftSize = 2048;
    const split = ctx.createChannelSplitter(2);
    this.input.connect(this.spectrum);
    this.input.connect(split);
    split.connect(this.scopeL, 0);
    split.connect(this.scopeR, 1);
    void ensureMeterWorklet(ctx).then((ok) => {
      if (!ok) return;
      this.node = new AudioWorkletNode(ctx, 'unbox-meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.onmessage = (e: MessageEvent<MeterReading>) => {
        this.reading = e.data;
        this.history.push(e.data.shortTerm);
        if (this.history.length > 1200) this.history.shift();
        this.listeners.forEach((cb) => cb(e.data));
      };
      const sink = ctx.createGain();
      sink.gain.value = 0;
      this.input.connect(this.node).connect(sink).connect(ctx.destination);
    });
  }

  /** Meters `node` (stereo) from now on. */
  setSource(node: AudioNode, label: string): void {
    if (this.source === node) return;
    if (this.source) {
      try {
        this.source.disconnect(this.input);
      } catch {
        // was not connected
      }
    }
    this.source = node;
    this.sourceLabel = label;
    node.connect(this.input);
    this.reset();
  }

  /** Restarts integrated loudness, LRA and the true-peak hold. */
  reset(): void {
    this.node?.port.postMessage('reset');
    this.history.length = 0;
  }

  subscribe(cb: (r: MeterReading) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
