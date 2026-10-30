import test from 'node:test';
import assert from 'node:assert/strict';
import { thinPoints, type AutoPoint } from '../src/audio/automation/model.ts';

/** The value a lane plays at `pos` when it is straight between points (no curves or holds). */
function playedAt(points: AutoPoint[], pos: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (pos >= a.pos && pos <= b.pos) return a.value + (b.value - a.value) * ((pos - a.pos) / (b.pos - a.pos || 1));
  }
  return points[points.length - 1].value;
}

test('a slow drift in small steps stays within the tolerance everywhere after thinning', () => {
  const tolerance = 0.004;
  const points: AutoPoint[] = Array.from({ length: 400 }, (_, i) => ({ pos: i, value: 0.2 + 0.0005 * i + 0.1 * Math.sin(i / 60) }));
  const thinned = thinPoints(points, tolerance);
  assert.ok(thinned.length < points.length / 2, `only ${points.length - thinned.length} points were dropped`);
  assert.equal(thinned[0], points[0]);
  assert.equal(thinned[thinned.length - 1], points[points.length - 1]);
  for (const p of points) {
    assert.ok(Math.abs(playedAt(thinned, p.pos) - p.value) <= tolerance + 1e-9, `the curve moved by more than the tolerance at ${p.pos}`);
  }
});

test('a straight run collapses to its two ends', () => {
  const points: AutoPoint[] = [{ pos: 0, value: 0 }, { pos: 1, value: 0.1 }, { pos: 2, value: 0.2 }, { pos: 3, value: 0.3 }];
  assert.deepEqual(thinPoints(points).map((p) => p.pos), [0, 3]);
});

test('a bend that is outside the tolerance keeps its point', () => {
  const points: AutoPoint[] = [{ pos: 0, value: 0 }, { pos: 1, value: 0.5 }, { pos: 2, value: 0 }];
  assert.deepEqual(thinPoints(points).map((p) => p.pos), [0, 1, 2]);
});

test('shaped and held points are never removed', () => {
  const points: AutoPoint[] = [
    { pos: 0, value: 0 },
    { pos: 1, value: 0.25 },
    { pos: 2, value: 0.5, curve: 0.4 },
    { pos: 3, value: 0.75 },
    { pos: 4, value: 1, hold: true },
    { pos: 5, value: 1 },
  ];
  const kept = thinPoints(points).map((p) => p.pos);
  assert.ok(kept.includes(2), 'the curved point was removed');
  assert.ok(kept.includes(4), 'the held point was removed');
});

test('short lists are returned as they are', () => {
  const two: AutoPoint[] = [{ pos: 0, value: 0 }, { pos: 1, value: 1 }];
  assert.equal(thinPoints(two), two);
});
