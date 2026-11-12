/**
 * MIDI editing tools on a pattern's steps (pure): quantize with strength, humanize, velocity
 * (set / scale / ramp / random), legato, transpose and scale snap. Positions are step index +
 * microOffset (fraction of a step); lengths are in steps.
 */
import type { SequencerNote } from '../types.ts';

type Steps = (SequencerNote | null)[];

const clampVel = (v: number) => Math.max(0.02, Math.min(1, v));

/** Moves notes toward a grid of `grid` steps (1 = every step). strength 0..1. */
export function quantize(steps: Steps, grid: number, strength: number): Steps {
  const n = steps.length;
  const out: Steps = Array(n).fill(null);
  steps.forEach((s, i) => {
    if (!s) return;
    const pos = i + (s.microOffset ?? 0);
    const target = Math.round(pos / grid) * grid;
    const np = pos + (target - pos) * Math.max(0, Math.min(1, strength));
    let idx = Math.round(np);
    const micro = Math.round((np - idx) * 1000) / 1000;
    idx = ((idx % n) + n) % n;
    const note: SequencerNote = { ...s, microOffset: micro || undefined };
    const cur = out[idx];
    if (!cur) out[idx] = note;
    else {
      // two notes landed on the same step: keep both as a chord
      const extra = [note.note, ...(note.chordNotes ?? [])].filter((x) => x !== cur.note && !(cur.chordNotes ?? []).includes(x));
      cur.chordNotes = [...(cur.chordNotes ?? []), ...extra];
    }
  });
  return out;
}

/** Random timing (± amount of a step / 4) and velocity (± amount × 30 %). `rand` for tests. */
export function humanize(steps: Steps, timing: number, velocity: number, rand: () => number = Math.random): Steps {
  return steps.map((s) => {
    if (!s) return s;
    const t = (rand() * 2 - 1) * timing * 0.25;
    const micro = Math.max(-0.49, Math.min(0.49, (s.microOffset ?? 0) + t));
    const v = clampVel(s.velocity * (1 + (rand() * 2 - 1) * velocity * 0.3));
    return { ...s, microOffset: Math.round(micro * 1000) / 1000 || undefined, velocity: v };
  });
}

export type VelocityMode = 'set' | 'scale' | 'ramp' | 'random';

/** value: 0..1 (set), factor (scale), end velocity (ramp from the current first), spread (random). */
export function velocity(steps: Steps, mode: VelocityMode, value: number, rand: () => number = Math.random): Steps {
  const idx = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const first = idx[0] ?? 0;
  const last = idx[idx.length - 1] ?? 1;
  const startVel = idx.length ? steps[first]!.velocity : 0.8;
  return steps.map((s, i) => {
    if (!s) return s;
    let v = s.velocity;
    if (mode === 'set') v = value;
    else if (mode === 'scale') v = s.velocity * value;
    else if (mode === 'ramp') v = startVel + (value - startVel) * (last > first ? (i - first) / (last - first) : 1);
    else v = s.velocity + (rand() * 2 - 1) * value;
    return { ...s, velocity: clampVel(v), chordVelocities: s.chordVelocities?.map((cv) => clampVel(mode === 'scale' ? cv * value : v)) };
  });
}

/** Each note lasts until the next one (wrapping at the pattern end). */
export function legato(steps: Steps): Steps {
  const idx = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  return steps.map((s, i) => {
    if (!s) return s;
    const k = idx.indexOf(i);
    const next = idx[(k + 1) % idx.length];
    const len = next > i ? next - i : steps.length - i + next;
    return { ...s, length: Math.max(1, len), chordLengths: undefined };
  });
}

export function transpose(steps: Steps, semis: number): Steps {
  const t = (n: number) => Math.max(0, Math.min(127, n + semis));
  return steps.map((s) => (s ? { ...s, note: t(s.note), chordNotes: s.chordNotes?.map(t) } : s));
}

/** Snaps every pitch with `snap` (e.g. the engine's scale snap). */
export function snapPitches(steps: Steps, snap: (midi: number) => number): Steps {
  return steps.map((s) => (s ? { ...s, note: snap(s.note), chordNotes: s.chordNotes?.map(snap) } : s));
}

/** Longest strum: a chord's notes start at most this many ms apart. */
export const STRUM_MAX_MS = 40;

/** Strum tool: each chord's notes start `ms` apart, lowest first (a finger rolling over the strings). Steps without a chord are unchanged. */
export function strum(steps: Steps, ms: number): Steps {
  const v = Math.round(Math.max(0, Math.min(STRUM_MAX_MS, ms)));
  return steps.map((s) => (s && (s.chordNotes?.length ?? 0) > 0 ? { ...s, strum: v || undefined } : s));
}

/** Start delay in seconds of each pitch in a strummed chord (ties keep their order); all 0 without a strum. */
export function strumDelays(pitches: readonly number[], ms: number): number[] {
  const step = Math.max(0, Math.min(STRUM_MAX_MS, ms)) / 1000;
  const out = pitches.map(() => 0);
  if (!step || pitches.length < 2) return out;
  pitches
    .map((p, i) => [p, i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .forEach(([, i], rank) => {
      out[i] = rank * step;
    });
  return out;
}
