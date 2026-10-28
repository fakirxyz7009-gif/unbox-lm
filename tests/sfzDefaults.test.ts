import test from 'node:test';
import assert from 'node:assert/strict';
import { readSfz } from '../scripts/instruments/sfz.ts';

test('SFZ high-definition CC defaults affect controller-scaled envelope values', () => {
  const sfz = `<control> set_hdcc72=0.05
<global> ampeg_release_oncc72=2
<region> sample=note.wav lokey=60 hikey=60`;
  const program = readSfz('program.sfz', () => sfz);

  assert.equal(program.regions.length, 1);
  assert.ok(Math.abs(program.regions[0].ampeg.release - 0.101) < 1e-9);
});

test('SFZ release modulation interpolates fractional high-definition CC values', () => {
  const sfz = `<control> set_realcc72=0.05
<global> ampeg_release_oncc72=2
<region> sample=note.wav lokey=60 hikey=60`;
  const program = readSfz('program.sfz', () => sfz);

  assert.equal(program.regions.length, 1);
  assert.ok(Math.abs(program.regions[0].ampeg.release - 0.101) < 1e-9);
});
