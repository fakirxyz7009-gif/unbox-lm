/**
 * Runs Basic Pitch in its own worker (basicPitchWorker.ts), so transcribing a clip does not freeze the page. Returns
 * null where workers are unavailable; the caller then runs the model on this thread.
 */
import type { TimedNote } from '../../../shared/transcription/transcribe.ts';

type Reply = { id: number; notes: TimedNote[] } | { id: number; error: string };

const waiting = new Map<number, { resolve: (notes: TimedNote[]) => void; reject: (error: Error) => void }>();
let worker: Worker | null = null;
let nextId = 1;

function settleAll(error: Error): void {
  for (const job of waiting.values()) job.reject(error);
  waiting.clear();
}

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  let created: Worker;
  try {
    created = new Worker(new URL('./basicPitchWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  created.onmessage = (event: MessageEvent<Reply>) => {
    const job = waiting.get(event.data.id);
    if (!job) return;
    waiting.delete(event.data.id);
    if ('error' in event.data) job.reject(new Error(event.data.error));
    else job.resolve(event.data.notes);
  };
  created.onerror = (event: ErrorEvent) => {
    settleAll(new Error(event.message || 'The Basic Pitch worker stopped.'));
    created.terminate();
    if (worker === created) worker = null;
  };
  worker = created;
  return created;
}

/** The notes of a mono clip from the worker, or null when this environment has no worker. */
export function basicPitchInWorker(samples: Float32Array, sampleRate: number): Promise<TimedNote[]> | null {
  const pool = ensureWorker();
  if (!pool) return null;
  const id = nextId++;
  // A copy, so the caller keeps its samples; the copy then moves to the worker without a second copy.
  const copy = samples.slice();
  return new Promise<TimedNote[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    pool.postMessage({ id, samples: copy, sampleRate }, [copy.buffer]);
  });
}
