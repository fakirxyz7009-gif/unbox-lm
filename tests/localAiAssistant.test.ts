import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_LIMITS, checkAssistantReply, type AssistantContext } from '../shared/localAi/assistant.ts';

const context: AssistantContext = {
  bpm: 120,
  timeSignature: '4/4',
  stepsPerBar: 16,
  targetTrack: { id: 't1', name: 'Bass' },
  patternLength: 16,
  focusedClip: null,
  tracks: [
    { id: 't1', name: 'Bass', muted: false },
    { id: 't2', name: 'Lead Synth', muted: true },
  ],
};

function checked(raw: unknown) {
  const out = checkAssistantReply(raw, context);
  if ('error' in out) assert.fail(out.error);
  return out;
}

test('a well-formed reply keeps its reply text and actions', () => {
  const out = checked({
    reply: 'Reversed the bass line.',
    actions: [{ type: 'transform_notes', scope: 'pattern', op: 'reverse', semitones: 0 }],
  });
  assert.equal(out.reply, 'Reversed the bass line.');
  assert.deepEqual(out.actions, [{ type: 'transform_notes', scope: 'pattern', op: 'reverse', semitones: 0 }]);
  assert.deepEqual(out.rejected, []);
});

test('a reply that is not an object is refused outright', () => {
  assert.ok('error' in checkAssistantReply('just text', context));
  assert.ok('error' in checkAssistantReply(['list'], context));
  assert.ok('error' in checkAssistantReply(null, context));
});

test('unknown action names are dropped and say why', () => {
  const out = checked({ reply: '', actions: [{ type: 'editPattern', action: 'reverseNotes' }, { type: 'set_tempo', bpm: 100 }] });
  assert.equal(out.actions.length, 1);
  assert.equal(out.actions[0].type, 'set_tempo');
  assert.match(out.rejected[0], /not an action the app can apply/);
});

test('tempo is clamped to the supported range and the change is reported', () => {
  const out = checked({ actions: [{ type: 'set_tempo', bpm: 900 }] });
  assert.deepEqual(out.actions, [{ type: 'set_tempo', bpm: ASSISTANT_LIMITS.maxBpm }]);
  assert.match(out.rejected[0], /limited/);
});

test('transform operations must be known, and transpose needs a non-zero shift', () => {
  const bad = checked({ actions: [{ type: 'transform_notes', scope: 'pattern', op: 'shuffle' }, { type: 'transform_notes', scope: 'pattern', op: 'transpose', semitones: 0 }] });
  assert.equal(bad.actions.length, 0);
  assert.equal(bad.rejected.length, 2);
  const ok = checked({ actions: [{ type: 'transform_notes', scope: 'clip', op: 'transpose', semitones: 99 }] });
  assert.deepEqual(ok.actions, [{ type: 'transform_notes', scope: 'clip', op: 'transpose', semitones: 24 }]);
});

test('written notes are clamped to MIDI range, limited in count and malformed ones dropped', () => {
  const notes = [
    { step: 0, note: 200, length: 1, velocity: 2 },
    { step: -4, note: 60, length: 0, velocity: 0.5 },
    { step: 'x', note: 60 },
  ];
  const out = checked({ actions: [{ type: 'write_notes', scope: 'pattern', replace: true, notes }] });
  const [action] = out.actions;
  assert.equal(action.type, 'write_notes');
  if (action.type !== 'write_notes') return;
  assert.equal(action.notes.length, 2);
  assert.deepEqual(action.notes[0], { step: 0, note: 127, length: 1, velocity: 1 });
  assert.deepEqual(action.notes[1], { step: 0, note: 60, length: 0.25, velocity: 0.5 });
  assert.match(out.rejected.join(' '), /malformed note/);

  const many = Array.from({ length: ASSISTANT_LIMITS.maxNotesPerAction + 5 }, (_, i) => ({ step: i % 16, note: 60, length: 1, velocity: 0.8 }));
  const capped = checked({ actions: [{ type: 'write_notes', scope: 'pattern', notes: many }] });
  const cappedAction = capped.actions[0];
  assert.equal(cappedAction.type === 'write_notes' ? cappedAction.notes.length : 0, ASSISTANT_LIMITS.maxNotesPerAction);
  assert.match(capped.rejected.join(' '), /only the first/);
});

test('a mute action must name a real track, matched by id or by name ignoring case', () => {
  const byName = checked({ actions: [{ type: 'set_track_mute', track: 'lead synth', muted: false }] });
  assert.deepEqual(byName.actions, [{ type: 'set_track_mute', track: 't2', muted: false }]);
  const byId = checked({ actions: [{ type: 'set_track_mute', track: 't1', muted: true }] });
  assert.deepEqual(byId.actions, [{ type: 'set_track_mute', track: 't1', muted: true }]);
  const missing = checked({ actions: [{ type: 'set_track_mute', track: 'Drummer', muted: true }] });
  assert.equal(missing.actions.length, 0);
  assert.match(missing.rejected[0], /no track called/);
});

test('reply text loses control characters and is cut to the limit', () => {
  const out = checked({ reply: `hi\u0007 there ${'x'.repeat(2000)}` });
  assert.ok(!out.reply.includes('\u0007'));
  assert.equal(out.reply.length, ASSISTANT_LIMITS.maxReplyChars);
});
