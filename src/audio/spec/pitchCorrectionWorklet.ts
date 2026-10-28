/** Monophonic YIN pitch detection and scale correction in the audio render thread. */
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const sampleRate: number;

function pitchCorrectionProcessorSource(): void {
  const FRAME = 1024;
  const HOP = 512;
  const DECIMATION = Math.max(1, Math.round(sampleRate / 24_000));
  const ANALYSIS_RATE = sampleRate / DECIMATION;
  const MIN_LAG = Math.max(2, Math.floor(ANALYSIS_RATE / 1100));
  const MAX_LAG = Math.min(FRAME - 2, Math.ceil(ANALYSIS_RATE / 65));
  const MIN_WINDOW = Math.round(sampleRate * 0.02);
  const MAX_WINDOW = Math.round(sampleRate * 3);
  const SCALE_STEPS = [
    [0, 2, 4, 5, 7, 9, 11],
    [0, 2, 3, 5, 7, 8, 10],
    [0, 2, 3, 5, 7, 9, 10],
    [0, 1, 3, 5, 7, 8, 10],
    [0, 2, 4, 6, 7, 9, 11],
    [0, 2, 4, 5, 7, 9, 10],
    [0, 2, 3, 5, 7, 8, 11],
    [0, 2, 4, 7, 9],
    [0, 3, 5, 7, 10],
    [0, 3, 5, 6, 7, 10],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  ];

  class PitchCorrection extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'key', defaultValue: 0, minValue: 0, maxValue: 11, automationRate: 'k-rate' },
        { name: 'scale', defaultValue: 0, minValue: 0, maxValue: 10, automationRate: 'k-rate' },
        { name: 'amount', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'retune', defaultValue: 35, minValue: 1, maxValue: 300, automationRate: 'k-rate' },
        { name: 'sensitivity', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }

    private ringL = new Float32Array(FRAME);
    private ringR = new Float32Array(FRAME);
    private frame = new Float32Array(FRAME);
    private difference = new Float32Array(MAX_LAG + 1);
    private delayL = new Float32Array(Math.ceil(sampleRate * 0.09) + 4);
    private delayR = new Float32Array(Math.ceil(sampleRate * 0.09) + 4);
    private ringWrite = 0;
    private ringFill = 0;
    private analysisHop = 0;
    private decimationCount = 0;
    private decimationL = 0;
    private decimationR = 0;
    private delayWrite = 0;
    private phase = 0;
    private windowSize = MIN_WINDOW;
    private targetWindowSize = MIN_WINDOW;
    private ratio = 1;
    private targetRatio = 1;
    private detectedNote = -1;
    private correctionCents = 0;
    private confidence = 0;
    private unvoicedSamples = 0;
    private reportSamples = 0;
    private readonly minDelay = Math.round(sampleRate * 0.002);

    constructor() {
      super();
    }

    private setUnvoiced(): void {
      this.unvoicedSamples += HOP * DECIMATION;
      this.confidence = 0;
      if (this.unvoicedSamples >= sampleRate * 0.12) {
        this.detectedNote = -1;
        this.correctionCents = 0;
        this.targetRatio = 1;
        this.targetWindowSize = MIN_WINDOW;
      }
    }

    private analyze(parameters: Record<string, Float32Array>): void {
      let powerL = 0;
      let powerR = 0;
      for (let i = 0; i < FRAME; i++) {
        const at = (this.ringWrite + i) % FRAME;
        const left = this.ringL[at];
        const right = this.ringR[at];
        powerL += left * left;
        powerR += right * right;
      }
      const source = powerL >= powerR ? this.ringL : this.ringR;
      for (let i = 0; i < FRAME; i++) this.frame[i] = source[(this.ringWrite + i) % FRAME];
      const power = Math.max(powerL, powerR) / FRAME;
      if (power < 1e-6) {
        this.setUnvoiced();
        return;
      }

      let cumulative = 0;
      for (let lag = 1; lag <= MAX_LAG; lag++) {
        let sum = 0;
        const end = FRAME - lag;
        for (let i = 0; i < end; i++) {
          const delta = this.frame[i] - this.frame[i + lag];
          sum += delta * delta;
        }
        cumulative += sum;
        this.difference[lag] = cumulative > 1e-12 ? (sum * lag) / cumulative : 1;
      }

      const sensitivity = Math.max(0, Math.min(1, parameters.sensitivity[0]));
      const threshold = 0.08 + sensitivity * 0.24;
      let lag = MIN_LAG;
      while (lag <= MAX_LAG && this.difference[lag] >= threshold) lag++;
      if (lag > MAX_LAG) {
        this.setUnvoiced();
        return;
      }
      while (lag < MAX_LAG && this.difference[lag + 1] < this.difference[lag]) lag++;
      const before = this.difference[lag - 1];
      const center = this.difference[lag];
      const after = this.difference[lag + 1];
      const divisor = before - 2 * center + after;
      const offsetLag = Math.abs(divisor) < 1e-9 ? 0 : 0.5 * (before - after) / divisor;
      const frequency = ANALYSIS_RATE / (lag + Math.max(-0.5, Math.min(0.5, offsetLag)));
      if (!Number.isFinite(frequency) || frequency < 65 || frequency > 1100) {
        this.setUnvoiced();
        return;
      }

      const midi = 69 + 12 * Math.log2(frequency / 440);
      const key = Math.max(0, Math.min(11, Math.round(parameters.key[0])));
      const scaleIndex = Math.max(0, Math.min(SCALE_STEPS.length - 1, Math.round(parameters.scale[0])));
      const steps = SCALE_STEPS[scaleIndex];
      const octave = Math.floor((midi - key) / 12);
      let nearest = midi;
      let distance = Infinity;
      for (let o = octave - 1; o <= octave + 1; o++) {
        const base = o * 12 + key;
        for (let i = 0; i < steps.length; i++) {
          const candidate = base + steps[i];
          const candidateDistance = Math.abs(candidate - midi);
          if (candidateDistance < distance) {
            nearest = candidate;
            distance = candidateDistance;
          }
        }
      }
      const amount = Math.max(0, Math.min(1, parameters.amount[0]));
      let delta = (nearest - midi) * amount;
      const targetRatio = Math.pow(2, delta / 12);
      if (Math.abs(targetRatio - 1) < 1e-8) {
        this.targetRatio = 1;
        this.targetWindowSize = MIN_WINDOW;
      } else {
        // A single moving delay head shifts pitch without the combing caused by crossfading
        // two heads at unrelated waveform phases. Reset it by an integer number of source
        // periods so the delay jump lands at the same phase for a monophonic source.
        const period = sampleRate / frequency;
        const oneCycleWindow = period / Math.abs(1 - targetRatio);
        const cycles = Math.max(1, Math.ceil(MIN_WINDOW / oneCycleWindow));
        const window = oneCycleWindow * cycles;
        if (window > MAX_WINDOW) {
          delta = 0;
          this.targetRatio = 1;
          this.targetWindowSize = MIN_WINDOW;
        } else {
          this.targetRatio = targetRatio;
          this.targetWindowSize = window;
        }
      }
      this.detectedNote = Math.round(midi);
      this.correctionCents = delta * 100;
      this.confidence = Math.max(0, Math.min(1, 1 - center));
      this.unvoicedSamples = 0;
    }

    private read(buffer: Float32Array, delay: number): number {
      const length = buffer.length;
      let position = this.delayWrite - delay;
      while (position < 0) position += length;
      while (position >= length) position -= length;
      const index = Math.floor(position);
      const next = index + 1 === length ? 0 : index + 1;
      const fraction = position - index;
      return buffer[index] + (buffer[next] - buffer[index]) * fraction;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
      const input = inputs[0];
      const output = outputs[0];
      const outL = output?.[0];
      const outR = output?.[1];
      if (!outL) return true;
      const inL = input?.[0];
      const inR = input?.[1] ?? inL;
      const amount = Math.max(0, Math.min(1, parameters.amount[0]));
      if (amount <= 0.0001) {
        this.targetRatio = 1;
        this.targetWindowSize = MIN_WINDOW;
      }
      const retune = Math.max(1, Math.min(300, parameters.retune[0])) * 0.001;
      const ratioSmooth = Math.exp(-1 / (retune * sampleRate));
      const count = outL.length;
      const delayLength = this.delayL.length;
      for (let i = 0; i < count; i++) {
        const left = inL ? inL[i] : 0;
        const right = inR ? inR[i] : left;
        this.decimationL += left;
        this.decimationR += right;
        if (++this.decimationCount >= DECIMATION) {
          const l = this.decimationL / DECIMATION;
          const r = this.decimationR / DECIMATION;
          this.decimationL = 0;
          this.decimationR = 0;
          this.decimationCount = 0;
          this.ringL[this.ringWrite] = l;
          this.ringR[this.ringWrite] = r;
          this.ringWrite = (this.ringWrite + 1) % FRAME;
          if (this.ringFill < FRAME) this.ringFill++;
          if (this.ringFill === FRAME && ++this.analysisHop >= HOP) {
            this.analysisHop = 0;
            this.analyze(parameters);
          }
        }

        this.ratio = ratioSmooth * this.ratio + (1 - ratioSmooth) * this.targetRatio;
        this.delayL[this.delayWrite] = left;
        this.delayR[this.delayWrite] = right;
        this.windowSize += (this.targetWindowSize - this.windowSize) * 0.001;
        const shift = (1 - this.ratio) * this.windowSize;
        const base = Math.max(0, -shift) + this.minDelay;
        const delay = Math.max(1, Math.min(delayLength - 2, base + shift * this.phase));
        const shiftedL = this.read(this.delayL, delay);
        const shiftedR = this.read(this.delayR, delay);
        outL[i] = shiftedL;
        if (outR) outR[i] = shiftedR;
        this.delayWrite = (this.delayWrite + 1) % delayLength;
        this.phase += 1 / this.windowSize;
        if (this.phase >= 1) this.phase -= 1;
      }
      this.reportSamples += count;
      if (this.reportSamples >= sampleRate / 20) {
        this.port.postMessage({
          note: this.detectedNote,
          cents: this.correctionCents,
          confidence: this.confidence,
        });
        this.reportSamples = 0;
      }
      return true;
    }
  }

  registerProcessor('unbox-pitch-correction', PitchCorrection);
}

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

/** Load the pitch-correction processor once per live or offline context. */
export function ensurePitchCorrectionWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let promise = loaded.get(ctx);
  if (!promise) {
    const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
    if (!worklet || typeof Blob === 'undefined' || typeof URL === 'undefined') promise = Promise.resolve(false);
    else {
      const url = URL.createObjectURL(new Blob([`(${pitchCorrectionProcessorSource.toString()})();`], { type: 'application/javascript' }));
      promise = worklet.addModule(url).then(() => true).catch(() => false).finally(() => URL.revokeObjectURL(url));
    }
    loaded.set(ctx, promise);
  }
  return promise;
}
