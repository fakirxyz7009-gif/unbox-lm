/**
 * Moving a pattern's notes onto another instrument. Pure (no engine, no DOM).
 *
 * Between two pitched instruments, or two kits with the same pads, the notes are copied as they
 * are. When one side is a drum kit they are fitted, so the copy still plays something sensible:
 *  - pitched → kit: each distinct pitch (lowest first) takes the next pad, so the rhythm transfers;
 *  - kit → pitched: each pad becomes a scale note above the song's root (kick = root, snare = fifth …);
 *  - kit → another kit: pad N plays pad N.
 */
import type { SequencerNote } from '../types.ts';

export interface TransferContext {
  /** Pad notes of the source instrument when it is a drum kit, in pad order. */
  fromPads?: readonly number[] | null;
  /** Pad notes of the destination instrument when it is a drum kit, in pad order. */
  toPads?: readonly number[] | null;
  /** Song root as a pitch class (0 = C). */
  root?: number;
  /** Fits a pitch to the song's scale. */
  fit?: (midi: number) => number;
}

/** Scale steps (semitones above the root) the pads of a kit turn into on a pitched instrument. */
const PAD_DEGREES = [0, 7, 12, 3, 5, 10, 14, 19];

const samePads = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);

function pitchMap(steps: readonly (SequencerNote | null | undefined)[], ctx: TransferContext): ((note: number) => number) | null {
  const from = ctx.fromPads?.length ? ctx.fromPads : null;
  const to = ctx.toPads?.length ? ctx.toPads : null;
  if (!from && !to) return null;
  if (from && to) {
    if (samePads(from, to)) return null;
    return (note) => {
      const i = from.indexOf(note);
      return to[(i < 0 ? 0 : i) % to.length];
    };
  }
  if (to) {
    // pitched → kit: notes already on a pad stay; the others take pads in pitch order
    const pitches = new Set<number>();
    for (const s of steps) {
      if (!s) continue;
      pitches.add(s.note);
      s.chordNotes?.forEach((n) => pitches.add(n));
    }
    const all = [...pitches];
    if (all.every((n) => to.includes(n))) return null;
    const order = all.sort((a, b) => a - b);
    return (note) => to[Math.max(0, order.indexOf(note)) % to.length];
  }
  // kit → pitched
  const fit = ctx.fit ?? ((m: number) => m);
  const base = 48 + (((ctx.root ?? 0) % 12) + 12) % 12;
  return (note) => {
    const i = from!.indexOf(note);
    if (i < 0) return note;
    return Math.max(0, Math.min(127, fit(base + PAD_DEGREES[i % PAD_DEGREES.length] + 12 * Math.floor(i / PAD_DEGREES.length))));
  };
}

/** An independent copy of a note (its chord arrays too: two patterns must never share them). */
function copyNote(s: SequencerNote): SequencerNote {
  const n: SequencerNote = { ...s };
  if (s.chordNotes) n.chordNotes = [...s.chordNotes];
  if (s.chordLengths) n.chordLengths = [...s.chordLengths];
  if (s.chordVelocities) n.chordVelocities = [...s.chordVelocities];
  return n;
}

/** A copy of `steps` for the destination instrument (see the module comment for the fitting rules). */
export function transferSteps(steps: readonly (SequencerNote | null | undefined)[], ctx: TransferContext = {}): (SequencerNote | null)[] {
  const out = steps.map((s) => (s ? copyNote(s) : null));
  const map = pitchMap(steps, ctx);
  if (!map) return out;
  for (const s of out) {
    if (!s) continue;
    s.note = map(s.note);
    if (s.chordNotes?.length) {
      // two chord notes may land on one pad: keep each sound once, with its own length / velocity
      const seen = new Set<number>([s.note]);
      const notes: number[] = [];
      const lengths: number[] = [];
      const velocities: number[] = [];
      s.chordNotes.forEach((n, k) => {
        const m = map(n);
        if (seen.has(m)) return;
        seen.add(m);
        notes.push(m);
        if (s.chordLengths) lengths.push(s.chordLengths[k] ?? s.length);
        if (s.chordVelocities) velocities.push(s.chordVelocities[k] ?? s.velocity);
      });
      const hadLengths = !!s.chordLengths;
      const hadVelocities = !!s.chordVelocities;
      delete s.chordNotes;
      delete s.chordLengths;
      delete s.chordVelocities;
      if (notes.length) {
        s.chordNotes = notes;
        if (hadLengths) s.chordLengths = lengths;
        if (hadVelocities) s.chordVelocities = velocities;
      }
    }
  }
  return out;
}

/** True when two step lists play the same thing (used to reuse an identical pattern instead of piling up copies). */
export function sameSteps(a: readonly (SequencerNote | null | undefined)[], b: readonly (SequencerNote | null | undefined)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    if (x === y) continue;
    if (!x || !y || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
