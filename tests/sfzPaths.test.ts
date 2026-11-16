import test from 'node:test';
import assert from 'node:assert/strict';
import { readSfz } from '../scripts/instruments/sfz.ts';

test('SFZ parent-relative sample paths remain available to repository sources', () => {
  const program = readSfz('program.sfz', () => '<region> sample=../Samples/note.wav key=60 pitch_keycenter=60');

  assert.deepEqual(program.dropped, {});
  assert.equal(program.regions.length, 1);
  assert.equal(program.regions[0]?.sample, '../Samples/note.wav');
});

test('SFZ absolute sample paths are rejected rather than read outside the source', () => {
  const program = readSfz('program.sfz', () => '<region> sample=/tmp/note.wav key=60 pitch_keycenter=60');

  assert.equal(program.regions.length, 0);
  assert.deepEqual(program.dropped, { 'absolute sample path': 1 });
});
