/**
 * Decides what an audio clip holds and transcribes the part it holds: a percussion source (kit hits), a
 * pitched source (notes, one line or several), or both. Pure math; no DOM or Node APIs.
 */
import { transcribeDrums, type DrumHit, type TimedNote } from './transcribe.ts';
import { transcribePolyphonic } from './polyphonic.ts';

/**
 * A drum-only clip is 'drums'; a clip with sustained pitch is 'pitched'. A clip with both is reported as the
 * part that dominates: separate the stems (Demucs) to get the drums and the pitched parts apart.
 */
export type SourceKind = 'silent' | 'drums' | 'pitched';

export interface SourceTranscription {
  kind: SourceKind;
  /** Kit hits: the percussion part of a drums or mixed source. */
  hits: DrumHit[];
  tempo: number | null;
  /** Pitched notes: the melodic part of a pitched or mixed source. */
  notes: TimedNote[];
  /** True when no two notes sound at once: a line, not chords. */
  monophonic: boolean;
  /** The pitch the notes sound most (weighted by length and loudness): the root of a sampler. */
  rootNote: number | null;
}

/** Kit strikes per second above which a clip counts as a rhythm. */
const STRIKE_RATE = 1.5;
/** Fewer strikes than this are an attack or a click, not a rhythm. */
const MIN_STRIKES = 4;
/** A rhythm needs kicks: a piano's attacks read as snare and hat, never as a kick. */
const MIN_KICKS = 2;
/** A pitched note counts toward coverage when it sounds this long and is this loud (0–1). */
const SOLID_SECONDS = 0.2;
const SOLID_VELOCITY = 0.5;
/**
 * Share of the clip covered by solid pitched notes. Sustained pitch that covers this much is the clip's
 * content; a drum loop's stray notes cover far less. Between the two, a rhythm with kicks decides.
 */
const PITCHED_COVER = 0.1;
const PITCHED_COVER_STRONG = 0.25;
const COVER_STEP = 0.02;
/** Two notes overlapping by less than this are a legato join, not a chord. */
const CHORD_OVERLAP = 0.03;

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

/** Strikes in the kit hits (hits within 40 ms of each other are one strike) and how many carry a kick. */
function strikesOf(hits: DrumHit[]): { count: number; kicks: number } {
  let count = 0;
  let kicks = 0;
  let last = -Infinity;
  let kickInStrike = false;
  for (const h of hits) {
    if (h.time - last > 0.04) {
      count++;
      kickInStrike = false;
    }
    if (h.cls === 'kick' && !kickInStrike) {
      kicks++;
      kickInStrike = true;
    }
    last = h.time;
  }
  return { count, kicks };
}

/** Share of the clip (in 20 ms steps) covered by at least one note. */
function coverage(notes: TimedNote[], duration: number): number {
  const steps = Math.ceil(duration / COVER_STEP);
  if (steps <= 0) return 0;
  const covered = new Uint8Array(steps);
  for (const n of notes) {
    for (let s = Math.floor(n.start / COVER_STEP); s < Math.min(steps, Math.ceil(n.end / COVER_STEP)); s++) covered[s] = 1;
  }
  let count = 0;
  for (let s = 0; s < steps; s++) count += covered[s];
  return count / steps;
}

/** True when at most one note in ten overlaps another by more than CHORD_OVERLAP. */
function isMonophonic(notes: TimedNote[]): boolean {
  let chords = 0;
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length && notes[j].start < notes[i].end - CHORD_OVERLAP; j++) {
      if (notes[j].end > notes[i].start + CHORD_OVERLAP) {
        chords++;
        break;
      }
    }
  }
  return chords <= notes.length / 10;
}

function dominantNote(notes: TimedNote[]): number | null {
  const weight = new Map<number, number>();
  for (const n of notes) weight.set(n.note, (weight.get(n.note) ?? 0) + (n.end - n.start) * n.velocity);
  let best: number | null = null;
  let bestWeight = 0;
  for (const [note, w] of weight) {
    if (w > bestWeight) {
      best = note;
      bestWeight = w;
    }
  }
  return best;
}

/** Transcribes a clip into the kit hits and/or pitched notes it contains. */
/** The two facts a pitched source needs beside its notes: whether they form one line, and the root (the sampler key). */
export function describePitched(notes: TimedNote[]): { monophonic: boolean; rootNote: number | null } {
  return { monophonic: isMonophonic(notes), rootNote: dominantNote(notes) };
}

export function transcribeSource(samples: Float32Array, sampleRate: number): SourceTranscription {
  const duration = samples.length / sampleRate;
  const silent: SourceTranscription = { kind: 'silent', hits: [], tempo: null, notes: [], monophonic: true, rootNote: null };
  if (!(peakOf(samples) > 1e-4)) return silent;
  const drums = transcribeDrums(samples, sampleRate);
  const pitched = transcribePolyphonic(samples, sampleRate);
  const strikes = strikesOf(drums.hits);
  const rhythm = strikes.count >= MIN_STRIKES && strikes.count / duration >= STRIKE_RATE && strikes.kicks >= MIN_KICKS;
  const pitchCover = coverage(
    pitched.filter((n) => n.end - n.start >= SOLID_SECONDS && n.velocity >= SOLID_VELOCITY),
    duration,
  );
  let kind: SourceKind;
  if (pitchCover >= PITCHED_COVER_STRONG) kind = 'pitched';
  else if (rhythm) kind = 'drums';
  else if (pitchCover >= PITCHED_COVER) kind = 'pitched';
  else kind = strikes.count >= MIN_STRIKES ? 'drums' : 'silent';
  if (kind === 'silent') return silent;
  const isDrums = kind === 'drums';
  return {
    kind,
    hits: isDrums ? drums.hits : [],
    tempo: isDrums ? drums.tempo : null,
    notes: isDrums ? [] : pitched,
    ...(isDrums ? { monophonic: isMonophonic(pitched), rootNote: null } : describePitched(pitched)),
  };
}
