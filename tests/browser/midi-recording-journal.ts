import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { discardCompletedRecordingJournals, listRecordingJournals, loadRecordingJournal } from '../../src/audio/recording/recordingJournal.ts';
import type { PlaybackMode } from '../../src/audio/sequencer/model.ts';
import { dbGet } from '../../src/project/db.ts';
import { projectManager, type ProjectRecord } from '../../src/project/ProjectManager.ts';
import { RecoveryBanner } from '../../src/shell/RecoveryBanner.tsx';

const TRACK_NAME = 'Interrupted MIDI instrument';
const BASELINE_CLIP = 'midi-recovery-existing-clip';
const START_STEP = 32;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | undefined | Promise<T | undefined>, description: string): Promise<T> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}. ${audioEngine.recorder.message ?? ''}`);
}

/** Records in a separate renderer. The parent removes it while the second note is held. */
export async function runInterruptedMidiCapture(projectId: string, trackName = TRACK_NAME): Promise<string> {
  projectManager.autosave = false;
  expect(await projectManager.open(projectId), 'The interrupted MIDI fixture could not load its saved project');
  const track = audioEngine.tracks.find((entry) => entry.name === trackName);
  expect(track, 'The interrupted MIDI fixture lost its armed track');

  const port = Object.assign(new EventTarget(), {
    id: 'crash-recovery-simulated-midi', name: 'Crash Recovery MIDI (simulated)', state: 'connected', connection: 'open',
  });
  const access = {
    inputs: new Map([[port.id, port]]), outputs: new Map(), onstatechange: null,
  } as unknown as MIDIAccess;
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  expect(await audioEngine.enableMidiInput(), 'Could not open the simulated MIDI input');
  audioEngine.midiTargetDeviceId = track.deviceId;
  audioEngine.setTrackArmed(track.id, true);

  // Freeze the position source so timer jitter cannot change the recorded step lengths. Raw
  // Web MIDI events still go through the real input adapter and RecordController in this renderer.
  let position16 = START_STEP;
  audioEngine.songPosition = START_STEP;
  audioEngine.startTransport = async () => { audioEngine.isPlaying = true; };
  audioEngine.getPlayheadPosition = () => position16;
  audioEngine.positionAtTime = () => position16;
  audioEngine.timeOfSongPosition = () => audioEngine.ctx.currentTime;
  audioEngine.seekToSongPosition = (position) => { position16 = audioEngine.songPosition = position; };
  audioEngine.recorder.settings.mode = 'replace';
  expect(await audioEngine.recorder.start(), 'Could not begin the interrupted MIDI take');

  const send = (at: number, status: number, note: number, velocity: number) => {
    position16 = at;
    port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([status, note, velocity]) }));
  };
  send(START_STEP + 1, 0x91, 64, 96);
  send(START_STEP + 3, 0x81, 64, 0);
  send(START_STEP + 4, 0x92, 67, 110);
  position16 = START_STEP + 6;
  expect(audioEngine.midi.held.has(67), 'The held key did not reach the real MIDI input state');

  return waitFor(async () => {
    const manifest = (await listRecordingJournals()).find((entry) =>
      entry.projectId === projectId && entry.midiMode === audioEngine.playbackMode && !entry.finalizingAt && !entry.completedAt &&
      entry.tracks.some((entry) => entry.trackId === track.id));
    if (!manifest) return undefined;
    const journal = await loadRecordingJournal(manifest.sessionId);
    const completed = journal?.midiNotes.find((entry) => entry.note.note === 64)?.note;
    const held = journal?.midiNotes.find((entry) => entry.note.note === 67)?.note;
    if (completed?.length !== 2 || !(held && held.length > 0)) return undefined;
    expect(audioEngine.recorder.state === 'recording', 'The MIDI capture finished before the renderer was removed');
    return manifest.sessionId;
  }, 'both the released note and held note to reach the durable MIDI journal');
}

export async function verifyMidiCaptureRecovery(projectId: string, mode: PlaybackMode = 'song_arrangement'): Promise<number> {
  audioEngine.setPlaybackMode(mode);
  const trackName = mode === 'pattern_loop' ? `${TRACK_NAME} pattern` : TRACK_NAME;
  const device = audioEngine.createDevice('subtractor', trackName);
  const originalTrack = audioEngine.tracks.find((entry) => entry.deviceId === device.id);
  expect(originalTrack, 'The MIDI recovery instrument has no track');
  const trackId = originalTrack.id;
  const startBar = START_STEP / audioEngine.stepsPerBar;
  originalTrack.arrangementClips = [{
    id: BASELINE_CLIP, kind: 'notes', startBar, lengthBars: 1, name: 'Existing notes',
    notes: [{ step: 0, length: 1, note: 55, velocity: 0.5 }],
  }];
  const activePattern = originalTrack.patternList?.find((pattern) => pattern.id === originalTrack.activePatternId);
  expect(activePattern, 'The original pattern is missing');
  const activePatternId = activePattern.id;
  activePattern.division = '1/8';
  activePattern.steps[0] = { note: 50, velocity: 0.7, length: 1 };
  audioEngine.setTrackArmed(trackId, true);
  expect(await projectManager.save('Prepare interrupted MIDI take'), 'The parent project could not save its original MIDI clip');

  const renderer = document.createElement('iframe');
  const fixture = new URL(location.href);
  fixture.searchParams.set('interruptedMidiProject', projectId);
  fixture.searchParams.set('interruptedMidiTrack', trackName);
  renderer.src = fixture.href;
  document.body.append(renderer);
  let sessionId: string;
  try {
    sessionId = await waitFor(() => {
      const result = renderer.contentDocument?.querySelector<HTMLPreElement>('#result');
      if (result?.dataset.status === 'failed') throw new Error(result.textContent ?? 'Interrupted MIDI renderer failed');
      return result?.dataset.sessionId;
    }, 'the interrupted renderer to commit MIDI notes');
    await projectManager.refreshRecordingJournals();
    expect(!projectManager.recordingJournals.some((entry) => entry.sessionId === sessionId),
      'The parent window offered recovery for a live MIDI take');
    expect(!await projectManager.recoverRecordingJournal(sessionId), 'The parent recovered a live MIDI take');
    await projectManager.discardRecordingJournal(sessionId);
    expect(await loadRecordingJournal(sessionId), 'The parent window deleted its child renderer’s live MIDI journal');
  } finally {
    renderer.remove();
  }

  const inspectTrack = () => {
    const track = audioEngine.tracks.find((entry) => entry.id === trackId);
    const baseline = track?.arrangementClips?.find((entry) => entry.id === BASELINE_CLIP);
    expect(baseline?.kind === 'notes' && baseline.notes?.length === 1 && baseline.notes[0].note === 55 && baseline.startBar === startBar,
      'Recovering a take changed the saved MIDI clip');
    return track?.arrangementClips?.filter((entry) => entry.kind === 'notes' && entry.id !== BASELINE_CLIP) ?? [];
  };
  expect(inspectTrack().length === 0, 'The interrupted renderer placed notes without Stop or recovery');

  const mount = document.createElement('div');
  document.body.append(mount);
  const root = createRoot(mount);
  try {
    await waitFor(async () => {
      await projectManager.refreshRecordingJournals();
      return projectManager.recordingJournals.some((entry) => entry.sessionId === sessionId) ? true : undefined;
    }, 'the interrupted renderer to release its take for recovery');
    root.render(createElement(RecoveryBanner));
    const button = await waitFor(() => [...mount.querySelectorAll('button')].find((entry) =>
      entry.textContent?.trim() === 'Recover MIDI' && !entry.disabled), 'the Recover MIDI button');
    button.click();
    await waitFor(async () => !await loadRecordingJournal(sessionId) ? true : undefined, 'the recovered MIDI clip to save');
  } finally {
    root.unmount();
    mount.remove();
  }

  const verify = (): { id: string; notes: number } => {
    const clips = inspectTrack();
    if (mode === 'pattern_loop') {
      const track = audioEngine.tracks.find((entry) => entry.id === trackId);
      expect(track?.activePatternId === activePatternId && track.steps[0]?.note === 50 && clips.length === 0,
        'Pattern recovery changed the active pattern or arrangement');
      const pattern = track.patternList?.find((entry) => entry.id !== activePatternId);
      expect(track.patternList?.length === 2 && pattern?.division === '1/8' && pattern.length === activePattern.length,
        'Pattern recovery did not preserve the source division and length in one new pattern');
      const first = Math.round((START_STEP + 1) / 2) % pattern.length;
      const second = Math.round((START_STEP + 4) / 2) % pattern.length;
      expect(pattern.steps[first]?.note === 64 && pattern.steps[first]?.length === 1 && pattern.steps[second]?.note === 67,
        'Pattern recovery did not restore the recorded steps at the source division');
      return { id: pattern.id, notes: 2 };
    }
    expect(clips.length === 1 && clips[0].startBar === startBar && clips[0].muted,
      'Recovery did not append one muted clip at the captured position');
    const notes = clips[0].notes ?? [];
    const completed = notes.find((entry) => entry.note === 64);
    const held = notes.find((entry) => entry.note === 67);
    expect(notes.length === 2 && completed?.step === 1 && completed.length === 2 && Math.abs(completed.velocity - 96 / 127) < 1e-6,
      `The completed note changed during MIDI recovery: ${JSON.stringify(notes)}`);
    expect(held?.step === 4 && held.length > 0 && Math.abs(held.velocity - 110 / 127) < 1e-6,
      `The interrupted held note was not recovered from its last durable checkpoint: ${JSON.stringify(held)}`);
    return { id: clips[0].id, notes: notes.length };
  };
  const clip = verify();
  const saved = await dbGet<ProjectRecord>('projects', projectId);
  expect(saved?.json.includes(clip.id), 'The recovered MIDI clip was not saved in the original project');
  expect(await projectManager.open(projectId), 'Could not reopen the project after MIDI recovery');
  expect(verify().id === clip.id, 'The recovered MIDI clip did not survive reopen');

  // A completed take can have overdubbed an existing clip/pattern. Cleanup must require a
  // receipt in the saved snapshot rather than the existence of that destination.
  const track = audioEngine.tracks.find((entry) => entry.id === trackId);
  expect(track, 'Normal MIDI cleanup fixture lost the instrument after reopening');
  audioEngine.setTrackArmed(trackId, true);
  expect(await audioEngine.recorder.start(), 'Could not start a normal MIDI take after recovery');
  audioEngine.recorder.noteOn(track.deviceId, 72, 0.75);
  audioEngine.recorder.noteOff(track.deviceId, 72);
  await audioEngine.recorder.stop();
  audioEngine.stopTransport();
  const completed = (await listRecordingJournals()).find((entry) => entry.midiMode === mode && entry.completedAt && entry.placedMidiTrackIds?.includes(trackId));
  expect(completed, 'The normal MIDI take journal did not record its destination');
  await discardCompletedRecordingJournals(projectId, []);
  expect(await loadRecordingJournal(completed.sessionId), 'A snapshot without a MIDI receipt cleared the completed journal');
  expect(await projectManager.save('Normal MIDI take'), 'Could not save the normally completed MIDI take');
  expect(!await loadRecordingJournal(completed.sessionId), 'A saved MIDI take retained its completed journal');
  return clip.notes;
}
