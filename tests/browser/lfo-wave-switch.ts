import { SynthCore } from '../../src/audio/spec/engines/synthCore.ts';
import type { SpecHost } from '../../src/audio/spec/SpecDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Waits until `seconds` of audio were actually rendered; the wall budget stops a stalled audio thread hanging the probe. */
async function waitAudio(ctx: AudioContext, seconds: number, wallBudgetMs: number): Promise<number> {
  const startAudio = ctx.currentTime;
  const startWall = performance.now();
  while (ctx.currentTime - startAudio < seconds) {
    if (performance.now() - startWall > wallBudgetMs) break;
    await pause(20);
  }
  return ctx.currentTime - startAudio;
}

/**
 * One contiguous analyser window, taken only after the whole window plus a settle margin has been rendered.
 * Sampling in wall time stitched together overlapping or repeated analyser blocks whenever the audio thread fell
 * behind, which added harmonics to a sine and hid the square's own — how this probe failed in a loaded sweep.
 */
async function snapshot(ctx: AudioContext, analyser: AnalyserNode): Promise<Float32Array> {
  const windowSeconds = analyser.fftSize / ctx.sampleRate;
  const settleSeconds = windowSeconds + 0.2;
  const wallBudgetMs = 4_000;
  const rendered = await waitAudio(ctx, settleSeconds, wallBudgetMs);
  if (rendered < windowSeconds) {
    throw new Error(`audio thread rendered only ${rendered.toFixed(3)} s in ${wallBudgetMs} ms of wall time (context ${ctx.state}); cannot judge the LFO`);
  }
  const block = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(block);
  return block;
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
  // A 0.68 s window holds several LFO cycles, so one contiguous snapshot replaces many stitched blocks.
  analyser.fftSize = 32768;
  const silence = ctx.createGain();
  silence.gain.value = 0;
  core.pitchDetune.connect(analyser);
  analyser.connect(silence).connect(ctx.destination);

  try {
    const sine = await snapshot(ctx, analyser);
    const sineRatio = amplitudeAt(sine, ctx.sampleRate, 15) / amplitudeAt(sine, ctx.sampleRate, 5);
    const sineCrest = crestFactor(sine);

    waveform = 'Square';
    if (!core.onParam('lfoWave')) throw new Error('SynthCore did not handle the lfoWave parameter');
    const square = await snapshot(ctx, analyser);
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
