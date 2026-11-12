/**
 * Conversions between the piano roll's flat note list and the two stored formats:
 *  - pattern steps: one entry per step, extra notes in `chordNotes` (+ per-note lengths and
 *    velocities in `chordLengths` / `chordVelocities`); step-level settings (chance, ratchet,
 *    MPE …) travel with the notes in `meta`.
 *  - note-clip notes: already flat (`ClipNote.step` in 16ths).
 */
import type { ClipNote, SequencerNote } from '../../../audio/types.ts';

export interface RollNote {
  /** Start in grid units (pattern steps, or 16ths for note clips). Fractions = off-grid. */
  step: number;
  note: number;
  /** Length in grid units. */
  length: number;
  velocity: number;
  muted?: boolean;
  /** Everything else stored with the note (probability, ratchet, MPE …). */
  meta?: Partial<SequencerNote>;
}

const KEY_PRECISION = 1000;
export function rollKey(n: Pick<RollNote, 'step' | 'note'>): string {
  return `${Math.round(n.step * KEY_PRECISION)}|${n.note}`;
}

function metaOf(s: SequencerNote): Partial<SequencerNote> {
  const { note: _n, velocity: _v, length: _l, muted: _m, chordNotes: _c, chordLengths: _cl, chordVelocities: _cv, ...meta } = s;
  return meta;
}

export function patternToRoll(steps: readonly (SequencerNote | null | undefined)[]): RollNote[] {
  const out: RollNote[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    const meta = metaOf(s);
    const start = i + (s.microOffset || 0);
    out.push({ step: start, note: s.note, length: s.length || 1, velocity: s.velocity, muted: s.muted, meta });
    (s.chordNotes || []).forEach((cn, k) =>
      out.push({
        step: start,
        note: cn,
        length: s.chordLengths?.[k] ?? s.length ?? 1,
        velocity: s.chordVelocities?.[k] ?? s.velocity,
        muted: s.muted,
        meta,
      })
    );
  }
  return out;
}

/**
 * Rebuilds pattern steps. Notes are grouped by their nearest step; the first note of a group
 * keeps the step's settings, the fraction becomes `microOffset`. Notes starting at or beyond
 * `length` are dropped (the caller grows the pattern first).
 */
export function rollToPattern(notes: readonly RollNote[], length: number): (SequencerNote | null)[] {
  const steps: (SequencerNote | null)[] = new Array(length).fill(null);
  const groups = new Map<number, RollNote[]>();
  for (const n of notes) {
    const i = Math.round(n.step);
    if (i < 0 || i >= length) continue;
    const g = groups.get(i);
    if (g) {
      if (!g.some((x) => x.note === n.note)) g.push(n);
    } else groups.set(i, [n]);
  }
  groups.forEach((g, i) => {
    const [main, ...rest] = g;
    const frac = Math.round((main.step - i) * 1000) / 1000;
    const entry: SequencerNote = {
      ...(main.meta || {}),
      note: clampNote(main.note),
      velocity: clampVel(main.velocity),
      length: Math.max(0.25, main.length),
    };
    if (frac) entry.microOffset = frac;
    else delete entry.microOffset;
    if (main.muted) entry.muted = true;
    if (rest.length) {
      entry.chordNotes = rest.map((n) => clampNote(n.note));
      if (rest.some((n) => n.length !== main.length)) entry.chordLengths = rest.map((n) => Math.max(0.25, n.length));
      if (rest.some((n) => n.velocity !== main.velocity)) entry.chordVelocities = rest.map((n) => clampVel(n.velocity));
    }
    steps[i] = entry;
  });
  return steps;
}

export function clipNotesToRoll(notes: readonly ClipNote[]): RollNote[] {
  return notes.map((n) => {
    const { step, note, velocity, length, muted, ...meta } = n;
    return { step, note, velocity, length: length || 1, muted, meta };
  });
}

export function rollToClipNotes(notes: readonly RollNote[]): ClipNote[] {
  const seen = new Set<string>();
  const out: ClipNote[] = [];
  for (const n of notes) {
    if (n.step < 0) continue;
    const k = rollKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      ...(n.meta || {}),
      step: Math.round(n.step * 1000) / 1000,
      note: clampNote(n.note),
      velocity: clampVel(n.velocity),
      length: Math.max(0.05, n.length),
      ...(n.muted ? { muted: true } : {}),
    });
  }
  return out.sort((a, b) => a.step - b.step || a.note - b.note);
}

function clampNote(n: number): number {
  return Math.max(0, Math.min(127, Math.round(n)));
}

function clampVel(v: number): number {
  return Math.max(0.01, Math.min(1, Number.isFinite(v) ? v : 0.8));
}
