import test from 'node:test';
import assert from 'node:assert/strict';

import type { SpecHost, SpecEngine } from '../src/audio/spec/SpecDevice.ts';
import { distortionEngine } from '../src/audio/spec/engines/distortion.ts';
import { delayEngine, reverbEngine } from '../src/audio/spec/engines/timefx.ts';

interface StoppedSource {
  kind: 'oscillator' | 'buffer';
  id: number;
  at: number | undefined;
}

function fixture(model: string) {
  const stopped: StoppedSource[] = [];
  let sourceId = 0;
  const param = (value = 0) => ({ value, setTargetAtTime(next: number) { this.value = next; } });
  const node = () => ({
    connect() { return this; },
    disconnect() {},
    gain: param(1), delayTime: param(), pan: param(), frequency: param(440),
    detune: param(), Q: param(1), threshold: param(), knee: param(), ratio: param(),
    attack: param(), release: param(), reduction: 0,
  });
  const source = (kind: StoppedSource['kind']) => {
    const id = sourceId++;
    return {
      ...node(),
      start() {},
      stop(at?: number) { stopped.push({ kind, id, at }); },
      setPeriodicWave() {},
      buffer: undefined as AudioBuffer | undefined,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
    };
  };
  const ctx = {
    currentTime: 7,
    sampleRate: 1000,
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        duration: length / sampleRate,
        getChannelData: (index: number) => data[index],
      } as unknown as AudioBuffer;
    },
    createBufferSource: () => source('buffer'),
    createOscillator: () => source('oscillator'),
    createGain: node,
    createDelay: node,
    createStereoPanner: node,
    createChannelSplitter: node,
    createChannelMerger: node,
    createConvolver: node,
    createBiquadFilter: node,
    createWaveShaper: node,
    createDynamicsCompressor: node,
  } as unknown as BaseAudioContext;
  const input = node() as unknown as AudioNode;
  const output = node() as unknown as AudioNode;
  const host = {
    ctx,
    cfg: { model },
    ins: [input],
    outs: [output],
    p: (_key: string, fallback = 0) => fallback,
    opt: (key: string) => key === 'algorithm' ? 'Hall' : key === 'preset' ? 'Tape' : '',
    clock: { bpm: () => 120, isPlaying: () => false },
  } as unknown as SpecHost;
  return { host, stopped };
}

test('persistent modulation and noise sources stop when their effects are disposed', () => {
  const cases: { name: string; model: string; create(host: SpecHost): SpecEngine; count: number }[] = [
    { name: 'Pulveriser', model: 'pulveriser', create: distortionEngine, count: 1 },
    { name: 'Audiomatic', model: 'audiomatic', create: distortionEngine, count: 5 },
    { name: 'Ripley', model: 'ripley', create: delayEngine, count: 2 },
    { name: 'RV-7', model: 'rv7', create: reverbEngine, count: 1 },
  ];

  for (const item of cases) {
    const f = fixture(item.model);
    const engine = item.create(f.host);
    engine.dispose?.();
    assert.equal(f.stopped.length, item.count, `${item.name} should stop all persistent sources`);
    assert.ok(f.stopped.every((source) => source.at === 7), `${item.name} should stop at context time`);
  }
});
