/**
 * Sequencer data model: unlimited patterns per track and an unlimited clip arrangement.
 *
 * Pure functions only (no Web Audio, no engine state) so the live scheduler, the offline
 * WAV export and the UI all compute the same thing.
 *
 * Time units
 *   - 16th  : one scheduler step (swing is applied per 16th).
 *   - tick  : 1/12 of a 16th. Every step division is a whole number of ticks
 *             (1/4 = 48, 1/8 = 24, 1/8T = 16, 1/16 = 12, 1/16T = 8, 1/32 = 6).
 *   - bar   : `stepsPerBar(timeSignature)` 16ths (4/4 = 16, 3/4 = 12, 7/8 = 14 …).
 *
 * Playback rules
 *   - Pattern mode: every track loops its active pattern from song position 0.
 *   - Song mode: a track plays the clip under the song position; a pattern clip loops its
 *     pattern inside the clip (starting `offsetSteps` into it), a note clip plays its notes
 *     (repeating every `loopBars` when set). A track with no unmuted clips plays its active
 *     pattern (v1 behaviour).
 */
import type {
  ArrangementClip,
  ClipNote,
  SequencerNote,
  SequencerPattern,
  SequencerTrack,
  StepDivision,
} from '../types.ts';

export type PlaybackMode = 'song_arrangement' | 'pattern_loop';

export const TICKS_PER_16TH = 12;
export const MAX_PATTERN_STEPS = 1024;
export const PATTERN_LENGTH_PRESETS = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512] as const;

export const DIVISIONS: readonly { id: StepDivision; label: string; ticks: number }[] = [
  { id: '1/4', label: '1/4', ticks: 48 },
  { id: '1/8', label: '1/8', ticks: 24 },
  { id: '1/8T', label: '1/8 T', ticks: 16 },
  { id: '1/16', label: '1/16', ticks: 12 },
  { id: '1/16T', label: '1/16 T', ticks: 8 },
  { id: '1/32', label: '1/32', ticks: 6 },
];

const DIVISION_TICKS: Record<string, number> = Object.fromEntries(DIVISIONS.map((d) => [d.id, d.ticks]));

export function isStepDivision(v: unknown): v is StepDivision {
  return typeof v === 'string' && v in DIVISION_TICKS;
}

/** Ticks per pattern step (unknown division → 1/16). */
export function divisionTicks(division: string | undefined): number {
  return (division && DIVISION_TICKS[division]) || TICKS_PER_16TH;
}

export const PATTERN_COLORS = [
  '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#ef4444', '#84cc16', '#3b82f6',
  '#f97316', '#14b8a6', '#a855f7', '#eab308',
] as const;

/** 16ths per bar for a time signature string such as "4/4" or "7/8". */
export function stepsPerBar(timeSignature: string | undefined): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSignature || '');
  if (!m) return 16;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!(num > 0) || !(den > 0)) return 16;
  return Math.max(1, Math.round((num * 16) / den));
}

/** 16ths per metronome beat (the denominator note). */
export function beatSteps(timeSignature: string | undefined): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSignature || '');
  const den = m ? Number(m[2]) : 4;
  return Math.max(1, Math.round(16 / (den > 0 ? den : 4)));
}

export function barToTick(bar: number, spb: number): number {
  return Math.round(bar * spb * TICKS_PER_16TH);
}

/** Rounds a bar position to whole 16ths (clip edges always sit on the 16th grid). */
export function snapBarTo16th(bar: number, spb: number): number {
  return Math.round(bar * spb) / spb;
}

let idCounter = 0;
export function newSeqId(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function cloneNote<T extends SequencerNote>(n: T | null | undefined): T | null {
  if (!n) return null;
  return { ...n, chordNotes: n.chordNotes ? [...n.chordNotes] : undefined };
}

export function cloneSteps(steps: readonly (SequencerNote | null | undefined)[]): (SequencerNote | null)[] {
  return steps.map((s) => cloneNote(s));
}

/** Returns a NEW array of exactly `len` steps (pads with null, truncates beyond). */
export function resizeSteps(steps: readonly (SequencerNote | null | undefined)[], len: number): (SequencerNote | null)[] {
  const n = clampLength(len);
  const out: (SequencerNote | null)[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = steps[i] ?? null;
  return out;
}

export function clampLength(len: number): number {
  const n = Math.round(Number(len));
  if (!Number.isFinite(n)) return 16;
  return Math.max(1, Math.min(MAX_PATTERN_STEPS, n));
}

export function makePattern(opts: {
  id?: string;
  name?: string;
  color?: string;
  length?: number;
  division?: StepDivision;
  steps?: readonly (SequencerNote | null | undefined)[];
} = {}): SequencerPattern {
  const length = clampLength(opts.length ?? (opts.steps && opts.steps.length ? opts.steps.length : 16));
  return {
    id: opts.id || newSeqId('pat'),
    name: opts.name || 'Pattern 1',
    color: opts.color || PATTERN_COLORS[0],
    length,
    division: isStepDivision(opts.division) ? opts.division : '1/16',
    steps: resizeSteps(opts.steps ?? [], length),
  };
}

/** Next free "Pattern N" name for a track. */
export function nextPatternName(track: SequencerTrack): string {
  let max = 0;
  (track.patternList || []).forEach((p) => {
    const m = /^Pattern (\d+)$/.exec(p.name);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `Pattern ${Math.max(max, (track.patternList || []).length) + 1}`;
}

/** Length of one pass of a pattern, in 16ths (may be fractional for triplets). */
export function patternLength16ths(p: Pick<SequencerPattern, 'length' | 'division'>): number {
  return (Math.max(1, p.length) * divisionTicks(p.division)) / TICKS_PER_16TH;
}

/** Bars a clip needs to play one full pass of a pattern (rounded up to whole bars, min 1). */
export function patternBars(p: Pick<SequencerPattern, 'length' | 'division'>, spb: number): number {
  return Math.max(1, Math.ceil(patternLength16ths(p) / spb - 1e-9));
}

/**
 * v1 kept the live bank in `steps` and mirrored it into `patterns[activeIndex]`. When the saved
 * index is unknown, find the bank whose content matches `steps`.
 */
function legacyActiveIndexOf(track: SequencerTrack, hint: number): number {
  const legacy = track.patterns || {};
  if (!Array.isArray(track.steps)) return hint;
  const key = (s: unknown) => {
    try {
      return JSON.stringify(s);
    } catch {
      return '';
    }
  };
  const live = key(track.steps);
  if (Array.isArray(legacy[hint]) && key(legacy[hint]) === live) return hint;
  for (const k of Object.keys(legacy)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && Array.isArray(legacy[i]) && key(legacy[i]) === live) return i;
  }
  return hint;
}

function migrateLegacyPatterns(track: SequencerTrack, legacyActiveIndex: number): SequencerPattern[] {
  const legacy = track.patterns || {};
  const activeIdx = legacyActiveIndexOf(track, Math.max(0, legacyActiveIndex | 0));
  const indices = new Set<number>([activeIdx]);
  Object.keys(legacy).forEach((k) => {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && Array.isArray(legacy[i])) indices.add(i);
  });
  const byIndex = new Map<number, SequencerPattern>();
  const list = [...indices].sort((a, b) => a - b).map((i) => {
    const src = i === activeIdx ? (Array.isArray(track.steps) ? track.steps : legacy[i] || []) : legacy[i] || [];
    const p = makePattern({
      name: `Pattern ${i + 1}`,
      color: PATTERN_COLORS[i % PATTERN_COLORS.length],
      length: src.length || 16,
      steps: src,
    });
    byIndex.set(i, p);
    return p;
  });
  const active = byIndex.get(activeIdx) || list[0];
  if (Array.isArray(track.steps)) {
    // Keep the live array (UI code may hold it); sync() pads it in place.
    active.steps = track.steps;
  }
  track.activePatternId = active.id;
  // v1: a clip whose bank slot was empty played the live steps → map it to the active pattern.
  (track.arrangementClips || []).forEach((c) => {
    if (c.kind === 'notes' || c.patternId) return;
    c.patternId = (typeof c.patternIndex === 'number' && byIndex.get(c.patternIndex)?.id) || active.id;
  });
  delete track.patterns;
  return list;
}

/**
 * Makes sure the track has a pattern list (migrating v1 data) and that `track.steps` is the
 * active pattern's steps array. `track.steps` wins when the two differ, so code that assigns
 * a new array to `track.steps` keeps working. Cheap when nothing changed.
 */
export function syncTrackPatterns(track: SequencerTrack, legacyActiveIndex = 0): SequencerPattern {
  let list = track.patternList;
  if (!Array.isArray(list) || list.length === 0) {
    list = migrateLegacyPatterns(track, legacyActiveIndex);
    track.patternList = list;
  }
  let active = list.find((p) => p.id === track.activePatternId);
  if (!active) {
    active = list[0];
    track.activePatternId = active.id;
  }
  if (track.steps !== active.steps) {
    if (Array.isArray(track.steps)) active.steps = track.steps;
    else track.steps = active.steps;
  }
  const steps = active.steps;
  if (steps.length > active.length) {
    // Legacy writers extended the array: the pattern grew.
    active.length = clampLength(steps.length);
    if (steps.length > active.length) steps.length = active.length;
  } else if (steps.length < active.length) {
    for (let i = steps.length; i < active.length; i++) steps.push(null);
  }
  return active;
}

/** Fixes lengths, divisions and dangling clip references (used after loading a project). */
/** Older projects filled every graph lane with defaults, which overrode instrument knobs on each note. */
/** Values older versions filled lanes with (they forced cutoff / resonance on every note). */
const GRAPH_FILL_DEFAULTS: Record<string, number> = { velocity: 0.85, pitch: 0, cutoff: 0.8, resonance: 0.3 };

/** Keeps only drawn lane values (null = none) and drops lanes playback never read. */
function dropDefaultGraphLanes(track: SequencerTrack): void {
  const g = track.graphData as Record<string, unknown> | undefined;
  if (!g) return;
  const out: Record<string, (number | null)[]> = {};
  for (const [k, def] of Object.entries(GRAPH_FILL_DEFAULTS)) {
    const lane = g[k];
    if (!Array.isArray(lane)) continue;
    const vals = lane.map((v) => (typeof v === 'number' && Number.isFinite(v) && v !== def ? v : null));
    if (vals.some((v) => v !== null)) out[k] = vals;
  }
  track.graphData = out;
}

export function normalizeTrackSequencerData(track: SequencerTrack, spb: number, legacyActiveIndex = 0): void {
  dropDefaultGraphLanes(track);
  const active = syncTrackPatterns(track, legacyActiveIndex);
  (track.patternList || []).forEach((p, i) => {
    if (!p.id) p.id = newSeqId('pat');
    if (!p.name) p.name = `Pattern ${i + 1}`;
    if (!p.color) p.color = PATTERN_COLORS[i % PATTERN_COLORS.length];
    if (!isStepDivision(p.division)) p.division = '1/16';
    p.length = clampLength(p.length || (Array.isArray(p.steps) ? p.steps.length : 16));
    if (!Array.isArray(p.steps)) p.steps = [];
    if (p.steps.length !== p.length) {
      if (p === active) {
        if (p.steps.length > p.length) p.steps.length = p.length;
        else for (let k = p.steps.length; k < p.length; k++) p.steps.push(null);
      } else {
        p.steps = resizeSteps(p.steps, p.length);
      }
    }
  });
  const ids = new Set((track.patternList || []).map((p) => p.id));
  const minLen = 1 / Math.max(1, spb);
  track.arrangementClips = (track.arrangementClips || [])
    .filter((c) => c && typeof c === 'object')
    .map((c) => {
      const kind = c.kind === 'notes' ? 'notes' : 'pattern';
      const clip: ArrangementClip = {
        ...c,
        id: c.id || newSeqId('clip'),
        kind,
        startBar: Math.max(0, snapBarTo16th(Number(c.startBar) || 0, spb)),
        lengthBars: Math.max(minLen, snapBarTo16th(Number(c.lengthBars) || 1, spb)),
        name: c.name || '',
      };
      if (kind === 'pattern') {
        if (!clip.patternId || !ids.has(clip.patternId)) clip.patternId = active.id;
        delete clip.notes;
        delete clip.loopBars;
      } else {
        clip.notes = Array.isArray(c.notes) ? c.notes.filter((n) => n && typeof n.step === 'number') : [];
        if (!(Number(clip.loopBars) > 0)) delete clip.loopBars;
      }
      if (!(Number(clip.offsetSteps) > 0)) delete clip.offsetSteps;
      return clip;
    });
}

export function findPattern(track: SequencerTrack, patternId: string | undefined): SequencerPattern | undefined {
  if (!patternId) return undefined;
  return (track.patternList || []).find((p) => p.id === patternId);
}

export function clipEndBar(c: Pick<ArrangementClip, 'startBar' | 'lengthBars'>): number {
  return c.startBar + c.lengthBars;
}

/** Last bar covered by any clip (0 when there are no clips). */
export function songEndBar(tracks: readonly SequencerTrack[]): number {
  let end = 0;
  for (const t of tracks) for (const c of t.arrangementClips || []) end = Math.max(end, clipEndBar(c));
  return end;
}

export function hasUnmutedClips(track: SequencerTrack): boolean {
  const clips = track.arrangementClips;
  if (!clips) return false;
  for (const c of clips) if (!c.muted) return true;
  return false;
}

/** The unmuted clip under `tick` (the latest-starting one wins when clips overlap). */
export function clipAtTick(track: SequencerTrack, tick: number, spb: number): ArrangementClip | null {
  let best: ArrangementClip | null = null;
  let bestStart = -1;
  for (const c of track.arrangementClips || []) {
    if (c.muted) continue;
    const s = barToTick(c.startBar, spb);
    if (tick < s || tick >= barToTick(c.startBar + c.lengthBars, spb)) continue;
    if (s >= bestStart) {
      best = c;
      bestStart = s;
    }
  }
  return best;
}

export interface PatternSource {
  kind: 'pattern';
  pattern: SequencerPattern;
  /** Song tick where the pattern's step 0 would fall (clip start minus offset; 0 in Pattern mode). */
  originTick: number;
  clip?: ArrangementClip;
}

export interface NotesSource {
  kind: 'notes';
  clip: ArrangementClip;
  originTick: number;
}

export type PlaySource = PatternSource | NotesSource;

/** What a track plays at a song tick (null = silent). `active` must be the synced active pattern. */
export function resolveSource(
  track: SequencerTrack,
  active: SequencerPattern,
  tick: number,
  mode: PlaybackMode,
  spb: number,
  /** Pattern loop: tick where the pattern was launched (clip launcher), so it restarts there. */
  patternOrigin = 0
): PlaySource | null {
  if (mode === 'pattern_loop' || !hasUnmutedClips(track)) {
    return { kind: 'pattern', pattern: active, originTick: patternOrigin };
  }
  const clip = clipAtTick(track, tick, spb);
  if (!clip) return null;
  const origin = barToTick(clip.startBar, spb) - Math.round((clip.offsetSteps || 0) * TICKS_PER_16TH);
  if (clip.kind === 'notes') return { kind: 'notes', clip, originTick: origin };
  return { kind: 'pattern', pattern: findPattern(track, clip.patternId) || active, originTick: origin, clip };
}

export interface StepHit {
  note: SequencerNote;
  /** Pattern step index, or the 16th inside the note clip (per-step graph data + chance use it). */
  stepIdx: number;
  /** Ticks after the window start. */
  offsetTicks: number;
  /** One step of the source, in ticks (pattern division; 12 for note clips). */
  stepTicks: number;
  /** Note length in ticks. */
  lengthTicks: number;
  /** Ticks already elapsed when a sustained note is resumed by note chase. */
  elapsedTicks?: number;
  /** Voice state for note chase, including chords whose lengths differ from the root. */
  activePrimary?: boolean;
  activeChordIndices?: number[];
}

/**
 * Sustained notes already in progress at `tick`. Used when playback starts or seeks into a
 * note. The returned hits have a zero offset so the caller can trigger them at the playhead;
 * `elapsedTicks` lets the note-off retain its original timing.
 */
export function activeHitsAt(src: PlaySource, tick: number, spb: number): StepHit[] {
  let maxLengthTicks = 0;
  if (src.kind === 'pattern') {
    const stepTicks = divisionTicks(src.pattern.division);
    for (const note of src.pattern.steps) {
      if (!note || note.muted) continue;
      maxLengthTicks = Math.max(maxLengthTicks, Math.max(1, note.length || 1) * stepTicks);
      (note.chordLengths || []).forEach((length) => {
        maxLengthTicks = Math.max(maxLengthTicks, Math.max(1, length) * stepTicks);
      });
    }
  } else {
    for (const note of src.clip.notes || []) {
      if (!note || note.muted) continue;
      maxLengthTicks = Math.max(maxLengthTicks, Math.max(1, Math.round((note.length || 1) * TICKS_PER_16TH)));
      (note.chordLengths || []).forEach((length) => {
        maxLengthTicks = Math.max(maxLengthTicks, Math.max(1, length) * TICKS_PER_16TH);
      });
    }
  }
  if (maxLengthTicks <= 0) return [];

  const from = tick - maxLengthTicks;
  return hitsInWindow(src, from, maxLengthTicks, spb)
    .flatMap((hit) => {
      const start = from + hit.offsetTicks;
      const elapsedTicks = tick - start;
      if (elapsedTicks <= 0 || (hit.note.ratchet || 1) > 1) return [];
      const activePrimary = elapsedTicks < hit.lengthTicks;
      const activeChordIndices = (hit.note.chordNotes || []).flatMap((_, i) => {
        const length = hit.note.chordLengths?.[i];
        const duration = length !== undefined ? Math.max(1, length) * hit.stepTicks : hit.lengthTicks;
        return elapsedTicks < duration ? [i] : [];
      });
      if (!activePrimary && activeChordIndices.length === 0) return [];
      return [{ ...hit, note: { ...hit.note, microOffset: 0 }, offsetTicks: 0, elapsedTicks, activePrimary, activeChordIndices, lengthTicks: hit.lengthTicks }];
    });
}

/** Notes of `src` that start inside [tick, tick + windowTicks). */
export function hitsInWindow(src: PlaySource, tick: number, windowTicks: number, spb: number): StepHit[] {
  const out: StepHit[] = [];
  const local0 = tick - src.originTick;
  const local1 = local0 + windowTicks;
  if (src.kind === 'pattern') {
    const p = src.pattern;
    const T = divisionTicks(p.division);
    const len = Math.max(1, p.length);
    const L = len * T;
    const nStart = Math.floor(local0 / L);
    const nEnd = Math.floor((local1 - 1) / L);
    for (let n = nStart; n <= nEnd; n++) {
      const base = n * L;
      const iMin = Math.max(0, Math.ceil((local0 - base) / T));
      const iMax = Math.min(len - 1, Math.ceil((local1 - base) / T) - 1);
      for (let i = iMin; i <= iMax; i++) {
        const note = p.steps[i];
        if (!note || note.muted) continue;
        out.push({
          note,
          stepIdx: i,
          offsetTicks: base + i * T - local0,
          stepTicks: T,
          lengthTicks: Math.max(1, note.length || 1) * T,
        });
      }
    }
    return out;
  }
  const clip = src.clip;
  const loop = clip.loopBars && clip.loopBars > 0 ? barToTick(clip.loopBars, spb) : 0;
  for (const cn of clip.notes || []) {
    if (!cn || cn.muted) continue;
    const t = Math.round(cn.step * TICKS_PER_16TH);
    const hit = (at: number) =>
      out.push({
        note: cn,
        stepIdx: Math.max(0, Math.floor(cn.step)),
        offsetTicks: at - local0,
        stepTicks: TICKS_PER_16TH,
        lengthTicks: Math.max(1, Math.round((cn.length || 1) * TICKS_PER_16TH)),
      });
    if (loop) {
      if (t < 0 || t >= loop) continue;
      for (let at = t + Math.ceil((local0 - t) / loop) * loop; at < local1; at += loop) hit(at);
    } else if (t >= local0 && t < local1) {
      hit(t);
    }
  }
  return out;
}

/** Step of the source playing at `tick` (pattern step index, or 16th inside a note clip). */
export function sourceStepAt(src: PlaySource, tick: number, spb: number): number {
  const local = tick - src.originTick;
  if (src.kind === 'pattern') {
    const T = divisionTicks(src.pattern.division);
    const L = Math.max(1, src.pattern.length) * T;
    return Math.floor((((local % L) + L) % L) / T);
  }
  const loop = src.clip.loopBars && src.clip.loopBars > 0 ? barToTick(src.clip.loopBars, spb) : 0;
  const l = loop ? ((local % loop) + loop) % loop : local;
  return Math.floor(l / TICKS_PER_16TH);
}

/**
 * Notes a pattern produces between content ticks [fromTick, toTick), as note-clip notes whose
 * `step` is relative to `fromTick` (used by "Convert to note clip").
 */
export function renderPatternNotes(p: SequencerPattern, fromTick: number, toTick: number): ClipNote[] {
  const src: PatternSource = { kind: 'pattern', pattern: p, originTick: 0 };
  const out: ClipNote[] = [];
  const stepIn16 = divisionTicks(p.division) / TICKS_PER_16TH;
  for (const h of hitsInWindow(src, fromTick, Math.max(0, toTick - fromTick), 16)) {
    const { chordNotes, chordLengths, chordVelocities, ...rest } = h.note;
    const step = h.offsetTicks / TICKS_PER_16TH;
    out.push({ ...rest, step, length: h.lengthTicks / TICKS_PER_16TH });
    // Note clips hold one note per entry: chord notes become their own notes.
    (chordNotes || []).forEach((n, i) =>
      out.push({
        ...rest,
        note: n,
        step,
        length: (chordLengths?.[i] !== undefined ? Math.max(1, chordLengths[i]) * stepIn16 : h.lengthTicks / TICKS_PER_16TH),
        velocity: chordVelocities?.[i] ?? rest.velocity,
      })
    );
  }
  return out;
}

export function cloneClip(c: ArrangementClip): ArrangementClip {
  return {
    ...c,
    notes: c.notes ? c.notes.map((n) => ({ ...(cloneNote(n) as ClipNote), step: n.step })) : undefined,
  };
}
