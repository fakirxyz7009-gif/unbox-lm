/**
 * Runs a transcription job without freezing the page. The signal analysis runs in a Web Worker. Pitched notes come
 * from Basic Pitch in its own worker (basicPitchWorker.ts, on TensorFlow.js's WASM backend). This thread runs the
 * model only when no worker is available or a worker job fails. Where there is no window (the Node tests) or Basic
 * Pitch cannot run, the signal analysis answers, with the same code.
 */
import { runTranscribeJob, type TranscribeKind, type TranscribeResults } from '../../../shared/transcription/transcribeJob.ts';
import { describePitched } from '../../../shared/transcription/autoTranscribe.ts';
import type { TimedNote } from '../../../shared/transcription/transcribe.ts';
import { basicPitchInWorker } from './basicPitchClient.ts';

interface Reply {
  id: number;
  result?: unknown;
  error?: string;
}

interface Waiting {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

const waiting = new Map<number, Waiting>();
let nextId = 1;
let worker: Worker | null = null;

function settleAll(error: Error): void {
  for (const job of waiting.values()) job.reject(error);
  waiting.clear();
}

/** The shared worker, made on first use; null when this environment cannot run one. */
function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  let created: Worker;
  try {
    created = new Worker(new URL('./transcribeWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  created.onmessage = (event: MessageEvent<Reply>) => {
    const job = waiting.get(event.data.id);
    if (!job) return;
    waiting.delete(event.data.id);
    if (event.data.error !== undefined) job.reject(new Error(event.data.error));
    else job.resolve(event.data.result);
  };
  created.onerror = (event: ErrorEvent) => {
    settleAll(new Error(event.message || 'The transcription worker stopped.'));
    created.terminate();
    if (worker === created) worker = null;
  };
  worker = created;
  return created;
}

/** The signal analysis of a job, in the worker when there is one. */
function analyse<K extends TranscribeKind>(kind: K, samples: Float32Array, sampleRate: number): Promise<TranscribeResults[K]> {
  const pool = ensureWorker();
  if (!pool) return Promise.resolve(runTranscribeJob(kind, samples, sampleRate));
  const id = nextId++;
  return new Promise<TranscribeResults[K]>((resolve, reject) => {
    waiting.set(id, { resolve: (result) => resolve(result as TranscribeResults[K]), reject });
    pool.postMessage({ id, kind, samples, sampleRate });
  });
}

async function mainThreadNotes(samples: Float32Array, sampleRate: number): Promise<TimedNote[]> {
  const ai = await import('./basicPitch.ts');
  return ai.transcribeWithBasicPitch(samples, sampleRate);
}

/**
 * Basic Pitch's notes for a clip, or null when this page cannot run the model (no window, or the model fails).
 * The worker runs it first; if the worker fails, this thread runs it.
 */
async function aiNotes(samples: Float32Array, sampleRate: number): Promise<TimedNote[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const inWorker = basicPitchInWorker(samples, sampleRate);
    const notes = inWorker ? await inWorker.catch(() => mainThreadNotes(samples, sampleRate)) : await mainThreadNotes(samples, sampleRate);
    return notes.length > 0 ? notes : null;
  } catch {
    return null;
  }
}

/** The result of one transcription job on a clip (mono samples at the given rate). */
export async function transcribeInBackground<K extends TranscribeKind>(
  kind: K,
  samples: Float32Array,
  sampleRate: number,
): Promise<TranscribeResults[K]> {
  if (kind === 'chords') {
    const notes = await aiNotes(samples, sampleRate);
    if (notes) return notes as TranscribeResults[K];
  }
  if (kind === 'source') {
    const source = await analyse('source', samples, sampleRate);
    if (source.kind !== 'pitched') return source as TranscribeResults[K];
    const notes = await aiNotes(samples, sampleRate);
    if (!notes) return source as TranscribeResults[K];
    return { ...source, notes, ...describePitched(notes) } as TranscribeResults[K];
  }
  return analyse(kind, samples, sampleRate);
}
