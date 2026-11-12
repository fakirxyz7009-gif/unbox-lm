import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreset, type PresetParam } from '../shared/rack/presetCraft.ts';

const params: PresetParam[] = [
  { key: 'cutoff', min: 100, max: 8000, value: 1200 },
  { key: 'resonance', min: 0, max: 1, value: 0.2 },
  { key: 'wave', min: 0, max: 2, value: 0, options: ['Saw', 'Square', 'Triangle'] },
];

test('a model answer keeps known keys, clamps them to the parameter range and lists unknown keys', () => {
  const result = validatePreset({ cutoff: 99999, resonance: -3, madeUp: 0.5 }, params);
  assert.deepEqual(result.parameters, { cutoff: 8000, resonance: 0 });
  assert.deepEqual(result.skipped, ['madeUp']);
});

test('option parameters take a choice by name (any case) or by index, clamped to the list', () => {
  assert.equal(validatePreset({ wave: 'triangle' }, params).parameters.wave, 2);
  assert.equal(validatePreset({ wave: 'SQUARE' }, params).parameters.wave, 1);
  assert.equal(validatePreset({ wave: 7 }, params).parameters.wave, 2);
  assert.equal(validatePreset({ wave: 1.4 }, params).parameters.wave, 1);
});

test('values that are not numbers are skipped rather than stored as NaN', () => {
  const result = validatePreset({ cutoff: 'bright', resonance: null }, params);
  assert.deepEqual(result.parameters, {});
  assert.deepEqual(result.skipped.sort(), ['cutoff', 'resonance']);
});

test('the array form of an answer, [{ key, value }], is read the same way', () => {
  const result = validatePreset([{ key: 'cutoff', value: '2500' }, { key: 'nope', value: 1 }], params);
  assert.deepEqual(result.parameters, { cutoff: 2500 });
  assert.deepEqual(result.skipped, ['nope']);
});

test('an answer that is neither an object nor a list changes nothing', () => {
  assert.deepEqual(validatePreset('cutoff=1', params), { parameters: {}, skipped: [] });
  assert.deepEqual(validatePreset(undefined, params), { parameters: {}, skipped: [] });
});
