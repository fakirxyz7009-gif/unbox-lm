import test from 'node:test';
import assert from 'node:assert/strict';
import type { AudioEngine } from '../src/audio/AudioEngine.ts';
import type { AudioAsset } from '../src/audio/clips/audioStore.ts';
import { addStemNotes } from '../src/audio/ai/stemNotes.ts';
import { createPlayableInstrumentFromAsset } from '../src/audio/ai/playableInstrument.ts';
import { deviceSample } from '../src/audio/deviceSamples.ts';

function createSineBuffer(hz = 440, duration = 1.0, sampleRate = 44100): AudioBuffer {
  const length = Math.round(duration * sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const env = Math.min(1, i / 200, (length - i) / 200);
    data[i] = 0.5 * env * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

test('addStemNotes transcribes polyphonic / "other" and generic stems with piano roll notes', async () => {
  const tracks: Array<{ id: string; deviceId: string; name: string; color: string; arrangementClips?: unknown[] }> = [];
  const created: Array<{ type: string; name: string }> = [];

  const engine = {
    bpm: 120,
    stepsPerBar: 16,
    tracks,
    createDevice(type: string, name: string) {
      const id = `device-${created.length}`;
      created.push({ type, name });
      tracks.push({ id: `track-${created.length}`, deviceId: id, name, color: '#ff9900', arrangementClips: [] });
      return { id };
    },
    setPlaybackMode() {},
    commitEdit() {},
    changed() {},
  } as unknown as AudioEngine;

  const buffer = createSineBuffer(440, 1.2);
  const result = await addStemNotes(engine, 'other', buffer, 'Guitar And Synth Lead');

  assert.ok(result, 'Result must not be null for "other" stem');
  assert.ok(result.noteCount > 0, 'Must transcribe notes for the "other" stem');
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'rec_meta_piano');
  assert.equal(tracks[0].arrangementClips?.length, 1);
});

test('addStemNotes transcribes drum stems into drum kit notes', async () => {
  const tracks: Array<{ id: string; deviceId: string; name: string; color: string; arrangementClips?: unknown[] }> = [];
  const created: Array<{ type: string; name: string }> = [];

  const engine = {
    bpm: 120,
    stepsPerBar: 16,
    tracks,
    createDevice(type: string, name: string) {
      const id = `device-${created.length}`;
      created.push({ type, name });
      tracks.push({ id: `track-${created.length}`, deviceId: id, name, color: '#0ea5e9', arrangementClips: [] });
      return { id };
    },
    setPlaybackMode() {},
    commitEdit() {},
    changed() {},
  } as unknown as AudioEngine;

  const buffer = createSineBuffer(60, 1.0); // low frequency kick-like
  const result = await addStemNotes(engine, 'drums', buffer, 'Separated Drums');

  assert.ok(result, 'Result must not be null for "drums"');
  assert.equal(created[0].type, 'rec_big_rusty_drums');
});

test('createPlayableInstrumentFromAsset builds tuned NN-XT sampler with arrangement clip', async () => {
  const tracks: Array<{ id: string; deviceId: string; name: string; color: string; arrangementClips?: unknown[] }> = [];
  const created: Array<{ type: string; name: string; id: string }> = [];

  const engine = {
    bpm: 120,
    stepsPerBar: 16,
    tracks,
    createDevice(type: string, name: string) {
      const id = `nnxt-${created.length}`;
      const dev = {
        id,
        type,
        name,
        ports: [],
        noteOn() {},
        noteOff() {},
        isPowered: true,
        isBypassed: false,
      };
      created.push({ type, name, id });
      tracks.push({ id: `track-${created.length}`, deviceId: id, name, color: '#10b981', arrangementClips: [] });
      return dev;
    },
    setPlaybackMode() {},
    commitEdit() {},
    changed() {},
  } as unknown as AudioEngine;

  const buf = createSineBuffer(440, 1.0); // A4 (MIDI note 69)
  const asset: AudioAsset = {
    id: 'asset-test-1',
    name: 'Solo Flute A4',
    buffer: buf,
    peaks: new Float32Array(20),
    createdAt: Date.now(),
  };

  const res = (await createPlayableInstrumentFromAsset(engine, asset, 'Playable Flute')).instruments[0];
  assert.ok(res, 'A pitched line must become an instrument');

  assert.equal(res.instrumentName, 'Playable Flute');
  assert.equal(created[0].type, 'nnxt');
  assert.equal(res.rootNote, 69, 'Tuner must detect fundamental A4 = MIDI note 69');
  assert.ok(res.noteCount > 0, 'Piano roll notes must be populated');

  // Verify device sample was configured
  const sampleState = deviceSample(res.deviceId);
  assert.ok(sampleState?.keys, 'Key sample must be attached to the device');
  assert.equal(sampleState?.keys?.audioId, 'asset-test-1');
  assert.equal(sampleState?.keys?.root, 69);
});
