/**
 * Time-based effects.
 *  - 'delay': ddl1 (steps synced to the tempo or ms, feedback, pan) and ripley (multi-tap space
 *    delay → diffuse reverb, modulation, bit crush, noise, ducking, tone).
 *  - 'reverb': rv7 (10 algorithms; impulse rebuilt at most every 400 ms when size / decay / damp
 *    move; Stereo Echoes = ping-pong taps, Pan Room = room + auto-pan).
 *  - 'timed': Synchronous — three tempo-synced curves modulate distortion, filter, delay /
 *    reverb sends and volume.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { bitCurve, buildFollower, clamp, impulseResponse, noiseSource, satCurve, setSmooth, stopAll } from '../dsp.ts';
import { StepClock } from './clock.ts';

const step16 = (host: SpecHost) => 60 / Math.max(20, host.clock.bpm()) / 4;

export function delayEngine(host: SpecHost): SpecEngine {
  return String(host.cfg.model) === 'ripley' ? ripley(host) : ddl1(host);
}

function ddl1(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const d = ctx.createDelay(4);
  const fb = ctx.createGain();
  const pan = ctx.createStereoPanner();
  host.ins[0].connect(d);
  d.connect(fb).connect(d);
  d.connect(pan).connect(host.outs[0]);
  let bpm = host.clock.bpm();
  const sync = () => {
    bpm = host.clock.bpm();
    const lenIn16 = [1, 4 / 3, 2][clamp(Math.round(host.p('stepLen', 0)), 0, 2)];
    const time = host.p('unit', 0) >= 0.5 ? host.p('ms', 375) / 1000 : host.p('steps', 3) * lenIn16 * step16(host);
    setSmooth(d.delayTime, clamp(time, 0.001, 3.9), ctx, 0.05);
    setSmooth(fb.gain, clamp(host.p('feedback', 0.4), 0, 0.95), ctx, 0.03);
    setSmooth(pan.pan, host.p('pan', 0), ctx, 0.03);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    onStepTick() {
      if (host.clock.bpm() !== bpm) sync();
    },
  };
}

function ripley(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const inp = host.ins[0];
  const tapIn = ctx.createGain();
  inp.connect(tapIn);
  const wet = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  const fb = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.start();
  const taps = [0, 1, 2, 3].map((i) => {
    const d = ctx.createDelay(4);
    const depth = ctx.createGain();
    lfo.connect(depth).connect(d.delayTime);
    const pan = ctx.createStereoPanner();
    const g = ctx.createGain();
    tapIn.connect(d).connect(pan).connect(g).connect(wet);
    return { d, depth, pan, g, i };
  });
  // feedback from the first tap through the tone filter
  taps[0].d.connect(tone).connect(fb).connect(tapIn);
  const crush = ctx.createWaveShaper();
  const noise = noiseSource(ctx, 'pink');
  const noiseG = ctx.createGain();
  noise.connect(noiseG).connect(wet);
  noise.start();
  const space = ctx.createConvolver();
  const spaceG = ctx.createGain();
  const duckVca = ctx.createGain();
  const fol = buildFollower(ctx, inp, 8);
  const duckAmt = ctx.createGain();
  fol.out.connect(duckAmt).connect(duckVca.gain);
  wet.connect(crush).connect(duckVca).connect(host.outs[0]);
  crush.connect(space).connect(spaceG).connect(duckVca);
  let irKey = '';
  let irTimer: number | null = null;
  let bpm = host.clock.bpm();

  const rebuildIr = () => {
    const decay = host.p('decay', 3);
    const key = decay.toFixed(1);
    if (key === irKey) return;
    irKey = key;
    space.buffer = impulseResponse(ctx, { seconds: clamp(decay, 0.3, 12), decay: 2.6, damping: 0.5, early: 0.3, seed: 5 });
  };
  rebuildIr();

  const sync = () => {
    bpm = host.clock.bpm();
    const steps = host.p('time', 3);
    const base = host.p('sync', 1) >= 0.5 ? steps * step16(host) : steps * 0.05;
    const n = Math.round(host.p('taps', 1)) + 1;
    const spread = host.p('spread', 0.5);
    taps.forEach((t) => {
      const on = t.i < n;
      const time = base * (1 + t.i * 0.5) * (1 + (t.i % 2 ? 1 : -1) * spread * 0.06);
      setSmooth(t.d.delayTime, clamp(time, 0.001, 3.9), ctx, 0.05);
      setSmooth(t.pan.pan, (t.i % 2 ? 1 : -1) * spread * (t.i ? 1 : 0.4), ctx, 0.03);
      setSmooth(t.g.gain, on ? 1 / Math.sqrt(n) : 0, ctx, 0.03);
      setSmooth(t.depth.gain, host.p('modDepth', 0.2) * 0.004, ctx, 0.03);
    });
    setSmooth(lfo.frequency, host.p('modRate', 0.6), ctx, 0.05);
    setSmooth(fb.gain, clamp(host.p('feedback', 0.45), 0, 0.93), ctx, 0.03);
    setSmooth(tone.frequency, host.p('tone', 6000), ctx, 0.03);
    const c = host.p('crush', 0);
    crush.curve = c > 0.02 ? bitCurve(16 - c * 12) : null;
    setSmooth(noiseG.gain, host.p('noise', 0) * 0.02, ctx, 0.03);
    setSmooth(spaceG.gain, host.p('space', 0.45) * 0.9, ctx, 0.03);
    setSmooth(duckAmt.gain, -host.p('duck', 0) * 2.5, ctx, 0.03);
    if (irTimer !== null) clearTimeout(irTimer);
    if (typeof window !== 'undefined') irTimer = window.setTimeout(rebuildIr, 400);
    else rebuildIr();
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    onStepTick() {
      if (host.clock.bpm() !== bpm) sync();
    },
    dispose() {
      if (irTimer !== null) clearTimeout(irTimer);
      stopAll(ctx.currentTime, lfo, noise);
    },
  };
}

const RV7: Record<string, { seconds: number; decay: number; damping: number; early: number; density?: number; gated?: boolean }> = {
  Hall: { seconds: 2.4, decay: 3, damping: 0.45, early: 0.4 },
  'Large Hall': { seconds: 4, decay: 2.6, damping: 0.5, early: 0.5 },
  'Hall 2': { seconds: 2.2, decay: 3.4, damping: 0.25, early: 0.3 },
  'Large Room': { seconds: 1.4, decay: 3.5, damping: 0.45, early: 0.7 },
  'Medium Room': { seconds: 0.9, decay: 3.8, damping: 0.5, early: 0.8 },
  'Small Room': { seconds: 0.5, decay: 4, damping: 0.55, early: 0.9 },
  Gated: { seconds: 0.55, decay: 1, damping: 0.3, early: 0.5, gated: true },
  'Low Density': { seconds: 2, decay: 3, damping: 0.3, early: 0.2, density: 0.12 },
  'Stereo Echoes': { seconds: 1.5, decay: 3, damping: 0.5, early: 0 },
  'Pan Room': { seconds: 1.1, decay: 3.6, damping: 0.5, early: 0.7 },
};

export function reverbEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const conv = ctx.createConvolver();
  const convG = ctx.createGain();
  const echoL = ctx.createDelay(2);
  const echoR = ctx.createDelay(2);
  const echoFb = ctx.createGain();
  const echoG = ctx.createGain();
  const merge = ctx.createChannelMerger(2);
  const split = ctx.createChannelSplitter(2);
  const pan = ctx.createStereoPanner();
  const panLfo = ctx.createOscillator();
  panLfo.frequency.value = 0.35;
  const panDepth = ctx.createGain();
  panLfo.connect(panDepth).connect(pan.pan);
  panLfo.start();
  host.ins[0].connect(conv).connect(convG).connect(pan).connect(host.outs[0]);
  // ping-pong echoes: L → R → L …
  host.ins[0].connect(split);
  split.connect(echoL, 0);
  split.connect(echoR, 1);
  echoL.connect(echoR);
  echoR.connect(echoFb).connect(echoL);
  echoL.connect(merge, 0, 0);
  echoR.connect(merge, 0, 1);
  merge.connect(echoG).connect(host.outs[0]);
  let key = '';
  let timer: number | null = null;

  const rebuild = () => {
    const alg = RV7[host.opt('algorithm')] ?? RV7.Hall;
    const size = 0.5 + host.p('size', 0.5);
    const seconds = clamp(alg.gated ? alg.seconds * size : host.p('decay', 2) * (alg.seconds / 2.4) * size, 0.2, 12);
    const opts = { seconds, decay: alg.decay, damping: clamp(alg.damping * 0.5 + host.p('damp', 0.4) * 0.6, 0, 0.95), early: alg.early, density: alg.density, gated: alg.gated, seed: 3 };
    const k = JSON.stringify(opts);
    if (k === key) return;
    key = k;
    conv.buffer = impulseResponse(ctx, opts);
  };

  const sync = () => {
    const name = host.opt('algorithm');
    const echoes = name === 'Stereo Echoes';
    setSmooth(convG.gain, echoes ? 0.25 : 1, ctx, 0.03);
    setSmooth(echoG.gain, echoes ? 0.8 : 0, ctx, 0.03);
    const t = 0.12 + host.p('size', 0.5) * 0.4;
    setSmooth(echoL.delayTime, t, ctx, 0.05);
    setSmooth(echoR.delayTime, t, ctx, 0.05);
    setSmooth(echoFb.gain, clamp(host.p('decay', 2) / 12, 0, 0.85), ctx, 0.03);
    setSmooth(panDepth.gain, name === 'Pan Room' ? 0.8 : 0, ctx, 0.05);
    if (timer !== null) clearTimeout(timer);
    // impulse responses are heavy: rebuild at most every 400 ms
    if (typeof window !== 'undefined') timer = window.setTimeout(rebuild, key ? 400 : 0);
    else rebuild();
  };
  rebuild();
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      if (timer !== null) clearTimeout(timer);
      stopAll(ctx.currentTime, panLfo);
    },
  };
}

// ---------------------------------------------------------------- Synchronous

const LENGTHS = [4, 8, 16, 32];

function curveValue(shape: string, x: number, cycle: number, step: number): number {
  switch (shape) {
    case 'Ramp Up':
      return x;
    case 'Ramp Down':
      return 1 - x;
    case 'Triangle':
      return x < 0.5 ? x * 2 : 2 - x * 2;
    case 'Square':
      return x < 0.5 ? 1 : 0;
    case 'Pump':
      return 1 - Math.exp(-x * 6);
    case 'Steps':
      return [0, 0.6, 0.3, 1, 0.15, 0.8, 0.45, 0.9][Math.floor(x * 8) % 8];
    default: {
      // Random: stable per cycle + step
      const s = Math.sin((cycle * 31 + step) * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    }
  }
}

export function timedEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pre = ctx.createGain();
  const dist = ctx.createWaveShaper();
  dist.curve = satCurve(0.5);
  const post = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 2;
  const vol = ctx.createGain();
  const delay = ctx.createDelay(2);
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.35;
  const delayG = ctx.createGain();
  const rev = ctx.createConvolver();
  rev.buffer = impulseResponse(ctx, { seconds: 2.2, decay: 3, damping: 0.45, early: 0.3, seed: 9 });
  const revG = ctx.createGain();
  host.ins[0].connect(pre).connect(dist).connect(post).connect(filt).connect(vol).connect(host.outs[0]);
  vol.connect(delay);
  delay.connect(delayFb).connect(delay);
  delay.connect(delayG).connect(host.outs[0]);
  vol.connect(rev).connect(revG).connect(host.outs[0]);
  const last = [0, 0, 0];

  const tick = (pos: number, time: number) => {
    const len = LENGTHS[clamp(Math.round(host.p('length', 2)), 0, 3)];
    const x = (pos % len) / len;
    const cycle = Math.floor(pos / len);
    const v = [1, 2, 3].map((n) => curveValue(host.opt(`shape${n}`), x, cycle + n, pos % len));
    const t = Math.max(time, ctx.currentTime);
    const ramp = (p: AudioParam, val: number) => p.linearRampToValueAtTime(val, t + 0.01);
    const d = clamp(host.p('distortion', 0.2) + v[0] * host.p('distMod', 0.5) * 0.8, 0, 1);
    ramp(pre.gain, 0.2 + d * 3);
    ramp(post.gain, 0.6 / (1 + d * 3));
    const cut = clamp(host.p('cutoff', 4000) * Math.pow(2, (v[1] - 0.5) * host.p('filterMod', 0.5) * 6), 60, 18000);
    ramp(filt.frequency, cut);
    ramp(vol.gain, 1 - host.p('volumeMod', 0.6) * (1 - v[2]));
    last[0] = v[0];
    last[1] = v[1];
    last[2] = v[2];
  };
  const clock = new StepClock(host, tick);
  // Unmodulated levels so the unit is calibrated before (and without) a clock tick.
  const rest = () => {
    const d = clamp(host.p('distortion', 0.2), 0, 1);
    setSmooth(pre.gain, 0.2 + d * 3, ctx, 0.02);
    setSmooth(post.gain, 0.6 / (1 + d * 3), ctx, 0.02);
    setSmooth(filt.frequency, clamp(host.p('cutoff', 4000), 60, 18000), ctx, 0.02);
    setSmooth(vol.gain, 1 - host.p('volumeMod', 0.6) * 0.5, ctx, 0.02);
  };
  rest();
  const sync = () => {
    if (!host.clock.isPlaying()) rest();
    setSmooth(delayG.gain, host.p('delayAmt', 0.2) * 0.6, ctx, 0.03);
    setSmooth(revG.gain, host.p('reverbAmt', 0.2) * 0.7, ctx, 0.03);
    setSmooth(delay.delayTime, step16(host) * 3, ctx, 0.05);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    onStepTick(pos, time) {
      clock.fromTransport(pos, time);
    },
    cv(id) {
      return id === 'lfo1_out' ? last[0] : id === 'lfo2_out' ? last[1] : 0;
    },
    meter() {
      return { c1: last[0], c2: last[1], c3: last[2] };
    },
    dispose() {
      clock.stop();
    },
  };
}
