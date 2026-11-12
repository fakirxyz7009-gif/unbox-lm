import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePack } from '../shared/instruments/types.ts';
import { matchingPackZones, velocityFadeGain } from '../shared/instruments/zones.ts';
import { regionsToDraft } from '../scripts/instruments/sources.ts';
import { readSfz } from '../scripts/instruments/sfz.ts';

const velocityProgram = `<global> amp_veltrack=0
<group> lovel=1 hivel=39 xfout_lovel=24 xfout_hivel=39
<region> sample=soft.ogg key=60 pitch_keycenter=60
<group> lovel=24 hivel=71 xfin_lovel=24 xfin_hivel=39 xfout_lovel=56 xfout_hivel=71 xf_velcurve=power
<region> sample=medium.ogg key=60 pitch_keycenter=60`;

function makePack(zones: unknown[]) {
  return parsePack({
    format: 'unbox-instrument',
    version: 1,
    id: 'test-velocity-fades',
    name: 'Test Velocity Fades',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'test fixture' },
    zones,
  });
}

test('SFZ velocity crossfade opcodes survive parser and pack-zone conversion', () => {
  const parsed = readSfz('program.sfz', () => velocityProgram);
  const draft = regionsToDraft(parsed, { kind: 'melodic' });

  assert.equal(parsed.regions.length, 2);
  assert.deepEqual(draft.map((zone) => [zone.velocityFadeIn, zone.velocityFadeOut, zone.velocityFadeCurve]), [
    [undefined, [24, 39], 'power'],
    [[24, 39], [56, 71], 'power'],
  ]);
  assert.deepEqual(draft.map((zone) => zone.velCurve), [
    [[1, 1], [127, 1]],
    [[1, 1], [127, 1]],
  ]);
});

test('equal-power overlapping layers fade smoothly and zero-gain edges do not start voices', () => {
  const parsed = readSfz('program.sfz', () => velocityProgram);
  const draft = regionsToDraft(parsed, { kind: 'melodic' });
  const pack = makePack(draft.map((zone, index) => ({
    file: `samples/${index}.ogg`,
    lokey: zone.lokey,
    hikey: zone.hikey,
    root: zone.root,
    lovel: zone.lovel,
    hivel: zone.hivel,
    velCurve: zone.velCurve,
    velocityFadeIn: zone.velocityFadeIn,
    velocityFadeOut: zone.velocityFadeOut,
    velocityFadeCurve: zone.velocityFadeCurve,
  })));
  assert.ok(pack);

  assert.deepEqual(matchingPackZones(pack, 60, 24, null, 'attack', 0, 0).map((zone) => zone.file), ['samples/0.ogg']);
  const overlap = matchingPackZones(pack, 60, 31, null, 'attack', 0, 0);
  assert.equal(overlap.length, 2);
  const power = overlap.map((zone) => velocityFadeGain(zone, 31));
  assert.ok(Math.abs(power[0] ** 2 + power[1] ** 2 - 1) < 1e-12);
  assert.deepEqual(matchingPackZones(pack, 60, 39, null, 'attack', 0, 0).map((zone) => zone.file), ['samples/1.ogg']);
});

test('pack validation rejects malformed velocity crossfade metadata', () => {
  const zone = { file: 'samples/key.ogg', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127 };
  assert.equal(makePack([{ ...zone, velocityFadeIn: [10] }]), null);
  assert.equal(makePack([{ ...zone, velocityFadeOut: [0, 128] }]), null);
  assert.equal(makePack([{ ...zone, velocityFadeCurve: 'sine' }]), null);
});
