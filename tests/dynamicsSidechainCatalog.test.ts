import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SPECS } from '../shared/rack/devices/index.ts';

test('sidechain-capable dynamics devices expose an off-by-default external detector switch', () => {
  const compressors = DEVICE_SPECS.filter((spec) => spec.engine === 'dynamics' && spec.ports?.sidechain);
  assert.ok(compressors.length > 0, 'expected sidechain-capable dynamics devices in the catalog');

  for (const spec of compressors) {
    const sidechain = spec.params.find((param) => param.key === 'sidechain');
    assert.ok(sidechain, `${spec.type} exposes sidechain jacks and needs an External SC control`);
    assert.equal(sidechain.default, 0, `${spec.type} should use program detection until External SC is enabled`);
  }

  const controlsWithoutJacks = DEVICE_SPECS.filter((spec) =>
    spec.engine === 'dynamics' && !spec.ports?.sidechain && spec.params.some((param) => param.key === 'sidechain'));
  assert.deepEqual(controlsWithoutJacks, [], 'External SC controls need matching sidechain input ports');
});
