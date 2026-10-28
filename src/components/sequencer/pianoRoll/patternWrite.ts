/**
 * Writes a piano-roll note list back to a track's active pattern: the same steps the roll edits.
 * Notes that start past the pattern end are dropped (the roll grows a pattern; this does not).
 */
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { SequencerTrack } from '../../../audio/types.ts';
import { syncTrackPatterns } from '../../../audio/sequencer/model.ts';
import { rollToPattern, type RollNote } from './rollAdapters.ts';

export function writePatternRoll(engine: AudioEngine, track: SequencerTrack, next: RollNote[]): void {
  const pattern = syncTrackPatterns(track, engine.activePatternIndex);
  const steps = rollToPattern(next, pattern.length);
  for (let i = 0; i < pattern.length; i++) track.steps[i] = steps[i];
  engine.commitEdit();
}
