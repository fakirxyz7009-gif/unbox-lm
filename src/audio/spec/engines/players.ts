/**
 * Player devices: note processors that sit on an instrument (their `target`) and transform the
 * notes it receives — from the sequencer (timed, with duration) and live input (keyboard / MIDI,
 * duration unknown until the key-up). Generators (arps, Beat Map, Quad Note Generator) also
 * produce notes on their own from `tick(from, to)`, which the engine's player clock calls with
 * a look-ahead window.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { clamp } from '../dsp.ts';

export interface NoteSink {
  on(note: number, vel: number, time: number, dur?: number): void;
  off(note: number, time: number): void;
}

export interface PlayerContext {
  /** Audio time of song position `pos16` (16ths) while playing, else null. */
  gridTime(pos16: number): number | null;
  /** Song position (16ths, fractional) at audio time t while playing, else null. */
  gridPos(t: number): number | null;
  /** Drum note for a role on the target instrument (Beat Map). */
  drumNote(role: 'kick' | 'snare' | 'hatC' | 'hatO' | 'clap' | 'perc'): number;
  stepDur(): number;
}

export interface PlayerProcessor {
  noteOn(note: number, vel: number, time: number, dur: number | undefined, out: NoteSink): void;
  noteOff(note: number, time: number, out: NoteSink): void;
  /** Generators: emit notes whose start falls in [from, to). */
  tick?(from: number, to: number, out: NoteSink, ctx: PlayerContext): void;
  /** True while tick() should be called. */
  running?(ctx: PlayerContext): boolean;
  allOff(time: number, out: NoteSink): void;
}

const SCALES: Record<string, number[]> = {
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
const RATE16: Record<string, number> = { '1/4': 4, '1/8': 2, '1/8T': 4 / 3, '1/16': 1, '1/16T': 2 / 3, '1/32': 0.5 };

const scaleOf = (h: SpecHost) => SCALES[h.opt('scale')] ?? SCALES.Major;
const keyOf = (h: SpecHost) => Math.round(h.p('key', 0));

/** Nearest scale note (ties → down). */
function snap(note: number, key: number, scale: number[]): number {
  for (let d = 0; d < 12; d++) {
    for (const s of [note - d, note + d]) {
      if (scale.includes((((s - key) % 12) + 12) % 12)) return s;
    }
  }
  return note;
}

/** Scale degree helpers: note → degree index, degree → note. */
function degreeOf(note: number, key: number, scale: number[]): number {
  const rel = note - key;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let idx = scale.indexOf(pc);
  if (idx < 0) idx = scale.findIndex((s) => s > pc) - 1;
  return oct * scale.length + Math.max(0, idx);
}
function noteOfDegree(deg: number, key: number, scale: number[]): number {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return key + oct * 12 + scale[((deg % n) + n) % n];
}

/** Holds live note → emitted notes so key-ups release the right notes. */
class LiveMap {
  private m = new Map<number, number[]>();
  set(src: number, notes: number[]) {
    this.m.set(src, notes);
  }
  take(src: number): number[] {
    const n = this.m.get(src) ?? [];
    this.m.delete(src);
    return n;
  }
  all(): number[] {
    const out = [...this.m.values()].flat();
    this.m.clear();
    return out;
  }
}

function emitChord(notes: number[], vel: number, time: number, dur: number | undefined, out: NoteSink, live: LiveMap, src: number, strumSec = 0): void {
  const valid = [...new Set(notes.map((n) => clamp(Math.round(n), 0, 127)))];
  valid.forEach((n, i) => out.on(n, vel, time + i * strumSec, dur === undefined ? undefined : Math.max(0.01, dur - i * strumSec)));
  if (dur === undefined) live.set(src, valid);
}

// ------------------------------------------------------------------ Scales & Chords

function scalesChords(h: SpecHost): PlayerProcessor {
  const live = new LiveMap();
  const build = (note: number): number[] | null => {
    const key = keyOf(h);
    const scale = scaleOf(h);
    const inScale = scale.includes((((note - key) % 12) + 12) % 12);
    if (!inScale && h.p('filterOut', 0) >= 0.5) return null;
    const root = snap(note, key, scale);
    const chord = h.opt('chord');
    const d = degreeOf(root, key, scale);
    const stack = (degs: number[]) => degs.map((x) => noteOfDegree(d + x, key, scale));
    let notes: number[];
    switch (chord) {
      case 'Triad':
        notes = stack([0, 2, 4]);
        break;
      case '7th':
        notes = stack([0, 2, 4, 6]);
        break;
      case '9th':
        notes = stack([0, 2, 4, 6, 8]);
        break;
      case 'Sus2':
        notes = stack([0, 1, 4]);
        break;
      case 'Sus4':
        notes = stack([0, 3, 4]);
        break;
      case 'Power':
        notes = [root, root + 7, root + 12];
        break;
      case 'Octave':
        notes = [root, root + 12];
        break;
      default:
        notes = [root];
    }
    // inversions: move lowest up (positive) or highest down (negative)
    const inv = Math.round(h.p('inversion', 0));
    for (let i = 0; i < Math.abs(inv) && notes.length > 1; i++) {
      notes.sort((a, b) => a - b);
      if (inv > 0) notes.push(notes.shift()! + 12);
      else notes.unshift(notes.pop()! - 12);
    }
    const spread = Math.round(h.p('spread', 0));
    if (spread > 0) notes = notes.map((n, i) => (i % 2 === 1 ? n + 12 * spread : n));
    return notes;
  };
  return {
    noteOn(note, vel, time, dur, out) {
      const notes = build(note);
      if (notes) emitChord(notes, vel, time, dur, out, live, note);
    },
    noteOff(note, time, out) {
      live.take(note).forEach((n) => out.off(n, time));
    },
    allOff(time, out) {
      live.all().forEach((n) => out.off(n, time));
    },
  };
}

// ------------------------------------------------------------------ Note Echo

function noteEcho(h: SpecHost): PlayerProcessor {
  const live = new LiveMap();
  return {
    noteOn(note, vel, time, dur, out) {
      emitChord([note], vel, time, dur, out, live, note);
      const stepDur = 60 / Math.max(20, h.clock.bpm()) / 4;
      const len16 = [1, 4 / 3, 2, 4][clamp(Math.round(h.p('stepLen', 0)), 0, 3)];
      const delay = h.p('steps', 3) * len16 * stepDur;
      const reps = Math.round(h.p('repeats', 4));
      const decay = clamp(h.p('velDecay', 0.3), 0, 1);
      const pitch = Math.round(h.p('pitch', 0));
      for (let k = 1; k <= reps; k++) {
        const v = vel * Math.pow(1 - decay, k);
        if (v < 0.03) break;
        out.on(clamp(note + pitch * k, 0, 127), v, time + k * delay, Math.max(0.02, delay * clamp(h.p('length', 0.5), 0.05, 1)));
      }
    },
    noteOff(note, time, out) {
      live.take(note).forEach((n) => out.off(n, time));
    },
    allOff(time, out) {
      live.all().forEach((n) => out.off(n, time));
    },
  };
}

// ------------------------------------------------------------------ arpeggiators

interface Held {
  note: number;
  vel: number;
  start: number;
  end: number;
  order: number;
}

class HeldNotes {
  list: Held[] = [];
  private n = 0;
  on(note: number, vel: number, start: number, dur?: number): void {
    this.list.push({ note, vel, start, end: dur === undefined ? Infinity : start + dur, order: this.n++ });
  }
  off(note: number, t: number): void {
    const h = this.list.find((x) => x.note === note && x.end === Infinity);
    if (h) h.end = t;
  }
  activeAt(t: number): Held[] {
    return this.list.filter((x) => x.start <= t + 1e-6 && t < x.end);
  }
  gc(now: number): void {
    this.list = this.list.filter((x) => x.end > now - 0.5);
  }
  any(now: number): boolean {
    return this.list.some((x) => x.end > now);
  }
  clear(): void {
    this.list = [];
  }
}

function arpSequence(mode: string, notes: Held[], octaves: number, step: number): number[] {
  const byPitch = [...notes].sort((a, b) => a.note - b.note).map((x) => x.note);
  const played = [...notes].sort((a, b) => a.order - b.order).map((x) => x.note);
  const span = (base: number[]) => {
    const out: number[] = [];
    for (let o = 0; o < octaves; o++) base.forEach((n) => out.push(n + 12 * o));
    return out;
  };
  switch (mode) {
    case 'Down':
      return span(byPitch).reverse();
    case 'Up/Down':
    case 'Up+Down': {
      const up = span(byPitch);
      return up.length > 1 ? [...up, ...up.slice(1, -1).reverse()] : up;
    }
    case 'Random': {
      const all = span(byPitch);
      const s = Math.abs(Math.sin(step * 12.9898) * 43758.5453) % 1;
      return [all[Math.floor(s * all.length)]];
    }
    case 'As Played':
    case 'Manual':
      return span(played);
    default:
      return span(byPitch);
  }
}

function gridSteps(from: number, to: number, rate16: number, ctx: PlayerContext, originFallback: number): { time: number; k: number }[] {
  const out: { time: number; k: number }[] = [];
  const p0 = ctx.gridPos(from);
  if (p0 !== null) {
    let k = Math.ceil(p0 / rate16 - 1e-6);
    for (let guard = 0; guard < 256; guard++, k++) {
      const t = ctx.gridTime(k * rate16);
      if (t === null || t >= to) break;
      if (t >= from) out.push({ time: t, k });
    }
    return out;
  }
  const dur = ctx.stepDur() * rate16;
  let k = Math.ceil((from - originFallback) / dur - 1e-6);
  for (let t = originFallback + k * dur; t < to; t += dur, k++) if (t >= from) out.push({ time: t, k });
  return out;
}

function dualArp(h: SpecHost): PlayerProcessor {
  const held = new HeldNotes();
  let origin = 0;
  return {
    noteOn(note, vel, time, dur) {
      if (!held.any(time)) origin = time;
      held.on(note, vel, time, dur);
    },
    noteOff(note, time) {
      held.off(note, time);
    },
    running: (ctx) => {
      void ctx;
      return held.list.length > 0;
    },
    tick(from, to, out, ctx) {
      held.gc(from);
      for (const a of [1, 2]) {
        if (a === 2 && h.p('on2', 1) < 0.5) continue;
        const rate = RATE16[h.opt(`rate${a}`)] ?? 1;
        const mode = h.opt(`mode${a}`) || 'Up';
        const oct = Math.round(h.p(`oct${a}`, 1));
        const gate = clamp(h.p(`gate${a}`, 0.6), 0.05, 1);
        const shift = Math.round(h.p(`shift${a}`, 0));
        for (const st of gridSteps(from, to, rate, ctx, origin)) {
          const act = held.activeAt(st.time);
          if (!act.length) continue;
          const dur = ctx.stepDur() * rate * gate;
          const vel = Math.max(...act.map((x) => x.vel));
          if (mode === 'Chord') {
            act.forEach((x) => out.on(clamp(x.note + shift, 0, 127), vel, st.time, dur));
            continue;
          }
          const seq = arpSequence(mode, act, oct, st.k);
          const n = seq[mode === 'Random' ? 0 : ((st.k % seq.length) + seq.length) % seq.length];
          out.on(clamp(n + shift, 0, 127), vel, st.time, dur);
        }
      }
    },
    allOff() {
      held.clear();
    },
  };
}

function rpg8(h: SpecHost, cvState: { note: number; gate: number; until: number }): PlayerProcessor {
  const held = new HeldNotes();
  let origin = 0;
  let last = -1;
  return {
    noteOn(note, vel, time, dur) {
      if (!held.any(time)) origin = time;
      held.on(note, vel, time, dur);
    },
    noteOff(note, time) {
      held.off(note, time);
    },
    running: () => held.list.length > 0,
    tick(from, to, out, ctx) {
      held.gc(from);
      const rate = RATE16[h.opt('rate')] ?? 1;
      const oct = Math.round(h.p('octaves', 0)) + 1;
      const gate = clamp(h.p('gate', 0.5), 0.05, 1);
      const ins = h.opt('insert');
      for (const st of gridSteps(from, to, rate, ctx, origin)) {
        const act = held.activeAt(st.time);
        if (!act.length) continue;
        let seq = arpSequence(h.opt('mode') || 'Up', act, oct, st.k);
        if (ins === 'Low' && seq.length > 1) seq = seq.flatMap((n, i) => (i ? [seq[0], n] : [n]));
        else if (ins === 'Hi' && seq.length > 1) seq = seq.flatMap((n, i) => (i < seq.length - 1 ? [n, seq[seq.length - 1]] : [n]));
        else if (ins === '3-1') seq = seq.flatMap((n, i) => (i % 3 === 2 ? [n, seq[Math.max(0, i - 2)]] : [n]));
        else if (ins === '4-2') seq = seq.flatMap((n, i) => (i % 4 === 3 ? [n, seq[Math.max(0, i - 2)]] : [n]));
        const n = seq[((st.k % seq.length) + seq.length) % seq.length];
        if (seq.length === 1 && h.p('singleNoteRepeat', 1) < 0.5 && n === last && st.k > 0) continue;
        last = n;
        const fixedVel = h.p('velocity', 0);
        const vel = fixedVel > 0 ? fixedVel / 127 : Math.max(...act.map((x) => x.vel));
        const dur = ctx.stepDur() * rate * gate;
        out.on(clamp(n, 0, 127), vel, st.time, dur);
        cvState.note = n - 60;
        cvState.gate = 1;
        cvState.until = st.time + dur;
      }
    },
    allOff() {
      held.clear();
    },
  };
}

// ------------------------------------------------------------------ generators

/** Bjorklund-style even distribution of `pulses` over `steps`. */
function euclid(pulses: number, steps: number, i: number): boolean {
  const p = clamp(pulses, 0, steps);
  return Math.floor(((i + 1) * p) / steps) !== Math.floor((i * p) / steps);
}

const rnd = (seed: number) => {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const BEAT_STYLES: Record<string, { kick: number[]; snare: number[]; hat: number[]; perc: number[] }> = {
  // 16-step weights 0..1
  'Four on Floor': { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.2], snare: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0.2], hat: [0.3, 0.2, 1, 0.2, 0.3, 0.2, 1, 0.2, 0.3, 0.2, 1, 0.2, 0.3, 0.2, 1, 0.4], perc: [0, 0, 0, 0.4, 0, 0, 0.3, 0, 0, 0.4, 0, 0, 0, 0.3, 0, 0] },
  Breakbeat: { kick: [1, 0, 0.3, 0, 0, 0, 0, 0, 0, 0.6, 1, 0, 0, 0, 0.2, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0.3, 0, 0, 0, 0, 1, 0, 0, 0.4], hat: [1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.5], perc: [0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0] },
  Trap: { kick: [1, 0, 0, 0, 0, 0, 0.5, 0, 0, 0.4, 0, 0, 0, 0, 0.3, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.2], hat: [1, 0.6, 1, 0.6, 1, 0.8, 1, 0.6, 1, 0.6, 1, 0.9, 1, 0.6, 1, 0.9], perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0] },
  'Boom Bap': { kick: [1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0.4, 1, 0, 1, 0, 1, 0, 1, 0.4], perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3] },
  Broken: { kick: [1, 0, 0, 0.6, 0, 0, 0.4, 0, 0, 0.7, 0, 0, 0.3, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0], hat: [0.8, 0.4, 0.8, 0.4, 0.8, 0.4, 0.8, 0.4, 0.8, 0.4, 0.8, 0.4, 0.8, 0.4, 0.8, 0.4], perc: [0, 0.3, 0, 0, 0, 0, 0, 0.4, 0, 0, 0.3, 0, 0, 0, 0, 0] },
  Halftime: { kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], perc: [0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.3, 0] },
};

function beatMap(h: SpecHost): PlayerProcessor {
  const held = new HeldNotes();
  return {
    noteOn(note, vel, time, dur) {
      held.on(note, vel, time, dur);
    },
    noteOff(note, time) {
      held.off(note, time);
    },
    // runs with the song (or while a key is held)
    running: (c) => c.gridPos(0) !== null || held.list.length > 0,
    tick(from, to, out, ctx) {
      held.gc(from);
      const p0 = ctx.gridPos(from);
      if (p0 === null) return; // follows the song: only while the transport plays
      const style = BEAT_STYLES[h.opt('style')] ?? BEAT_STYLES['Four on Floor'];
      const variation = clamp(h.p('variation', 0.3), 0, 1);
      const dyn = clamp(h.p('velocity', 0.5), 0, 1);
      for (const st of gridSteps(from, to, 1, ctx, 0)) {
        if (h.p('onlyWhenHeld', 0) >= 0.5 && !held.activeAt(st.time).length) continue;
        const i = ((st.k % 16) + 16) % 16;
        const bar = Math.floor(st.k / 16);
        const lanes: [keyof typeof style, string, 'kick' | 'snare' | 'hatC' | 'perc'][] = [
          ['kick', 'kick', 'kick'],
          ['snare', 'snare', 'snare'],
          ['hat', 'hats', 'hatC'],
          ['perc', 'perc', 'perc'],
        ];
        lanes.forEach(([lane, knob, role], li) => {
          const w = style[lane][i];
          const density = clamp(h.p(knob, 0.5), 0, 1);
          const r = rnd(bar * 97 + i * 13 + li * 7);
          const prob = w * (0.4 + density * 0.8) + (w === 0 ? variation * density * 0.15 : (variation - 0.5) * 0.2);
          if (r >= prob) return;
          const v = clamp(0.55 + w * 0.45 * (0.5 + dyn) - rnd(st.k * 3 + li) * dyn * 0.3, 0.2, 1);
          out.on(ctx.drumNote(role === 'hatC' && i % 4 === 2 && rnd(bar + i) < variation * 0.5 ? 'hatO' : role), v, st.time, ctx.stepDur() * 0.5);
        });
      }
    },
    allOff() {
      held.clear();
    },
  };
}

function quadGen(h: SpecHost): PlayerProcessor {
  const held = new HeldNotes();
  const walk = [0, 0, 0, 0, 0];
  return {
    noteOn(note, vel, time, dur) {
      held.on(note, vel, time, dur);
    },
    noteOff(note, time) {
      held.off(note, time);
    },
    // runs with the song (or while a key is held)
    running: (c) => c.gridPos(0) !== null || held.list.length > 0,
    tick(from, to, out, ctx) {
      held.gc(from);
      if (ctx.gridPos(from) === null && h.p('onlyWhenHeld', 0) < 0.5) return;
      const key = keyOf(h);
      const scale = scaleOf(h);
      const rootDeg = degreeOf(12 * (Math.round(h.p('root', 4)) + 1) + key, key, scale);
      for (let g = 1; g <= 4; g++) {
        const type = h.opt(`type${g}`);
        if (!type || type === 'Off') continue;
        const rate = RATE16[h.opt(`rate${g}`)] ?? 1;
        const density = Math.round(h.p(`density${g}`, 5));
        const range = Math.round(h.p(`range${g}`, 7));
        const origin = held.list[0]?.start ?? from;
        for (const st of gridSteps(from, to, rate, ctx, origin)) {
          if (h.p('onlyWhenHeld', 0) >= 0.5 && !held.activeAt(st.time).length) continue;
          const i = ((st.k % 16) + 16) % 16;
          let deg: number | null = null;
          let len = ctx.stepDur() * rate * 0.8;
          if (type === 'Euclid') {
            if (euclid(density, 16, i)) deg = rootDeg + (Math.floor(rnd(st.k * 5 + g) * range) % Math.max(1, range));
          } else if (type === 'Random Walk') {
            if (rnd(st.k * 11 + g * 3) < density / 16) {
              walk[g] = clamp(walk[g] + Math.round(rnd(st.k + g) * 4 - 2), 0, range);
              deg = rootDeg + walk[g];
            }
          } else if (type === 'Arp') {
            if (euclid(density, 16, i)) deg = rootDeg + (st.k % Math.max(1, range));
          } else if (type === 'Drone') {
            if (i === 0) {
              deg = rootDeg - scale.length + (g % 2 ? 0 : 4);
              len = ctx.stepDur() * 16 * rate * 0.98;
            }
          }
          if (deg === null) continue;
          out.on(clamp(noteOfDegree(deg, key, scale), 0, 127), 0.6 + rnd(st.k + g * 9) * 0.3, st.time, len);
        }
      }
    },
    allOff() {
      held.clear();
    },
  };
}

// ------------------------------------------------------------------ Chord Sequencer

const ROMAN: Record<string, { deg: number; seventh?: boolean; maj7?: boolean; oct?: boolean }> = {
  I: { deg: 0 },
  ii: { deg: 1 },
  iii: { deg: 2 },
  IV: { deg: 3 },
  V: { deg: 4 },
  vi: { deg: 5 },
  'vii°': { deg: 6 },
  'I (oct)': { deg: 0, oct: true },
  V7: { deg: 4, seventh: true },
  IVmaj7: { deg: 3, maj7: true },
};
const WHITE_SLOT: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 };

function chordSequencer(h: SpecHost): PlayerProcessor {
  const live = new LiveMap();
  return {
    noteOn(note, vel, time, dur, out) {
      const pc = ((note % 12) + 12) % 12;
      // C D E F G A B → slots 1-7, the next C (odd octave) → slot 8
      const slot = pc === 0 && Math.floor(note / 12) % 2 === 1 ? 7 : WHITE_SLOT[pc];
      const def = ROMAN[h.opt(`slot${slot + 1}`)] ?? ROMAN.I;
      const key = keyOf(h);
      const scale = h.opt('scale') === 'Major' ? SCALES.Major : SCALES.Minor;
      const base = degreeOf(12 * (Math.round(h.p('octave', 4)) + 1) + key, key, scale) + def.deg;
      let notes = [0, 2, 4].map((x) => noteOfDegree(base + x, key, scale));
      if (def.seventh || def.maj7) notes.push(noteOfDegree(base + 6, key, scale));
      if (def.oct) notes.push(notes[0] + 12);
      const voicing = h.opt('voicing');
      notes.sort((a, b) => a - b);
      if (voicing === 'Open' && notes.length >= 3) notes[1] += 12;
      else if (voicing === 'Drop 2' && notes.length >= 3) notes[notes.length - 2] -= 12;
      else if (voicing === 'Spread') notes = notes.map((n, i) => n + (i % 2 ? 12 : 0));
      emitChord(notes, vel, time, dur, out, live, note, h.p('strum', 0) / 1000);
    },
    noteOff(note, time, out) {
      live.take(note).forEach((n) => out.off(n, time));
    },
    allOff(time, out) {
      live.all().forEach((n) => out.off(n, time));
    },
  };
}

/** Engine for player devices: exposes the processor + CV outs (note / gate). */
export function playerEngine(host: SpecHost): SpecEngine {
  const cv = { note: 0, gate: 0, until: 0 };
  let proc: PlayerProcessor;
  switch (host.spec.type) {
    case 'scales_chords':
      proc = scalesChords(host);
      break;
    case 'note_echo':
      proc = noteEcho(host);
      break;
    case 'dual_arp':
      proc = dualArp(host);
      break;
    case 'beat_map':
      proc = beatMap(host);
      break;
    case 'quad_note_gen':
      proc = quadGen(host);
      break;
    case 'chord_sequencer':
      proc = chordSequencer(host);
      break;
    default:
      proc = rpg8(host, cv);
  }
  // track the last emitted note for the CV outputs
  const wrap = (out: NoteSink): NoteSink => ({
    on(n, v, t, d) {
      cv.note = n - 60;
      cv.gate = 1;
      cv.until = t + (d ?? 0.25);
      out.on(n, v, t, d);
    },
    off(n, t) {
      out.off(n, t);
    },
  });
  const player: PlayerProcessor = {
    noteOn: (n, v, t, d, out) => proc.noteOn(n, v, t, d, wrap(out)),
    noteOff: (n, t, out) => proc.noteOff(n, t, wrap(out)),
    tick: proc.tick ? (a, b, out, c) => proc.tick!(a, b, wrap(out), c) : undefined,
    running: proc.running,
    allOff: (t, out) => proc.allOff(t, out),
  };
  return {
    player,
    cv(id) {
      if (id === 'note_cv') return cv.note;
      if (id === 'gate_cv') return host.ctx.currentTime < cv.until ? 1 : 0;
      return 0;
    },
    meter() {
      return { note: cv.note + 60, gate: host.ctx.currentTime < cv.until ? 1 : 0 };
    },
  };
}
