import test from 'node:test';
import assert from 'node:assert/strict';

import type { SpecHost } from '../src/audio/spec/SpecDevice.ts';
import { drivePedal } from '../src/audio/spec/engines/drive.ts';
import { ladderFilter } from '../src/audio/spec/engines/ladder.ts';
import { eqEngine } from '../src/audio/spec/engines/eq.ts';
import { karplusEngine } from '../src/audio/spec/engines/karplus.ts';
import { rotaryCabinet, stereoTremolo } from '../src/audio/spec/engines/rotary.ts';
import { tapeEcho } from '../src/audio/spec/engines/tapeEcho.ts';

interface Param {
  value: number;
  setTargetAtTime(v: number): void;
}

interface Wave {
  real: number[];
  imag: number[];
}

interface Made {
  kind: string;
  gain: Param;
  frequency: Param;
  delayTime: Param;
  Q: Param;
  type: string;
  curve?: Float32Array | null;
  oversample?: string;
  wave?: Wave;
  connect(dest: unknown, output?: number, input?: number): unknown;
  disconnect(): void;
  start(): void;
  stop(): void;
  setPeriodicWave(w: Wave): void;
}

const param = (value = 0): Param => ({
  value,
  setTargetAtTime(v: number) {
    this.value = v;
  },
});

/** A fake AudioContext that records every node it makes; params take their target value at once. */
function makeHost(cfg: Record<string, unknown>, values: Record<string, number | string>) {
  const made: Made[] = [];
  const node = (kind: string): Made => {
    const n: Made = {
      kind,
      gain: param(1),
      frequency: param(440),
      delayTime: param(0),
      Q: param(1),
      type: 'lowpass',
      connect(dest) {
        return dest;
      },
      disconnect() {},
      start() {},
      stop() {},
      setPeriodicWave(w) {
        n.wave = w;
      },
    };
    made.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 48_000,
    createBiquadFilter: () => node('biquad'),
    createGain: () => node('gain'),
    createDelay: () => node('delay'),
    createOscillator: () => node('osc'),
    createChannelSplitter: () => node('split'),
    createChannelMerger: () => node('merge'),
    createWaveShaper: () => node('shaper'),
    createBufferSource: () => node('source'),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createPeriodicWave: (real: Float32Array, imag: Float32Array): Wave => ({ real: Array.from(real), imag: Array.from(imag) }),
  };
  const host = {
    ctx,
    id: 'test-device',
    cfg,
    ins: [node('input')],
    outs: [node('output')],
    p: (key: string, fallback = 0) => (typeof values[key] === 'number' ? (values[key] as number) : fallback),
    opt: (key: string) => (typeof values[key] === 'string' ? (values[key] as string) : ''),
  } as unknown as SpecHost;
  return { host, made };
}

test('graphic EQ makes ten fixed peaking bands and drives each gain from its slider', () => {
  const { host, made } = makeHost({ model: 'graphic' }, { g0: 6, g5: -4 });
  eqEngine(host);
  const bands = made.filter((n) => n.kind === 'biquad');
  assert.equal(bands.length, 10);
  assert.deepEqual(
    bands.map((b) => b.frequency.value),
    [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  );
  assert.ok(bands.every((b) => b.type === 'peaking' && b.Q.value === 1.41));
  assert.equal(bands[0].gain.value, 6);
  assert.equal(bands[5].gain.value, -4);
  assert.equal(bands[1].gain.value, 0);
});

test('rotary cabinet: stopped rotors hold still, fast rotors sweep at the fast rates', () => {
  const stopped = makeHost({ model: 'rotary' }, { speed: 0, depth: 0.6 });
  rotaryCabinet(stopped.host);
  const stoppedOscs = stopped.made.filter((n) => n.kind === 'osc');
  assert.equal(stoppedOscs.length, 4, 'a horn and a drum LFO for each microphone');
  assert.ok(stoppedOscs.every((o) => o.frequency.value === 0));

  const fast = makeHost({ model: 'rotary' }, { speed: 2, depth: 0.6 });
  rotaryCabinet(fast.host);
  const rates = fast.made
    .filter((n) => n.kind === 'osc')
    .map((o) => o.frequency.value)
    .sort((a, b) => a - b);
  assert.deepEqual(rates, [5.6, 5.6, 6.8, 6.8]);
});

test('stereo tremolo: Opposite puts the right LFO half a cycle from the left', () => {
  const { host, made } = makeHost({ model: 'tremolo' }, { phase: 2, rate: 4.5, depth: 1 });
  stereoTremolo(host);
  const [left, right] = made.filter((n) => n.kind === 'osc');
  assert.deepEqual(left.wave?.imag.slice(0, 2), [0, 1], 'left is a sine');
  assert.deepEqual(right.wave?.imag.slice(0, 2), [0, -1], 'right is an inverted sine');
});

test('plucked string needs its AudioWorklet: without one it stays silent and disposes cleanly', async () => {
  const { host } = makeHost({}, { decay: 0.6, damp: 1 });
  const engine = karplusEngine(host);
  await engine.ready?.();
  assert.doesNotThrow(() => {
    engine.noteOn?.(69, 0.8, 0);
    engine.noteOff?.(69, 0.5);
    engine.dispose?.();
  });
});

test('drive pedal installs an oversampled shaper with the voicing curve', () => {
  const { host, made } = makeHost({ model: 'drive' }, { voicing: 2, drive: 0.5 });
  drivePedal(host);
  const shaper = made.find((n) => n.kind === 'shaper');
  assert.ok(shaper);
  assert.equal(shaper.oversample, '4x');
  assert.equal(shaper.curve?.length, 1024);
});

test('tape echo builds its loop with wow and flutter oscillators in either mode', () => {
  for (const mode of ['Tape', 'Bucket Brigade']) {
    const { host, made } = makeHost({ model: 'tape' }, { mode, time: 300, feedback: 0.4 });
    tapeEcho(host);
    assert.equal(made.filter((n) => n.kind === 'osc').length, 2, mode);
    assert.equal(made.filter((n) => n.kind === 'delay').length, 1, mode);
  }
});

test('ladder filter passes the signal through when AudioWorklet is unavailable', async () => {
  const { host } = makeHost({ model: 'ladder' }, { freq: 900, res: 1 });
  const engine = ladderFilter(host);
  await engine.ready?.();
  assert.doesNotThrow(() => engine.onParam?.('freq'));
});
