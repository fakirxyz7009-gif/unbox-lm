/**
 * Modal / plucked engine ('modal') for pianos (Radical Piano), tuned percussion (Klang) and
 * world instruments (Pangea).
 *  - Struck models: a few sine partials with model ratios (inharmonic bars, stretched piano
 *    strings), each with its own exponential decay; hammer / mallet noise; optional detuned
 *    unison strings and motor tremolo.
 *  - Plucked models: a bright harmonic string tone whose low-pass closes over time, optional
 *    jawari / buzz (sitar, mbira) and course detune (santoor).
 * Hardness shapes the spectrum, Damping shortens upper partials, the Pedal holds notes, Room
 * adds a short convolution space.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp, disconnectAll, harmonicWave, impulseResponse, midiHz, noiseSource, satCurve, setSmooth, stopAll } from '../dsp.ts';
import { VoicePool, type VoiceBase } from './voices.ts';

interface StruckModel {
  kind: 'struck';
  ratios: number[];
  amps: number[];
  /** Fundamental decay at C4, seconds. */
  decay: number;
  /** Extra decay per partial index (higher partials die faster). */
  partialDamp: number;
  /** Piano-style string stretch (inharmonicity B). */
  stretchB?: number;
  /** Detuned copies (piano unisons / steel pan shimmer), cents. */
  unison?: number[];
  noise: number;
  noiseHz: number;
  tremoloHz?: number;
  body?: number;
}

interface PluckModel {
  kind: 'pluck';
  decay: number;
  bright: number;
  buzz?: number;
  courses?: number[];
  noise: number;
  body?: number;
}

type Model = StruckModel | PluckModel;

const harm = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const MODELS: Record<string, Model> = {
  // pianos
  Grand: { kind: 'struck', ratios: harm(10), amps: harm(10).map((n) => 1 / Math.pow(n, 0.9)), decay: 4.5, partialDamp: 0.32, stretchB: 0.00035, unison: [0, 1.2, -0.9], noise: 0.25, noiseHz: 2500, body: 0.3 },
  Upright: { kind: 'struck', ratios: harm(9), amps: harm(9).map((n) => 1 / Math.pow(n, 0.8)), decay: 3, partialDamp: 0.4, stretchB: 0.0006, unison: [0, 2.5], noise: 0.35, noiseHz: 2000, body: 0.5 },
  Home: { kind: 'struck', ratios: harm(8), amps: harm(8).map((n) => 1 / n), decay: 2.4, partialDamp: 0.5, stretchB: 0.0008, unison: [0, 6, -4], noise: 0.4, noiseHz: 1700, body: 0.6 },
  Felt: { kind: 'struck', ratios: harm(6), amps: harm(6).map((n) => 1 / Math.pow(n, 1.8)), decay: 3.2, partialDamp: 0.7, stretchB: 0.0004, unison: [0, 1], noise: 0.12, noiseHz: 700, body: 0.4 },
  Electric: { kind: 'struck', ratios: [1, 2, 3, 4.2, 7.1], amps: [1, 0.35, 0.12, 0.25, 0.08], decay: 3.5, partialDamp: 0.9, noise: 0.08, noiseHz: 3500, tremoloHz: 5 },
  Toy: { kind: 'struck', ratios: [1, 2.76, 5.4, 8.93], amps: [1, 0.5, 0.25, 0.12], decay: 1.2, partialDamp: 0.8, noise: 0.3, noiseHz: 5000 },
  // tuned percussion
  Marimba: { kind: 'struck', ratios: [1, 3.93, 9.2], amps: [1, 0.35, 0.12], decay: 1.1, partialDamp: 1.6, noise: 0.2, noiseHz: 1200, body: 0.5 },
  Vibraphone: { kind: 'struck', ratios: [1, 4, 10.1], amps: [1, 0.25, 0.08], decay: 4.5, partialDamp: 1.2, noise: 0.1, noiseHz: 3000, tremoloHz: 5.5 },
  Glockenspiel: { kind: 'struck', ratios: [1, 2.71, 5.15, 8.4], amps: [1, 0.5, 0.25, 0.1], decay: 2.6, partialDamp: 0.7, noise: 0.15, noiseHz: 6000 },
  Xylophone: { kind: 'struck', ratios: [1, 3, 6.2], amps: [1, 0.4, 0.15], decay: 0.6, partialDamp: 1.5, noise: 0.35, noiseHz: 2500 },
  'Tubular Bells': { kind: 'struck', ratios: [1, 2, 2.4, 3, 4.5, 5.33, 6.8], amps: [0.6, 1, 0.7, 0.5, 0.35, 0.25, 0.15], decay: 6, partialDamp: 0.25, noise: 0.15, noiseHz: 4000 },
  Kalimba: { kind: 'struck', ratios: [1, 5.9, 12.1], amps: [1, 0.25, 0.08], decay: 1.6, partialDamp: 1.4, noise: 0.25, noiseHz: 2500, body: 0.6 },
  'Steel Pan': { kind: 'struck', ratios: [1, 2, 3, 4.02], amps: [1, 0.6, 0.3, 0.15], decay: 2, partialDamp: 0.5, unison: [0, 3], noise: 0.15, noiseHz: 2000 },
  'Music Box': { kind: 'struck', ratios: [1, 3.8, 7.3], amps: [1, 0.3, 0.12], decay: 1.4, partialDamp: 1, noise: 0.1, noiseHz: 7000 },
  Celesta: { kind: 'struck', ratios: [1, 3, 6.1], amps: [1, 0.2, 0.06], decay: 2.2, partialDamp: 1, noise: 0.08, noiseHz: 3000 },
  // world
  Sitar: { kind: 'pluck', decay: 4, bright: 0.9, buzz: 0.6, courses: [0, 1100, 700], noise: 0.25, body: 0.5 },
  Koto: { kind: 'pluck', decay: 2.4, bright: 0.75, noise: 0.3, body: 0.4 },
  Oud: { kind: 'pluck', decay: 2, bright: 0.45, courses: [0, 3], noise: 0.25, body: 0.7 },
  Santoor: { kind: 'pluck', decay: 2.6, bright: 0.85, courses: [0, 4, -3], noise: 0.4, body: 0.3 },
  Guzheng: { kind: 'pluck', decay: 3, bright: 0.8, noise: 0.3, body: 0.35 },
  Balafon: { kind: 'struck', ratios: [1, 3.9, 9.6], amps: [1, 0.4, 0.12], decay: 0.8, partialDamp: 1.3, noise: 0.4, noiseHz: 1500, body: 0.7 },
  Hang: { kind: 'struck', ratios: [1, 2, 3, 4.1], amps: [1, 0.55, 0.3, 0.1], decay: 3, partialDamp: 0.7, noise: 0.05, noiseHz: 800 },
  Mbira: { kind: 'pluck', decay: 1.6, bright: 0.7, buzz: 0.45, noise: 0.25, body: 0.5 },
  Banjo: { kind: 'pluck', decay: 1, bright: 1, noise: 0.35, body: 0.2 },
};

class ModalVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  sources: AudioScheduledSourceNode[] = [];
  nodes: AudioNode[] = [];
  out!: GainNode;
  held = true;
  constructor(public note: number, public startTime: number, public natural: number) {}

  /** Damper: fade within `r` seconds (the natural decay keeps going under the pedal). */
  release(t: number, r = 0.25): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value || 1, t);
    this.out.gain.setTargetAtTime(0, t, Math.max(0.01, r / 4));
    this.endTime = Math.min(this.startTime + this.natural, t + r * 1.5 + 0.05);
    stopAll(this.endTime, ...this.sources);
  }

  kill(t: number): void {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, ...this.sources);
  }

  cleanup(): void {
    disconnectAll(...this.sources, ...this.nodes, this.out);
  }
}

export function modalEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pool = new VoicePool<ModalVoice>(Number(host.cfg.maxVoices ?? 16));
  const bus = ctx.createGain();
  // pianos stack many partials and unison strings: trim to match the other instruments
  bus.gain.value = host.cfg.family === 'piano' ? 0.45 : 1;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.4;
  const trem = ctx.createGain();
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = 5;
  const tremAmt = ctx.createGain();
  tremAmt.gain.value = 0;
  tremLfo.connect(tremAmt).connect(trem.gain);
  tremLfo.start();
  bus.connect(tone).connect(trem);
  const dry = ctx.createGain();
  trem.connect(dry).connect(host.outs[0]);
  const room = ctx.createConvolver();
  room.buffer = impulseResponse(ctx, { seconds: 1.6, decay: 3.2, damping: 0.55, early: 0.5, seed: 11 });
  const roomWet = ctx.createGain();
  trem.connect(room).connect(roomWet).connect(host.outs[0]);
  const pedalHeld: ModalVoice[] = [];

  const model = (): Model => MODELS[host.opt('model')] ?? MODELS.Grand;

  const sync = () => {
    const m = model();
    setSmooth(tone.frequency, 600 * Math.pow(30, clamp(host.p('brightness', 0.55), 0, 1)), ctx, 0.03);
    setSmooth(roomWet.gain, host.p('room', 0.15) * 0.9, ctx, 0.03);
    const tremDepth = clamp(host.p('tremolo', 0), 0, 1) * (m.kind === 'struck' && m.tremoloHz ? 1 : 0.6);
    setSmooth(tremLfo.frequency, m.kind === 'struck' && m.tremoloHz ? m.tremoloHz : 5, ctx, 0.05);
    setSmooth(trem.gain, 1 - tremDepth / 2, ctx, 0.03);
    setSmooth(tremAmt.gain, tremDepth / 2, ctx, 0.03);
  };
  sync();

  const bodyFilter = (amount: number, f0: number): BiquadFilterNode => {
    const b = ctx.createBiquadFilter();
    b.type = 'peaking';
    b.frequency.value = clamp(f0 < 200 ? 180 : 350 + f0 * 0.4, 120, 3000);
    b.Q.value = 1.2;
    b.gain.value = amount * 9;
    return b;
  };

  function struck(m: StruckModel, note: number, vel: number, t: number): ModalVoice {
    const f0 = midiHz(note);
    const hard = clamp(host.p('hardness', 0.5) * (0.6 + 0.4 * vel), 0, 1);
    const scale = host.p('decayScale', 1) * Math.pow(261.6 / f0, 0.35);
    const natural = m.decay * scale;
    const v = new ModalVoice(note, t, natural * 1.4);
    v.out = ctx.createGain();
    v.out.gain.value = 1;
    const body = host.p('body', 0.4) * (m.body ?? 0.3);
    const head = body > 0.02 ? bodyFilter(body, f0) : ctx.createGain();
    head.connect(v.out);
    v.out.connect(bus);
    v.nodes.push(head);
    const damp = 1 + host.p('damping', 0.3) * 2;
    const stretch = (m.stretchB ?? 0) * (1 + host.p('inharmonic', 0.15) * 6);
    const unison = m.unison ?? [0];
    m.ratios.forEach((r, i) => {
      const ratio = m.stretchB ? (i + 1) * Math.sqrt(1 + stretch * (i + 1) * (i + 1)) : r;
      const freq = f0 * ratio;
      if (freq > ctx.sampleRate / 2.2) return;
      // hardness lifts upper partials
      const amp = m.amps[i] * Math.pow(i + 1, (hard - 0.5) * 1.4) * vel;
      const tau = (natural / (1 + m.partialDamp * i * damp)) / 4.6;
      for (const cents of unison) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.detune.value = cents;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime((amp * 0.28) / Math.sqrt(unison.length), t + 0.002 + (1 - hard) * 0.004);
        g.gain.setTargetAtTime(0, t + 0.004, Math.max(0.01, tau));
        o.connect(g).connect(head);
        v.sources.push(o);
        v.nodes.push(g);
      }
    });
    addNoise(v, head, (m.noise ?? 0.2) * host.p('noise', 0.25) * 4 * vel, m.noiseHz * (0.5 + hard), t, 0.015 + (1 - hard) * 0.02);
    v.sources.forEach((s) => s.start(t));
    stopAll(t + natural * 1.4 + 0.1, ...v.sources);
    v.endTime = t + natural * 1.4 + 0.1;
    v.sources[0].onended = () => v.cleanup();
    return v;
  }

  function pluck(m: PluckModel, note: number, vel: number, t: number): ModalVoice {
    const f0 = midiHz(note);
    const hard = clamp(host.p('hardness', 0.5) * (0.6 + 0.4 * vel), 0, 1);
    const natural = m.decay * host.p('decayScale', 1) * Math.pow(261.6 / f0, 0.3);
    const v = new ModalVoice(note, t, natural * 1.4);
    v.out = ctx.createGain();
    v.out.gain.value = 1;
    const body = host.p('body', 0.4) * (m.body ?? 0.3);
    const head = body > 0.02 ? bodyFilter(body, f0) : ctx.createGain();
    head.connect(v.out);
    v.out.connect(bus);
    v.nodes.push(head);
    // string spectrum: 1/n with a pluck-position notch
    const amps = new Float32Array(40);
    for (let n = 1; n < 40; n++) amps[n] = (1 / n) * Math.abs(Math.sin((n * Math.PI) / 7)) + (n === 1 ? 0.3 : 0);
    const wave = harmonicWave(ctx, 'pluck-string', amps);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const startHz = clamp(f0 * (3 + m.bright * 18 * (0.4 + hard)), 200, 18000);
    lp.frequency.setValueAtTime(startHz, t);
    lp.frequency.setTargetAtTime(Math.max(f0 * 1.2, 200), t + 0.005, (natural / 6) * (1.2 - host.p('damping', 0.3)));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.32 * vel, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.003, natural / 4.6);
    let tail: AudioNode = lp;
    if (m.buzz) {
      const ws = ctx.createWaveShaper();
      ws.curve = satCurve(m.buzz * 0.5, 0.15);
      lp.connect(ws);
      tail = ws;
      v.nodes.push(ws);
    }
    tail.connect(amp).connect(head);
    for (const cents of m.courses ?? [0]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = f0;
      o.detune.value = cents > 50 ? 0 : cents;
      const g = ctx.createGain();
      // sitar: sympathetic strings an octave / fifth above, quieter
      g.gain.value = cents > 50 ? 0.12 : 1 / Math.sqrt((m.courses ?? [0]).length);
      if (cents > 50) o.frequency.value = f0 * (cents > 1000 ? 2 : 1.5);
      o.connect(g).connect(lp);
      v.sources.push(o);
      v.nodes.push(g);
    }
    v.nodes.push(lp, amp);
    addNoise(v, head, m.noise * host.p('noise', 0.25) * 3 * vel, 3500 * (0.5 + hard), t, 0.01);
    v.sources.forEach((s) => s.start(t));
    stopAll(t + natural * 1.4 + 0.1, ...v.sources);
    v.endTime = t + natural * 1.4 + 0.1;
    v.sources[0].onended = () => v.cleanup();
    return v;
  }

  function addNoise(v: ModalVoice, dest: AudioNode, level: number, hz: number, t: number, len: number): void {
    if (level < 0.005) return;
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp(hz, 200, 12000);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * 0.3, t);
    g.gain.setTargetAtTime(0, t + 0.001, len / 3);
    n.connect(bp).connect(g).connect(dest);
    n.start(t);
    n.stop(t + len * 4 + 0.02);
    v.nodes.push(bp, g);
  }

  const pedalDown = () => host.p('sustainPedal', 0) >= 0.5;

  return {
    handles: {},
    noteOn(note, vel, t) {
      pool.makeRoom(t, ctx.currentTime);
      // re-striking a ringing note damps the old one (one string per key)
      pool.list.filter((v) => v.note === note && v.releaseTime === null).forEach((v) => v.release(t, 0.06));
      const m = model();
      pool.add(m.kind === 'struck' ? struck(m, note, vel, t) : pluck(m, note, vel, t));
    },
    noteOff(note, t) {
      const r = host.p('release', 0.4);
      const v = pool.list.find((x) => x.note === note && x.releaseTime === null && x.held && x.startTime <= t + 1e-6);
      if (!v) return;
      v.held = false;
      if (pedalDown()) pedalHeld.push(v);
      else v.release(t, r);
    },
    allNotesOff(t) {
      pedalHeld.length = 0;
      pool.killAll(t);
    },
    onParam(key) {
      if (key === 'sustainPedal' && !pedalDown()) {
        const t = ctx.currentTime;
        pedalHeld.splice(0).forEach((v) => v.release(t, host.p('release', 0.4)));
      }
      sync();
    },
    meter() {
      return { voices: pool.held().length };
    },
    dispose() {
      pool.killAll(ctx.currentTime);
      try {
        tremLfo.stop();
      } catch {
        // stopped
      }
    },
  };
}
