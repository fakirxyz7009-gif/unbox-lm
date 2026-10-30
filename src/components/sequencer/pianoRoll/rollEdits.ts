/**
 * Note transforms for the piano roll. Pure functions (no DOM, no engine): each takes the whole
 * note list and the selection keys and returns the new list plus the notes it touched, so the roll
 * can commit once and keep the touched notes selected. With no selection a transform works on
 * every note (the FL Studio convention). A transform that cannot apply returns an error text and
 * changes nothing.
 */
import { rollKey, type RollNote } from './rollAdapters.ts';

export interface EditResult {
  notes: RollNote[];
  /** Notes the transform produced or moved: the new selection. */
  touched: RollNote[];
}
export type EditOutcome = EditResult | { error: string };

export function isEditError(outcome: EditOutcome): outcome is { error: string } {
  return 'error' in outcome;
}

const EPS = 1e-6;
const MIN_VELOCITY = 0.05;
const MAX_NOTE = 127;

interface Targets {
  targets: RollNote[];
  others: RollNote[];
}

function targetsOf(notes: RollNote[], keys: Set<string>): Targets {
  if (keys.size === 0) return { targets: notes.slice(), others: [] };
  const targets: RollNote[] = [];
  const others: RollNote[] = [];
  for (const n of notes) (keys.has(rollKey(n)) ? targets : others).push(n);
  return { targets, others };
}

/** Untouched notes first, then the touched ones; an untouched note on a touched key is dropped. */
function done(others: RollNote[], touched: RollNote[]): EditResult {
  const keys = new Set(touched.map(rollKey));
  return { notes: [...others.filter((n) => !keys.has(rollKey(n))), ...touched], touched };
}

const noTargets = (what: string): EditOutcome => ({ error: `No notes to ${what}` });

function extent(list: RollNote[]): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const n of list) {
    start = Math.min(start, n.step);
    end = Math.max(end, n.step + n.length);
  }
  return { start, end };
}

function pitchRange(list: RollNote[]): { lo: number; hi: number } {
  let lo = MAX_NOTE;
  let hi = 0;
  for (const n of list) {
    lo = Math.min(lo, n.note);
    hi = Math.max(hi, n.note);
  }
  return { lo, hi };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Time reversal: the selection's span is mirrored, so the last note becomes the first. */
export function reverseNotes(notes: RollNote[], keys: Set<string>): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('reverse');
  const { start, end } = extent(targets);
  return done(others, targets.map((n) => ({ ...n, step: round3(start + (end - (n.step + n.length))) })));
}

/** Pitch mirror around the middle of the selection's pitch range (FL "Flip" vertically). */
export function flipPitch(notes: RollNote[], keys: Set<string>): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('flip');
  const { lo, hi } = pitchRange(targets);
  return done(others, targets.map((n) => ({ ...n, note: lo + hi - n.note })));
}

/**
 * Moves the selection by `by` steps, wrapping inside `length` (FL "Rotate"). A note that crosses
 * the end is cut in two, so the part past the end comes back at the start.
 */
export function rotateNotes(notes: RollNote[], keys: Set<string>, by: number, length: number): EditOutcome {
  if (!(length > 0)) return { error: 'The pattern has no length to rotate in' };
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('rotate');
  const touched: RollNote[] = [];
  for (const n of targets) {
    const start = round3(mod(n.step + by, length));
    const tail = start + n.length - length;
    if (tail > EPS) {
      touched.push({ ...n, step: start, length: round3(length - start) }, { ...n, step: 0, length: round3(tail) });
    } else {
      touched.push({ ...n, step: start });
    }
  }
  return done(others, touched);
}

/** Shifts pitch by `semitones`; refuses when any note would leave the 0–127 range. */
export function transposeNotes(notes: RollNote[], keys: Set<string>, semitones: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('transpose');
  const moved = targets.map((n) => ({ ...n, note: n.note + semitones }));
  if (moved.some((n) => n.note < 0 || n.note > MAX_NOTE)) return { error: 'Transposing would leave the 0–127 pitch range' };
  return done(others, moved);
}

/** Multiplies note lengths by `factor` (2 = double, 0.5 = halve), never below `minLength`. */
export function scaleLengths(notes: RollNote[], keys: Set<string>, factor: number, minLength: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('resize');
  return done(others, targets.map((n) => ({ ...n, length: round3(Math.max(minLength, n.length * factor)) })));
}

/** Extends each note up to the next note of the same pitch (FL "Quick legato"). */
export function legatoNotes(notes: RollNote[], keys: Set<string>): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('extend');
  const startsByPitch = new Map<number, number[]>();
  for (const n of notes) {
    const list = startsByPitch.get(n.note) ?? [];
    list.push(n.step);
    startsByPitch.set(n.note, list);
  }
  for (const list of startsByPitch.values()) list.sort((a, b) => a - b);
  let changed = 0;
  const moved = targets.map((n) => {
    const next = (startsByPitch.get(n.note) ?? []).find((s) => s > n.step + EPS);
    if (next === undefined || next <= n.step + n.length + EPS) return n;
    changed++;
    return { ...n, length: round3(next - n.step) };
  });
  if (!changed) return { error: 'No note has a gap to close' };
  return done(others, moved);
}

/** Random timing (± `timingSteps`) and velocity (± `velocityAmount`) for the selection. */
export function humanizeNotes(
  notes: RollNote[],
  keys: Set<string>,
  timingSteps: number,
  velocityAmount: number,
  rand: () => number = Math.random
): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('humanize');
  const moved = targets.map((n) => ({
    ...n,
    step: Math.max(0, round3(n.step + (rand() * 2 - 1) * timingSteps)),
    velocity: clamp(n.velocity + (rand() * 2 - 1) * velocityAmount, MIN_VELOCITY, 1),
  }));
  return done(others, moved);
}

/** Linear velocity ramp across the selection in time order (from `from` to `to`). */
export function rampVelocity(notes: RollNote[], keys: Set<string>, from: number, to: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('ramp');
  const order = targets
    .map((_, i) => i)
    .sort((a, b) => targets[a].step - targets[b].step || targets[a].note - targets[b].note);
  const moved = targets.slice();
  order.forEach((index, rank) => {
    const t = order.length > 1 ? rank / (order.length - 1) : 0;
    moved[index] = { ...targets[index], velocity: clamp(from + (to - from) * t, MIN_VELOCITY, 1) };
  });
  return done(others, moved);
}

/** Cuts every selected note that crosses `at` into two notes meeting at that grid position. */
export function splitNotesAt(notes: RollNote[], keys: Set<string>, at: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  const keep: RollNote[] = [];
  const touched: RollNote[] = [];
  for (const n of targets) {
    if (n.step + EPS < at && at < n.step + n.length - EPS) {
      touched.push({ ...n, length: round3(at - n.step) }, { ...n, step: round3(at), length: round3(n.step + n.length - at) });
    } else {
      keep.push(n);
    }
  }
  if (!touched.length) return { error: 'The playhead is not over a note' };
  return { notes: [...others, ...keep, ...touched], touched };
}

/** Mutes (`true`) or unmutes (`false`) the selection. */
export function setMuted(notes: RollNote[], keys: Set<string>, muted: boolean): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets(muted ? 'mute' : 'unmute');
  return done(others, targets.map((n) => ({ ...n, muted: muted || undefined })));
}

/** Random velocity (± `amount`) for the selection: the velocity half of humanize. */
export function randomizeVelocity(notes: RollNote[], keys: Set<string>, amount: number, rand: () => number = Math.random): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('randomize');
  return done(others, targets.map((n) => ({ ...n, velocity: clamp(n.velocity + (rand() * 2 - 1) * amount, MIN_VELOCITY, 1) })));
}

/** Multiplies the selection's velocities by `factor` (1.1 = up 10 %, 0.9 = down 10 %). */
export function scaleVelocity(notes: RollNote[], keys: Set<string>, factor: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('change velocity');
  return done(others, targets.map((n) => ({ ...n, velocity: clamp(n.velocity * factor, MIN_VELOCITY, 1) })));
}

/** Sets every selected note to `length` steps (FL "Discard lengths"). */
export function setLengths(notes: RollNote[], keys: Set<string>, length: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  if (!targets.length) return noTargets('set lengths');
  return done(others, targets.map((n) => ({ ...n, length: round3(Math.max(EPS, length)) })));
}

/**
 * Spreads every chord of the selection into a run of single notes, lowest first, one `stepUnits`
 * apart (FL "Arpeggiate"). Notes that are not part of a chord stay where they are.
 */
export function arpeggiate(notes: RollNote[], keys: Set<string>, stepUnits: number): EditOutcome {
  const { targets, others } = targetsOf(notes, keys);
  const byStep = new Map<number, RollNote[]>();
  for (const n of targets) {
    const list = byStep.get(n.step) ?? [];
    list.push(n);
    byStep.set(n.step, list);
  }
  const touched: RollNote[] = [];
  let chords = 0;
  for (const [step, list] of byStep) {
    if (list.length < 2) {
      touched.push(...list);
      continue;
    }
    chords++;
    list
      .slice()
      .sort((a, b) => a.note - b.note)
      .forEach((n, i) => touched.push({ ...n, step: round3(step + i * stepUnits), length: round3(Math.min(n.length, stepUnits)) }));
  }
  if (!chords) return { error: 'No chords in the selection' };
  return done(others, touched);
}

/** Every note at the pitch of a selected note (FL "Select" by row). */
export function selectSamePitchKeys(notes: RollNote[], keys: Set<string>): Set<string> {
  const pitches = new Set(notes.filter((n) => keys.has(rollKey(n))).map((n) => n.note));
  return new Set(notes.filter((n) => pitches.has(n.note)).map(rollKey));
}

/** Every note that starts on the same step as a selected note: the chords of the selection. */
export function selectStackedKeys(notes: RollNote[], keys: Set<string>): Set<string> {
  const steps = new Set(notes.filter((n) => keys.has(rollKey(n))).map((n) => n.step));
  return new Set(notes.filter((n) => steps.has(n.step)).map(rollKey));
}

export function selectAllKeys(notes: RollNote[]): Set<string> {
  return new Set(notes.map(rollKey));
}

/** Swaps selected and unselected notes (FL "Invert selection"). */
export function invertKeys(notes: RollNote[], keys: Set<string>): Set<string> {
  return new Set(notes.filter((n) => !keys.has(rollKey(n))).map(rollKey));
}
