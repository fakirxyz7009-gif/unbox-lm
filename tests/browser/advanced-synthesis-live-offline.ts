import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { renderSong } from '../../src/audio/render/renderSong.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import type { DeviceType, SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

function offlinePeak(buffer: AudioBuffer): number {
  let value = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) value = Math.max(value, Math.abs(sample));
  }
  return value;
}

interface Case { type: DeviceType; name: string; }

async function measure({ type, name }: Case): Promise<{ live: number; offline: number }> {
  const device = audioEngine.createDevice(type, name);
  try {
    const track = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id) as SequencerTrack | undefined;
    expect(track, `${name} did not create an instrument track.`);
    await device.ready?.();
    track.arrangementClips = [{
      id: `advanced_${type}`,
      kind: 'notes',
      startBar: 0,
      lengthBars: 1,
      name: `${name} sustained note`,
      notes: [{ step: 0, note: 60, velocity: 0.82, length: 4 }],
    }];
    audioEngine.setBpm(120);
    audioEngine.setPlaybackMode('song_arrangement');
    await audioEngine.startTransport(0);
    let live = 0;
    for (let index = 0; index < 28; index++) {
      await wait(20);
      const levels = audioEngine.getTrackStereoLevels(device.id);
      live = Math.max(live, levels.peakL, levels.peakR);
    }
    audioEngine.stopTransport();
    expect(live > 1e-4, `${name} was silent live (peak ${live.toExponential(2)}).`);

    const channelId = audioEngine.mixer.ownerOf(device.id);
    const offline = await renderSong(audioEngine, {
      startPos: 0,
      endPos: 8,
      sampleRate: audioEngine.ctx.sampleRate,
      tailSec: 0.4,
      onlyChannels: new Set([channelId]),
      stemMode: 'dry',
      masterProcessing: false,
    });
    const rendered = offlinePeak(offline);
    expect(rendered > 1e-4, `${name} was silent in OfflineAudioContext (peak ${rendered.toExponential(2)}).`);
    return { live, offline: rendered };
  } finally {
    audioEngine.stopTransport();
    audioEngine.removeDevice(device.id, true);
  }
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Advanced Synthesis Live Offline Regression');
  await audioEngine.resumeContext();
  const cases: Case[] = [
    { type: 'parsec2', name: 'Additive Spectral Regression' },
    { type: 'grain', name: 'Granular Sample Regression' },
    { type: 'complex1', name: 'West Coast Modular Regression' },
    { type: 'friktion', name: 'Bowed Physical Model Regression' },
    { type: 'objekt', name: 'Resonator Physical Model Regression' },
    { type: 'third_wave', name: 'Wavetable Vector Regression' },
  ];
  const values: string[] = [];
  for (const item of cases) {
    const measured = await measure(item);
    values.push(`${item.type} ${measured.live.toFixed(4)}/${measured.offline.toFixed(4)}`);
  }
  result.dataset.status = 'passed';
  result.textContent = `PASS · advanced synthesis live/offline peaks: ${values.join('; ')}.`;
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
