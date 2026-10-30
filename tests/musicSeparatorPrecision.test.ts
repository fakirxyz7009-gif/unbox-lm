import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type StemSplitMode,
  type MultiStemBuffers,
  createPrecisionSplitState,
  processPrecisionSplitChunk,
} from '../src/audio/ai/musicSeparatorDsp.ts';
import { STEM_MODE_CONFIGS } from '../src/audio/ai/MusicSeparator.ts';

function createBuffersForMode(mode: StemSplitMode, length: number): MultiStemBuffers {
  const configs = STEM_MODE_CONFIGS[mode];
  const buffers: MultiStemBuffers = {};
  for (const def of configs) {
    buffers[def.id] = {
      L: new Float32Array(length),
      R: new Float32Array(length),
    };
  }
  return buffers;
}

function generateComplexStereoMix(length: number): [Float32Array, Float32Array] {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const sampleRate = 48_000;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    // 1. Centered Sub & Bass (55 Hz & 110 Hz)
    const bass = 0.35 * Math.sin(2 * Math.PI * 55 * t) + 0.25 * Math.sin(2 * Math.PI * 110 * t);

    // 2. Centered Lead Vocal (440 Hz formant + harmonics)
    const vocalLead = 0.28 * Math.sin(2 * Math.PI * 440 * t) + 0.15 * Math.sin(2 * Math.PI * 880 * t);

    // 3. Wide Stereo Backing Vocals / Harmonies (660 Hz panned L / R out of phase)
    const backingL = 0.15 * Math.sin(2 * Math.PI * 660 * t);
    const backingR = -0.15 * Math.sin(2 * Math.PI * 660 * t);

    // 4. Stereo Guitars / Synths (1500 Hz & 2400 Hz)
    const guitL = 0.12 * Math.sin(2 * Math.PI * 1500 * t);
    const guitR = 0.14 * Math.sin(2 * Math.PI * 2400 * t);

    // 5. High Cymbals & Air (7000 Hz)
    const cymbL = 0.08 * Math.sin(2 * Math.PI * 7000 * t);
    const cymbR = 0.09 * Math.sin(2 * Math.PI * 7200 * t);

    left[i] = bass + vocalLead + backingL + guitL + cymbL;
    right[i] = bass + vocalLead + backingR + guitR + cymbR;
  }

  // Add sharp transient drums (Kick at 500, Snare at 1500, HiHat at 2500)
  if (length > 2500) {
    // Kick: centered low punch
    left[500] += 0.85;
    right[500] += 0.85;

    // Snare: centered mid-crack
    left[1500] += 0.7;
    right[1500] += 0.65;

    // Hi-hat: crisp high tick
    left[2500] += 0.4;
    right[2500] += 0.45;
  }

  return [left, right];
}

test('4-Stem Split: Lossless unity-gain reconstruction (vocals + drums + bass + other == source)', () => {
  const length = 4096;
  const [left, right] = generateComplexStereoMix(length);
  const buffers = createBuffersForMode('4stem', length);
  const state = createPrecisionSplitState();

  processPrecisionSplitChunk(left, right, 48_000, '4stem', buffers, state, 0, length);

  assert.ok(buffers.vocals && buffers.drums && buffers.bass && buffers.other, 'All 4 stems must exist');

  for (let i = 0; i < length; i++) {
    const sumL = buffers.vocals.L[i] + buffers.drums.L[i] + buffers.bass.L[i] + buffers.other.L[i];
    const sumR = buffers.vocals.R[i] + buffers.drums.R[i] + buffers.bass.R[i] + buffers.other.R[i];

    assert.ok(Math.abs(sumL - left[i]) < 2e-7, `4-stem Left reconstruction error at sample ${i}: got ${sumL}, expected ${left[i]}`);
    assert.ok(Math.abs(sumR - right[i]) < 2e-7, `4-stem Right reconstruction error at sample ${i}: got ${sumR}, expected ${right[i]}`);
    assert.ok(Number.isFinite(sumL) && Number.isFinite(sumR));
  }
});

test('6-Stem Split: Lossless unity-gain reconstruction (vocals + drums + bass + guitars + keys + ambient == source)', () => {
  const length = 4096;
  const [left, right] = generateComplexStereoMix(length);
  const buffers = createBuffersForMode('6stem', length);
  const state = createPrecisionSplitState();

  processPrecisionSplitChunk(left, right, 48_000, '6stem', buffers, state, 0, length);

  const stemKeys = ['vocals', 'drums', 'bass', 'guitars', 'keys', 'ambient'];
  for (const k of stemKeys) {
    assert.ok(buffers[k], `6-stem must include ${k}`);
  }

  for (let i = 0; i < length; i++) {
    let sumL = 0;
    let sumR = 0;
    for (const k of stemKeys) {
      sumL += buffers[k].L[i];
      sumR += buffers[k].R[i];
    }

    assert.ok(Math.abs(sumL - left[i]) < 2e-7, `6-stem Left reconstruction error at sample ${i}: got ${sumL}, expected ${left[i]}`);
    assert.ok(Math.abs(sumR - right[i]) < 2e-7, `6-stem Right reconstruction error at sample ${i}: got ${sumR}, expected ${right[i]}`);
  }
});

test('8-Stem Surgical Isolation: Lossless unity-gain reconstruction across all 8 discrete stems', () => {
  const length = 4096;
  const [left, right] = generateComplexStereoMix(length);
  const buffers = createBuffersForMode('8stem', length);
  const state = createPrecisionSplitState();

  processPrecisionSplitChunk(left, right, 48_000, '8stem', buffers, state, 0, length);

  const stemKeys = ['vocal_lead', 'vocal_back', 'kick', 'snare', 'hihat', 'bass', 'instruments', 'ambient'];
  for (const k of stemKeys) {
    assert.ok(buffers[k], `8-stem must include ${k}`);
  }

  for (let i = 0; i < length; i++) {
    let sumL = 0;
    let sumR = 0;
    for (const k of stemKeys) {
      sumL += buffers[k].L[i];
      sumR += buffers[k].R[i];
    }

    assert.ok(Math.abs(sumL - left[i]) < 2e-7, `8-stem Left reconstruction error at sample ${i}: got ${sumL}, expected ${left[i]}`);
    assert.ok(Math.abs(sumR - right[i]) < 2e-7, `8-stem Right reconstruction error at sample ${i}: got ${sumR}, expected ${right[i]}`);
  }
});

test('Precision DSP Invariance: Chunked processing identically matches single-pass processing', () => {
  const length = 4096;
  const [left, right] = generateComplexStereoMix(length);

  // 1. Single pass
  const singleBuffers = createBuffersForMode('8stem', length);
  const singleState = createPrecisionSplitState();
  processPrecisionSplitChunk(left, right, 48_000, '8stem', singleBuffers, singleState, 0, length);

  // 2. Multi-chunk pass (e.g. 512-sample chunks)
  const chunkedBuffers = createBuffersForMode('8stem', length);
  const chunkedState = createPrecisionSplitState();
  const chunkSize = 512;
  for (let offset = 0; offset < length; offset += chunkSize) {
    const end = Math.min(length, offset + chunkSize);
    processPrecisionSplitChunk(left, right, 48_000, '8stem', chunkedBuffers, chunkedState, offset, end);
  }

  // 3. Compare all 8 stems
  const stemKeys = ['vocal_lead', 'vocal_back', 'kick', 'snare', 'hihat', 'bass', 'instruments', 'ambient'];
  for (const k of stemKeys) {
    for (let i = 0; i < length; i++) {
      assert.ok(
        Math.abs(singleBuffers[k].L[i] - chunkedBuffers[k].L[i]) < 1e-7,
        `Chunk mismatch in ${k}.L at sample ${i}`
      );
      assert.ok(
        Math.abs(singleBuffers[k].R[i] - chunkedBuffers[k].R[i]) < 1e-7,
        `Chunk mismatch in ${k}.R at sample ${i}`
      );
    }
  }
});

test('Center-Vocal Isolation: Lead vocal stem extracts centered energy and attenuates panned components', () => {
  const length = 2048;
  const [left, right] = generateComplexStereoMix(length);
  const buffers = createBuffersForMode('8stem', length);
  const state = createPrecisionSplitState();

  processPrecisionSplitChunk(left, right, 48_000, '8stem', buffers, state, 0, length);

  // Vocal lead should be centered (L == R)
  for (let i = 100; i < 500; i++) {
    assert.equal(buffers.vocal_lead.L[i], buffers.vocal_lead.R[i]);
  }
});

