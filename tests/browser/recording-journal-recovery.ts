import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { ActiveRecordingJournal, discardCompletedRecordingJournals, listRecordingJournals, loadRecordingJournal } from '../../src/audio/recording/recordingJournal.ts';
import { dbGet } from '../../src/project/db.ts';
import { projectManager, type ProjectRecord } from '../../src/project/ProjectManager.ts';
import { runInterruptedMasterCapture, verifyMasterCaptureRecovery } from './master-recording-journal.ts';
import { runInterruptedMidiCapture, verifyMidiCaptureRecovery } from './midi-recording-journal.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function block(frame: number, frames: number, channel: number): Float32Array {
  const data = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset++) {
    // The unique per-frame ramp catches reordered blocks, gaps and swapped channels without
    // depending on a live microphone or a wall-clock recording schedule.
    data[offset] = channel === 0 ? (frame + offset + 1) / 100_000 : -(frame + offset + 1) / 100_000;
  }
  return data;
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  expect(await projectManager.create('empty', 'Recording Journal Recovery'), 'Could not create the recovery fixture project');
  const projectId = projectManager.currentId;
  expect(!!projectId, 'The recovery fixture project was not assigned an id');

  const sampleRate = audioEngine.ctx.sampleRate;
  const framesPerBlock = 4096;
  const blockCount = 4;
  const sourceTrackId = 'journal-source-track';
  const journal = new ActiveRecordingJournal({
    projectId,
    projectName: projectManager.currentName,
    sampleRate,
    startPos: 0,
    bpm: audioEngine.bpm,
    stepsPerBar: audioEngine.stepsPerBar,
    tracks: [{ trackId: sourceTrackId, name: 'Journal Input', physical: true }],
  });
  await journal.start();
  await projectManager.refreshRecordingJournals();
  expect(!projectManager.recordingJournals.some((entry) => entry.sessionId === journal.sessionId),
    'The recovery UI offered a take that had not reached its record edge');
  expect(!!await loadRecordingJournal(journal.sessionId), 'Listing recoverable takes deleted a still-arming manifest');
  journal.updateStart(0, 0);
  for (let index = 0; index < blockCount; index++) {
    const frame = index * framesPerBlock;
    journal.append(sourceTrackId, frame, [block(frame, framesPerBlock, 0), block(frame, framesPerBlock, 1)]);
  }
  await journal.finish(4);

  const durable = await loadRecordingJournal(journal.sessionId);
  expect(!!durable, 'The active audio journal was not committed to IndexedDB');
  expect(durable!.chunks.length === blockCount, `Expected ${blockCount} durable chunks, found ${durable!.chunks.length}`);
  expect(durable!.manifest.durableThroughFrame === framesPerBlock * blockCount,
    'The durable journal frame boundary did not include the final batch');
  await projectManager.refreshRecordingJournals();
  expect(projectManager.recordingJournals.some((entry) => entry.sessionId === journal.sessionId),
    'Project startup recovery inventory did not expose the interrupted take');

  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    if (this.name === 'audio') throw new DOMException('Simulated unavailable audio storage', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  try {
    expect(!await projectManager.recoverRecordingJournal(journal.sessionId), 'Recovery reported success after a failed audio write');
    expect(!audioEngine.tracks.some((track) => track.name === 'Recovered — Journal Input'), 'A failed audio write left a broken recovery clip');
    expect(!!await loadRecordingJournal(journal.sessionId), 'A failed audio write deleted the only durable take');
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }

  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    if (this.name === 'projects') throw new DOMException('Simulated unavailable project storage', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  try {
    expect(!await projectManager.recoverRecordingJournal(journal.sessionId), 'Recovery reported success after a failed project save');
    expect(!!await loadRecordingJournal(journal.sessionId), 'A failed project save deleted the only durable take');
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }

  expect(await projectManager.recoverRecordingJournal(journal.sessionId),
    'The durable journal could not be rebuilt into the open project');
  expect(audioEngine.tracks.filter((track) => track.name === 'Recovered — Journal Input').length === 1,
    'Retrying recovery after a failed project save created duplicate tracks');
  const recoveredTrack = audioEngine.tracks.find((track) =>
    track.kind === 'audio' && track.name === 'Recovered — Journal Input');
  expect(!!recoveredTrack, 'Journal recovery did not create a new audio track');
  const clip = recoveredTrack!.arrangementClips?.find((entry) => entry.kind === 'audio');
  expect(!!clip && clip.kind === 'audio', 'Journal recovery did not place an audio clip');
  const asset = audioStore.get(clip!.audioId);
  expect(!!asset, 'The recovered audio clip did not resolve to an audio asset');
  const expectedFrames = framesPerBlock * blockCount;
  expect(asset!.buffer.length === expectedFrames,
    `Recovered audio has ${asset!.buffer.length} frames, expected ${expectedFrames}`);
  const left = asset!.buffer.getChannelData(0);
  const right = asset!.buffer.getChannelData(Math.min(1, asset!.buffer.numberOfChannels - 1));
  const boundaries = [0, framesPerBlock - 1, framesPerBlock, expectedFrames - 1];
  for (const frame of boundaries) {
    const expected = (frame + 1) / 100_000;
    expect(Math.abs(left[frame]! - expected) < 1e-7, `Left channel lost or reordered frame ${frame}`);
    expect(Math.abs(right[frame]! + expected) < 1e-7, `Right channel lost or reordered frame ${frame}`);
  }

  const persistedAudio = await dbGet<{ id: string; length: number; channels: ArrayBuffer[] }>('audio', asset!.id);
  expect(persistedAudio?.length === expectedFrames && persistedAudio.channels.length === 2,
    'Recovered audio was not durably persisted before the journal was cleared');
  const saved = await dbGet<ProjectRecord>('projects', projectId!);
  expect(!!saved && saved.audioIds.includes(asset!.id), 'Recovered audio was not saved with the project');
  expect(await projectManager.open(projectId!), 'Could not reopen the project containing recovered audio');
  const reopenedTrack = audioEngine.tracks.find((track) =>
    track.kind === 'audio' && track.name === 'Recovered — Journal Input');
  const reopenedClip = reopenedTrack?.arrangementClips?.find((entry) => entry.kind === 'audio');
  expect(!!reopenedClip && reopenedClip.kind === 'audio' && reopenedClip.audioId === asset!.id,
    `The saved recovered audio clip did not survive a project reopen: ${JSON.stringify(audioEngine.tracks.map((track) => ({
      id: track.id, name: track.name, kind: track.kind,
      clips: (track.arrangementClips ?? []).map((entry) => ({ kind: entry.kind, audioId: entry.kind === 'audio' ? entry.audioId : undefined })),
    })))}`);
  expect(!(await listRecordingJournals()).some((entry) => entry.sessionId === journal.sessionId),
    'The journal was left behind after the recovered audio and project were saved');

  // A normally placed take retains its journal only until the enclosing project record has
  // committed. This direct fixture isolates that cleanup from the crash-recovery path above.
  const completed = new ActiveRecordingJournal({
    projectId,
    projectName: projectManager.currentName,
    sampleRate,
    startPos: 0,
    bpm: audioEngine.bpm,
    stepsPerBar: audioEngine.stepsPerBar,
    tracks: [{ trackId: 'completed-track', name: 'Completed Input', physical: true }],
  });
  await completed.start();
  completed.updateStart(0, 0);
  completed.append('completed-track', 0, [block(0, framesPerBlock, 0), block(0, framesPerBlock, 1)]);
  await completed.finish(1);
  await completed.markCompleted([asset!.id]);
  expect((await listRecordingJournals()).some((entry) => entry.sessionId === completed.sessionId),
    'The completed take journal was not retained until a project save');
  await discardCompletedRecordingJournals(projectId, []);
  expect((await listRecordingJournals()).some((entry) => entry.sessionId === completed.sessionId),
    'A save that omitted the placed audio cleared its completed journal');
  expect(await projectManager.save('Completed take journal cleanup'),
    'Could not confirm the project save that clears a completed take journal');
  expect(!(await listRecordingJournals()).some((entry) => entry.sessionId === completed.sessionId),
    'A completed take journal was not removed after the project save committed');

  const masterFrames = await verifyMasterCaptureRecovery(projectId);
  const midiNotes = await verifyMidiCaptureRecovery(projectId);
  resultNode.dataset.status = 'passed';
  resultNode.textContent = `PASS · recovered ${expectedFrames} stereo input frames after injected storage failures, ${masterFrames} stereo master frames, and ${midiNotes} MIDI notes after renderer removal; restored clips survived project reopen.`;
}

const params = new URL(location.href).searchParams;
const interruptedMasterProject = params.get('interruptedMasterProject');
const interruptedMidiProject = params.get('interruptedMidiProject');
const childCapture = interruptedMasterProject ? runInterruptedMasterCapture(interruptedMasterProject)
  : interruptedMidiProject ? runInterruptedMidiCapture(interruptedMidiProject) : undefined;
const probe = childCapture ? childCapture.then((sessionId) => { resultNode.dataset.sessionId = sessionId; }) : run();
void probe.catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
