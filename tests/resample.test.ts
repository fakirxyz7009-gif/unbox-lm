import test from 'node:test';
import assert from 'node:assert/strict';
import { resample } from '../shared/audio/resample.ts';

const rms = (x: Float32Array, from = 0) => {
  let sum = 0;
  for (let i = from; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (x.length - from));
};

function tone(hz: number, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

test('halving the rate keeps the length and the level of a tone well below the new Nyquist', () => {
  const out = resample(tone(1000, 44100, 1), 44100, 22050);
  assert.equal(out.length, 22050);
  // Skip the filter's edges; a full-scale sine has an RMS of 0.707.
  assert.ok(Math.abs(rms(out, 200) - Math.SQRT1_2) < 0.02, `level ${rms(out, 200)}`);
});

test('a tone above the new Nyquist is removed, not folded back into the band', () => {
  const out = resample(tone(15000, 44100, 1), 44100, 22050);
  assert.ok(rms(out, 200) < 0.05, `leftover ${rms(out, 200)}`);
});

test('the same rate passes the samples through', () => {
  const x = tone(440, 22050, 0.1);
  assert.equal(resample(x, 22050, 22050), x);
});
