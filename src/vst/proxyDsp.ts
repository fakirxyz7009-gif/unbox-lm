/**
 * Web Audio stand-in DSP for library units. Browsers cannot load native VST2/VST3/AAX binaries,
 * so each mounted unit runs a small processor matched to its category. Everything here builds
 * Web Audio graphs; the main thread only schedules parameter changes (plus throttled control-rate
 * work: waveshaper curves and reverb impulses). Macro meanings match shared/vst/categories.ts.
 */
import { CATEGORY_LABELS } from '../../shared/vst/categories.ts';
import type { SoundCategory } from '../../shared/vst/manifestTypes.ts';

export type Macros = [number, number, number, number];

export interface EffectProxy {
  readonly label: string;
  readonly input: AudioNode;
  readonly output: AudioNode;
  setMacros(m: Macros): void;
  dispose(): void;
}

export interface InstrumentProxy {
  readonly label: string;
  readonly output: AudioNode;
  setMacros(m: Macros): void;
  noteOn(midi: number, velocity: number, time: number): void;
  noteOff(midi: number, time: number): void;
  allNotesOff(time: number): void;
  dispose(): void;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function glide(param: AudioParam, value: number, ctx: BaseAudioContext, tau = 0.02): void {
  param.setTargetAtTime(value, ctx.currentTime, tau);
}

// ---- shared buffers (one per context) ----

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Decorrelated stereo noise impulse with an exponential (-60 dB at `seconds`) tail. */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  const k = -6.9 / len;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(k * i);
  }
  return ir;
}

function rampBuffer(ctx: BaseAudioContext, shape: 'ramp' | 'window'): AudioBuffer {
  const len = ctx.sampleRate;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = shape === 'ramp' ? i / len : Math.sin((Math.PI * i) / len);
  return b;
}

/** Calls fn at most every `ms` (trailing call kept) — for expensive control-rate rebuilds. */
function throttle(fn: () => void, ms: number): () => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn();
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn();
      }, ms - (now - last));
    }
  };
}

// =============================================================================================
// Effects
// =============================================================================================

function eqProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const specs: [BiquadFilterType, number][] = [['lowshelf', 110], ['peaking', 480], ['peaking', 2800], ['highshelf', 8500]];
  const bands = specs.map(([type, f]) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = 0.9;
    return b;
  });
  input.connect(bands[0]);
  bands.reduce((a, b) => (a.connect(b), b)).connect(output);
  return {
    label: '4-band EQ',
    input,
    output,
    setMacros: (m) => bands.forEach((b, i) => glide(b.gain, (m[i] - 0.5) * 24, ctx)),
    dispose: () => [input, output, ...bands].forEach((n) => n.disconnect()),
  };
}

function limiterProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const output = ctx.createGain();
  comp.threshold.value = -1;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  input.connect(comp);
  comp.connect(output);
  return {
    label: 'Brickwall limiter',
    input,
    output,
    setMacros: (m) => {
      glide(input.gain, dbToGain(m[0] * 18), ctx);
      glide(output.gain, dbToGain(-12 + m[1] * 12), ctx);
      glide(comp.release, 0.01 + m[2] * 0.6, ctx);
    },
    dispose: () => [input, comp, output].forEach((n) => n.disconnect()),
  };
}

function compressorProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const output = ctx.createGain();
  comp.knee.value = 6;
  comp.release.value = 0.25;
  input.connect(comp);
  comp.connect(output);
  return {
    label: 'Compressor',
    input,
    output,
    setMacros: (m) => {
      glide(comp.threshold, -m[0] * 40, ctx);
      glide(comp.ratio, 1 + m[1] * 19, ctx);
      glide(comp.attack, 0.001 + m[2] * 0.1, ctx);
      glide(output.gain, dbToGain(m[3] * 18), ctx);
    },
    dispose: () => [input, comp, output].forEach((n) => n.disconnect()),
  };
}

function saturationProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const dcBlock = ctx.createBiquadFilter();
  const tone = ctx.createBiquadFilter();
  const output = ctx.createGain();
  shaper.oversample = '4x';
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 18;
  tone.type = 'lowpass';
  input.connect(shaper);
  shaper.connect(dcBlock);
  dcBlock.connect(tone);
  tone.connect(output);
  let key = '';
  const curve = new Float32Array(2048);
  return {
    label: 'Saturator',
    input,
    output,
    setMacros: (m) => {
      const drive = dbToGain(m[0] * 24);
      const bias = m[1] * 0.5;
      const next = `${drive.toFixed(2)}|${bias.toFixed(2)}`;
      if (next !== key) {
        key = next;
        const t0 = Math.tanh(bias);
        const norm = Math.max(Math.abs(Math.tanh(drive + bias) - t0), Math.abs(Math.tanh(-drive + bias) - t0));
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = (Math.tanh(drive * x + bias) - t0) / norm;
        }
        shaper.curve = curve.slice();
      }
      // Rough loudness compensation for the drive, then the user's trim.
      const smallSignalGain = drive / Math.tanh(drive);
      glide(output.gain, dbToGain((m[3] - 0.75) * 24) / Math.sqrt(smallSignalGain), ctx);
      glide(tone.frequency, 2000 * Math.pow(2, m[2] * 3.3), ctx);
    },
    dispose: () => [input, shaper, dcBlock, tone, output].forEach((n) => n.disconnect()),
  };
}

/**
 * Delay-line pitch shifter: two taps whose delay ramps linearly (pitch = 1 − slope), offset by half
 * a period and crossfaded with equal-power windows so the ramp resets are inaudible.
 */
function pitchProxy(ctx: BaseAudioContext): EffectProxy {
  const WINDOW = 0.08;
  const input = ctx.createGain();
  const direct = ctx.createGain();
  const shifted = ctx.createGain();
  const crush = ctx.createWaveShaper();
  const tone = ctx.createBiquadFilter();
  const output = ctx.createGain();
  tone.type = 'highshelf';
  tone.frequency.value = 3000;
  input.connect(direct);
  direct.connect(crush);
  shifted.connect(crush);
  crush.connect(tone);
  tone.connect(output);

  const ramp = rampBuffer(ctx, 'ramp');
  const win = rampBuffer(ctx, 'window');
  const sources: AudioBufferSourceNode[] = [];
  const scalers: GainNode[] = [];
  const delays: DelayNode[] = [];
  const start = ctx.currentTime + 0.01;
  for (let tap = 0; tap < 2; tap++) {
    const delay = ctx.createDelay(1);
    const tapGain = ctx.createGain();
    tapGain.gain.value = 0;
    const scaler = ctx.createGain();
    const rampSrc = ctx.createBufferSource();
    const winSrc = ctx.createBufferSource();
    rampSrc.buffer = ramp;
    winSrc.buffer = win;
    rampSrc.loop = winSrc.loop = true;
    rampSrc.connect(scaler);
    scaler.connect(delay.delayTime);
    winSrc.connect(tapGain.gain);
    input.connect(delay);
    delay.connect(tapGain);
    tapGain.connect(shifted);
    const offset = tap * 0.5 * ramp.duration;
    rampSrc.start(start, offset);
    winSrc.start(start, offset);
    sources.push(rampSrc, winSrc);
    scalers.push(scaler);
    delays.push(delay);
  }
  let crushKey = -1;
  return {
    label: 'Pitch shifter + bitcrusher',
    input,
    output,
    setMacros: (m) => {
      const semis = Math.round((m[0] - 0.5) * 24);
      const ratio = Math.pow(2, semis / 12);
      const slope = 1 - ratio; // > 0: delay grows (pitch down); < 0: delay shrinks (pitch up)
      const active = semis !== 0;
      glide(direct.gain, active ? 0 : 1, ctx, 0.03);
      glide(shifted.gain, active ? 1 : 0, ctx, 0.03);
      if (active) {
        const rate = (Math.abs(slope) * ramp.duration) / WINDOW;
        sources.forEach((s) => glide(s.playbackRate, rate, ctx, 0.05));
        scalers.forEach((g) => glide(g.gain, slope > 0 ? WINDOW : -WINDOW, ctx, 0.05));
        delays.forEach((d) => glide(d.delayTime, slope > 0 ? 0 : WINDOW, ctx, 0.05));
      }
      const bits = Math.round(16 - m[1] * 13);
      if (bits !== crushKey) {
        crushKey = bits;
        if (bits >= 16) crush.curve = null;
        else {
          const steps = Math.pow(2, bits - 1);
          const c = new Float32Array(4096);
          for (let i = 0; i < c.length; i++) c[i] = Math.round(((i / (c.length - 1)) * 2 - 1) * steps) / steps;
          crush.curve = c;
        }
      }
      glide(tone.gain, (m[2] - 0.5) * 18, ctx);
    },
    dispose: () => {
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // not started yet
        }
        s.disconnect();
      });
      [input, direct, shifted, crush, tone, output, ...scalers, ...delays].forEach((n) => n.disconnect());
    },
  };
}

function reverbProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const predelay = ctx.createDelay(0.5);
  const conv = ctx.createConvolver();
  const damp = ctx.createBiquadFilter();
  const output = ctx.createGain();
  damp.type = 'lowpass';
  input.connect(predelay);
  predelay.connect(conv);
  conv.connect(damp);
  damp.connect(output);
  output.gain.value = 0.7;
  let seconds = 0;
  let wanted = 2.5;
  const rebuild = throttle(() => {
    if (Math.abs(wanted - seconds) / wanted < 0.08) return;
    seconds = wanted;
    conv.buffer = makeImpulse(ctx, seconds);
  }, 400);
  return {
    label: 'Convolution reverb',
    input,
    output,
    setMacros: (m) => {
      wanted = 0.4 + m[0] * 7.6;
      rebuild();
      glide(predelay.delayTime, m[1] * 0.12, ctx);
      glide(damp.frequency, 16000 * Math.pow(2, -m[2] * 3.4), ctx);
    },
    dispose: () => [input, predelay, conv, damp, output].forEach((n) => n.disconnect()),
  };
}

function delayProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const output = ctx.createGain();
  input.connect(split);
  const lines = [0, 1].map((ch) => {
    const delay = ctx.createDelay(3);
    const tone = ctx.createBiquadFilter();
    const fb = ctx.createGain();
    tone.type = 'lowpass';
    split.connect(delay, ch);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(merge, 0, ch);
    return { delay, tone, fb };
  });
  merge.connect(output);
  return {
    label: 'Stereo delay',
    input,
    output,
    setMacros: (m) => {
      const time = 0.02 + m[0] * m[0] * 1.2;
      lines.forEach((l, ch) => {
        glide(l.delay.delayTime, ch ? time * (1 + m[3] * 0.5) : time, ctx, 0.05);
        glide(l.fb.gain, m[1] * 0.9, ctx);
        glide(l.tone.frequency, 800 * Math.pow(2, m[2] * 4.3), ctx);
      });
    },
    dispose: () => [input, split, merge, output, ...lines.flatMap((l) => [l.delay, l.tone, l.fb])].forEach((n) => n.disconnect()),
  };
}

function chorusProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const output = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  input.connect(split);
  const lines = [0, 1].map((ch) => {
    const delay = ctx.createDelay(0.1);
    const depth = ctx.createGain();
    const fb = ctx.createGain();
    delay.delayTime.value = 0.012;
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    split.connect(delay, ch);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(merge, 0, ch);
    return { delay, depth, fb, sign: ch ? -1 : 1 };
  });
  merge.connect(output);
  lfo.start();
  return {
    label: 'Stereo chorus',
    input,
    output,
    setMacros: (m) => {
      glide(lfo.frequency, 0.05 * Math.pow(120, m[0]), ctx);
      lines.forEach((l) => {
        glide(l.depth.gain, l.sign * m[1] * 0.006, ctx);
        glide(l.fb.gain, m[2] * 0.6, ctx);
      });
    },
    dispose: () => {
      lfo.stop();
      [input, split, merge, output, lfo, ...lines.flatMap((l) => [l.delay, l.depth, l.fb])].forEach((n) => n.disconnect());
    },
  };
}

function filterProxy(ctx: BaseAudioContext): EffectProxy {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const filter = ctx.createBiquadFilter();
  const output = ctx.createGain();
  filter.type = 'lowpass';
  input.connect(shaper);
  shaper.connect(filter);
  filter.connect(output);
  let driveKey = -1;
  return {
    label: 'Resonant filter',
    input,
    output,
    setMacros: (m) => {
      glide(filter.frequency, 60 * Math.pow(2, m[0] * 8.3), ctx);
      glide(filter.Q, 0.5 + m[1] * 17, ctx);
      const k = Math.round(m[2] * 20);
      if (k !== driveKey) {
        driveKey = k;
        if (k === 0) shaper.curve = null;
        else {
          const c = new Float32Array(1024);
          for (let i = 0; i < c.length; i++) {
            const x = (i / (c.length - 1)) * 2 - 1;
            c[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
          }
          shaper.curve = c;
        }
      }
    },
    dispose: () => [input, shaper, filter, output].forEach((n) => n.disconnect()),
  };
}

function utilityProxy(ctx: BaseAudioContext): EffectProxy {
  const node = ctx.createGain();
  return {
    label: 'Gain utility',
    input: node,
    output: node,
    setMacros: (m) => glide(node.gain, dbToGain(-24 + m[0] * 36), ctx),
    dispose: () => node.disconnect(),
  };
}

export function createEffectProxy(ctx: BaseAudioContext, category: SoundCategory): EffectProxy {
  switch (category) {
    case 'eq': return eqProxy(ctx);
    case 'limiter': return limiterProxy(ctx);
    case 'dynamics': return compressorProxy(ctx);
    case 'saturation': return saturationProxy(ctx);
    case 'pitch': return pitchProxy(ctx);
    case 'reverb': return reverbProxy(ctx);
    case 'delay': return delayProxy(ctx);
    case 'modulation': return chorusProxy(ctx);
    case 'filter': return filterProxy(ctx);
    default: return utilityProxy(ctx);
  }
}

/** Effects that sit in series get 100% wet; send-style effects start mixed with the dry signal. */
export function defaultMixFor(category: SoundCategory): number {
  return category === 'reverb' ? 0.35 : category === 'delay' ? 0.3 : category === 'modulation' ? 0.5 : 1;
}

// =============================================================================================
// Instruments
// =============================================================================================

interface Voice {
  midi: number;
  amp: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  /** Seconds the release takes. */
  release: number;
}

type VoiceBuilder = (ctx: BaseAudioContext, midi: number, vel: number, t: number, m: Macros, bus: AudioNode) => Voice;

function stopVoice(ctx: BaseAudioContext, v: Voice, time: number, release = v.release): void {
  const t = Math.max(ctx.currentTime, time);
  // Hold the current level (no jump) when releasing in the middle of an envelope segment.
  if (typeof v.amp.gain.cancelAndHoldAtTime === 'function') v.amp.gain.cancelAndHoldAtTime(t);
  else v.amp.gain.cancelScheduledValues(t);
  v.amp.gain.setTargetAtTime(0, t, Math.max(0.005, release / 4));
  const end = t + release + 0.05;
  v.sources.forEach((s) => {
    try {
      s.stop(end);
    } catch {
      // already stopped
    }
  });
}

function cleanupOnEnd(v: Voice): void {
  const first = v.sources[0];
  if (first) first.onended = () => [...v.sources, ...v.nodes, v.amp].forEach((n) => n.disconnect());
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, detuneCents = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detuneCents;
  return o;
}

function noiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.loop = true;
  return n;
}

const pianoVoice: VoiceBuilder = (ctx, midi, vel, t, m, bus) => {
  const f = midiToHz(midi);
  const span = Math.min(1, Math.max(0, (midi - 21) / 88));
  const decay = (0.6 + m[1] * 5) * (1.4 - span * 0.9);
  const amp = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const top = Math.min(18000, f * (3 + m[0] * 14) * (0.6 + vel * 0.6));
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.setTargetAtTime(Math.max(200, f * (1.5 + m[0] * 4)), t + 0.01, decay * 0.35);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.55 * vel, t + 0.004);
  amp.gain.setTargetAtTime(0, t + 0.004, decay / 4);
  lp.connect(amp);
  amp.connect(bus);
  const partials: [number, number][] = [[1, 1], [2.0016, 0.42], [3.0045, 0.2 + m[0] * 0.15], [4.009, 0.1 * m[0]]];
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [lp];
  partials.forEach(([mult, level], i) => {
    if (f * mult > 18000 || level <= 0) return;
    const o = osc(ctx, i === 0 ? 'triangle' : 'sine', f * mult);
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(lp);
    o.start(t);
    sources.push(o);
    nodes.push(g);
  });
  // Hammer thump
  const hammer = noiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  const hg = ctx.createGain();
  hp.type = 'bandpass';
  hp.frequency.value = 2500;
  hg.gain.setValueAtTime(0.12 * vel * (0.3 + m[0]), t);
  hg.gain.setTargetAtTime(0, t, 0.006);
  hammer.connect(hp);
  hp.connect(hg);
  hg.connect(amp);
  hammer.start(t);
  hammer.stop(t + 0.08);
  nodes.push(hp, hg);
  sources.push(hammer);
  return { midi, amp, sources, nodes, release: 0.25 };
};

function ensembleVoice(category: SoundCategory): VoiceBuilder {
  return (ctx, midi, vel, t, m, bus) => {
    const f = midiToHz(midi);
    const attack = 0.005 + m[0] * m[0] * 2.5;
    const release = 0.08 + m[3] * m[3] * 4;
    const amp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = category === 'brass' ? 1.2 : 0.7;
    const bright = f * (2 + m[1] * (category === 'brass' ? 12 : 10));
    if (category === 'brass') {
      lp.frequency.setValueAtTime(f * 1.5, t);
      lp.frequency.setTargetAtTime(bright, t, Math.max(0.02, attack * 0.6));
    } else lp.frequency.value = Math.min(18000, bright);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.32 * (0.4 + vel * 0.6), t + attack);
    // Delayed vibrato
    const lfo = osc(ctx, 'sine', 5.2);
    const vib = ctx.createGain();
    const depth = f * (Math.pow(2, (m[2] * 25) / 1200) - 1);
    vib.gain.setValueAtTime(0, t);
    vib.gain.linearRampToValueAtTime(depth, t + 0.35 + attack * 0.5);
    lfo.connect(vib);
    lfo.start(t);
    const sources: AudioScheduledSourceNode[] = [lfo];
    const nodes: AudioNode[] = [lp, vib];
    const layer = (type: OscillatorType, mult: number, cents: number, level: number) => {
      const o = osc(ctx, type, f * mult, cents);
      const g = ctx.createGain();
      g.gain.value = level;
      vib.connect(o.frequency);
      o.connect(g);
      g.connect(lp);
      o.start(t);
      sources.push(o);
      nodes.push(g);
    };
    if (category === 'winds') {
      layer('triangle', 1, 0, 0.8);
      layer('sine', 2, 3, 0.25);
      const breath = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      const bg = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(12000, f * 2);
      bp.Q.value = 2;
      bg.gain.value = 0.06;
      breath.connect(bp);
      bp.connect(bg);
      bg.connect(lp);
      breath.start(t);
      sources.push(breath);
      nodes.push(bp, bg);
    } else if (category === 'choir') {
      const formants: [number, number][] = [[730 - m[1] * 300, 0.6], [1090, 0.35], [2440, 0.12]];
      const src = osc(ctx, 'sawtooth', f, 0);
      vib.connect(src.frequency);
      formants.forEach(([ff, level]) => {
        const bp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = 6;
        g.gain.value = level * 2.2;
        src.connect(bp);
        bp.connect(g);
        g.connect(lp);
        nodes.push(bp, g);
      });
      src.start(t);
      sources.push(src);
    } else {
      layer('sawtooth', 1, -7, 0.45);
      layer('sawtooth', 1, 6, 0.45);
      layer('sawtooth', 1, 0, 0.35);
      if (category === 'brass' || category === 'orchestral') layer('square', 1, 0, 0.18);
    }
    lp.connect(amp);
    amp.connect(bus);
    return { midi, amp, sources, nodes, release };
  };
}

const guitarVoice: VoiceBuilder = (ctx, midi, vel, t, m, bus) => {
  const f = midiToHz(midi);
  const decay = 0.4 + m[2] * 4.6;
  const amp = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(Math.min(18000, f * (4 + m[0] * 16) * (0.5 + vel)), t);
  lp.frequency.setTargetAtTime(f * 1.5, t + 0.005, decay * 0.22);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.45 * vel, t + 0.002);
  amp.gain.setTargetAtTime(0, t + 0.002, decay / 4);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [lp];
  ([['sawtooth', 1, 0.6], ['square', 1, 0.25], ['sine', 2, 0.15]] as [OscillatorType, number, number][]).forEach(([type, mult, level]) => {
    const o = osc(ctx, type, f * mult, (Math.random() - 0.5) * 6);
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(lp);
    o.start(t);
    sources.push(o);
    nodes.push(g);
  });
  const pick = noiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  const pg = ctx.createGain();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  pg.gain.setValueAtTime(m[1] * 0.3 * vel, t);
  pg.gain.setTargetAtTime(0, t, 0.004);
  pick.connect(hp);
  hp.connect(pg);
  pg.connect(amp);
  pick.start(t);
  pick.stop(t + 0.05);
  sources.push(pick);
  nodes.push(hp, pg);
  lp.connect(amp);
  amp.connect(bus);
  return { midi, amp, sources, nodes, release: 0.12 };
};

function synthVoice(category: SoundCategory): VoiceBuilder {
  return (ctx, midi, vel, t, m, bus) => {
    const f = midiToHz(midi);
    const isBass = category === 'bass';
    const amp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7 + m[1] * 11;
    const cutoff = Math.min(18000, f * (1.5 + m[0] * (isBass ? 12 : 20)));
    lp.frequency.setValueAtTime(Math.min(18000, cutoff * 2.5), t);
    lp.frequency.setTargetAtTime(cutoff, t + 0.005, isBass ? 0.06 + m[2] * 0.4 : 0.15);
    const attack = isBass ? 0.004 : 0.004 + m[2] * m[2] * 2;
    const release = isBass ? 0.08 : 0.05 + m[3] * m[3] * 3;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.3 * vel, t + attack);
    if (isBass) amp.gain.setTargetAtTime(0.18 * vel, t + attack, 0.15 + m[2] * 1.5);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [lp];
    const layers: [OscillatorType, number, number, number][] = isBass
      ? [['sawtooth', 1, 0, 0.6], ['sine', 0.5, 0, 0.7]]
      : [['sawtooth', 1, -8, 0.5], ['sawtooth', 1, 8, 0.5], ['square', 0.5, 0, 0.2]];
    layers.forEach(([type, mult, cents, level]) => {
      const o = osc(ctx, type, f * mult, cents);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(lp);
      o.start(t);
      sources.push(o);
      nodes.push(g);
    });
    lp.connect(amp);
    amp.connect(bus);
    return { midi, amp, sources, nodes, release };
  };
}

/** GM-style drum map: kick, snare, clap, toms, hats, cymbals. */
const drumVoice: VoiceBuilder = (ctx, midi, vel, t, m, bus) => {
  const amp = ctx.createGain();
  amp.connect(bus);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const role =
    midi === 35 || midi === 36 ? 'kick'
    : midi === 38 || midi === 40 || midi === 37 ? 'snare'
    : midi === 39 ? 'clap'
    : [41, 43, 45, 47, 48, 50].includes(midi) ? 'tom'
    : midi === 42 || midi === 44 ? 'hat'
    : midi === 46 ? 'openhat'
    : [49, 51, 52, 53, 55, 57, 59].includes(midi) ? 'cymbal'
    : (['kick', 'snare', 'hat', 'tom', 'clap', 'openhat', 'kick', 'hat', 'snare', 'tom', 'hat', 'cymbal'] as const)[midi % 12];
  const noise = (filter: BiquadFilterType, freq: number, q: number, level: number, decay: number) => {
    const n = noiseSource(ctx);
    const fl = ctx.createBiquadFilter();
    const g = ctx.createGain();
    fl.type = filter;
    fl.frequency.value = freq;
    fl.Q.value = q;
    g.gain.setValueAtTime(level * vel, t);
    g.gain.setTargetAtTime(0, t + 0.001, decay / 4);
    n.connect(fl);
    fl.connect(g);
    g.connect(amp);
    n.start(t);
    n.stop(t + decay * 1.5 + 0.05);
    sources.push(n);
    nodes.push(fl, g);
  };
  const tone = (from: number, to: number, level: number, decay: number) => {
    const o = osc(ctx, 'sine', from);
    const g = ctx.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + 0.08);
    g.gain.setValueAtTime(level * vel, t);
    g.gain.setTargetAtTime(0, t + 0.002, decay / 4);
    o.connect(g);
    g.connect(amp);
    o.start(t);
    o.stop(t + decay * 1.5 + 0.05);
    sources.push(o);
    nodes.push(g);
  };
  const hatDecay = 0.03 + m[2] * 0.22;
  if (role === 'kick') tone(120 + m[0] * 100, 40 + m[0] * 40, 1, 0.45);
  else if (role === 'snare') {
    tone(150 + m[1] * 120, 120, 0.5, 0.12);
    noise('bandpass', 1800 + m[1] * 2500, 0.8, 0.7, 0.18);
  } else if (role === 'clap') noise('bandpass', 1200, 1.2, 0.8, 0.15);
  else if (role === 'tom') tone(midiToHz(midi) * 0.5 + 60, midiToHz(midi) * 0.35 + 40, 0.8, 0.35);
  else if (role === 'hat') noise('highpass', 7000, 0.7, 0.35, hatDecay);
  else if (role === 'openhat') noise('highpass', 6500, 0.7, 0.35, hatDecay * 4);
  else noise('highpass', 5000, 0.5, 0.3, 1.2);
  amp.gain.value = 1;
  return { midi, amp, sources, nodes, release: 0.6 };
};

function voiceFor(category: SoundCategory): VoiceBuilder {
  switch (category) {
    case 'piano':
    case 'keys':
      return pianoVoice;
    case 'strings':
    case 'brass':
    case 'winds':
    case 'choir':
    case 'orchestral':
      return ensembleVoice(category);
    case 'drums':
    case 'percussion':
      return drumVoice;
    case 'guitar':
      return guitarVoice;
    default:
      return synthVoice(category);
  }
}

const VOICE_LIMIT = 24;

export function createInstrumentProxy(ctx: BaseAudioContext, category: SoundCategory): InstrumentProxy {
  const build = voiceFor(category);
  const bus = ctx.createGain();
  const body = ctx.createBiquadFilter();
  const room = ctx.createConvolver();
  const roomSend = ctx.createGain();
  const output = ctx.createGain();
  body.type = 'peaking';
  body.frequency.value = category === 'guitar' ? 180 : 250;
  body.Q.value = 0.8;
  bus.connect(body);
  body.connect(output);
  body.connect(roomSend);
  roomSend.connect(room);
  room.connect(output);
  room.buffer = makeImpulse(ctx, 1.4);
  roomSend.gain.value = 0;

  const voices: Voice[] = [];
  let macros: Macros = [0.5, 0.5, 0.5, 0.5];
  const usesRoom = ['piano', 'keys', 'drums', 'percussion'].includes(category);
  const bodySlot = category === 'guitar' ? 3 : category === 'piano' || category === 'keys' ? 2 : null;

  return {
    label: `${CATEGORY_LABELS[category]} voice`,
    output,
    setMacros: (m) => {
      macros = m;
      glide(roomSend.gain, usesRoom ? m[3] * 0.6 : 0, ctx);
      glide(body.gain, bodySlot !== null ? (m[bodySlot] - 0.5) * 12 : 0, ctx);
    },
    noteOn: (midi, velocity, time) => {
      const t = Math.max(ctx.currentTime, time);
      const same = voices.findIndex((v) => v.midi === midi);
      if (same >= 0) stopVoice(ctx, voices.splice(same, 1)[0], t, 0.03);
      if (voices.length >= VOICE_LIMIT) stopVoice(ctx, voices.shift() as Voice, t, 0.02);
      const v = build(ctx, midi, clamp01(velocity), t, macros, bus);
      cleanupOnEnd(v);
      voices.push(v);
    },
    noteOff: (midi, time) => {
      const i = voices.findIndex((v) => v.midi === midi);
      if (i >= 0) stopVoice(ctx, voices.splice(i, 1)[0], time);
    },
    allNotesOff: (time) => voices.splice(0).forEach((v) => stopVoice(ctx, v, time, 0.05)),
    dispose: () => {
      voices.splice(0).forEach((v) => stopVoice(ctx, v, ctx.currentTime, 0.01));
      [bus, body, room, roomSend, output].forEach((n) => n.disconnect());
    },
  };
}

// =============================================================================================
// Presets and display
// =============================================================================================

const TONE_SLOT: Partial<Record<SoundCategory, number>> = { piano: 0, keys: 0, guitar: 0, synth: 0, bass: 0, strings: 1, brass: 1, winds: 1, orchestral: 1, choir: 1 };

/**
 * Preset names can't be loaded without the real plugin, so the proxy voices them from words in
 * the name ("Bright", "Felt", "Bone Dry", "Big Body", …). Returns macro overrides (0-based slots).
 */
export function presetVoicing(category: SoundCategory, name: string, group?: string): Partial<Record<0 | 1 | 2 | 3, number>> {
  const n = `${name} ${group ?? ''}`.toLowerCase();
  const out: Partial<Record<0 | 1 | 2 | 3, number>> = {};
  const tone = TONE_SLOT[category] as 0 | 1 | undefined;
  if (tone !== undefined) {
    if (/bright|brilliant|crisp|sparkl|incandescent|translucent/.test(n)) out[tone] = 0.8;
    if (/soft|felt|intimate|gentle|muted|rose|veil|whisper/.test(n)) out[tone] = 0.25;
    if (/dark|moody|submerged|lost|downstream/.test(n)) out[tone] = 0.2;
  }
  if (category === 'piano' || category === 'keys') {
    if (/bone dry|\bdry\b/.test(n)) out[3] = 0;
    if (/recital|plateau|dream|textures|orchestra|downstream|veil/.test(n)) {
      out[3] = 0.6;
      out[1] = 0.8;
    }
    if (/big body|heavy|body/.test(n)) out[2] = 0.8;
    if (/accompanist|balanced/.test(n)) Object.assign(out, { 0: 0.5, 2: 0.5 });
  }
  return out;
}

export function describeMacro(category: SoundCategory, index: number, v: number): string {
  const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`);
  const db = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)} dB`;
  switch (category) {
    case 'eq': return db((v - 0.5) * 24);
    case 'limiter': return [db(v * 18), db(-12 + v * 12), `${Math.round((0.01 + v * 0.6) * 1000)} ms`][index] ?? '';
    case 'dynamics': return [db(-v * 40), `${(1 + v * 19).toFixed(1)}:1`, `${Math.round(1 + v * 100)} ms`, db(v * 18)][index] ?? '';
    case 'saturation': return [db(v * 24), `${Math.round(v * 100)}%`, hz(2000 * Math.pow(2, v * 3.3)), db((v - 0.75) * 24)][index] ?? '';
    case 'pitch': {
      const s = Math.round((v - 0.5) * 24);
      return [`${s > 0 ? '+' : ''}${s} st`, `${Math.round(16 - v * 13)} bit`, db((v - 0.5) * 18)][index] ?? '';
    }
    case 'reverb': return [`${(0.4 + v * 7.6).toFixed(1)} s`, `${Math.round(v * 120)} ms`, hz(16000 * Math.pow(2, -v * 3.4))][index] ?? '';
    case 'delay': return [`${Math.round((0.02 + v * v * 1.2) * 1000)} ms`, `${Math.round(v * 90)}%`, hz(800 * Math.pow(2, v * 4.3)), `${Math.round(v * 50)}%`][index] ?? '';
    case 'modulation': return [`${(0.05 * Math.pow(120, v)).toFixed(2)} Hz`, `${(v * 6).toFixed(1)} ms`, `${Math.round(v * 60)}%`][index] ?? '';
    case 'filter': return [hz(60 * Math.pow(2, v * 8.3)), `Q ${(0.5 + v * 17).toFixed(1)}`, `${Math.round(v * 100)}%`][index] ?? '';
    case 'utility': return db(-24 + v * 36);
    default: return `${Math.round(v * 100)}%`;
  }
}
