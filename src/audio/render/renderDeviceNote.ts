import type { AudioEngine } from '../AudioEngine.ts';
import type { BaseDevice } from '../BaseDevice.ts';
import { audioStore } from '../clips/audioStore.ts';
import { deviceSample, deviceSampleAudioIds, installSampleVoice } from '../deviceSamples.ts';

export function audioPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) {
      if (!Number.isFinite(sample)) throw new Error('The rendered audio contains a non-finite sample.');
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  return peak;
}

/** Captures the selected instrument itself, including project sample assignments and calibration. */
export async function renderDeviceNote(engine: AudioEngine, live: BaseDevice, note: number): Promise<AudioBuffer> {
  if (!engine.isPlayableInstrument(live.type) || !live.isPowered || live.isBypassed) throw new Error('Choose a powered-on instrument to capture.');
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error('The selected note is outside the MIDI range.');
  const ctx = new OfflineAudioContext(2, Math.ceil(engine.ctx.sampleRate * 2.5), engine.ctx.sampleRate);
  const device = engine.instantiateOffline(ctx, live);
  try {
    await audioStore.ensure(deviceSampleAudioIds(live.id));
    if (deviceSample(live.id)) installSampleVoice(device);
    await device.ready?.();
    const left = device.audioOutputs.get('out_l');
    const right = device.audioOutputs.get('out_r');
    if (!left && !right) throw new Error('This instrument has no audio output to capture.');
    if (left && right && left !== right) {
      const merge = ctx.createChannelMerger(2);
      left.connect(merge, 0, 0);
      right.connect(merge, 0, 1);
      merge.connect(ctx.destination);
    } else (left ?? right)!.connect(ctx.destination);
    device.noteOn(note, 0.85, 0);
    device.noteOff(note, 2);
    const buffer = await ctx.startRendering();
    if (audioPeak(buffer) <= 1e-7) throw new Error('The selected instrument produced no audio for this note.');
    return buffer;
  } finally {
    device.dispose();
  }
}
