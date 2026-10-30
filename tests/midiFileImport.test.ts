import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from '../src/audio/export/midi.ts';

/** A format 0 file with one track: two tempo events, and the same key struck twice before it is released. */
function sampleFile(division: number): ArrayBuffer {
  const track = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 500 000 µs = 120 bpm
    0x83, 0x60, 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90, // 480 ticks later: 250 000 µs = 240 bpm (must not win)
    0x00, 0x90, 0x3c, 0x64, // note on C4
    0x81, 0x70, 0x90, 0x3c, 0x64, // 240 ticks later, C4 again before the first is released
    0x81, 0x70, 0x80, 0x3c, 0x40, // 240 ticks later, release
    0x00, 0xff, 0x2f, 0x00, // end of track
  ];
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, division >> 8, division & 0xff];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length];
  return new Uint8Array([...header, ...trackHeader, ...track]).buffer;
}

test('the first tempo event sets the song tempo, and a later tempo change does not overwrite it', () => {
  const midi = parseMidi(sampleFile(480));
  assert.equal(midi.bpm, 120);
  assert.equal(midi.ppq, 480);
});

test('a second note on the same key ends the first note instead of losing it', () => {
  const midi = parseMidi(sampleFile(480));
  const notes = midi.tracks.flatMap((t) => t.notes);
  assert.equal(notes.length, 2, 'one of the two strikes was lost');
  // The second tempo event sits 480 ticks in, so the strikes are at 480 and 720 and each lasts 240 ticks.
  assert.deepEqual(notes.map((n) => [n.tick, n.length]), [[480, 240], [720, 240]]);
});

test('a SMPTE time-code header is refused with a message instead of being read as beats', () => {
  assert.throws(() => parseMidi(sampleFile(0xe728)), /SMPTE time-code/);
});
