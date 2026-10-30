import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFourBandSplitState,
  processFourBandSplitChunk,
  type FourBandSplitChannels,
} from '../src/audio/ai/musicSeparatorDsp.ts';

function channels(length: number): FourBandSplitChannels {
  return {
    vocalsL: new Float32Array(length), vocalsR: new Float32Array(length),
    bassL: new Float32Array(length), bassR: new Float32Array(length),
    drumsL: new Float32Array(length), drumsR: new Float32Array(length),
    otherL: new Float32Array(length), otherR: new Float32Array(length),
  };
}

function source(length: number): [Float32Array, Float32Array] {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / 48_000;
    left[i] = 0.42 * Math.sin(2 * Math.PI * 83 * t) + 0.18 * Math.sin(2 * Math.PI * 440 * t);
    right[i] = 0.35 * Math.sin(2 * Math.PI * 117 * t) + 0.12 * Math.sin(2 * Math.PI * 1900 * t);
  }
  left[1000] += 0.7;
  right[1000] -= 0.5;
  return [left, right];
}

function process(
  inputL: Float32Array,
  inputR: Float32Array,
  output: FourBandSplitChannels,
  ranges: readonly [number, number][]
): void {
  const state = createFourBandSplitState();
  for (const [start, end] of ranges) {
    processFourBandSplitChunk(inputL, inputR, 48_000, output, state, start, end);
  }
}

test('four-band estimates plus residual reconstruct the stereo source at unity gain', () => {
  const [left, right] = source(4099);
  const output = channels(left.length);
  process(left, right, output, [[0, 1024], [1024, 2048], [2048, left.length]]);

  for (let i = 0; i < left.length; i++) {
    const reconstructedL = output.bassL[i] + output.drumsL[i] + output.vocalsL[i] + output.otherL[i];
    const reconstructedR = output.bassR[i] + output.drumsR[i] + output.vocalsR[i] + output.otherR[i];
    assert.ok(Math.abs(reconstructedL - left[i]) < 2e-7, `left reconstruction error at ${i}`);
    assert.ok(Math.abs(reconstructedR - right[i]) < 2e-7, `right reconstruction error at ${i}`);
    assert.ok(Number.isFinite(reconstructedL) && Number.isFinite(reconstructedR));
  }
});

test('chunk boundaries preserve filter and transient state', () => {
  const [left, right] = source(4099);
  const chunked = channels(left.length);
  const single = channels(left.length);
  process(left, right, chunked, [[0, 1024], [1024, 2048], [2048, left.length]]);
  process(left, right, single, [[0, left.length]]);

  for (const key of Object.keys(chunked) as (keyof FourBandSplitChannels)[]) {
    for (let i = 0; i < left.length; i++) {
      assert.ok(Math.abs(chunked[key][i] - single[key][i]) < 1e-7, `${String(key)} differs at chunk boundary ${i}`);
    }
  }
});
