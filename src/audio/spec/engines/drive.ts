/**
 * Drive pedal ('distortion', model 'drive'): a high-pass, an optional mid hump, a gain stage into
 * an oversampled shaper, then a tone low-pass. Four original voicings:
 *  - Overdrive: soft symmetric clip.
 *  - Mid Push: a 720 Hz hump in front of the soft clip, so the mids push through it.
 *  - Hard Clip: linear to a knee at half scale, then a firm tail (diode-style).
 *  - Fuzz: asymmetric and high gain, so it adds even harmonics.
 * These are voicings, not models of any particular pedal.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, disconnectAll, setSmooth } from '../dsp.ts';

const CURVE_POINTS = 1024;
/** Output trim per voicing: Fuzz and Hard Clip run hotter, Screamer sits lower. */
const MAKEUP = [1, 0.85, 0.9, 0.6];

/** Shaper curve for a voicing (0..3) at Drive 0..1. Bounded to ±1 and non-decreasing across the input. */
export function driveCurve(voicing: number, drive: number): Float32Array<ArrayBuffer> {
  const v = clamp(Math.round(voicing), 0, 3);
  const d = clamp(drive, 0, 1);
  const out = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    out[i] = shape(v, d, (2 * i) / (CURVE_POINTS - 1) - 1);
  }
  return out;
}

function shape(voicing: number, drive: number, x: number): number {
  if (voicing === 2) {
    const knee = 0.5;
    const a = Math.abs(x);
    if (a <= knee) return x;
    return Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  if (voicing === 3) {
    const k = 3 + 12 * drive;
    const a = 0.25;
    return Math.tanh(k * (x + a * x * x)) / Math.tanh(k * (1 + a));
  }
  const k = 1 + (voicing === 1 ? 8 : 6) * drive;
  return Math.tanh(k * x) / Math.tanh(k);
}

export function drivePedal(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 80;
  const hump = ctx.createBiquadFilter();
  hump.type = 'peaking';
  hump.frequency.value = 720;
  hump.Q.value = 0.8;
  const pre = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.6;
  const makeup = ctx.createGain();
  host.ins[0].connect(hp).connect(hump).connect(pre).connect(shaper).connect(tone).connect(makeup).connect(host.outs[0]);

  const sync = () => {
    const voicing = Math.round(clamp(host.p('voicing', 0), 0, 3));
    const drive = clamp(host.p('drive', 0.5), 0, 1);
    setSmooth(hump.gain, voicing === 1 ? 6 : 0, ctx, 0.02);
    setSmooth(pre.gain, (1 + 15 * drive) * (voicing === 3 ? 2 : 1), ctx, 0.02);
    shaper.curve = driveCurve(voicing, drive);
    setSmooth(tone.frequency, 1000 * Math.pow(12, clamp(host.p('tone', 0.5), 0, 1)), ctx, 0.02);
    setSmooth(makeup.gain, MAKEUP[voicing], ctx, 0.02);
  };
  sync();

  return {
    onParam: (k) => {
      if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      disconnectAll(hp, hump, pre, shaper, tone, makeup);
    },
  };
}
