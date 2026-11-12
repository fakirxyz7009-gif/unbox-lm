import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRecipe } from '../scripts/instruments/recipe.ts';

test('recipe keyRange clips zones to the recorded instrument range', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-recipe-'));
  try {
    fs.writeFileSync(path.join(dir, 'C3.wav'), 'sample');
    fs.writeFileSync(path.join(dir, 'C5.wav'), 'sample');
    const recipePath = path.join(dir, 'recipe.json');
    fs.writeFileSync(recipePath, JSON.stringify({
      id: 'range-test',
      name: 'Range Test',
      kind: 'melodic',
      category: 'keys',
      license: { spdx: 'CC0-1.0', author: 'test' },
      notes: ['C3.wav', 'C5.wav'],
      keyRange: [48, 72],
      trimStart: false,
      loop: false,
    }));

    const { zones } = loadRecipe(recipePath, () => {});
    assert.deepEqual(zones.map(({ lokey, hikey, root }) => ({ lokey, hikey, root })), [
      { lokey: 48, hikey: 60, root: 48 },
      { lokey: 61, hikey: 72, root: 72 },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('recipe rejects invalid MIDI key ranges', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-recipe-'));
  try {
    const recipePath = path.join(dir, 'recipe.json');
    fs.writeFileSync(recipePath, JSON.stringify({
      id: 'bad-range',
      name: 'Bad Range',
      kind: 'melodic',
      license: { spdx: 'CC0-1.0', author: 'test' },
      keyRange: [80, 40],
      notes: [{ file: 'missing-C3.wav' }],
      trimStart: false,
    }));

    assert.throws(() => loadRecipe(recipePath, () => {}), /keyRange must be an ordered pair/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('melodic recipe can keep percussive strikes ringing after key-up', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-recipe-'));
  try {
    fs.writeFileSync(path.join(dir, 'C5.wav'), 'sample');
    const recipePath = path.join(dir, 'recipe.json');
    const recipe = {
      id: 'mallet-test', name: 'Mallet Test', kind: 'melodic',
      license: { spdx: 'CC0-1.0', author: 'test' },
      notes: ['C5.wav'], trimStart: false, oneShot: true,
    };
    fs.writeFileSync(recipePath, JSON.stringify(recipe));
    assert.equal(loadRecipe(recipePath, () => {}).meta.oneShot, true);
    fs.writeFileSync(recipePath, JSON.stringify({ ...recipe, oneShot: 'true' }));
    assert.throws(() => loadRecipe(recipePath, () => {}), /oneShot must be a boolean/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
