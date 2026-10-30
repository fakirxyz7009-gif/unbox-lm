import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForAudioTime } from '../src/audio/audioClockAlarm.ts';

function fakeContext(now = 4) {
  const sources: { started: number; stoppedAt: number | null; onended: (() => void) | null; disconnected: boolean }[] = [];
  const gains: { gain: { value: number }; disconnected: boolean }[] = [];
  const ctx = {
    currentTime: now,
    destination: {},
    createGain: () => {
      const gain = { gain: { value: 1 }, disconnected: false, connect: () => gain, disconnect: () => { gain.disconnected = true; } };
      gains.push(gain);
      return gain;
    },
    createConstantSource: () => {
      const source = {
        started: 0,
        stoppedAt: null as number | null,
        onended: null as (() => void) | null,
        disconnected: false,
        connect: () => ({ connect: () => undefined }),
        start: () => { source.started++; },
        stop: (time: number) => { source.stoppedAt = time; },
        disconnect: () => { source.disconnected = true; },
      };
      sources.push(source);
      return source;
    },
  };
  return { ctx: ctx as unknown as AudioContext, sources, gains };
}

test('audio-clock alarm schedules a silent source at the requested context time', async () => {
  const { ctx, sources, gains } = fakeContext(4);
  const waiting = waitForAudioTime(ctx, 8.25);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].started, 1);
  assert.equal(sources[0].stoppedAt, 8.25);
  assert.equal(gains[0].gain.value, 0);

  sources[0].onended?.();
  await waiting;
  assert.equal(sources[0].disconnected, true);
  assert.equal(gains[0].disconnected, true);
});

test('audio-clock alarm normalizes stale and invalid target times to the next context quantum', async () => {
  for (const target of [2, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { ctx, sources } = fakeContext(4);
    const waiting = waitForAudioTime(ctx, target);
    assert.equal(sources[0].stoppedAt, 4.001);
    sources[0].onended?.();
    await waiting;
  }
});

test('real-time bounce never uses a wall-clock timeout for song or tail duration', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/audio/AudioEngine.ts', import.meta.url), 'utf8'));
  const bounce = source.slice(source.indexOf('public async bounceRealtimeWav'), source.indexOf('// ----', source.indexOf('public async bounceRealtimeWav') + 1));
  assert.match(bounce, /capture\.stopAt\(bodyEnd \+ tailSec\)/);
  assert.match(bounce, /waitForAudioTime\(this\.ctx, bodyEnd\)/);
  assert.doesNotMatch(bounce, /setTimeout/);
});
