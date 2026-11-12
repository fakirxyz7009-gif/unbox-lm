import { SynthCore } from '../../src/audio/spec/engines/synthCore.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function collect(analyser: AnalyserNode, ctx: AudioContext, durationMs: number): Promise<Float32Array> {
  const block = new Float32Array(analyser.fftSize);
  const chunks: Float32Array[] = [];
  const blockMs = analyser.fftSize / ctx.sampleRate * 1000;
  const count = Math.ceil(durationMs / blockMs);
  for (let i = 0; i < count; i++) {
    await pause(blockMs);
    analyser.getFloatTimeDomainData(block);
    chunks.push(block.slice());
  }
  return Float32Array.from(chunks.flatMap((chunk) => [...chunk]));
}

function amplitudeAt(samples: Float32Array, sampleRate: number, frequency: number): number {
  let real = 0;
  let imaginary = 0;
  let weightSum = 0;
  const nMax = samples.length;
  for (let n = 0; n < nMax; n++) {
    const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (nMax - 1));
    const phase = (2 * Math.PI * frequency * n) / sampleRate;
    const sample = samples[n]! * weight;
    real += sample * Math.cos(phase);
    imaginary -= sample * Math.sin(phase);
    weightSum += weight;
  }
  return 2 * Math.hypot(real, imaginary) / weightSum;
}

function crestFactor(samples: Float32Array): number {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  return peak / Math.sqrt(sumSquares / samples.length);
}

async function run(): Promise<void> {
  const ctx = new AudioContext();
  await ctx.resume();
  const params: Record<string, number> = { lfoRate: 5, lfoPitch: 1, cutoff: 2000 };
  let waveform = 'Sine';
  const host: SpecHost = {
    ctx,
    id: 'lfo-wave-switch-probe',
    spec: { params: [] } as unknown as SpecHost['spec'],
    cfg: {},
    p: (key, fallback = 0) => params[key] ?? fallback,
    opt: (key) => key === 'lfoWave' ? waveform : '',
    ins: [],
    sc: null,
    outs: [],
    ret: null,
    aux: null,
    clock: { bpm: () => 120, isPlaying: () => false },
    modWheel: () => 0,
    modWheelTouched: () => false,
    gateCv: () => 0,
    changed: () => undefined,
  };
  const core = new SynthCore(host);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  const silence = ctx.createGain();
  silence.gain.value = 0;
  core.pitchDetune.connect(analyser);
  analyser.connect(silence).connect(ctx.destination);

  try {
    await pause(120);
    const sine = await collect(analyser, ctx, 1_500);
    const sineRatio = amplitudeAt(sine, ctx.sampleRate, 15) / amplitudeAt(sine, ctx.sampleRate, 5);
    const sineCrest = crestFactor(sine);

    waveform = 'Square';
    if (!core.onParam('lfoWave')) throw new Error('SynthCore did not handle the lfoWave parameter');
    const square = await collect(analyser, ctx, 1_500);
    const squareRatio = amplitudeAt(square, ctx.sampleRate, 15) / amplitudeAt(square, ctx.sampleRate, 5);
    const squareCrest = crestFactor(square);
    if (!(squareRatio > sineRatio * 3 && squareRatio > 0.04 && squareCrest < sineCrest - 0.2)) {
      throw new Error(`Existing LFO waveform did not switch from sine to square (third-harmonic ratios ${sineRatio.toFixed(3)} → ${squareRatio.toFixed(3)}).`);
    }
    result!.dataset.status = 'passed';
    result!.textContent = `PASS · active synth LFO changed sine → square; third-harmonic ratio ${sineRatio.toFixed(3)} → ${squareRatio.toFixed(3)}, crest factor ${sineCrest.toFixed(3)} → ${squareCrest.toFixed(3)}.`;
  } finally {
    core.stop();
    try { analyser.disconnect(); } catch {}
    try { silence.disconnect(); } catch {}
    await ctx.close();
  }
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
