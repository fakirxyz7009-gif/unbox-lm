import assert from 'node:assert/strict';
import test from 'node:test';

import { DEVICE_SPECS } from '../shared/rack/devices/index.ts';
import {
  CALIBRATION_TARGET_PEAK,
  DEFAULT_TYPE_TRIM,
  MEASURED_TYPE_TRIM,
  MAX_TYPE_TRIM,
  RECORDED_KIT_TRIM,
  RECORDED_MELODIC_TRIM,
  levelTrimFor,
  recordedFamilyTrim,
  trimForPeak,
} from '../src/audio/levelCalibration.ts';

const instruments = DEVICE_SPECS.filter((spec) => spec.kind === 'instrument');
const synths = instruments.filter((spec) => !spec.type.startsWith('rec_')).map((spec) => spec.type);
const packs = instruments.filter((spec) => spec.type.startsWith('rec_')).map((spec) => spec.type);

test('every non-recorded built-in instrument has a measured trim', () => {
  assert.ok(synths.length > 40, 'expected the instrument catalog to be populated');
  const missing = synths.filter((type) => MEASURED_TYPE_TRIM[type] === undefined);
  assert.deepEqual(missing, [], `uncalibrated instruments (run \`npm run calibrate:levels\`): ${missing.join(', ')}`);
});

test('each recorded pack is calibrated individually', () => {
  // Packs differ by several dB from pack to pack, which is why they get their own number instead of
  // the family fallback. If this drops sharply the pack sweep was skipped or interrupted.
  const measured = packs.filter((type) => MEASURED_TYPE_TRIM[type] !== undefined);
  assert.ok(
    measured.length >= packs.length * 0.95,
    `only ${measured.length}/${packs.length} recorded packs are calibrated — re-run \`npm run calibrate:levels\``,
  );
  const missing = packs.filter((type) => MEASURED_TYPE_TRIM[type] === undefined);
  assert.deepEqual(missing, [], `uncalibrated packs: ${missing.join(', ')}`);
});

test('trims stay inside the safe gain range', () => {
  for (const [type, trim] of Object.entries(MEASURED_TYPE_TRIM)) {
    // Quiet packs need real boosts (the tuba measures 0.0725 and needs 4.83), so the bound is the
    // absurd-gain guard, not unity.
    assert.ok(trim >= 0.01 && trim <= MAX_TYPE_TRIM, `${type} has an out-of-range trim: ${trim}`);
  }
});

test('trimForPeak maps the target peak to unity and halves for double the peak', () => {
  assert.equal(trimForPeak(CALIBRATION_TARGET_PEAK), 1);
  assert.equal(trimForPeak(CALIBRATION_TARGET_PEAK * 2), 0.5);
  // A silent / unmeasurable source must not divide by zero.
  assert.equal(trimForPeak(0), MAX_TYPE_TRIM);
});

test('a pack built after the sweep still calibrates through the family fallback', () => {
  assert.equal(recordedFamilyTrim(true), RECORDED_KIT_TRIM);
  assert.equal(recordedFamilyTrim(false), RECORDED_MELODIC_TRIM);
  // Both the melodic and kit branch, for a pack the table cannot know about yet.
  assert.equal(levelTrimFor('rec_a_pack_built_tomorrow'), RECORDED_MELODIC_TRIM);
});

test('a measured pack uses its own trim, not the family value', () => {
  const sample = packs.find((type) => MEASURED_TYPE_TRIM[type] !== undefined);
  assert.ok(sample, 'expected at least one measured pack');
  assert.equal(levelTrimFor(sample!), MEASURED_TYPE_TRIM[sample!]);
  // Kits and melodic packs really do land on different numbers.
  const kit = packs.find((type) => (MEASURED_TYPE_TRIM[type] ?? 0) < RECORDED_MELODIC_TRIM);
  assert.ok(kit, 'expected at least one pack quieter than the melodic family value');
  assert.notEqual(MEASURED_TYPE_TRIM[kit!], RECORDED_MELODIC_TRIM);
});

test('measured types win over the pack family and unknown types keep the old default', () => {
  assert.equal(levelTrimFor('subtractor'), MEASURED_TYPE_TRIM.subtractor);
  assert.equal(levelTrimFor('third_wave'), MEASURED_TYPE_TRIM.third_wave);
  assert.equal(levelTrimFor('reverb'), DEFAULT_TYPE_TRIM);
  assert.equal(levelTrimFor(''), DEFAULT_TYPE_TRIM);
});

test('the instruments that were audibly out of line stay fixed', () => {
  // These four were 6–14 dB away from the rest under the old hand-written table.
  for (const type of ['monotone', 'third_wave', 'subtractor', 'europa']) {
    assert.ok(MEASURED_TYPE_TRIM[type] !== undefined, `${type} must stay calibrated`);
  }
  assert.ok(MEASURED_TYPE_TRIM.monotone > MEASURED_TYPE_TRIM.subtractor, 'monotone should no longer be the quietest synth');
  assert.ok(MEASURED_TYPE_TRIM.third_wave > 0.5, 'third_wave needs a boost, not the old default attenuation');
});
