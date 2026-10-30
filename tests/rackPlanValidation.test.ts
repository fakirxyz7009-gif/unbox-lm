import test from 'node:test';
import assert from 'node:assert/strict';
import { planContextFromManifest, validatePlan } from '../shared/rack/patchPlan.ts';

const ctx = planContextFromManifest(null);

test('a plan with a known built-in unit and a cable to the master keeps both', () => {
  const { plan } = validatePlan({
    name: 'Hall',
    units: [{ source: 'builtin', type: 'rv7000', name: 'Cathedral', role: 'effect', params: { decay: 6, mix: 0.45 } }],
    audio: [{ from: 0, to: 'master' }],
  }, ctx);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0].type, 'rv7000');
  assert.equal(plan.audio.length, 1);
});

test('an unknown device type is dropped with a warning, and a cable to it goes with it', () => {
  const result = validatePlan({
    units: [
      { source: 'builtin', type: 'rv7000', name: 'Hall', role: 'effect', params: {} },
      { source: 'builtin', type: 'no_such_device', name: 'Ghost', role: 'effect', params: {} },
    ],
    audio: [{ from: 0, to: 1 }],
  }, ctx);
  assert.equal(result.plan.units.length, 1);
  assert.equal(result.plan.units[0].type, 'rv7000');
  // No edge may point at a unit index that does not exist after validation (the remaining unit is patched to the master).
  const units = result.plan.units.length;
  assert.ok(result.plan.audio.every((e) => e.from < units && (e.to === 'master' || e.to < units)), 'a cable points past the last unit');
  assert.ok(result.warnings.length > 0, 'the drop was not reported');
});

test('a plan that is not an object yields an empty plan instead of throwing', () => {
  const result = validatePlan('just some text', ctx);
  assert.equal(result.plan.units.length, 0);
  assert.equal(result.plan.audio.length, 0);
});
