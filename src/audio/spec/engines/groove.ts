/**
 * Groovebox engine ('groove'): MPC / Force / Maschine+ / Octatrack / Digitakt / MC-707 /
 * Circuit / Play+ / Kong / Umpf.
 *  - Pads play rendered kit one-shots (sourceLibrary.kitSources) or the user's own samples
 *    (loadSample(padIndex)), with per-pad Tune / Decay / Tone / Level / Pan and choke groups.
 *  - Note Repeat retriggers held pads on the song grid (1/4 … 1/32, triplets).
 *  - Master: resonant low-pass, compressor, "Vintage" (bit / band-limit / grit, MPC60-style),
 *    Octatrack crossfader (scene B = darker, pitched down), optional synth track for notes
 *    from C4 up.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, bitCurve, clamp, disconnectAll, midiHz, satCurve, setSmooth, setWave, stopAll } from '../dsp.ts';
import { padIndexForNote } from './drums.ts';
import { kitSources } from './sourceLibrary.ts';
import { VoicePool, type VoiceBase } from './voices.ts';

const REPEAT16: Record<string, number> = { '1/4': 4, '1/8': 2, '1/8T': 4 / 3, '1/16': 1, '1/16T': 2 / 3, '1/32': 0.5 };

interface HeldPad {
  note: number;
  vel: number;
  start: number;
  end: number;
  next: number;
}

class SynthVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  osc!: OscillatorNode;
  amp!: GainNode;
  filt!: BiquadFilterNode;
  constructor(public note: number, public startTime: number) {}
  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    adsrRelease(this.amp.gain, t, 0, 0.12);
    this.endTime = t + 0.3;
    stopAll(this.endTime, this.osc);
  }
  kill(t: number): void {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, this.osc);
  }
}

export function grooveEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pads = host.spec.pads ?? [];
  const cfg = host.cfg;
  // master chain
  const padBus = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const vintageDry = ctx.createGain();
  const vintageWet = ctx.createGain();
  const crush = ctx.createWaveShaper();
  const band = ctx.createBiquadFilter();
  band.type = 'lowpass';
  band.frequency.value = 9000;
  const grit = ctx.createWaveShaper();
  grit.curve = satCurve(0.25);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.15;
  const makeup = ctx.createGain();
  padBus.connect(lp);
  lp.connect(vintageDry).connect(comp);
  lp.connect(crush).connect(band).connect(grit).connect(vintageWet).connect(comp);
  comp.connect(makeup).connect(host.outs[0]);

  let kit: AudioBuffer[] = [];
  const user = new Map<number, AudioBuffer>();
  const userNames: Record<number, string> = {};
  let loading: Promise<void> = Promise.resolve();
  const chokes = new Map<number, { g: GainNode; end: number }[]>();
  const held: HeldPad[] = [];
  const synthPool = new VoicePool<SynthVoice>(6);
  let timer: number | null = null;
  let lastPad = -1;
  let lastAt = 0;
  const live = typeof window !== 'undefined' && ctx instanceof AudioContext;

  const loadKit = () => {
    const name = host.opt('kit') || 'Boom Bap';
    loading = kitSources(ctx.sampleRate, name, pads).then((srcs) => {
      kit = srcs.map((s) => s.buffer);
      host.changed();
    });
  };
  loadKit();

  const sync = () => {
    const x = clamp(host.p('xfade', 0), 0, 1);
    setSmooth(lp.frequency, clamp(host.p('cutoff', 20000) * (1 - x * 0.85), 60, 20000), ctx, 0.02);
    setSmooth(lp.Q, 0.5 + host.p('resonance', 0.1) * 14, ctx, 0.02);
    const v = clamp(host.p('lofi', 0), 0, 1);
    crush.curve = v > 0.02 ? bitCurve(16 - v * 8) : null;
    setSmooth(band.frequency, 16000 - v * 9000, ctx, 0.03);
    setSmooth(vintageWet.gain, v, ctx, 0.03);
    setSmooth(vintageDry.gain, 1 - v, ctx, 0.03);
    const c = clamp(host.p('compress', 0.25), 0, 1);
    setSmooth(comp.threshold, -c * 28, ctx, 0.03);
    setSmooth(comp.ratio, 1 + c * 6, ctx, 0.03);
    setSmooth(makeup.gain, 1 + c * 0.8, ctx, 0.03);
  };
  sync();

  function playPad(i: number, vel: number, t: number): void {
    const buf = user.get(i) ?? kit[i];
    if (!buf) return;
    const n = i + 1;
    const x = clamp(host.p('xfade', 0), 0, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (host.p(`p${n}Tune`, 0) - x * 7) / 12);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = clamp(400 * Math.pow(2, host.p(`p${n}Tone`, 0.5) * 5.6), 200, 20000);
    const g = ctx.createGain();
    const level = host.p(`p${n}Level`, 0.8) * vel;
    const playLen = (buf.duration / src.playbackRate.value) * (0.12 + host.p(`p${n}Decay`, 0.5) * (1 - x * 0.5) * 0.88);
    g.gain.setValueAtTime(level, t);
    g.gain.setTargetAtTime(0, t + playLen * 0.6, Math.max(0.005, playLen * 0.12));
    const pan = ctx.createStereoPanner();
    pan.pan.value = host.p(`p${n}Pan`, 0);
    src.connect(tone).connect(g).connect(pan).connect(padBus);
    src.start(t);
    const end = t + playLen + 0.3;
    src.stop(end);
    src.onended = () => disconnectAll(src, tone, g, pan);
    const group = pads[i]?.choke;
    if (group !== undefined) {
      (chokes.get(group) ?? []).forEach((c) => {
        if (c.end > t) {
          c.g.gain.cancelScheduledValues(t);
          c.g.gain.setTargetAtTime(0, t, 0.005);
        }
      });
      chokes.set(group, [{ g, end }]);
    }
    lastPad = i;
    lastAt = t;
  }

  /** Note repeat: fire held pads on the grid until each key is released. */
  function scheduleRepeats(until: number): void {
    const rate16 = REPEAT16[host.opt('noteRepeat')];
    if (!rate16) return;
    const step = (60 / Math.max(20, host.clock.bpm()) / 4) * rate16;
    for (const h of held) {
      while (h.next < Math.min(until, h.end)) {
        playPad(padIndexForNote(pads, h.note), h.vel * 0.9, h.next);
        h.next += step;
      }
    }
    for (let i = held.length - 1; i >= 0; i--) if (held[i].next >= held[i].end) held.splice(i, 1);
  }

  const tick = () => {
    scheduleRepeats(ctx.currentTime + 0.12);
    if (!held.length && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  function synthOn(note: number, vel: number, t: number): void {
    synthPool.makeRoom(t, ctx.currentTime);
    const v = new SynthVoice(note, t);
    v.osc = ctx.createOscillator();
    setWave(v.osc, host.opt('synthWave') || 'Saw', ctx);
    v.osc.frequency.value = midiHz(note);
    v.filt = ctx.createBiquadFilter();
    v.filt.type = 'lowpass';
    v.filt.Q.value = 0.5 + host.p('synthRes', 0.3) * 14;
    const cut = host.p('synthCutoff', 2600);
    const dec = host.p('synthDecay', 0.5);
    v.filt.frequency.setValueAtTime(clamp(cut * 3, 60, 18000), t);
    v.filt.frequency.setTargetAtTime(cut, t, dec / 4);
    v.amp = ctx.createGain();
    const lvl = host.p('synthLevel', 0.7) * (0.4 + 0.6 * vel) * 0.5;
    v.amp.gain.setValueAtTime(0, t);
    v.amp.gain.linearRampToValueAtTime(lvl, t + 0.003);
    v.amp.gain.setTargetAtTime(lvl * 0.35, t + 0.003, dec / 3);
    v.osc.connect(v.filt).connect(v.amp).connect(comp);
    v.osc.start(t);
    v.osc.onended = () => disconnectAll(v.osc, v.filt, v.amp);
    synthPool.add(v);
  }

  return {
    noteOn(note, vel, t) {
      if (cfg.synth && note >= 60) {
        synthOn(note, vel, t);
        return;
      }
      if (!pads.length) return;
      playPad(padIndexForNote(pads, note), vel, t);
      if (REPEAT16[host.opt('noteRepeat')]) {
        const step = (60 / Math.max(20, host.clock.bpm()) / 4) * REPEAT16[host.opt('noteRepeat')];
        held.push({ note, vel, start: t, end: Infinity, next: t + step });
        if (live && timer === null) timer = window.setInterval(tick, 25);
      }
    },
    noteOff(note, t) {
      if (cfg.synth && note >= 60) {
        synthPool.releaseNote(note, t);
        return;
      }
      const h = held.find((x) => x.note === note && x.end === Infinity);
      if (h) {
        h.end = t;
        scheduleRepeats(t);
      }
    },
    allNotesOff(t) {
      held.length = 0;
      synthPool.killAll(t);
      chokes.forEach((list) => list.forEach((c) => c.g.gain.setTargetAtTime(0, t, 0.005)));
    },
    onParam(key) {
      if (key === 'kit') loadKit();
      else sync();
    },
    loadSample(slot, buffer, name) {
      user.set(slot, buffer);
      userNames[slot] = name;
    },
    sampleNames: () => userNames,
    userBuffers: () => user,
    ready: () => loading,
    meter() {
      return { lastPad, lastAt, gr: comp.reduction, loaded: kit.length ? 1 : 0 };
    },
    dispose() {
      if (timer !== null) clearInterval(timer);
      synthPool.killAll(ctx.currentTime);
    },
  };
}
