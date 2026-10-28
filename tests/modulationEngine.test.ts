import test from 'node:test';
import assert from 'node:assert/strict';

import type { SpecHost } from '../src/audio/spec/SpecDevice.ts';
import { modulationEngine } from '../src/audio/spec/engines/modulation.ts';

function fixture(model: string) {
  const periodicWaves: { real: number[]; imag: number[] }[] = [];
  const starts: { id: number; time: number }[] = [];
  const stops: number[] = [];
  const setWaves: object[] = [];
  let oscillatorCount = 0;
  const makeParam = (value = 0) => ({
    value,
    setTargetAtTime(next: number) { this.value = next; },
  });
  const makeNode = () => ({
    connect() { return this; },
    disconnect() {},
    gain: makeParam(1),
    delayTime: makeParam(),
    pan: makeParam(),
    frequency: makeParam(440),
    detune: makeParam(),
    Q: makeParam(1),
  });
  const ctx = {
    currentTime: 2,
    createPeriodicWave(real: Float32Array, imag: Float32Array) {
      const wave = { real: Array.from(real), imag: Array.from(imag) };
      periodicWaves.push(wave);
      return wave as unknown as PeriodicWave;
    },
    createChannelSplitter: () => makeNode(),
    createChannelMerger: () => makeNode(),
    createOscillator() {
      const id = oscillatorCount++;
      const oscillator = {
        ...makeNode(),
        start(time: number) { starts.push({ id, time }); },
        stop() { stops.push(id); },
        setPeriodicWave(wave: PeriodicWave) { setWaves.push(wave as unknown as object); },
      };
      return oscillator;
    },
    createDelay: () => makeNode(),
    createGain: () => makeNode(),
    createBiquadFilter: () => makeNode(),
    createWaveShaper: () => makeNode(),
    createStereoPanner: () => makeNode(),
    sampleRate: 48_000,
  } as unknown as BaseAudioContext;
  const input = makeNode() as unknown as AudioNode;
  const output = makeNode() as unknown as AudioNode;
  const host = {
    ctx,
    cfg: { model },
    ins: [input],
    outs: [output],
    p: (_key: string, fallback = 0) => fallback,
  } as unknown as SpecHost;

  return { periodicWaves, starts, stops, setWaves, host };
}

test('chorus/flanger stereo LFOs stay in quadrature at the same start time', () => {
  const f = fixture('cf101');
  const engine = modulationEngine(f.host);

  assert.equal(f.periodicWaves.length, 2);
  assert.deepEqual(f.periodicWaves[0], { real: [0, 0], imag: [0, 1] });
  assert.deepEqual(f.periodicWaves[1], { real: [0, 1], imag: [0, 0] });
  assert.equal(f.setWaves.length, 2);
  assert.deepEqual(f.starts, [{ id: 0, time: 2 }, { id: 1, time: 2 }]);
  engine.dispose?.();
  assert.deepEqual(f.stops, [0, 1]);
});

test('phaser, sweeper, and unison stop their LFOs when disposed', () => {
  for (const [model, expected] of [['ph90', 1], ['sweeper', 1], ['un16', 16]] as const) {
    const f = fixture(model);
    const engine = modulationEngine(f.host);
    engine.dispose?.();
    assert.equal(f.stops.length, expected, `${model} should stop every started LFO`);
  }
});
