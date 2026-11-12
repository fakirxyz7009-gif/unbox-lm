/**
 * Tape echo ('delay', model 'tape'): a repeat loop with wow (slow) and flutter (fast) wobbling the
 * delay time, a tone low-pass and saturation in the feedback path. Bucket Brigade mode drops the
 * tape wobble and limits the loop's bandwidth, so every repeat darkens. An original voicing, not a
 * model of any particular machine.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, disconnectAll, satCurve, setSmooth, stopAll } from '../dsp.ts';

const WOW_HZ = 0.6;
const FLUTTER_HZ = 6.5;
const WOW_SECONDS = 0.0016;
const FLUTTER_SECONDS = 0.00035;
const BUCKET_TONE_CEILING = 3200;
/** The loop's tone filter peaks a little above unity near its cutoff, so the feedback stays below 1 with margin. */
const MAX_FEEDBACK = 0.8;

/** Loop settings for a mode: delay-time swing (seconds) for wow and flutter, and the tone cut (Hz). */
export function tapeSettings(bucketBrigade: boolean, amount: number, tone: number) {
  const a = clamp(amount, 0, 1);
  const toneHz = clamp(tone, 1000, 12000);
  return {
    wowSeconds: bucketBrigade ? 0 : a * WOW_SECONDS,
    flutterSeconds: a * FLUTTER_SECONDS * (bucketBrigade ? 0.5 : 1),
    toneHz: bucketBrigade ? Math.min(toneHz, BUCKET_TONE_CEILING) : toneHz,
  };
}

export function tapeEcho(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const delay = ctx.createDelay(1.5);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.6;
  const sat = ctx.createWaveShaper();
  const fb = ctx.createGain();
  const wow = ctx.createOscillator();
  wow.frequency.value = WOW_HZ;
  const flutter = ctx.createOscillator();
  flutter.frequency.value = FLUTTER_HZ;
  const wowDepth = ctx.createGain();
  const flutterDepth = ctx.createGain();

  host.ins[0].connect(delay);
  delay.connect(tone).connect(sat).connect(fb).connect(delay);
  delay.connect(host.outs[0]);
  wow.connect(wowDepth).connect(delay.delayTime);
  flutter.connect(flutterDepth).connect(delay.delayTime);
  wow.start();
  flutter.start();

  const sync = () => {
    const s = tapeSettings(host.opt('mode') === 'Bucket Brigade', host.p('wowFlutter', 0.35), host.p('tone', 4500));
    setSmooth(delay.delayTime, clamp(host.p('time', 350) / 1000, 0.02, 1.4), ctx, 0.05);
    setSmooth(wowDepth.gain, s.wowSeconds, ctx, 0.05);
    setSmooth(flutterDepth.gain, s.flutterSeconds, ctx, 0.05);
    setSmooth(tone.frequency, s.toneHz, ctx, 0.02);
    setSmooth(fb.gain, clamp(host.p('feedback', 0.45), 0, MAX_FEEDBACK), ctx, 0.03);
    sat.curve = satCurve(host.p('saturation', 0.3));
  };
  sync();

  return {
    onParam: (k) => {
      if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      stopAll(ctx.currentTime, wow, flutter);
      disconnectAll(delay, tone, sat, fb, wowDepth, flutterDepth);
    },
  };
}
