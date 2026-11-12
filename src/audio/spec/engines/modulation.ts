/**
 * Modulation engine ('modulation') — models:
 *  - cf101: modulated delay chorus / flanger with feedback, stereo LFO phase, send mode.
 *  - ph90: 4-stage all-pass phaser (split, width, rate, f.mod, feedback).
 *  - quartet: Ensemble (3-voice chorus), Dimension (short cross-fed pair), Granular (pitch
 *    shimmer grains), Spectral (chorus on the highs only) — all built once, mode = crossfade.
 *  - sweeper: phaser / flanger / filter with LFO and envelope follower.
 *  - un16: 4 / 8 / 16 detuned delay voices (unison thickener).
 *  - rotary / tremolo: rotating speaker (horn and drum rotors) and stereo tremolo (rotary.ts).
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { buildChorus, buildFollower, buildPitchShifter, clamp, setSmooth, stopAll } from '../dsp.ts';
import { rotaryCabinet, stereoTremolo } from './rotary.ts';

export function modulationEngine(host: SpecHost): SpecEngine {
  switch (String(host.cfg.model ?? 'cf101')) {
    case 'ph90':
      return phaser(host);
    case 'quartet':
      return quartet(host);
    case 'sweeper':
      return sweeper(host);
    case 'un16':
      return unison(host);
    case 'rotary':
      return rotaryCabinet(host);
    case 'tremolo':
      return stereoTremolo(host);
    default:
      return cf101(host);
  }
}

/** Two modulated delays (L / R with 90° LFO offset) + feedback. */
function modDelayPair(ctx: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  input.connect(split);
  const lfoL = ctx.createOscillator();
  const lfoR = ctx.createOscillator();
  // Different periodic waves keep the stereo phase offset at 90° even as rate is automated.
  const sine = ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]));
  const cosine = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
  lfoL.setPeriodicWave(sine);
  lfoR.setPeriodicWave(cosine);
  const parts = [0, 1].map((ch) => {
    const d = ctx.createDelay(0.1);
    const depth = ctx.createGain();
    const fb = ctx.createGain();
    (ch === 0 ? lfoL : lfoR).connect(depth).connect(d.delayTime);
    split.connect(d, ch);
    d.connect(fb).connect(d);
    d.connect(merge, 0, ch);
    return { d, depth, fb };
  });
  merge.connect(output);
  const t = ctx.currentTime;
  lfoL.start(t);
  lfoR.start(t);
  return {
    set(delayMs: number, depthMs: number, rate: number, feedback: number) {
      for (const p of parts) {
        setSmooth(p.d.delayTime, delayMs / 1000, ctx, 0.03);
        setSmooth(p.depth.gain, depthMs / 1000, ctx, 0.03);
        setSmooth(p.fb.gain, clamp(feedback, -0.95, 0.95), ctx, 0.03);
      }
      setSmooth(lfoL.frequency, rate, ctx, 0.05);
      setSmooth(lfoR.frequency, rate, ctx, 0.05);
    },
    stop() {
      stopAll(ctx.currentTime, lfoL, lfoR);
    },
  };
}

function cf101(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const pair = modDelayPair(ctx, host.ins[0], wet);
  wet.connect(host.outs[0]);
  host.ins[0].connect(dry).connect(host.outs[0]);
  const sync = () => {
    const delay = host.p('delay', 6);
    pair.set(delay, Math.min(delay * 0.9, 12) * host.p('depth', 0.5), host.p('rate', 0.4), host.p('feedback', 0.2));
    const send = host.p('send', 0) >= 0.5;
    const mix = clamp(host.p('mix', 0.5), 0, 1);
    setSmooth(wet.gain, send ? 1 : mix, ctx, 0.02);
    setSmooth(dry.gain, send ? 0 : 1 - mix, ctx, 0.02);
  };
  sync();
  return {
    handles: { mix: true },
    onParam: (k) => k !== 'output' && sync(),
    dispose() {
      pair.stop();
    },
  };
}

function allpassChain(ctx: BaseAudioContext, stages: number) {
  const nodes: BiquadFilterNode[] = [];
  for (let i = 0; i < stages; i++) {
    const f = ctx.createBiquadFilter();
    f.type = 'allpass';
    f.Q.value = 0.6;
    if (i) nodes[i - 1].connect(f);
    nodes.push(f);
  }
  return nodes;
}

function phaser(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const stages = allpassChain(ctx, 4);
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  const depth = ctx.createGain();
  lfo.connect(depth);
  stages.forEach((s) => depth.connect(s.detune));
  lfo.start();
  // feedback needs a delay in the cycle (Web Audio); one render quantum is inaudible here
  const fbDelay = ctx.createDelay(0.01);
  fbDelay.delayTime.value = 128 / ctx.sampleRate;
  const fb = ctx.createGain();
  host.ins[0].connect(stages[0]);
  stages[3].connect(fbDelay).connect(fb).connect(stages[0]);
  stages[3].connect(host.outs[0]);
  const sync = () => {
    const f = host.p('freq', 800);
    const split = host.p('split', 0.4);
    stages.forEach((s, i) => setSmooth(s.frequency, clamp(f * Math.pow(1 + split * 1.5, i), 50, 18000), ctx, 0.03));
    setSmooth(lfo.frequency, host.p('rate', 0.3), ctx, 0.05);
    setSmooth(depth.gain, host.p('width', 0.5) * host.p('fmod', 0.5) * 2400, ctx, 0.03);
    setSmooth(fb.gain, host.p('feedback', 0.4) * 0.85, ctx, 0.03);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      stopAll(ctx.currentTime, lfo);
    },
  };
}

function quartet(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const inp = host.ins[0];
  const out = host.outs[0];
  const modeGains = [0, 1, 2, 3].map(() => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(out);
    return g;
  });
  const ensemble = buildChorus(ctx, inp, modeGains[0], { voices: 3, delayMs: 9, depthMs: 2.5, rate: 0.6, spread: 0.9 });
  const dimension = buildChorus(ctx, inp, modeGains[1], { voices: 2, delayMs: 4, depthMs: 0.8, rate: 0.25, spread: 1, feedback: 0.15 });
  const shimUp = buildPitchShifter(ctx, inp, modeGains[2], Math.pow(2, 0.12 / 12), 0.06);
  const shimDown = buildPitchShifter(ctx, inp, modeGains[2], Math.pow(2, -0.12 / 12), 0.07);
  const hi = ctx.createBiquadFilter();
  hi.type = 'highpass';
  hi.frequency.value = 1500;
  const lo = ctx.createBiquadFilter();
  lo.type = 'lowpass';
  lo.frequency.value = 1500;
  inp.connect(hi);
  inp.connect(lo).connect(modeGains[3]);
  const spectral = buildChorus(ctx, hi, modeGains[3], { voices: 4, delayMs: 12, depthMs: 4, rate: 0.9, spread: 1 });
  const sync = () => {
    const mode = Math.round(host.p('mode', 0));
    modeGains.forEach((g, i) => setSmooth(g.gain, i === mode ? 1 : 0, ctx, 0.04));
    const rate = host.p('rate', 0.6);
    const depth = host.p('depth', 0.5);
    const delay = host.p('delay', 9);
    ensemble.set(rate, depth * 5, delay);
    dimension.set(rate * 0.4, depth * 1.5, delay * 0.45);
    spectral.set(rate * 1.5, depth * 7, delay * 1.3);
    const cents = 4 + depth * 22;
    shimUp.set(Math.pow(2, cents / 1200));
    shimDown.set(Math.pow(2, -cents / 1200));
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      ensemble.stop();
      dimension.stop();
      spectral.stop();
      shimUp.stop();
      shimDown.stop();
    },
  };
}

function sweeper(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const inp = host.ins[0];
  const out = host.outs[0];
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.start();
  const lfoCents = ctx.createGain();
  lfo.connect(lfoCents);
  const fol = buildFollower(ctx, inp, 10);
  const envCents = ctx.createGain();
  fol.out.connect(envCents);
  const mods = (param: AudioParam) => {
    lfoCents.connect(param);
    envCents.connect(param);
  };
  // phaser
  const ph = allpassChain(ctx, 6);
  ph.forEach((s) => mods(s.detune));
  const phOut = ctx.createGain();
  inp.connect(ph[0]);
  ph[5].connect(phOut);
  inp.connect(phOut);
  // flanger
  const flOut = ctx.createGain();
  const fl = ctx.createDelay(0.05);
  const flLfo = ctx.createGain();
  lfo.connect(flLfo).connect(fl.delayTime);
  const flFb = ctx.createGain();
  inp.connect(fl).connect(flOut);
  fl.connect(flFb).connect(fl);
  inp.connect(flOut);
  // filter
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  mods(filt.detune);
  const fiOut = ctx.createGain();
  inp.connect(filt).connect(fiOut);
  const sel = [phOut, flOut, fiOut].map((n) => {
    const g = ctx.createGain();
    n.connect(g).connect(out);
    return g;
  });
  const sync = () => {
    const mode = Math.round(host.p('mode', 0));
    sel.forEach((g, i) => setSmooth(g.gain, i === mode ? (i === 2 ? 1 : 0.6) : 0, ctx, 0.04));
    const f = host.p('freq', 1200);
    const res = host.p('resonance', 0.4);
    ph.forEach((s, i) => {
      setSmooth(s.frequency, clamp(f * (1 + i * 0.35), 60, 16000), ctx, 0.03);
      s.Q.value = 0.4 + res * 3;
    });
    setSmooth(fl.delayTime, clamp(1 / f, 0.0005, 0.02), ctx, 0.03);
    setSmooth(flLfo.gain, host.p('depth', 0.6) * 0.003, ctx, 0.03);
    setSmooth(flFb.gain, res * 0.85, ctx, 0.03);
    setSmooth(filt.frequency, f, ctx, 0.03);
    setSmooth(filt.Q, 0.7 + res * 14, ctx, 0.03);
    setSmooth(lfo.frequency, host.p('rate', 0.5), ctx, 0.05);
    setSmooth(lfoCents.gain, host.p('depth', 0.6) * 2400, ctx, 0.03);
    setSmooth(envCents.gain, host.p('envAmount', 0) * 4800, ctx, 0.03);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      stopAll(ctx.currentTime, lfo);
    },
  };
}

function unison(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const voices: { g: GainNode; depth: GainNode; lfo: OscillatorNode }[] = [];
  for (let i = 0; i < 16; i++) {
    const d = ctx.createDelay(0.06);
    d.delayTime.value = 0.012 + (i % 8) * 0.0017;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13 + i * 0.071;
    const depth = ctx.createGain();
    lfo.connect(depth).connect(d.delayTime);
    const pan = ctx.createStereoPanner();
    pan.pan.value = ((i % 8) / 7) * 2 - 1;
    const g = ctx.createGain();
    host.ins[0].connect(d).connect(pan).connect(g).connect(host.outs[0]);
    lfo.start();
    voices.push({ g, depth, lfo });
  }
  const sync = () => {
    const n = [4, 8, 16][clamp(Math.round(host.p('voices', 1)), 0, 2)];
    const det = host.p('detune', 0.4);
    voices.forEach((v, i) => {
      setSmooth(v.g.gain, i < n ? 1 / Math.sqrt(n) : 0, ctx, 0.03);
      setSmooth(v.depth.gain, det * 0.004 * (0.5 + (i % 4) * 0.25), ctx, 0.03);
    });
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      stopAll(ctx.currentTime, ...voices.map((voice) => voice.lfo));
    },
  };
}
