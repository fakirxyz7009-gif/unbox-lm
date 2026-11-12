import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ShrutiMicrotonalEngine,
  SHRUTIS_22_LIST,
  SHRATIS_22_RATIOS,
  TALA_PRESETS,
} from '../src/audio/ShrutiMicrotonalEngine.ts';

test('Shruti 1: Complete 22 Shrutis mathematical ratio validation', () => {
  assert.equal(SHRUTIS_22_LIST.length, 22, 'Must define all 22 canonical Shrutis');
  assert.equal(SHRATIS_22_RATIOS.length, 22, 'Must export all 22 numerical ratios');

  // Verify Sa is 1.0 (0 cents)
  assert.equal(SHRUTIS_22_LIST[0].ratio, 1.0);
  assert.equal(SHRUTIS_22_LIST[0].cents, 0);

  // Verify Pa is 3/2 (1.5, ~702 cents)
  const pa = SHRUTIS_22_LIST[13];
  assert.equal(pa.svara, 'Pa');
  assert.equal(pa.ratio, 1.5);
  assert.ok(Math.abs(pa.cents - 701.96) < 0.05);

  // Verify Shuddha Ma 1 is 4/3 (~498 cents)
  const ma = SHRUTIS_22_LIST[9];
  assert.ok(Math.abs(ma.ratio - 4 / 3) < 1e-6);

  // Verify strictly monotonic ordering
  for (let i = 1; i < SHRUTIS_22_LIST.length; i++) {
    assert.ok(
      SHRUTIS_22_LIST[i].ratio > SHRUTIS_22_LIST[i - 1].ratio,
      `Shruti ${i + 1} (${SHRUTIS_22_LIST[i].name}) ratio must exceed Shruti ${i}`
    );
  }
});

test('Shruti 2: Frequency conversion & octave scaling', () => {
  // Middle C = MIDI 60 (Sa = 261.63 Hz)
  const saFreq = ShrutiMicrotonalEngine.midiToShrutiFrequency(60, 261.63, 'Bilawal (Major)');
  assert.ok(Math.abs(saFreq - 261.63) < 0.01, 'Sa frequency should match base root frequency');

  // Higher octave Sa = MIDI 72 (523.26 Hz)
  const saHigh = ShrutiMicrotonalEngine.midiToShrutiFrequency(72, 261.63, 'Bilawal (Major)');
  assert.ok(Math.abs(saHigh - 261.63 * 2) < 0.02, 'Sa an octave higher must double frequency');

  // Pa = MIDI 67 (ratio 1.5 -> 392.445 Hz)
  const paFreq = ShrutiMicrotonalEngine.midiToShrutiFrequency(67, 261.63, 'Bilawal (Major)');
  assert.ok(Math.abs(paFreq - 261.63 * 1.5) < 0.05, 'Pa frequency must be 1.5x root');
});

test('Shruti 3: Microtonal cents deviation from 12-TET', () => {
  // Sa (MIDI 60) against Sa base root should have exactly 0 cents deviation
  const saDev = ShrutiMicrotonalEngine.centsDeviationFrom12TET(60, 'Bilawal (Major)', 60);
  assert.ok(Math.abs(saDev) < 0.1, 'Root Sa deviation from 12-TET must be 0 cents');

  // Pa (MIDI 67, 7 semitones = 700 cents in 12-TET; Just 3/2 = 701.96 cents -> +1.96 cents)
  const paDev = ShrutiMicrotonalEngine.centsDeviationFrom12TET(67, 'Bilawal (Major)', 60);
  assert.ok(Math.abs(paDev - 1.96) < 0.15, 'Pure fifth Pa deviation should be ~+1.96 cents');

  // Pure Shuddha Gandhar (5/4 = 386.31 cents; 12-TET major third = 400 cents -> -13.69 cents)
  const gaDev = ShrutiMicrotonalEngine.centsDeviationFrom12TET(64, 'Bilawal (Major)', 60);
  assert.ok(Math.abs(gaDev - (-13.69)) < 0.2, 'Pure major third Ga should be ~-13.69 cents relative to 12-TET');
});

test('Shruti 4: Tala rhythmic cycle structures', () => {
  // Teentaal: 16 beats (4+4+4+4)
  const teen = TALA_PRESETS.teentaal;
  assert.equal(teen.totalBeats, 16);
  assert.deepEqual(teen.vibhags, [4, 4, 4, 4]);
  assert.equal(teen.accents[0], 'sam');
  assert.equal(teen.accents[2], 'khali');
  assert.equal(teen.bols.length, 16);

  // Keharwa: 8 beats (4+4)
  const keh = TALA_PRESETS.keharwa;
  assert.equal(keh.totalBeats, 8);
  assert.deepEqual(keh.vibhags, [4, 4]);
  assert.equal(keh.accents[0], 'sam');
  assert.equal(keh.accents[1], 'khali');

  // Dadra: 6 beats (3+3)
  const dad = TALA_PRESETS.dadra;
  assert.equal(dad.totalBeats, 6);
  assert.deepEqual(dad.vibhags, [3, 3]);

  // Rupak: 7 beats (3+2+2)
  const rup = TALA_PRESETS.rupak;
  assert.equal(rup.totalBeats, 7);
  assert.deepEqual(rup.vibhags, [3, 2, 2]);
});

