import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYABLE_INSTRUMENT_CATEGORIES } from '../src/audio/instrumentCatalog.ts';
import { filterRecordedInstrumentCategories, isRecordedInstrument, isSamplerDevice } from '../src/studio/pages/deviceCatalogFilters.ts';

test('recorded instrument packs appear in the sampler browser filter', () => {
  assert.equal(isSamplerDevice('rec_osiris_piano'), true);
  assert.equal(isRecordedInstrument('rec_osiris_piano'), true);
});

test('recorded audio filter excludes synthesized instruments', () => {
  assert.equal(isRecordedInstrument('three_osc'), false);
  assert.equal(isRecordedInstrument('mimic'), false);
});

test('workstation LOAD recorded-only catalog contains recorded packs and no modeled instruments', () => {
  const filtered = filterRecordedInstrumentCategories(PLAYABLE_INSTRUMENT_CATEGORIES, true);
  const visible = filtered.flatMap((category) => category.items);
  assert.ok(visible.some((item) => item.type === 'rec_meta_piano'));
  assert.ok(visible.every((item) => isRecordedInstrument(item.type)));
  assert.ok(filtered.every((category) => category.items.length > 0));
});

test('workstation LOAD keeps the full catalog when recorded-only is off', () => {
  assert.deepEqual(
    filterRecordedInstrumentCategories(PLAYABLE_INSTRUMENT_CATEGORIES, false),
    PLAYABLE_INSTRUMENT_CATEGORIES,
  );
});

test('legacy sampler devices remain in the sampler browser', () => {
  assert.equal(isSamplerDevice('mimic'), true);
  assert.equal(isSamplerDevice('three_osc'), false);
});
