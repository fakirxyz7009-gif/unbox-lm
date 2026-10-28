/**
 * Virtual-analog engine ('poly'): 2–3 oscillators + sub + noise, cross-mod (osc 2 → osc 1 FM),
 * any spec filter with envelope, amp ADSR, LFO, poly / mono / legato / unison voice modes with
 * glide, optional second layer with morph (Polytone), analog drift (Prophet), Juno chorus,
 * spring reverb (Grandmother) and delay / reverb FX (Minilogue).
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, buildChorus, clamp, disconnectAll, impulseResponse, midiHz, noiseSource, setSmooth, setWave, stopAll } from '../dsp.ts';
import { SynthCore, type FilterVoice } from './synthCore.ts';
import { NoteStack, VoicePool, voiceModeOf, type VoiceBase } from './voices.ts';

interface OscEntry {
  osc: OscillatorNode;
  mult: number;
}

class PolyVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  oscs: OscEntry[] = [];
  sources: AudioScheduledSourceNode[] = [];
  nodes: AudioNode[] = [];
  filters: FilterVoice[] = [];
  amp!: GainNode;
  layerA?: GainNode;
  layerB?: GainNode;
  env = { a: 0.005, d: 0.3, s: 0.7, r: 0.3 };

  constructor(public note: number, public startTime: number, private core: SynthCore) {}

  setPitch(note: number, t: number, glide: number): void {
    this.note = note;
    const f = midiHz(note);
    for (const e of this.oscs) {
      if (glide > 0.003) e.osc.frequency.setTargetAtTime(f * e.mult, t, glide / 3);
      else e.osc.frequency.setValueAtTime(f * e.mult, t);
    }
  }

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    adsrRelease(this.amp.gain, t, 0, this.env.r);
    this.filters.forEach((f) => f.release(t));
    this.endTime = t + SynthCore.tail(this.env.r);
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
    for (const e of this.oscs) {
      try {
        this.core.pitchDetune.disconnect(e.osc.detune);
      } catch {
        // already disconnected
      }
    }
    this.filters.forEach((f) => f.stop(0));
    disconnectAll(...this.sources, ...this.nodes, this.amp);
  }
}

export function polyEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const core = new SynthCore(host, { trim: 0.4 });
  const pool = new VoicePool<PolyVoice>(Number(cfg.maxVoices ?? 8));
  const stack = new NoteStack();
  let monoVoice: PolyVoice | null = null;

  // ---- FX chain: core → fxIn → (dry) out, + chorus / spring / delay / reverb sends
  const out = host.outs[0];
  const fxIn = ctx.createGain();
  core.connect(fxIn);
  const dry = ctx.createGain();
  fxIn.connect(dry).connect(out);
  let chorus: ReturnType<typeof buildChorus> | null = null;
  let chorusWet: GainNode | null = null;
  if (host.spec.params.some((p) => p.key === 'chorus')) {
    chorusWet = ctx.createGain();
    chorus = buildChorus(ctx, fxIn, chorusWet, { voices: 2, delayMs: 3.5, depthMs: 1.8, rate: 0.5, spread: 1 });
    chorusWet.connect(out);
  }
  let revWet: GainNode | null = null;
  if (host.spec.params.some((p) => p.key === 'reverb' || p.key === 'fxReverb')) {
    const conv = ctx.createConvolver();
    conv.buffer = impulseResponse(ctx, cfg.ladder ? { seconds: 2.2, decay: 5, damping: 0.15, density: 0.6, early: 0.6 } : { seconds: 2.8, decay: 3.5, damping: 0.45 });
    revWet = ctx.createGain();
    revWet.gain.value = 0;
    fxIn.connect(conv).connect(revWet).connect(out);
  }
  let delWet: GainNode | null = null;
  let delay: DelayNode | null = null;
  if (host.spec.params.some((p) => p.key === 'fxDelay')) {
    delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5000;
    delWet = ctx.createGain();
    fxIn.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(delWet).connect(out);
  }

  const syncFx = () => {
    if (chorus && chorusWet) {
      const mode = host.opt('chorus');
      const on = mode !== 'Off' && mode !== '';
      const rate = mode === 'II' ? 0.83 : mode === 'I+II' ? 1.1 : 0.51;
      const depth = mode === 'II' ? 2.6 : mode === 'I+II' ? 1.2 : 1.7;
      chorus.set(rate, depth, mode === 'I+II' ? 2.4 : 3.5);
      setSmooth(chorusWet.gain, on ? 0.7 : 0, ctx, 0.03);
      setSmooth(dry.gain, on ? 0.75 : 1, ctx, 0.03);
    }
    if (revWet) setSmooth(revWet.gain, host.p('reverb', host.p('fxReverb', 0)) * 0.9, ctx, 0.03);
    if (delWet && delay) {
      setSmooth(delWet.gain, host.p('fxDelay', 0) * 0.7, ctx, 0.03);
      setSmooth(delay.delayTime, (60 / host.clock.bpm()) * 0.75, ctx, 0.05);
    }
  };
  syncFx();

  const mode = () => voiceModeOf(host.opt('voiceMode') || 'Poly');

  function buildVoice(note: number, vel: number, t: number): PolyVoice {
    const v = new PolyVoice(note, t, core);
    const unison = mode().unison ? 3 : 1;
    const spread = host.p('unisonDetune', 0.25) * 30;
    const drift = cfg.drift ? (Math.random() * 2 - 1) * Number(cfg.drift) * 6 : 0;
    const pw = host.p('pw', 0.5);
    const f0 = midiHz(note);
    const mixA = ctx.createGain();
    v.nodes.push(mixA);

    const addOsc = (wave: string, mult: number, detune: number, level: number, dest: AudioNode): OscillatorNode[] => {
      const made: OscillatorNode[] = [];
      for (let u = 0; u < unison; u++) {
        const osc = ctx.createOscillator();
        setWave(osc, wave, ctx, pw);
        osc.frequency.value = f0 * mult;
        const uni = unison === 1 ? 0 : (u - (unison - 1) / 2) * spread;
        osc.detune.value = detune + drift + uni;
        core.pitchDetune.connect(osc.detune);
        const g = ctx.createGain();
        g.gain.value = level / Math.sqrt(unison);
        if (unison > 1) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = (u / (unison - 1)) * 2 - 1;
          osc.connect(g).connect(pan).connect(dest);
          v.nodes.push(pan);
        } else osc.connect(g).connect(dest);
        v.nodes.push(g);
        v.oscs.push({ osc, mult });
        v.sources.push(osc);
        made.push(osc);
      }
      return made;
    };

    const osc1 = addOsc(host.opt('osc1Wave') || 'Saw', Math.pow(2, host.p('osc1Oct', 0)), 0, 0.55, mixA);
    const osc2 = addOsc(
      host.opt('osc2Wave') || 'Square',
      Math.pow(2, host.p('osc2Oct', 0) + host.p('osc2Semi', 0) / 12),
      host.p('osc2Detune', 0),
      host.p('osc2Level', 0.7) * 0.55,
      mixA
    );
    if (host.spec.params.some((p) => p.key === 'osc3Wave')) {
      addOsc(host.opt('osc3Wave') || 'Tri', Math.pow(2, host.p('osc3Oct', -1)), host.p('osc3Detune', 0), host.p('osc3Level', 0.5) * 0.55, mixA);
    }
    const sub = host.p('subLevel', 0);
    if (sub > 0.001) addOsc('Square', Math.pow(2, host.p('osc1Oct', 0) - 1), 0, sub * 0.5, mixA);
    const nz = host.p('noiseLevel', 0);
    if (nz > 0.001) {
      const n = noiseSource(ctx);
      const g = ctx.createGain();
      g.gain.value = nz * 0.35;
      n.connect(g).connect(mixA);
      v.nodes.push(g);
      v.sources.push(n);
    }
    const xmod = host.p('xmod', 0);
    if (xmod > 0.001 && osc2[0]) {
      const fm = ctx.createGain();
      fm.gain.value = xmod * f0 * 3;
      osc2[0].connect(fm);
      osc1.forEach((o) => fm.connect(o.frequency));
      v.nodes.push(fm);
    }

    const fa = core.makeFilter(t, note, vel);
    v.filters.push(fa);
    mixA.connect(fa.input);
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;

    if (host.spec.params.some((p) => p.key === 'morph')) {
      const morph = clamp(host.p('morph', 0.35), 0, 1);
      v.layerA = ctx.createGain();
      v.layerA.gain.value = 1 - morph;
      fa.output.connect(v.layerA).connect(v.amp);
      const mixB = ctx.createGain();
      v.nodes.push(mixB);
      addOsc(host.opt('bWave') || 'Sine', Math.pow(2, host.p('bOct', 1)), host.p('bDetune', 0), 0.6, mixB);
      const fb = core.makeFilter(t, note, vel, { cutoff: host.p('bCutoff', 5000) });
      v.filters.push(fb);
      mixB.connect(fb.input);
      v.layerB = ctx.createGain();
      v.layerB.gain.value = morph;
      fb.output.connect(v.layerB).connect(v.amp);
      v.nodes.push(v.layerA, v.layerB);
    } else {
      fa.output.connect(v.amp);
    }
    v.amp.connect(core.bus);
    v.env = core.ampStart(v.amp.gain, t, vel);
    v.sources.forEach((s) => s.start(t));
    v.sources[0].onended = () => v.cleanup();
    return v;
  }

  return {
    noteOn(note, vel, t) {
      const m = mode();
      const glide = host.p('glide', 0);
      if (m.mono) {
        stack.push(note);
        if (monoVoice && monoVoice.releaseTime === null) {
          monoVoice.setPitch(note, t, glide);
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
      if (core.onParam(key)) return;
      if (key === 'resonance') {
        const r = clamp(host.p('resonance', 0.2), 0, 1);
        pool.list.forEach((v) => v.filters[0]?.setRes(r, ctx.currentTime));
      } else if (key === 'morph') {
        const m = clamp(host.p('morph', 0.35), 0, 1);
        pool.list.forEach((v) => {
          if (v.layerA) setSmooth(v.layerA.gain, 1 - m, ctx, 0.02);
          if (v.layerB) setSmooth(v.layerB.gain, m, ctx, 0.02);
        });
      } else if (key === 'chorus' || key === 'reverb' || key === 'fxDelay' || key === 'fxReverb') syncFx();
      else if (key === 'voiceMode') {
        stack.clear();
        monoVoice = null;
        pool.releaseAll(ctx.currentTime);
        pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 8);
      }
    },
    meter() {
      return { voices: pool.held().length };
    },
    dispose() {
      pool.killAll(ctx.currentTime);
      chorus?.stop();
      core.stop();
    },
  };
}
