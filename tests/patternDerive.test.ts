import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSteps } from '../src/audio/sequencer/patternDerive.ts';
import { SequencerEditor, type SequencerHost } from '../src/audio/sequencer/editor.ts';
import { makePattern } from '../src/audio/sequencer/model.ts';
import type { SequencerNote, SequencerTrack } from '../src/audio/types.ts';

const n = (note: number, extra: Partial<SequencerNote> = {}): SequencerNote => ({ note, velocity: 0.8, length: 1, ...extra });
const row = (len: number, at: Record<number, SequencerNote>): (SequencerNote | null)[] => Array.from({ length: len }, (_, i) => at[i] ?? null);
const KIT = { kick: 36, snare: 38, hat: 42 };

test('bass: the lowest note of each hit, in the bass register, for as long as it sounds', () => {
  // two half-bar chords: C minor, then A flat
  const src = row(16, { 0: n(60, { length: 8, chordNotes: [63, 67] }), 8: n(56, { length: 8, chordNotes: [60, 63] }) });
  const out = deriveSteps(src, 'bass');
  // a held root is struck again halfway
  assert.deepEqual(out.map((s) => (s ? [s.note, s.length] : null)).filter(Boolean), [[36, 4], [36, 4], [44, 4], [44, 4]]);
  assert.deepEqual(out.map((s, i) => (s ? i : -1)).filter((i) => i >= 0), [0, 4, 8, 12]);
});

test('bass: fast runs keep their main notes and never overlap the next one', () => {
  const src = row(8, { 0: n(72, { length: 4 }), 1: n(74), 2: n(76), 3: n(77), 6: n(79) });
  const out = deriveSteps(src, 'bass');
  assert.deepEqual(out.map((s, i) => (s ? i : -1)).filter((i) => i >= 0), [0, 2, 6], 'one bass note per two steps at most');
  assert.equal(out[0]!.length, 2, 'cut where the next bass note starts');
  assert.ok(out.every((s) => !s || (s.note >= 36 && s.note <= 47)));
});

test('bass from a drum kit: the song root on its kicks', () => {
  const src = row(16, { 0: n(36), 2: n(42), 4: n(38), 8: n(36), 10: n(42), 12: n(38) });
  const out = deriveSteps(src, 'bass', { fromKit: KIT, root: 9 });
  assert.deepEqual(out.map((s, i) => (s ? [i, s.note] : null)).filter(Boolean), [[0, 45], [8, 45]]);
});

test('harmony: the top voice a scale third higher, same rhythm and timing', () => {
  const cMajor = new Set([0, 2, 4, 5, 7, 9, 11]);
  const fit = (m: number) => (cMajor.has(((m % 12) + 12) % 12) ? m : m + 1);
  const src = row(4, { 0: n(60, { chordNotes: [64, 67], microOffset: 0.2 }), 1: n(62), 3: n(64) });
  const out = deriveSteps(src, 'harmony', { fit });
  // above G: B (major third); above D: F (minor third); above E: G (minor third)
  assert.deepEqual(out.map((s) => s?.note ?? null), [71, 65, null, 67]);
  assert.equal(out[0]!.chordNotes, undefined, 'a single line, not a chord');
  assert.equal(out[0]!.microOffset, 0.2, 'it keeps the timing of the part it follows');
});

test('arp: a chord is broken into steps, up then down, until the next hit', () => {
  const src = row(8, { 0: n(60, { length: 6, chordNotes: [64, 67] }), 6: n(62, { length: 2 }) });
  const out = deriveSteps(src, 'arp');
  assert.deepEqual(out.map((s) => s?.note ?? null), [60, 64, 67, 64, 60, 64, 62, 69]);
  assert.ok(out.every((s) => !s || s.length === 1));
});

test('rhythm on a drum kit: kick on the strong hits, snare on beats 2 and 4, hats in between', () => {
  // a bass line: on the beat at 0 and 8, syncopated at 3 and 11
  const src = row(16, { 0: n(36), 3: n(36), 8: n(43), 11: n(36) });
  const out = deriveSteps(src, 'rhythm', { toKit: KIT, stepsPerBeat: 4, stepsPerBar: 16 });
  const at = (i: number) => (out[i] ? [out[i]!.note, ...(out[i]!.chordNotes ?? [])] : []);
  assert.deepEqual(at(0), [36]);
  assert.deepEqual(at(3), [42], 'an off-beat hit becomes a hat');
  assert.deepEqual(at(4), [38]);
  assert.deepEqual(at(8), [36]);
  assert.deepEqual(at(12), [38]);
  assert.deepEqual(at(2), [42], 'the off-beat 8th keeps time where the part is silent');
  assert.deepEqual(at(1), []);
});

test('any kind on a drum kit is a groove, and pads are never harmonised', () => {
  const src = row(16, { 0: n(60), 4: n(64) });
  assert.deepEqual(deriveSteps(src, 'harmony', { toKit: KIT, stepsPerBeat: 4, stepsPerBar: 16 }), deriveSteps(src, 'rhythm', { toKit: KIT, stepsPerBeat: 4, stepsPerBar: 16 }));
  const kitSrc = row(4, { 0: n(36), 2: n(42) });
  assert.deepEqual(deriveSteps(kitSrc, 'arp', { fromKit: KIT, root: 2 }).map((s) => s?.note ?? null), [50, null, 50, null], 'a kit gives its rhythm on the root');
});

function track(id: string, name: string, steps: (SequencerNote | null)[] = [], length = 16): SequencerTrack {
  const p = makePattern({ name: 'Pattern 1', length, steps });
  return { id, deviceId: `dev_${id}`, name, color: '#10b981', steps: p.steps, patternList: [p], activePatternId: p.id, arrangementClips: [] } as unknown as SequencerTrack;
}

test('derivePattern adds a named, selected pattern with the length of its source, in one undo step', () => {
  const keys = track('k', 'Keys', row(32, { 0: n(60, { length: 8, chordNotes: [63, 67] }), 16: n(58, { length: 8, chordNotes: [62, 65] }) }), 32);
  const bass = track('b', 'Bass', row(16, { 0: n(40) }));
  const drums = track('d', 'Drums');
  let commits = 0;
  const host: SequencerHost = {
    tracks: [keys, bass, drums],
    stepsPerBar: 16,
    bpm: 120,
    activePatternIndex: 0,
    patternLength: 16,
    arrangementMarkers: [],
    commitEdit: () => void commits++,
    padNotesOf: (t) => (t.id === 'd' ? [36, 38, 42, 46] : null),
    kitRolesOf: (t) => (t.id === 'd' ? KIT : null),
    snapMidiToScale: (m) => m,
    rootKey: 0,
  };
  const seq = new SequencerEditor(host);
  const first = bass.patternList![0];
  const p = seq.derivePattern('b', 'k', 'bass')!;
  assert.equal(p.name, 'Bass line from Keys');
  assert.equal(p.length, 32);
  assert.equal(bass.activePatternId, p.id);
  assert.equal(bass.patternList!.length, 2, 'the pattern that was there is kept');
  assert.equal(first.steps[0]!.note, 40);
  assert.deepEqual([p.steps[0]!.note, p.steps[16]!.note], [36, 46]);
  assert.equal(commits, 1);
  const again = seq.derivePattern('b', 'k', 'bass')!;
  assert.equal(again.name, 'Bass line from Keys 2');
  const groove = seq.derivePattern('d', 'k', 'harmony')!;
  assert.equal(groove.name, 'Rhythm from Keys', 'a drum kit always gets a groove');
  assert.equal(groove.steps[4]!.note, 38);
  const own = seq.derivePattern('k', 'k', 'arp')!;
  assert.equal(keys.patternList!.length, 2, 'a part can be the source of its own new pattern');
  assert.equal(own.steps[1]!.note, 63);
});
