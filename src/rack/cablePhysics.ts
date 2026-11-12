/**
 * Patch-cable physics: a verlet rope pinned at both jacks, pulled down by gravity, drawn as a
 * smooth SVG path (Catmull-Rom through the rope points, emitted as cubic Bezier segments).
 * Pure math — no DOM, no React — so it can be stepped from a requestAnimationFrame loop.
 */

export interface Rope {
  n: number;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  /** Rest length of one segment. */
  seg: number;
  /** Consecutive frames with negligible motion. */
  calm: number;
  /** Small sideways acceleration (px/s²) so vertical runs bow apart instead of hanging dead straight. */
  bias: number;
}

const POINTS = 18;
const GRAVITY = 2400; // px/s²
const DAMPING = 0.965;
const ITERATIONS = 18;
export const SETTLE_FRAMES = 24;

/** Cable length for a span: a little slack plus a share of the distance, like real patch leads. */
export function slackLength(ax: number, ay: number, bx: number, by: number): number {
  const d = Math.hypot(bx - ax, by - ay);
  return d + Math.min(170, 34 + d * 0.1);
}

export function createRope(ax: number, ay: number, bx: number, by: number, bias = 0): Rope {
  const n = POINTS;
  const rope: Rope = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    seg: slackLength(ax, ay, bx, by) / (n - 1),
    calm: 0,
    bias,
  };
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    rope.x[i] = rope.px[i] = ax + (bx - ax) * t;
    rope.y[i] = rope.py[i] = ay + (by - ay) * t;
  }
  return rope;
}

/** Re-fit the cable length after its jacks moved (resize, scroll-out-of-view, drag). */
export function refitRope(rope: Rope, ax: number, ay: number, bx: number, by: number): void {
  rope.seg = slackLength(ax, ay, bx, by) / (rope.n - 1);
  rope.calm = 0;
}

export function reverseRope(rope: Rope): Rope {
  const flip = (a: Float32Array) => Float32Array.from(a).reverse();
  return { ...rope, x: flip(rope.x), y: flip(rope.y), px: flip(rope.px), py: flip(rope.py) };
}

/** One simulation step with both ends pinned. Returns the largest point movement in px. */
export function stepRope(rope: Rope, ax: number, ay: number, bx: number, by: number, dt: number): number {
  const safeDt = Math.max(0.005, Math.min(0.033, Number.isFinite(dt) ? dt : 0.016));
  const { n, x, y, px, py } = rope;
  const g = GRAVITY * safeDt * safeDt;
  const side = rope.bias * safeDt * safeDt;
  let moved = 0;
  for (let i = 1; i < n - 1; i++) {
    const vx = (x[i] - px[i]) * DAMPING;
    const vy = (y[i] - py[i]) * DAMPING;
    px[i] = x[i];
    py[i] = y[i];
    x[i] += vx + side;
    y[i] += vy + g;
  }
  x[0] = px[0] = ax;
  y[0] = py[0] = ay;
  x[n - 1] = px[n - 1] = bx;
  y[n - 1] = py[n - 1] = by;

  // Rope constraint: segments may go slack but never stretch beyond their rest length.
  for (let k = 0; k < ITERATIONS; k++) {
    for (let i = 0; i < n - 1; i++) {
      const dx = x[i + 1] - x[i];
      const dy = y[i + 1] - y[i];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= rope.seg || d === 0) continue;
      const diff = (d - rope.seg) / d;
      if (i === 0) {
        x[i + 1] -= dx * diff;
        y[i + 1] -= dy * diff;
      } else if (i + 1 === n - 1) {
        x[i] += dx * diff;
        y[i] += dy * diff;
      } else {
        x[i] += dx * diff * 0.5;
        y[i] += dy * diff * 0.5;
        x[i + 1] -= dx * diff * 0.5;
        y[i + 1] -= dy * diff * 0.5;
      }
    }
  }
  for (let i = 1; i < n - 1; i++) moved = Math.max(moved, Math.abs(x[i] - px[i]) + Math.abs(y[i] - py[i]));
  rope.calm = moved < 0.04 ? rope.calm + 1 : 0;
  return moved;
}

export const isSettled = (rope: Rope): boolean => rope.calm >= SETTLE_FRAMES;

/** Stable per-cable sideways bias: ±180..320 px/s² picked from the cable id. */
export function cableBias(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h >>>= 0;
  return (h & 1 ? 1 : -1) * (180 + (h % 140));
}

/** Smooth path through the rope points (Catmull-Rom → cubic Bezier). */
export function ropePath(rope: Rope): string {
  const { n, x, y } = rope;
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(x[0])} ${f(y[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i3 = Math.min(n - 1, i + 2);
    const c1x = x[i] + (x[i + 1] - x[i0]) / 6;
    const c1y = y[i] + (y[i + 1] - y[i0]) / 6;
    const c2x = x[i + 1] - (x[i3] - x[i]) / 6;
    const c2y = y[i + 1] - (y[i3] - y[i]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x[i + 1])} ${f(y[i + 1])}`;
  }
  return d;
}

/** Unit direction of the cable leaving an end (for drawing the plug sleeve). */
export function endDirection(rope: Rope, end: 0 | 1): { ux: number; uy: number } {
  const a = end === 0 ? 0 : rope.n - 1;
  const b = end === 0 ? 1 : rope.n - 2;
  const dx = rope.x[b] - rope.x[a];
  const dy = rope.y[b] - rope.y[a];
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len };
}
