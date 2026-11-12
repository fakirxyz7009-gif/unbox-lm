/**
 * The grid that follows the zoom: the closer an editor is zoomed in, the finer its lines (bar → beat →
 * 8th → 16th → 32nd → 64th → 128th), and an AUTO snap lands on the finest line drawn. Pure.
 *
 * Sizes are in an editor's own unit (the piano roll: one pattern step; the timeline: one 16th).
 */

/** Snap value meaning "the finest grid line visible at this zoom". */
export const SNAP_AUTO = -1;

/** Lines closer than this are not drawn (and not snapped to). */
export const MIN_GRID_PX = 9;

export interface GridLevel {
  /** Spacing in units. */
  size: number;
  /** 0 = bar, 1 = beat, 2… finer subdivisions (for line weight). */
  rank: number;
}

/**
 * Grid levels from the bar down to 1/8 of a unit, each one dividing the one above it: bar, beat,
 * then halves (8th, 16th, 32nd … for a 16th unit).
 */
export function gridLevels(unitsPerBar: number, unitsPerBeat: number): GridLevel[] {
  const out: GridLevel[] = [{ size: unitsPerBar, rank: 0 }];
  if (unitsPerBeat > 0 && unitsPerBeat < unitsPerBar) out.push({ size: unitsPerBeat, rank: 1 });
  let size = Math.min(unitsPerBeat, unitsPerBar) / 2;
  let rank = 2;
  // halves while they stay a whole number of 128ths of a unit
  while (size >= 1 / 8 - 1e-9) {
    out.push({ size, rank: rank++ });
    size /= 2;
  }
  return out;
}

/** The levels whose lines are at least `minPx` apart at `pxPerUnit` (coarse to fine). */
export function visibleLevels(pxPerUnit: number, unitsPerBar: number, unitsPerBeat: number, minPx = MIN_GRID_PX): GridLevel[] {
  return gridLevels(unitsPerBar, unitsPerBeat).filter((l) => l.size * pxPerUnit >= minPx);
}

/** The finest visible grid size, in units (the bar when even that is closer than `minPx`). */
export function finestGrid(pxPerUnit: number, unitsPerBar: number, unitsPerBeat: number, minPx = MIN_GRID_PX): number {
  const v = visibleLevels(pxPerUnit, unitsPerBar, unitsPerBeat, minPx);
  return v.length ? v[v.length - 1].size : unitsPerBar;
}

/** The snap an editor uses: AUTO follows the zoom, 0 = off, else the value itself. */
export function effectiveSnap(snap: number, pxPerUnit: number, unitsPerBar: number, unitsPerBeat: number): number {
  return snap === SNAP_AUTO ? finestGrid(pxPerUnit, unitsPerBar, unitsPerBeat) : snap;
}

/** A readable name for a grid size in 16ths ("1 bar", "1/4", "1/32" …). */
export function gridLabel(size16: number, stepsPerBar: number): string {
  if (Math.abs(size16 - stepsPerBar) < 1e-9) return '1 bar';
  if (size16 > stepsPerBar) return `${+(size16 / stepsPerBar).toFixed(2)} bars`;
  const denom = Math.round(16 / size16);
  return Math.abs(16 / denom - size16) < 1e-9 ? `1/${denom}` : `${+size16.toFixed(3)} × 1/16`;
}
