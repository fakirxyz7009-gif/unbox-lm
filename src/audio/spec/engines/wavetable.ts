/**
 * Wavetable engine ('wavetable'): two table oscillators (A/B) whose index morphs between
 * neighbouring frames (crossfaded PeriodicWaves, re-chosen when the index moves), A⇄B mix,
 * motion (Malström-style index sweep), unison, LFO → index, any spec filter, amp ADSR.
 * Additive mode (Parsec): one oscillator whose spectrum is built from partials / tilt /
 * odd-even / spectral filter, plus a stretched copy for inharmonic shimmer.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, clamp, disconnectAll, harmonicWave, midiHz, setSmooth, stopAll } from '../dsp.ts';
import { SynthCore, type FilterVoice } from './synthCore.ts';
import { NoteStack, VoicePool, voiceModeOf, type VoiceBase } from './voices.ts';

const H = 64;
const FRAMES = 8;

const gauss = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) * (x - mu)) / (2 * sd * sd));
const VOWEL_F1 = [800, 400, 350, 450, 325];
const VOWEL_F2 = [1150, 1600, 2300, 800, 700];

/** Harmonic amplitudes of frame f (0..7) of a named table. */
function frameAmps(table: string, f: number): Float32Array {
  const a = new Float32Array(H);
  const x = f / (FRAMES - 1);
  for (let k = 1; k < H; k++) {
    let v = 0;
    switch (table) {
      case 'Analog': {
        const sine = k === 1 ? 1 : 0;
        const tri = k % 2 ? ((k % 4 === 1 ? 1 : -1) * 1) / (k * k) : 0;
        const saw = 1 / k;
        const sq = k % 2 ? 1 / k : 0;
        const seg = x * 3;
        v = seg < 1 ? sine * (1 - seg) + Math.abs(tri) * seg : seg < 2 ? Math.abs(tri) * (2 - seg) + saw * (seg - 1) : saw * (3 - seg) + sq * (seg - 2);
        break;
      }
      case 'PWM': {
        const w = 0.5 - x * 0.45;
        v = Math.abs((2 / (k * Math.PI)) * Math.sin(k * Math.PI * w));
        break;
      }
      case 'Vocal':
      case 'Choir':
      case 'Formant': {
        const vi = x * 4;
        const i0 = Math.floor(vi);
        const fr = vi - i0;
        const i1 = Math.min(4, i0 + 1);
        const f1 = VOWEL_F1[i0] * (1 - fr) + VOWEL_F1[i1] * fr;
        const f2 = VOWEL_F2[i0] * (1 - fr) + VOWEL_F2[i1] * fr;
        const fund = table === 'Choir' ? 220 : 130;
        const hz = k * fund;
        const sd = table === 'Formant' ? 90 : 160;
        v = (gauss(hz, f1, sd) + 0.7 * gauss(hz, f2, sd * 1.4) + 0.15 * gauss(hz, 2900, 300)) / Math.sqrt(k) + (k === 1 ? 0.25 : 0);
        break;
      }
      case 'Digital':
        v = (k % (f + 2) === 0 || k === 1 ? 1 : 0.15 * ((k * 7 + f * 3) % 5 === 0 ? 1 : 0)) / Math.pow(k, 0.6);
        break;
      case 'Bell':
        v = [1, 3, 5, 8, 11, 14, 19, 23].includes(k) ? 1 / Math.pow(k, 0.5 - x * 0.3) : 0;
        if (k > 8 + f * 6) v *= 0.2;
        break;
      case 'Organ': {
        const bars = [1, 2, 3, 4, 6, 8, 10, 12, 16];
        const regs = [
          [1, 1, 0, 0, 0, 0, 0, 0, 0],
          [1, 1, 1, 0, 0, 0, 0, 0, 0],
          [1, 1, 1, 1, 0, 1, 0, 0, 0],
          [1, 0.6, 1, 0.8, 0.5, 1, 0, 0, 0.4],
          [1, 1, 1, 1, 1, 1, 1, 1, 1],
          [0.6, 1, 0.3, 1, 0, 1, 0, 1, 0],
          [1, 0, 1, 0, 1, 0, 1, 0, 1],
          [0.4, 1, 1, 1, 1, 1, 1, 1, 1],
        ];
        const bi = bars.indexOf(k);
        v = bi >= 0 ? regs[f][bi] / Math.sqrt(k) : 0;
        break;
      }
      case 'Growl': {
        const notch = 3 + f * 2;
        v = (1 / k) * (0.15 + 0.85 * Math.abs(Math.sin((k / notch) * Math.PI)));
        break;
      }
      case 'Glass':
        v = k === 1 ? 1 : k % (2 + (f % 3)) === 0 && k < 20 + f * 4 ? 0.6 / Math.sqrt(k) : 0;
        break;
      case 'Strings':
        v = (1 / k) * gauss(k, 1, 6 + x * 16) * (1 + 0.6 * gauss(k * 196, 1100, 400));
        break;
      case 'Metal':
        v = (k % 2 ? 1 : 0.3) * (k > 4 && k % (3 + f) === 0 ? 1.2 : 0.5) / Math.pow(k, 0.7);
        break;
      default:
        v = 1 / k;
    }
    a[k] = v;
  }
  return a;
}

function tableWave(ctx: BaseAudioContext, table: string, frame: number): PeriodicWave {
  const f = clamp(Math.round(frame), 0, FRAMES - 1);
  return harmonicWave(ctx, `wt:${table}:${f}`, frameAmps(table, f));
}

function additiveAmps(h: SpecHost): { key: string; amps: Float32Array } {
  const n = Math.round(clamp(h.p('harmonics', 24), 1, 63));
  const tilt = h.p('tilt', -0.3);
  const oe = h.p('oddEven', 0);
  const kc = Math.max(1, h.p('specCutoff', 0.8) * n);
  const pk = h.p('specRes', 0.2);
  const key = `add:${n}:${tilt.toFixed(2)}:${oe.toFixed(2)}:${kc.toFixed(1)}:${pk.toFixed(2)}`;
  const amps = new Float32Array(H);
  for (let k = 1; k <= n; k++) {
    let v = Math.pow(k, -(1 + tilt));
    if (k > 1) v *= k % 2 === 0 ? 1 + oe : 1 - oe;
    v *= 1 / (1 + Math.pow(k / kc, 4)) + pk * 2 * gauss(k, kc, 1.5);
    amps[k] = Math.max(0, v);
  }
  return { key, amps };
}

interface TableOsc {
  table: 'A' | 'B';
  lo: OscillatorNode;
  hi: OscillatorNode;
  gLo: GainNode;
  gHi: GainNode;
  frame: number;
}

class WtVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  oscs: { osc: OscillatorNode; mult: number }[] = [];
  tables: TableOsc[] = [];
  sources: AudioScheduledSourceNode[] = [];
  nodes: AudioNode[] = [];
  /** AudioParams the shared index-LFO feeds (must be disconnected explicitly). */
  lfoParams: AudioParam[] = [];
  filter!: FilterVoice;
  amp!: GainNode;
  gA?: GainNode;
  gB?: GainNode;
  env = { a: 0.01, d: 0.3, s: 0.8, r: 0.5 };
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
    adsrRelease(this.amp.gain, t, 0, this.env.r);
    this.filter.release(t);
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
    this.filter.stop(0);
    disconnectAll(...this.sources, ...this.nodes, this.amp);
  }
}

export function wavetableEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const additive = cfg.additive === true;
  const core = new SynthCore(host, { trim: 0.55 });
  core.connect(host.outs[0]);
  const pool = new VoicePool<WtVoice>(Number(cfg.maxVoices ?? 8));
  const stack = new NoteStack();
  let monoVoice: WtVoice | null = null;
  // LFO → index: a dedicated slow oscillator so index wobble works without the core LFO routing
  const posLfo = ctx.createOscillator();
  posLfo.frequency.value = host.p('lfoRate', 0.8);
  const posLfoAmt = ctx.createGain();
  posLfoAmt.gain.value = 0;
  posLfo.connect(posLfoAmt);
  posLfo.start();
  let motionPhase = 0;
  let motionTimer: number | null = null;

  const mode = () => voiceModeOf(host.opt('voiceMode') || 'Poly');
  pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 8);

  const tableIndex = (which: 'A' | 'B') => {
    const base = host.p(which === 'A' ? 'posA' : 'posB', 0.3);
    const motion = host.spec.params.some((p) => p.key === 'motion') ? host.p('motionDepth', 0) * 0.5 * Math.sin(motionPhase) : 0;
    return clamp(base + motion, 0, 1) * (FRAMES - 1);
  };

  /** Re-picks frame pairs and crossfades for a voice's table oscillators. */
  const applyIndex = (v: WtVoice, t: number) => {
    for (const to of v.tables) {
      const idx = tableIndex(to.table);
      const lo = Math.floor(idx);
      const fr = idx - lo;
      if (lo !== to.frame) {
        const table = host.opt(to.table === 'A' ? 'tableA' : 'tableB') || 'Analog';
        to.lo.setPeriodicWave(tableWave(ctx, table, lo));
        to.hi.setPeriodicWave(tableWave(ctx, table, lo + 1));
        to.frame = lo;
      }
      setSmooth(to.gLo.gain, 1 - fr, ctx, 0.02);
      setSmooth(to.gHi.gain, fr, ctx, 0.02);
    }
    void t;
  };

  const applyAdditive = (v: WtVoice) => {
    const { key, amps } = additiveAmps(host);
    const wave = harmonicWave(ctx, key, amps);
    v.oscs.forEach((o) => o.osc.setPeriodicWave(wave));
  };

  function buildVoice(note: number, vel: number, t: number): WtVoice {
    const v = new WtVoice(note, t, core);
    const unison = Number(host.opt('unison') || '1');
    const spread = host.p('unisonDetune', 0.3) * 35;
    const f0 = midiHz(note);
    const mix = ctx.createGain();
    v.nodes.push(mix);

    const addOsc = (mult: number, detune: number, dest: AudioNode, wave: PeriodicWave): OscillatorNode => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = f0 * mult;
      osc.detune.value = detune;
      core.pitchDetune.connect(osc.detune);
      osc.connect(dest);
      v.oscs.push({ osc, mult });
      v.sources.push(osc);
      return osc;
    };

    if (additive) {
      const { key, amps } = additiveAmps(host);
      const wave = harmonicWave(ctx, key, amps);
      for (let u = 0; u < unison; u++) {
        const g = ctx.createGain();
        g.gain.value = 0.6 / Math.sqrt(unison);
        g.connect(mix);
        v.nodes.push(g);
        addOsc(1, unison === 1 ? 0 : (u - (unison - 1) / 2) * spread, g, wave);
      }
      const stretch = host.p('stretch', 0);
      if (stretch > 0.01) {
        const g = ctx.createGain();
        g.gain.value = stretch * 0.4;
        g.connect(mix);
        v.nodes.push(g);
        addOsc(1, 7 + stretch * 30, g, wave);
      }
    } else {
      const dual = host.spec.params.some((p) => p.key === 'tableB');
      const mixAB = clamp(host.p('mixAB', 0.5), 0, 1);
      for (const which of dual ? (['A', 'B'] as const) : (['A'] as const)) {
        const layer = ctx.createGain();
        layer.gain.value = !dual ? 1 : which === 'A' ? 1 - mixAB : mixAB;
        layer.connect(mix);
        v.nodes.push(layer);
        if (which === 'A') v.gA = layer;
        else v.gB = layer;
        const table = host.opt(which === 'A' ? 'tableA' : 'tableB') || 'Analog';
        const mult = which === 'A' ? Math.pow(2, host.p('octA', 0)) : Math.pow(2, host.p('semiB', 0) / 12);
        const det = which === 'B' ? host.p('detuneB', 0) : 0;
        for (let u = 0; u < unison; u++) {
          const uni = unison === 1 ? 0 : (u - (unison - 1) / 2) * spread;
          const gLo = ctx.createGain();
          const gHi = ctx.createGain();
          const sum = ctx.createGain();
          sum.gain.value = 0.55 / Math.sqrt(unison);
          gLo.connect(sum);
          gHi.connect(sum);
          sum.connect(layer);
          // LFO → index (audio-rate crossfade wobble)
          posLfoAmt.connect(gHi.gain);
          v.lfoParams.push(gHi.gain);
          const inv = ctx.createGain();
          inv.gain.value = -1;
          posLfoAmt.connect(inv).connect(gLo.gain);
          v.nodes.push(gLo, gHi, sum, inv);
          const lo = addOsc(mult, det + uni, gLo, tableWave(ctx, table, 0));
          const hi = addOsc(mult, det + uni, gHi, tableWave(ctx, table, 1));
          v.tables.push({ table: which, lo, hi, gLo, gHi, frame: -1 });
        }
      }
      applyIndex(v, t);
    }

    v.filter = core.makeFilter(t, note, vel);
    mix.connect(v.filter.input);
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;
    v.filter.output.connect(v.amp).connect(core.bus);
    v.env = core.ampStart(v.amp.gain, t, vel);
    v.sources.forEach((s) => s.start(t));
    v.sources[0].onended = () => {
      v.cleanup();
      for (const target of [...v.lfoParams, ...v.nodes]) {
        try {
          posLfoAmt.disconnect(target as AudioNode);
        } catch {
          // not a target
        }
      }
    };
    ensureMotion();
    return v;
  }

  function ensureMotion(): void {
    const hasMotion = host.spec.params.some((p) => p.key === 'motion') && host.p('motionDepth', 0) > 0.01;
    if (!hasMotion || motionTimer !== null || typeof window === 'undefined' || !(ctx instanceof AudioContext)) return;
    let last = performance.now();
    motionTimer = window.setInterval(() => {
      const now = performance.now();
      motionPhase += ((now - last) / 1000) * host.p('motion', 0.6) * Math.PI * 2;
      last = now;
      pool.gc(ctx.currentTime);
      if (!pool.list.length) {
        if (motionTimer !== null) clearInterval(motionTimer);
        motionTimer = null;
        return;
      }
      pool.list.forEach((v) => applyIndex(v, ctx.currentTime));
    }, 33);
  }

  const syncPosLfo = () => {
    setSmooth(posLfo.frequency, host.p('lfoRate', 0.8), ctx, 0.05);
    setSmooth(posLfoAmt.gain, host.p('lfoPos', 0) * 0.5, ctx, 0.05);
  };
  syncPosLfo();

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
      if (key === 'lfoRate' || key === 'lfoPos') syncPosLfo();
      if (core.onParam(key)) return;
      const now = ctx.currentTime;
      if (key === 'posA' || key === 'posB' || key === 'tableA' || key === 'tableB') {
        if (key.startsWith('table')) pool.list.forEach((v) => v.tables.forEach((t) => (t.frame = -1)));
        pool.list.forEach((v) => applyIndex(v, now));
      } else if (key === 'mixAB') {
        const m = clamp(host.p('mixAB', 0.5), 0, 1);
        pool.list.forEach((v) => {
          if (v.gA) setSmooth(v.gA.gain, 1 - m, ctx, 0.02);
          if (v.gB) setSmooth(v.gB.gain, m, ctx, 0.02);
        });
      } else if (additive && ['harmonics', 'tilt', 'oddEven', 'specCutoff', 'specRes'].includes(key)) {
        pool.list.forEach((v) => applyAdditive(v));
      } else if (key === 'resonance') {
        pool.list.forEach((v) => v.filter.setRes(clamp(host.p('resonance', 0.2), 0, 1), now));
      } else if (key === 'motionDepth' || key === 'motion') ensureMotion();
      else if (key === 'voiceMode') {
        stack.clear();
        monoVoice = null;
        pool.releaseAll(now);
        pool.max = mode().mono ? 1 : Number(cfg.maxVoices ?? 8);
      }
    },
    meter() {
      return { voices: pool.held().length, index: host.p('posA', 0) };
    },
    dispose() {
      if (motionTimer !== null) clearInterval(motionTimer);
      pool.killAll(ctx.currentTime);
      try {
        posLfo.stop();
      } catch {
        // stopped
      }
      core.stop();
    },
  };
}
