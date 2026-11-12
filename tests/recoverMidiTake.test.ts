import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveredMidiTakeId, restoreMidiJournalNotes } from '../src/audio/recording/recoverMidiTake.ts';
import type { RecordingJournalManifest, RecordingJournalMidiNote } from '../src/audio/recording/recordingJournal.ts';
import { clipAtTick, makePattern, TICKS_PER_16TH } from '../src/audio/sequencer/model.ts';
import type { ArrangementClip, ClipNote, SequencerTrack } from '../src/audio/types.ts';

function fixture() {
  const active = makePattern({ id: 'active', length: 16 });
  const target = makePattern({ id: 'capture-target', length: 4, division: '1/8', steps: [{ note: 52, velocity: 0.75, length: 1 }] });
  const existing: ArrangementClip = { id: 'existing', name: 'Existing', kind: 'notes', startBar: 1, lengthBars: 2 };
  const track: SequencerTrack = {
    id: 'piano', deviceId: 'device-piano', name: 'Piano', color: '#2563eb', mute: false, solo: false,
    kind: 'instrument', steps: active.steps, activePatternId: active.id, patternList: [active, target], arrangementClips: [existing],
  };
  const manifest: RecordingJournalManifest = {
    id: 'manifest:test-take', sessionId: 'test-take', kind: 'manifest', projectId: 'test-project',
    projectName: 'Test project', createdAt: 1, updatedAt: 1, sampleRate: 48_000, startPos: 17,
    startFrame: 512, recordEdgeConfirmed: true, bpm: 120, stepsPerBar: 16, tracks: [], midiMode: 'song_arrangement',
  };
  const row = (id: string, note: ClipNote): RecordingJournalMidiNote => ({
    id, kind: 'midi', sessionId: manifest.sessionId, trackId: track.id, patternId: target.id, note,
  });
  return { active, existing, manifest, row, target, track };
}

test('Song MIDI recovery preserves sub-step notes without changing overlapping clip playback', () => {
  const { existing, manifest, row, track } = fixture();
  const notes = [row('midi:1', { step: 17.25, length: 1.5, note: 64, velocity: 0.8 })];

  assert.equal(restoreMidiJournalNotes(track, notes, manifest), true);
  assert.equal(restoreMidiJournalNotes(track, notes, manifest), true);
  assert.equal(track.arrangementClips!.length, 2);
  const recovered = track.arrangementClips![1];
  assert.equal(recovered.id, recoveredMidiTakeId(manifest.sessionId, track.id));
  assert.equal(recovered.muted, true);
  assert.equal(recovered.startBar, 1);
  assert.equal(recovered.lengthBars, 1);
  assert.deepEqual(recovered.notes, [{ step: 1.25, length: 1.5, note: 64, velocity: 0.8 }]);
  assert.equal(clipAtTick(track, 18 * TICKS_PER_16TH, 16), existing);
});

test('Pattern MIDI recovery preserves the target division and wraps steps into an inactive pattern', () => {
  const { active, manifest, row, target, track } = fixture();
  manifest.midiMode = 'pattern_loop';
  const notes = [
    row('midi:1', { step: 2, length: 4, note: 64, velocity: 0.8 }),
    row('midi:2', { step: 10, length: 2, note: 67, velocity: 0.6 }),
  ];

  assert.equal(restoreMidiJournalNotes(track, notes, manifest), true);
  assert.equal(restoreMidiJournalNotes(track, notes, manifest), true);
  assert.equal(track.patternList!.length, 3);
  const recovered = track.patternList![2];
  assert.equal(recovered.id, recoveredMidiTakeId(manifest.sessionId, track.id));
  assert.equal(recovered.length, target.length);
  assert.equal(recovered.division, target.division);
  assert.deepEqual(recovered.steps[1], { note: 64, velocity: 0.8, length: 2, chordNotes: [67], chordLengths: undefined });
  assert.equal(track.activePatternId, active.id);
  assert.equal(track.steps, active.steps);
  assert.deepEqual(target.steps[0], { note: 52, velocity: 0.75, length: 1 });
});
