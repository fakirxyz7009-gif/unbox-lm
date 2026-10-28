/**
 * Synthesized drum voices (analog-style models). Each call builds the nodes for ONE hit at time
 * t into `dest` and returns a choke handle. Used live by the 'drums' engine and offline to
 * render sample kits for the 'groove' engine.
 *
 * Common controls: tune (semitones), decay (0..1), tone (0..1), level (0..1), drive (0..1).
 */
import { clamp, noiseSource, satCurve } from '../dsp.ts';

export interface DrumParams {
  tune: number;
  decay: number;
  tone: number;
  level: number;
  drive?: number;
}

export interface DrumHit {
  /** Quick fade (choke groups). */
  choke(t: number): void;
  end: number;
}

type Ctx = BaseAudioContext;
const st = (s: number) => Math.pow(2, s / 12);

// 808 cymbal / hat oscillator frequencies (six square waves)
const METAL_808 = [205.3, 304.4, 369.6, 522.7, 540, 800];
const METAL_909 = [263, 400, 421, 474, 587, 845];

function vca(ctx: Ctx, dest: AudioNode, t: number, peak: number, decay: number, attack = 0.001): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, Math.max(0.003, decay / 4.6));
  g.connect(dest);
  return g;
}

function osc(ctx: Ctx, type: OscillatorType, hz: number, t: number, end: number, dest: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, t);
  o.connect(dest);
  o.start(t);
  o.stop(end);
  return o;
}

function noise(ctx: Ctx, t: number, end: number, dest: AudioNode): AudioBufferSourceNode {
  const n = noiseSource(ctx);
  n.connect(dest);
  n.start(t, Math.random() * 1.5);
  n.stop(end);
  return n;
}

function filt(ctx: Ctx, type: BiquadFilterType, hz: number, q: number, dest: AudioNode): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = clamp(hz, 20, ctx.sampleRate / 2.1);
  f.Q.value = q;
  f.connect(dest);
  return f;
}

function output(ctx: Ctx, dest: AudioNode, p: DrumParams): GainNode {
  const g = ctx.createGain();
  g.gain.value = clamp(p.level, 0, 1.5);
  if ((p.drive ?? 0) > 0.02) {
    const ws = ctx.createWaveShaper();
    ws.curve = satCurve(p.drive ?? 0);
    g.connect(ws).connect(dest);
  } else g.connect(dest);
  return g;
}

function handle(out: GainNode, end: number): DrumHit {
  return {
    end,
    choke(t: number) {
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.006);
    },
  };
}

function kick(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams, style: '808' | '909' | 'analog' | '606' | 'cr78'): DrumHit {
  const out = output(ctx, dest, p);
  const base = { '808': 49, '909': 55, analog: 52, '606': 66, cr78: 70 }[style] * st(p.tune);
  const dec = { '808': 0.25 + p.decay * 2.2, '909': 0.12 + p.decay * 0.7, analog: 0.15 + p.decay * 1.1, '606': 0.08 + p.decay * 0.3, cr78: 0.08 + p.decay * 0.25 }[style];
  const end = t + dec + 0.1;
  const body = vca(ctx, out, t, 0.95 * vel, dec);
  const o = osc(ctx, 'sine', base * (style === '808' ? 2.2 : 3.5), t, end, body);
  o.frequency.setTargetAtTime(base, t + 0.001, style === '808' ? 0.02 : 0.012);
  o.frequency.setTargetAtTime(base * 0.92, t + 0.05, dec);
  // click / attack transient (tone)
  const clickAmt = (style === '909' ? 0.5 : style === 'analog' ? 0.35 : 0.15) * (0.3 + p.tone * 1.4);
  const cg = vca(ctx, out, t, clickAmt * vel, 0.012);
  noise(ctx, t, t + 0.03, filt(ctx, 'lowpass', 2500 + p.tone * 5000, 0.7, cg));
  if (style === '909' || style === 'analog') {
    const ws = ctx.createWaveShaper();
    ws.curve = satCurve(style === '909' ? 0.25 : 0.35);
    const sg = vca(ctx, out, t, 0.2 * vel, dec * 0.4);
    const o2 = osc(ctx, 'triangle', base * 4, t, end, ws);
    o2.frequency.setTargetAtTime(base, t + 0.001, 0.008);
    ws.connect(sg);
  }
  return handle(out, end);
}

function snare(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams, style: '808' | '909' | 'analog' | '606'): DrumHit {
  const out = output(ctx, dest, p);
  const f = (style === '808' ? 180 : style === '606' ? 240 : 195) * st(p.tune);
  const toneDec = 0.08 + p.decay * 0.15;
  const noiseDec = (style === '909' ? 0.18 : 0.12) + p.decay * 0.35;
  const end = t + Math.max(toneDec, noiseDec) + 0.1;
  const tg = vca(ctx, out, t, (0.7 - p.tone * 0.4) * vel, toneDec);
  const o1 = osc(ctx, 'triangle', f * 1.6, t, end, tg);
  o1.frequency.setTargetAtTime(f, t, 0.01);
  osc(ctx, 'sine', f * (style === '808' ? 1.85 : 1.5), t, end, tg);
  const ng = vca(ctx, out, t, (0.35 + p.tone * 0.55) * vel, noiseDec);
  const hp = filt(ctx, 'highpass', style === '808' ? 1800 : 1200, 0.7, ng);
  noise(ctx, t, end, filt(ctx, 'lowpass', 7000 + p.tone * 7000, 0.5, hp));
  return handle(out, end);
}

function clap(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams): DrumHit {
  const out = output(ctx, dest, p);
  const bp = filt(ctx, 'bandpass', 1100 * st(p.tune) * (0.7 + p.tone * 0.8), 1.4, out);
  const g = ctx.createGain();
  g.connect(bp);
  g.gain.setValueAtTime(0, t);
  // three fast bursts then the tail
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.011;
    g.gain.setValueAtTime(0.9 * vel, at);
    g.gain.setTargetAtTime(0.05, at + 0.001, 0.004);
  }
  const tail = 0.12 + p.decay * 0.5;
  g.gain.setValueAtTime(0.7 * vel, t + 0.034);
  g.gain.setTargetAtTime(0, t + 0.035, tail / 4.6);
  const end = t + 0.04 + tail + 0.05;
  noise(ctx, t, end, g);
  return handle(out, end);
}

function metal(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams, freqs: number[], dec: number, hp: number, bpHz: number, peak = 0.35): DrumHit {
  const out = output(ctx, dest, p);
  const end = t + dec + 0.08;
  const g = vca(ctx, out, t, peak * vel, dec);
  const h = filt(ctx, 'highpass', hp * (0.8 + p.tone * 0.5), 0.7, g);
  const b = filt(ctx, 'bandpass', bpHz * st(p.tune * 0.5), 0.9, h);
  for (const f of freqs) osc(ctx, 'square', f * st(p.tune * 0.5), t, end, b);
  return handle(out, end);
}

function tom(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams, hz: number, conga = false): DrumHit {
  const out = output(ctx, dest, p);
  const f = hz * st(p.tune);
  const dec = conga ? 0.12 + p.decay * 0.25 : 0.2 + p.decay * 0.8;
  const end = t + dec + 0.08;
  const g = vca(ctx, out, t, 0.8 * vel, dec);
  const o = osc(ctx, 'sine', f * (conga ? 1.08 : 1.6), t, end, g);
  o.frequency.setTargetAtTime(f, t, conga ? 0.006 : 0.03);
  if (!conga) {
    const ng = vca(ctx, out, t, 0.08 * vel * (0.5 + p.tone), 0.04);
    noise(ctx, t, t + 0.06, filt(ctx, 'bandpass', f * 4, 0.8, ng));
  }
  return handle(out, end);
}

function fmPerc(ctx: Ctx, dest: AudioNode, t: number, vel: number, p: DrumParams): DrumHit {
  const out = output(ctx, dest, p);
  const f = 180 * st(p.tune);
  const dec = 0.1 + p.decay * 0.6;
  const end = t + dec + 0.05;
  const g = vca(ctx, out, t, 0.7 * vel, dec);
  const car = osc(ctx, 'sine', f, t, end, g);
  const mod = ctx.createOscillator();
  mod.frequency.value = f * 1.41;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * (2 + p.tone * 8), t);
  idx.gain.setTargetAtTime(0, t, dec / 5);
  mod.connect(idx).connect(car.frequency);
  mod.start(t);
  mod.stop(end);
  return handle(out, end);
}

/** Plays one drum voice model. Unknown models fall back to a tom. */
export function playDrum(ctx: Ctx, model: string, dest: AudioNode, t: number, vel: number, p: DrumParams): DrumHit {
  const v = clamp(vel, 0.05, 1.3);
  switch (model) {
    case 'kick808':
      return kick(ctx, dest, t, v, p, '808');
    case 'kick909':
    case 'kick':
      return kick(ctx, dest, t, v, p, '909');
    case 'kickAnalog':
      return kick(ctx, dest, t, v, p, 'analog');
    case 'kick606':
      return kick(ctx, dest, t, v, p, '606');
    case 'kickCr78':
      return kick(ctx, dest, t, v, p, 'cr78');
    case 'snare808':
      return snare(ctx, dest, t, v, p, '808');
    case 'snare909':
    case 'snare':
      return snare(ctx, dest, t, v, p, '909');
    case 'snareAnalog':
      return snare(ctx, dest, t, v, p, 'analog');
    case 'snare606':
      return snare(ctx, dest, t, v, p, '606');
    case 'clap':
      return clap(ctx, dest, t, v, p);
    case 'rim': {
      const out = output(ctx, dest, p);
      const g = vca(ctx, out, t, 0.6 * v, 0.02 + p.decay * 0.03);
      const b = filt(ctx, 'bandpass', 1700 * st(p.tune), 3, g);
      osc(ctx, 'square', 1700 * st(p.tune), t, t + 0.1, b);
      osc(ctx, 'triangle', 820 * st(p.tune), t, t + 0.1, b);
      return handle(out, t + 0.12);
    }
    case 'hatC':
      return metal(ctx, dest, t, v, p, METAL_808, 0.03 + p.decay * 0.1, 7000, 10000);
    case 'hatO':
      return metal(ctx, dest, t, v, p, METAL_808, 0.2 + p.decay * 0.9, 7000, 10000);
    case 'hat909C':
      return metal(ctx, dest, t, v, p, METAL_909, 0.035 + p.decay * 0.08, 8000, 11000);
    case 'hat909O':
      return metal(ctx, dest, t, v, p, METAL_909, 0.25 + p.decay * 0.7, 8000, 11000);
    case 'cymbal':
      return metal(ctx, dest, t, v, p, METAL_808, 0.6 + p.decay * 2.2, 4500, 7500, 0.3);
    case 'ride': {
      const h = metal(ctx, dest, t, v, p, METAL_909, 0.8 + p.decay * 2, 6000, 9000, 0.22);
      const out = output(ctx, dest, p);
      osc(ctx, 'sine', 2950 * st(p.tune), t, t + 0.9, vca(ctx, out, t, 0.08 * v, 0.6));
      return h;
    }
    case 'metal':
      return metal(ctx, dest, t, v, p, [311, 499, 677, 873, 1120, 1418], 0.08 + p.decay * 0.8, 3000, 5000, 0.4);
    case 'tomLo':
      return tom(ctx, dest, t, v, p, 85);
    case 'tomMid':
      return tom(ctx, dest, t, v, p, 125);
    case 'tomHi':
      return tom(ctx, dest, t, v, p, 175);
    case 'congaLo':
      return tom(ctx, dest, t, v, p, 175, true);
    case 'congaMid':
      return tom(ctx, dest, t, v, p, 255, true);
    case 'congaHi':
      return tom(ctx, dest, t, v, p, 370, true);
    case 'cowbell': {
      const out = output(ctx, dest, p);
      const dec = 0.12 + p.decay * 0.4;
      const g = vca(ctx, out, t, 0.35 * v, dec);
      const b = filt(ctx, 'bandpass', 2600, 1.2, g);
      osc(ctx, 'square', 540 * st(p.tune), t, t + dec + 0.1, b);
      osc(ctx, 'square', 800 * st(p.tune), t, t + dec + 0.1, b);
      return handle(out, t + dec + 0.1);
    }
    case 'agogo': {
      const out = output(ctx, dest, p);
      const dec = 0.2 + p.decay * 0.5;
      const g = vca(ctx, out, t, 0.35 * v, dec);
      osc(ctx, 'sine', 850 * st(p.tune), t, t + dec + 0.1, g);
      osc(ctx, 'sine', 1280 * st(p.tune), t, t + dec + 0.1, g);
      return handle(out, t + dec + 0.1);
    }
    case 'clave': {
      const out = output(ctx, dest, p);
      const g = vca(ctx, out, t, 0.6 * v, 0.03 + p.decay * 0.05);
      osc(ctx, 'sine', 2500 * st(p.tune), t, t + 0.15, g);
      return handle(out, t + 0.15);
    }
    case 'maracas': {
      const out = output(ctx, dest, p);
      const dec = 0.03 + p.decay * 0.08;
      const g = vca(ctx, out, t, 0.4 * v, dec, 0.004);
      noise(ctx, t, t + dec + 0.05, filt(ctx, 'highpass', 6000 + p.tone * 4000, 0.7, g));
      return handle(out, t + dec + 0.05);
    }
    case 'fmPerc':
      return fmPerc(ctx, dest, t, v, p);
    case 'bass808': {
      const out = output(ctx, dest, { ...p, drive: Math.max(p.drive ?? 0, 0.2) });
      const f = 43.65 * st(p.tune);
      const dec = 0.5 + p.decay * 2.5;
      const g = vca(ctx, out, t, 0.9 * v, dec);
      const o = osc(ctx, 'sine', f * 1.6, t, t + dec + 0.1, g);
      o.frequency.setTargetAtTime(f, t, 0.03);
      return handle(out, t + dec + 0.1);
    }
    case 'synthHit': {
      const out = output(ctx, dest, p);
      const f = 130.8 * st(p.tune);
      const dec = 0.15 + p.decay * 0.6;
      const g = vca(ctx, out, t, 0.4 * v, dec);
      const lp = filt(ctx, 'lowpass', 500 + p.tone * 6000, 4, g);
      lp.frequency.setTargetAtTime(300, t, dec / 3);
      osc(ctx, 'sawtooth', f, t, t + dec + 0.1, lp);
      osc(ctx, 'sawtooth', f * 1.5, t, t + dec + 0.1, lp);
      return handle(out, t + dec + 0.1);
    }
    case 'zap': {
      const out = output(ctx, dest, p);
      const dec = 0.08 + p.decay * 0.3;
      const g = vca(ctx, out, t, 0.6 * v, dec);
      const o = osc(ctx, 'sine', 2400 * st(p.tune), t, t + dec + 0.05, g);
      o.frequency.setTargetAtTime(60, t, dec / 5);
      return handle(out, t + dec + 0.05);
    }
    case 'noiseSweep': {
      const out = output(ctx, dest, p);
      const dec = 0.4 + p.decay * 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4 * v, t + dec * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dec);
      g.connect(out);
      const bp = filt(ctx, 'bandpass', 400, 2, g);
      bp.frequency.exponentialRampToValueAtTime(9000, t + dec);
      noise(ctx, t, t + dec + 0.05, bp);
      return handle(out, t + dec + 0.05);
    }
    default:
      return tom(ctx, dest, t, v, p, 140);
  }
}

/** Kit-dependent voice choice for generic names ('kick', 'snare', 'hatC' …). */
export function kitVoice(generic: string, kit: string): string {
  const k = kit.toLowerCase();
  const is = (s: string) => k.includes(s);
  if (generic === 'kick') return is('808') || is('trap') || is('drill') || is('electro') ? 'kick808' : is('606') ? 'kick606' : is('cr-78') ? 'kickCr78' : is('techno') || is('industrial') ? 'kickAnalog' : 'kick909';
  if (generic === 'snare') return is('808') || is('trap') || is('drill') || is('electro') ? 'snare808' : is('606') ? 'snare606' : is('techno') || is('industrial') ? 'snareAnalog' : 'snare909';
  if (generic === 'hatC') return is('909') || is('house') || is('707') || is('club') ? 'hat909C' : 'hatC';
  if (generic === 'hatO') return is('909') || is('house') || is('707') || is('club') ? 'hat909O' : 'hatO';
  return generic;
}
