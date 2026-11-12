import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { AudioTrackDevice } from '../../src/audio/clips/AudioTrackDevice.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { listRecordingJournals, loadRecordingJournal, type LoadedRecordingJournal } from '../../src/audio/recording/recordingJournal.ts';
import { RecordPanel } from '../../src/components/transport/RecordPanel.tsx';
import { dbGet } from '../../src/project/db.ts';
import { projectManager, type ProjectRecord } from '../../src/project/ProjectManager.ts';

const MASTER_NAME = 'Master recording';
const START_STEP = 32;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | undefined | Promise<T | undefined>, description: string): Promise<T> {
  const end = performance.now() + 10_000;
  while (performance.now() < end) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}. ${audioEngine.recorder.message ?? ''}`);
}

async function startCapture() {
  audioEngine.seekToSongPosition(START_STEP);
  const sourceTrack = audioEngine.createAudioTrack('Master journal signal');
  const device = audioEngine.devices.get(sourceTrack.deviceId);
  expect(device instanceof AudioTrackDevice, 'Master test signal did not get an audio-track device');
  const ctx = audioEngine.ctx;
  const merger = ctx.createChannelMerger(2);
  const oscillators = [220, 440].map((frequency, channel) => {
    const tone = ctx.createOscillator();
    tone.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    tone.connect(gain).connect(merger, 0, channel);
    tone.start();
    return tone;
  });
  merger.connect(device.clipInput);
  const mount = document.createElement('div');
  document.body.append(mount);
  const root = createRoot(mount);
  root.render(createElement(RecordPanel, { onClose: () => {} }));
  async function button(label: string): Promise<HTMLButtonElement> {
    return waitFor(() => Array.from(mount.querySelectorAll('button')).find((node) => node.textContent?.includes(label)), label);
  }
  (await button('Capture master output')).click();
  await button('Stop master capture');
  expect(audioEngine.recorder.recordingMaster, 'Record panel did not start a master capture');
  return {
    stop: async () => {
      (await button('Stop master capture')).click();
      await button('Capture master output');
      expect(!audioEngine.recorder.busy, 'Normal master stop did not finish finalization');
    },
    dispose: () => {
      oscillators.forEach((tone) => tone.stop());
      merger.disconnect();
      root.unmount();
      mount.remove();
    },
  };
}

async function activeJournal(projectId: string): Promise<LoadedRecordingJournal> {
  const manifest = await waitFor(async () => (await listRecordingJournals()).find((entry) =>
    entry.projectId === projectId && !entry.finalizingAt && !entry.completedAt && entry.recordEdgeConfirmed &&
    entry.startFrame !== null && (entry.durableThroughFrame ?? 0) - entry.startFrame >= 8192 &&
    entry.tracks.length === 1 && entry.tracks[0].name === MASTER_NAME,
  ), 'committed stereo frames from the active master take');
  const loaded = await loadRecordingJournal(manifest.sessionId);
  expect(loaded, 'Active master manifest could not be reloaded from IndexedDB');
  expect(loaded.manifest.startPos === START_STEP, 'Master capture did not preserve its starting song position');
  expect(!loaded.manifest.tracks[0].physical, 'Master capture should not use physical-input latency compensation');
  return loaded;
}

function verifyPcm(journal: LoadedRecordingJournal, audio?: AudioBuffer): number {
  const { manifest, chunks } = journal;
  expect(manifest.startFrame !== null && manifest.durableThroughFrame !== undefined, 'The master journal is missing frame boundaries');
  let frame = manifest.startFrame;
  let framesWithBothChannels = 0;
  const crossings = [0, 0];
  const prior = [0, 0];
  for (const chunk of chunks) {
    expect(chunk.frame === frame, `Master PCM has a gap at ${frame}; next block starts at ${chunk.frame}`);
    expect(chunk.trackId === manifest.tracks[0].trackId && chunk.channels.length === 2, 'Master journal block lost its track or a channel');
    const [left, right] = chunk.channels.map((channel) => new Float32Array(channel));
    expect(left.length === right.length && left.length > 0, 'Master stereo block lengths do not match');
    const offset = frame - manifest.startFrame;
    for (let index = 0; index < left.length; index++) {
      if (Math.abs(left[index]) > 0.01 && Math.abs(right[index]) > 0.01) framesWithBothChannels++;
      if (left[index] > 0 && prior[0] <= 0) crossings[0]++;
      if (right[index] > 0 && prior[1] <= 0) crossings[1]++;
      prior[0] = left[index];
      prior[1] = right[index];
    }
    if (audio) {
      expect(audio.numberOfChannels === 2 && audio.length >= offset + left.length, 'Master audio is missing committed frames');
      expect(audio.getChannelData(0).subarray(offset, offset + left.length).every((value, index) => value === left[index]), 'Restored left channel differs from its committed PCM');
      expect(audio.getChannelData(1).subarray(offset, offset + right.length).every((value, index) => value === right[index]), 'Restored right channel differs from its committed PCM');
    }
    frame += left.length;
  }
  expect(frame === manifest.durableThroughFrame, 'Master journal boundary differs from the committed stereo data');
  expect(framesWithBothChannels > 1000, 'Master journal did not contain the audible fixture on both channels');
  expect(crossings[0] > 10 && crossings[1] > crossings[0] * 1.7 && crossings[1] < crossings[0] * 2.3,
    `Master journal did not preserve separate 220 Hz and 440 Hz channels (${crossings.join(', ')} positive crossings)`);
  return frame - manifest.startFrame;
}

/** Runs in a separate renderer document. The parent removes this frame without calling Stop. */
export async function runInterruptedMasterCapture(projectId: string): Promise<string> {
  projectManager.autosave = false;
  expect(await projectManager.open(projectId), 'The interrupted master fixture could not load its saved project');
  await startCapture();
  const journal = await activeJournal(projectId);
  verifyPcm(journal);
  expect(audioEngine.recorder.recordingMaster, 'The interrupted fixture had already stopped');
  return journal.manifest.sessionId;
}

export async function verifyMasterCaptureRecovery(projectId: string): Promise<number> {
  const capture = await startCapture();
  try {
    const active = await activeJournal(projectId);
    expect(!await projectManager.save(), 'Saving while the master take was active should be refused');
    audioEngine.seekToSongPosition(START_STEP + 16);
    await capture.stop();
    const completed = await loadRecordingJournal(active.manifest.sessionId);
    expect(completed?.manifest.completedAt, 'Normal master stop did not mark its journal completed');
    const track = audioEngine.tracks.find((entry) => entry.id === completed.manifest.tracks[0].trackId);
    const clip = track?.arrangementClips?.find((entry) => entry.kind === 'audio');
    expect(track?.mute && clip?.audioId, 'Normal master stop did not place a muted audio track');
    expect(clip.startBar === START_STEP / completed.manifest.stepsPerBar, 'Normal master clip was not placed at its capture start');
    expect(completed.manifest.placedAudioIds?.includes(clip.audioId), 'Completed master journal did not retain its placed asset ID');
    const asset = audioStore.get(clip.audioId);
    expect(asset, 'Normal master stop did not register its audio');
    verifyPcm(completed, asset.buffer);
    expect(await projectManager.save(), 'Could not save the normally completed master take');
    expect(!await loadRecordingJournal(active.manifest.sessionId), 'A saved master take did not clear its completed journal');
  } finally {
    if (audioEngine.recorder.recordingMaster) await capture.stop();
    capture.dispose();
  }

  const frame = document.createElement('iframe');
  const fixture = new URL(location.href);
  fixture.searchParams.set('interruptedMasterProject', projectId);
  frame.src = fixture.href;
  document.body.append(frame);
  let sessionId: string;
  try {
    sessionId = await waitFor(() => {
      const result = frame.contentDocument?.querySelector<HTMLPreElement>('#result');
      if (result?.dataset.status === 'failed') throw new Error(result.textContent ?? 'Interrupted master fixture failed');
      return result?.dataset.sessionId;
    }, 'the interrupted renderer to commit its live master recording');
  } finally {
    frame.remove();
  }

  const interrupted = await loadRecordingJournal(sessionId);
  expect(interrupted && !interrupted.manifest.finalizingAt && !interrupted.manifest.completedAt,
    'The master recording did not survive renderer removal as an active journal');
  expect(await projectManager.recoverRecordingJournal(sessionId), 'Recovery could not restore the interrupted master recording');
  const recovered = audioEngine.tracks.filter((track) => track.name === `Recovered — ${MASTER_NAME}`);
  const clip = recovered[0]?.arrangementClips?.find((entry) => entry.kind === 'audio');
  expect(recovered.length === 1 && recovered[0].mute && clip?.audioId, 'Recovery did not place one muted master track');
  expect(clip.startBar === START_STEP / interrupted.manifest.stepsPerBar, 'Recovered master clip was not placed at its capture start');
  const asset = audioStore.get(clip.audioId);
  expect(asset, 'The recovered master clip has no decoded audio');
  const frames = verifyPcm(interrupted, asset.buffer);
  const saved = await dbGet<ProjectRecord>('projects', projectId);
  expect(saved?.audioIds.includes(asset.id), 'The recovered master clip was not saved with its project');
  expect(await projectManager.open(projectId), 'Could not reopen the recovered master project');
  expect(audioEngine.tracks.some((track) => track.mute && track.arrangementClips?.some((entry) => entry.audioId === asset.id)),
    'Recovered master clip or mute did not survive reopen');
  expect(!await loadRecordingJournal(sessionId), 'The recovered master journal was not cleared after save');
  return frames;
}
