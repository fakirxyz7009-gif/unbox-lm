import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { renderSong } from '../../src/audio/render/renderSong.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

function peak(buffer: AudioBuffer, fromSec = 0, toSec = buffer.duration): number {
  const start = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.ceil(toSec * buffer.sampleRate));
  let value = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let index = start; index < end; index++) value = Math.max(value, Math.abs(samples[index]!));
  }
  return value;
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Granular Live Offline Regression');
  const grain = audioEngine.createDevice('grain', 'Granular Export Regression');
  const track = audioEngine.tracks.find((candidate) => candidate.deviceId === grain.id) as SequencerTrack | undefined;
  expect(track, 'Granular device did not create an instrument track.');
  await grain.ready?.();
  grain.setParam('density', 24);
  grain.setParam('grainSize', 0.08);
  grain.setParam('attack', 0.01);
  grain.setParam('release', 0.08);
  track.arrangementClips = [{
    id: 'granular_live_offline_note',
    kind: 'notes',
    startBar: 0,
    lengthBars: 1,
    name: 'Granular sustained note',
    notes: [{ step: 0, note: 60, velocity: 0.82, length: 4 }],
  }];
  audioEngine.setBpm(120);
  audioEngine.setPlaybackMode('song_arrangement');
  await audioEngine.resumeContext();

  // A held live key must keep producing grains even when transport is stopped.
  // Granular scheduling must go through AudioEngine's shared worker clock, not
  // a device-owned window interval.
  audioEngine.stopTransport();
  const originalInterval = window.setInterval;
  let deviceIntervals = 0;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    deviceIntervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;
  grain.noteOn(60, 0.82, audioEngine.ctx.currentTime + 0.025);
  let stoppedPeak = 0;
  for (let index = 0; index < 20; index++) {
    await wait(20);
    const levels = audioEngine.getTrackStereoLevels(grain.id);
    stoppedPeak = Math.max(stoppedPeak, levels.peakL, levels.peakR);
  }
  grain.noteOff(60, audioEngine.ctx.currentTime);
  window.setInterval = originalInterval;
  expect(stoppedPeak > 1e-4, `Granular device was silent while transport was stopped (peak ${stoppedPeak.toExponential(2)}).`);
  expect(deviceIntervals === 0, `Granular device created ${deviceIntervals} window interval(s) instead of using the shared scheduler.`);

  await audioEngine.startTransport(0);
  let livePeak = 0;
  for (let index = 0; index < 36; index++) {
    await wait(20);
    const levels = audioEngine.getTrackStereoLevels(grain.id);
    livePeak = Math.max(livePeak, levels.peakL, levels.peakR);
  }
  // A pause is different from a hard stop: a held live note must continue
  // past the original 150 ms transport look-ahead after the worker hands off.
  grain.noteOn(67, 0.8, audioEngine.ctx.currentTime + 0.02);
  await wait(70);
  audioEngine.pauseTransport();
  await wait(240);
  let pausedPeak = 0;
  for (let index = 0; index < 10; index++) {
    await wait(20);
    const levels = audioEngine.getTrackStereoLevels(grain.id);
    pausedPeak = Math.max(pausedPeak, levels.peakL, levels.peakR);
  }
  grain.noteOff(67, audioEngine.ctx.currentTime);
  audioEngine.stopTransport();
  expect(livePeak > 1e-4, `Granular device was silent live (peak ${livePeak.toExponential(2)}).`);
  expect(pausedPeak > 1e-4, `Granular device went silent after pausing transport (peak ${pausedPeak.toExponential(2)}).`);

  const channelId = audioEngine.mixer.ownerOf(grain.id);
  const offline = await renderSong(audioEngine, {
    startPos: 0,
    endPos: 8,
    sampleRate: audioEngine.ctx.sampleRate,
    tailSec: 0.4,
    onlyChannels: new Set([channelId]),
    stemMode: 'dry',
    masterProcessing: false,
  });
  const offlinePeak = peak(offline, 0, 0.9);
  expect(offlinePeak > 1e-4, `Granular device was silent in OfflineAudioContext (peak ${offlinePeak.toExponential(2)}).`);

  result.dataset.status = 'passed';
  result.textContent = `PASS · granular source rendered stopped-live (${stoppedPeak.toFixed(4)}), transport-live (${livePeak.toFixed(4)}), paused-live (${pausedPeak.toFixed(4)}) and offline (${offlinePeak.toFixed(4)}).`;
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
