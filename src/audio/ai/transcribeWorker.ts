/**
 * The Web Worker that runs the signal analysis of transcription jobs (see transcribeInBackground.ts). A message
 * carries the job; the reply carries its result, or the error text when the job fails. Basic Pitch does not run
 * here: TensorFlow.js draws on WebGL, and WebGL is not available in a worker in this build.
 */
import { runTranscribeJob, type TranscribeKind } from '../../../shared/transcription/transcribeJob.ts';

interface JobMessage {
  id: number;
  kind: TranscribeKind;
  samples: Float32Array;
  sampleRate: number;
}

self.onmessage = (event: MessageEvent<JobMessage>) => {
  const { id, kind, samples, sampleRate } = event.data;
  try {
    self.postMessage({ id, result: runTranscribeJob(kind, samples, sampleRate) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
