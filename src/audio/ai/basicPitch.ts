/**
 * Polyphonic transcription with Spotify's Basic Pitch model (Apache-2.0), run with TensorFlow.js on this thread (WebGL).
 * This is the fallback: transcribeInBackground.ts runs the same model in basicPitchWorker.ts, on TensorFlow.js's WASM
 * backend, whenever a worker is available, so the page stays responsive during a transcription.
 */
import * as tf from '@tensorflow/tfjs';
import { BasicPitch } from '@spotify/basic-pitch';
import type { TimedNote } from '../../../shared/transcription/transcribe.ts';
import { resample } from '../../../shared/audio/resample.ts';
import { MODEL_RATE, MODEL_URL, transcribeAtModelRate } from './basicPitchNotes.ts';

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
  return transcribeAtModelRate(engine(), resample(samples, sampleRate, MODEL_RATE));
}
