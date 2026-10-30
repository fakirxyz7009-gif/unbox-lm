import test from 'node:test';
import assert from 'node:assert/strict';
import { detectKey } from '../shared/analysis/keyDetection.ts';

const SR = 44100;

/** A struck harmonic tone (partials 1 to 4 at falling strength), added into `out`. */
function addChord(out: Float32Array, midis: number[], start: number, length: number): void {
  const from = Math.round(start * SR);
  const to = Math.min(out.length, from + Math.round(length * SR));
  for (const midi of midis) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    for (let i = from; i < to; i++) {
      const t = (i - from) / SR;
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * h * f0 * t) / h;
      out[i] += 0.12 * Math.min(1, t / 0.01) * Math.exp(-t / 1.5) * v;
    }
  }
}

/** Chords (MIDI notes) one second apart, the first and last on the tonic. */
function progression(chords: number[][]): Float32Array {
  const out = new Float32Array(Math.round(chords.length * SR) + SR);
  chords.forEach((chord, i) => addChord(out, chord, i, 1));
  return out;
}

test('silence has no key', () => {
  assert.equal(detectKey(new Float32Array(SR * 2), SR), null);
});

test('a C major progression reads as C major', () => {
  // C, Am, F, G, C: the tonic chords dominate the start and the end.
  const clip = progression([[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50], [48, 52, 55]]);
  const key = detectKey(clip, SR);
  assert.ok(key, 'a key is found');
  assert.equal(key.name, 'C major');
  assert.equal(key.root, 0);
  assert.equal(key.mode, 'major');
});

test('an A minor progression reads as A minor, not its relative C major', () => {
  // Am, F, C, G, Am, Am: A is the tonic, and the minor tonic chord comes back at the end.
  const clip = progression([[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [57, 60, 64]]);
  const key = detectKey(clip, SR);
  assert.ok(key, 'a key is found');
  assert.equal(key.name, 'A minor');
  assert.equal(key.root, 9);
  assert.equal(key.mode, 'minor');
});

test('a G major progression is transposed correctly', () => {
  // G, C, D, G, G: the same shape as the C progression, a fifth higher.
  const clip = progression([[55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62], [55, 59, 62]]);
  const key = detectKey(clip, SR);
  assert.ok(key, 'a key is found');
  assert.equal(key.name, 'G major');
  assert.ok(key.clarity >= 0 && key.clarity <= 1);
});
