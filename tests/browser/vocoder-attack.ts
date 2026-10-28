import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function rms(analyser: AnalyserNode): number {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

async function prepareVocoder(name: string, attack: number): Promise<BaseDevice> {
  const device = audioEngine.createDevice('bvx_vocoder', name);
  await device.ready?.();
  device.setParam('bands', 0);
  device.setParam('hold', 0);
  device.setParam('attack', attack);
  device.setParam('decay', 0.3);
  device.setParam('shift', 0);
  device.setParam('hfEmph', 0);
  device.setParam('internalCarrier', 0);
  device.setParam('mix', 1);
  device.setParam('output', 0);
  device.isPowered = true;
  device.isBypassed = false;
  return device;
}

async function run(): Promise<void> {
  const ctx = audioEngine.ctx;
  await audioEngine.resumeContext();
  const fast = await prepareVocoder('Vocoder fast-attack response', 0.001);
  const slow = await prepareVocoder('Vocoder slow-attack response', 0.3);
  const keySource = audioEngine.createDevice('gain_tool', 'Vocoder modulator key');
  await keySource.ready?.();
  keySource.setParam('gain', 0);
  const cables = [
    audioEngine.connectAudio(keySource.id, 'out_l', fast.id, 'sc_l'),
    audioEngine.connectAudio(keySource.id, 'out_r', fast.id, 'sc_r'),
    audioEngine.connectAudio(keySource.id, 'out_l', slow.id, 'sc_l'),
    audioEngine.connectAudio(keySource.id, 'out_r', slow.id, 'sc_r'),
  ];
  if (cables.some((id) => !id)) throw new Error('Could not patch the modulator key into both vocoders');

  const carrier = ctx.createOscillator();
  const carrierLevel = ctx.createGain();
  carrier.frequency.value = 440;
  carrierLevel.gain.value = 0.2;
  carrier.connect(carrierLevel);
  for (const device of [fast, slow]) {
    const left = device.audioInputs.get('in_l');
    const right = device.audioInputs.get('in_r');
    if (!left || !right) throw new Error(`${device.name} has no stereo carrier inputs`);
    carrierLevel.connect(left);
    carrierLevel.connect(right);
  }

  const modulator = ctx.createOscillator();
  const modulatorGate = ctx.createGain();
  modulator.frequency.value = 440;
  modulatorGate.gain.value = 0;
  modulator.connect(modulatorGate);
  const keyLeft = keySource.audioInputs.get('in_l');
  const keyRight = keySource.audioInputs.get('in_r');
  if (!keyLeft || !keyRight) throw new Error('Gain Tool has no stereo modulator inputs');
  modulatorGate.connect(keyLeft);
  modulatorGate.connect(keyRight);

  const fastOutput = fast.audioOutputs.get('out_l');
  const slowOutput = slow.audioOutputs.get('out_l');
  const keyOutput = keySource.audioOutputs.get('out_l');
  if (!fastOutput || !slowOutput || !keyOutput) throw new Error('Vocoder or Gain Tool has no left output');
  const fastMeter = ctx.createAnalyser();
  const slowMeter = ctx.createAnalyser();
  const carrierMeter = ctx.createAnalyser();
  const keyMeter = ctx.createAnalyser();
  fastMeter.fftSize = 1024;
  slowMeter.fftSize = 1024;
  carrierMeter.fftSize = 1024;
  keyMeter.fftSize = 1024;
  const silence = ctx.createGain();
  silence.gain.value = 0;
  fastOutput.connect(fastMeter);
  slowOutput.connect(slowMeter);
  carrierLevel.connect(carrierMeter);
  keyOutput.connect(keyMeter);
  for (const meter of [fastMeter, slowMeter, carrierMeter, keyMeter]) meter.connect(silence);
  silence.connect(ctx.destination);

  try {
    carrier.start();
    modulator.start();
    await pause(120);
    const onset = ctx.currentTime + 0.3;
    modulatorGate.gain.setValueAtTime(0, onset);
    modulatorGate.gain.linearRampToValueAtTime(0.7, onset + 0.005);
    while (ctx.currentTime < onset + 0.06) await pause(2);

    const fastRms = rms(fastMeter);
    const slowRms = rms(slowMeter);
    if (fastRms < 1e-5 || slowRms < 1e-5) {
      const carrierRms = rms(carrierMeter);
      const keyRms = rms(keyMeter);
      throw new Error(`Vocoder output was too quiet to measure at 60 ms (fast ${fastRms.toExponential(2)}, slow ${slowRms.toExponential(2)}; carrier input ${carrierRms.toExponential(2)}, keyed input ${keyRms.toExponential(2)}).`);
    }
    const ratio = fastRms / slowRms;
    if (ratio < 1.5) {
      throw new Error(`Attack did not shape the onset: 1 ms / 300 ms RMS ratio was ${ratio.toFixed(3)} (fast ${fastRms.toFixed(4)}, slow ${slowRms.toFixed(4)}).`);
    }

    fast.setParam('attack', 0.001);
    slow.setParam('attack', 0.001);
    fast.setParam('decay', 0.01);
    slow.setParam('decay', 1);
    await pause(150);
    const gateOff = ctx.currentTime + 0.1;
    modulatorGate.gain.setValueAtTime(0.7, gateOff);
    modulatorGate.gain.linearRampToValueAtTime(0, gateOff + 0.005);
    while (ctx.currentTime < gateOff + 0.1) await pause(2);

    const shortDecayRms = rms(fastMeter);
    const longDecayRms = rms(slowMeter);
    if (shortDecayRms < 1e-5 || longDecayRms < 1e-5) {
      throw new Error(`Vocoder release was too quiet to compare at 100 ms (10 ms ${shortDecayRms.toExponential(2)}, 1 s ${longDecayRms.toExponential(2)}).`);
    }
    const decayRatio = longDecayRms / shortDecayRms;
    if (decayRatio < 1.5) {
      throw new Error(`Decay did not shape the release: 1 s / 10 ms RMS ratio was ${decayRatio.toFixed(3)} (long ${longDecayRms.toFixed(4)}, short ${shortDecayRms.toFixed(4)}).`);
    }
    result!.dataset.status = 'passed';
    result!.textContent = `PASS · Attack: 1 ms vs 300 ms produced ${ratio.toFixed(2)}× output at 60 ms. Decay: 1 s vs 10 ms produced ${decayRatio.toFixed(2)}× output at 100 ms release.`;
  } finally {
    try { carrier.stop(); } catch {}
    try { modulator.stop(); } catch {}
    carrier.disconnect();
    carrierLevel.disconnect();
    modulator.disconnect();
    modulatorGate.disconnect();
    for (const meter of [fastMeter, slowMeter, carrierMeter, keyMeter]) meter.disconnect();
    silence.disconnect();
    for (const device of [fast, slow, keySource]) audioEngine.removeDevice(device.id, true);
  }
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
