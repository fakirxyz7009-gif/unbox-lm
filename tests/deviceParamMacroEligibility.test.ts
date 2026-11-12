import assert from 'node:assert/strict';
import test from 'node:test';
import { MatrixDevice } from '../src/audio/devices/MatrixDevice.ts';
import { deviceParams, isMacroMappableDeviceParam } from '../src/audio/deviceParams.ts';
import { BUILTIN_DEVICES } from '../shared/rack/builtinCatalog.ts';

function matrixAt(): MatrixDevice {
  const ctx = {
    currentTime: 0,
    createAnalyser: () => ({ fftSize: 0, smoothingTimeConstant: 0, disconnect() {} }),
  } as unknown as AudioContext;
  return new MatrixDevice(ctx, 'matrix-macro-eligibility');
}

test('discrete legacy Matrix step count is not a continuously mappable Rack macro target', () => {
  const steps = deviceParams(matrixAt()).find((param) => param.key === 'numSteps');
  assert.ok(steps);
  assert.equal(steps.control, 'buttons');
  assert.equal(isMacroMappableDeviceParam(steps), false);
});

test('macro eligibility defaults to deny when parameter metadata is absent', () => {
  assert.equal(isMacroMappableDeviceParam({}), false);
  assert.equal(isMacroMappableDeviceParam({ macroMappable: true }), true);
});

test('every catalog numeric parameter explicitly declares macro eligibility', () => {
  for (const device of BUILTIN_DEVICES) {
    for (const [key, range] of Object.entries(device.params)) {
      assert.notEqual(range.macroMappable, undefined, `${device.type}.${key} must declare macro eligibility`);
    }
  }
});
