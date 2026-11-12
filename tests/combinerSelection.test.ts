import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedCombinerName, toggleCombinerSelection, validCombinerSelection } from '../src/rack/combinerSelection.ts';

test('Rack Combiner selection only retains ungrouped eligible units', () => {
  const eligible = new Set(['instrument', 'delay', 'meter']);
  assert.deepEqual(validCombinerSelection(['instrument', 'nested-group-member', 'instrument', 'delay'], eligible), ['instrument', 'delay']);
  assert.deepEqual(toggleCombinerSelection(['instrument'], 'delay', eligible), ['instrument', 'delay']);
  assert.deepEqual(toggleCombinerSelection(['instrument', 'delay'], 'instrument', eligible), ['delay']);
  assert.deepEqual(toggleCombinerSelection(['instrument'], 'nested-group-member', eligible), ['instrument']);
});

test('Rack Combiner selection produces a bounded readable default name', () => {
  assert.equal(suggestedCombinerName(['Piano', 'Wide Delay']), 'Combiner: Piano + Wide Delay');
  assert.equal(suggestedCombinerName([]), 'Combiner');
  assert.equal(suggestedCombinerName(['A very long unit name', 'Another very long unit name'], 18), 'Combiner: A very l');
});
