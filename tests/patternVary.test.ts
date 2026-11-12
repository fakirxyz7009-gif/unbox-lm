import test from 'node:test';
import assert from 'node:assert/strict';
import { varySteps } from '../src/audio/sequencer/patternVary.ts';
import type { SequencerNote } from '../src/audio/types.ts';

test('pattern variation fills use the complete SequencerNote shape', () => {
  const base: (SequencerNote | null)[] = [
    { note: 60, velocity: 0.8, length: 1, chordNotes: [64, 67] },
    null,
  ];
  let filled: ReturnType<typeof varySteps>[number] | null = null;
  for (let seed = 1; seed <= 1_000 && !filled; seed++) {
    const take = varySteps(base, seed, { stepsPerBar: 16 });
    filled = take[1];
  }
  assert.ok(filled, 'expected at least one deterministic variation seed to fill the gap');
  assert.equal(filled.chordNotes, undefined);
  assert.equal(filled.length, 1);
});

test('pattern variation is deterministic and does not mutate source chords', () => {
  const base = [{ note: 60, velocity: 0.8, length: 2, chordNotes: [64, 67] }, null, null, null];
  const first = varySteps(base, 9182, { stepsPerBar: 4 });
  const second = varySteps(base, 9182, { stepsPerBar: 4 });
  assert.deepEqual(first, second);
  assert.deepEqual(base[0]?.chordNotes, [64, 67]);
});
