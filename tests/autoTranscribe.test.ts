import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeSource } from '../shared/transcription/autoTranscribe.ts';

const SR = 44100;

/** Deterministic white noise in -1..1 (a linear congruential generator). */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** A harmonic tone (partials at 1/h) with a 20 ms attack and a 0.3 s release, added into `out`. */
function addTone(out: Float32Array, midi: number, start: number, length: number, gain = 0.3): void {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const from = Math.round(start * SR);
  const to = Math.min(out.length, from + Math.round(length * SR));
  for (let i = from; i < to; i++) {
    const t = (i - from) / SR;
    const env = Math.min(1, t / 0.02) * Math.min(1, (to - i) / (0.3 * SR));
    let v = 0;
    for (let h = 1; h * f0 < 5000; h++) v += Math.sin(2 * Math.PI * h * f0 * t) / h;
    out[i] += gain * env * v;
  }
}

function addKick(out: Float32Array, at: number): void {
  const from = Math.round(at * SR);
  let phase = 0;
  for (let i = from; i < Math.min(out.length, from + 0.3 * SR); i++) {
    const t = (i - from) / SR;
    const f = 40 + 50 * Math.exp(-t / 0.03);
    phase += (2 * Math.PI * f) / SR;
    out[i] += 0.8 * Math.exp(-t / 0.12) * Math.sin(phase);
  }
}

function addSnare(out: Float32Array, at: number, rand: () => number): void {
  const from = Math.round(at * SR);
  for (let i = from; i < Math.min(out.length, from + 0.25 * SR); i++) {
    const t = (i - from) / SR;
    out[i] += 0.4 * Math.exp(-t / 0.06) * rand() + 0.3 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * 200 * t);
  }
}

function addHat(out: Float32Array, at: number, rand: () => number): void {
  const from = Math.round(at * SR);
  let prev = 0;
  for (let i = from; i < Math.min(out.length, from + 0.08 * SR); i++) {
    const t = (i - from) / SR;
    const x = rand();
    out[i] += 0.2 * Math.exp(-t / 0.02) * (x - prev);
    prev = x;
  }
}

/** Kick on 1 and 3, snare on 2 and 4, eighth-note hats, 120 BPM, `bars` bars. */
function addGroove(out: Float32Array, bars: number): void {
  const rand = noise(7);
  const beat = 0.5;
  for (let b = 0; b < bars * 4; b++) {
    const t = 0.2 + b * beat;
    if (b % 2 === 0) addKick(out, t);
    else addSnare(out, t, rand);
    addHat(out, t, rand);
    addHat(out, t + beat / 2, rand);
  }
}

test('silence is silent', () => {
  const result = transcribeSource(new Float32Array(SR), SR);
  assert.equal(result.kind, 'silent');
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.hits, []);
});

test('a drum groove is a drums source with kit hits and no notes', () => {
  const out = new Float32Array(4 * SR);
  addGroove(out, 2);
  const result = transcribeSource(out, SR);
  assert.equal(result.kind, 'drums');
  assert.ok(result.hits.length >= 8, `hits ${result.hits.length}`);
  assert.deepEqual(result.notes, []);
});

test('a melody is a pitched source, and one line', () => {
  const out = new Float32Array(3 * SR);
  [60, 64, 67].forEach((midi, i) => addTone(out, midi, 0.2 + i * 0.8, 0.6));
  const result = transcribeSource(out, SR);
  assert.equal(result.kind, 'pitched');
  assert.equal(result.monophonic, true);
  assert.deepEqual(result.hits, []);
  assert.ok([60, 64, 67].includes(result.rootNote ?? -1), `root ${result.rootNote}`);
});

test('a chord is a pitched source that is not one line', () => {
  const out = new Float32Array(2 * SR);
  for (const midi of [60, 64, 67]) addTone(out, midi, 0.5, 1.0);
  const result = transcribeSource(out, SR);
  assert.equal(result.kind, 'pitched');
  assert.equal(result.monophonic, false);
});

test('a groove under a chord is never silent: its dominant part is transcribed', () => {
  const out = new Float32Array(4 * SR);
  addGroove(out, 2);
  for (const midi of [60, 64, 67]) addTone(out, midi, 0.5, 3.0);
  const result = transcribeSource(out, SR);
  assert.notEqual(result.kind, 'silent');
  assert.ok(result.hits.length + result.notes.length > 0, 'the dominant part must produce notes or hits');
});
