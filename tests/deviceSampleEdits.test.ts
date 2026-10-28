import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_KEY_SAMPLE,
  deviceSample,
  setKeySample,
  setMultiSample,
  setPadSample,
  type PadSample,
  type MultiSampleZone,
} from '../src/audio/deviceSamples.ts';
import { beginPadSampleGesture, editCapturedPadSample, editPadSample, editPadSamples } from '../src/audio/deviceSampleEdits.ts';
import { undoJournal } from '../src/audio/undoJournal.ts';

let sequence = 0;
const sample = (audioId: string, patch: Partial<PadSample> = {}): PadSample => ({ audioId, level: 1, ...patch });
const zone = (audioId: string): MultiSampleZone => ({
  audioId, keyLow: 0, keyHigh: 127, velLow: 1, velHigh: 127, root: 60, tune: 0,
  level: 1, attack: 0.003, release: 0.25, loop: false,
});

function fixture() {
  undoJournal.clear();
  const id = `sample-edit-${++sequence}`;
  const devices = new Map<string, object>([[id, {}]]);
  let changes = 0;
  let suspended = false;
  return {
    id,
    devices,
    host: {
      devices,
      undoSuspended: () => suspended,
      changed: () => { changes++; },
    },
    changes: () => changes,
    suspend: (value: boolean) => { suspended = value; },
  };
}

test('note-audio metadata undo and redo resolve the current graph', () => {
  const f = fixture();
  setPadSample(f.id, 60, sample('recording', { offset: 0.1, duration: 1 }));
  editPadSample(f.host, f.id, 60, sample('recording', { offset: 0.4, duration: 1 }));
  f.devices.set(f.id, {}); // mirrors a structural project restore retaining its ids.
  assert.equal(undoJournal.undo(), 'Edit note audio');
  assert.equal(deviceSample(f.id)?.pads?.[60]?.offset, 0.1);
  assert.equal(undoJournal.redo(), 'Edit note audio');
  assert.equal(deviceSample(f.id)?.pads?.[60]?.offset, 0.4);
});

test('same note property coalesces, while a different property remains a separate edit', () => {
  const f = fixture();
  setPadSample(f.id, 61, sample('recording', { offset: 0 }));
  editPadSample(f.host, f.id, 61, sample('recording', { offset: 0.1 }));
  editPadSample(f.host, f.id, 61, sample('recording', { offset: 0.2 }));
  editPadSample(f.host, f.id, 61, sample('recording', { offset: 0.2, reverse: true }));
  assert.equal(undoJournal.undo(), 'Edit note audio');
  assert.equal(deviceSample(f.id)?.pads?.[61]?.reverse, undefined);
  assert.equal(undoJournal.undo(), 'Edit note audio');
  assert.equal(deviceSample(f.id)?.pads?.[61]?.offset, 0);
});

test('one spread is one reversible operation, including previously empty keys', () => {
  const f = fixture();
  setPadSample(f.id, 62, sample('original'));
  editPadSamples(f.host, f.id, new Map([
    [62, sample('slice-a', { offset: 0 })],
    [63, sample('slice-b', { offset: 0.5 })],
  ]), 'Spread note audio to keys');
  assert.equal(deviceSample(f.id)?.pads?.[63]?.audioId, 'slice-b');
  assert.equal(undoJournal.undo(), 'Spread note audio to keys');
  assert.equal(deviceSample(f.id)?.pads?.[62]?.audioId, 'original');
  assert.equal(deviceSample(f.id)?.pads?.[63], undefined);
  assert.equal(undoJournal.redo(), 'Spread note audio to keys');
  assert.equal(deviceSample(f.id)?.pads?.[63]?.audioId, 'slice-b');
});

test('trim gesture records exactly one step and cancellation restores the starting trim', () => {
  const f = fixture();
  setPadSample(f.id, 64, sample('recording', { offset: 0.1 }));
  const gesture = beginPadSampleGesture(f.host, f.id, 64);
  gesture.update(sample('recording', { offset: 0.2 }));
  gesture.update(sample('recording', { offset: 0.3 }));
  assert.equal(undoJournal.canUndo, false);
  gesture.commit();
  assert.equal(undoJournal.undo(), 'Trim note audio');
  assert.equal(deviceSample(f.id)?.pads?.[64]?.offset, 0.1);
  const cancelled = beginPadSampleGesture(f.host, f.id, 64);
  cancelled.update(sample('recording', { offset: 0.6 }));
  cancelled.cancel();
  assert.equal(deviceSample(f.id)?.pads?.[64]?.offset, 0.1);
  assert.equal(undoJournal.canUndo, false);
});

test('a stale trim gesture cannot write into a restored device with the same id', () => {
  const f = fixture();
  setPadSample(f.id, 65, sample('before', { offset: 0.1 }));
  const gesture = beginPadSampleGesture(f.host, f.id, 65);
  f.devices.set(f.id, {});
  setPadSample(f.id, 65, sample('restored', { offset: 0.8 }));
  gesture.update(sample('before', { offset: 0.6 }));
  gesture.cancel();
  assert.deepEqual(deviceSample(f.id)?.pads?.[65], sample('restored', { offset: 0.8 }));
});

test('same metadata is ignored, and suspended structural changes do not nest journal entries', () => {
  const f = fixture();
  const original = sample('recording', { offset: 0.1 });
  setPadSample(f.id, 66, original);
  editPadSample(f.host, f.id, 66, original);
  assert.equal(f.changes(), 0);
  f.suspend(true);
  editPadSample(f.host, f.id, 66, sample('recording', { offset: 0.5 }));
  assert.equal(deviceSample(f.id)?.pads?.[66]?.offset, 0.5);
  assert.equal(undoJournal.canUndo, false);
});

test('an absent captured-note assignment is not fabricated by an ADSR-only edit', () => {
  const f = fixture();
  // The workstation must decline this operation until a real recorded asset exists; using an
  // empty audioId would add unusable project state and silently escape the audio editor's undo.
  assert.equal(editCapturedPadSample(f.host, f.id, 69, { attack: 0.1 }), false);
  assert.equal(deviceSample(f.id), undefined);
  assert.equal(undoJournal.canUndo, false);
  assert.equal(f.changes(), 0);
  setPadSample(f.id, 69, sample('capture', { attack: 0.01 }));
  assert.equal(editCapturedPadSample(f.host, f.id, 69, { attack: 0.1 }), true);
  assert.equal(deviceSample(f.id)?.pads?.[69]?.attack, 0.1);
  assert.equal(undoJournal.undo(), 'Edit note audio');
  assert.equal(deviceSample(f.id)?.pads?.[69]?.attack, 0.01);
});

test('replacing a keys source clears incompatible pad and bank assignments but updates retain pads', () => {
  const f = fixture();
  setMultiSample(f.id, [zone('bank')]);
  setPadSample(f.id, 67, sample('captured'));
  setKeySample(f.id, { ...DEFAULT_KEY_SAMPLE, audioId: 'keys-a' });
  assert.equal(deviceSample(f.id)?.multiSample, undefined);
  assert.equal(deviceSample(f.id)?.pads, undefined);
  setPadSample(f.id, 67, sample('edited-key'));
  setKeySample(f.id, { ...DEFAULT_KEY_SAMPLE, audioId: 'keys-a', level: 0.5 });
  assert.equal(deviceSample(f.id)?.pads?.[67]?.audioId, 'edited-key');
});
