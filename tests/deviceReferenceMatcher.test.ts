import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSeedFunctionSummary, type SeedFunctionSummary } from '../scripts/device-reference-matcher.ts';

const seeds: SeedFunctionSummary[] = [
  { name: 'Amalgam', developer: 'Ekssperimental Sounds', func: 'FM and subtractive synthesis' },
  { name: 'Quad', developer: 'Rob Papen', func: 'Multi-engine synthesizer' },
  { name: 'Quad Note Generator', developer: 'Reason Studios', func: 'Multi-lane note generation' },
  { name: 'PEQ-2', developer: 'Reason Studios', func: 'Two-band parametric equalizer' },
  { name: 'Tres', developer: 'FXpansion', func: 'Monophonic synthesizer' },
  { name: 'Osmium', developer: 'Reason Studios', func: 'Multi-character distortion' },
];

test('catalog summaries require the matching developer', () => {
  assert.equal(matchSeedFunctionSummary('Valley Amalgam', 'Murf', seeds), undefined);
  assert.equal(matchSeedFunctionSummary('Q-FX Quad Multi Effector', 'SKP Sound Design', seeds), undefined);
});

test('similar product tokens do not borrow another device summary', () => {
  assert.equal(matchSeedFunctionSummary('PEQ-213 Parametric Equalizer', 'Reason Studios', seeds), undefined);
  assert.equal(matchSeedFunctionSummary('Spectre Spectral Delay', 'AirRaid Audio', seeds), undefined);
});

test('same-vendor full and known short titles retain their summaries', () => {
  assert.equal(matchSeedFunctionSummary('Quad Note Generator', 'Reason Studios', seeds), 'Multi-lane note generation');
  assert.equal(matchSeedFunctionSummary('Quad Virtual Instrument', 'Rob Papen', seeds), 'Multi-engine synthesizer');
  assert.equal(matchSeedFunctionSummary('Osmium Distortion Matrix', 'Reason Studios', seeds), 'Multi-character distortion');
});
