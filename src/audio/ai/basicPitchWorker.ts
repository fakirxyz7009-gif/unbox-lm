/**
 * Basic Pitch in a Web Worker, on TensorFlow.js's WASM backend. The WebGL backend draws on a window, which a worker
 * does not have, so the model runs here on WASM and the page's own thread stays free for the interface.
 */
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { BasicPitch } from '@spotify/basic-pitch';
import plainWasmUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url';
import simdWasmUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url';
import threadedSimdWasmUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url';
import { resample } from '../../../shared/audio/resample.ts';
import { MODEL_RATE, MODEL_URL, transcribeAtModelRate } from './basicPitchNotes.ts';

interface JobMessage {
  id: number;
  samples: Float32Array;
  sampleRate: number;
}

// The backend picks one of these three by what the browser supports. A missing entry fails the job, so list all of them.
setWasmPaths({
  'tfjs-backend-wasm.wasm': plainWasmUrl,
  'tfjs-backend-wasm-simd.wasm': simdWasmUrl,
  'tfjs-backend-wasm-threaded-simd.wasm': threadedSimdWasmUrl,
});

let model: Promise<BasicPitch> | null = null;

/**
 * TensorFlow.js 3.21's WASM backend fails on a Fill op with no dtype attribute, and Basic Pitch's graph has one. The
 * WebGL backend reads a missing dtype as float32, which is what this model's pipeline uses, so the WASM kernel does
 * the same. Only the missing case changes; every other call keeps its dtype.
 */
function fillDefaultsToFloat32(): void {
  const original = tf.getKernel('Fill', 'wasm');
  if (!original) return;
  tf.unregisterKernel('Fill', 'wasm');
  tf.registerKernel({
    ...original,
    kernelFunc: (params) => original.kernelFunc({ ...params, attrs: { ...params.attrs, dtype: params.attrs?.dtype ?? 'float32' } }),
  });
}

/** Loads the model once, on the WASM backend. A failed load is retried on the next job. */
function loadModel(): Promise<BasicPitch> {
  if (!model) {
    model = (async () => {
      await tf.setBackend('wasm');
      await tf.ready();
      fillDefaultsToFloat32();
      return new BasicPitch(tf.loadGraphModel(MODEL_URL));
    })();
    model.catch(() => {
      model = null;
    });
  }
  return model;
}

self.onmessage = (event: MessageEvent<JobMessage>) => {
  const { id, samples, sampleRate } = event.data;
  loadModel()
    .then((basicPitch) => transcribeAtModelRate(basicPitch, resample(samples, sampleRate, MODEL_RATE)))
    .then((notes) => self.postMessage({ id, notes }))
    .catch((error: unknown) => self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }));
};
