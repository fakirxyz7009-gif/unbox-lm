/**
 * Filter effects ('filter').
 *  - ecf42: LP24 / LP12 / BP12 with an ADSR fired by the Gate CV (velocity = gate level) and,
 *    with Auto Trigger, an input envelope follower (auto-wah) — both shift the cutoff.
 *  - alligator: three pattern-gated filters (HP / BP / LP) on 16-step patterns at 1/8, 1/16
 *    or 1/32, then drive, phaser and delay; Dry adds the unprocessed signal.
 *  - ladder: four-pole ladder low-pass in an AudioWorklet, self-oscillating at full resonance (ladder.ts).
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, adsrStart, buildFollower, clamp, satCurve, setSmooth } from '../dsp.ts';
import { StepClock } from './clock.ts';
import { ladderFilter } from './ladder.ts';

export function filterEngine(host: SpecHost): SpecEngine {
  const model = String(host.cfg.model);
  if (model === 'alligator') return alligator(host);
  if (model === 'ladder') return ladderFilter(host);
  return ecf42(host);
}

function ecf42(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  host.ins[0].connect(f1).connect(f2).connect(host.outs[0]);
  // envelope (cents) → both stages
  const env = ctx.createConstantSource();
  env.offset.value = 0;
  env.start();
  env.connect(f1.detune);
  env.connect(f2.detune);
  const fol = buildFollower(ctx, host.ins[0], 18);
  const folAmt = ctx.createGain();
  fol.out.connect(folAmt);
  folAmt.connect(f1.detune);
  folAmt.connect(f2.detune);
  let gateOn = false;

  const sync = () => {
    const mode = host.opt('mode') || 'LP 24';
    f1.type = mode === 'BP 12' ? 'bandpass' : 'lowpass';
    f2.type = mode === 'LP 24' ? 'lowpass' : 'allpass';
    const fq = clamp(host.p('freq', 800), 30, 18000);
    setSmooth(f1.frequency, fq, ctx, 0.015);
    setSmooth(f2.frequency, mode === 'LP 24' ? fq : 20000, ctx, 0.015);
    const q = mode === 'BP 12' ? 1 + host.p('res', 0.4) * 14 : 0.5 + host.p('res', 0.4) * 16;
    setSmooth(f1.Q, mode === 'LP 24' ? 0.54 : q, ctx, 0.015);
    setSmooth(f2.Q, mode === 'LP 24' ? q : 0.7, ctx, 0.015);
    setSmooth(folAmt.gain, host.p('selfTrigger', 1) >= 0.5 ? host.p('envAmount', 0.5) * 5000 : 0, ctx, 0.03);
  };

  const gate = () => {
    const g = host.gateCv();
    const t = ctx.currentTime;
    const amt = host.p('envAmount', 0.5) * 4800 * (1 - host.p('velocity', 0.5) + host.p('velocity', 0.5) * clamp(g, 0, 1));
    const e = { a: host.p('a', 0.005), d: host.p('d', 0.25), s: host.p('s', 0.2), r: host.p('r', 0.2) };
    if (g > 0.5 && !gateOn) {
      gateOn = true;
      adsrStart(env.offset, t, 0, amt, amt * e.s, e);
    } else if (g <= 0.5 && gateOn) {
      gateOn = false;
      adsrRelease(env.offset, t, 0, e.r);
    }
  };
  sync();
  return {
    onParam(k) {
      if (k === '__gate') gate();
      else if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      try {
        env.stop();
      } catch {
        // stopped
      }
    },
  };
}

/** 16 gate patterns: rows HP / BP / LP, 16 steps each (x = open). */
const PATTERNS: [string, string, string][] = [
  ['x...x...x...x...', '..x...x...x...x.', 'x.x.x.x.x.x.x.x.'],
  ['x..x..x..x..x.x.', '.x...x...x...x..', 'xx.xx.xx.xx.xx.x'],
  ['....x.......x...', 'x.x...x.x.x...x.', 'xxxx..xxxx..xx..'],
  ['x.xxx.xxx.xxx.xx', '....x.......x...', 'x...x...x...x...'],
  ['.x.x.x.x.x.x.x.x', 'x...x...x...x...', 'xx..xx..xx..xx..'],
  ['x.....x.....x...', '..x.x...x.x...x.', 'x.xx.xx.x.xx.xx.'],
  ['xxx.xxx.xxx.xxx.', '...x...x...x...x', 'x..x..x.x..x..x.'],
  ['x.......x.......', '....x.......x...', 'xx.x.xx.xx.x.xx.'],
  ['..xx..xx..xx..xx', 'x.x.x.x.x.x.x.x.', 'x...............'],
  ['x..x..x...x..x..', '.xx..xx..xx..xx.', 'x.x.x.x.xx.x.x.x'],
  ['xxxxxxxx........', '........xxxxxxxx', 'x.x.x.x.x.x.x.x.'],
  ['x.x..x.x..x.x..x', '.x..x..x..x..x..', 'xxx.xxx.xxx.xxx.'],
  ['....xxxx....xxxx', 'xxxx....xxxx....', 'x..x.x..x..x.x..'],
  ['x.x.xx.x.x.xx.x.', '..x...x...x...xx', 'x...x..xx...x..x'],
  ['xx..x.xx..x.xx.x', 'x.xx.x.xx.x.xx.x', '.x.x.x.x.x.x.x.x'],
  ['x...............', 'x.......x.......', 'xxxxxxxxxxxxxxxx'],
];

function alligator(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const inp = host.ins[0];
  const sum = ctx.createGain();
  const bands = (['highpass', 'bandpass', 'lowpass'] as const).map((type) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 2.5 : 1.2;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const level = ctx.createGain();
    inp.connect(f).connect(gate).connect(level).connect(sum);
    return { f, gate, level };
  });
  const drive = ctx.createWaveShaper();
  const phaserStages = [0, 1, 2, 3].map(() => {
    const a = ctx.createBiquadFilter();
    a.type = 'allpass';
    a.Q.value = 0.6;
    return a;
  });
  const phLfo = ctx.createOscillator();
  phLfo.frequency.value = 0.4;
  const phDepth = ctx.createGain();
  phLfo.connect(phDepth);
  phaserStages.forEach((s, i) => {
    phDepth.connect(s.detune);
    if (i) phaserStages[i - 1].connect(s);
    s.frequency.value = 500 * (i + 1);
  });
  phLfo.start();
  const phWet = ctx.createGain();
  const phDry = ctx.createGain();
  const delay = ctx.createDelay(2);
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.4;
  const delayG = ctx.createGain();
  const dry = ctx.createGain();
  sum.connect(drive);
  drive.connect(phDry).connect(host.outs[0]);
  drive.connect(phaserStages[0]);
  phaserStages[3].connect(phWet).connect(host.outs[0]);
  drive.connect(delay);
  delay.connect(delayFb).connect(delay);
  delay.connect(delayG).connect(host.outs[0]);
  inp.connect(dry).connect(host.outs[0]);
  let lastStep = -1;
  let gateOut = 0;

  const tick = (pos: number, time: number) => {
    const rateDiv = [2, 1, 0.5][clamp(Math.round(host.p('rate', 1)), 0, 2)];
    const stepDur = (60 / Math.max(20, host.clock.bpm()) / 4) * rateDiv;
    const per16 = Math.round(1 / rateDiv);
    const pat = PATTERNS[clamp(Math.round(host.p('pattern', 0)), 0, 15)];
    const t = Math.max(time, ctx.currentTime);
    // one 16th may hold several 1/32 steps; 1/8 steps fire on every 2nd 16th
    const count = rateDiv >= 1 ? (pos % rateDiv === 0 ? 1 : 0) : per16;
    for (let k = 0; k < count; k++) {
      const stepIdx = rateDiv >= 1 ? Math.floor(pos / rateDiv) % 16 : (pos * per16 + k) % 16;
      const at = t + k * stepDur;
      const len = stepDur * clamp(host.p('gateLen', 0.6), 0.05, 1);
      bands.forEach((b, row) => {
        const open = pat[row][stepIdx] === 'x';
        if (!open) return;
        b.gate.gain.setValueAtTime(0, at);
        b.gate.gain.linearRampToValueAtTime(1, at + 0.003);
        b.gate.gain.setValueAtTime(1, at + len);
        b.gate.gain.linearRampToValueAtTime(0, at + len + 0.008);
      });
      lastStep = stepIdx;
      gateOut = pat[2][stepIdx] === 'x' ? 1 : 0;
    }
  };
  const clock = new StepClock(host, tick);

  const sync = () => {
    setSmooth(bands[0].f.frequency, host.p('hpFreq', 3000), ctx, 0.02);
    setSmooth(bands[1].f.frequency, host.p('bpFreq', 1200), ctx, 0.02);
    setSmooth(bands[2].f.frequency, host.p('lpFreq', 600), ctx, 0.02);
    setSmooth(bands[0].level.gain, host.p('hpLevel', 0.7), ctx, 0.02);
    setSmooth(bands[1].level.gain, host.p('bpLevel', 0.7) * 1.6, ctx, 0.02);
    setSmooth(bands[2].level.gain, host.p('lpLevel', 0.8), ctx, 0.02);
    const d = host.p('drive', 0.2);
    drive.curve = d > 0.02 ? satCurve(d * 0.7) : null;
    const ph = clamp(host.p('phaser', 0), 0, 1);
    setSmooth(phWet.gain, ph * 0.7, ctx, 0.03);
    setSmooth(phDry.gain, 1 - ph * 0.3, ctx, 0.03);
    setSmooth(phDepth.gain, 1800, ctx, 0.03);
    setSmooth(delayG.gain, host.p('delay', 0.15) * 0.6, ctx, 0.03);
    setSmooth(delay.delayTime, (60 / Math.max(20, host.clock.bpm()) / 4) * 3, ctx, 0.05);
    setSmooth(dry.gain, host.p('dry', 0), ctx, 0.03);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    onStepTick(pos, time) {
      clock.fromTransport(pos, time);
    },
    cv(id) {
      return id === 'gate_cv' ? gateOut : 0;
    },
    meter() {
      return { step: lastStep };
    },
    dispose() {
      clock.stop();
    },
  };
}
