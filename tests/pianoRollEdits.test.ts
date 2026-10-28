import test from 'node:test';
import assert from 'node:assert/strict';
import { rollKey, type RollNote } from '../src/components/sequencer/pianoRoll/rollAdapters.ts';
import {
  flipPitch,
  humanizeNotes,
  invertKeys,
  isEditError,
  legatoNotes,
  reverseNotes,
  rampVelocity,
  rotateNotes,
  scaleLengths,
  selectAllKeys,
  setMuted,
  splitNotesAt,
  transposeNotes,
  type EditOutcome,
  type EditResult,
} from '../src/components/sequencer/pianoRoll/rollEdits.ts';

const note = (step: number, pitch: number, length = 1, velocity = 0.8): RollNote => ({ step, note: pitch, length, velocity });
const keysOf = (...list: RollNote[]) => new Set(list.map(rollKey));

function result(outcome: EditOutcome): EditResult {
  if (isEditError(outcome)) assert.fail(outcome.error);
  return outcome;
}

test('reverse mirrors the span so the last note comes first', () => {
  const r = result(reverseNotes([note(0, 60), note(2, 62, 2), note(6, 64)], new Set()));
  const steps = Object.fromEntries(r.notes.map((n) => [n.note, n.step]));
  assert.deepEqual(steps, { 60: 6, 62: 3, 64: 0 });
  assert.equal(r.touched.length, 3);
});

test('reverse touches only the selection and keeps the rest in place', () => {
  const a = note(0, 60);
  const b = note(4, 62);
  const c = note(8, 64);
  const r = result(reverseNotes([a, b, c], keysOf(a, c)));
  const at = new Map(r.notes.map((n) => [n.note, n.step]));
  assert.equal(at.get(60), 8); // span of a and c is 0..9: 9 - 1
  assert.equal(at.get(64), 0);
  assert.equal(at.get(62), 4);
});

test('reverse with no notes is an error and changes nothing', () => {
  assert.equal(isEditError(reverseNotes([], new Set())), true);
});

test('flip mirrors pitches around the centre of the selection range', () => {
  const r = result(flipPitch([note(0, 60), note(1, 64), note(2, 67)], new Set()));
  assert.deepEqual(r.notes.map((n) => n.note).sort((x, y) => x - y), [60, 63, 67]);
});

test('rotate wraps notes around the pattern and cuts a note that crosses the end', () => {
  const crossing = result(rotateNotes([note(12, 60, 4)], new Set(), 2, 16));
  const pieces = crossing.notes.map((n) => [n.step, n.length]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(pieces, [[0, 2], [14, 2]]);
  const plain = result(rotateNotes([note(14, 60, 1)], new Set(), 4, 16));
  assert.equal(plain.notes[0].step, 2);
});

test('rotate needs a pattern length', () => {
  assert.equal(isEditError(rotateNotes([note(0, 60)], new Set(), 1, 0)), true);
});

test('transpose refuses to leave the MIDI range and otherwise shifts pitch', () => {
  assert.equal(isEditError(transposeNotes([note(0, 127)], new Set(), 1)), true);
  assert.equal(result(transposeNotes([note(0, 60)], new Set(), 12)).notes[0].note, 72);
});

test('double and halve scale lengths but never below the floor', () => {
  assert.equal(result(scaleLengths([note(0, 60, 2)], new Set(), 2, 0.25)).notes[0].length, 4);
  assert.equal(result(scaleLengths([note(0, 60, 0.25)], new Set(), 0.5, 0.5)).notes[0].length, 0.5);
});

test('legato extends a note to the next note of the same pitch only', () => {
  const r = result(legatoNotes([note(0, 60), note(4, 60), note(2, 64)], new Set()));
  assert.equal(r.notes.find((n) => n.note === 60 && n.step === 0)!.length, 4);
  assert.equal(r.notes.find((n) => n.note === 64)!.length, 1);
  assert.equal(isEditError(legatoNotes([note(0, 60, 4), note(2, 60)], new Set())), true);
});

test('humanize is deterministic with a seeded generator and stays in bounds', () => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const r = result(humanizeNotes([note(0, 60, 1, 0.99), note(0.1, 62, 1, 0.05)], new Set(), 0.25, 0.3, rand));
  for (const n of r.notes) {
    assert.ok(n.step >= 0);
    assert.ok(n.velocity >= 0.05 && n.velocity <= 1);
  }
  assert.equal(r.touched.length, 2);
  seed = 7;
  const again = result(humanizeNotes([note(0, 60, 1, 0.99), note(0.1, 62, 1, 0.05)], new Set(), 0.25, 0.3, rand));
  assert.deepEqual(again.notes, r.notes);
});

test('velocity ramp runs in time order from one value to the other', () => {
  const r = result(rampVelocity([note(4, 60), note(0, 62), note(2, 64)], new Set(), 0.4, 1));
  const byTime = [...r.notes].sort((a, b) => a.step - b.step).map((n) => +n.velocity.toFixed(3));
  assert.deepEqual(byTime, [0.4, 0.7, 1]);
});

test('split cuts a note that crosses the playhead and leaves the others alone', () => {
  const r = result(splitNotesAt([note(0, 60, 4), note(6, 62, 1)], new Set(), 1.5));
  const pieces = r.notes
    .filter((n) => n.note === 60)
    .map((n) => [n.step, n.length])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(pieces, [[0, 1.5], [1.5, 2.5]]);
  assert.equal(r.notes.filter((n) => n.note === 62).length, 1);
  assert.equal(isEditError(splitNotesAt([note(0, 60, 4)], new Set(), 0)), true);
  assert.equal(isEditError(splitNotesAt([note(0, 60, 4)], new Set(), 4)), true);
});

test('mute only changes the selection, and unmute clears the flag', () => {
  const a = note(0, 60);
  const b = note(2, 62);
  const muted = result(setMuted([a, b], keysOf(a), true));
  assert.equal(muted.notes.find((n) => n.note === 60)!.muted, true);
  assert.equal(muted.notes.find((n) => n.note === 62)!.muted, undefined);
  const back = result(setMuted(muted.notes, keysOf(a), false));
  assert.equal(back.notes.find((n) => n.note === 60)!.muted, undefined);
});

test('select all and invert partition the notes', () => {
  const a = note(0, 60);
  const b = note(2, 62);
  const c = note(4, 64);
  assert.equal(selectAllKeys([a, b, c]).size, 3);
  assert.deepEqual([...invertKeys([a, b, c], keysOf(a))].sort(), [rollKey(b), rollKey(c)].sort());
});

test('a transform that lands on an untouched note replaces that note', () => {
  const a = note(0, 60);
  const b = note(0, 61);
  const r = result(transposeNotes([a, b], keysOf(a), 1));
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].note, 61);
});
