import test from 'node:test';
import assert from 'node:assert/strict';

import { DEVICE_SPECS, SPEC_BY_TYPE } from '../shared/rack/devices/index.ts';
import { ORIGINAL_SPECS } from '../shared/rack/devices/original.ts';

test('every original device is in the catalog under its own type id', () => {
  for (const spec of ORIGINAL_SPECS) {
    assert.equal(SPEC_BY_TYPE.get(spec.type), spec);
    assert.ok(DEVICE_SPECS.includes(spec), `${spec.type} is in DEVICE_SPECS`);
  }
});

test('device type ids are unique across the catalog', () => {
  const types = DEVICE_SPECS.map((s) => s.type);
  assert.equal(new Set(types).size, types.length);
});

test('original device parameters are unique, in range and include Mix on every effect', () => {
  for (const spec of ORIGINAL_SPECS) {
    const keys = spec.params.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, `${spec.type}: duplicate parameter keys`);
    for (const p of spec.params) {
      if (p.options) {
        assert.ok(p.default >= 0 && p.default < p.options.length, `${spec.type}.${p.key}: default is an option index`);
      } else {
        assert.ok(p.default >= p.min && p.default <= p.max, `${spec.type}.${p.key}: default ${p.default} is outside ${p.min}..${p.max}`);
      }
    }
    if (spec.kind === 'effect') assert.ok(keys.includes('mix'), `${spec.type}: effects carry a Mix control`);
    assert.equal(spec.family, 'hardware');
    assert.ok(spec.tags.length > 0, `${spec.type} has tags`);
  }
});

test('original device names and text avoid product names that are not ours', () => {
  const banned = /303|roland|moog|leslie|klon|tube screamer|ibanez|space echo|\bCZ\b|\bRat\b|\bLA-?2A\b|1176/i;
  for (const spec of ORIGINAL_SPECS) {
    const text = [spec.name, spec.short, spec.description, ...spec.tags, spec.panel.logo ?? '', spec.panel.tagline ?? ''].join(' ');
    assert.ok(!banned.test(text), `${spec.type}: "${text.match(banned)?.[0]}" in visible text`);
  }
});
