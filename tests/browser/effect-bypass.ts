import { BUILTIN_DEVICES } from '../../shared/rack/builtinCatalog.ts';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';
import { waitForAudioTime } from '../../src/audio/audioClockAlarm.ts';
import { specFor } from '../../src/audio/spec/registry.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Analyser assertions must observe the audio render timeline, not an arbitrary amount of UI
 * thread wall time. Yield once after the silent audio-clock alarm so the browser publishes the
 * newly completed analyser window to JavaScript.
 */
async function waitForAudio(ctx: AudioContext, seconds: number): Promise<void> {
  await waitForAudioTime(ctx, ctx.currentTime + Math.max(0.001, seconds));
  await pause(0);
}

function rmsOf(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / data.length);
}

function peakOf(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function samplesOf(analyser: AnalyserNode): Float32Array<ArrayBuffer> {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  return data;
}

function differenceRatio(reference: Float32Array<ArrayBuffer>, output: Float32Array<ArrayBuffer>): number {
  const length = Math.min(reference.length, output.length);
  let sourceEnergy = 0;
  let differenceEnergy = 0;
  for (let i = 0; i < length; i++) {
    sourceEnergy += reference[i]! * reference[i]!;
    const difference = output[i]! - reference[i]!;
    differenceEnergy += difference * difference;
  }
  return Math.sqrt(differenceEnergy / Math.max(1e-12, sourceEnergy));
}

function signedCorrelation(reference: Float32Array<ArrayBuffer>, output: Float32Array<ArrayBuffer>, maxLag = 8): number {
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0;
    let refEnergy = 0;
    let outEnergy = 0;
    const start = Math.max(0, -lag);
    const end = Math.min(reference.length, output.length - lag);
    for (let i = start; i < end; i++) {
      const a = reference[i]!;
      const b = output[i + lag]!;
      dot += a * b;
      refEnergy += a * a;
      outEnergy += b * b;
    }
    const correlation = dot / Math.sqrt(Math.max(1e-20, refEnergy * outEnergy));
    if (Math.abs(correlation) > Math.abs(best)) best = correlation;
  }
  return best;
}

// g0 is the first of the Graphic EQ's fixed bands. It deliberately comes after
// conventional gain controls so normal processors still use their primary gain.
const ACTIVE_CONTROL_ORDER = ['drive', 'gain', 'g0', 'threshold', 'ratio', 'depth', 'feedback', 'cutoff', 'frequency', 'freq', 'time', 'delay', 'decay', 'resonance', 'width', 'spread', 'rate', 'tone', 'amount', 'mode', 'preset'];

function changeActiveControl(device: BaseDevice, type: string): string | null {
  if ('mix' in device.params) device.setParam('mix', 1);
  const spec = specFor(type);
  const definitions = spec?.params ?? [];
  const defined = ACTIVE_CONTROL_ORDER.flatMap((needle) => definitions.filter((param) => param.key !== 'mix' && param.key.toLowerCase().includes(needle)))[0];
  const key = defined?.key ?? ACTIVE_CONTROL_ORDER.flatMap((needle) => Object.keys(device.params).filter((param) => param !== 'mix' && param.toLowerCase().includes(needle)))[0];
  if (!key) return null;

  const current = device.params[key];
  if (defined?.options) {
    const value = Number(current);
    device.setParam(key, value === defined.max ? defined.min : defined.max);
    return key;
  }
  if (defined) {
    const value = typeof current === 'number' ? current : defined.default;
    const lowered = key.toLowerCase();
    // A zero depth is deliberately dry for tremolo/chorus-style effects. The
    // response probe must select an audible state rather than accidentally
    // proving that the effect can be disabled.
    const target = lowered.includes('threshold') ? defined.min
      : lowered.includes('depth') ? defined.max
      : lowered.includes('gain') || lowered.includes('cutoff') || lowered.includes('freq') ? defined.min
        : defined.max;
    device.setParam(key, Math.abs(value - defined.min) > Math.abs(value - defined.max) ? defined.min : target);
    return key;
  }
  if (typeof current !== 'number') return null;
  const lowered = key.toLowerCase();
  const value = lowered.includes('drive') || lowered.includes('depth') || lowered.includes('feedback') || lowered.includes('ratio') || lowered.includes('resonance')
    ? Math.min(current + Math.max(0.2, Math.abs(current) * 0.75), 1)
    : lowered.includes('freq') || lowered.includes('cutoff') || lowered.includes('tone')
      ? Math.max(60, current * 0.4)
      : lowered.includes('time') || lowered.includes('delay') || lowered.includes('decay')
        ? current * 1.5
        : current + 6;
  device.setParam(key, value);
  return key;
}

interface EffectProbeResult {
  bypassError: number;
  response?: { ratio: number; control: string };
}

const SPECIAL_EFFECTS = new Set(['bvx_vocoder', 'neptune', 'alligator', 'synchronous', 'ecf42', 'pitch_correct', 'stereo_tremolo']);

function configureSpecialEffect(type: string, device: BaseDevice, ctx: AudioContext): string {
  if (type === 'bvx_vocoder') {
    device.setParam('bands', 0);
    device.setParam('internalCarrier', 1);
    return '4-band vocoder with internal carrier and broadband sidechain';
  }
  if (type === 'neptune') {
    device.setParam('transpose', 12);
    return 'transpose +12 semitones';
  }
  if (type === 'pitch_correct') {
    device.setParam('correct', 1);
    device.setParam('key', 0);
    device.setParam('scale', 0);
    device.setParam('amount', 1);
    device.setParam('retune', 5);
    return '205 Hz monophonic tone corrected to C major';
  }
  if (type === 'alligator') {
    device.setParam('dry', 0);
    device.setParam('pattern', 0);
    device.setParam('drive', 0.9);
    for (let pos = 0; pos < 16; pos++) device.onStepTick?.(pos, ctx.currentTime + pos * 0.125);
    return 'clocked pattern 1, dry off, drive 0.9';
  }
  if (type === 'synchronous') {
    device.setParam('length', 0);
    device.setParam('shape1', 5);
    device.setParam('shape2', 0);
    device.setParam('shape3', 5);
    device.setParam('distortion', 0.8);
    device.setParam('distMod', 1);
    device.setParam('cutoff', 240);
    for (let pos = 0; pos < 12; pos++) device.onStepTick?.(pos, ctx.currentTime + pos * 0.125);
    return 'clocked 4-step modulation with distortion and low-pass active';
  }
  if (type === 'ecf42') {
    device.setParam('mode', 2);
    device.setParam('freq', 500);
    device.setParam('res', 1);
    device.setParam('envAmount', 1);
    device.setParam('selfTrigger', 0);
    device.cvInputs.get('cv_gate')?.setter?.(1);
    return 'BP12 mode, resonance and envelope amount max, gate CV high';
  }
  if (type === 'stereo_tremolo') {
    // A tremolo is intentionally gain-only: compare its level over multiple
    // audio windows rather than a single static waveform snapshot.
    device.setParam('rate', 4.5);
    device.setParam('depth', 1);
    device.setParam('phase', 1);
    return '4.5 Hz, full-depth stereo amplitude modulation';
  }
  return changeActiveControl(device, type) ?? 'default settings';
}

async function probeEffect(type: string, measureResponse: boolean): Promise<EffectProbeResult> {
  let device: BaseDevice | null = null;
  let source: AudioBufferSourceNode | null = null;
  const sineSources: OscillatorNode[] = [];
  let inputGains: GainNode[] = [];
  let references: AnalyserNode[] = [];
  let splitter: ChannelSplitterNode | null = null;
  let outputTaps: AnalyserNode[] = [];
  try {
    device = audioEngine.createDevice(type as Parameters<typeof audioEngine.createDevice>[0], `Effect bypass probe · ${type}`);
    const inputL = device.audioInputs.get('in_l');
    const inputR = device.audioInputs.get('in_r');
    const outputL = device.audioOutputs.get('out_l');
    const outputR = device.audioOutputs.get('out_r');
    if (!inputL || !inputR || !outputL || !outputR) throw new Error('missing stereo audio ports');

    const ctx = audioEngine.ctx;
    inputGains = [inputL, inputR].map(() => ctx.createGain());
    references = inputGains.map(() => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyser.connect(ctx.destination);
      return analyser;
    });
    inputGains.forEach((gain, channel) => {
      gain.gain.value = 0.15;
      gain.connect(channel === 0 ? inputL : inputR);
      gain.connect(references[channel]!);
    });
    [ctx.sampleRate * 85 / 4096, ctx.sampleRate * 53 / 4096].forEach((frequency, channel) => {
      const sine = ctx.createOscillator();
      sine.frequency.value = frequency;
      sine.connect(inputGains[channel]!);
      sine.start(ctx.currentTime + 0.025);
      sineSources.push(sine);
    });

    outputTaps = [outputL, outputR].map((output) => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      output.connect(analyser);
      analyser.connect(ctx.destination);
      return analyser;
    });

    device.isBypassed = true;
    // Let the bypass ramp and a full analyser window settle before measuring dry fidelity.
    await waitForAudio(ctx, 0.3);

    let inputRms = references.map(rmsOf);
    let inputLevel = Math.max(...inputRms);
    // Analyser data is an audio-rate window, while source starts are scheduled.  On a busy
    // shared context, allow a bounded number of complete windows before treating the input as
    // genuinely silent instead of failing a downstream effect for a startup race.
    for (let attempt = 0; inputLevel < 0.03 && attempt < 4; attempt++) {
      await waitForAudio(ctx, 0.13);
      inputRms = references.map(rmsOf);
      inputLevel = Math.max(...inputRms);
    }
    if (inputLevel < 0.03) throw new Error(`input stimulus was unexpectedly quiet (RMS ${inputLevel.toExponential(2)})`);
    const outputRms = outputTaps.map(rmsOf);
    const largestError = Math.max(...outputRms.map((value, index) => Math.abs(value - inputRms[index]!) / inputRms[index]!));
    if (largestError > 0.03) {
      throw new Error(`bypassed RMS differs from dry input by ${(largestError * 100).toFixed(2)}% (L ${outputRms[0]?.toExponential(2)} vs ${inputRms[0]?.toExponential(2)}, R ${outputRms[1]?.toExponential(2)} vs ${inputRms[1]?.toExponential(2)})`);
    }

    let response: EffectProbeResult['response'];
    if (measureResponse) {
      if (type === 'pitch_correct') {
        sineSources.forEach((sine) => sine.frequency.setTargetAtTime(205, ctx.currentTime, 0.01));
      } else {
        sineSources.forEach((sine) => {
          try { sine.stop(); } catch {}
          try { sine.disconnect(); } catch {}
        });
        sineSources.length = 0;
        const input = ctx.createBuffer(2, 16_384, ctx.sampleRate);
        for (let channel = 0; channel < input.numberOfChannels; channel++) {
          const data = input.getChannelData(channel);
          let seed = channel === 0 ? 0x1234567 : 0x7654321;
          for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
            data[i] = (seed / 0xffff_ffff) * 2 - 1;
          }
        }
        source = ctx.createBufferSource();
        source.buffer = input;
        source.loop = true;
        splitter = ctx.createChannelSplitter(2);
        source.connect(splitter);
        inputGains.forEach((gain, channel) => splitter?.connect(gain, channel));
        if (type === 'bvx_vocoder') {
          const sidechainL = device.audioInputs.get('sc_l');
          const sidechainR = device.audioInputs.get('sc_r');
          if (!sidechainL || !sidechainR) throw new Error('vocoder sidechain ports are missing');
          splitter.connect(sidechainL, 0);
          splitter.connect(sidechainR, 1);
        }
        source.start(ctx.currentTime + 0.025);
      }
      await waitForAudio(ctx, 0.16);
      const control = SPECIAL_EFFECTS.has(type)
        ? configureSpecialEffect(type, device, ctx)
        : changeActiveControl(device, type) ?? 'default settings';
      device.isPowered = true;
      device.isBypassed = false;
      await waitForAudio(ctx, type === 'neptune' ? 0.9 : 0.5);
      let ratio: number;
      if (type === 'stereo_tremolo') {
        // A static waveform comparison can legitimately hit the same LFO phase
        // twice. Measure the left output's RMS across a complete modulation
        // cycle instead; a full-depth tremolo must show a substantial change.
        const levels: number[] = [];
        for (let sample = 0; sample < 8; sample++) {
          levels.push(rmsOf(outputTaps[0]!));
          await waitForAudio(ctx, 0.055);
        }
        const high = Math.max(...levels);
        const low = Math.min(...levels);
        ratio = high > 1e-6 ? 1 - low / high : 0;
      } else {
        ratio = Math.max(...references.map((analyser, index) => differenceRatio(samplesOf(analyser), samplesOf(outputTaps[index]!))));
      }
      if (ratio < 0.005) throw new Error(`active DSP did not measurably change its input after ${control ?? 'default settings'} (difference ${(ratio * 100).toFixed(3)}%)`);
      response = { ratio, control: control ?? 'default settings' };
    }

    device.isBypassed = true;
    device.isPowered = false;
    await waitForAudio(ctx, 0.65);
    const poweredOffPeak = Math.max(...outputTaps.map(peakOf));
    if (poweredOffPeak > 1e-5) {
      throw new Error(`power-off left signal at ${poweredOffPeak.toExponential(2)} peak (powered=${device.isPowered}, bypassed=${device.isBypassed})`);
    }
    return { bypassError: largestError, response };
  } finally {
    try { source?.stop(); } catch {}
    try { source?.disconnect(); } catch {}
    sineSources.forEach((sine) => {
      try { sine.stop(); } catch {}
      try { sine.disconnect(); } catch {}
    });
    inputGains.forEach((gain) => { try { gain.disconnect(); } catch {} });
    references.forEach((analyser) => { try { analyser.disconnect(); } catch {} });
    try { splitter?.disconnect(); } catch {}
    outputTaps.forEach((analyser) => { try { analyser.disconnect(); } catch {} });
    if (device) audioEngine.removeDevice(device.id, true);
  }
}

/** Utility-category devices are checked against their job, not against a generic colour test. */
async function probeUtilityBehavior(type: string): Promise<string> {
  const device = audioEngine.createDevice(type as Parameters<typeof audioEngine.createDevice>[0], `Utility behavior probe · ${type}`);
  const spec = specFor(type);
  if (!spec) throw new Error(`${type}: utility specification is missing`);
  const ctx = audioEngine.ctx;
  const inputIndexes = [...device.audioInputs.keys()]
    .filter((id) => /^in\d*_l$/.test(id))
    .map((id) => id === 'in_l' ? 1 : Number(id.match(/^in(\d+)_l$/)?.[1] ?? 0))
    .sort((a, b) => a - b);
  const outputIndexes = [...device.audioOutputs.keys()]
    .filter((id) => /^out\d*_l$/.test(id))
    .map((id) => id === 'out_l' ? 1 : Number(id.match(/^out(\d+)_l$/)?.[1] ?? 0))
    .sort((a, b) => a - b);
  const outputs = outputIndexes.map((index) => {
    const left = device.audioOutputs.get(index === 1 ? 'out_l' : `out${index}_l`);
    const right = device.audioOutputs.get(index === 1 ? 'out_r' : `out${index}_r`);
    if (!left || !right) throw new Error(`output pair ${index} is incomplete`);
    return [left, right].map((node) => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      node.connect(analyser);
      analyser.connect(ctx.destination);
      return analyser;
    });
  });
  const refs = [0, 1].map(() => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    analyser.connect(ctx.destination);
    return analyser;
  });
  const sources: AudioScheduledSourceNode[] = [];
  const sourceGains: GainNode[] = [];
  const disconnectSources = () => {
    sources.forEach((oscillator) => {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
    });
    sourceGains.forEach((gain) => { try { gain.disconnect(); } catch {} });
    sources.length = 0;
    sourceGains.length = 0;
  };
  const startTone = (inputIndex: number, leftHz = 997, rightHz = 619) => {
    const leftId = inputIndex === 1 ? 'in_l' : `in${inputIndex}_l`;
    const rightId = inputIndex === 1 ? 'in_r' : `in${inputIndex}_r`;
    const leftInput = device.audioInputs.get(leftId);
    const rightInput = device.audioInputs.get(rightId);
    if (!leftInput || !rightInput) throw new Error(`input pair ${inputIndex} is incomplete`);
    for (const [frequency, input, reference] of [[leftHz, leftInput, refs[0]!], [rightHz, rightInput, refs[1]!]] as const) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(input);
      gain.connect(reference);
      oscillator.start(ctx.currentTime + 0.02);
      sources.push(oscillator);
      sourceGains.push(gain);
    }
  };
  const startNoise = (inputIndex: number) => {
    const leftId = inputIndex === 1 ? 'in_l' : `in${inputIndex}_l`;
    const rightId = inputIndex === 1 ? 'in_r' : `in${inputIndex}_r`;
    const leftInput = device.audioInputs.get(leftId);
    const rightInput = device.audioInputs.get(rightId);
    if (!leftInput || !rightInput) throw new Error(`input pair ${inputIndex} is incomplete`);
    for (const [channel, input, reference] of [[0, leftInput, refs[0]!], [1, rightInput, refs[1]!]] as const) {
      const buffer = ctx.createBuffer(1, 16_384, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = channel === 0 ? 0x13579bd : 0x2468ace;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        data[i] = ((seed / 0xffff_ffff) * 2 - 1) * 0.12;
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(input);
      gain.connect(reference);
      source.start(ctx.currentTime + 0.02);
      sources.push(source);
      sourceGains.push(gain);
    }
  };
  const startAntiphaseNoise = () => {
    const leftInput = device.audioInputs.get('in_l');
    const rightInput = device.audioInputs.get('in_r');
    if (!leftInput || !rightInput) throw new Error('stereo input pair is incomplete');
    const buffer = ctx.createBuffer(1, 16_384, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x51f15e;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      data[i] = (seed / 0xffff_ffff) * 0.24 - 0.12;
    }
    const source = ctx.createBufferSource();
    const leftGain = ctx.createGain();
    const rightGain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    leftGain.gain.value = 1;
    rightGain.gain.value = -1;
    source.connect(leftGain);
    source.connect(rightGain);
    leftGain.connect(leftInput);
    leftGain.connect(refs[0]!);
    rightGain.connect(rightInput);
    rightGain.connect(refs[1]!);
    source.start(ctx.currentTime + 0.02);
    sources.push(source);
    sourceGains.push(leftGain, rightGain);
  };
  // Utility routing changes are smoothed in the graph and the analyser contains an 85 ms
  // history. Advance by AudioContext time, rather than merely waiting on a busy UI thread, so
  // the read is a complete post-change analyser window even late in the catalog sweep.
  const waitForSignal = async () => {
    await waitForAudio(ctx, 0.34);
  };
  const fail = (message: string): never => { throw new Error(`${type}: ${message}`); };

  try {
    device.isBypassed = false;
    device.isPowered = true;
    if (spec.engine === 'mixer') {
      for (const inputIndex of inputIndexes) {
        const muteKey = `ch${inputIndex}Mute`;
        if (!(muteKey in device.params)) fail(`missing channel mute control ${muteKey}`);
        device.setParam(muteKey, 0);
        device.setParam(`ch${inputIndex}Level`, 0);
        startTone(inputIndex, 400 + inputIndex * 37, 700 + inputIndex * 31);
        await waitForSignal();
        const active = Math.max(rmsOf(outputs[0]![0]), rmsOf(outputs[0]![1]));
        if (active < 0.02) fail(`channel ${inputIndex} did not reach the stereo master (RMS ${active.toExponential(2)})`);
        device.setParam(muteKey, 1);
        await waitForSignal();
        const muted = Math.max(rmsOf(outputs[0]![0]), rmsOf(outputs[0]![1]));
        if (muted > active * 0.03) fail(`channel ${inputIndex} mute left ${(muted / active * 100).toFixed(1)}% of its signal (active ${active.toExponential(2)}, muted ${muted.toExponential(2)})`);
        device.setParam(muteKey, 0);
        disconnectSources();
      }
      return `${inputIndexes.length} mixer channels reached the master and each channel mute silenced its input`;
    }

    if (spec.engine === 'di') {
      startTone(1, 80, 110);
      device.setParam('color', 0);
      device.setParam('lowCut', 0);
      device.setParam('pad', 0);
      await waitForSignal();
      const dryLevel = rmsOf(outputs[0]![0]);
      const dryPhase = signedCorrelation(samplesOf(refs[0]!), samplesOf(outputs[0]![0]), 128);
      device.setParam('polarity', 1);
      await waitForSignal();
      const invertedPhase = signedCorrelation(samplesOf(refs[0]!), samplesOf(outputs[0]![0]), 128);
      device.setParam('polarity', 0);
      device.setParam('pad', 1);
      // The DI pad uses a 15 ms AudioParam smoothing time.  Wait for that ramp plus a complete
      // 4096-frame analyser window so the previous 0 dB level cannot skew a −15 dB measurement.
      await waitForSignal();
      const paddedLevel = rmsOf(outputs[0]![0]);
      const padRatio = paddedLevel / Math.max(1e-9, dryLevel);
      if (dryPhase < 0.5 || invertedPhase > -0.5) fail(`polarity control did not flip phase (normal ${dryPhase.toFixed(3)}, inverted ${invertedPhase.toFixed(3)})`);
      if (padRatio < 0.14 || padRatio > 0.22) fail(`−15 dB pad gave ${padRatio.toFixed(3)}× level; expected about 0.178×`);
      return `polarity reversed phase; −15 dB pad measured ${padRatio.toFixed(3)}×`;
    }

    if (spec.engine === 'stereo' && spec.engineConfig?.model === 'gain') {
      startNoise(1);
      device.setParam('gain', 6);
      await waitForSignal();
      const ratio = rmsOf(outputs[0]![0]) / Math.max(1e-9, rmsOf(refs[0]!));
      device.setParam('invertL', 1);
      await waitForSignal();
      const phase = signedCorrelation(samplesOf(refs[0]!), samplesOf(outputs[0]![0]), 128);
      if (ratio < 1.85 || ratio > 2.15) fail(`+6 dB gain measured ${ratio.toFixed(3)}×; expected about 2×`);
      if (phase > -0.95) fail(`left polarity switch did not invert the signal (correlation ${phase.toFixed(3)})`);
      return `+6 dB gain measured ${ratio.toFixed(3)}×; left polarity inverted`;
    }

    if (spec.engine === 'stereo') {
      startAntiphaseNoise();
      if (spec.engineConfig?.model === 'stereo') {
        device.setParam('width', 0);
        device.setParam('monoBelow', 500);
      } else {
        device.setParam('loWidth', 0);
        device.setParam('hiWidth', 0);
      }
      await waitForSignal();
      const inputLevel = rmsOf(refs[0]!);
      const outputLevel = Math.max(rmsOf(outputs[0]![0]), rmsOf(outputs[0]![1]));
      const ratio = outputLevel / Math.max(1e-9, inputLevel);
      if (ratio > 0.05) fail(`zero width failed to cancel an anti-phase input (output/input ${ratio.toFixed(3)}×)`);
      return `zero-width setting cancelled an anti-phase input (${ratio.toFixed(3)}× residual)`;
    }

    if (spec.engine === 'patchbay') {
      if (inputIndexes.length < 2 || outputIndexes.length < 2) fail('expected at least two stereo input and output pairs');
      device.setParam('mode', 2); // Isolated: only explicit front-panel patches pass.
      device.setParam('route1', 2); // Out 1 ← In 2.
      startTone(2);
      await waitForSignal();
      const routed = Math.max(rmsOf(outputs[0]![0]), rmsOf(outputs[0]![1]));
      const unpatched = Math.max(rmsOf(outputs[1]![0]), rmsOf(outputs[1]![1]));
      if (routed < 0.02) fail(`explicit In 2 → Out 1 route was silent (RMS ${routed.toExponential(2)})`);
      if (unpatched > 0.001) fail(`isolated Out 2 leaked an unpatched input (RMS ${unpatched.toExponential(2)})`);
      disconnectSources();
      device.setParam('route1', inputIndexes.length + 1); // Off
      startTone(2);
      await waitForSignal();
      const off = Math.max(rmsOf(outputs[0]![0]), rmsOf(outputs[0]![1]));
      if (off > 0.001) fail(`Out 1 remained audible when set Off (RMS ${off.toExponential(2)})`);
      return `isolated patch routed In 2 → Out 1, left Out 2 silent, and muted Out 1 when set Off`;
    }

    return fail('no function-specific utility assertion exists');
  } finally {
    disconnectSources();
    outputs.flat().forEach((analyser) => { try { analyser.disconnect(); } catch {} });
    refs.forEach((analyser) => { try { analyser.disconnect(); } catch {} });
    audioEngine.removeDevice(device.id, true);
  }
}

async function run(): Promise<void> {
  await audioEngine.resumeContext();
  const selectedTypes = new Set((new URLSearchParams(location.search).get('type') ?? '').split(',').filter(Boolean));
  const effects = BUILTIN_DEVICES.filter((device) => device.role === 'effect' && device.audioIn && device.audioOut && (selectedTypes.size === 0 || selectedTypes.has(device.type)));
  if (selectedTypes.size > 0 && effects.length === 0) throw new Error(`No audio effect matches type(s) '${[...selectedTypes].join(', ')}'`);
  const failures: string[] = [];
  let worstBypassError = 0;
  let responsive = 0;
  let responseChecked = 0;
  let utilityChecked = 0;
  const utilityTotal = effects.filter((effect) => effect.category === 'utility').length;
  const responseTypes = effects.filter((effect) => effect.category !== 'utility' || ['mclass_imager', 'stereo_tool', 'gain_tool'].includes(effect.type));

  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index]!;
    result!.textContent = `Checking effect bypass ${index + 1}/${effects.length}: ${effect.type}`;
    try {
      const shouldMeasureResponse = responseTypes.some((entry) => entry.type === effect.type);
      const probe = await probeEffect(effect.type, shouldMeasureResponse);
      worstBypassError = Math.max(worstBypassError, probe.bypassError);
      if (shouldMeasureResponse) {
        responseChecked++;
        if (probe.response) responsive++;
      }
      if (effect.category === 'utility') {
        const behavior = await probeUtilityBehavior(effect.type);
        utilityChecked++;
        result!.textContent = `Checking utility behavior ${utilityChecked}/${utilityTotal}: ${effect.type} · ${behavior}`;
      }
    } catch (error) {
      failures.push(`${effect.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    result!.dataset.status = 'failed';
    result!.textContent = `FAIL · ${effects.length} effects checked; ${failures.length} issue(s):\n${failures.join('\n')}`;
    return;
  }
  result!.dataset.status = 'passed';
  result!.textContent = `PASS · ${effects.length} audio effects preserved stereo dry signal within ${(worstBypassError * 100).toFixed(3)}% in bypass and silenced output when powered off; ${responsive}/${responseChecked} processors measurably changed input; ${utilityChecked}/${utilityTotal} utility devices passed function-specific routing/control checks.`;
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
