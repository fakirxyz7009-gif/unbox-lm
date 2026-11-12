/**
 * Rotating speaker and tremolo ('modulation', models 'rotary' and 'tremolo'). Original models:
 *  - rotary: a horn rotor (above the 800 Hz crossover) and a drum rotor (below it). Each rotor
 *    sweeps its level and its pitch (a Doppler delay) on its own LFO. Two microphones sit 90° apart,
 *    so each side hears the sweep a quarter turn apart. Speed: Stop / Slow / Fast; Accel is the time
 *    constant of a speed change. Stop is a neutral rest: the sweeps switch off at once, and the two
 *    microphones hear the same level.
 *  - tremolo: level tremolo with separate left and right LFOs. Stereo sets their phase: Mono (the
 *    same), Quad (90°) or Opposite (180°).
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, disconnectAll, setSmooth, stopAll } from '../dsp.ts';

/** Rotor speeds in Hz for the Slow and Fast settings. */
const ROTOR_HZ: { horn: number[]; drum: number[] } = { horn: [0.8, 6.8], drum: [0.66, 5.6] };
const CROSSOVER_HZ = 800;
const HORN_DELAY = 0.0032;
const HORN_SWEEP = 0.0019;
const DRUM_DELAY = 0.002;
const DRUM_SWEEP = 0.0003;

/**
 * One rotor path at a speed (0 Stop, 1 Slow, 2 Fast) and a depth. At Stop the level and pitch sweeps
 * are off, so both microphones match. The LFO rate eases to zero with the change of speed.
 */
export function rotorSettings(speed: number, depth: number, horn: boolean) {
  const d = clamp(depth, 0, 1);
  const moving = speed > 0;
  return {
    lfoHz: moving ? ROTOR_HZ[horn ? 'horn' : 'drum'][speed - 1] : 0,
    ampBase: 1 - 0.5 * d,
    ampDepth: moving ? 0.5 * d : 0,
    dopplerBase: horn ? HORN_DELAY : DRUM_DELAY,
    sweep: moving ? d * (horn ? HORN_SWEEP : DRUM_SWEEP) : 0,
  };
}

/** LFO shapes: sine, cosine (90°) and inverted sine (180°). */
function lfoWaves(ctx: BaseAudioContext) {
  return {
    sine: ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1])),
    cosine: ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0])),
    inverted: ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, -1])),
  };
}

interface RotorPath {
  horn: boolean;
  lfo: OscillatorNode;
  amp: GainNode;
  ampDepth: GainNode;
  dopp: DelayNode;
  sweep: GainNode;
}

/** One rotor heard at one microphone: crossover, level sweep and Doppler sweep, into that channel. */
function rotorPath(
  ctx: BaseAudioContext,
  split: ChannelSplitterNode,
  merge: ChannelMergerNode,
  mic: number,
  horn: boolean,
  wave: PeriodicWave,
): RotorPath {
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  f1.type = horn ? 'highpass' : 'lowpass';
  f2.type = f1.type;
  f1.frequency.value = CROSSOVER_HZ;
  f2.frequency.value = CROSSOVER_HZ;
  f1.Q.value = 0.7;
  f2.Q.value = 0.7;
  const amp = ctx.createGain();
  const dopp = ctx.createDelay(0.02);
  const lfo = ctx.createOscillator();
  // The oscillator defaults to 440 Hz. Start at rest, and let the first sync spin the rotor up.
  lfo.frequency.value = 0;
  lfo.setPeriodicWave(wave);
  const ampDepth = ctx.createGain();
  const sweep = ctx.createGain();
  split.connect(f1, mic);
  f1.connect(f2).connect(amp).connect(dopp).connect(merge, 0, mic);
  lfo.connect(ampDepth).connect(amp.gain);
  lfo.connect(sweep).connect(dopp.delayTime);
  lfo.start();
  return { horn, lfo, amp, ampDepth, dopp, sweep };
}

export function rotaryCabinet(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  host.ins[0].connect(split);
  merge.connect(host.outs[0]);
  const waves = lfoWaves(ctx);
  const paths: RotorPath[] = [];
  for (const mic of [0, 1]) {
    const wave = mic === 0 ? waves.sine : waves.cosine;
    paths.push(rotorPath(ctx, split, merge, mic, true, wave), rotorPath(ctx, split, merge, mic, false, wave));
  }

  const sync = () => {
    const speed = Math.round(clamp(host.p('speed', 1), 0, 2)); // 0 Stop, 1 Slow, 2 Fast
    const depth = clamp(host.p('depth', 0.6), 0, 1);
    const accel = clamp(host.p('accel', 1.2), 0.05, 4);
    for (const p of paths) {
      const s = rotorSettings(speed, depth, p.horn);
      setSmooth(p.lfo.frequency, s.lfoHz, ctx, p.horn ? accel * 0.5 : accel);
      setSmooth(p.amp.gain, s.ampBase, ctx, 0.05);
      setSmooth(p.ampDepth.gain, s.ampDepth, ctx, 0.05);
      setSmooth(p.dopp.delayTime, s.dopplerBase, ctx, 0.05);
      setSmooth(p.sweep.gain, s.sweep, ctx, 0.05);
    }
  };
  sync();

  return {
    onParam: (k) => {
      if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      stopAll(ctx.currentTime, ...paths.map((p) => p.lfo));
      disconnectAll(split, merge);
    },
  };
}

export function stereoTremolo(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  host.ins[0].connect(split);
  merge.connect(host.outs[0]);
  const waves = lfoWaves(ctx);
  const lfoLeft = ctx.createOscillator();
  const lfoRight = ctx.createOscillator();
  lfoLeft.setPeriodicWave(waves.sine);
  // Start at the set rate. The oscillator default of 440 Hz would buzz until the first sync.
  const rate = clamp(host.p('rate', 4.5), 0.1, 20);
  lfoLeft.frequency.value = rate;
  lfoRight.frequency.value = rate;
  const lfos = [lfoLeft, lfoRight];
  const gains = [ctx.createGain(), ctx.createGain()];
  const depths = [ctx.createGain(), ctx.createGain()];
  lfos.forEach((lfo, c) => {
    lfo.connect(depths[c]).connect(gains[c].gain);
    split.connect(gains[c], c).connect(merge, 0, c);
    lfo.start();
  });

  const sync = () => {
    const phase = Math.round(clamp(host.p('phase', 1), 0, 2)); // 0 Mono, 1 Quad, 2 Opposite
    lfoRight.setPeriodicWave(phase === 0 ? waves.sine : phase === 1 ? waves.cosine : waves.inverted);
    const rateNow = clamp(host.p('rate', 4.5), 0.1, 20);
    const depth = clamp(host.p('depth', 0.6), 0, 1);
    lfos.forEach((lfo) => setSmooth(lfo.frequency, rateNow, ctx, 0.03));
    gains.forEach((g) => setSmooth(g.gain, 1 - 0.5 * depth, ctx, 0.02));
    depths.forEach((d) => setSmooth(d.gain, 0.5 * depth, ctx, 0.02));
  };
  sync();

  return {
    onParam: (k) => {
      if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      stopAll(ctx.currentTime, ...lfos);
      disconnectAll(split, merge, ...gains, ...depths);
    },
  };
}
