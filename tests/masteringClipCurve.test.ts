import test from 'node:test';
import assert from 'node:assert/strict';
import { clipCurve } from '../src/audio/mastering/clipCurve.ts';

/** What a WaveShaper outputs for an input in [-1, 1] (linear interpolation between curve points). */
function shape(curve: Float32Array, v: number): number {
  const pos = ((v + 1) / 2) * (curve.length - 1);
  const i = Math.floor(pos);
  if (i >= curve.length - 1) return curve[curve.length - 1];
  const f = pos - i;
  return curve[i] * (1 - f) + curve[i + 1] * f;
}

test('below the knee the clipper is unity gain (it used to add about +6 dB)', () => {
  const curve = clipCurve();
  for (const level of [0.001, 0.05, 0.1, 0.3, 0.6, 0.79]) {
    assert.ok(Math.abs(shape(curve, level) - level) < 1e-4, `${level} came out at ${shape(curve, level)}`);
    assert.ok(Math.abs(shape(curve, -level) + level) < 1e-4, `-${level} came out at ${shape(curve, -level)}`);
  }
});

test('above the knee the curve compresses, and full scale stays under 0 dBFS', () => {
  const curve = clipCurve();
  const nearKnee = shape(curve, 0.9);
  assert.ok(nearKnee > 0.8 && nearKnee < 0.9, `0.9 came out at ${nearKnee}`);
  const full = shape(curve, 1);
  assert.ok(full > 0.9 && full < 1, `full scale came out at ${full}`);
});

test('the curve never folds back: output rises with input across the whole range', () => {
  const curve = clipCurve();
  let previous = -Infinity;
  for (let i = 0; i <= 400; i++) {
    const out = shape(curve, -1 + i / 200);
    assert.ok(out >= previous - 1e-6, `output fell at input ${-1 + i / 200}`);
    previous = out;
  }
});
