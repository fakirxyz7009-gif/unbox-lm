/**
 * Sample engines.
 *  - 'sampler' (NN-19 / NN-XT / ID8): built-in sources (NN-XT: rendered at three roots as a
 *    multisample keymap) or user samples (NN-XT: up to 8 zones C1, C2 …), root / tune / fine,
 *    start, loop points, reverse, the shared filter + envelopes + LFO, poly / mono.
 *  - 'granular' (Grain): grain cloud from a source — position, jitter, size, density, scan,
 *    pitch randomness, stereo spread; Tape (continuous) and Freeze modes.
 *  - 'loops' (Dr. Octo Rex): 8 loop slots, slice-per-note from C1, Run mode plays the active
 *    loop in sync with the song (one slice per 16th), pitch, slice decay, filter.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { adsrRelease, adsrStart, clamp, disconnectAll, setSmooth, stopAll } from '../dsp.ts';
import { loopSource, tonalSource, type SourceInfo } from './sourceLibrary.ts';
import { SynthCore, type FilterVoice } from './synthCore.ts';
import { VoicePool, voiceModeOf, type VoiceBase } from './voices.ts';

const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();
function reversed(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  let r = reversedCache.get(buf);
  if (!r) {
    r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = r.getChannelData(c);
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
    }
    reversedCache.set(buf, r);
  }
  return r;
}

/** Common user-sample store (slot → buffer + name). */
class UserSamples {
  buffers = new Map<number, AudioBuffer>();
  names: Record<number, string> = {};
  set(slot: number, buf: AudioBuffer, name: string): void {
    this.buffers.set(slot, buf);
    this.names[slot] = name;
  }
}

// ======================================================================= sampler

class SampleVoice implements VoiceBase {
  releaseTime: number | null = null;
  endTime = Infinity;
  src!: AudioBufferSourceNode;
  amp!: GainNode;
  filter!: FilterVoice;
  pan?: StereoPannerNode;
  env = { a: 0.001, d: 0.4, s: 1, r: 0.3 };
  constructor(public note: number, public startTime: number, private core: SynthCore) {}

  release(t: number): void {
    if (this.releaseTime !== null) return;
    this.releaseTime = t;
    adsrRelease(this.amp.gain, t, 0, this.env.r);
    this.filter.release(t);
    this.endTime = t + SynthCore.tail(this.env.r);
    stopAll(this.endTime, this.src);
  }

  kill(t: number): void {
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(0, t, 0.004);
    this.releaseTime = this.releaseTime ?? t;
    this.endTime = t + 0.03;
    stopAll(this.endTime, this.src);
  }

  cleanup(): void {
    try {
      this.core.pitchDetune.disconnect(this.src.detune);
    } catch {
      // already disconnected
    }
    this.filter.stop(0);
    disconnectAll(this.src, this.amp, this.pan);
  }
}

export function samplerEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const cfg = host.cfg;
  const zones = cfg.zones === true;
  const core = new SynthCore(host, { trim: 0.5 });
  core.connect(host.outs[0]);
  const pool = new VoicePool<SampleVoice>(Number(cfg.maxVoices ?? 12));
  const user = new UserSamples();
  let built: SourceInfo[] = [];
  let loading: Promise<void> = Promise.resolve();
  const mode = () => voiceModeOf(host.opt('voiceMode') || 'Poly');

  const loadBuiltin = () => {
    const name = host.opt('sample') || 'Electric Piano';
    const sr = ctx.sampleRate;
    loading = (zones ? Promise.all([36, 60, 84].map((r) => tonalSource(sr, name, r))) : tonalSource(sr, name).then((s) => [s])).then((list) => {
      built = list;
      host.changed();
    });
  };
  loadBuiltin();

  /** Zone for a note: user zones first (NN-XT: slot k rooted at C(k+1)), else built-in. */
  const zoneFor = (note: number): SourceInfo | null => {
    if (user.buffers.size) {
      if (!zones) {
        const b = user.buffers.get(0) ?? [...user.buffers.values()][0];
        return { buffer: b, root: 60 };
      }
      let best: SourceInfo | null = null;
      let dist = Infinity;
      user.buffers.forEach((buffer, slot) => {
        const root = 36 + slot * 12;
        const d = Math.abs(note - root);
        if (d < dist) {
          dist = d;
          best = { buffer, root };
        }
      });
      return best;
    }
    if (!built.length) return null;
    let best = built[0];
    for (const z of built) if (Math.abs(note - z.root) < Math.abs(note - best.root)) best = z;
    return best;
  };

  function buildVoice(note: number, vel: number, t: number): SampleVoice | null {
    const z = zoneFor(note);
    if (!z) return null;
    const v = new SampleVoice(note, t, core);
    const rev = host.p('reverse', 0) >= 0.5;
    const buf = rev ? reversed(ctx, z.buffer) : z.buffer;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const root = z.root + (host.p('root', 60) - 60);
    src.playbackRate.value = Math.pow(2, (note - root + host.p('tune', 0)) / 12);
    src.detune.value = host.p('fine', 0);
    core.pitchDetune.connect(src.detune);
    const dur = buf.duration;
    const loopOn = host.p('loop', 0) >= 0.5;
    if (loopOn) {
      src.loop = true;
      src.loopStart = clamp(host.p('loopStart', 0.2), 0, 0.98) * dur;
      src.loopEnd = clamp(Math.max(host.p('loopEnd', 0.9), host.p('loopStart', 0.2) + 0.01), 0.02, 1) * dur;
    } else if (z.loopStart !== undefined && z.loopEnd !== undefined && !rev) {
      // sustained built-ins loop their steady part while the key is held
      src.loop = true;
      src.loopStart = z.loopStart;
      src.loopEnd = z.loopEnd;
    }
    v.src = src;
    const velFilter = host.p('velToFilter', 0.3);
    v.filter = core.makeFilter(t, note, vel, { cutoff: core.cutoffRef * (1 - velFilter + velFilter * vel * 1.4) });
    v.amp = ctx.createGain();
    v.amp.gain.value = 0;
    const spread = host.p('spread', 0.2);
    if (spread > 0.01) {
      v.pan = ctx.createStereoPanner();
      v.pan.pan.value = (Math.random() * 2 - 1) * spread;
      src.connect(v.filter.input);
      v.filter.output.connect(v.amp).connect(v.pan).connect(core.bus);
    } else {
      src.connect(v.filter.input);
      v.filter.output.connect(v.amp).connect(core.bus);
    }
    v.env = core.ampStart(v.amp.gain, t, vel);
    src.start(t, clamp(host.p('start', 0), 0, 0.95) * dur);
    if (!src.loop) {
      const natural = t + (dur * (1 - host.p('start', 0))) / src.playbackRate.value + 0.05;
      v.endTime = natural;
    }
    src.onended = () => v.cleanup();
    return v;
  }

  return {
    noteOn(note, vel, t) {
      if (mode().mono) pool.releaseAll(t);
      pool.max = mode().mono ? 2 : Number(cfg.maxVoices ?? 12);
      pool.makeRoom(t, ctx.currentTime);
      const v = buildVoice(note, vel, t);
      if (v) pool.add(v);
    },
    noteOff(note, t) {
      pool.releaseNote(note, t);
    },
    allNotesOff(t) {
      pool.killAll(t);
    },
    onParam(key) {
      if (key === 'sample') loadBuiltin();
      else if (key === 'resonance') pool.list.forEach((v) => v.filter.setRes(clamp(host.p('resonance', 0.1), 0, 1), ctx.currentTime));
      else core.onParam(key);
    },
    loadSample(slot, buffer, name) {
      user.set(slot, buffer, name);
    },
    sampleNames() {
      return user.names;
    },
    ready: () => loading,
    meter() {
      return { voices: pool.held().length, loaded: built.length ? 1 : 0 };
    },
    dispose() {
      pool.killAll(ctx.currentTime);
      core.stop();
    },
    userBuffers: () => user.buffers,
  };
}

// ======================================================================= granular

interface GrainVoice extends VoiceBase {
  vel: number;
  scheduledUntil: number;
  stopAt: number;
  out: GainNode;
  filter: BiquadFilterNode;
  sources: AudioBufferSourceNode[];
  env: { a: number; d: number; s: number; r: number };
}

export function granularEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const pool = new VoicePool<GrainVoice>(Number(host.cfg.maxVoices ?? 6));
  const bus = ctx.createGain();
  bus.connect(host.outs[0]);
  const user = new UserSamples();
  let src: SourceInfo | null = null;
  let loading: Promise<void> = Promise.resolve();
  let timer: number | null = null;
  const live = typeof window !== 'undefined' && ctx instanceof AudioContext;

  const load = () => {
    loading = tonalSource(ctx.sampleRate, host.opt('sample') || 'Vox Chop').then((s) => {
      src = s;
      host.changed();
    });
  };
  load();
  const buffer = () => user.buffers.get(0) ?? src?.buffer ?? null;
  const rootOf = () => (user.buffers.has(0) ? 60 : src?.root ?? 60);

  /** Schedules grains for a voice up to time `until`. */
  function fill(v: GrainVoice, until: number): void {
    const buf = buffer();
    if (!buf) return;
    const modeName = host.opt('playMode') || 'Grain';
    const size = modeName === 'Tape' ? 0.25 : clamp(host.p('grainSize', 0.08), 0.01, 0.5);
    const density = modeName === 'Tape' ? 8 : clamp(host.p('density', 22), 1, 80);
    const step = 1 / density;
    const end = Math.min(until, v.stopAt);
    let t = Math.max(v.scheduledUntil, ctx.currentTime);
    const ratioBase = Math.pow(2, (v.note - rootOf()) / 12);
    while (t < end) {
      const elapsed = t - v.startTime;
      const scan = modeName === 'Freeze' ? 0 : host.p('scan', 0.1) * elapsed * 0.25;
      const pos = ((host.p('position', 0.3) + scan + (Math.random() * 2 - 1) * host.p('spray', 0.15) * 0.3) % 1 + 1) % 1;
      const ratio = ratioBase * Math.pow(2, ((Math.random() * 2 - 1) * host.p('pitchRand', 0.05) * 12) / 12);
      const g = ctx.createBufferSource();
      g.buffer = buf;
      g.playbackRate.value = ratio;
      const w = ctx.createGain();
      w.gain.setValueAtTime(0, t);
      w.gain.linearRampToValueAtTime(0.5, t + size / 2);
      w.gain.linearRampToValueAtTime(0, t + size);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * host.p('stereo', 0.6);
      g.connect(w).connect(pan).connect(v.filter);
      g.start(t, pos * Math.max(0, buf.duration - size * ratio));
      g.stop(t + size + 0.01);
      g.onended = () => disconnectAll(g, w, pan);
      t += step * (0.85 + Math.random() * 0.3);
    }
    v.scheduledUntil = t;
  }

  const tick = () => {
    pool.gc(ctx.currentTime);
    const ahead = ctx.currentTime + 0.15;
    pool.list.forEach((v) => fill(v, ahead));
    if (!pool.list.length && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    noteOn(note, vel, t) {
      pool.makeRoom(t, ctx.currentTime);
      const out = ctx.createGain();
      out.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = host.p('cutoff', 12000);
      filter.Q.value = 0.5 + host.p('resonance', 0.1) * 10;
      filter.connect(out).connect(bus);
      const env = { a: host.p('attack', 0.15), d: host.p('decay', 0.4), s: host.p('sustain', 0.9), r: host.p('release', 1.2) };
      adsrStart(out.gain, t, 0, 0.6 + 0.4 * vel, (0.6 + 0.4 * vel) * env.s, env);
      const v: GrainVoice = {
        note,
        vel,
        startTime: t,
        releaseTime: null,
        endTime: Infinity,
        scheduledUntil: t,
        stopAt: Infinity,
        out,
        filter,
        sources: [],
        env,
        release(rt) {
          if (this.releaseTime !== null) return;
          this.releaseTime = rt;
          adsrRelease(out.gain, rt, 0, env.r);
          this.stopAt = rt + SynthCore.tail(env.r);
          this.endTime = this.stopAt + 0.6;
          fill(this, this.stopAt);
        },
        kill(kt) {
          out.gain.cancelScheduledValues(kt);
          out.gain.setTargetAtTime(0, kt, 0.004);
          this.releaseTime = this.releaseTime ?? kt;
          this.stopAt = kt;
          this.endTime = kt + 0.6;
        },
      };
      pool.add(v);
      if (live && timer === null) timer = window.setInterval(tick, 25);
      if (live) fill(v, ctx.currentTime + 0.15);
    },
    noteOff(note, t) {
      pool.releaseNote(note, t);
    },
    allNotesOff(t) {
      pool.killAll(t);
    },
    onParam(key) {
      if (key === 'sample') load();
      if (key === 'cutoff' || key === 'resonance') {
        pool.list.forEach((v) => {
          setSmooth(v.filter.frequency, host.p('cutoff', 12000), ctx, 0.02);
          setSmooth(v.filter.Q, 0.5 + host.p('resonance', 0.1) * 10, ctx, 0.02);
        });
      }
    },
    loadSample(slot, buf, name) {
      user.set(slot, buf, name);
    },
    sampleNames() {
      return user.names;
    },
    ready: () => loading,
    meter() {
      return { voices: pool.held().length, position: host.p('position', 0.3) };
    },
    dispose() {
      if (timer !== null) clearInterval(timer);
      pool.killAll(ctx.currentTime);
    },
    userBuffers: () => user.buffers,
  };
}

// ======================================================================= loops

export function loopsEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.connect(host.outs[0]);
  const user = new UserSamples();
  const slots: (SourceInfo | null)[] = Array(8).fill(null);
  let loading: Promise<void> = Promise.resolve();
  let lastSlice = -1;

  const loadSlot = (i: number) => {
    const name = host.opt(`loop${i + 1}`);
    return loopSource(ctx.sampleRate, name).then((s) => {
      slots[i] = s;
    });
  };
  const loadAll = () => {
    loading = Promise.all(slots.map((_, i) => loadSlot(i))).then(() => host.changed());
  };
  loadAll();

  const syncFilter = () => {
    setSmooth(filter.frequency, clamp(host.p('cutoff', 18000), 60, 20000), ctx, 0.02);
    setSmooth(filter.Q, 0.5 + host.p('resonance', 0.1) * 12, ctx, 0.02);
  };
  syncFilter();

  const active = (): SourceInfo | null => {
    const i = Math.round(host.p('slot', 0));
    const ub = user.buffers.get(i);
    if (ub) {
      const n = 16;
      return { buffer: ub, root: 60, slices: Array.from({ length: n }, (_, k) => (k * ub.duration) / n), bpm: 0 };
    }
    return slots[i];
  };

  function playSlice(idx: number, vel: number, t: number): void {
    const s = active();
    if (!s?.slices?.length) return;
    const n = s.slices.length;
    const i = ((idx % n) + n) % n;
    const start = s.slices[i];
    const next = i + 1 < n ? s.slices[i + 1] : s.buffer.duration;
    const len = Math.max(0.01, (next - start) * clamp(host.p('decay', 1), 0.05, 1));
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, host.p('pitch', 0) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setValueAtTime(vel, t + len * 0.85);
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g).connect(filter);
    src.start(t, start);
    src.stop(t + len / src.playbackRate.value + 0.02);
    src.onended = () => disconnectAll(src, g);
    lastSlice = i;
  }

  return {
    noteOn(note, vel, t) {
      playSlice(note - 36, vel, t);
    },
    noteOff() {
      // slices are one-shots
    },
    onStepTick(pos, time) {
      if (host.p('run', 0) < 0.5 || !host.clock.isPlaying()) return;
      playSlice(pos, 0.85, time);
    },
    onParam(key) {
      if (key === 'cutoff' || key === 'resonance') syncFilter();
      else if (/^loop\d$/.test(key)) loading = loadSlot(Number(key.slice(4)) - 1).then(() => host.changed());
    },
    loadSample(slot, buf, name) {
      user.set(slot, buf, name);
    },
    sampleNames() {
      return user.names;
    },
    ready: () => loading,
    meter() {
      return { step: lastSlice, slot: host.p('slot', 0) };
    },
    userBuffers: () => user.buffers,
  };
}

