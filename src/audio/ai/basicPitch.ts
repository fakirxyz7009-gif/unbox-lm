/**
 * Polyphonic transcription with Spotify's Basic Pitch model (Apache-2.0), run with TensorFlow.js. It runs in the
 * transcription worker (transcribeWorker.ts): the model is about 0.9 MB and is served from public/models.
 * Its notes come with pitch bends. Thresholds were chosen on the bundled benchmark clips.
 */
import * as tf from '@tensorflow/tfjs';
import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import type { TimedNote } from '../../../shared/transcription/transcribe.ts';
import { resample } from '../../../shared/audio/resample.ts';

const MODEL_RATE = 22050;
const MODEL_URL = '/models/basic-pitch/model.json';
/** Onsets must be strong, and a note needs eleven frames (about 128 ms) to count: the best of the benchmark settings. */
const ONSET_THRESHOLD = 0.7;
const FRAME_THRESHOLD = 0.5;
const MIN_NOTE_FRAMES = 11;

let model: BasicPitch | null = null;

function engine(): BasicPitch {
  if (!model) {
    const loading = tf.loadGraphModel(MODEL_URL);
    // A failed load is retried on the next job instead of being kept.
    loading.catch(() => {
      model = null;
    });
    model = new BasicPitch(loading);
  }
  return model;
}

/** Whether this environment can run the model at all (TensorFlow.js needs a backend). */
export async function basicPitchAvailable(): Promise<boolean> {
  try {
    await tf.ready();
    return true;
  } catch {
    return false;
  }
}

/** The notes of a mono clip, with their start, end, pitch and loudness. */
export async function transcribeWithBasicPitch(samples: Float32Array, sampleRate: number): Promise<TimedNote[]> {
  const audio = resample(samples, sampleRate, MODEL_RATE);
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  await engine().evaluateModel(
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
