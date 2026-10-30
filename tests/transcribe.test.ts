import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTempo,
  melodyNotes,
  secondsToSteps,
  trackPitch,
  transcribeDrums,
  transcribeMelody,
} from '../shared/transcription/transcribe.ts';

const SR = 44100;

/** Deterministic white noise in -1..1 (a linear congruential generator). */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

function addKick(out: Float32Array, at: number): void {
  const from = Math.round(at * SR);
  let phase = 0;
  for (let i = 0; i < SR * 0.4 && from + i < out.length; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (45 + 75 * Math.exp(-t / 0.03))) / SR;
    out[from + i] += 0.9 * Math.exp(-t / 0.12) * Math.min(1, (0.4 - t) / 0.01) * Math.sin(phase);
  }
}

function addSnare(out: Float32Array, at: number, rnd: () => number): void {
  const from = Math.round(at * SR);
  for (let i = 0; i < SR * 0.2 && from + i < out.length; i++) {
    const t = i / SR;
    out[from + i] += 0.5 * Math.exp(-t / 0.05) * rnd() + 0.6 * Math.exp(-t / 0.04) * Math.sin(2 * Math.PI * 180 * t);
  }
}

function addHat(out: Float32Array, at: number, rnd: () => number): void {
  const from = Math.round(at * SR);
  let previous = 0;
  for (let i = 0; i < SR * 0.06 && from + i < out.length; i++) {
    const t = i / SR;
    const white = rnd();
    out[from + i] += 0.4 * Math.exp(-t / 0.015) * (white - previous);
    previous = white;
  }
}

function addSine(out: Float32Array, at: number, seconds: number, hz: number): void {
  const from = Math.round(at * SR);
  const n = Math.round(seconds * SR);
  for (let i = 0; i < n && from + i < out.length; i++) {
    const edge = Math.min(1, i / (0.01 * SR), (n - i) / (0.01 * SR));
    out[from + i] += 0.6 * edge * Math.sin((2 * Math.PI * hz * i) / SR);
  }
}

test('kick, snare and hat onsets are found and classified', () => {
  const out = new Float32Array(Math.round(4.5 * SR));
  const rnd = noise(7);
  const kicks = [0.2, 0.7, 1.2, 1.7];
  const snares = [2.2, 2.7];
  const hats = [3.2, 3.45, 3.7, 3.95];
  kicks.forEach((t) => addKick(out, t));
  snares.forEach((t) => addSnare(out, t, rnd));
  hats.forEach((t) => addHat(out, t, rnd));
  const { hits } = transcribeDrums(out, SR);
  const byClass = (cls: string) => hits.filter((h) => h.cls === cls).map((h) => h.time);
  const near = (found: number[], expected: number[]) => {
    assert.equal(found.length, expected.length, `found ${found.map((t) => t.toFixed(2)).join(', ')}`);
    expected.forEach((t, i) => assert.ok(Math.abs(found[i] - t) < 0.03, `onset ${found[i]} is not near ${t}`));
  };
  near(byClass('kick'), kicks);
  near(byClass('snare'), snares);
  near(byClass('hat'), hats);
});

test('tempo follows the spacing of the onsets', () => {
  assert.equal(estimateTempo([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]), 120);
  assert.equal(estimateTempo([0, 0.6, 1.2, 1.8]), 100);
  assert.equal(estimateTempo([0]), null);
});

test('a steady sine is tracked to its fundamental', () => {
  const out = new Float32Array(SR);
  addSine(out, 0, 1, 110);
  const voiced = trackPitch(out, SR).filter((f) => f.f0 > 0).map((f) => f.f0).sort((a, b) => a - b);
  assert.ok(voiced.length > 40, 'most frames of a steady tone are voiced');
  const median = voiced[Math.floor(voiced.length / 2)];
  assert.ok(Math.abs(median - 110) < 1, `median ${median} Hz`);
});

test('a two-note bass line becomes two notes of the right pitch and length', () => {
  const out = new Float32Array(Math.round(1.6 * SR));
  addSine(out, 0.1, 0.5, 110);
  addSine(out, 0.8, 0.5, 130.81);
  const notes = transcribeMelody(out, SR);
  assert.deepEqual(
    notes.map((n) => n.note),
    [45, 48],
    `notes: ${JSON.stringify(notes)}`
  );
  notes.forEach((n) => assert.ok(Math.abs(n.end - n.start - 0.5) < 0.06, `length ${n.end - n.start}`));
  assert.ok(Math.abs(notes[0].start - 0.1) < 0.04);
  assert.ok(Math.abs(notes[1].start - 0.8) < 0.04);
});

test('melody notes shorter than 80 ms are dropped', () => {
  const frames = Array.from({ length: 4 }, (_, i) => ({ time: i * 0.016, f0: 220, rms: 0.3 }));
  assert.deepEqual(melodyNotes(frames), []);
});

test('seconds become 16th-note steps at a tempo', () => {
  assert.equal(secondsToSteps(0.5, 120), 4);
  assert.equal(secondsToSteps(1, 90), 6);
});

test('silence gives no hits, no tempo and no notes', () => {
  const quiet = new Float32Array(SR);
  assert.deepEqual(transcribeDrums(quiet, SR), { hits: [], tempo: null });
  assert.deepEqual(transcribeMelody(quiet, SR), []);
});
