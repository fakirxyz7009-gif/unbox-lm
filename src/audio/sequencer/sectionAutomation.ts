/**
 * What a song-section copy or move carries besides its clips: automation points, arrangement
 * markers, song-block placements and track-folder regions. Pure functions (no engine), so the same
 * rules are tested without a browser.
 *
 * Units follow the stores they work on: automation points are song 16ths, markers are bars.
 * A section is the half-open range [from, to): a point on `to` belongs to the next section.
 *
 * Automation is resampled at the section edges: a ramp that starts before the section and ends
 * inside it keeps its value and slope inside the copy, and a ramp that leaves the section gets an
 * end point at the boundary value instead of running into whatever follows the target section.
 * A sampled edge point inherits `hold` / `curve` from the segment it was taken from, so the shape
 * inside the section keeps its character. Points already outside the section are never rewritten:
 * when a moved edge point lands on one, the existing point wins.
 */
import type { FolderClip, ProjectMarker, SongBlockPlacement, TrackFolder } from '../types.ts';
import { sortPoints, valueAt, type AutoPoint } from '../automation/model.ts';

const EPS = 1e-6;
const inside = (pos: number, from: number, to: number) => pos > from + EPS && pos < to - EPS;
const inRange = (pos: number, from: number, to: number) => pos >= from - EPS && pos < to - EPS;

/** The point at `pos`, or the lane's value there plus the shape of the segment it came from. */
function sampleAt(points: readonly AutoPoint[], pos: number): AutoPoint | null {
  const exact = points.find((p) => Math.abs(p.pos - pos) < EPS);
  if (exact) return { ...exact };
  const value = valueAt(points, pos);
  if (value === null) return null;
  let prev: AutoPoint | undefined;
  for (const p of points) if (p.pos <= pos + EPS) prev = p;
  return {
    pos,
    value,
    ...(prev?.hold ? { hold: true as const } : prev?.curve ? { curve: prev.curve } : {}),
  };
}

/**
 * The section's automation as it sounds: its edges sampled, its own points in between.
 * Null when the range carries no automation (no point inside, no point on the start edge and no
 * segment crossing either edge) — a flat tail inherited from an earlier point is not content.
 */
export function sectionPoints(points: readonly AutoPoint[], fromPos: number, toPos: number): AutoPoint[] | null {
  if (!points.length || !(toPos > fromPos)) return null;
  const interior = points.filter((p) => inside(p.pos, fromPos, toPos));
  const atStart = points.some((p) => Math.abs(p.pos - fromPos) < EPS);
  const crosses = (pos: number) =>
    points.some((p) => p.pos < pos - EPS) && points.some((p) => p.pos > pos + EPS);
  if (!interior.length && !atStart && !crosses(fromPos)) return null;
  const start = sampleAt(points, fromPos);
  const end = sampleAt(points, toPos);
  if (!start || !end) return null;
  return [start, ...interior.map((p) => ({ ...p })), end];
}

/** Points the section owns: everything inside it, including a point on its start edge. */
const owns = (pos: number, from: number, to: number) => inRange(pos, from, to);

/** Points inside the range moved by `deltaPos`, resampled at both edges. Null when none. */
export function shiftSectionPoints(
  points: readonly AutoPoint[],
  fromPos: number,
  toPos: number,
  deltaPos: number
): AutoPoint[] | null {
  const section = sectionPoints(points, fromPos, toPos);
  if (!section) return null;
  const kept = points.filter((p) => !owns(p.pos, fromPos, toPos)).map((p) => ({ ...p }));
  const moved = section.map((p) => ({ ...p, pos: Math.max(0, p.pos + deltaPos) }));
  // Kept points last: an existing point where the moved section lands is never overwritten.
  return sortPoints([...moved, ...kept]);
}

/** Copies the section `deltaPos` away, resampled at both edges, leaving the originals. Null when none. */
export function copySectionPoints(
  points: readonly AutoPoint[],
  fromPos: number,
  toPos: number,
  deltaPos: number
): AutoPoint[] | null {
  const section = sectionPoints(points, fromPos, toPos);
  if (!section) return null;
  const copies = section.map((p) => ({ ...p, pos: Math.max(0, p.pos + deltaPos) }));
  return sortPoints([...copies, ...points.map((p) => ({ ...p }))]);
}

/** Markers inside the range moved by `deltaBar`. Null when none moved. */
export function shiftSectionMarkers(
  markers: readonly ProjectMarker[],
  fromBar: number,
  toBar: number,
  deltaBar: number
): ProjectMarker[] | null {
  const inside_ = markers.filter((m) => inRange(m.bar, fromBar, toBar));
  if (!inside_.length) return null;
  const moved = new Set(inside_);
  const out = markers.filter((m) => !moved.has(m)).map((m) => ({ ...m }));
  for (const m of inside_) out.push({ ...m, bar: Math.max(0, m.bar + deltaBar) });
  return out.sort((a, b) => a.bar - b.bar);
}

/** Song-block placements that start inside the range moved by `deltaBar`. Null when none. */
export function shiftSectionPlacements(
  placements: readonly SongBlockPlacement[],
  fromBar: number,
  toBar: number,
  deltaBar: number
): SongBlockPlacement[] | null {
  const inside_ = placements.filter((p) => inRange(p.startBar, fromBar, toBar));
  if (!inside_.length) return null;
  const moved = new Set(inside_);
  return placements.map((p) =>
    moved.has(p) ? { ...p, startBar: Math.max(0, p.startBar + deltaBar) } : { ...p }
  );
}

/** Copies the block placements inside the range `deltaBar` away with new ids. Null when none. */
export function copySectionPlacements(
  placements: readonly SongBlockPlacement[],
  fromBar: number,
  toBar: number,
  deltaBar: number,
  nextId: () => string
): SongBlockPlacement[] | null {
  const inside_ = placements.filter((p) => inRange(p.startBar, fromBar, toBar));
  if (!inside_.length) return null;
  return [
    ...placements.map((p) => ({ ...p })),
    ...inside_.map((p) => ({ ...p, id: nextId(), startBar: Math.max(0, p.startBar + deltaBar) })),
  ];
}

/**
 * Track-folder regions that start inside the range moved by `deltaBar`, so a grouped block of
 * clips stays grouped where the section lands. Null when no folder region moved.
 */
export function shiftSectionFolderClips(
  folders: readonly TrackFolder[],
  fromBar: number,
  toBar: number,
  deltaBar: number
): TrackFolder[] | null {
  let changed = false;
  const out = folders.map((f) => {
    if (!f.clips?.length) return f;
    let touched = false;
    const clips = f.clips.map((c) => {
      if (!inRange(c.startBar, fromBar, toBar)) return c;
      touched = true;
      return { ...c, startBar: Math.max(0, c.startBar + deltaBar) };
    });
    if (!touched) return f;
    changed = true;
    return { ...f, clips };
  });
  return changed ? out : null;
}

/** Copies the folder regions inside the range `deltaBar` away with new ids. Null when none. */
export function copySectionFolderClips(
  folders: readonly TrackFolder[],
  fromBar: number,
  toBar: number,
  deltaBar: number,
  nextId: () => string
): TrackFolder[] | null {
  let changed = false;
  const out = folders.map((f) => {
    if (!f.clips?.length) return f;
    const inside_ = f.clips.filter((c) => inRange(c.startBar, fromBar, toBar));
    if (!inside_.length) return f;
    changed = true;
    const copies: FolderClip[] = inside_.map((c) => ({ ...c, id: nextId(), startBar: Math.max(0, c.startBar + deltaBar) }));
    return { ...f, clips: [...f.clips, ...copies] };
  });
  return changed ? out : null;
}

/**
 * Automation with the section removed. When a segment crossed the deleted range, the value at its
 * start is kept as an anchor, so automation before the cut does not start sloping towards a point
 * that is now far away. Null when the lane had nothing in the range.
 */
export function clearSectionPoints(points: readonly AutoPoint[], fromPos: number, toPos: number): AutoPoint[] | null {
  const inside_ = points.filter((p) => inRange(p.pos, fromPos, toPos));
  if (!inside_.length) return null;
  const kept = points.filter((p) => !inRange(p.pos, fromPos, toPos)).map((p) => ({ ...p }));
  const crossing = points.some((p) => p.pos < fromPos - EPS) && points.some((p) => p.pos >= toPos - EPS);
  if (crossing && !kept.some((p) => Math.abs(p.pos - fromPos) < EPS)) {
    const anchor = sampleAt(points, fromPos);
    if (anchor) kept.push(anchor);
  }
  return sortPoints(kept);
}

/**
 * Automation after a ripple delete: the range's points go, everything later moves back by the
 * range length, and the value at the old end is anchored where the seam now is — so the automation
 * that follows the gap starts from the value it had, not from wherever the nearest earlier point is.
 * Null when there was nothing in the range and nothing after it.
 */
export function rippleSectionPoints(points: readonly AutoPoint[], fromPos: number, toPos: number): AutoPoint[] | null {
  if (!(toPos > fromPos)) return null;
  const after = points.filter((p) => p.pos >= toPos - EPS);
  const inside_ = points.filter((p) => inRange(p.pos, fromPos, toPos));
  if (!after.length && !inside_.length) return null;
  const delta = toPos - fromPos;
  const out = [
    ...points.filter((p) => p.pos < fromPos - EPS).map((p) => ({ ...p })),
    ...after.map((p) => ({ ...p, pos: Math.max(0, p.pos - delta) })),
  ];
  const seam = after.length ? sampleAt(points, toPos) : null;
  if (seam) out.push({ ...seam, pos: fromPos });
  return sortPoints(out);
}

/** Markers with the range removed and later markers pulled back by its length. Null when unchanged. */
export function rippleSectionMarkers(
  markers: readonly ProjectMarker[],
  fromBar: number,
  toBar: number
): ProjectMarker[] | null {
  const after = markers.filter((m) => m.bar >= toBar - EPS);
  const inside_ = markers.filter((m) => inRange(m.bar, fromBar, toBar));
  if (!after.length && !inside_.length) return null;
  const delta = toBar - fromBar;
  return [
    ...markers.filter((m) => m.bar < fromBar - EPS).map((m) => ({ ...m })),
    ...after.map((m) => ({ ...m, bar: Math.max(0, m.bar - delta) })),
  ].sort((a, b) => a.bar - b.bar);
}

/** Song-block placements after a ripple delete. Null when unchanged. */
export function rippleSectionPlacements(
  placements: readonly SongBlockPlacement[],
  fromBar: number,
  toBar: number
): SongBlockPlacement[] | null {
  const after = placements.filter((p) => p.startBar >= toBar - EPS);
  const inside_ = placements.filter((p) => inRange(p.startBar, fromBar, toBar));
  if (!after.length && !inside_.length) return null;
  const delta = toBar - fromBar;
  return [
    ...placements.filter((p) => p.startBar < fromBar - EPS).map((p) => ({ ...p })),
    ...after.map((p) => ({ ...p, startBar: Math.max(0, p.startBar - delta) })),
  ];
}

/** Track-folder regions after a ripple delete. Null when unchanged. */
export function rippleSectionFolderClips(
  folders: readonly TrackFolder[],
  fromBar: number,
  toBar: number
): TrackFolder[] | null {
  let changed = false;
  const delta = toBar - fromBar;
  const out = folders.map((f) => {
    if (!f.clips?.length) return f;
    const inside_ = f.clips.filter((c) => inRange(c.startBar, fromBar, toBar));
    const after = f.clips.filter((c) => c.startBar >= toBar - EPS);
    if (!inside_.length && !after.length) return f;
    changed = true;
    return {
      ...f,
      clips: [
        ...f.clips.filter((c) => c.startBar < fromBar - EPS).map((c) => ({ ...c })),
        ...after.map((c) => ({ ...c, startBar: Math.max(0, c.startBar - delta) })),
      ],
    };
  });
  return changed ? out : null;
}

/**
 * Automation after a ripple insert: points at or after the insert move right by the gap, and the
 * value at the insert point is anchored so the gap holds what came before instead of sloping across.
 * Null when nothing was at or after the insert point.
 */
export function insertSectionPoints(points: readonly AutoPoint[], atPos: number, deltaPos: number): AutoPoint[] | null {
  if (!(deltaPos > 0)) return null;
  const after = points.filter((p) => p.pos >= atPos - EPS);
  if (!after.length) return null;
  const anchor = sampleAt(points, atPos);
  const out = [
    ...points.filter((p) => p.pos < atPos - EPS).map((p) => ({ ...p })),
    ...after.map((p) => ({ ...p, pos: p.pos + deltaPos })),
  ];
  if (anchor) out.push(anchor);
  return sortPoints(out);
}

/** Markers at or after the insert point pushed right by the gap. Null when none. */
export function insertSectionMarkers(
  markers: readonly ProjectMarker[],
  atBar: number,
  deltaBar: number
): ProjectMarker[] | null {
  if (!(deltaBar > 0)) return null;
  const after = markers.filter((m) => m.bar >= atBar - EPS);
  if (!after.length) return null;
  return [
    ...markers.filter((m) => m.bar < atBar - EPS).map((m) => ({ ...m })),
    ...after.map((m) => ({ ...m, bar: m.bar + deltaBar })),
  ].sort((a, b) => a.bar - b.bar);
}

/** Song-block placements at or after the insert point pushed right by the gap. Null when none. */
export function insertSectionPlacements(
  placements: readonly SongBlockPlacement[],
  atBar: number,
  deltaBar: number
): SongBlockPlacement[] | null {
  if (!(deltaBar > 0)) return null;
  const after = placements.filter((p) => p.startBar >= atBar - EPS);
  if (!after.length) return null;
  return [
    ...placements.filter((p) => p.startBar < atBar - EPS).map((p) => ({ ...p })),
    ...after.map((p) => ({ ...p, startBar: p.startBar + deltaBar })),
  ];
}

/** Track-folder regions at or after the insert point pushed right by the gap. Null when none. */
export function insertSectionFolderClips(
  folders: readonly TrackFolder[],
  atBar: number,
  deltaBar: number
): TrackFolder[] | null {
  if (!(deltaBar > 0)) return null;
  let changed = false;
  const out = folders.map((f) => {
    if (!f.clips?.length) return f;
    const after = f.clips.filter((c) => c.startBar >= atBar - EPS);
    if (!after.length) return f;
    changed = true;
    const moved = new Set(after);
    return {
      ...f,
      clips: f.clips.map((c) => (moved.has(c) ? { ...c, startBar: c.startBar + deltaBar } : c)),
    };
  });
  return changed ? out : null;
}

/** Markers with the section removed. Null when none were in the range. */
export function clearSectionMarkers(markers: readonly ProjectMarker[], fromBar: number, toBar: number): ProjectMarker[] | null {
  const kept = markers.filter((m) => !inRange(m.bar, fromBar, toBar));
  return kept.length === markers.length ? null : kept;
}

/** Song-block placements with the section removed. Null when none were in the range. */
export function clearSectionPlacements(
  placements: readonly SongBlockPlacement[],
  fromBar: number,
  toBar: number
): SongBlockPlacement[] | null {
  const kept = placements.filter((p) => !inRange(p.startBar, fromBar, toBar));
  return kept.length === placements.length ? null : kept;
}

/** Track-folder regions with the section removed. Null when none were in the range. */
export function clearSectionFolderClips(
  folders: readonly TrackFolder[],
  fromBar: number,
  toBar: number
): TrackFolder[] | null {
  let changed = false;
  const out = folders.map((f) => {
    if (!f.clips?.length) return f;
    const kept = f.clips.filter((c) => !inRange(c.startBar, fromBar, toBar));
    if (kept.length === f.clips.length) return f;
    changed = true;
    return { ...f, clips: kept };
  });
  return changed ? out : null;
}

/** Copies the markers inside the range `deltaBar` away with new ids. Null when none. */
export function copySectionMarkers(
  markers: readonly ProjectMarker[],
  fromBar: number,
  toBar: number,
  deltaBar: number,
  nextId: () => string
): ProjectMarker[] | null {
  const inside_ = markers.filter((m) => inRange(m.bar, fromBar, toBar));
  if (!inside_.length) return null;
  return [
    ...markers.map((m) => ({ ...m })),
    ...inside_.map((m) => ({ ...m, id: nextId(), bar: Math.max(0, m.bar + deltaBar) })),
  ].sort((a, b) => a.bar - b.bar);
}
