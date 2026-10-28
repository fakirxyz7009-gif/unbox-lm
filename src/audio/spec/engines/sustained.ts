/**
 * Sustained acoustic engines.
 *  - 'formant' (Humana): ensemble of glottal sources (detuned, each with its own vibrato) +
 *    breath noise through three vowel formants; vowel morph A-E-I-O-U, voice-type scaling,
 *    formant shift, slow vowel motion.
 *  - 'bowed' (Friktion): Helmholtz (saw) string + bow noise, bow pressure → brightness,
 *    bow position → comb notches, instrument body resonances, delayed vibrato, ensemble.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, adsrStart, clamp, disconnectAll, impulseResponse, midiHz, noiseSource, setSmooth, stopAll, type Adsr } from '../dsp.ts';
import { VoicePool, type VoiceBase } from './voices.ts';

const VOWELS: [number, number, number][] = [
  [800, 1150, 2900], // A
  [400, 1600, 2700], // E
  [350, 2300, 3000], // I
  [450, 800, 2830], // O
  [325, 700, 2530], // U
];
const VOICE_SCALE: Record<string, number> = { Soprano: 1.18, Alto: 1.06, Tenor: 0.95, Bass: 0.84, 'Mixed Choir': 1, Children: 1.3 };

function vowelFormants(v: number): [number, number, number] {
  const x = clamp(v, 0, 4);
  const i = Math.min(3, Math.floor(x));
  const f = x - i;
  const a = VOWELS[i];
  const b = VOWELS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const BODIES: Record<string, { modes: [number, number, number][]; range: number }> = {
  Violin: { modes: [[280, 2.5, 6], [460, 3, 5], [550, 3, 6], [2500, 1.2, 4]], range: 1 },
  Viola: { modes: [[230, 2.5, 6], [390, 3, 5], [470, 3, 5], [2100, 1.2, 4]], range: 0.85 },
  Cello: { modes: [[100, 2, 7], [190, 2.5, 5], [220, 3, 5], [1500, 1.2, 3]], range: 0.55 },
  'Double Bass': { modes: [[60, 2, 7], [110, 2.5, 5], [180, 3, 4], [1000, 1.2, 3]], range: 0.4 },
  Erhu: { modes: [[520, 3, 6], [1200, 3, 5], [3000, 2, 6]], range: 1 },
  Fiddle: { modes: [[300, 2.5, 5], [520, 3, 6], [2800, 1.4, 6]], range: 1 },
};

class SusVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  sources: AudioScheduledSourceNode[] = [];
  nodes: AudioNode[] = [];
  formants: BiquadFilterNode[][] = [];
  lowpass: BiquadFilterNode[] = [];
  noiseGain: GainNode | null = null;
  amp!: GainNode;
  env: Adsr = { a: 0.1, d: 0.3, s: 0.9, r: 0.6 };
  constructor(public note: number, public startTime: number) {}

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    adsrRelease(this.amp.gain, t, 0, this.env.r);
    this.endTime = t + Math.max(0.02, this.env.r) * 1.6 + 0.05;
    stopAll(this.endTime, ...this.sources);
  }

  kill(t: number): void {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, ...this.sources);
  }

  cleanup(): void {
    disconnectAll(...this.sources, ...this.nodes, this.amp);
  }
}

function sustainedEngine(host: SpecHost, kind: 'formant' | 'bowed'): SpecEngine {
  const ctx = host.ctx;
  const pool = new VoicePool<SusVoice>(Number(host.cfg.maxVoices ?? 8));
  const bus = ctx.createGain();
  bus.gain.value = kind === 'bowed' ? 0.4 : 1.4;
  const dry = ctx.createGain();
  bus.connect(dry).connect(host.outs[0]);
  const room = ctx.createConvolver();
  room.buffer = impulseResponse(ctx, kind === 'formant' ? { seconds: 3.4, decay: 3, damping: 0.45, early: 0.4, seed: 21 } : { seconds: 2.2, decay: 3.5, damping: 0.5, early: 0.5, seed: 23 });
  const roomWet = ctx.createGain();
  bus.connect(room).connect(roomWet).connect(host.outs[0]);
  let motionTimer: number | null = null;
  let motionPhase = 0;

  const syncRoom = () => setSmooth(roomWet.gain, host.p('room', 0.2) * 0.9, ctx, 0.03);
  syncRoom();

  const formantSet = (vowel: number) => {
    const scale = VOICE_SCALE[host.opt('voiceType')] ?? 1;
    const shift = Math.pow(2, host.p('formantShift', 0) / 12);
    return vowelFormants(vowel).map((f) => clamp(f * scale * shift, 80, 16000));
  };

  const updateFormants = () => {
    const motion = host.p('vowelMotion', 0) * Math.sin(motionPhase) * 0.8;
    const fs = formantSet(host.p('vowel', 0) + motion);
    pool.list.forEach((v) => v.formants.forEach((bank) => bank.forEach((bp, i) => setSmooth(bp.frequency, fs[i], ctx, 0.05))));
  };

  const ensureMotion = () => {
    if (kind !== 'formant' || motionTimer !== null || host.p('vowelMotion', 0) < 0.01 || !(ctx instanceof AudioContext)) return;
    motionTimer = window.setInterval(() => {
      motionPhase += 0.033 * 0.35 * Math.PI * 2;
      pool.gc(ctx.currentTime);
      if (!pool.list.length) {
        if (motionTimer !== null) clearInterval(motionTimer);
        motionTimer = null;
        return;
      }
      updateFormants();
    }, 33);
  };

  function vibrato(o: OscillatorNode, t: number, v: SusVoice, rateJitter: number): void {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = host.p('vibRate', 5.2) * (1 + rateJitter);
    const depth = ctx.createGain();
    const cents = host.p('vibDepth', 0.25) * 35;
    // vibrato fades in like a player's
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(cents, t + 0.45);
    lfo.connect(depth).connect(o.detune);
    v.sources.push(lfo);
    v.nodes.push(depth);
  }

  function formantVoice(note: number, vel: number, t: number): SusVoice {
    const v = new SusVoice(note, t);
    const f0 = midiHz(note);
    const n = 1 + Math.round(host.p('ensemble', 0.5) * 5);
    const src = ctx.createGain();
    src.gain.value = 1 / Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f0;
      o.detune.value = n === 1 ? 0 : (Math.random() * 2 - 1) * (4 + host.p('ensemble', 0.5) * 10);
      vibrato(o, t, v, (Math.random() - 0.5) * 0.2);
      const pan = ctx.createStereoPanner();
      pan.pan.value = n === 1 ? 0 : (i / (n - 1)) * 1.4 - 0.7;
      o.connect(pan).connect(src);
      v.sources.push(o);
      v.nodes.push(pan);
    }
    const breath = noiseSource(ctx);
    v.noiseGain = ctx.createGain();
    v.noiseGain.gain.value = host.p('breath', 0.2) * 0.25;
    breath.connect(v.noiseGain);
    v.sources.push(breath);
    const fs = formantSet(host.p('vowel', 0));
    const sum = ctx.createGain();
    const bank: BiquadFilterNode[] = [];
    fs.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = [8, 10, 12][i];
      const g = ctx.createGain();
      g.gain.value = [1, 0.7, 0.35][i] * (0.6 + host.p('brightness', 0.5) * (i ? 0.8 : 0.2));
      src.connect(bp);
      v.noiseGain!.connect(bp);
      bp.connect(g).connect(sum);
      bank.push(bp);
      v.nodes.push(bp, g);
    });
    v.formants.push(bank);
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;
    sum.gain.value = 2.2;
    sum.connect(v.amp).connect(bus);
    v.nodes.push(src, sum, v.noiseGain);
    v.env = { a: host.p('attack', 0.18), d: host.p('decay', 0.4), s: host.p('sustain', 0.85), r: host.p('release', 0.9) };
    const peak = 0.5 + 0.5 * vel;
    adsrStart(v.amp.gain, t, 0, peak, peak * v.env.s, v.env);
    v.sources.forEach((s) => s.start(t));
    v.sources[0].onended = () => v.cleanup();
    ensureMotion();
    return v;
  }

  function bowedVoice(note: number, vel: number, t: number): SusVoice {
    const v = new SusVoice(note, t);
    const f0 = midiHz(note);
    const body = BODIES[host.opt('body')] ?? BODIES.Violin;
    const n = 1 + Math.round(host.p('ensemble', 0.2) * 3);
    const src = ctx.createGain();
    src.gain.value = 0.45 / Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f0;
      o.detune.value = n === 1 ? 0 : (Math.random() * 2 - 1) * 9;
      vibrato(o, t, v, (Math.random() - 0.5) * 0.15);
      o.connect(src);
      v.sources.push(o);
    }
    // bow noise rides on the string tone
    const bow = noiseSource(ctx);
    const bowBp = ctx.createBiquadFilter();
    bowBp.type = 'bandpass';
    bowBp.frequency.value = clamp(f0 * 6, 600, 9000);
    bowBp.Q.value = 0.7;
    v.noiseGain = ctx.createGain();
    v.noiseGain.gain.value = host.p('bowNoise', 0.25) * (0.3 + host.p('pressure', 0.55)) * 0.2;
    bow.connect(bowBp).connect(v.noiseGain).connect(src);
    v.sources.push(bow);
    // bow position: feed-forward comb (notches harmonics that are multiples of 1/position)
    const pos = clamp(host.p('position', 0.3), 0.05, 0.5);
    const comb = ctx.createDelay(0.05);
    comb.delayTime.value = Math.min(0.049, pos / f0);
    const combG = ctx.createGain();
    combG.gain.value = -0.45;
    const sum = ctx.createGain();
    src.connect(sum);
    src.connect(comb).connect(combG).connect(sum);
    // pressure → brightness
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.value = clamp(f0 * (3 + host.p('pressure', 0.55) * 18) * (0.4 + host.p('brightness', 0.5) * 1.2), 300, 18000);
    v.lowpass.push(lp);
    sum.connect(lp);
    let head: AudioNode = lp;
    const size = 0.7 + host.p('bodySize', 0.5) * 0.6;
    for (const [hz, q, gain] of body.modes) {
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = clamp(hz / size, 40, 12000);
      pk.Q.value = q;
      pk.gain.value = gain;
      head.connect(pk);
      head = pk;
      v.nodes.push(pk);
    }
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;
    head.connect(v.amp).connect(bus);
    v.nodes.push(src, bowBp, comb, combG, sum, lp, v.noiseGain);
    v.env = { a: host.p('attack', 0.12), d: host.p('decay', 0.3), s: host.p('sustain', 0.9), r: host.p('release', 0.5) };
    const peak = 0.45 + 0.55 * vel;
    adsrStart(v.amp.gain, t, 0, peak, peak * v.env.s, v.env);
    v.sources.forEach((s) => s.start(t));
    v.sources[0].onended = () => v.cleanup();
    return v;
  }

  return {
    noteOn(note, vel, t) {
      pool.makeRoom(t, ctx.currentTime);
      pool.add(kind === 'formant' ? formantVoice(note, vel, t) : bowedVoice(note, vel, t));
    },
    noteOff(note, t) {
      pool.releaseNote(note, t);
    },
    allNotesOff(t) {
      pool.killAll(t);
    },
    onParam(key) {
      if (key === 'room') syncRoom();
      else if (['vowel', 'formantShift', 'voiceType'].includes(key)) updateFormants();
      else if (key === 'vowelMotion') ensureMotion();
      else if (key === 'breath') pool.list.forEach((v) => v.noiseGain && setSmooth(v.noiseGain.gain, host.p('breath', 0.2) * 0.25, ctx, 0.03));
      else if (key === 'pressure' || key === 'brightness' || key === 'bowNoise') {
        pool.list.forEach((v) => {
          const f0 = midiHz(v.note);
          v.lowpass.forEach((lp) => setSmooth(lp.frequency, clamp(f0 * (3 + host.p('pressure', 0.55) * 18) * (0.4 + host.p('brightness', 0.5) * 1.2), 300, 18000), ctx, 0.03));
          if (kind === 'bowed' && v.noiseGain) setSmooth(v.noiseGain.gain, host.p('bowNoise', 0.25) * (0.3 + host.p('pressure', 0.55)) * 0.2, ctx, 0.03);
        });
      }
    },
    meter() {
      return { voices: pool.held().length };
    },
    dispose() {
      if (motionTimer !== null) clearInterval(motionTimer);
      pool.killAll(ctx.currentTime);
    },
  };
}

export const formantEngine = (host: SpecHost) => sustainedEngine(host, 'formant');
export const bowedEngine = (host: SpecHost) => sustainedEngine(host, 'bowed');
