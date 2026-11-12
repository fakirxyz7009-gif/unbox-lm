import test from 'node:test';
import assert from 'node:assert/strict';
import { rollKey, type RollNote } from '../src/components/sequencer/pianoRoll/rollAdapters.ts';
import {
  arpeggiate,
  isEditError,
  randomizeVelocity,
  scaleVelocity,
  selectSamePitchKeys,
  selectStackedKeys,
  setLengths,
  type EditOutcome,
  type EditResult,
} from '../src/components/sequencer/pianoRoll/rollEdits.ts';

const note = (step: number, pitch: number, length = 1, velocity = 0.8): RollNote => ({ step, note: pitch, length, velocity });
const keysOf = (...list: RollNote[]) => new Set(list.map(rollKey));

function result(outcome: EditOutcome): EditResult {
  if (isEditError(outcome)) assert.fail(outcome.error);
  return outcome;
}

test('randomize velocity moves each selected note within the amount and keeps the rest', () => {
  const a = note(0, 60, 1, 0.5);
  const b = note(2, 62, 1, 0.5);
  const r = result(randomizeVelocity([a, b], keysOf(a), 0.2, () => 1));
  const byPitch = new Map(r.notes.map((n) => [n.note, n.velocity]));
  assert.ok(Math.abs(byPitch.get(60)! - 0.7) < 1e-9);
  assert.equal(byPitch.get(62), 0.5);
});

test('randomize velocity stays inside 0.05–1', () => {
  const r = result(randomizeVelocity([note(0, 60, 1, 0.95)], new Set(), 0.5, () => 1));
  assert.equal(r.notes[0].velocity, 1);
});

test('scale velocity multiplies the selection and clamps to 1', () => {
  const a = note(0, 60, 1, 0.8);
  const b = note(1, 62, 1, 0.95);
  const up = result(scaleVelocity([a, b], new Set(), 1.1));
  assert.ok(Math.abs(up.notes.find((n) => n.note === 60)!.velocity - 0.88) < 1e-9);
  assert.equal(up.notes.find((n) => n.note === 62)!.velocity, 1);
  const down = result(scaleVelocity([a, b], keysOf(b), 0.9));
  assert.equal(down.notes.find((n) => n.note === 60)!.velocity, 0.8);
});

test('set lengths gives the selection one length and leaves other notes alone', () => {
  const a = note(0, 60, 4);
  const b = note(4, 62, 3);
  const r = result(setLengths([a, b], keysOf(a), 1));
  assert.equal(r.notes.find((n) => n.note === 60)!.length, 1);
  assert.equal(r.notes.find((n) => n.note === 62)!.length, 3);
});

test('arpeggiate spreads a chord into a run of notes, lowest first', () => {
  const chord = [note(4, 64, 4), note(4, 60, 4), note(4, 67, 4)];
  const r = result(arpeggiate(chord, new Set(), 1));
  const run = r.notes.map((n) => [n.step, n.note, n.length]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(run, [
    [4, 60, 1],
    [5, 64, 1],
    [6, 67, 1],
  ]);
  assert.equal(r.touched.length, 3);
});

test('arpeggiate leaves single notes in place and refuses when there is no chord', () => {
  const single = note(0, 60);
  const mixed = result(arpeggiate([single, note(8, 62), note(8, 65)], new Set(), 0.5));
  assert.equal(mixed.notes.find((n) => n.note === 60)!.step, 0);
  assert.equal(isEditError(arpeggiate([note(0, 60), note(4, 62)], new Set(), 1)), true);
});

test('select same pitch picks every note at a selected pitch', () => {
  const a = note(0, 60);
  const notes = [a, note(4, 60), note(8, 62)];
  const keys = selectSamePitchKeys(notes, keysOf(a));
  assert.equal(keys.size, 2);
  assert.equal(keys.has(rollKey(notes[2])), false);
});

test('select stacked picks the notes that start with a selected note', () => {
  const a = note(4, 60);
  const notes = [a, note(4, 64), note(4, 67), note(8, 60)];
  const keys = selectStackedKeys(notes, keysOf(a));
  assert.equal(keys.size, 3);
  assert.equal(keys.has(rollKey(notes[3])), false);
});
