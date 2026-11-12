import test from 'node:test';
import assert from 'node:assert/strict';

import { MidiNoteLifecycle } from '../src/audio/midi/MidiNoteLifecycle.ts';

test('key release records the pressed duration while sustain keeps the voice alive', () => {
  const lifecycle = new MidiNoteLifecycle<string>();
  const recorded: string[] = [];
  const released: string[] = [];
  lifecycle.noteOn(0, 60, ['piano']);

  lifecycle.noteOff(
    0,
    60,
    ['another-piano'],
    true,
    (target, note) => recorded.push(`${target}:${note}`),
    (target, note) => released.push(`${target}:${note}`)
  );

  assert.deepEqual(recorded, ['piano:60']);
  assert.equal(released.length, 0);

  lifecycle.sustainReleased((target, note) => released.push(`${target}:${note}`));
  assert.deepEqual(released, ['piano:60']);
});

test('a held note releases on the instrument that received note-on after target changes', () => {
  const lifecycle = new MidiNoteLifecycle<string>();
  const released: string[] = [];
  lifecycle.noteOn(1, 64, ['part-a']);

  lifecycle.noteOff(1, 64, ['part-b'], false, () => {}, (target, note) => released.push(`${target}:${note}`));

  assert.deepEqual(released, ['part-a:64']);
});

test('sustain release on one MIDI channel leaves other channels held', () => {
  const lifecycle = new MidiNoteLifecycle<string>();
  const released: string[] = [];
  lifecycle.noteOn(0, 60, ['channel-one']);
  lifecycle.noteOn(1, 60, ['channel-two']);

  lifecycle.noteOff(0, 60, [], true, () => {}, (target, note) => released.push(`${target}:${note}`));
  lifecycle.noteOff(1, 60, [], true, () => {}, (target, note) => released.push(`${target}:${note}`));
  lifecycle.sustainReleased((target, note) => released.push(`${target}:${note}`), 0);

  assert.deepEqual(released, ['channel-one:60']);
  lifecycle.sustainReleased((target, note) => released.push(`${target}:${note}`), 1);
  assert.deepEqual(released, ['channel-one:60', 'channel-two:60']);
});
