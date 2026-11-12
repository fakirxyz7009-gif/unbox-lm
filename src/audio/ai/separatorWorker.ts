/**
 * The Web Worker that runs the spectral separator (see MusicSeparator.ts). A whole song takes
 * seconds; here the page keeps playing and drawing meanwhile. Messages: { id, progress } while it
 * works, then { id, stems } (the buffers are transferred) or { id, error }.
 */
import { separateSpectral, type StemSplitMode } from './spectralSeparator.ts';

interface Job {
  id: number;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  mode: StemSplitMode;
}

self.onmessage = (event: MessageEvent<Job>) => {
  const { id, left, right, sampleRate, mode } = event.data;
  try {
    const stems = separateSpectral(left, right, sampleRate, mode, (done) => self.postMessage({ id, progress: done }));
    const transfer = Object.values(stems).flatMap((s) => [s.L.buffer as ArrayBuffer, s.R.buffer as ArrayBuffer]);
    self.postMessage({ id, stems }, { transfer });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
