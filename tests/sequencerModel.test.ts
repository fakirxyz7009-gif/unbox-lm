import test from 'node:test';
import assert from 'node:assert/strict';
import { makePattern, normalizeTrackSequencerData } from '../src/audio/sequencer/model.ts';
import type { ArrangementClip, SequencerTrack } from '../src/audio/types.ts';

function audioTrackWith(clip: ArrangementClip): SequencerTrack {
  const pattern = makePattern({ id: 'pat_audio', length: 16 });
  return {
    id: 'track_audio',
    deviceId: 'device_audio',
    name: 'Recorded audio',
    color: '#14b8a6',
    kind: 'audio',
    steps: pattern.steps,
    patternList: [pattern],
    activePatternId: pattern.id,
    arrangementClips: [clip],
  } as SequencerTrack;
}

test('normalizing a saved audio arrangement clip preserves its audio source and edit state', () => {
  const source: ArrangementClip = {
    id: 'clip_audio',
    kind: 'audio',
    startBar: 1.25,
    lengthBars: 2.5,
    name: 'Lead vocal take',
    color: '#14b8a6',
    audioId: 'audio_take_01',
    audioOffset: 0.375,
    gainDb: -2.5,
    fadeIn: 0.02,
    fadeOut: 0.08,
    reverse: true,
    pitch: -3,
    invertPhase: true,
    fadeCurve: 'equal_power',
    warp: 'repitch',
    sourceBpm: 104,
    loopAudio: true,
    loopSec: 0.5,
    takes: [
      { id: 'take_a', audioId: 'audio_take_01', name: 'Take 1' },
      { id: 'take_b', audioId: 'audio_take_02', name: 'Take 2' },
    ],
  };
  const track = audioTrackWith(source);

  normalizeTrackSequencerData(track, 16);

  assert.equal(track.arrangementClips?.length, 1);
  const normalized = track.arrangementClips![0]!;
  assert.equal(normalized.kind, 'audio');
  assert.deepEqual(normalized, source);
});
