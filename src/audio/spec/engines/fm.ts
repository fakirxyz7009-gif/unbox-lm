/**
 * FM engine ('fm'): up to 9 sine operators wired by an algorithm (stacks, parallel stacks,
 * trees, pairs), per-operator ratio / level, a modulation-index envelope (decay / sustain,
 * velocity scaled), operator feedback (through a minimal delay — Web Audio needs one in any
 * cycle), output low-pass, amp ADSR and the shared LFO.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, adsrStart, clamp, disconnectAll, midiHz, stopAll } from '../dsp.ts';
import { SynthCore } from './synthCore.ts';
import { NoteStack, VoicePool, voiceModeOf, type VoiceBase } from './voices.ts';

interface Algo {
  /** [modulator, target] (1-based operator numbers). */
  edges: [number, number][];
  carriers: number[];
  /** Operator with self feedback. */
  fb: number;
}

const ALGOS: Record<string, Algo> = {
  'Stack 9': { edges: [[9, 8], [8, 7], [7, 6], [6, 5], [5, 4], [4, 3], [3, 2], [2, 1]], carriers: [1], fb: 9 },
  '3×3 Stacks': { edges: [[3, 2], [2, 1], [6, 5], [5, 4], [9, 8], [8, 7]], carriers: [1, 4, 7], fb: 3 },
  'Twin Stacks': { edges: [[4, 3], [3, 2], [2, 1], [9, 8], [8, 7], [7, 6], [6, 5]], carriers: [1, 5], fb: 9 },
  'Bell Tree': { edges: [[2, 1], [3, 1], [4, 1], [6, 5], [7, 5], [9, 8]], carriers: [1, 5, 8], fb: 4 },
  'E-Piano': { edges: [[2, 1], [4, 3], [6, 5], [8, 7]], carriers: [1, 3, 5, 7, 9], fb: 2 },
  Brass: { edges: [[3, 2], [2, 1], [4, 1], [6, 5], [7, 1], [8, 1], [9, 5]], carriers: [1, 5], fb: 3 },
  'Bass Pair': { edges: [[2, 1], [3, 1], [4, 1], [6, 5], [7, 5]], carriers: [1, 5], fb: 2 },
  'Wide Parallel': { edges: [], carriers: [1, 2, 3, 4, 5, 6, 7, 8, 9], fb: 1 },
  'Feedback Chain': { edges: [[9, 8], [8, 7], [7, 6], [6, 5], [5, 4], [4, 3], [3, 2], [2, 1]], carriers: [1], fb: 9 },
};

class FmVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  oscs: { osc: OscillatorNode; ratio: number }[] = [];
  modGains: GainNode[] = [];
  nodes: AudioNode[] = [];
  amp!: GainNode;
  env = { a: 0.003, d: 0.8, s: 0.6, r: 0.5 };
  modEnv = { a: 0.002, d: 0.6, s: 0.3, r: 0.4 };
  constructor(public note: number, public startTime: number, private core: SynthCore) {}

  setPitch(note: number, t: number, glide: number): void {
    this.note = note;
    for (const e of this.oscs) {
      const f = midiHz(note) * e.ratio;
      if (glide > 0.003) e.osc.frequency.setTargetAtTime(f, t, glide / 3);
      else e.osc.frequency.setValueAtTime(f, t);
    }
  }

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    adsrRelease(this.amp.gain, t, 0, this.env.r);
    this.modGains.forEach((g) => adsrRelease(g.gain, t, 0, this.modEnv.r));
    this.endTime = t + SynthCore.tail(this.env.r);
    stopAll(this.endTime, ...this.oscs.map((o) => o.osc));
  }

  kill(t: number): void {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, ...this.oscs.map((o) => o.osc));
  }

  cleanup(): void {
    for (const e of this.oscs) {
      try {
        this.core.pitchDetune.disconnect(e.osc.detune);
      } catch {
        // already disconnected
      }
    }
    disconnectAll(...this.oscs.map((o) => o.osc), ...this.modGains, ...this.nodes, this.amp);
  }
}

export function fmEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const ops = clamp(Number(cfg.ops ?? 6), 2, 9);
  const core = new SynthCore(host, { trim: 1 });
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.value = host.p('cutoff', 14000);
  core.connect(lp);
  lp.connect(host.outs[0]);
  const pool = new VoicePool<FmVoice>(Number(cfg.maxVoices ?? 6));
  const stack = new NoteStack();
  let monoVoice: FmVoice | null = null;
  const mode = () => voiceModeOf(host.opt('voiceMode') || 'Poly');
  pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 6);

  function buildVoice(note: number, vel: number, t: number): FmVoice {
    const v = new FmVoice(note, t, core);
    const algo = ALGOS[host.opt('algorithm')] ?? ALGOS['Stack 9'];
    const f0 = midiHz(note);
    const bright = clamp(host.p('brightness', 0.5), 0, 1);
    const velScale = 1 - host.p('velMod', 0.6) + host.p('velMod', 0.6) * vel;
    v.modEnv = { a: 0.002, d: host.p('modDecay', 0.6), s: host.p('modSustain', 0.3), r: host.p('release', 0.5) };
    const mix = ctx.createGain();
    mix.gain.value = 1;
    v.nodes.push(mix);
    const osc: OscillatorNode[] = [];
    for (let i = 1; i <= ops; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const ratio = host.p(`ratio${i}`, 1);
      o.frequency.value = f0 * ratio;
      core.pitchDetune.connect(o.detune);
      osc[i] = o;
      v.oscs.push({ osc: o, ratio });
    }
    const valid = (n: number) => n >= 1 && n <= ops;
    for (const [m, c] of algo.edges) {
      if (!valid(m) || !valid(c)) continue;
      const level = clamp(host.p(`level${m}`, 0.5), 0, 1);
      // frequency deviation = index × modulator frequency
      const index = level * bright * 9 * velScale;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc[m].connect(g).connect(osc[c].frequency);
      adsrStart(g.gain, t, 0, index * f0 * host.p(`ratio${m}`, 1), index * f0 * host.p(`ratio${m}`, 1) * v.modEnv.s, v.modEnv);
      v.modGains.push(g);
    }
    const fbAmt = clamp(host.p('feedback', 0.15), 0, 1);
    if (fbAmt > 0.01 && valid(algo.fb)) {
      const d = ctx.createDelay(0.01);
      d.delayTime.value = 128 / ctx.sampleRate;
      const g = ctx.createGain();
      g.gain.value = fbAmt * f0 * host.p(`ratio${algo.fb}`, 1) * 1.5;
      osc[algo.fb].connect(d).connect(g).connect(osc[algo.fb].frequency);
      v.nodes.push(d, g);
    }
    const carriers = algo.carriers.filter(valid);
    for (const c of carriers) {
      const g = ctx.createGain();
      g.gain.value = (clamp(host.p(`level${c}`, 1), 0, 1) * 0.5) / Math.sqrt(carriers.length);
      osc[c].connect(g).connect(mix);
      v.nodes.push(g);
    }
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;
    mix.connect(v.amp).connect(core.bus);
    v.env = core.ampStart(v.amp.gain, t, vel);
    v.oscs.forEach((o) => o.osc.start(t));
    v.oscs[0].osc.onended = () => v.cleanup();
    return v;
  }

  return {
    noteOn(note, vel, t) {
      const m = mode();
      if (m.mono) {
        stack.push(note);
        if (monoVoice && monoVoice.releaseTime === null) {
          monoVoice.setPitch(note, t, host.p('glide', 0));
          if (!m.legato) monoVoice.env = core.ampStart(monoVoice.amp.gain, t, vel);
          return;
        }
        pool.makeRoom(t, ctx.currentTime);
        monoVoice = buildVoice(note, vel, t);
        pool.add(monoVoice);
        return;
      }
      pool.makeRoom(t, ctx.currentTime);
      pool.add(buildVoice(note, vel, t));
    },
    noteOff(note, t) {
      if (mode().mono) {
        const back = stack.remove(note);
        if (!monoVoice || monoVoice.releaseTime !== null) return;
        if (back !== null) {
          if (monoVoice.note === note) monoVoice.setPitch(back, t, host.p('glide', 0));
          return;
        }
        monoVoice.release(t);
        monoVoice = null;
        return;
      }
      pool.releaseNote(note, t);
    },
    allNotesOff(t) {
      stack.clear();
      monoVoice = null;
      pool.killAll(t);
    },
    onParam(key) {
      if (key === 'cutoff') {
        lp.frequency.setTargetAtTime(clamp(host.p('cutoff', 14000), 200, 20000), ctx.currentTime, 0.015);
        return;
      }
      if (core.onParam(key)) return;
      if (key === 'voiceMode') {
        stack.clear();
        monoVoice = null;
        pool.releaseAll(ctx.currentTime);
        pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 6);
      }
    },
    meter() {
      return { voices: pool.held().length };
    },
    dispose() {
      pool.killAll(ctx.currentTime);
      core.stop();
    },
  };
}
