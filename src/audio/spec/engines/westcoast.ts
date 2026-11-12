/**
 * West-coast engine ('westcoast'): complex oscillator (primary + modulator with FM / AM),
 * noise, wavefolder (timbre + symmetry), low-pass gate (vactrol-like strike envelope driving
 * a low-pass and / or VCA), a rise / fall function generator that can cycle (modulates fold
 * and FM index at audio rate) and a spring tank.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, clamp, disconnectAll, foldCurve, impulseResponse, midiHz, noiseSource, setSmooth, stopAll } from '../dsp.ts';
import { SynthCore } from './synthCore.ts';
import { NoteStack, VoicePool, voiceModeOf, type VoiceBase } from './voices.ts';

class WcVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  oscs: { osc: OscillatorNode; mult: number }[] = [];
  sources: AudioScheduledSourceNode[] = [];
  nodes: AudioNode[] = [];
  vca!: GainNode;
  lpf!: BiquadFilterNode;
  fn!: ConstantSourceNode;
  lpgBase = 80;
  lpgDecay = 0.35;
  constructor(public note: number, public startTime: number, private core: SynthCore) {}

  setPitch(note: number, t: number, glide: number): void {
    this.note = note;
    for (const e of this.oscs) {
      if (glide > 0.003) e.osc.frequency.setTargetAtTime(midiHz(note) * e.mult, t, glide / 3);
      else e.osc.frequency.setValueAtTime(midiHz(note) * e.mult, t);
    }
  }

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    const r = Math.max(0.03, this.lpgDecay * 0.6);
    adsrRelease(this.vca.gain, t, 0, r);
    adsrRelease(this.lpf.frequency, t, this.lpgBase, r);
    adsrRelease(this.fn.offset, t, 0, r);
    this.endTime = t + SynthCore.tail(r);
    stopAll(this.endTime, ...this.sources);
  }

  kill(t: number): void {
    this.vca.gain.cancelScheduledValues(t);
    this.vca.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, ...this.sources);
  }

  cleanup(): void {
    for (const e of this.oscs) {
      try {
        this.core.pitchDetune.disconnect(e.osc.detune);
      } catch {
        // already disconnected
      }
    }
    disconnectAll(...this.sources, ...this.nodes, this.vca, this.lpf);
  }
}

export function westcoastEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const core = new SynthCore(host, { trim: 0.55 });
  const out = host.outs[0];
  const dry = ctx.createGain();
  core.connect(dry);
  dry.connect(out);
  const spring = ctx.createConvolver();
  spring.buffer = impulseResponse(ctx, { seconds: 2.4, decay: 4.5, damping: 0.1, density: 0.45, early: 0.8, seed: 7 });
  const springWet = ctx.createGain();
  core.connect(spring);
  spring.connect(springWet).connect(out);
  const pool = new VoicePool<WcVoice>(Number(cfg.maxVoices ?? 4));
  const stack = new NoteStack();
  let monoVoice: WcVoice | null = null;
  let foldShape = foldCurve(1, host.p('symmetry', 0));
  const mode = () => voiceModeOf(host.opt('voiceMode') || 'Poly');
  pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 4);

  const syncSpring = () => setSmooth(springWet.gain, host.p('spring', 0.1) * 0.8, ctx, 0.03);
  syncSpring();

  /** Schedules the function generator: rise → fall, repeated while cycling. */
  const scheduleFn = (param: AudioParam, t: number) => {
    const rise = Math.max(0.001, host.p('rise', 0.002));
    const fall = Math.max(0.005, host.p('fall', 0.4));
    param.cancelScheduledValues(t);
    param.setValueAtTime(0, t);
    let at = t;
    const cycles = host.p('cycle', 0) >= 0.5 ? Math.min(400, Math.ceil(12 / (rise + fall))) : 1;
    for (let i = 0; i < cycles; i++) {
      param.linearRampToValueAtTime(1, at + rise);
      param.linearRampToValueAtTime(0, at + rise + fall);
      at += rise + fall;
    }
  };

  function buildVoice(note: number, vel: number, t: number): WcVoice {
    const v = new WcVoice(note, t, core);
    const f0 = midiHz(note);
    const ratio = host.p('modRatio', 2);
    const prim = ctx.createOscillator();
    const wave = host.opt('oscWave');
    prim.type = wave === 'Tri' ? 'triangle' : wave === 'Saw' ? 'sawtooth' : 'sine';
    prim.frequency.value = f0;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f0 * ratio;
    for (const [o, m] of [[prim, 1], [mod, ratio]] as const) {
      core.pitchDetune.connect(o.detune);
      v.oscs.push({ osc: o, mult: m });
      v.sources.push(o);
    }
    // function generator (0..1 control signal)
    v.fn = ctx.createConstantSource();
    v.fn.offset.value = 0;
    v.sources.push(v.fn);
    scheduleFn(v.fn.offset, t);

    // FM: index + function → deviation
    const fm = ctx.createGain();
    fm.gain.value = host.p('fmIndex', 0.3) * f0 * ratio * 4;
    mod.connect(fm).connect(prim.frequency);
    const fnFm = ctx.createGain();
    fnFm.gain.value = host.p('envFm', 0.3) * f0 * ratio * 4;
    const fmEnvVca = ctx.createGain();
    fmEnvVca.gain.value = 0;
    mod.connect(fmEnvVca).connect(prim.frequency);
    v.fn.connect(fnFm).connect(fmEnvVca.gain);

    // AM
    const am = host.p('amDepth', 0);
    const ring = ctx.createGain();
    ring.gain.value = 1 - am / 2;
    const amG = ctx.createGain();
    amG.gain.value = am / 2;
    mod.connect(amG).connect(ring.gain);
    prim.connect(ring);

    const mix = ctx.createGain();
    ring.connect(mix);
    const nz = host.p('noise', 0);
    if (nz > 0.001) {
      const n = noiseSource(ctx);
      const g = ctx.createGain();
      g.gain.value = nz * 0.4;
      n.connect(g).connect(mix);
      v.sources.push(n);
      v.nodes.push(g);
    }

    // wavefolder: input drive sets how hard it folds; the function adds more
    const drive = ctx.createGain();
    drive.gain.value = 0.15 + host.p('fold', 0.35) * 0.85;
    const fnFold = ctx.createGain();
    fnFold.gain.value = host.p('envFold', 0.4) * 0.8;
    v.fn.connect(fnFold).connect(drive.gain);
    const shaper = ctx.createWaveShaper();
    shaper.curve = foldShape;
    shaper.oversample = '2x';
    mix.connect(drive).connect(shaper);

    // low-pass gate
    const lpgMode = host.opt('lpgMode') || 'Both';
    v.lpgDecay = host.p('lpgDecay', 0.35);
    v.lpf = ctx.createBiquadFilter();
    v.lpf.type = 'lowpass';
    v.lpf.Q.value = 0.5 + host.p('lpgRes', 0.15) * 10;
    v.vca = ctx.createGain();
    v.vca.gain.value = 0;
    const strike = 0.35 + 0.65 * vel;
    const sustain = host.p('cycle', 0) >= 0.5 ? 0.45 : 0.25;
    if (lpgMode === 'VCA') {
      v.lpf.frequency.value = 18000;
    } else {
      v.lpgBase = 60;
      v.lpf.frequency.setValueAtTime(60, t);
      v.lpf.frequency.exponentialRampToValueAtTime(clamp(400 + 14000 * strike, 100, 18000), t + 0.004);
      v.lpf.frequency.setTargetAtTime(Math.max(120, 6000 * strike * sustain), t + 0.004, v.lpgDecay / 3);
    }
    if (lpgMode === 'LP') {
      v.vca.gain.setValueAtTime(0, t);
      v.vca.gain.linearRampToValueAtTime(0.7, t + 0.003);
    } else {
      v.vca.gain.setValueAtTime(0, t);
      v.vca.gain.linearRampToValueAtTime(0.75 * strike, t + 0.003);
      v.vca.gain.setTargetAtTime(0.75 * strike * sustain, t + 0.003, v.lpgDecay / 3);
    }
    shaper.connect(v.lpf).connect(v.vca).connect(core.bus);
    v.nodes.push(fm, fnFm, fmEnvVca, ring, amG, mix, drive, fnFold, shaper);
    v.sources.forEach((s) => s.start(t));
    prim.onended = () => v.cleanup();
    return v;
  }

  return {
    noteOn(note, vel, t) {
      const m = mode();
      if (m.mono) {
        stack.push(note);
        if (monoVoice && monoVoice.releaseTime === null) {
          monoVoice.setPitch(note, t, host.p('glide', 0));
          if (!m.legato) scheduleFn(monoVoice.fn.offset, t);
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
      if (key === 'spring') syncSpring();
      else if (key === 'symmetry') foldShape = foldCurve(1, host.p('symmetry', 0));
      else if (key === 'voiceMode') {
        stack.clear();
        monoVoice = null;
        pool.releaseAll(ctx.currentTime);
        pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 4);
      } else core.onParam(key);
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
