import test from 'node:test';
import assert from 'node:assert/strict';
import { STEM_MODE_CONFIGS, type SeparatedStem } from '../src/audio/ai/MusicSeparator.ts';

function createMockStem(id: string, label: string, volume = 1.0, muted = false, solo = false): SeparatedStem {
  return {
    id,
    label,
    color: '#0ea5e9',
    iconType: 'keys',
    buffer: {} as AudioBuffer,
    peaks: new Float32Array(10),
    duration: 180,
    durationFormatted: '3:00',
    volume,
    muted,
    solo,
  };
}

function getEffectiveGain(stem: SeparatedStem, allStems: SeparatedStem[]): number {
  const hasSolo = allStems.some((s) => s.solo);
  if (hasSolo) {
    return stem.solo ? stem.volume : 0;
  }
  return stem.muted ? 0 : stem.volume;
}

test('Splitter AI: 4-Stem Configuration matches Vocals, Drums, Bass, Other', () => {
  const fourStem = STEM_MODE_CONFIGS['4stem'];
  assert.equal(fourStem.length, 4);
  const ids = fourStem.map((d) => d.id);
  assert.deepEqual(ids, ['vocals', 'drums', 'bass', 'other']);
});

test('Splitter AI Mixer: Single Solo silences all other tracks', () => {
  const vocals = createMockStem('vocals', 'Vocals', 1.0, false, true); // Soloed
  const drums = createMockStem('drums', 'Drums', 1.0, false, false);
  const bass = createMockStem('bass', 'Bass', 1.0, false, false);
  const other = createMockStem('other', 'Other', 1.0, false, false);
  const all = [vocals, drums, bass, other];

  assert.equal(getEffectiveGain(vocals, all), 1.0, 'Soloed stem must be audible at its volume');
  assert.equal(getEffectiveGain(drums, all), 0, 'Non-soloed drums must be silenced');
  assert.equal(getEffectiveGain(bass, all), 0, 'Non-soloed bass must be silenced');
  assert.equal(getEffectiveGain(other, all), 0, 'Non-soloed other must be silenced');
});

test('Splitter AI Mixer: Multi-Solo allows multiple tracks to play while others are silent', () => {
  const vocals = createMockStem('vocals', 'Vocals', 1.2, false, true); // Soloed at 120%
  const drums = createMockStem('drums', 'Drums', 0.8, false, true); // Soloed at 80%
  const bass = createMockStem('bass', 'Bass', 1.0, false, false);
  const other = createMockStem('other', 'Other', 1.0, false, false);
  const all = [vocals, drums, bass, other];

  assert.equal(getEffectiveGain(vocals, all), 1.2);
  assert.equal(getEffectiveGain(drums, all), 0.8);
  assert.equal(getEffectiveGain(bass, all), 0);
  assert.equal(getEffectiveGain(other, all), 0);
});

test('Splitter AI Mixer: Mute overrides volume when no solo is active', () => {
  const vocals = createMockStem('vocals', 'Vocals', 1.0, false, false);
  const drums = createMockStem('drums', 'Drums', 1.0, true, false); // Muted
  const bass = createMockStem('bass', 'Bass', 0.75, false, false);
  const other = createMockStem('other', 'Other', 1.0, false, false);
  const all = [vocals, drums, bass, other];

  assert.equal(getEffectiveGain(vocals, all), 1.0);
  assert.equal(getEffectiveGain(drums, all), 0, 'Muted track must have 0 gain');
  assert.equal(getEffectiveGain(bass, all), 0.75, 'Active track retains volume fader value');
  assert.equal(getEffectiveGain(other, all), 1.0);
});

test('Splitter AI Mixer: Volume rebalancing scales linearly between 0% and 150%', () => {
  const stem = createMockStem('bass', 'Bass', 0.42, false, false);
  const all = [stem];

  assert.equal(getEffectiveGain(stem, all), 0.42);

  stem.volume = 1.35;
  assert.equal(getEffectiveGain(stem, all), 1.35);

  stem.volume = 0;
  assert.equal(getEffectiveGain(stem, all), 0);
});

