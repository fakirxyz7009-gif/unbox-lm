import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTempo } from '../shared/analysis/tempo.ts';

const SR = 44100;

/** A kick (a decaying 60 Hz sine) on every beat, plus a hat on every eighth note. */
function groove(bpm: number, seconds: number, hats = true): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  const beat = 60 / bpm;
  const hit = (at: number, length: number, freq: number, decay: number, gain: number) => {
    const start = Math.round(at * SR);
    for (let i = 0; i < length * SR && start + i < out.length; i++) {
      const t = i / SR;
      out[start + i] += gain * Math.exp(-t * decay) * Math.sin(2 * Math.PI * freq * t);
    }
  };
  for (let t = 0; t < seconds; t += beat) {
    hit(t, 0.15, 60, 25, 0.9);
    if (hats) {
      hit(t + beat / 2, 0.03, 8000, 120, 0.2);
    }
  }
  return out;
}

test('silence and very short clips have no tempo', () => {
  assert.equal(estimateTempo(new Float32Array(SR * 10), SR), null);
  assert.equal(estimateTempo(groove(120, 1), SR), null);
});

test('click tracks read at their own tempo, not at half or double', () => {
  for (const bpm of [90, 120, 128, 150]) {
    const estimate = estimateTempo(groove(bpm, 20), SR);
    assert.ok(estimate, `a tempo for ${bpm}`);
    assert.ok(Math.abs(estimate.bpm - bpm) <= 0.5, `${bpm} BPM read as ${estimate.bpm}`);
  }
});

test('a drum groove at 120 BPM reads 120, not the 60 BPM of its bar', () => {
  // Kick on every beat and a hat on every eighth note: the bar repeats every two seconds, a tempting half tempo.
  const estimate = estimateTempo(groove(120, 20), SR);
  assert.ok(estimate);
  assert.ok(Math.abs(estimate.bpm - 120) <= 0.5, `read as ${estimate.bpm}`);
  assert.ok(estimate.strength > 1, 'a steady beat is stronger than the average candidate');
});
