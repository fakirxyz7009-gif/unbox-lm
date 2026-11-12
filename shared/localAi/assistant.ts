/**
 * The local assistant's contract: the only actions it may propose, how a model reply is checked,
 * and the instructions it is given. Pure TypeScript (no DOM, no Node APIs): the server checks the
 * model's reply with it, and the browser checks it again before anything is applied.
 *
 * The model does not learn from use. It is told what the app can do (the instructions below), and
 * anything it proposes outside this list is dropped.
 */

export const ASSISTANT_LIMITS = {
  minBpm: 40,
  maxBpm: 240,
  maxStep: 2048,
  maxNoteLength: 64,
  maxNotesPerAction: 256,
  maxTransposeSemitones: 24,
  maxMessageChars: 1500,
  maxReplyChars: 1200,
} as const;

/**
 * This assistant is deliberately restricted to symbolic control data. Keep this check in shared
 * code so browser-only rule suggestions and the optional local-model route enforce the exact
 * same no-audio-generation boundary. It is not an attempt to classify imported user files.
 */
const AUDIO_REQUEST_TARGET = /\b(?:audio|sound(?:scape)?|waveform|wav|wave|mp3|ogg|voice|vocals?|sing(?:ing|er)?|stems?|recordings?|samples?)\b/i;
const AUDIO_REQUEST_OPERATION = /\b(?:generate|create|make|render|synthesi[sz]e|replace|clone|imitate|convert)\b/i;
const EXPLICIT_AUDIO_REQUEST = /\b(?:audio|sound|voice)\s*(?:generation|synthesis|creation|replacement|clone)|\b(?:text[ -]?to[ -]?speech|tts|voice[ -]?(?:conversion|clone))\b/i;

/** Returns the user-facing rejection for a requested generated/replaced sound, if any. */
export function audioGenerationRequestRejection(message: string): string | null {
  const request = message.trim();
  if (!request) return null;
  if (EXPLICIT_AUDIO_REQUEST.test(request) || (AUDIO_REQUEST_TARGET.test(request) && AUDIO_REQUEST_OPERATION.test(request))) {
    return 'Audio generation and audio replacement are disabled. This assistant only proposes MIDI, device and automation controls; use a recorded pack or your own verified recording for sound.';
  }
  return null;
}

export const TRANSFORM_OPS = ['reverse', 'flip', 'transpose', 'double', 'halve', 'legato', 'humanize', 'crescendo'] as const;
export type TransformOp = (typeof TRANSFORM_OPS)[number];

/** `pattern`: the chosen track's active pattern. `clip`: the note clip in the Clip Editor. */
export type AssistantScope = 'pattern' | 'clip';

export interface AssistantNote {
  /** Grid units from the start of the pattern or clip (steps for patterns, 16ths for clips). */
  step: number;
  note: number;
  length: number;
  velocity: number;
}

export type AssistantAction =
  | { type: 'set_tempo'; bpm: number }
  | { type: 'transform_notes'; scope: AssistantScope; op: TransformOp; semitones: number }
  | { type: 'write_notes'; scope: AssistantScope; replace: boolean; notes: AssistantNote[] }
  | { type: 'set_track_mute'; track: string; muted: boolean };

/** What the model is told about the song (kept small: the whole context goes in every request). */
export interface AssistantContext {
  bpm: number;
  timeSignature: string;
  stepsPerBar: number;
  /** The track the pattern and clip actions act on. */
  targetTrack: { id: string; name: string } | null;
  /** Length of the target track's active pattern, in steps. */
  patternLength: number | null;
  focusedClip: { name: string; lengthBars: number } | null;
  tracks: { id: string; name: string; muted: boolean }[];
}

export interface CheckedReply {
  reply: string;
  actions: AssistantAction[];
  /** Why each dropped or changed action was refused or adjusted. */
  rejected: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

function checkNote(raw: unknown, maxStep: number): AssistantNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  if (!isFiniteNumber(n.step) || !isFiniteNumber(n.note)) return null;
  return {
    step: clamp(Math.round(n.step * 1000) / 1000, 0, maxStep),
    note: clamp(Math.round(n.note), 0, 127),
    length: clamp(isFiniteNumber(n.length) ? n.length : 1, 0.25, ASSISTANT_LIMITS.maxNoteLength),
    velocity: clamp(isFiniteNumber(n.velocity) ? n.velocity : 0.8, 0.05, 1),
  };
}

/** Matches a track by id or by name, ignoring case. */
function findTrack(context: AssistantContext, ref: string) {
  const wanted = ref.trim().toLowerCase();
  return context.tracks.find((t) => t.id === ref || t.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * Checks a parsed model reply against the contract. Unknown actions and unknown tracks are dropped;
 * out-of-range numbers are clamped, and every adjustment is listed in `rejected`.
 */
export function checkAssistantReply(raw: unknown, context: AssistantContext): CheckedReply | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'The reply was not a JSON object.' };
  const body = raw as Record<string, unknown>;
  const reply = typeof body.reply === 'string' ? clean(body.reply).slice(0, ASSISTANT_LIMITS.maxReplyChars) : '';
  const list = Array.isArray(body.actions) ? body.actions : [];
  const actions: AssistantAction[] = [];
  const rejected: string[] = [];

  list.forEach((item, index) => {
    const label = `action ${index + 1}`;
    if (!item || typeof item !== 'object') return rejected.push(`${label}: not an object`);
    const a = item as Record<string, unknown>;
    switch (a.type) {
      case 'set_tempo': {
        if (!isFiniteNumber(a.bpm)) return rejected.push(`${label}: tempo is not a number`);
        const bpm = clamp(Math.round(a.bpm * 10) / 10, ASSISTANT_LIMITS.minBpm, ASSISTANT_LIMITS.maxBpm);
        if (bpm !== a.bpm) rejected.push(`${label}: tempo limited to ${bpm} BPM`);
        return actions.push({ type: 'set_tempo', bpm });
      }
      case 'transform_notes': {
        if (a.scope !== 'pattern' && a.scope !== 'clip') return rejected.push(`${label}: unknown scope`);
        if (!(TRANSFORM_OPS as readonly unknown[]).includes(a.op)) return rejected.push(`${label}: unknown operation`);
        const semitones = isFiniteNumber(a.semitones) ? clamp(Math.round(a.semitones), -ASSISTANT_LIMITS.maxTransposeSemitones, ASSISTANT_LIMITS.maxTransposeSemitones) : 0;
        if (a.op === 'transpose' && semitones === 0) return rejected.push(`${label}: transpose needs a non-zero semitone count`);
        return actions.push({ type: 'transform_notes', scope: a.scope, op: a.op as TransformOp, semitones });
      }
      case 'write_notes': {
        if (a.scope !== 'pattern' && a.scope !== 'clip') return rejected.push(`${label}: unknown scope`);
        if (!Array.isArray(a.notes)) return rejected.push(`${label}: notes is not a list`);
        const notes: AssistantNote[] = [];
        for (const raw of a.notes.slice(0, ASSISTANT_LIMITS.maxNotesPerAction)) {
          const note = checkNote(raw, ASSISTANT_LIMITS.maxStep);
          if (note) notes.push(note);
        }
        if (a.notes.length > ASSISTANT_LIMITS.maxNotesPerAction) rejected.push(`${label}: only the first ${ASSISTANT_LIMITS.maxNotesPerAction} notes kept`);
        if (notes.length < a.notes.length && a.notes.length <= ASSISTANT_LIMITS.maxNotesPerAction) rejected.push(`${label}: ${a.notes.length - notes.length} malformed note(s) dropped`);
        if (!notes.length) return rejected.push(`${label}: no valid notes`);
        return actions.push({ type: 'write_notes', scope: a.scope, replace: a.replace === true, notes });
      }
      case 'set_track_mute': {
        if (typeof a.track !== 'string') return rejected.push(`${label}: track is not a name`);
        if (typeof a.muted !== 'boolean') return rejected.push(`${label}: muted must be true or false`);
        const track = findTrack(context, a.track);
        if (!track) return rejected.push(`${label}: no track called "${a.track}"`);
        return actions.push({ type: 'set_track_mute', track: track.id, muted: a.muted });
      }
      default:
        return rejected.push(`${label}: "${String(a.type)}" is not an action the app can apply`);
    }
  });

  return { reply, actions, rejected };
}

/** The instructions given to the model with every request. */
export function assistantInstructions(): string {
  return [
    'You are the assistant inside Unbox Studio, a music workstation that runs on this computer. Answer briefly.',
    'Reply with one JSON object only: {"reply": "short text for the user", "actions": [ ... ]}.',
    'Use an empty actions list for questions. Propose changes only with these actions, spelled exactly:',
    '- {"type":"set_tempo","bpm":120}  (40 to 240)',
    '- {"type":"transform_notes","scope":"pattern"|"clip","op":"reverse"|"flip"|"transpose"|"double"|"halve"|"legato"|"humanize"|"crescendo","semitones":0}  (semitones only for transpose, -24 to 24; scope "pattern" acts on the target track\'s active pattern, "clip" on the focused note clip)',
    '- {"type":"write_notes","scope":"pattern"|"clip","replace":false,"notes":[{"step":0,"note":60,"length":2,"velocity":0.8}]}  (step counts grid units from the start, 4 per beat in 16ths for patterns; note is a MIDI number 0 to 127; replace true clears the old notes first)',
    '- {"type":"set_track_mute","track":"<track name from the song>","muted":true}',
    'Never invent a track name: use only names listed in the song state. Keep generated notes inside the pattern length given in the state.',
    'Never generate, render, replace, clone, synthesize or return audio, waveforms, recordings, stems, samples, voices or sounds. This assistant only proposes symbolic MIDI, device and automation controls.',
    'What the app offers, for questions: a piano roll with a left toolbar (select, draw, erase, mute, split, glue, stretch, zoom and edits: reverse Shift+R, flip Shift+F, humanize Shift+H, legato Shift+L, rotate Ctrl+Left/Right, transpose arrow keys, double and halve length, crescendo, split at playhead, mute Ctrl+M, duplicate Ctrl+D, delete). Samples & Stems (Alt+S): import a link (needs yt-dlp and ffmpeg on this computer), separate a sample into drums, bass, other and vocals with the local Demucs model (needs demucs), or place samples on the timeline. Export page: stems as a zip with a MIDI file per instrument (drum pattern included) and a manifest. Shortcuts: Shift+? or Alt+H lists them.',
  ].join('\n');
}

/** The state the model sees, as the user-message body. */
export function assistantStateText(context: AssistantContext): string {
  return JSON.stringify({
    bpm: context.bpm,
    timeSignature: context.timeSignature,
    stepsPerBar: context.stepsPerBar,
    targetTrack: context.targetTrack,
    patternLength: context.patternLength,
    focusedClip: context.focusedClip,
    tracks: context.tracks.slice(0, 40),
  });
}
