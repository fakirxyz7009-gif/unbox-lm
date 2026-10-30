import test from 'node:test';
import assert from 'node:assert/strict';
import { CVEngine } from '../src/audio/CVEngine.ts';
import { cvMatrixSection } from '../src/audio/cvMatrixSection.ts';

const route = {
  sourceDeviceId: 'matrix_a',
  sourcePortId: 'note_cv',
  targetDeviceId: 'osc_a',
  targetParam: 'pitch',
  amount: 0.5,
  offset: 0.25,
  inverted: true,
};

test('a route edited in the CV Matrix window keeps its amount, offset and inversion after a reload', () => {
  const before = new CVEngine();
  before.addMatrixEntry(route);
  const saved = cvMatrixSection(before).save();

  // On load the cable rebuilds its own route with default values; the saved route must win.
  const after = new CVEngine();
  const rebuilt = after.addMatrixEntry({ ...route, sourceDeviceId: 'matrix_b', targetDeviceId: 'osc_b', amount: 1, offset: 0, inverted: false });
  cvMatrixSection(after).load(saved, new Map([['matrix_a', 'matrix_b'], ['osc_a', 'osc_b']]));

  assert.equal(after.matrixEntries.length, 1, 'the cable route was duplicated instead of matched');
  assert.deepEqual(after.matrixEntries[0], {
    id: rebuilt,
    sourceDeviceId: 'matrix_b',
    sourcePortId: 'note_cv',
    targetDeviceId: 'osc_b',
    targetParam: 'pitch',
    amount: 0.5,
    offset: 0.25,
    inverted: true,
  });
});

test('a window route with no cable is added, and a route whose device did not come back is skipped', () => {
  const saved = { routes: [
    { ...route },
    { ...route, targetDeviceId: 'gone_device' },
  ] };
  const engine = new CVEngine();
  cvMatrixSection(engine).load(saved, new Map([['matrix_a', 'matrix_b'], ['osc_a', 'osc_b']]));
  assert.equal(engine.matrixEntries.length, 1);
  assert.equal(engine.matrixEntries[0].targetDeviceId, 'osc_b');
});

test('two identical saved routes match two existing routes instead of collapsing into one', () => {
  const engine = new CVEngine();
  engine.addMatrixEntry({ ...route, sourceDeviceId: 'matrix_b', targetDeviceId: 'osc_b', amount: 1, offset: 0, inverted: false });
  cvMatrixSection(engine).load(
    { routes: [route, { ...route, amount: -0.3 }] },
    new Map([['matrix_a', 'matrix_b'], ['osc_a', 'osc_b']]),
  );
  assert.equal(engine.matrixEntries.length, 2);
  assert.deepEqual(engine.matrixEntries.map((m) => m.amount), [0.5, -0.3]);
});

test('a project without the block leaves the routes that cables rebuilt untouched', () => {
  const engine = new CVEngine();
  const id = engine.addMatrixEntry(route);
  cvMatrixSection(engine).load(undefined, new Map());
  assert.deepEqual(engine.matrixEntries.map((m) => m.id), [id]);
});
