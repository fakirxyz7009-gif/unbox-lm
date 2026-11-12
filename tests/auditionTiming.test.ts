import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scheduleAudition } from '../src/audio/audition.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('faceplate auditions schedule note starts and releases on the device audio clock', () => {
  const calls: Array<{ kind: 'on' | 'off'; note: number; value: number; time: number }> = [];
  const device = {
    ctx: { currentTime: 42.25 },
    noteOn(note: number, value: number, time: number) { calls.push({ kind: 'on', note, value, time }); },
    noteOff(note: number, time?: number) { calls.push({ kind: 'off', note, value: 0, time: time ?? -1 }); },
  } as any;

  const scheduled = scheduleAudition(device, [{ note: 60, velocity: 0.8 }, { note: 67 }], 280);

  assert.ok(Math.abs(scheduled.startTime - 42.255) < 1e-12);
  assert.ok(Math.abs(scheduled.stopTime - 42.535) < 1e-12);
  assert.deepEqual(calls.map(({ time, ...call }) => call), [
    { kind: 'on', note: 60, value: 0.8 },
    { kind: 'off', note: 60, value: 0 },
    { kind: 'on', note: 67, value: 0.9 },
    { kind: 'off', note: 67, value: 0 },
  ]);
  assert.ok(calls.every((call) => Math.abs(call.time - (call.kind === 'on' ? scheduled.startTime : scheduled.stopTime)) < 1e-12));
});

test('faceplate audition durations are bounded even when a UI supplies invalid values', () => {
  const times: number[] = [];
  const device = {
    ctx: { currentTime: 1 },
    noteOn(_note: number, _value: number, time: number) { times.push(time); },
    noteOff(_note: number, time?: number) { times.push(time ?? -1); },
  } as any;

  const scheduled = scheduleAudition(device, [{ note: 60 }], Number.NaN, Number.NaN);
  assert.deepEqual(scheduled, { startTime: 1, stopTime: 1.001 });
  assert.deepEqual(times, [1, 1.001]);
});

test('faceplates never use a JavaScript timer to release a musical note', () => {
  const faceplates = [
    'src/components/faceplates/DeviceFaceplate.tsx',
    'src/components/faceplates/ReasonRackFaceplates.tsx',
    'src/components/faceplates/ThirdWaveFaceplate.tsx',
  ];
  for (const relativePath of faceplates) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /setTimeout\([\s\S]{0,240}noteOff|noteOn[\s\S]{0,240}setTimeout/,
      `${relativePath} must schedule note releases on the AudioContext clock`,
    );
  }
});
