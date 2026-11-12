import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { renderSong } from '../../src/audio/render/renderSong.ts';
import { SpecDevice } from '../../src/audio/spec/SpecDevice.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface ParityCase {
  type: string;
  label: string;
  note: number;
  velocity: number;
  effect?: {
    type: string;
    params: Record<string, number>;
    sidechainKey?: { type: string; note: number; velocity: number };
  };
}

async function measureParity(test: ParityCase): Promise<{
  livePeak: number;
  offlinePeak: number;
  liveRms: number;
  offlineRms: number;
  rmsDifference: number;
  gainReduction?: number;
}> {
  const engine = audioEngine;
  const device = engine.createDevice(test.type as Parameters<typeof engine.createDevice>[0], test.label);
  let effectDevice: ReturnType<typeof engine.createDevice> | null = null;
  let keyDevice: ReturnType<typeof engine.createDevice> | null = null;
  try {
    const track = engine.tracks.find((candidate) => candidate.deviceId === device.id) as SequencerTrack | undefined;
    if (!track) throw new Error(`${test.label} did not create an instrument track.`);
    await device.ready?.();
    device.setParam('vary', 0);
    device.setParam('punch', 0);
    device.setParam('drive', 0);
    device.setParam('tone', 20_000);
    if (test.effect) {
      effectDevice = engine.createDevice(test.effect.type as Parameters<typeof engine.createDevice>[0], `${test.label} · ${test.effect.type}`);
      await effectDevice.ready?.();
      for (const [key, value] of Object.entries(test.effect.params)) effectDevice.setParam(key, value);
      if (!engine.insertEffectOnTrack(effectDevice.id, device.id)) {
        throw new Error(`${test.label} could not insert ${test.effect.type} on its rack output path.`);
      }
      if (test.effect.sidechainKey) {
        keyDevice = engine.createDevice(test.effect.sidechainKey.type as Parameters<typeof engine.createDevice>[0], `${test.label} · sidechain key`);
        await keyDevice.ready?.();
        const keyTrack = engine.tracks.find((candidate) => candidate.deviceId === keyDevice!.id) as SequencerTrack | undefined;
        if (!keyTrack) throw new Error(`${test.label} sidechain key did not create an instrument track.`);
        const leftCable = engine.connectAudio(keyDevice.id, 'out_l', effectDevice.id, 'sc_l');
        const rightCable = engine.connectAudio(keyDevice.id, 'out_r', effectDevice.id, 'sc_r');
        if (!leftCable || !rightCable) throw new Error(`${test.label} could not patch the sidechain key into both compressor channels.`);
        keyTrack.arrangementClips = [{
          id: `sidechain_key_${test.type.replace(/[^a-z0-9]+/gi, '_')}`,
          kind: 'notes',
          startBar: 0,
          lengthBars: 1,
          name: 'Deterministic sidechain key',
          notes: [{ step: 0, note: test.effect.sidechainKey.note, velocity: test.effect.sidechainKey.velocity, length: 16 }],
        }];
      }
    }
    track.arrangementClips = [{
      id: `live_offline_${test.type.replace(/[^a-z0-9]+/gi, '_')}`,
      kind: 'notes',
      startBar: 0,
      lengthBars: 1,
      name: 'Deterministic parity note',
      notes: [{ step: 0, note: test.note, velocity: test.velocity, length: 4 }],
    }];
    engine.setBpm(120);
    engine.setPlaybackMode('song_arrangement');
    await engine.startTransport(0);

    let livePeak = 0;
    let liveRmsEnergy = 0;
    let deepestGainReduction = 0;
    for (let i = 0; i < 32; i++) {
      await pause(20);
      const levels = engine.getTrackStereoLevels(device.id);
      livePeak = Math.max(livePeak, levels.peakL, levels.peakR);
      liveRmsEnergy += (levels.rmsL ** 2 + levels.rmsR ** 2) / 2;
      if (effectDevice instanceof SpecDevice && test.effect?.sidechainKey) {
        deepestGainReduction = Math.min(deepestGainReduction, effectDevice.meter().gr ?? 0);
      }
    }
    const gainReduction = effectDevice instanceof SpecDevice && test.effect?.sidechainKey ? deepestGainReduction : undefined;
    engine.stopTransport();
    if (livePeak <= 1e-4) throw new Error(`${test.label} live output was silent (peak ${livePeak.toExponential(2)}).`);
    if (test.effect?.sidechainKey && (gainReduction === undefined || gainReduction > -2)) {
      throw new Error(`${test.label} sidechain cable produced only ${gainReduction?.toFixed(2) ?? 'no'} dB of measured gain reduction.`);
    }

    const channelId = engine.mixer.ownerOf(device.id);
    const offline = await renderSong(engine, {
      startPos: 0,
      endPos: 8,
      sampleRate: engine.ctx.sampleRate,
      tailSec: 0.8,
      onlyChannels: new Set([channelId]),
      stemMode: 'dry',
      masterProcessing: false,
    });
    let offlinePeak = 0;
    for (let channel = 0; channel < offline.numberOfChannels; channel++) {
      for (const sample of offline.getChannelData(channel)) offlinePeak = Math.max(offlinePeak, Math.abs(sample));
    }
    if (offlinePeak <= 1e-4) throw new Error(`${test.label} offline output was silent (peak ${offlinePeak.toExponential(2)}).`);
    const liveRms = Math.sqrt(liveRmsEnergy / 32);
    const comparisonFrames = Math.min(offline.length, Math.floor(engine.ctx.sampleRate * 0.64));
    let squareSum = 0;
    for (let channel = 0; channel < offline.numberOfChannels; channel++) {
      const samples = offline.getChannelData(channel);
      for (let i = 0; i < comparisonFrames; i++) squareSum += samples[i]! ** 2;
    }
    const offlineRms = Math.sqrt(squareSum / Math.max(1, comparisonFrames * offline.numberOfChannels));
    const rmsDifference = Math.abs(offlineRms - liveRms) / Math.max(offlineRms, liveRms);
    if (rmsDifference > 0.2) {
      throw new Error(`${test.label} live/offline 640 ms RMS differs by ${(rmsDifference * 100).toFixed(1)}% (live ${liveRms.toFixed(4)}, offline ${offlineRms.toFixed(4)}; peaks ${livePeak.toFixed(4)} / ${offlinePeak.toFixed(4)}).`);
    }
    return { livePeak, offlinePeak, liveRms, offlineRms, rmsDifference, gainReduction };
  } finally {
    engine.stopTransport();
    if (keyDevice) engine.removeDevice(keyDevice.id, true);
    if (effectDevice) engine.removeDevice(effectDevice.id, true);
    engine.removeDevice(device.id, true);
  }
}

async function run(): Promise<void> {
  await audioEngine.resumeContext();
  const cases: ParityCase[] = [
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ', note: 60, velocity: 0.8 },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ + Gain Tool', note: 60, velocity: 0.8, effect: { type: 'gain_tool', params: { gain: 6 } } },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ + Masterline EQ', note: 60, velocity: 0.8, effect: { type: 'mclass_eq', params: { hiGain: 6 } } },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ + Masterline Compressor', note: 60, velocity: 0.8, effect: { type: 'mclass_compressor', params: { threshold: -30 } } },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Sidechain Compressor', note: 60, velocity: 0.8, effect: { type: 'mclass_compressor', params: { threshold: -36, ratio: 20, knee: 0, attack: 1, release: 100, makeup: 0, adapt: 0, sidechain: 1 }, sidechainKey: { type: 'subtractor', note: 48, velocity: 1 } } },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ + Delay Line', note: 60, velocity: 0.8, effect: { type: 'ddl1', params: { unit: 1, ms: 250, feedback: 0.25, mix: 0.3 } } },
    { type: 'rec_vcsl_pipe_organ', label: 'Live Offline Parity Organ + Reverb', note: 60, velocity: 0.8, effect: { type: 'rv7', params: { mix: 0.3 } } },
    { type: 'rec_virtuosity_drums', label: 'Live Offline Parity Snare Roll', note: 96, velocity: 0.85 },
  ];
  const results: string[] = [];
  for (const test of cases) {
    const measured = await measureParity(test);
    const path = test.effect ? `${test.type} → ${test.effect.type}` : test.type;
    const gr = measured.gainReduction === undefined ? '' : `, gain reduction ${measured.gainReduction.toFixed(2)} dB`;
    results.push(`${path} MIDI ${test.note}: peak ${measured.livePeak.toFixed(4)}/${measured.offlinePeak.toFixed(4)}, 640 ms RMS ${measured.liveRms.toFixed(4)}/${measured.offlineRms.toFixed(4)}, RMS delta ${(measured.rmsDifference * 100).toFixed(2)}%${gr}`);
  }
  resultNode.dataset.status = 'passed';
  resultNode.textContent = `PASS - ${results.join('; ')}.`;
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
