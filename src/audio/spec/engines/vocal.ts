/**
 * Voice processors.
 *  - 'vocoder' (BV512): modulator (sidechain input) split into 4 / 8 / 16 / 32 bands, each band's
 *    envelope (rectifier plus separate attack/release followers; their maximum gives fast rises
 *    and slow falls) drives the matching carrier band (main input, optionally mixed with an
 *    internal saw + noise carrier). Shift moves the carrier bands up / down an octave, HF
 *    Emphasis brightens the modulator, Hold freezes the band levels. The band bank is rebuilt
 *    only when the band count changes.
 *  - 'pitch' (Neptune): delay-line pitch shifter for transpose / fine, formant tone (tilt
 *    filter — a tonal approximation, not true formant preservation), and harmony voices
 *    (+3rd / +5th / octaves / triad in the chosen key, or following notes sent to it).
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { absCurve, buildPitchShifter, clamp, disconnectAll, noiseSource, setSmooth } from '../dsp.ts';

export function vocoderEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const carrierIn = ctx.createGain();
  host.ins[0].connect(carrierIn);
  const modIn = ctx.createGain();
  const emph = ctx.createBiquadFilter();
  emph.type = 'highshelf';
  emph.frequency.value = 3000;
  if (host.sc) host.sc.connect(emph);
  emph.connect(modIn);
  // internal carrier: detuned saws + a little noise for consonants
  const intCarrier = ctx.createGain();
  const saws = [-7, 0, 7].map((c) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 110;
    o.detune.value = c;
    o.connect(intCarrier);
    o.start();
    return o;
  });
  const nz = noiseSource(ctx);
  const nzG = ctx.createGain();
  nzG.gain.value = 0.15;
  nz.connect(nzG).connect(intCarrier);
  nz.start();
  const intG = ctx.createGain();
  intCarrier.connect(intG).connect(carrierIn);
  const sum = ctx.createGain();
  sum.connect(host.outs[0]);
  let bandNodes: AudioNode[] = [];
  let followers: { attack: BiquadFilterNode; decay: BiquadFilterNode }[] = [];
  let carrierBands: BiquadFilterNode[] = [];
  let builtFor = 0;

  const build = () => {
    const n = [4, 8, 16, 32][clamp(Math.round(host.p('bands', 2)), 0, 3)];
    if (n === builtFor) return;
    builtFor = n;
    disconnectAll(...bandNodes);
    bandNodes = [];
    followers = [];
    carrierBands = [];
    const lo = 120;
    const hi = 9000;
    const q = n <= 4 ? 1.2 : n <= 8 ? 2.5 : n <= 16 ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const f = lo * Math.pow(hi / lo, n === 1 ? 0.5 : i / (n - 1));
      const mb = ctx.createBiquadFilter();
      mb.type = 'bandpass';
      mb.frequency.value = f;
      mb.Q.value = q;
      const rect = ctx.createWaveShaper();
      rect.curve = absCurve(ctx);
      const attack = ctx.createBiquadFilter();
      attack.type = 'lowpass';
      attack.Q.value = 0.5;
      const decay = ctx.createBiquadFilter();
      decay.type = 'lowpass';
      decay.Q.value = 0.5;
      const envSum = ctx.createGain();
      const difference = ctx.createGain();
      const invertDecay = ctx.createGain();
      invertDecay.gain.value = -1;
      const absDifference = ctx.createWaveShaper();
      absDifference.curve = absCurve(ctx);
      const envelope = ctx.createGain();
      envelope.gain.value = 0.5;
      rect.connect(attack).connect(envSum);
      rect.connect(decay).connect(envSum);
      attack.connect(difference);
      decay.connect(invertDecay).connect(difference);
      difference.connect(absDifference).connect(envelope);
      envSum.connect(envelope);
      const amp = ctx.createGain();
      amp.gain.value = 3 * Math.sqrt(32 / n);
      modIn.connect(mb).connect(rect);
      envelope.connect(amp);
      const cb = ctx.createBiquadFilter();
      cb.type = 'bandpass';
      cb.frequency.value = f;
      cb.Q.value = q;
      const vca = ctx.createGain();
      vca.gain.value = 0;
      amp.connect(vca.gain);
      carrierIn.connect(cb).connect(vca).connect(sum);
      bandNodes.push(mb, rect, attack, decay, envSum, difference, invertDecay, absDifference, envelope, amp, cb, vca);
      followers.push({ attack, decay });
      carrierBands.push(cb);
    }
    sync();
  };

  const sync = () => {
    const hold = host.p('hold', 0) >= 0.5;
    const attack = host.p('attack', 0.005);
    const decay = host.p('decay', 0.08);
    const attackHz = clamp(1 / (2 * Math.PI * attack), 0.05, 120);
    const decayHz = clamp(1 / (2 * Math.PI * decay), 0.05, 120);
    followers.forEach((f) => {
      setSmooth(f.attack.frequency, hold ? 0.05 : attackHz, ctx, 0.02);
      setSmooth(f.decay.frequency, hold ? 0.05 : decayHz, ctx, 0.02);
    });
    const shift = Math.pow(2, clamp(host.p('shift', 0), -1, 1));
    carrierBands.forEach((cb, i) => {
      const n = carrierBands.length;
      const f = 120 * Math.pow(9000 / 120, n === 1 ? 0.5 : i / (n - 1));
      setSmooth(cb.frequency, clamp(f * shift, 40, 18000), ctx, 0.03);
    });
    setSmooth(emph.gain, host.p('hfEmph', 0.4) * 14, ctx, 0.03);
    setSmooth(intG.gain, host.p('internalCarrier', 0) * 0.5, ctx, 0.03);
  };
  build();
  return {
    onParam(k) {
      if (k === 'bands') build();
      else if (k !== 'mix' && k !== 'output') sync();
    },
    noteOn(note, _vel, t) {
      // notes sent to the vocoder tune the internal carrier
      saws.forEach((o) => o.frequency.setValueAtTime(440 * Math.pow(2, (note - 69) / 12), t));
    },
    meter() {
      return { bands: builtFor };
    },
    dispose() {
      saws.forEach((o) => o.stop());
      nz.stop();
    },
  };
}

const SCALE_STEPS: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Pentatonic Maj': [0, 2, 4, 7, 9],
  'Pentatonic Min': [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function pitchEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const main = ctx.createGain();
  const tiltLo = ctx.createBiquadFilter();
  tiltLo.type = 'lowshelf';
  tiltLo.frequency.value = 600;
  const tiltHi = ctx.createBiquadFilter();
  tiltHi.type = 'highshelf';
  tiltHi.frequency.value = 2500;
  main.connect(tiltLo).connect(tiltHi).connect(host.outs[0]);
  const shifter = buildPitchShifter(ctx, host.ins[0], main, 1);
  const harmBus = ctx.createGain();
  harmBus.connect(tiltLo);
  const harmonies = [0, 1, 2].map(() => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(harmBus);
    return { g, sh: buildPitchShifter(ctx, host.ins[0], g, 1) };
  });
  const held: number[] = [];

  const sync = () => {
    const semis = host.p('transpose', 0) + host.p('fine', 0) / 100;
    shifter.set(Math.pow(2, semis / 12));
    const f = host.p('formant', 0);
    setSmooth(tiltLo.gain, -f * 0.8, ctx, 0.03);
    setSmooth(tiltHi.gain, f * 0.9, ctx, 0.03);
    const mode = host.opt('harmony');
    const scale = SCALE_STEPS[host.opt('scale')] ?? SCALE_STEPS.Minor;
    const third = scale.includes(4) && !scale.includes(3) ? 4 : 3;
    const fifth = scale.includes(7) ? 7 : 6;
    let intervals: number[] = [];
    if (mode === '+3rd') intervals = [third];
    else if (mode === '+5th') intervals = [fifth];
    else if (mode === 'Octaves') intervals = [-12, 12];
    else if (mode === 'Triad') intervals = [third, fifth];
    else if (mode === 'Notes') intervals = held.slice(-3).map((n) => n - 60);
    harmonies.forEach((h, i) => {
      const iv = intervals[i];
      setSmooth(h.g.gain, iv === undefined ? 0 : host.p('voiceLevel', 0.6) * 0.7, ctx, 0.03);
      if (iv !== undefined) h.sh.set(Math.pow(2, (semis + iv) / 12));
    });
  };
  sync();
  return {
    onParam: (k) => k !== 'mix' && k !== 'output' && sync(),
    noteOn(note) {
      held.push(note);
      if (host.opt('harmony') === 'Notes') sync();
    },
    noteOff(note) {
      const i = held.lastIndexOf(note);
      if (i >= 0) held.splice(i, 1);
      if (host.opt('harmony') === 'Notes') sync();
    },
    dispose() {
      shifter.stop();
      harmonies.forEach((h) => h.sh.stop());
    },
  };
}
