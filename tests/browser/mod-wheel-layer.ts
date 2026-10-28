import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { SpecDevice } from '../../src/audio/spec/SpecDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function measureRms(deviceId: string): Promise<number> {
  let rms = 0;
  for (let i = 0; i < 10; i++) {
    await pause(20);
    const levels = audioEngine.getTrackStereoLevels(deviceId);
    rms = Math.max(rms, levels.rmsL, levels.rmsR);
  }
  return rms;
}

async function run(): Promise<void> {
  const engine = audioEngine;
  let deviceId: string | null = null;
  let noteOn = false;
  const previousMidiTarget = engine.midiTargetDeviceId;
  try {
    const packResponse = await fetch('/instruments/virtuosity-drums/instrument.json');
    const pack = await packResponse.json() as {
      lanes?: { note: number; name: string }[];
      zones?: { lokey: number; hikey: number; loop?: [number, number]; modWheelFade?: unknown }[];
    };
    const rollLayers = pack.zones?.filter((zone) => zone.lokey <= 96 && zone.hikey >= 96 && zone.modWheelFade) ?? [];
    if (!packResponse.ok || rollLayers.length !== 15 || rollLayers.some((zone) => !zone.loop)) {
      throw new Error(`The shipped kit has ${rollLayers.length} CC1 roll layers; expected 15 looped recorded layers.`);
    }
    if (!pack.lanes?.some((lane) => lane.note === 96 && lane.name === 'Snare Roll')) {
      throw new Error('The shipped kit has no Snare Roll pad at MIDI 96.');
    }
    await engine.resumeContext();
    const drums = engine.createDevice('rec_virtuosity_drums', 'CC1 Roll Probe');
    if (!(drums instanceof SpecDevice)) throw new Error('Virtuosity Drums did not use the multisample spec engine.');
    deviceId = drums.id;
    engine.midiTargetDeviceId = drums.id;
    await drums.ready?.();
    drums.setParam('vary', 0);
    drums.setParam('punch', 0);
    const dispatchMidi = (engine as unknown as { handleMidiMessage(data: Uint8Array): void }).handleMidiMessage;
    drums.noteOn(96, 0.85, engine.ctx.currentTime + 0.03);
    noteOn = true;

    const sourceDefaultPeak = await measureRms(drums.id);
    if (sourceDefaultPeak <= 0.001) throw new Error(`The source default CC1 layer was silent (RMS ${sourceDefaultPeak.toExponential(2)}).`);
    const voicesBefore = drums.engine.meter?.().voices ?? 0;
    const scheduledTargets: number[] = [];
    const originalSchedule = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (this: AudioParam, value: number, startTime: number, timeConstant: number): AudioParam {
      scheduledTargets.push(value);
      return originalSchedule.call(this, value, startTime, timeConstant);
    };
    try {
      dispatchMidi.call(engine, new Uint8Array([0xb0, 1, 127]));
    } finally {
      AudioParam.prototype.setTargetAtTime = originalSchedule;
    }
    if (drums.cvValue('__mod') < 0.99) throw new Error(`The mod-wheel input did not reach the device (value ${drums.cvValue('__mod')}).`);
    if (!scheduledTargets.includes(0) || !scheduledTargets.includes(1)) throw new Error(`The held recorded layers did not receive CC1 gain targets: ${scheduledTargets.join(',')}.`);
    const highLayerPeak = await measureRms(drums.id);
    if (Math.abs(highLayerPeak - sourceDefaultPeak) < 0.0005) {
      throw new Error(`CC1 did not audibly change the held roll: RMS before ${sourceDefaultPeak.toFixed(4)}, after ${highLayerPeak.toFixed(4)}, voices ${voicesBefore}, modulation ${drums.cvValue('__mod')}.`);
    }
    if (voicesBefore < 15) throw new Error(`Only ${voicesBefore} recorded roll voices were held; expected all 15 layer/mic voices.`);

    drums.noteOff(96, engine.ctx.currentTime);
    await pause(900);
    const voicesAfterRelease = drums.engine.meter?.().voices ?? 0;
    if (voicesAfterRelease !== 0) throw new Error(`The held snare roll did not release after key-up (${voicesAfterRelease} voices remain).`);
    noteOn = false;

    drums.setParam('decay', 0.05);
    drums.noteOn(96, 0.85, engine.ctx.currentTime + 0.03);
    noteOn = true;
    await pause(900);
    const voicesAfterLength = drums.engine.meter?.().voices ?? 0;
    if (voicesAfterLength !== 0) throw new Error(`The Snare Roll Length control did not stop its looped voices (${voicesAfterLength} voices remain).`);
    noteOn = false;

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS - recorded MIDI 96 snare roll used ${voicesBefore} looped voices; CC1 changed RMS ${sourceDefaultPeak.toFixed(4)} → ${highLayerPeak.toFixed(4)} (${(20 * Math.log10(highLayerPeak / sourceDefaultPeak)).toFixed(1)} dB); key-up released the roll and Length truncated the next loop.`;
  } finally {
    if (noteOn && deviceId) engine.devices.get(deviceId)?.noteOff(96);
    if (deviceId) engine.removeDevice(deviceId, true);
    engine.midiTargetDeviceId = previousMidiTarget;
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
