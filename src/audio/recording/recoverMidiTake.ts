import { divisionTicks, makePattern, syncTrackPatterns, TICKS_PER_16TH } from '../sequencer/model.ts';
import type { ClipNote, SequencerPattern, SequencerTrack } from '../types.ts';
import type { RecordingJournalManifest, RecordingJournalMidiNote } from './recordingJournal.ts';

/** Stable across retries, including a process exit after saving but before deleting the journal. */
export function recoveredMidiTakeId(sessionId: string, trackId: string): string {
  return `recovered_midi_${sessionId}:${trackId}`;
}

/** Apply the ordinary Pattern recorder's step rounding, wrapping and chord behavior to a new pattern. */
function writeRecoveredPattern(pattern: SequencerPattern, notes: readonly ClipNote[]): void {
  const stepTicks = divisionTicks(pattern.division);
  for (const note of notes) {
    const step = Math.round(note.step * TICKS_PER_16TH / stepTicks) % pattern.length;
    const length = Math.max(1, Math.round(note.length * TICKS_PER_16TH / stepTicks));
    const previous = pattern.steps[step];
    if (previous && previous.note !== note.note) {
      previous.chordNotes = [...new Set([...(previous.chordNotes ?? []), note.note])];
      previous.chordLengths = undefined;
    } else {
      pattern.steps[step] = { note: note.note, velocity: note.velocity, length };
    }
  }
}

/** Restore a take without overwriting or changing playback of any existing clips or patterns. */
export function restoreMidiJournalNotes(
  track: SequencerTrack,
  rows: readonly RecordingJournalMidiNote[],
  manifest: RecordingJournalManifest,
): boolean {
  if (track.kind === 'audio') return false;
  const valid = rows.filter(({ sessionId, trackId, note }) =>
    sessionId === manifest.sessionId && trackId === track.id &&
    Number.isInteger(note?.note) && note.note >= 0 && note.note <= 127 &&
    Number.isFinite(note.step) && note.step >= 0 &&
    Number.isFinite(note.length) && note.length > 0 &&
    Number.isFinite(note.velocity) && note.velocity >= 0 && note.velocity <= 1);
  if (!valid.length) return false;

  const id = recoveredMidiTakeId(manifest.sessionId, track.id);
  const name = `${track.name} recovered MIDI take`;
  if (manifest.midiMode === 'pattern_loop') {
    if (track.patternList?.some((pattern) => pattern.id === id)) return true;
    // Loaded projects already have a pattern list. Normalize a legacy track before appending so
    // its live steps cannot later be mistaken for the first recovered pattern's steps.
    if (!track.patternList?.length) syncTrackPatterns(track);
    const patterns = track.patternList!;
    const target = patterns.find((pattern) => pattern.id === valid[0].patternId)
      ?? patterns.find((pattern) => pattern.id === track.activePatternId)
      ?? patterns[0];
    const pattern = makePattern({ id, name, color: track.color, length: target.length, division: target.division });
    writeRecoveredPattern(pattern, valid.map((row) => row.note));
    patterns.push(pattern);
    return true;
  }

  const clips = (track.arrangementClips ??= []);
  if (clips.some((clip) => clip.id === id)) return true;
  const stepsPerBar = Number.isFinite(manifest.stepsPerBar) ? Math.max(1, manifest.stepsPerBar) : 16;
  let first = Number.isFinite(manifest.startPos) ? Math.max(0, manifest.startPos) : Infinity;
  let last = 0;
  for (const { note } of valid) {
    first = Math.min(first, note.step);
    last = Math.max(last, note.step + note.length);
  }
  const startBar = Math.floor(first / stepsPerBar);
  const endBar = Math.ceil(last / stepsPerBar);
  const startStep = startBar * stepsPerBar;
  clips.push({
    id, name, color: track.color, kind: 'notes', startBar,
    lengthBars: Math.max(1 / stepsPerBar, endBar - startBar),
    // An overlapping unmuted clip supersedes earlier clips on this track and can replace its
    // active-pattern fallback, so the recovered take stays muted until the user chooses it.
    muted: true,
    notes: valid.map(({ note }) => ({
      note: note.note, velocity: note.velocity, length: note.length, step: note.step - startStep,
    })),
  });
  return true;
}
