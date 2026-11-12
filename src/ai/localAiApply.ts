/**
 * Applies the assistant's checked actions to the song. Every change goes through the same engine
 * calls the piano roll and the mixer use, so Undo covers it. Transforms reuse the piano roll's own
 * note functions, so an assistant "reverse" and the roll's Reverse button do exactly the same thing.
 */
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../audio/types.ts';
import { syncTrackPatterns } from '../audio/sequencer/model.ts';
import type { AssistantAction, AssistantContext, AssistantNote, TransformOp } from '../../shared/localAi/assistant.ts';
import { clipNotesToRoll, patternToRoll, rollKey, rollToClipNotes, type RollNote } from '../components/sequencer/pianoRoll/rollAdapters.ts';
import { writePatternRoll } from '../components/sequencer/pianoRoll/patternWrite.ts';
import {
  flipPitch,
  humanizeNotes,
  isEditError,
  legatoNotes,
  rampVelocity,
  reverseNotes,
  scaleLengths,
  transposeNotes,
  type EditOutcome,
} from '../components/sequencer/pianoRoll/rollEdits.ts';

export interface ApplyTarget {
  /** The track the pattern actions act on. */
  track: SequencerTrack | null;
  /** The note clip the clip actions act on: its track id and clip id. */
  focus: { trackId: string; clipId: string } | null;
}

export interface ApplyReport {
  done: string[];
  skipped: string[];
}

interface Step {
  ok: boolean;
  text: string;
}

const OP_LABEL: Record<TransformOp, string> = {
  reverse: 'Reversed',
  flip: 'Flipped the pitches of',
  transpose: 'Transposed',
  double: 'Doubled the length of',
  halve: 'Halved the length of',
  legato: 'Legato on',
  humanize: 'Humanized',
  crescendo: 'Crescendo on',
};

export function findClip(engine: AudioEngine, trackId: string, clipId: string): { track: SequencerTrack; clip: ArrangementClip } | null {
  const track = engine.tracks.find((t) => t.id === trackId);
  const clip = track?.arrangementClips?.find((c) => c.id === clipId);
  return track && clip ? { track, clip } : null;
}

/** The state the assistant is told about, read from the engine right now. */
export function buildAssistantContext(engine: AudioEngine, target: ApplyTarget): AssistantContext {
  const focused = target.focus ? findClip(engine, target.focus.trackId, target.focus.clipId) : null;
  return {
    bpm: engine.bpm,
    timeSignature: engine.timeSignature,
    stepsPerBar: engine.stepsPerBar,
    targetTrack: target.track ? { id: target.track.id, name: target.track.name } : null,
    patternLength: target.track ? syncTrackPatterns(target.track, engine.activePatternIndex).length : null,
    focusedClip: focused ? { name: focused.clip.name || 'Note clip', lengthBars: focused.clip.lengthBars } : null,
    tracks: engine.tracks
      .filter((t) => t.kind !== 'audio')
      .map((t) => ({ id: t.id, name: t.name, muted: !!engine.mixer.channel(t.deviceId)?.settings.mute })),
  };
}

function runTransform(notes: RollNote[], action: { op: TransformOp; semitones: number }, minLength: number): EditOutcome {
  const none = new Set<string>();
  switch (action.op) {
    case 'reverse':
      return reverseNotes(notes, none);
    case 'flip':
      return flipPitch(notes, none);
    case 'transpose':
      return transposeNotes(notes, none, action.semitones);
    case 'double':
      return scaleLengths(notes, none, 2, minLength);
    case 'halve':
      return scaleLengths(notes, none, 0.5, minLength);
    case 'legato':
      return legatoNotes(notes, none);
    case 'humanize':
      return humanizeNotes(notes, none, 0.5, 0.06);
    case 'crescendo':
      return rampVelocity(notes, none, 0.45, 1);
  }
}

/** Adds `added` to `existing`, replacing any note on the same grid cell and pitch. */
function merge(existing: RollNote[], added: RollNote[]): RollNote[] {
  const keys = new Set(added.map(rollKey));
  return [...existing.filter((n) => !keys.has(rollKey(n))), ...added];
}

function toRoll(notes: AssistantNote[]): RollNote[] {
  return notes.map((n) => ({ step: n.step, note: n.note, length: n.length, velocity: n.velocity }));
}

function transformPattern(engine: AudioEngine, action: Extract<AssistantAction, { type: 'transform_notes' }>, target: ApplyTarget): Step {
  const track = target.track;
  if (!track) return { ok: false, text: 'Pick a track first' };
  const outcome = runTransform(patternToRoll(track.steps), action, 1);
  if (isEditError(outcome)) return { ok: false, text: outcome.error };
  writePatternRoll(engine, track, outcome.notes);
  return { ok: true, text: `${OP_LABEL[action.op]} the pattern of ${track.name}` };
}

function transformClip(engine: AudioEngine, action: Extract<AssistantAction, { type: 'transform_notes' }>, target: ApplyTarget): Step {
  const found = target.focus ? findClip(engine, target.focus.trackId, target.focus.clipId) : null;
  if (!found) return { ok: false, text: 'Open a note clip first' };
  const outcome = runTransform(clipNotesToRoll(found.clip.notes ?? []), action, 0.25);
  if (isEditError(outcome)) return { ok: false, text: outcome.error };
  engine.sequencer.setClipNotes(found.track.id, found.clip.id, rollToClipNotes(outcome.notes), true);
  return { ok: true, text: `${OP_LABEL[action.op]} the note clip "${found.clip.name || 'Note clip'}"` };
}

function writePattern(engine: AudioEngine, action: Extract<AssistantAction, { type: 'write_notes' }>, target: ApplyTarget): Step {
  const track = target.track;
  if (!track) return { ok: false, text: 'Pick a track first' };
  const existing = action.replace ? [] : patternToRoll(track.steps);
  writePatternRoll(engine, track, merge(existing, toRoll(action.notes)));
  return { ok: true, text: `Wrote ${action.notes.length} note(s) into the pattern of ${track.name}` };
}

function writeClip(engine: AudioEngine, action: Extract<AssistantAction, { type: 'write_notes' }>, target: ApplyTarget): Step {
  const found = target.focus ? findClip(engine, target.focus.trackId, target.focus.clipId) : null;
  if (!found) return { ok: false, text: 'Open a note clip first' };
  const existing = action.replace ? [] : clipNotesToRoll(found.clip.notes ?? []);
  engine.sequencer.setClipNotes(found.track.id, found.clip.id, rollToClipNotes(merge(existing, toRoll(action.notes))), true);
  return { ok: true, text: `Wrote ${action.notes.length} note(s) into the note clip` };
}

function applyOne(engine: AudioEngine, action: AssistantAction, target: ApplyTarget): Step {
  switch (action.type) {
    case 'set_tempo':
      engine.setBpm(action.bpm);
      return { ok: true, text: `Tempo set to ${action.bpm} BPM` };
    case 'set_track_mute': {
      const track = engine.tracks.find((t) => t.id === action.track);
      if (!track) return { ok: false, text: 'That track is no longer in the song' };
      engine.mixer.setMute(track.deviceId, action.muted);
      return { ok: true, text: `${track.name} ${action.muted ? 'muted' : 'unmuted'}` };
    }
    case 'transform_notes':
      return action.scope === 'clip' ? transformClip(engine, action, target) : transformPattern(engine, action, target);
    case 'write_notes':
      return action.scope === 'clip' ? writeClip(engine, action, target) : writePattern(engine, action, target);
  }
}

/** Applies the actions in order; each one that cannot apply is reported, not thrown. */
export function applyAssistantActions(engine: AudioEngine, actions: AssistantAction[], target: ApplyTarget): ApplyReport {
  const report: ApplyReport = { done: [], skipped: [] };
  for (const action of actions) {
    const step = applyOne(engine, action, target);
    (step.ok ? report.done : report.skipped).push(step.text);
  }
  return report;
}

/** One line for the user to read before pressing Apply. */
export function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case 'set_tempo':
      return `Set the tempo to ${action.bpm} BPM`;
    case 'set_track_mute':
      return `${action.muted ? 'Mute' : 'Unmute'} the track ${action.track}`;
    case 'transform_notes': {
      const where = action.scope === 'clip' ? 'the focused note clip' : 'the pattern of the chosen track';
      const shift = action.op === 'transpose' ? ` by ${action.semitones > 0 ? '+' : ''}${action.semitones} semitones` : '';
      return `${OP_LABEL[action.op]} ${where}${shift}`;
    }
    case 'write_notes': {
      const where = action.scope === 'clip' ? 'the focused note clip' : 'the pattern of the chosen track';
      return `${action.replace ? 'Replace' : 'Add'} ${action.notes.length} note(s) in ${where}`;
    }
  }
}
