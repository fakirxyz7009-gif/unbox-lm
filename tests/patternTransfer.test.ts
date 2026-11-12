import test from 'node:test';
import assert from 'node:assert/strict';
import { sameSteps, transferSteps } from '../src/audio/sequencer/patternTransfer.ts';
import { patternCycle16ths, varySteps } from '../src/audio/sequencer/patternVary.ts';
import { SequencerEditor, type SequencerHost } from '../src/audio/sequencer/editor.ts';
import { makePattern } from '../src/audio/sequencer/model.ts';
import type { SequencerNote, SequencerTrack } from '../src/audio/types.ts';

const n = (note: number, extra: Partial<SequencerNote> = {}): SequencerNote => ({ note, velocity: 0.8, length: 1, ...extra });
const KIT = [36, 38, 42, 46];

test('pitched to pitched: an exact, independent copy', () => {
  const src = [n(60, { chordNotes: [64, 67], chordLengths: [2, 2] }), null, n(62)];
  const out = transferSteps(src);
  assert.deepEqual(out, src);
  out[0]!.chordNotes!.push(72);
  out[0]!.chordLengths!.push(1);
  assert.deepEqual(src[0]!.chordNotes, [64, 67], 'the copy must not share chord arrays with its source');
  assert.deepEqual(src[0]!.chordLengths, [2, 2]);
});

test('pitched to kit: pitches take the pads in pitch order, so the rhythm transfers', () => {
  const out = transferSteps([n(72), n(48), null, n(60), n(48)], { toPads: KIT });
  assert.deepEqual(out.map((s) => s?.note ?? null), [42, 36, null, 38, 36]);
});

test('pitched to kit: a pattern already written on the pads is left alone', () => {
  const out = transferSteps([n(36), n(42), n(38)], { toPads: KIT });
  assert.deepEqual(out.map((s) => s?.note), [36, 42, 38]);
});

test('pitched to kit: chord notes that land on one pad are kept once', () => {
  // five pitches on four pads: 67 wraps onto the first pad, which the root already plays
  const out = transferSteps([n(48, { chordNotes: [52, 55, 60, 67], chordVelocities: [0.5, 0.6, 0.7, 0.9] })], { toPads: KIT });
  assert.equal(out[0]!.note, 36);
  assert.deepEqual(out[0]!.chordNotes, [38, 42, 46]);
  assert.deepEqual(out[0]!.chordVelocities, [0.5, 0.6, 0.7]);
});

test('kit to pitched: pads become scale notes above the root', () => {
  const out = transferSteps([n(36), n(38), n(42), n(46)], { fromPads: KIT, root: 2, fit: (m) => m });
  // root D3 = 50: kick = root, snare = fifth, hat = octave, open hat = third
  assert.deepEqual(out.map((s) => s?.note), [50, 57, 62, 53]);
});

test('kit to another kit: pad N plays pad N', () => {
  const out = transferSteps([n(36), n(42)], { fromPads: KIT, toPads: [60, 61, 62, 63] });
  assert.deepEqual(out.map((s) => s?.note), [60, 62]);
});

test('sameSteps compares what the steps play', () => {
  assert.ok(sameSteps([n(60), null], [n(60), null]));
  assert.ok(!sameSteps([n(60), null], [n(61), null]));
  assert.ok(!sameSteps([n(60)], [n(60), null]));
});

test('pattern mode loops where every pattern is back at its start', () => {
  const T = 12; // ticks per 16th
  assert.equal(patternCycle16ths([16 * T], T, 16), 16, 'one 1-bar pattern loops after a bar');
  assert.equal(patternCycle16ths([16 * T, 32 * T, 64 * T], T, 16), 64, 'the longest pattern when the others divide it');
  assert.equal(patternCycle16ths([12 * T, 16 * T], T, 16), 48, 'a 12-step against a 16-step pattern meets after 3 bars');
  assert.equal(patternCycle16ths([16 * T, 17 * T, 19 * T, 23 * T, 29 * T], T, 16), null, 'no common loop within 64 bars: the transport runs on');
  assert.equal(patternCycle16ths([], T, 16), null);
});

test('every take of a generated riff differs but keeps each bar downbeat', () => {
  const base: (SequencerNote | null)[] = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? n(48 + (i % 8), { velocity: 0.9 }) : null));
  const takes = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(varySteps(base, seed * 7919)));
  assert.equal(new Set(takes).size, 5, 'five seeds give five different takes');
  for (const seed of [11, 222, 3333]) {
    const take = varySteps(base, seed);
    assert.equal(take[0]?.note, base[0]!.note);
    assert.equal(take[16]?.note, base[16]!.note);
  }
  assert.deepEqual(varySteps(base, 0), base, 'seed 0 is the plain riff');
});

function hostWith(tracks: SequencerTrack[], pads: Record<string, number[]> = {}): SequencerHost & { commits: number } {
  return {
    tracks,
    stepsPerBar: 16,
    bpm: 120,
    activePatternIndex: 0,
    patternLength: 16,
    arrangementMarkers: [],
    commits: 0,
    commitEdit() {
      this.commits++;
    },
    padNotesOf: (t) => pads[t.id] ?? null,
    snapMidiToScale: (m) => m,
    rootKey: 0,
  };
}

function track(id: string, name: string, steps: (SequencerNote | null)[] = []): SequencerTrack {
  const p = makePattern({ name: 'Pattern 1', length: 16, steps });
  return { id, deviceId: `dev_${id}`, name, color: '#10b981', steps: p.steps, patternList: [p], activePatternId: p.id, arrangementClips: [] } as unknown as SequencerTrack;
}

test('a pattern copies onto another instrument as a new, selected pattern', () => {
  const lead = track('a', 'Lead', [n(60), null, n(64), null]);
  const bass = track('b', 'Bass');
  const host = hostWith([lead, bass]);
  const seq = new SequencerEditor(host);
  const copy = seq.copyPatternTo('a', lead.activePatternId!, 'b');
  assert.ok(copy);
  assert.equal(bass.patternList!.length, 2);
  assert.equal(bass.activePatternId, copy.id);
  assert.equal(copy.name, 'Pattern 1 (Lead)', 'a taken name says where the copy came from');
  assert.deepEqual(copy.steps.slice(0, 4).map((s) => s?.note ?? null), [60, null, 64, null]);
  assert.equal(host.commits, 1, 'one undo step');
  copy.steps[0]!.note = 72;
  assert.equal(lead.steps[0]!.note, 60, 'editing the copy leaves the original alone');
});

test('copying onto a drum kit fits the notes to its pads, and the snapshot survives its source', () => {
  const lead = track('a', 'Lead', [n(60), n(67), n(72)]);
  const drums = track('d', 'Drums');
  const host = hostWith([lead, drums], { d: KIT });
  const seq = new SequencerEditor(host);
  const snap = seq.snapshotPattern('a')!;
  lead.steps[0] = n(1); // the source changes after Copy
  host.tracks.splice(0, 1); // … and is even deleted
  const pasted = seq.pastePattern('d', snap)!;
  assert.deepEqual(pasted.steps.slice(0, 3).map((s) => s?.note), [36, 38, 42]);
});

test('a pattern clip moves to another instrument and takes its pattern along, once', () => {
  const lead = track('a', 'Lead', [n(60), n(62)]);
  const pad = track('b', 'Pad');
  const host = hostWith([lead, pad]);
  const seq = new SequencerEditor(host);
  const c1 = seq.addPatternClip('a', 0)!;
  const c2 = seq.addPatternClip('a', 1)!;
  assert.equal(seq.moveClip('a', c1.id, 4, 'b'), 'b');
  assert.equal(seq.moveClip('a', c2.id, 5, 'b'), 'b');
  assert.equal(lead.arrangementClips!.length, 0);
  assert.equal(pad.arrangementClips!.length, 2);
  assert.equal(pad.patternList!.length, 2, 'both clips share ONE copied pattern');
  const adopted = pad.patternList![1];
  assert.ok(pad.arrangementClips!.every((c) => c.patternId === adopted.id));
  assert.deepEqual(adopted.steps.slice(0, 2).map((s) => s?.note), [60, 62]);
  assert.equal(pad.activePatternId, pad.patternList![0].id, 'moving a clip does not change which pattern is being edited');
});

test('audio tracks take no pattern, and audio clips stay on audio tracks', () => {
  const lead = track('a', 'Lead', [n(60)]);
  const audio = { ...track('x', 'Audio 1'), kind: 'audio' } as SequencerTrack;
  const host = hostWith([lead, audio]);
  const seq = new SequencerEditor(host);
  assert.equal(seq.copyPatternTo('a', lead.activePatternId!, 'x'), null);
  const c = seq.addPatternClip('a', 0)!;
  assert.equal(seq.moveClip('a', c.id, 2, 'x'), 'a', 'the clip stays on its instrument track');
  assert.equal(lead.arrangementClips!.length, 1);
});
