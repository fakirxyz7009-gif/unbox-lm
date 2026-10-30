/**
 * The transcription jobs the app runs, as plain functions of mono samples. The app runs them in a Web Worker
 * (src/audio/ai/transcribeInBackground.ts) so a long clip does not freeze the page; the tests run them directly.
 * Pure math; no DOM or Node APIs.
 */
import { transcribeDrums, transcribeMelody, type DrumHit, type TimedNote } from './transcribe.ts';
import { transcribePolyphonic } from './polyphonic.ts';
import { transcribeSource, type SourceTranscription } from './autoTranscribe.ts';
import { detectKey, type KeyEstimate } from '../analysis/keyDetection.ts';

export interface TranscribeResults {
  /** What an audio clip holds: kit hits, pitched notes, or the part that dominates (see autoTranscribe.ts). */
  source: SourceTranscription;
  /** Kit hits of a percussion stem, with the tempo their spacing suggests. */
  drums: { hits: DrumHit[]; tempo: number | null };
  /** Several notes at once: keys, guitar, the "other" stem. */
  chords: TimedNote[];
  /** One line (bass, vocals): the pitch tracker, or the one-voice search when the tracker finds nothing. */
  line: TimedNote[];
  /** The key of the clip (see shared/analysis/keyDetection.ts), or null without pitched content. */
  key: KeyEstimate | null;
}

export type TranscribeKind = keyof TranscribeResults;

function singleLine(samples: Float32Array, sampleRate: number): TimedNote[] {
  const tracked = transcribeMelody(samples, sampleRate);
  return tracked.length > 0 ? tracked : transcribePolyphonic(samples, sampleRate, { maxVoices: 1 });
}

/** Runs one job on mono samples. */
export function runTranscribeJob<K extends TranscribeKind>(kind: K, samples: Float32Array, sampleRate: number): TranscribeResults[K] {
  switch (kind) {
    case 'source':
      return transcribeSource(samples, sampleRate) as TranscribeResults[K];
    case 'drums':
      return transcribeDrums(samples, sampleRate) as TranscribeResults[K];
    case 'chords':
      return transcribePolyphonic(samples, sampleRate) as TranscribeResults[K];
    case 'line':
      return singleLine(samples, sampleRate) as TranscribeResults[K];
    case 'key':
      return detectKey(samples, sampleRate) as TranscribeResults[K];
    default:
      throw new Error(`Unknown transcription job: ${String(kind)}`);
  }
}
