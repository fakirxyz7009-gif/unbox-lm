import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SPECS } from '../shared/rack/devices/index.ts';
import { LEGACY_DEVICE_TYPES, supportsDeviceType } from '../src/audio/deviceRegistry.ts';

test('device factory support covers every DeviceSpec and registered legacy factory', () => {
  assert.ok(DEVICE_SPECS.every((spec) => supportsDeviceType(spec.type)));
  assert.equal(supportsDeviceType('subtractor'), true);
  assert.equal(supportsDeviceType('automation_clip'), true);
  assert.equal(supportsDeviceType('vst_effect'), false);
  assert.equal(supportsDeviceType('missing_device_type'), false);
});

test('legacy device registry stays aligned with live and offline factories', async () => {
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync(new URL('../src/audio/AudioEngine.ts', import.meta.url), 'utf8')
  );
  const casesBetween = (startMarker: string, endMarker: string): string[] => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `Could not locate device factory region ${startMarker}`);
    return [...source.slice(start, end).matchAll(/case '([^']+)':/g)].map((match) => match[1]!).sort();
  };
  const registered = [...LEGACY_DEVICE_TYPES].sort();
  assert.deepEqual(casesBetween('private createDeviceInner', 'public createVstDevice'), registered);
  assert.deepEqual(casesBetween('private instantiateDeviceOnContext', '// Native Uncompressed Audio Exporter'), registered);
});
