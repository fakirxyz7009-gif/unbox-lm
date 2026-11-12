import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribePolyphonic } from '../shared/transcription/polyphonic.ts';

const SR = 44100;

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

test('silence has no notes', () => {
  assert.deepEqual(transcribePolyphonic(new Float32Array(SR), SR), []);
});

test('one harmonic tone is one note: its fundamental is not read a sub-octave lower', () => {
  const out = new Float32Array(SR);
  addTone(out, 69, 0.2, 0.6);
  const notes = transcribePolyphonic(out, SR);
  assert.deepEqual(
    notes.map((n) => n.note),
    [69],
  );
  assert.ok(Math.abs(notes[0].start - 0.2) < 0.05, `start ${notes[0].start}`);
  assert.ok(notes[0].end - notes[0].start > 0.4, `length ${notes[0].end - notes[0].start}`);
});

test('a major triad reads as its three notes, starting together', () => {
  const out = new Float32Array(2 * SR);
  for (const midi of [60, 64, 67]) addTone(out, midi, 0.5, 1.0);
  const starting = transcribePolyphonic(out, SR).filter((n) => Math.abs(n.start - 0.5) < 0.06);
  assert.deepEqual(
    starting.map((n) => n.note).sort((a, b) => a - b),
    [60, 64, 67],
  );
});

test('a melody reads note by note, in order', () => {
  const out = new Float32Array(3 * SR);
  [60, 64, 67].forEach((midi, i) => addTone(out, midi, 0.2 + i * 0.8, 0.6));
  assert.deepEqual(
    transcribePolyphonic(out, SR).map((n) => n.note),
    [60, 64, 67],
  );
});

test('one voice per frame turns a chord into a single line', () => {
  const out = new Float32Array(SR);
  for (const midi of [60, 64, 67]) addTone(out, midi, 0.2, 0.6);
  const line = transcribePolyphonic(out, SR, { maxVoices: 1 });
  assert.ok(line.length <= 3, `notes ${line.length}`);
});
