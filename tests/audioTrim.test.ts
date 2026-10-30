import test from 'node:test';
import assert from 'node:assert/strict';

import { dropLead } from '../shared/audio/trim.ts';

test('dropLead keeps the samples after the lead, of the requested length', () => {
  const [out] = dropLead([Float32Array.from([1, 2, 3, 4, 5])], 2, 2);
  assert.deepEqual(Array.from(out), [3, 4]);
});

test('dropLead pads with silence where the source runs out, and keeps channels apart', () => {
  const [left, right] = dropLead([Float32Array.from([1, 2]), Float32Array.from([7, 8, 9])], 1, 4);
  assert.deepEqual(Array.from(left), [2, 0, 0, 0]);
  assert.deepEqual(Array.from(right), [8, 9, 0, 0]);
});

test('dropLead with no lead is a copy of the start', () => {
  const source = Float32Array.from([0.5, -0.5]);
  const [out] = dropLead([source], 0, 2);
  assert.deepEqual(Array.from(out), [0.5, -0.5]);
  assert.notEqual(out, source, 'a copy, not the same array');
});
