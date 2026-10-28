import test from 'node:test';
import assert from 'node:assert/strict';

import type { SpecHost } from '../src/audio/spec/SpecDevice.ts';
import { reverbEngine } from '../src/audio/spec/engines/timefx.ts';

interface FakeParam {
  value: number;
  setTargetAtTime(value: number): void;
}

interface FakeNode {
  name: string;
  gain: FakeParam;
  delayTime: FakeParam;
  pan: FakeParam;
  frequency: FakeParam;
  connect(destination: FakeNode | FakeParam, output?: number, input?: number): FakeNode;
  start(): void;
  stop(): void;
}

interface Connection {
  source: FakeNode;
  destination: FakeNode | FakeParam;
  output: number;
  input: number;
}

test('RV-7 Stereo Echoes routes both input channels into the ping-pong network', () => {
  const connections: Connection[] = [];
  const delays: FakeNode[] = [];
  let splitter: FakeNode | undefined;
  let merger: FakeNode | undefined;
  let oscillator: FakeNode | undefined;
  let nodeId = 0;
  const param = (value = 0): FakeParam => ({ value, setTargetAtTime(next) { this.value = next; } });
  const makeNode = (name: string): FakeNode => ({
    name,
    gain: param(1),
    delayTime: param(),
    pan: param(),
    frequency: param(440),
    connect(destination, output = 0, input = 0) {
      connections.push({ source: this, destination, output, input });
      return destination as FakeNode;
    },
    start() {},
    stop() {},
  });
  const ctx = {
    currentTime: 10,
    sampleRate: 1000,
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, getChannelData: (channel: number) => data[channel] } as unknown as AudioBuffer;
    },
    createConvolver: () => makeNode('convolver'),
    createGain: () => makeNode(`gain-${nodeId++}`),
    createDelay: () => {
      const delay = makeNode(`delay-${delays.length}`);
      delays.push(delay);
      return delay;
    },
    createChannelMerger: () => (merger = makeNode('merger')),
    createChannelSplitter: () => (splitter = makeNode('splitter')),
    createStereoPanner: () => makeNode('panner'),
    createOscillator: () => (oscillator = makeNode('oscillator')),
  } as unknown as BaseAudioContext;
  const input = makeNode('stereo-input');
  const output = makeNode('stereo-output');
  const host = {
    ctx,
    cfg: { model: 'rv7' },
    ins: [input as unknown as AudioNode],
    outs: [output as unknown as AudioNode],
    p: (_key: string, fallback = 0) => fallback,
    opt: (key: string) => key === 'algorithm' ? 'Stereo Echoes' : '',
  } as unknown as SpecHost;

  const engine = reverbEngine(host);

  assert.ok(splitter && merger && oscillator);
  assert.ok(connections.some((c) => c.source === splitter && c.destination === delays[0] && c.output === 0));
  assert.ok(connections.some((c) => c.source === splitter && c.destination === delays[1] && c.output === 1));
  assert.ok(connections.some((c) => c.source === delays[0] && c.destination === merger && c.input === 0));
  assert.ok(connections.some((c) => c.source === delays[1] && c.destination === merger && c.input === 1));
  engine.dispose?.();
});
