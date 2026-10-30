import test from 'node:test';
import assert from 'node:assert/strict';
import { runTranscribeJob } from '../shared/transcription/transcribeJob.ts';
import { transcribeInBackground } from '../src/audio/ai/transcribeInBackground.ts';

const SR = 44100;

function sine(hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR);
  return out;
}

test('a silent clip has no notes, hits or kind in any job', () => {
  const silent = new Float32Array(SR);
  assert.deepEqual(runTranscribeJob('chords', silent, SR), []);
  assert.deepEqual(runTranscribeJob('line', silent, SR), []);
  assert.deepEqual(runTranscribeJob('drums', silent, SR), { hits: [], tempo: null });
  assert.equal(runTranscribeJob('source', silent, SR).kind, 'silent');
});

test('a line reads a bass tone as its note', () => {
  const notes = runTranscribeJob('line', sine(110, 0.8), SR);
  assert.deepEqual(
    notes.map((n) => n.note),
    [45],
  );
});

test('without a Worker (Node) the background job gives the same result as the direct one', async () => {
  const clip = sine(220, 0.8);
  assert.deepEqual(await transcribeInBackground('line', clip, SR), runTranscribeJob('line', clip, SR));
});
