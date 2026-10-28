import test from 'node:test';
import assert from 'node:assert/strict';

import { RecordController, type RecordHost } from '../src/audio/recording/RecordController.ts';
import type { SequencerPattern, SequencerTrack } from '../src/audio/types.ts';

function createFixture() {
  let position16 = 0;
  let transportOrigin = 0;
  const node = {
    connect() {},
    disconnect() {},
    gain: { value: 1, setTargetAtTime() {} },
    channelCount: 2,
    channelCountMode: 'explicit',
    fftSize: 2048,
    getFloatTimeDomainData() {},
  };
  const context = {
    currentTime: 0,
    sampleRate: 48_000,
    baseLatency: 0,
    outputLatency: 0,
    createGain: () => node,
    createChannelSplitter: () => node,
    createChannelMerger: () => node,
    createAnalyser: () => node,
  };
  const ctx = context as unknown as AudioContext;
  const track = {
    id: 'track-piano',
    deviceId: 'device-piano',
    kind: 'instrument',
    armed: true,
    name: 'Piano',
    color: '#fff',
    steps: Array.from({ length: 16 }, () => null),
    arrangementClips: [],
  } as unknown as SequencerTrack;
  const host = {
    ctx,
    bpm: 120,
    stepsPerBar: 16,
    tracks: [track],
    devices: new Map(),
    isPlaying: false,
    isRecording: false,
    loopEnabled: false,
    playbackMode: 'song_arrangement',
    activePatternIndex: 0,
    songPosition: 0,
    audioConnections: [],
    getLoopRange: () => ({ start: 0, end: 4 }),
    getPlayheadPosition: () => position16,
    timeOfSongPosition: (pos: number) => transportOrigin + pos * 0.125,
    positionAtTime: () => position16,
    startTransport: async (startAt?: number) => {
      transportOrigin = startAt ?? ctx.currentTime;
      host.isPlaying = true;
    },
    stopTransport: () => {
      host.isPlaying = false;
    },
    seekToSongPosition: (pos: number) => {
      position16 = pos;
    },
    clickAt() {},
    masterTap: node as unknown as AudioNode,
    createAudioTrack: () => {
      throw new Error('MIDI-only recording must not create an audio track.');
    },
    enableMidiInput: async () => true,
    commitEdit() {},
    changed() {},
  } as unknown as RecordHost;

  return {
    host,
    track,
    context,
    getTransportOrigin: () => transportOrigin,
    setPosition: (pos: number) => { position16 = pos; },
    setTime: (time: number) => { context.currentTime = time; },
  };
}

function mockWindow(): () => void {
  const priorWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setInterval: () => 1, clearInterval: () => {} },
  });
  return () => {
    if (priorWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: priorWindow });
  };
}

test('armed instrument records hardware MIDI note lengths into a piano-roll clip', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    const recordedClips: { trackId: string; clipId: string }[] = [];
    recorder.onMidiClipRecorded((clip) => recordedClips.push(clip));
    assert.equal(await recorder.start(), true);
    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 60, 0.8);
    fixture.setPosition(3);
    fixture.setTime(fixture.getTransportOrigin() + 0.375);
    recorder.noteOff('device-piano', 60);
    await recorder.stop();

    const clip = fixture.track.arrangementClips?.[0];
    assert.equal(clip?.kind, 'notes');
    assert.deepEqual(recordedClips, [{ trackId: fixture.track.id, clipId: clip?.id }]);
    assert.deepEqual(clip?.notes?.map(({ note, step, length, velocity }) => ({ note, step, length, velocity })), [
      { note: 60, step: 1, length: 2, velocity: 0.8 },
    ]);
  } finally {
    restoreWindow();
  }
});

test('record start requests MIDI access for an armed instrument and keeps recording if access is unavailable', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    let requests = 0;
    fixture.host.enableMidiInput = async () => {
      requests++;
      return false;
    };
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);
    assert.equal(requests, 1);
    assert.match(recorder.message ?? '', /MIDI input is unavailable/);

    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 60, 0.8);
    fixture.setPosition(2);
    fixture.setTime(fixture.getTransportOrigin() + 0.25);
    recorder.noteOff('device-piano', 60);
    await recorder.stop();

    assert.equal(fixture.track.arrangementClips?.[0]?.kind, 'notes');
    assert.equal(fixture.track.arrangementClips?.[0]?.notes?.[0]?.note, 60);
  } finally {
    restoreWindow();
  }
});

test('Song-mode recording keeps its destination if playback mode changes before stop', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);
    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 60, 0.8);
    fixture.setPosition(3);
    fixture.setTime(fixture.getTransportOrigin() + 0.375);
    recorder.noteOff('device-piano', 60);

    fixture.host.playbackMode = 'pattern_loop';
    await recorder.stop();

    assert.equal(fixture.track.arrangementClips?.[0]?.kind, 'notes');
    assert.ok(fixture.track.steps?.every((step) => step === null));
  } finally {
    restoreWindow();
  }
});

test('Pattern-mode recording writes into the pattern selected when recording began', async () => {
  const fixture = createFixture();
  const first: SequencerPattern = {
    id: 'pattern-first', name: 'Pattern 1', color: '#fff', length: 16, division: '1/16',
    steps: Array.from({ length: 16 }, () => null),
  };
  const second: SequencerPattern = {
    id: 'pattern-second', name: 'Pattern 2', color: '#000', length: 16, division: '1/16',
    steps: Array.from({ length: 16 }, () => null),
  };
  fixture.track.patternList = [first, second];
  fixture.track.activePatternId = first.id;
  fixture.track.steps = first.steps;
  fixture.host.playbackMode = 'pattern_loop';
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);
    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 64, 0.7);
    fixture.setPosition(3);
    fixture.setTime(fixture.getTransportOrigin() + 0.375);
    recorder.noteOff('device-piano', 64);

    fixture.track.activePatternId = second.id;
    fixture.track.steps = second.steps;
    await recorder.stop();

    assert.deepEqual(first.steps[1], { note: 64, velocity: 0.7, length: 2 });
    assert.equal(second.steps.some(Boolean), false);
    assert.equal(fixture.track.arrangementClips?.length, 0);
  } finally {
    restoreWindow();
  }
});

test('same-pitch notes on separate MIDI channels keep independent recorded durations', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);

    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 60, 0.5, 0);
    fixture.setPosition(2);
    fixture.setTime(fixture.getTransportOrigin() + 0.25);
    recorder.noteOn('device-piano', 60, 0.9, 1);

    fixture.setPosition(3);
    fixture.setTime(fixture.getTransportOrigin() + 0.375);
    recorder.noteOff('device-piano', 60, 0);
    fixture.setPosition(4);
    fixture.setTime(fixture.getTransportOrigin() + 0.5);
    recorder.noteOff('device-piano', 60, 1);
    await recorder.stop();

    const notes = fixture.track.arrangementClips?.[0]?.notes ?? [];
    assert.deepEqual(notes.map(({ note, step, length, velocity }) => ({ note, step, length, velocity })), [
      { note: 60, step: 1, length: 2, velocity: 0.5 },
      { note: 60, step: 2, length: 2, velocity: 0.9 },
    ]);
  } finally {
    restoreWindow();
  }
});

test('retriggering the same pitch on one MIDI channel closes the earlier recorded note', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);

    fixture.setPosition(1);
    fixture.setTime(fixture.getTransportOrigin() + 0.125);
    recorder.noteOn('device-piano', 60, 0.5, 0);
    fixture.setPosition(3);
    fixture.setTime(fixture.getTransportOrigin() + 0.375);
    recorder.noteOn('device-piano', 60, 0.9, 0);
    fixture.setPosition(5);
    fixture.setTime(fixture.getTransportOrigin() + 0.625);
    recorder.noteOff('device-piano', 60, 0);
    await recorder.stop();

    const notes = fixture.track.arrangementClips?.[0]?.notes ?? [];
    assert.deepEqual(notes.map(({ note, step, length, velocity }) => ({ note, step, length, velocity })), [
      { note: 60, step: 1, length: 2, velocity: 0.5 },
      { note: 60, step: 3, length: 2, velocity: 0.9 },
    ]);
  } finally {
    restoreWindow();
  }
});

test('MIDI notes played during count-in are excluded from the recorded piano-roll clip', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    recorder.settings.countInBars = 1;
    assert.equal(await recorder.start(), true);
    assert.equal(recorder.state, 'count-in');

    fixture.setTime(0.5);
    recorder.noteOn('device-piano', 60, 0.7);
    recorder.noteOff('device-piano', 60);
    assert.equal(recorder.state, 'count-in');

    fixture.setPosition(0);
    fixture.setTime(fixture.getTransportOrigin());
    recorder.noteOn('device-piano', 64, 0.9);
    assert.equal(recorder.state, 'recording');
    fixture.setPosition(2);
    fixture.setTime(fixture.getTransportOrigin() + 0.25);
    recorder.noteOff('device-piano', 64);
    await recorder.stop();

    const clip = fixture.track.arrangementClips?.[0];
    assert.equal(clip?.kind, 'notes');
    assert.deepEqual(clip?.notes?.map(({ note, step, length }) => ({ note, step, length })), [
      { note: 64, step: 0, length: 2 },
    ]);
  } finally {
    restoreWindow();
  }
});

test('a held MIDI note ends at the fractional playhead position when recording stops', async () => {
  const fixture = createFixture();
  const restoreWindow = mockWindow();
  try {
    const recorder = new RecordController(fixture.host);
    assert.equal(await recorder.start(), true);
    fixture.setPosition(1.5);
    fixture.setTime(fixture.getTransportOrigin() + 0.1875);
    recorder.noteOn('device-piano', 67, 0.75);

    fixture.setPosition(3.75);
    fixture.setTime(fixture.getTransportOrigin() + 0.46875);
    await recorder.stop();

    const note = fixture.track.arrangementClips?.[0]?.notes?.[0];
    assert.equal(note?.step, 1.5);
    assert.equal(note?.length, 2.25);
  } finally {
    restoreWindow();
  }
});
