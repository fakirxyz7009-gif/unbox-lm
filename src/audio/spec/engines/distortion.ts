/**
 * Distortion engine ('distortion') — models:
 *  - d11: foldback distortion (amount + fold).
 *  - pulveriser: squash compressor → dirt → resonant filter (5 types) with tremor LFO
 *    (→ volume / freq) and envelope follower (→ freq); Blend dry / wet.
 *  - audiomatic: retro transformer presets (tape, vinyl, VHS, psyche, radio, lo-fi, hi-fi,
 *    old phone, cassette, spread, dust, broken) built from one fixed chain.
 *  - amp / bassAmp: preamp channel, tone stack, presence / mid sweep, cabinet impulse, volume.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import {
  bitCurve,
  buildFollower,
  buildWidth,
  cabinetImpulse,
  clamp,
  dbToGain,
  foldbackCurve,
  noiseSource,
  satCurve,
  setSmooth,
  stopAll
} from '../dsp.ts';

export function distortionEngine(host: SpecHost): SpecEngine {
  const model = String(host.cfg.model ?? 'd11');
  if (model === 'pulveriser') return pulveriser(host);
  if (model === 'audiomatic') return audiomatic(host);
  if (model === 'amp' || model === 'bassAmp') return amp(host, model === 'bassAmp');
  return d11(host);
}

function d11(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const ws = ctx.createWaveShaper();
  ws.oversample = '4x';
  const trim = ctx.createGain();
  host.ins[0].connect(ws).connect(trim).connect(host.outs[0]);
  const sync = () => {
    ws.curve = foldbackCurve(host.p('amount', 0.4), host.p('foldback', 0.5));
    trim.gain.value = 0.8;
  };
  sync();
  return { onParam: (k) => k !== 'mix' && k !== 'output' && sync() };
}

function pulveriser(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const S = (p: AudioParam, v: number, tau = 0.02) => setSmooth(p, v, ctx, tau);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 6;
  comp.attack.value = 0.003;
  const squashMakeup = ctx.createGain();
  const dirt = ctx.createWaveShaper();
  dirt.oversample = '2x';
  const dirtTrim = ctx.createGain();
  const dirtTone = ctx.createBiquadFilter();
  dirtTone.type = 'highshelf';
  dirtTone.frequency.value = 2500;
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  const trem = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  const lfoVol = ctx.createGain();
  const lfoFreq = ctx.createGain();
  lfo.connect(lfoVol).connect(trem.gain);
  lfo.connect(lfoFreq);
  lfoFreq.connect(f1.detune);
  lfoFreq.connect(f2.detune);
  lfo.start();
  const follower = buildFollower(ctx, host.ins[0], 14);
  const folFreq = ctx.createGain();
  follower.out.connect(folFreq);
  folFreq.connect(f1.detune);
  folFreq.connect(f2.detune);
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  host.ins[0].connect(comp).connect(squashMakeup).connect(dirt).connect(dirtTrim).connect(dirtTone).connect(f1).connect(f2).connect(trem).connect(wet).connect(host.outs[0]);
  host.ins[0].connect(dry).connect(host.outs[0]);
  let tremPhaseStart = ctx.currentTime;

  const sync = () => {
    const sq = clamp(host.p('squash', 0.3), 0, 1);
    S(comp.threshold, -sq * 40);
    S(comp.ratio, 1 + sq * 19);
    S(comp.release, host.p('squashRelease', 0.12));
    S(squashMakeup.gain, dbToGain(sq * 14));
    const d = clamp(host.p('dirt', 0.35), 0, 1);
    dirt.curve = d > 0.01 ? satCurve(d, 0.1) : null;
    // the saturator adds a lot of gain at low levels: compensate so Dirt changes tone, not volume
    S(dirtTrim.gain, 1 / (1 + d * 3) / dbToGain(sq * 7));
    S(dirtTone.gain, (host.p('dirtTone', 0.5) - 0.5) * 18);
    const type = host.opt('filterType') || 'LP 24';
    const t = type.includes('HP') ? 'highpass' : type.includes('BP') ? 'bandpass' : type.includes('Peak') ? 'peaking' : 'lowpass';
    f1.type = t;
    f2.type = type === 'LP 24' ? 'lowpass' : 'allpass';
    if (type !== 'LP 24') f2.frequency.value = 20000;
    const fq = clamp(host.p('cutoff', 4000), 40, 20000);
    S(f1.frequency, fq);
    if (type === 'LP 24') S(f2.frequency, fq);
    const q = 0.5 + host.p('resonance', 0.25) * 16;
    S(f1.Q, t === 'peaking' ? 2 : q);
    f1.gain.value = t === 'peaking' ? 6 + host.p('resonance', 0.25) * 12 : 0;
    S(lfo.frequency, host.p('tremorRate', 4));
    const tv = clamp(host.p('tremorToVol', 0), 0, 1);
    S(trem.gain, 1 - tv / 2);
    S(lfoVol.gain, tv / 2);
    S(lfoFreq.gain, host.p('tremorToFreq', 0) * 2400);
    S(folFreq.gain, host.p('followerToFreq', 0) * 6000);
    const b = clamp(host.p('blend', 1), 0, 1);
    S(wet.gain, b);
    S(dry.gain, 1 - b);
  };
  sync();
  return {
    onParam(k) {
      if (k === 'tremorRate') tremPhaseStart = ctx.currentTime;
      if (k !== 'output') sync();
    },
    cv(id) {
      if (id === 'lfo1_out') return Math.sin(2 * Math.PI * host.p('tremorRate', 4) * (ctx.currentTime - tremPhaseStart));
      return 0;
    },
    meter() {
      return { gr: comp.reduction };
    },
    dispose() {
      stopAll(ctx.currentTime, lfo);
    },
  };
}

interface AmState {
  sat: number;
  bits: number;
  lp: number;
  hp: number;
  wow: number;
  flutter: number;
  hiss: number;
  crackle: number;
  width: number;
  drop: number;
}

const AUDIOMATIC: Record<string, AmState> = {
  Tape: { sat: 0.35, bits: 0, lp: 12000, hp: 30, wow: 0.25, flutter: 0.2, hiss: 0.15, crackle: 0, width: 1, drop: 0 },
  Vinyl: { sat: 0.15, bits: 0, lp: 11000, hp: 50, wow: 0.15, flutter: 0, hiss: 0.05, crackle: 0.6, width: 0.9, drop: 0 },
  VHS: { sat: 0.25, bits: 0, lp: 6000, hp: 80, wow: 0.7, flutter: 0.3, hiss: 0.25, crackle: 0, width: 1.1, drop: 0 },
  Psyche: { sat: 0.2, bits: 0, lp: 15000, hp: 40, wow: 0.4, flutter: 0.6, hiss: 0, crackle: 0, width: 1.8, drop: 0 },
  Radio: { sat: 0.45, bits: 0, lp: 3500, hp: 420, wow: 0, flutter: 0.1, hiss: 0.2, crackle: 0.1, width: 0, drop: 0 },
  'Lo-Fi': { sat: 0.2, bits: 8, lp: 7000, hp: 60, wow: 0.1, flutter: 0, hiss: 0.1, crackle: 0.15, width: 0.8, drop: 0 },
  'Hi-Fi': { sat: 0.08, bits: 0, lp: 20000, hp: 25, wow: 0, flutter: 0, hiss: 0, crackle: 0, width: 1.3, drop: 0 },
  'Old Phone': { sat: 0.6, bits: 0, lp: 2800, hp: 600, wow: 0, flutter: 0, hiss: 0.15, crackle: 0.2, width: 0, drop: 0 },
  Cassette: { sat: 0.3, bits: 0, lp: 9500, hp: 45, wow: 0.35, flutter: 0.35, hiss: 0.3, crackle: 0, width: 0.9, drop: 0 },
  Spread: { sat: 0, bits: 0, lp: 20000, hp: 25, wow: 0, flutter: 0.15, hiss: 0, crackle: 0, width: 2, drop: 0 },
  Dust: { sat: 0.1, bits: 0, lp: 9000, hp: 60, wow: 0.1, flutter: 0, hiss: 0.1, crackle: 0.9, width: 1, drop: 0 },
  Broken: { sat: 0.5, bits: 6, lp: 8000, hp: 100, wow: 0.5, flutter: 0.5, hiss: 0.2, crackle: 0.3, width: 1, drop: 0.7 },
};

function audiomatic(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const S = (p: AudioParam, v: number) => setSmooth(p, v, ctx, 0.03);
  const inGain = ctx.createGain();
  const sat = ctx.createWaveShaper();
  const bits = ctx.createWaveShaper();
  const satTrim = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const wowDelay = ctx.createDelay(0.1);
  wowDelay.delayTime.value = 0.012;
  const wow = ctx.createOscillator();
  wow.frequency.value = 0.55;
  const wowAmt = ctx.createGain();
  const flutter = ctx.createOscillator();
  flutter.frequency.value = 7.3;
  const flutterAmt = ctx.createGain();
  wow.connect(wowAmt).connect(wowDelay.delayTime);
  flutter.connect(flutterAmt).connect(wowDelay.delayTime);
  wow.start();
  flutter.start();
  const width = buildWidth(ctx);
  const drop = ctx.createGain();
  const dropLfo = ctx.createOscillator();
  dropLfo.type = 'square';
  dropLfo.frequency.value = 2.7;
  const dropAmt = ctx.createGain();
  dropLfo.connect(dropAmt).connect(drop.gain);
  dropLfo.start();
  host.ins[0].connect(inGain).connect(sat).connect(satTrim).connect(bits).connect(hp).connect(lp).connect(wowDelay).connect(width.input);
  width.output.connect(drop).connect(host.outs[0]);
  const hiss = noiseSource(ctx, 'pink');
  const hissG = ctx.createGain();
  hiss.connect(hissG).connect(drop);
  hiss.start();
  // crackle: sparse clicks = noise through a very high-Q bandpass + spiky gate
  const crack = noiseSource(ctx);
  const crackHp = ctx.createBiquadFilter();
  crackHp.type = 'highpass';
  crackHp.frequency.value = 3000;
  const crackShape = ctx.createWaveShaper();
  crackShape.curve = (() => {
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.abs(x) > 0.92 ? Math.sign(x) * (Math.abs(x) - 0.92) * 12 : 0;
    }
    return c;
  })();
  const crackG = ctx.createGain();
  crack.connect(crackShape).connect(crackHp).connect(crackG).connect(drop);
  crack.start();

  const sync = () => {
    const st = AUDIOMATIC[host.opt('preset')] ?? AUDIOMATIC.Tape;
    const x = clamp(host.p('transform', 0.6), 0, 1);
    S(inGain.gain, dbToGain(host.p('gain', 0)));
    sat.curve = st.sat * x > 0.02 ? satCurve(st.sat * x, 0.12) : null;
    S(satTrim.gain, 1 / (1 + st.sat * x * 4));
    bits.curve = st.bits && x > 0.05 ? bitCurve(16 - (16 - st.bits) * x) : null;
    S(lp.frequency, 20000 - (20000 - st.lp) * x);
    S(hp.frequency, 20 + (st.hp - 20) * x);
    S(wowAmt.gain, st.wow * x * 0.004);
    S(flutterAmt.gain, st.flutter * x * 0.0006);
    width.set(1 + (st.width - 1) * x);
    S(hissG.gain, st.hiss * x * 0.03);
    S(crackG.gain, st.crackle * x * 0.5);
    S(drop.gain, 1 - st.drop * x * 0.5);
    S(dropAmt.gain, st.drop * x * 0.5);
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    dispose() {
      stopAll(ctx.currentTime, wow, flutter, dropLfo, hiss, crack);
    },
  };
}

function amp(host: SpecHost, bass: boolean): SpecEngine {
  const ctx = host.ctx;
  const S = (p: AudioParam, v: number) => setSmooth(p, v, ctx, 0.02);
  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.frequency.value = bass ? 30 : 90;
  const drive = ctx.createGain();
  const tube = ctx.createWaveShaper();
  tube.oversample = '4x';
  const bassEq = ctx.createBiquadFilter();
  bassEq.type = 'lowshelf';
  bassEq.frequency.value = bass ? 80 : 120;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.Q.value = bass ? 1 : 0.8;
  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = bass ? 2500 : 3200;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 5000;
  presence.Q.value = 1;
  const cab = ctx.createConvolver();
  cab.normalize = true;
  const cabDry = ctx.createGain();
  const cabWet = ctx.createGain();
  const vol = ctx.createGain();
  host.ins[0].connect(pre).connect(drive).connect(tube).connect(bassEq).connect(mid).connect(treble).connect(presence);
  presence.connect(cab).connect(cabWet).connect(vol);
  presence.connect(cabDry).connect(vol);
  vol.connect(host.outs[0]);
  let cabName = '';

  const sync = () => {
    const ch = host.opt('channel');
    const g = clamp(host.p('gain', 5), 0, 10) / 10;
    const chFactor = bass ? 0.6 : ch === 'Clean' ? 0.25 : ch === 'Lead' ? 1 : 0.6;
    S(drive.gain, 1 + g * g * 30 * chFactor);
    tube.curve = bass ? satCurve(0.12 + g * 0.55, 0.25) : satCurve(Math.min(1, 0.15 + g * chFactor), 0.08);
    S(bassEq.gain, (host.p('bass', 5) - 5) * 2.6);
    S(mid.frequency, bass ? host.p('midFreq', 700) : 650);
    S(mid.gain, (host.p('middle', 5) - 5) * 2.4);
    S(treble.gain, (host.p('treble', 5) - 5) * 2.4);
    S(presence.gain, bass ? 0 : (host.p('presence', 5) - 5) * 1.8);
    const c = host.opt('cab') || 'Off';
    if (c !== cabName) {
      cabName = c;
      if (c !== 'Off') cab.buffer = cabinetImpulse(ctx, c);
    }
    S(cabWet.gain, c === 'Off' ? 0 : 1);
    S(cabDry.gain, c === 'Off' ? 1 : 0);
    const v = clamp(host.p('volume', 5), 0, 10) / 5;
    // drive adds level: compensate so the Volume knob stays meaningful
    S(vol.gain, (v * v * 0.6) / Math.sqrt(1 + g * 6 * chFactor));
  };
  sync();
  return { onParam: () => sync() };
}
