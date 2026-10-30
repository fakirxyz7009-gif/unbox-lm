/**
 * Editing API for patterns, clips and markers (`audioEngine.sequencer`).
 *
 * Every mutating call ends with `host.commitEdit()` (one undo step + one re-render) unless it
 * takes `commit = false`. UI drags keep their preview locally and call these once on release.
 */
import type { ArrangementClip, ClipNote, ProjectMarker, SequencerPattern, SequencerTrack, StepDivision } from '../types.ts';
import {
  PATTERN_COLORS,
  TICKS_PER_16TH,
  barToTick,
  clampLength,
  clipEndBar,
  cloneClip,
  cloneSteps,
  divisionTicks,
  findPattern,
  isStepDivision,
  makePattern,
  newSeqId,
  nextPatternName,
  patternBars,
  patternLength16ths,
  renderPatternNotes,
  resizeSteps,
  snapBarTo16th,
  syncTrackPatterns,
} from './model.ts';
import { audioClipRate, secPerBar } from '../clips/clipMath.ts';
import { audioStore, findNearestZeroCrossing } from '../clips/audioStore.ts';

/** Audio clip fields `updateAudioClip` may change. */
export type AudioClipPatch = Partial<
  Pick<ArrangementClip, 'gainDb' | 'fadeIn' | 'fadeOut' | 'reverse' | 'pitch' | 'warp' | 'sourceBpm' | 'loopAudio' | 'loopSec' | 'audioId' | 'audioOffset' | 'takes' | 'name' | 'invertPhase' | 'fadeCurve'>
>;

export interface SequencerHost {
  tracks: SequencerTrack[];
  readonly stepsPerBar: number;
  readonly bpm: number;
  activePatternIndex: number;
  patternLength: number;
  arrangementMarkers: ProjectMarker[];
  commitEdit(): void;
}

const MAX_BAR = 100000;
export class SequencerEditor {
  constructor(private readonly host: SequencerHost) {}

  // ---------------------------------------------------------------- lookup

  /** Track by track id or by device id. */
  track(id: string): SequencerTrack | undefined {
    return this.host.tracks.find((t) => t.id === id) || this.host.tracks.find((t) => t.deviceId === id);
  }

  activePattern(trackId: string): SequencerPattern | undefined {
    const t = this.track(trackId);
    return t ? syncTrackPatterns(t, this.host.activePatternIndex) : undefined;
  }

  patterns(trackId: string): SequencerPattern[] {
    const t = this.track(trackId);
    if (!t) return [];
    syncTrackPatterns(t, this.host.activePatternIndex);
    return t.patternList || [];
  }

  clipsUsingPattern(trackId: string, patternId: string): number {
    const t = this.track(trackId);
    return (t?.arrangementClips || []).filter((c) => c.kind !== 'notes' && c.patternId === patternId).length;
  }

  /** Bars a pattern clip needs for one full pass of the pattern. */
  patternBars(trackId: string, patternId?: string): number {
    const t = this.track(trackId);
    if (!t) return 1;
    const p = findPattern(t, patternId) || syncTrackPatterns(t, this.host.activePatternIndex);
    return patternBars(p, this.host.stepsPerBar);
  }

  private done(commit: boolean): void {
    if (commit) this.host.commitEdit();
  }

  // ---------------------------------------------------------------- patterns

  createPattern(
    trackId: string,
    opts: { name?: string; length?: number; division?: StepDivision; select?: boolean } = {},
    commit = true
  ): SequencerPattern | null {
    const t = this.track(trackId);
    if (!t) return null;
    const cur = syncTrackPatterns(t, this.host.activePatternIndex);
    const list = t.patternList!;
    const p = makePattern({
      name: opts.name?.trim() || nextPatternName(t),
      color: PATTERN_COLORS[list.length % PATTERN_COLORS.length],
      length: opts.length ?? cur.length,
      division: opts.division ?? cur.division,
    });
    list.push(p);
    if (opts.select !== false) this.select(t, p);
    this.done(commit);
    return p;
  }

  duplicatePattern(trackId: string, patternId: string, commit = true): SequencerPattern | null {
    const t = this.track(trackId);
    if (!t) return null;
    syncTrackPatterns(t, this.host.activePatternIndex);
    const src = findPattern(t, patternId);
    if (!src) return null;
    const list = t.patternList!;
    const copy = makePattern({
      name: `${src.name} copy`,
      color: src.color,
      length: src.length,
      division: src.division,
      steps: cloneSteps(src.steps),
    });
    list.splice(list.indexOf(src) + 1, 0, copy);
    this.select(t, copy);
    this.done(commit);
    return copy;
  }

  renamePattern(trackId: string, patternId: string, name: string, commit = true): void {
    const p = this.pattern(trackId, patternId);
    const n = name.trim().slice(0, 64);
    if (!p || !n) return;
    p.name = n;
    this.done(commit);
  }

  setPatternColor(trackId: string, patternId: string, color: string, commit = true): void {
    const p = this.pattern(trackId, patternId);
    if (!p || !/^#[0-9a-f]{3,8}$/i.test(color)) return;
    p.color = color;
    this.done(commit);
  }

  /** Resizes a pattern (pads with empty steps or cuts steps beyond the new length). */
  setPatternLength(trackId: string, patternId: string, length: number, commit = true): void {
    const t = this.track(trackId);
    if (!t) return;
    const active = syncTrackPatterns(t, this.host.activePatternIndex);
    const p = findPattern(t, patternId);
    if (!p) return;
    const len = clampLength(length);
    if (p.length === len && p.steps.length === len) return;
    p.length = len;
    if (p === active) {
      // Resize in place: UI code may hold a reference to track.steps.
      if (t.steps.length > len) t.steps.length = len;
      else for (let i = t.steps.length; i < len; i++) t.steps.push(null);
      p.steps = t.steps;
    } else {
      p.steps = resizeSteps(p.steps, len);
    }
    this.done(commit);
  }

  setPatternDivision(trackId: string, patternId: string, division: StepDivision, commit = true): void {
    const p = this.pattern(trackId, patternId);
    if (!p || !isStepDivision(division)) return;
    p.division = division;
    this.done(commit);
  }

  clearPattern(trackId: string, patternId: string, commit = true): void {
    const p = this.pattern(trackId, patternId);
    if (!p) return;
    p.steps.fill(null);
    this.done(commit);
  }

  /**
   * Deletes a pattern and the clips that play it. The last pattern of a track is cleared
   * instead (a track always has one). Returns the number of removed clips.
   */
  deletePattern(trackId: string, patternId: string, commit = true): number {
    const t = this.track(trackId);
    if (!t) return 0;
    syncTrackPatterns(t, this.host.activePatternIndex);
    const list = t.patternList!;
    const idx = list.findIndex((p) => p.id === patternId);
    if (idx < 0) return 0;
    if (list.length === 1) {
      list[0].steps.fill(null);
      this.done(commit);
      return 0;
    }
    const before = (t.arrangementClips || []).length;
    t.arrangementClips = (t.arrangementClips || []).filter((c) => c.kind === 'notes' || c.patternId !== patternId);
    const removed = before - t.arrangementClips.length;
    const wasActive = t.activePatternId === patternId;
    list.splice(idx, 1);
    if (wasActive) this.select(t, list[Math.min(idx, list.length - 1)]);
    this.done(commit);
    return removed;
  }

  selectPattern(trackId: string, patternId: string, commit = true): void {
    const t = this.track(trackId);
    if (!t) return;
    syncTrackPatterns(t, this.host.activePatternIndex);
    const p = findPattern(t, patternId);
    if (!p || t.activePatternId === p.id) return;
    this.select(t, p);
    this.done(commit);
  }

  /** Selects the pattern at list position `index`, creating empty patterns up to it (clip launcher). */
  selectPatternAt(trackId: string, index: number, commit = true): SequencerPattern | null {
    const t = this.track(trackId);
    const idx = Math.floor(index);
    if (!t || !(idx >= 0) || idx > 4095) return null;
    const cur = syncTrackPatterns(t, this.host.activePatternIndex);
    const list = t.patternList!;
    while (list.length <= idx) {
      list.push(
        makePattern({
          name: `Pattern ${list.length + 1}`,
          color: PATTERN_COLORS[list.length % PATTERN_COLORS.length],
          length: cur.length,
          division: cur.division,
        })
      );
    }
    this.select(t, list[idx]);
    this.done(commit);
    return list[idx];
  }

  movePattern(trackId: string, patternId: string, toIndex: number, commit = true): void {
    const t = this.track(trackId);
    if (!t) return;
    syncTrackPatterns(t, this.host.activePatternIndex);
    const list = t.patternList!;
    const from = list.findIndex((p) => p.id === patternId);
    if (from < 0) return;
    const to = Math.max(0, Math.min(list.length - 1, Math.floor(toIndex)));
    if (to === from) return;
    const [p] = list.splice(from, 1);
    list.splice(to, 0, p);
    this.done(commit);
  }

  private pattern(trackId: string, patternId: string): SequencerPattern | undefined {
    const t = this.track(trackId);
    if (!t) return undefined;
    syncTrackPatterns(t, this.host.activePatternIndex);
    return findPattern(t, patternId);
  }

  private select(t: SequencerTrack, p: SequencerPattern): void {
    t.activePatternId = p.id;
    t.steps = p.steps;
  }

  // ---------------------------------------------------------------- clips

  private snap(bar: number): number {
    return Math.max(0, Math.min(MAX_BAR, snapBarTo16th(Number(bar) || 0, this.host.stepsPerBar)));
  }

  private minLen(): number {
    return 1 / Math.max(1, this.host.stepsPerBar);
  }

  private clip(trackId: string, clipId: string): { t: SequencerTrack; c: ArrangementClip } | null {
    const t = this.track(trackId);
    const c = t?.arrangementClips?.find((x) => x.id === clipId);
    return t && c ? { t, c } : null;
  }

  /** Adds a clip that loops a pattern (default: the active one, as long as one pattern pass). */
  addPatternClip(
    trackId: string,
    startBar: number,
    opts: { lengthBars?: number; patternId?: string } = {},
    commit = true
  ): ArrangementClip | null {
    const t = this.track(trackId);
    if (!t) return null;
    const active = syncTrackPatterns(t, this.host.activePatternIndex);
    const p = findPattern(t, opts.patternId) || active;
    const clip: ArrangementClip = {
      id: newSeqId('clip'),
      kind: 'pattern',
      startBar: this.snap(startBar),
      lengthBars: Math.max(this.minLen(), this.snap(opts.lengthBars ?? patternBars(p, this.host.stepsPerBar))),
      patternId: p.id,
      name: '',
      color: t.color,
    };
    (t.arrangementClips ||= []).push(clip);
    this.done(commit);
    return clip;
  }

  addNoteClip(trackId: string, startBar: number, lengthBars = 1, notes: ClipNote[] = [], commit = true): ArrangementClip | null {
    const t = this.track(trackId);
    if (!t) return null;
    syncTrackPatterns(t, this.host.activePatternIndex);
    const clip: ArrangementClip = {
      id: newSeqId('clip'),
      kind: 'notes',
      startBar: this.snap(startBar),
      lengthBars: Math.max(this.minLen(), this.snap(lengthBars)),
      notes: notes.map((n) => ({ ...n })),
      name: 'Note clip',
      color: t.color,
    };
    (t.arrangementClips ||= []).push(clip);
    this.done(commit);
    return clip;
  }

  /**
   * Moves a clip to `startBar`. Note clips may move to another track; pattern clips stay on
   * their track (patterns belong to the track's instrument). Returns the clip's track id.
   */
  moveClip(trackId: string, clipId: string, startBar: number, toTrackId?: string, commit = true): string | null {
    const f = this.clip(trackId, clipId);
    if (!f) return null;
    f.c.startBar = this.snap(startBar);
    let owner = f.t;
    const dest = toTrackId ? this.track(toTrackId) : undefined;
    // Note clips move between instrument tracks, audio clips between audio tracks.
    const fits = dest && (f.c.kind === 'audio' ? dest.kind === 'audio' : f.c.kind === 'notes' && dest.kind !== 'audio');
    if (dest && dest !== f.t && fits) {
      f.t.arrangementClips = (f.t.arrangementClips || []).filter((c) => c !== f.c);
      f.c.color = dest.color;
      (dest.arrangementClips ||= []).push(f.c);
      owner = dest;
    }
    this.done(commit);
    return owner.id;
  }

  /** Drags one edge. Trimming the start keeps the content in place (offset grows). */
  resizeClip(trackId: string, clipId: string, edge: 'start' | 'end', bar: number, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f) return;
    const c = f.c;
    const spb = this.host.stepsPerBar;
    const min = this.minLen();
    if (edge === 'end') {
      c.lengthBars = Math.max(min, this.snap(bar) - c.startBar);
    } else if (c.kind === 'audio') {
      const end = clipEndBar(c);
      // Seconds of source per bar of timeline; can't reveal audio before the source start.
      const srcPerBar = secPerBar(this.host.bpm, spb) * audioClipRate(c, this.host.bpm);
      const earliest = c.startBar - (c.audioOffset ?? 0) / srcPerBar;
      const newStart = Math.min(end - min, Math.max(c.loopAudio ? -Infinity : earliest, this.snap(bar), 0));
      const delta = newStart - c.startBar;
      c.startBar = newStart;
      c.lengthBars = end - newStart;
      c.audioOffset = Math.max(0, (c.audioOffset ?? 0) + delta * srcPerBar);
    } else {
      const end = clipEndBar(c);
      const offsetBars = (c.offsetSteps || 0) / spb;
      // Can't reveal content before the source's start.
      const newStart = Math.min(end - min, Math.max(c.startBar - offsetBars, this.snap(bar)));
      const delta = newStart - c.startBar;
      c.startBar = newStart;
      c.lengthBars = end - newStart;
      const off = Math.round((c.offsetSteps || 0) + delta * spb);
      if (off > 0) c.offsetSteps = off;
      else delete c.offsetSteps;
    }
    this.done(commit);
  }

  /** Splits at `atBar`; the right half continues where the left stopped. */
  splitClip(trackId: string, clipId: string, atBar: number, commit = true, snapZeroCrossing = false): [ArrangementClip, ArrangementClip] | null {
    const f = this.clip(trackId, clipId);
    if (!f) return null;
    const c = f.c;
    let at = this.snap(atBar);
    if (at <= c.startBar || at >= clipEndBar(c)) {
      at = this.snap(c.startBar + c.lengthBars / 2);
      if (at <= c.startBar || at >= clipEndBar(c)) return null;
    }
    const spb = this.host.stepsPerBar;
    const right = cloneClip(c);
    right.id = newSeqId('clip');
    right.startBar = at;
    right.lengthBars = clipEndBar(c) - at;
    const baseName = (c.name || 'Clip').replace(/\s*\(Part\s*\d+\)$/, '');
    c.name = `${baseName} (Part 1)`;
    right.name = `${baseName} (Part 2)`;
    if (c.kind === 'audio') {
      delete right.offsetSteps;
      const srcPerBar = secPerBar(this.host.bpm, spb) * audioClipRate(c, this.host.bpm);
      let newOffset = (c.audioOffset ?? 0) + (at - c.startBar) * srcPerBar;
      if (snapZeroCrossing && c.audioId) {
        const asset = audioStore.get(c.audioId);
        if (asset?.buffer) {
          newOffset = findNearestZeroCrossing(asset.buffer, newOffset);
        }
      }
      right.audioOffset = newOffset;
      // fades stay on the outer edges
      delete right.fadeIn;
      delete c.fadeOut;
    } else {
      right.offsetSteps = Math.round((c.offsetSteps || 0) + (at - c.startBar) * spb);
    }
    c.lengthBars = at - c.startBar;
    const list = f.t.arrangementClips!;
    list.splice(list.indexOf(c) + 1, 0, right);
    this.done(commit);
    return [c, right];
  }

  /**
   * Joins two adjacent clips of the same kind into one continuous clip.
   * For audio clips, validates that both clips reference the same audioId, have continuous offsets,
   * and compatible playback parameters.
   */
  healClips(trackId: string, clipIdA: string, clipIdB: string, commit = true): ArrangementClip | null {
    const fA = this.clip(trackId, clipIdA);
    const fB = this.clip(trackId, clipIdB);
    if (!fA || !fB || fA.t !== fB.t) return null;
    if (fA.c.kind !== fB.c.kind) return null;

    // Order clips so 'left' comes before 'right'
    let left = fA.c;
    let right = fB.c;
    if (left.startBar > right.startBar) {
      left = fB.c;
      right = fA.c;
    }

    const spb = this.host.stepsPerBar;
    const bpm = this.host.bpm;
    const leftEnd = clipEndBar(left);

    // Must be adjacent (within 0.005 bars)
    if (Math.abs(leftEnd - right.startBar) > 0.005) return null;

    if (left.kind === 'audio' && right.kind === 'audio') {
      if (left.audioId !== right.audioId) return null;
      if (left.reverse !== right.reverse || left.pitch !== right.pitch || left.warp !== right.warp) return null;
      if (left.invertPhase !== right.invertPhase) return null;

      const rate = audioClipRate(left, bpm);
      const srcPerB = secPerBar(bpm, spb) * rate;
      const expectedRightOffset = (left.audioOffset ?? 0) + left.lengthBars * srcPerB;
      const actualRightOffset = right.audioOffset ?? 0;

      // Ensure contiguous audio offsets (within 15ms tolerance)
      if (Math.abs(expectedRightOffset - actualRightOffset) > 0.015) return null;

      left.lengthBars = this.snap(left.lengthBars + right.lengthBars);
      left.fadeOut = right.fadeOut;
      left.name = (left.name || 'Audio').replace(/\s*\(Part\s*\d+\)$/, '');
    } else if (left.kind === 'pattern' && right.kind === 'pattern') {
      if (left.patternId !== right.patternId) return null;
      const expectedOffset = (left.offsetSteps || 0) + Math.round(left.lengthBars * spb);
      const actualOffset = right.offsetSteps || 0;
      if (expectedOffset !== actualOffset) return null;

      left.lengthBars = this.snap(left.lengthBars + right.lengthBars);
      left.name = (left.name || 'Pattern').replace(/\s*\(Part\s*\d+\)$/, '');
    } else if (left.kind === 'notes' && right.kind === 'notes') {
      const leftLengthTicks = Math.round(left.lengthBars * spb * TICKS_PER_16TH);
      const rightNotes = (right.notes ?? []).map((n) => ({
        ...n,
        offsetTicks: (n.offsetTicks ?? 0) + leftLengthTicks,
      }));
      left.notes = [...(left.notes ?? []), ...rightNotes];
      left.lengthBars = this.snap(left.lengthBars + right.lengthBars);
      left.name = (left.name || 'Notes').replace(/\s*\(Part\s*\d+\)$/, '');
    } else {
      return null;
    }

    const list = fA.t.arrangementClips ?? [];
    const idx = list.indexOf(right);
    if (idx !== -1) {
      list.splice(idx, 1);
    }

    this.done(commit);
    return left;
  }

  /** Comp a bar range from one recorded take into an audio clip, splitting at the range edges. */
  compAudioTakeRange(trackId: string, clipId: string, takeAudioId: string, startBar: number, endBar: number, commit = true): string | null {
    const initial = this.clip(trackId, clipId);
    if (!initial || initial.c.kind !== 'audio' || !initial.c.takes?.some((take) => take.audioId === takeAudioId)) return null;
    const clipStart = initial.c.startBar;
    const clipEnd = clipEndBar(initial.c);
    const start = Math.max(clipStart, this.snap(startBar));
    const end = Math.min(clipEnd, this.snap(endBar));
    if (end - start < this.minLen() - 1e-6) return null;

    let compClipId = clipId;
    if (start > clipStart + 1e-6) {
      const split = this.splitClip(trackId, compClipId, start, false);
      if (!split) return null;
      compClipId = split[1].id;
    }
    const middle = this.clip(trackId, compClipId);
    if (!middle || middle.c.kind !== 'audio') return null;
    if (end < clipEndBar(middle.c) - 1e-6 && !this.splitClip(trackId, compClipId, end, false)) return null;
    this.updateAudioClip(trackId, compClipId, { audioId: takeAudioId }, false);
    this.done(commit);
    return compClipId;
  }

  /** Slices a forward, non-looped audio clip at detected source attacks, snapped to 16ths. */
  sliceAudioAtTransients(trackId: string, clipId: string, transientSeconds: readonly number[], commit = true): number | null {
    const initial = this.clip(trackId, clipId);
    if (!initial || initial.c.kind !== 'audio' || initial.c.reverse || initial.c.loopAudio) return null;
    const clip = initial.c;
    const startBar = clip.startBar;
    const endBar = clipEndBar(clip);
    const sourceStart = clip.audioOffset ?? 0;
    const sourcePerBar = secPerBar(this.host.bpm, this.host.stepsPerBar) * audioClipRate(clip, this.host.bpm);
    if (!(sourcePerBar > 0)) return 0;
    const cuts = [...new Set(transientSeconds
      .filter((seconds) => Number.isFinite(seconds) && seconds > sourceStart + 0.01 && seconds < sourceStart + clip.lengthBars * sourcePerBar - 0.01)
      .map((seconds) => this.snap(startBar + (seconds - sourceStart) / sourcePerBar)))]
      .filter((bar) => bar > startBar + this.minLen() - 1e-6 && bar < endBar - this.minLen() + 1e-6)
      .sort((a, b) => a - b);
    if (!cuts.length) return 0;

    const baseName = (clip.name || 'Audio').replace(/\s*(?:#\d+|\(Part\s*\d+\))$/, '');
    const segmentIds = [clipId];
    let currentId = clipId;
    for (const bar of cuts) {
      const current = this.clip(trackId, currentId);
      if (!current || current.c.kind !== 'audio' || bar <= current.c.startBar + this.minLen() - 1e-6 || bar >= clipEndBar(current.c) - this.minLen() + 1e-6) continue;
      const split = this.splitClip(trackId, currentId, bar, false);
      if (!split) continue;
      segmentIds.push(split[1].id);
      currentId = split[1].id;
    }
    const f = this.clip(trackId, clipId);
    const list = f?.t.arrangementClips ?? [];
    const created = list.filter((item) => item.kind === 'audio' && item.startBar >= startBar - 1e-6 && item.startBar + item.lengthBars <= endBar + 1e-6 && segmentIds.includes(item.id));
    created.sort((a, b) => a.startBar - b.startBar).forEach((item, index) => { item.name = `${baseName} #${index + 1}`; });
    this.done(commit);
    return created.length;
  }

  /**
   * Chops a clip into equal rhythmic slices across the beat grid.
   * Division can be '1/16' (1 step), '1/8' (2 steps), '1/4' (1 beat / 4 steps), '1 Bar', or an explicit bar number.
   */
  chopClip(
    trackId: string,
    clipId: string,
    division: '1/16' | '1/8' | '1/4' | '1 Bar' | number,
    commit = true
  ): ArrangementClip[] | null {
    const f = this.clip(trackId, clipId);
    if (!f) return null;
    const c = f.c;
    const spb = this.host.stepsPerBar;
    let sliceBars: number;
    if (typeof division === 'number') {
      sliceBars = division;
    } else if (division === '1/16') {
      sliceBars = 1 / spb;
    } else if (division === '1/8') {
      sliceBars = 2 / spb;
    } else if (division === '1/4') {
      sliceBars = 4 / spb;
    } else {
      sliceBars = 1.0;
    }

    const minL = this.minLen();
    sliceBars = Math.max(minL, this.snap(sliceBars));
    if (c.lengthBars <= sliceBars + 1e-4) return [c];

    const totalBars = c.lengthBars;
    const numSlices = Math.floor(totalBars / sliceBars);
    if (numSlices <= 1) return [c];

    const bpm = this.host.bpm;
    const rate = audioClipRate(c, bpm);
    const secPerB = secPerBar(bpm, spb);
    const baseOffset = c.audioOffset ?? 0;
    const baseStart = c.startBar;
    const baseName = (c.name || 'Slice').replace(/\s*#\d+$/, '');

    const slices: ArrangementClip[] = [];

    for (let i = 0; i < numSlices; i++) {
      const isFirst = i === 0;
      const isLast = i === numSlices - 1;
      const sBar = this.snap(baseStart + i * sliceBars);
      const lBars = isLast ? this.snap(baseStart + totalBars - sBar) : sliceBars;

      if (isFirst) {
        c.lengthBars = lBars;
        c.name = `${baseName} #1`;
        delete c.fadeOut;
        slices.push(c);
      } else {
        const slice = cloneClip(c);
        slice.id = newSeqId('clip');
        slice.startBar = sBar;
        slice.lengthBars = lBars;
        slice.name = `${baseName} #${i + 1}`;
        if (c.kind === 'audio') {
          slice.audioOffset = baseOffset + (sBar - baseStart) * secPerB * rate;
          delete slice.fadeIn;
          if (!isLast) delete slice.fadeOut;
        } else {
          slice.offsetSteps = Math.round((c.offsetSteps || 0) + (sBar - baseStart) * spb);
        }
        slices.push(slice);
      }
    }

    const list = f.t.arrangementClips!;
    const origIdx = list.indexOf(c);
    list.splice(origIdx + 1, 0, ...slices.slice(1));
    this.done(commit);
    return slices;
  }

  deleteClip(trackId: string, clipId: string, commit = true): void {
    const t = this.track(trackId);
    if (!t?.arrangementClips) return;
    const n = t.arrangementClips.length;
    t.arrangementClips = t.arrangementClips.filter((c) => c.id !== clipId);
    if (t.arrangementClips.length !== n) this.done(commit);
  }

  /** Deletes a clip and ripples subsequent clips earlier to fill the gap. */
  deleteClipWithRipple(trackId: string, clipId: string, rippleMode: 'track' | 'all' = 'track', commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f) return;
    const { startBar, lengthBars } = f.c;
    this.deleteClip(trackId, clipId, false);
    const affectedTracks = rippleMode === 'all' ? this.host.tracks : [f.t];
    for (const t of affectedTracks) {
      for (const other of t.arrangementClips ?? []) {
        if (other.startBar >= startBar + lengthBars - 1e-6) {
          other.startBar = Math.max(0, other.startBar - lengthBars);
        }
      }
    }
    this.done(commit);
  }

  /** Slips the internal content of a clip while keeping its timeline boundaries fixed. */
  /** `deltaSeconds` is the drag in seconds: audio slips in seconds, patterns in 16ths and notes in ticks at the song tempo. */
  slipClip(trackId: string, clipId: string, deltaSeconds: number, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f) return;
    const c = f.c;
    const sixteenthsPerSecond = this.host.bpm / 15;
    if (c.kind === 'audio') {
      const cur = c.audioOffset ?? 0;
      c.audioOffset = Math.max(0, cur + deltaSeconds);
      this.done(commit);
    } else if (c.kind === 'pattern') {
      const cur = c.offsetSteps ?? 0;
      c.offsetSteps = Math.max(0, cur + Math.round(deltaSeconds * sixteenthsPerSecond));
      this.done(commit);
    } else if (c.kind === 'notes' && c.notes) {
      const shiftTicks = Math.round(deltaSeconds * sixteenthsPerSecond * TICKS_PER_16TH);
      c.notes.forEach((n) => {
        n.offsetTicks = Math.max(0, (n.offsetTicks ?? 0) + shiftTicks);
      });
      this.done(commit);
    }
  }

  /** Copies the clip to right after itself. */
  duplicateClip(trackId: string, clipId: string, commit = true): ArrangementClip | null {
    const f = this.clip(trackId, clipId);
    if (!f) return null;
    const copy = cloneClip(f.c);
    copy.id = newSeqId('clip');
    copy.startBar = this.snap(clipEndBar(f.c));
    const list = f.t.arrangementClips!;
    list.splice(list.indexOf(f.c) + 1, 0, copy);
    this.done(commit);
    return copy;
  }

  updateClip(
    trackId: string,
    clipId: string,
    patch: Partial<Pick<ArrangementClip, 'muted' | 'name' | 'patternId' | 'color'>>,
    commit = true
  ): void {
    const f = this.clip(trackId, clipId);
    if (!f) return;
    if (patch.muted !== undefined) f.c.muted = !!patch.muted || undefined;
    if (patch.name !== undefined) f.c.name = patch.name.slice(0, 64);
    if (patch.color !== undefined && /^#[0-9a-f]{3,8}$/i.test(patch.color)) f.c.color = patch.color;
    if (patch.patternId !== undefined && f.c.kind !== 'notes' && findPattern(f.t, patch.patternId)) {
      f.c.patternId = patch.patternId;
      delete f.c.offsetSteps;
    }
    this.done(commit);
  }

  /** Changes audio clip settings (gain, fades, reverse, pitch, warp, loop, active take…). */
  updateAudioClip(trackId: string, clipId: string, patch: AudioClipPatch, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f || f.c.kind !== 'audio') return;
    const c = f.c;
    if (patch.name !== undefined) c.name = patch.name.slice(0, 64);
    if (patch.gainDb !== undefined) c.gainDb = Math.max(-60, Math.min(24, patch.gainDb));
    if (patch.fadeIn !== undefined) c.fadeIn = Math.max(0, patch.fadeIn);
    if (patch.fadeOut !== undefined) c.fadeOut = Math.max(0, patch.fadeOut);
    if (patch.reverse !== undefined) c.reverse = patch.reverse || undefined;
    if (patch.invertPhase !== undefined) c.invertPhase = patch.invertPhase || undefined;
    if (patch.fadeCurve !== undefined) c.fadeCurve = patch.fadeCurve;
    if (patch.pitch !== undefined) c.pitch = Math.max(-24, Math.min(24, Math.round(patch.pitch * 100) / 100)) || undefined;
    if (patch.sourceBpm !== undefined) c.sourceBpm = patch.sourceBpm > 0 ? Math.max(30, Math.min(300, patch.sourceBpm)) : undefined;
    if (patch.warp !== undefined) c.warp = patch.warp;
    if (patch.loopAudio !== undefined) c.loopAudio = patch.loopAudio || undefined;
    if (patch.loopSec !== undefined) c.loopSec = Math.max(0.01, patch.loopSec);
    if (patch.audioOffset !== undefined) c.audioOffset = Math.max(0, patch.audioOffset);
    if (patch.audioId !== undefined) c.audioId = patch.audioId;
    if (patch.takes !== undefined) c.takes = patch.takes;
    this.done(commit);
  }

  /** Sets an audio clip's length so it ends where its source audio ends (after warp / pitch changes). */
  fitAudioClip(trackId: string, clipId: string, sourceSeconds: number, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f || f.c.kind !== 'audio') return;
    const spb = this.host.stepsPerBar;
    const srcPerBar = secPerBar(this.host.bpm, spb) * audioClipRate(f.c, this.host.bpm);
    const bars = Math.max(0, sourceSeconds - (f.c.audioOffset ?? 0)) / srcPerBar;
    f.c.lengthBars = Math.max(this.minLen(), Math.ceil(bars * spb) / spb);
    this.done(commit);
  }

  /**
   * "Loop" handle: extends the clip by one more pass of its content. Note clips start
   * repeating their current length (`loopBars`) the first time.
   */
  extendClipLoop(trackId: string, clipId: string, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f) return;
    const c = f.c;
    let pass: number;
    if (c.kind === 'notes') {
      if (!(c.loopBars && c.loopBars > 0)) c.loopBars = c.lengthBars;
      pass = c.loopBars;
    } else if (c.kind === 'audio') {
      // First pull: the current region becomes the loop; every pull adds one more pass.
      const srcPerBar = secPerBar(this.host.bpm, this.host.stepsPerBar) * audioClipRate(c, this.host.bpm);
      if (!c.loopAudio) {
        c.loopAudio = true;
        c.loopSec = c.lengthBars * srcPerBar;
      }
      pass = Math.max(this.minLen(), (c.loopSec ?? c.lengthBars * srcPerBar) / srcPerBar);
    } else {
      const p = findPattern(f.t, c.patternId) || syncTrackPatterns(f.t, this.host.activePatternIndex);
      pass = Math.max(this.minLen(), patternLength16ths(p) / this.host.stepsPerBar);
    }
    c.lengthBars = Math.min(MAX_BAR, this.snap(c.lengthBars + pass));
    this.done(commit);
  }

  setClipLoop(trackId: string, clipId: string, loopBars: number | null, commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f || f.c.kind !== 'notes') return;
    if (loopBars && loopBars > 0) f.c.loopBars = Math.max(this.minLen(), this.snap(loopBars));
    else delete f.c.loopBars;
    this.done(commit);
  }

  setClipNotes(trackId: string, clipId: string, notes: ClipNote[], commit = true): void {
    const f = this.clip(trackId, clipId);
    if (!f || f.c.kind !== 'notes') return;
    f.c.notes = notes
      .filter((n) => n && Number.isFinite(n.step) && n.step >= 0 && Number.isFinite(n.note))
      .map((n) => ({ ...n, note: Math.max(0, Math.min(127, Math.round(n.note))) }))
      .sort((a, b) => a.step - b.step || a.note - b.note);
    this.done(commit);
  }

  /** Renders a pattern clip into an editable note clip with the same sound. */
  convertClipToNotes(trackId: string, clipId: string, commit = true): ArrangementClip | null {
    const f = this.clip(trackId, clipId);
    if (!f || f.c.kind === 'notes') return f?.c ?? null;
    const c = f.c;
    const spb = this.host.stepsPerBar;
    const p = findPattern(f.t, c.patternId) || syncTrackPatterns(f.t, this.host.activePatternIndex);
    const from = Math.round((c.offsetSteps || 0) * TICKS_PER_16TH);
    c.notes = renderPatternNotes(p, from, from + barToTick(c.lengthBars, spb));
    c.kind = 'notes';
    c.name = `${p.name} (notes)`;
    delete c.patternId;
    delete c.offsetSteps;
    delete c.loopBars;
    this.done(commit);
    return c;
  }

  /** Copies one pass of a note clip (or the pattern under a pattern clip) into a new pattern. */
  clipToPattern(trackId: string, clipId: string, commit = true): SequencerPattern | null {
    const f = this.clip(trackId, clipId);
    if (!f) return null;
    const c = f.c;
    if (c.kind !== 'notes') return findPattern(f.t, c.patternId) || null;
    const spb = this.host.stepsPerBar;
    const len16 = Math.max(1, Math.round((c.loopBars || c.lengthBars) * spb));
    const steps = resizeSteps([], len16);
    for (const n of c.notes || []) {
      const i = Math.round(n.step);
      if (i < 0 || i >= len16) continue;
      const ex = steps[i];
      if (!ex) {
        const { step: _s, ...rest } = n;
        steps[i] = { ...rest, chordNotes: n.chordNotes ? [...n.chordNotes] : undefined };
      } else if (ex.note !== n.note && !(ex.chordNotes || []).includes(n.note)) {
        ex.chordNotes = [...(ex.chordNotes || []), n.note];
        ex.chordLengths = [...(ex.chordLengths || (ex.chordNotes.slice(0, -1).map(() => ex.length))), n.length];
        ex.chordVelocities = [...(ex.chordVelocities || ex.chordNotes.slice(0, -1).map(() => ex.velocity)), n.velocity];
      }
    }
    const list = (f.t.patternList ||= []);
    const p = makePattern({ name: c.name || nextPatternName(f.t), color: PATTERN_COLORS[list.length % PATTERN_COLORS.length], length: len16, steps });
    list.push(p);
    this.done(commit);
    return p;
  }

  // ---------------------------------------------------------------- markers

  addMarker(bar: number, name?: string, commit = true): ProjectMarker {
    const m: ProjectMarker = {
      id: newSeqId('mk'),
      bar: this.snap(bar),
      name: (name || `Marker ${this.host.arrangementMarkers.length + 1}`).slice(0, 40),
      color: PATTERN_COLORS[this.host.arrangementMarkers.length % PATTERN_COLORS.length],
    };
    this.host.arrangementMarkers = [...this.host.arrangementMarkers, m].sort((a, b) => a.bar - b.bar);
    this.done(commit);
    return m;
  }

  updateMarker(id: string, patch: Partial<Pick<ProjectMarker, 'bar' | 'name'>>, commit = true): void {
    const m = this.host.arrangementMarkers.find((x) => x.id === id);
    if (!m) return;
    if (patch.bar !== undefined) m.bar = this.snap(patch.bar);
    if (patch.name !== undefined && patch.name.trim()) m.name = patch.name.trim().slice(0, 40);
    this.host.arrangementMarkers = [...this.host.arrangementMarkers].sort((a, b) => a.bar - b.bar);
    this.done(commit);
  }

  removeMarker(id: string, commit = true): void {
    this.host.arrangementMarkers = this.host.arrangementMarkers.filter((m) => m.id !== id);
    this.done(commit);
  }

  /** Ticks per step of a pattern (for UIs that draw patterns on a time grid). */
  static stepTicks(p: Pick<SequencerPattern, 'division'>): number {
    return divisionTicks(p.division);
  }
}
