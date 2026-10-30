/**
 * Basic Pitch's model output as notes. The main-thread path (basicPitch.ts) and the worker (basicPitchWorker.ts) both
 * use this, so the same model output gives the same notes wherever the model ran.
 */
import type { BasicPitch } from '@spotify/basic-pitch';
import { addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import type { TimedNote } from '../../../shared/transcription/transcribe.ts';

export const MODEL_RATE = 22050;
export const MODEL_URL = '/models/basic-pitch/model.json';
/** Onsets must be strong, and a note needs eleven frames (about 128 ms) to count: the best of the benchmark settings. */
const ONSET_THRESHOLD = 0.7;
const FRAME_THRESHOLD = 0.5;
const MIN_NOTE_FRAMES = 11;

/** The notes of a clip that is already at MODEL_RATE: start, end, pitch and loudness of each. */
export async function transcribeAtModelRate(model: Pick<BasicPitch, 'evaluateModel'>, audio: Float32Array): Promise<TimedNote[]> {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  await model.evaluateModel(
    audio,
    (f, o, c) => {
      for (const row of f) frames.push(row);
      for (const row of o) onsets.push(row);
      for (const row of c) contours.push(row);
    },
    () => {},
  );
  const events = outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES, true, null, null, true);
  return noteFramesToTime(addPitchBendsToNoteEvents(contours, events))
    .map((n) => ({
      note: n.pitchMidi,
      start: n.startTimeSeconds,
      end: n.startTimeSeconds + n.durationSeconds,
      velocity: Math.max(0.3, Math.min(1, n.amplitude)),
    }))
    .sort((a, b) => a.start - b.start);
}
