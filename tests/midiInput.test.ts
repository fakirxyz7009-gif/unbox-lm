import test from 'node:test';
import assert from 'node:assert/strict';
import { MIDI_NO_INPUT_GUIDANCE, MidiInput } from '../src/audio/midi/MidiInput.ts';

test('a granted but empty MIDI access can be rescanned without asking permission again', async () => {
  const listeners = new Set<EventListener>();
  const input: FakeInput = {
    id: 'impulse-25',
    name: 'Novation Impulse 25',
    state: 'connected',
    connection: 'closed',
    async open() { this.connection = 'open'; return this; },
    addEventListener(_type, listener) { listeners.add(listener); },
    send(data) { listeners.forEach((listener) => listener({ data: new Uint8Array(data) } as unknown as MIDIMessageEvent)); },
  };
  const inputs = new Map<string, MIDIInput>();
  let requests = 0;
  const access = { inputs, outputs: new Map(), onstatechange: null as ((event: Event) => void) | null };
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => { requests++; return access; } } });
  try {
    const midi = new MidiInput(() => undefined);
    assert.equal(await midi.enable(), true);
    assert.equal(midi.status, 'ready');
    assert.equal(midi.ports.length, 0);
    assert.match(MIDI_NO_INPUT_GUIDANCE, /data cable/i);

    inputs.set(input.id, input as unknown as MIDIInput);
    assert.equal(await midi.refresh(), true);
    assert.equal(requests, 1, 'refresh must reuse the granted MIDIAccess rather than prompt again');
    assert.deepEqual(midi.ports.map((port) => port.name), ['Novation Impulse 25']);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

interface FakeInput {
  id: string;
  name: string;
  state: string;
  connection: string;
  open(): Promise<FakeInput>;
  addEventListener(type: string, listener: EventListener): void;
  send(data: number[]): void;
}

test('MIDI input disconnect releases held notes and sustain', async () => {
  const listeners = new Set<EventListener>();
  const input: FakeInput = {
    id: 'impulse-25',
    name: 'Novation Impulse 25',
    state: 'connected',
    connection: 'closed',
    async open() { this.connection = 'open'; return this; },
    addEventListener(_type, listener) { listeners.add(listener); },
    send(data) { listeners.forEach((listener) => listener({ data: new Uint8Array(data) } as unknown as MIDIMessageEvent)); },
  };
  const inputs = new Map<string, MIDIInput>([['impulse-25', input as unknown as MIDIInput]]);
  const access = { inputs, outputs: new Map(), onstatechange: null as ((event: Event) => void) | null };
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => access } });
  const messages: number[][] = [];
  try {
    const midi = new MidiInput((data) => messages.push([...data]));
    assert.equal(await midi.enable(), true);
    input.send([0x90, 60, 100]);
    input.send([0xb0, 64, 127]);
    assert.equal(midi.held.has(60), true);

    input.state = 'disconnected';
    inputs.delete(input.id);
    access.onstatechange?.(new Event('statechange'));

    assert.deepEqual(messages, [[0x90, 60, 100], [0xb0, 64, 127], [0x80, 60, 0], [0xb0, 64, 0]]);
    assert.equal(midi.held.has(60), false);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('same pitch on another MIDI channel does not suppress note-off or disconnect cleanup', async () => {
  const makeInput = (id: string, channel: number) => {
    const listeners = new Set<EventListener>();
    const input: FakeInput = {
      id,
      name: id,
      state: 'connected',
      connection: 'closed',
      async open() { this.connection = 'open'; return this; },
      addEventListener(_type, listener) { listeners.add(listener); },
      send(data) { listeners.forEach((listener) => listener({ data: new Uint8Array(data) } as unknown as MIDIMessageEvent)); },
    };
    const channelStatus = (command: number) => command | channel;
    return { input, send: (command: number, note: number, velocity: number) => input.send([channelStatus(command), note, velocity]) };
  };
  const a = makeInput('controller-a', 0);
  const b = makeInput('controller-b', 1);
  const inputs = new Map<string, MIDIInput>([
    [a.input.id, a.input as unknown as MIDIInput],
    [b.input.id, b.input as unknown as MIDIInput],
  ]);
  const access = { inputs, outputs: new Map(), onstatechange: null as ((event: Event) => void) | null };
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => access } });
  const messages: number[][] = [];
  try {
    const midi = new MidiInput((data) => messages.push([...data]));
    assert.equal(await midi.enable(), true);

    a.send(0x90, 60, 100);
    b.send(0x90, 60, 90);
    a.send(0x80, 60, 0);
    assert.deepEqual(messages.at(-1), [0x80, 60, 0]);
    assert.equal(midi.held.has(60), true);

    a.send(0x90, 61, 100);
    b.send(0x90, 61, 90);
    a.input.state = 'disconnected';
    inputs.delete(a.input.id);
    access.onstatechange?.(new Event('statechange'));
    assert.deepEqual(messages.at(-1), [0x80, 61, 0]);
    assert.equal(midi.held.has(61), true);

    b.send(0x80, 60, 0);
    b.send(0x80, 61, 0);
    assert.equal(midi.held.has(60), false);
    assert.equal(midi.held.has(61), false);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('MIDI input open failures report permission causes instead of claiming the port is busy', async () => {
  const input: FakeInput = {
    id: 'impulse-25',
    name: 'Novation Impulse 25',
    state: 'connected',
    connection: 'closed',
    open: () => Promise.reject(Object.assign(new Error('The user denied access to this input.'), { name: 'NotAllowedError' })),
    addEventListener() {},
    send() {},
  };
  const access = {
    inputs: new Map<string, MIDIInput>([[input.id, input as unknown as MIDIInput]]),
    outputs: new Map<string, MIDIOutput>(),
    onstatechange: null,
  } as unknown as MIDIAccess;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => access } });
  try {
    const midi = new MidiInput(() => undefined);
    assert.equal(await midi.enable(), true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(midi.ports[0]?.error, 'MIDI permission denied while opening this input');
    assert.notEqual(midi.ports[0]?.error, 'in use by another program');
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
