import test from 'node:test';
import assert from 'node:assert/strict';
import { articulationSwitch, defaultArticulation, pressMomentarySwitch, releaseMomentarySwitch, zoneMatchesArticulation } from '../shared/instruments/articulation.ts';
import { parsePack } from '../shared/instruments/types.ts';
import { matchingPackZones, packSwitchesFromZones } from '../shared/instruments/zones.ts';
import { regionsToDraft } from '../scripts/instruments/sources.ts';
import { readSfz } from '../scripts/instruments/sfz.ts';

const switchProgram = `<global> sw_default=c2 sw_lokey=c2 sw_hikey=d2
<group> sw_last=c2 sw_label=Sustain
<region> sample=sustain.wav lokey=48 hikey=84
<group> sw_last=d2 sw_label=Staccato
<region> sample=staccato.wav lokey=48 hikey=84`;

test('SFZ import keeps the default articulation unless all-articulations is requested', () => {
  const read = () => switchProgram;
  const plain = readSfz('program.sfz', read);
  const complete = readSfz('program.sfz', read, { allArticulations: true });

  assert.equal(plain.regions.length, 1);
  assert.equal(plain.articulations.length, 0);
  assert.equal(complete.regions.length, 2);
  assert.deepEqual(complete.articulations, [
    { id: 'ks-36', label: 'Sustain', keyswitch: 36, default: true },
    { id: 'ks-38', label: 'Staccato', keyswitch: 38, default: false },
  ]);
  assert.deepEqual(complete.regions.map((region) => region.articulationId), ['ks-36', 'ks-38']);

  const zones = regionsToDraft(complete, { kind: 'melodic' });
  assert.equal(zones.length, 2);
  assert.deepEqual(zones.map((zone) => zone.articulation), ['ks-36', 'ks-38']);
});

test('SFZ default articulation uses its explicit sw_label after inherited sw_default', () => {
  const sfz = `<global> sw_default=c2
<region> sample=default.wav key=60
<group> sw_last=c2 sw_label=Sustain
<region> sample=sustain.wav key=60`;
  const parsed = readSfz('program.sfz', () => sfz, { allArticulations: true });

  assert.equal(parsed.articulations.find((articulation) => articulation.default)?.label, 'Sustain');
});

test('instrument pack validation and helpers select sticky keyswitch articulations', () => {
  const pack = parsePack({
    format: 'unbox-instrument',
    version: 1,
    id: 'test-strings',
    name: 'Test Strings',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'https://example.invalid' },
    articulations: [
      { id: 'ks-36', label: 'Sustain', keyswitch: 36, default: true },
      { id: 'ks-38', label: 'Staccato', keyswitch: 38, default: false },
    ],
    zones: [
      { file: 'samples/sustain.ogg', lokey: 48, hikey: 84, root: 60, lovel: 1, hivel: 127, articulation: 'ks-36' },
      { file: 'samples/staccato.ogg', lokey: 48, hikey: 84, root: 60, lovel: 1, hivel: 127, articulation: 'ks-38' },
    ],
  });
  assert.ok(pack);
  const initial = defaultArticulation(pack);
  assert.equal(initial?.id, 'ks-36');
  assert.equal(articulationSwitch(pack, 38)?.id, 'ks-38');
  assert.equal(zoneMatchesArticulation(pack, pack.zones[0], initial?.id ?? null), true);
  assert.equal(zoneMatchesArticulation(pack, pack.zones[1], initial?.id ?? null), false);
  assert.equal(zoneMatchesArticulation(pack, pack.zones[1], 'ks-38'), true);
});

test('SFZ release-trigger recordings remain separate from attack zones', () => {
  const source = `<region> sample=attack.wav key=60 pitch_keycenter=60 trigger=attack
<region> sample=release.wav key=60 pitch_keycenter=60 trigger=release
<region> sample=first.wav key=60 pitch_keycenter=60 trigger=first`;
  const program = readSfz('program.sfz', () => source);
  const zones = regionsToDraft(program, { kind: 'melodic' });

  assert.deepEqual(program.regions.map((region) => region.trigger), ['attack', 'release']);
  assert.deepEqual(zones.map((zone) => zone.trigger ?? 'attack'), ['attack', 'release']);
  assert.deepEqual(program.dropped, { 'trigger=first': 1 });
});

test('SFZ key-range clipping preserves sample roots while explicit key remaps transpose them', () => {
  const source = `<region> sample=low.wav pitch_keycenter=47 lokey=0 hikey=49
<region> sample=single.wav key=60`;
  const program = readSfz('range.sfz', () => source);
  const zones = regionsToDraft(program, { kind: 'melodic', keys: [47, 61], remap: { 60: 61 } });

  assert.deepEqual(zones.map(({ lokey, hikey, root }) => ({ lokey, hikey, root })), [
    { lokey: 47, hikey: 49, root: 47 },
    { lokey: 61, hikey: 61, root: 61 },
  ]);
});

test('recorded pack selects attack and release samples by key, velocity, articulation, and trigger', () => {
  const pack = parsePack({
    format: 'unbox-instrument',
    version: 1,
    id: 'test-release-strings',
    name: 'Test Release Strings',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'https://example.invalid' },
    articulations: [
      { id: 'sustain', label: 'Sustain', keyswitch: null, default: true },
      { id: 'pizzicato', label: 'Pizzicato', keyswitch: 39, default: false },
    ],
    zones: [
      { file: 'samples/attack.ogg', lokey: 48, hikey: 72, root: 60, lovel: 1, hivel: 127, articulation: 'sustain' },
      { file: 'samples/release.ogg', lokey: 48, hikey: 72, root: 60, lovel: 1, hivel: 127, articulation: 'sustain', trigger: 'release' },
      { file: 'samples/pizz-attack.ogg', lokey: 48, hikey: 72, root: 60, lovel: 1, hivel: 127, articulation: 'pizzicato' },
    ],
  });
  assert.ok(pack);

  assert.deepEqual(matchingPackZones(pack, 60, 90, 'sustain', 'attack', 0, 0.5).map((zone) => zone.file), ['samples/attack.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, 'sustain', 'release', 0, 0.5).map((zone) => zone.file), ['samples/release.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, 'pizzicato', 'release', 0, 0.5), []);
  assert.deepEqual(matchingPackZones(pack, 80, 90, 'sustain', 'release', 0, 0.5), []);
});

test('SFZ momentary sw_down and sw_up selectors survive region mapping and select by held keys', () => {
  const source = `<global> sw_lokey=c1 sw_hikey=c1
<group> sw_down=c1
<region> sample=held.wav lokey=48 hikey=84
<group> sw_up=c1
<region> sample=free.wav lokey=48 hikey=84`;
  const program = readSfz('program.sfz', () => source);
  const zones = regionsToDraft(program, { kind: 'melodic' });

  assert.deepEqual(program.dropped, {});
  assert.deepEqual(zones.map(({ swDown, swUp }) => ({ swDown, swUp })), [
    { swDown: 24, swUp: undefined },
    { swDown: undefined, swUp: 24 },
  ]);

  const pack = parsePack({
    format: 'unbox-instrument',
    version: 1,
    id: 'test-momentary-switches',
    name: 'Test Momentary Switches',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'https://example.invalid' },
    zones: [
      { file: 'samples/held.ogg', lokey: 48, hikey: 84, root: 60, lovel: 1, hivel: 127, swDown: 24 },
      { file: 'samples/free.ogg', lokey: 48, hikey: 84, root: 60, lovel: 1, hivel: 127, swUp: 24 },
    ],
  });
  assert.ok(pack);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'attack', 0, 0.5).map((zone) => zone.file), ['samples/free.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'attack', 0, 0.5, new Set([24])).map((zone) => zone.file), ['samples/held.ogg']);
  assert.deepEqual(packSwitchesFromZones(pack.zones), [{ note: 24, mode: 'down' }, { note: 24, mode: 'up' }]);

  const disabled = readSfz('disabled.sfz', () => '<region> sample=normal.wav key=60 sw_down=-1 sw_up=-1');
  assert.deepEqual(disabled.dropped, {});
  assert.equal(disabled.regions[0]?.swDown, undefined);
  assert.equal(disabled.regions[0]?.swUp, undefined);
});

test('SFZ sw_previous survives mapping and selects attack and release zones by previous note-on', () => {
  const source = `<region> sample=previous.wav key=60 sw_previous=60
<region> sample=unfiltered.wav key=60 sw_previous=-1
<region> sample=invalid.wav key=60 sw_previous=128
<region> sample=previous-release.wav key=60 sw_previous=60 trigger=release`;
  const program = readSfz('previous.sfz', () => source);
  const zones = regionsToDraft(program, { kind: 'melodic' });

  assert.deepEqual(program.dropped, { 'invalid sw_previous': 1 });
  assert.deepEqual(zones.map(({ swPrevious, trigger }) => ({ swPrevious, trigger: trigger ?? 'attack' })), [
    { swPrevious: 60, trigger: 'attack' },
    { swPrevious: undefined, trigger: 'attack' },
    { swPrevious: 60, trigger: 'release' },
  ]);

  const pack = parsePack({
    format: 'unbox-instrument',
    version: 1,
    id: 'test-previous-note',
    name: 'Test Previous Note',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'https://example.invalid' },
    zones: [
      { file: 'samples/previous.ogg', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127, swPrevious: 60 },
      { file: 'samples/unfiltered.ogg', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127 },
      { file: 'samples/previous-release.ogg', lokey: 60, hikey: 60, root: 60, lovel: 1, hivel: 127, swPrevious: 60, trigger: 'release' },
    ],
  });
  assert.ok(pack);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'attack', 0, 0.5, new Set(), 60).map((zone) => zone.file), [
    'samples/previous.ogg', 'samples/unfiltered.ogg',
  ]);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'attack', 0, 0.5, new Set(), 59).map((zone) => zone.file), ['samples/unfiltered.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'attack', 0, 0.5).map((zone) => zone.file), ['samples/unfiltered.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'release', 0, 0.5, new Set(), 60).map((zone) => zone.file), ['samples/previous-release.ogg']);
  assert.deepEqual(matchingPackZones(pack, 60, 90, null, 'release', 0, 0.5, new Set(), 59), []);
});

test('momentary switch selection ends on physical key-up even when audio release is sustained', () => {
  const switchNotes = new Set([24]);
  const held = new Set<number>();
  assert.equal(pressMomentarySwitch(held, switchNotes, 24), true);
  assert.equal(held.has(24), true);
  assert.equal(releaseMomentarySwitch(held, switchNotes, 24), true);
  assert.equal(held.has(24), false);
  assert.equal(releaseMomentarySwitch(held, switchNotes, 60), false);
});

test('recorded pack validation rejects non-integer or out-of-range momentary switches', () => {
  const base = {
    format: 'unbox-instrument',
    version: 1,
    id: 'test-bad-switch',
    name: 'Test Bad Switch',
    kind: 'melodic',
    license: { spdx: 'CC0-1.0', author: 'Test', source: 'https://example.invalid' },
    zones: [{ file: 'samples/key.ogg', lokey: 48, hikey: 84, root: 60, lovel: 1, hivel: 127 }],
  };
  assert.equal(parsePack({ ...base, zones: [{ ...base.zones[0], swDown: 24.5 }] }), null);
  assert.equal(parsePack({ ...base, zones: [{ ...base.zones[0], swUp: 128 }] }), null);
  assert.equal(parsePack({ ...base, zones: [{ ...base.zones[0], swPrevious: 60.5 }] }), null);
  assert.equal(parsePack({ ...base, zones: [{ ...base.zones[0], swPrevious: 128 }] }), null);
});
