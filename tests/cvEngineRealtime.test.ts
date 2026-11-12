import test from 'node:test';
import assert from 'node:assert/strict';
import { CVEngine } from '../src/audio/CVEngine.ts';
import type { BaseDevice } from '../src/audio/BaseDevice.ts';

test('CV matrix uses the supplied audio-time scheduler only while cables exist', () => {
  const tasks: ((now: number, until: number) => boolean)[] = [];
  let stops = 0;
  const cv = new CVEngine((task) => {
    tasks.push(task);
    return () => { stops++; };
  });
  const values: number[] = [];
  const source = {
    id: 'source', isPowered: true, ctx: { currentTime: 0 },
    cvOutputs: new Map([['out', { getter: (time?: number) => (time ?? 0) * 2 }]]),
  } as unknown as BaseDevice;
  const target = {
    id: 'target', isPowered: true, ctx: { currentTime: 0 },
    cvInputs: new Map([['amount', { setter: (value: number) => values.push(value) }]]),
  } as unknown as BaseDevice;

  cv.registerDevice(source);
  cv.registerDevice(target);
  const id = cv.addMatrixEntry({
    sourceDeviceId: source.id, sourcePortId: 'out', targetDeviceId: target.id,
    targetParam: 'amount', amount: 0.5, offset: 0.1, inverted: false,
  });
  assert.equal(tasks.length, 1, 'adding the first CV cable starts one shared task');
  assert.equal(tasks[0]!(0.5, 0.65), true);
  assert.equal(values.at(-1), 0.6, 'the source receives the scheduled audio time');
  assert.equal(cv.liveMeterValues.get(id), 0.6);

  cv.removeMatrixEntry(id);
  assert.equal(stops, 1, 'removing the last cable stops the shared task');
  assert.equal(tasks[0]!(0.7, 0.85), false, 'a retired task cannot continue ticking');

  cv.addMatrixEntry({
    sourceDeviceId: source.id, sourcePortId: 'out', targetDeviceId: target.id,
    targetParam: 'amount', amount: 1, offset: 0, inverted: false,
  });
  assert.equal(tasks.length, 2, 'a new cable starts a fresh task after retirement');
  cv.unregisterDevice(source.id);
  assert.equal(stops, 2, 'unregistering a cabled device stops the now-idle task');
  cv.dispose();
});

test('CV matrix publishes structural revisions but never publishes from a live tick', () => {
  const cv = new CVEngine();
  let notifications = 0;
  const stop = cv.subscribeMatrix(() => { notifications++; });
  const initialVersion = cv.matrixVersion();
  const source = {
    id: 'source', isPowered: true, ctx: { currentTime: 0 },
    cvOutputs: new Map([['out', { getter: () => 0.25 }]]), cvInputs: new Map(),
  } as unknown as BaseDevice;
  const target = {
    id: 'target', isPowered: true, ctx: { currentTime: 0 },
    cvOutputs: new Map(), cvInputs: new Map([['amount', { setter: () => undefined }]]),
  } as unknown as BaseDevice;
  cv.registerDevice(source);
  cv.registerDevice(target);
  const id = cv.addMatrixEntry({ sourceDeviceId: source.id, sourcePortId: 'out', targetDeviceId: target.id, targetParam: 'amount', amount: 1, offset: 0, inverted: false });
  const afterAdd = notifications;
  cv.tickCV(0.1);
  assert.equal(notifications, afterAdd, 'the real-time CV tick must not trigger a UI structural notification');
  cv.updateMatrixEntry(id, { amount: 0.5 });
  cv.removeMatrixEntry(id);
  assert.equal(cv.matrixVersion(), initialVersion + notifications, 'each observed structural change increments the matrix revision exactly once');
  assert.ok(notifications >= 5, 'device registration and mapping edits should be observable to an open matrix editor');
  stop();
});
