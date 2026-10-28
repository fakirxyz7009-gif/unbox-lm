import test from 'node:test';
import assert from 'node:assert/strict';
import { readSfz } from '../scripts/instruments/sfz.ts';
import { regionsToDraft } from '../scripts/instruments/sources.ts';
import { modWheelFadeGain } from '../shared/instruments/zones.ts';
import { parsePack } from '../shared/instruments/types.ts';

const program = `<control> set_cc1=64
<global> xf_cccurve=power
<region> sample=soft.wav lokey=60 hikey=60 xfin_hicc1=30 xfout_locc1=30
<region> sample=loud.wav lokey=60 hikey=60 xfin_locc1=30 xfin_hicc1=127`;

test('SFZ controller crossfades bake the default CC state into sample gains', () => {
  const parsed = readSfz('program.sfz', () => program);
  assert.equal(parsed.regions.length, 2);

  const x = (64 - 30) / (127 - 30);
  assert.ok(Math.abs(parsed.regions[0].gain - Math.cos((x * Math.PI) / 2)) < 1e-12);
  assert.ok(Math.abs(parsed.regions[1].gain - Math.sin((x * Math.PI) / 2)) < 1e-12);
  assert.ok(Math.abs(parsed.regions[0].gain ** 2 + parsed.regions[1].gain ** 2 - 1) < 1e-12);
});

test('SFZ controller overrides select the expected ends of a crossfade', () => {
  const quiet = readSfz('program.sfz', () => program, { cc: { 1: 0 } });
  const loud = readSfz('program.sfz', () => program, { cc: { 1: 127 } });

  assert.equal(quiet.regions.length, 0);
  assert.equal(loud.regions.length, 1);
  assert.equal(loud.regions[0].sample, 'loud.wav');
  assert.equal(loud.regions[0].gain, 1);
});

test('linear SFZ controller crossfades use linear gain', () => {
  const sfz = `<control> set_cc1=50
<global> xf_cccurve=gain
<region> sample=soft.wav lokey=60 hikey=60 xfin_hicc1=100`;
  const parsed = readSfz('program.sfz', () => sfz);

  assert.equal(parsed.regions.length, 1);
  assert.equal(parsed.regions[0].gain, 0.5);
});

test('SFZ CC1 layers retain their default and become live mod-wheel crossfades', () => {
  const sfz = `<control> set_cc1=0
<global> xf_cccurve=power
<region> sample=soft.wav lokey=60 hikey=60 xfin_hicc1=100
<region> sample=loud.wav lokey=60 hikey=60 xfout_hicc1=100`;
  const parsed = readSfz('program.sfz', () => sfz, { liveModWheel: true });

  assert.equal(parsed.regions.length, 2, 'a layer silent at the default CC1 must stay available to the live wheel');
  assert.deepEqual(parsed.regions[0].modWheelFade, { in: [0, 100], curve: 'power', default: 0 });
  assert.deepEqual(parsed.regions[1].modWheelFade, { out: [0, 100], curve: 'power', default: 0 });
  assert.equal(parsed.regions[0].gain, 1, 'CC1 is not also baked into the sample gain');

  const [soft, loud] = regionsToDraft(parsed, { kind: 'melodic' });
  assert.deepEqual(soft.modWheelFade, { in: [0, 100], curve: 'power', default: 0 });
  assert.deepEqual(loud.modWheelFade, { out: [0, 100], curve: 'power', default: 0 });
});

test('mod-wheel fade curves are equal-power by default and pack metadata is validated', () => {
  const fadeIn = { in: [0, 127] as [number, number], curve: 'power' as const, default: 0 };
  const fadeOut = { out: [0, 127] as [number, number], curve: 'power' as const, default: 0 };
  const x = 0.37;
  const low = modWheelFadeGain(fadeOut, 127 * x);
  const high = modWheelFadeGain(fadeIn, 127 * x);
  assert.ok(Math.abs(low ** 2 + high ** 2 - 1) < 1e-12);

  const pack = {
    format: 'unbox-instrument', version: 1, id: 'cc1-test', name: 'CC1 Test', kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'fixture' },
    zones: [{ file: 'samples/test.ogg', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127, modWheelFade: fadeIn }],
  };
  assert.deepEqual(parsePack(pack)?.zones[0].modWheelFade, fadeIn);
  assert.equal(parsePack({ ...pack, zones: [{ ...pack.zones[0], modWheelFade: { ...fadeIn, default: 128 } }] }), null);
});
