import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVICE_SPECS } from '../shared/rack/devices/index.ts';
import { INSTRUMENT_PACKS } from '../shared/instruments/catalog.ts';
import { isRedistributable, packDeviceType } from '../shared/instruments/catalogTypes.ts';
import { RECORDED_STEM_TARGETS, recordedStemTarget } from '../shared/transcription/stemTargets.ts';
import { addStemNotes } from '../src/audio/ai/stemNotes.ts';
import type { AudioEngine } from '../src/audio/AudioEngine.ts';

test('stem-note defaults are shipped recorded instruments with the target kit layout', () => {
  for (const [stem, target] of Object.entries(RECORDED_STEM_TARGETS)) {
    const id = target.deviceType.slice(4).replaceAll('_', '-');
    const pack = INSTRUMENT_PACKS.find((entry) => entry.id === id);
    assert.ok(pack, `${stem} target must name a real bundled pack`);
    assert.equal(packDeviceType(pack.id), target.deviceType);
    assert.ok(isRedistributable(pack.spdx), `${stem} target must be safe for the share build`);
    const spec = DEVICE_SPECS.find((entry) => entry.type === target.deviceType);
    assert.equal(spec?.engine, 'multisample', `${stem} target must run real recorded samples, not synthesis`);
  }
  assert.deepEqual(RECORDED_STEM_TARGETS.drums.drumNotes, { kick: 36, snare: 38, hat: 42 });
  assert.equal(recordedStemTarget('other'), null);
});

function sineStem(): AudioBuffer {
  const sampleRate = 44_100;
  const data = new Float32Array(Math.round(sampleRate * 1.6));
  const add = (at: number, duration: number, hz: number) => {
    const start = Math.round(at * sampleRate);
    const frames = Math.round(duration * sampleRate);
    for (let i = 0; i < frames; i++) {
      const edge = Math.min(1, i / (0.01 * sampleRate), (frames - i) / (0.01 * sampleRate));
      data[start + i] += 0.6 * edge * Math.sin((2 * Math.PI * hz * i) / sampleRate);
    }
  };
  add(0.1, 0.5, 110);
  add(0.8, 0.5, 130.81);
  return { numberOfChannels: 1, length: data.length, sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
}

test('bass stem note extraction creates the recorded bass track, not a synthetic fallback', async () => {
  const tracks: Array<{ id: string; deviceId: string; name: string; color: string; arrangementClips?: unknown[] }> = [];
  const created: Array<{ type: string; name: string }> = [];
  const engine = {
    bpm: 120,
    stepsPerBar: 16,
    tracks,
    createDevice(type: string, name: string) {
      const id = `device-${created.length}`;
      created.push({ type, name });
      tracks.push({ id: `track-${created.length}`, deviceId: id, name, color: '#abc', arrangementClips: [] });
      return { id };
    },
    setPlaybackMode() {},
    commitEdit() {},
  } as unknown as AudioEngine;

  const result = await addStemNotes(engine, 'bass', sineStem(), 'Separated Bass');
  assert.ok(result && result.noteCount === 2);
  assert.equal(result.instrumentName, 'Growlybass (recorded)');
  assert.deepEqual(created, [{ type: 'rec_growlybass', name: 'Separated Bass' }]);
  const notes = tracks[0].arrangementClips?.[0] as { notes: Array<{ note: number }> };
  assert.deepEqual(notes.notes.map((note) => note.note), [45, 48]);
});
