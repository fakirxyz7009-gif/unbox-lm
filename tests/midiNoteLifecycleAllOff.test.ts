import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiNoteLifecycle } from '../src/audio/midi/MidiNoteLifecycle.ts';

test('All Notes Off releases the held keys on its channel and leaves other channels alone', () => {
  const life = new MidiNoteLifecycle<string>();
  life.noteOn(0, 60, ['piano']);
  life.noteOn(1, 64, ['pad']);
  const released: string[] = [];
  life.allOff(0, (target, note) => released.push(`key ${target} ${note}`), (target, note) => released.push(`sound ${target} ${note}`));
  assert.deepEqual(released, ['key piano 60', 'sound piano 60']);

  // The other channel's key still ends normally on its own note-off.
  const later: string[] = [];
  life.noteOff(1, 64, [], false, () => undefined, (target, note) => later.push(`${target} ${note}`));
  assert.deepEqual(later, ['pad 64']);
});

test('All Notes Off also ends keys that the sustain pedal is holding', () => {
  const life = new MidiNoteLifecycle<string>();
  life.noteOn(0, 67, ['organ']);
  life.noteOff(0, 67, [], true, () => undefined, () => undefined);
  const released: string[] = [];
  life.allOff(0, () => undefined, (target, note) => released.push(`${target} ${note}`));
  assert.deepEqual(released, ['organ 67']);
});

test('a System Reset (no channel) releases every channel', () => {
  const life = new MidiNoteLifecycle<string>();
  life.noteOn(0, 48, ['bass']);
  life.noteOn(9, 36, ['kit']);
  const released: string[] = [];
  life.allOff(undefined, () => undefined, (target, note) => released.push(`${target} ${note}`));
  assert.deepEqual(released.sort(), ['bass 48', 'kit 36']);
});
