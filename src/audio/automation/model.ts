/**
 * Automation data (pure): lanes of points over song position (16ths) with normalized values,
 * curves and step holds, target ranges and the value at any position.
 */

export type ChannelParam = 'volume' | 'pan' | 'mute' | 'trim' | 'width' | `send:${string}`;
export type MasterParam = 'volume' | 'width' | 'low' | 'mid' | 'high';

export type AutoTarget =
  | { kind: 'channel'; channelId: string; param: ChannelParam }
  | { kind: 'device'; deviceId: string; param: string }
  | { kind: 'master'; param: MasterParam }
  | { kind: 'tempo' };

export type AutoMode = 'read' | 'touch' | 'latch' | 'write' | 'off';

export interface AutoPoint {
  /** Song position in 16ths (fractional allowed). */
  pos: number;
  /** 0..1 over the target range. */
  value: number;
  /** Bend of the segment to the next point, -1..1 (0 = straight line). */
  curve?: number;
  /** Hold the value until the next point (step). */
  hold?: boolean;
}

export interface AutoLane {
  id: string;
  target: AutoTarget;
  points: AutoPoint[];
  mode: AutoMode;
  /** Track whose arrangement lane shows it (channel / device lanes). */
  trackId?: string;
  /** Shown under its track in the arrangement. */
  visible: boolean;
}

export interface TargetRange {
  min: number;
  max: number;
  log?: boolean;
  /** Discrete on/off (mute). */
  toggle?: boolean;
  unit?: string;
  label: string;
}

export const targetKey = (t: AutoTarget): string =>
  t.kind === 'channel' ? `ch:${t.channelId}:${t.param}` : t.kind === 'device' ? `dev:${t.deviceId}:${t.param}` : t.kind === 'master' ? `master:${t.param}` : 'tempo';

export const sameTarget = (a: AutoTarget, b: AutoTarget): boolean => targetKey(a) === targetKey(b);

/** Normalized 0..1 → value in the range. */
export function denorm(r: TargetRange, n: number): number {
  const x = Math.max(0, Math.min(1, n));
  if (r.toggle) return x >= 0.5 ? 1 : 0;
  if (r.log && r.min > 0) return r.min * Math.pow(r.max / r.min, x);
  return r.min + (r.max - r.min) * x;
}

/** Value → normalized 0..1. */
export function norm(r: TargetRange, v: number): number {
  if (r.toggle) return v ? 1 : 0;
  if (r.log && r.min > 0) return Math.max(0, Math.min(1, Math.log(Math.max(r.min, v) / r.min) / Math.log(r.max / r.min)));
  return Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min || 1)));
}

function shape(t: number, curve: number): number {
  if (!curve) return t;
  const k = 1 + Math.abs(curve) * 4;
  return curve > 0 ? Math.pow(t, k) : 1 - Math.pow(1 - t, k);
}

/** Normalized value at `pos` (null when the lane has no points). */
export function valueAt(points: readonly AutoPoint[], pos: number): number | null {
  const n = points.length;
  if (!n) return null;
  if (pos <= points[0].pos) return points[0].value;
  if (pos >= points[n - 1].pos) return points[n - 1].value;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].pos <= pos) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (a.hold || b.pos === a.pos) return a.value;
  const t = (pos - a.pos) / (b.pos - a.pos);
  return a.value + (b.value - a.value) * shape(t, a.curve ?? 0);
}

/** Keeps points sorted and unique by position (last write wins). */
export function sortPoints(points: AutoPoint[]): AutoPoint[] {
  points.sort((a, b) => a.pos - b.pos);
  const out: AutoPoint[] = [];
  for (const p of points) {
    if (out.length && Math.abs(out[out.length - 1].pos - p.pos) < 1e-6) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Removes points in (from, to] — used when recording overwrites a range. */
export function clearRange(points: AutoPoint[], from: number, to: number): AutoPoint[] {
  return points.filter((p) => p.pos <= from || p.pos > to);
}

/**
 * Drops points that a straight line already describes (recording cleanup). Every dropped point lies
 * within `tolerance` of the kept segment that replaces it, so a slow drift cannot build up over many
 * small steps. Shaped and held points are always kept.
 */
export function thinPoints(points: AutoPoint[], tolerance = 0.004): AutoPoint[] {
  if (points.length < 3) return points;
  const out: AutoPoint[] = [points[0]];
  let anchor = 0;
  let next = 2;
  while (next < points.length) {
    if (fitsLine(points, anchor, next, tolerance)) {
      next += 1;
      continue;
    }
    // The point before `next` is the last one the straight line from the anchor still describes.
    anchor = next - 1;
    out.push(points[anchor]);
    next = anchor + 2;
  }
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/** True when every point strictly between `a` and `b` lies within `tolerance` of the straight line from a to b. */
function fitsLine(points: AutoPoint[], a: number, b: number, tolerance: number): boolean {
  const start = points[a];
  const end = points[b];
  if (start.hold || start.curve) return false;
  for (let k = a + 1; k < b; k++) {
    const p = points[k];
    if (p.hold || p.curve) return false;
    const t = (p.pos - start.pos) / (end.pos - start.pos || 1);
    if (Math.abs(start.value + (end.value - start.value) * t - p.value) > tolerance) return false;
  }
  return true;
}
