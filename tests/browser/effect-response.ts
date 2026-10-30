import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';
import { RV7000Device } from '../../src/audio/devices/RV7000Device.ts';
import { SpecDevice } from '../../src/audio/spec/SpecDevice.ts';
import { cabinetImpulse } from '../../src/audio/spec/dsp.ts';
import { ensureDynamicsWorklet } from '../../src/audio/spec/worklets.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;
const FFT_SIZE = 16_384;

interface ResponsePoint {
  label: string;
  bin: number;
  minDb: number;
  maxDb: number;
}

interface EqCase {
  type: string;
  name: string;
  params: Record<string, number>;
  points: ResponsePoint[];
}

const EQ_CASES: EqCase[] = [
  {
    type: 'peq2',
    name: 'PQ-2 bell boost',
    params: { aFreq: 1_000, aQ: 1, aGain: 12, bOn: 0 },
    points: [
      { label: '1 kHz center', bin: 341, minDb: 10, maxDb: 14 },
      { label: '120 Hz off-band', bin: 41, minDb: -1.5, maxDb: 1.5 },
      { label: '8 kHz off-band', bin: 2_731, minDb: -1.5, maxDb: 1.5 },
    ],
  },
  {
    type: 'mclass_eq',
    name: 'Masterline 30 Hz low cut',
    params: { loCut: 1 },
    points: [
      { label: '17.6 Hz below cutoff', bin: 6, minDb: -24, maxDb: -6.5 },
      { label: '205 Hz above cutoff', bin: 70, minDb: -1.5, maxDb: 1.5 },
    ],
  },
  {
    type: 'channel_eq',
    name: 'Channel EQ low shelf',
    params: { lfGain: 12, lfFreq: 100, lfBell: 0 },
    points: [
      { label: '59 Hz below shelf', bin: 20, minDb: 9, maxDb: 13.5 },
      { label: '1 kHz above shelf', bin: 341, minDb: -1.5, maxDb: 1.5 },
    ],
  },
  {
    type: 'channel_eq',
    name: 'Channel EQ 120 Hz high-pass',
    params: { hpf: 120 },
    points: [
      { label: '59 Hz below cutoff', bin: 20, minDb: -36, maxDb: -9 },
      { label: '501 Hz above cutoff', bin: 171, minDb: -1.5, maxDb: 1.5 },
    ],
  },
  {
    type: 'pultec_eqp1a',
    name: 'Tubeshelf low boost',
    params: { lowFreq: 2, lowBoost: 8, lowAtten: 0, highBoost: 0, highAtten: 0, tube: 0 },
    points: [
      { label: '20.5 Hz low shelf', bin: 7, minDb: 8, maxDb: 13 },
      { label: '1 kHz off-band', bin: 341, minDb: -1.5, maxDb: 1.5 },
    ],
  },
];

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function rms(analyser: AnalyserNode): number {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

async function prepareDevice(type: string, label: string): Promise<BaseDevice> {
  const device = audioEngine.createDevice(type as Parameters<typeof audioEngine.createDevice>[0], label);
  await device.ready?.();
  if ('mix' in device.params) device.setParam('mix', 1);
  if ('output' in device.params) device.setParam('output', 0);
  device.isPowered = true;
  device.isBypassed = false;
  return device;
}

async function probeEq(test: EqCase, silence: GainNode): Promise<string> {
  const ctx = audioEngine.ctx;
  const device = await prepareDevice(test.type, `EQ response · ${test.name}`);
  const input = device.audioInputs.get('in_l');
  const output = device.audioOutputs.get('out_l');
  if (!input || !output) throw new Error(`${test.name} has no left audio input/output`);

  const tone = ctx.createOscillator();
  const level = ctx.createGain();
  const reference = ctx.createAnalyser();
  const response = ctx.createAnalyser();
  reference.fftSize = FFT_SIZE;
  response.fftSize = FFT_SIZE;
  level.gain.value = 0.08;
  tone.connect(level);
  level.connect(input);
  level.connect(reference);
  reference.connect(silence);
  output.connect(response);
  response.connect(silence);

  const measured: string[] = [];
  try {
    for (const [key, value] of Object.entries(test.params)) device.setParam(key, value);
    tone.frequency.value = (ctx.sampleRate * test.points[0]!.bin) / FFT_SIZE;
    tone.start(ctx.currentTime + 0.025);
    for (const point of test.points) {
      tone.frequency.setTargetAtTime((ctx.sampleRate * point.bin) / FFT_SIZE, ctx.currentTime, 0.005);
      await pause((FFT_SIZE / ctx.sampleRate) * 1_000 + 100);
      const inputRms = rms(reference);
      const outputRms = rms(response);
      if (inputRms < 0.02 || outputRms < 1e-6) {
        throw new Error(`${test.name} ${point.label} had no measurable output (input ${inputRms.toExponential(2)}, output ${outputRms.toExponential(2)})`);
      }
      const gainDb = 20 * Math.log10(outputRms / inputRms);
      if (gainDb < point.minDb || gainDb > point.maxDb) {
        throw new Error(`${test.name} ${point.label} measured ${gainDb.toFixed(2)} dB; expected ${point.minDb} to ${point.maxDb} dB`);
      }
      measured.push(`${point.label} ${gainDb.toFixed(2)} dB`);
    }
  } finally {
    try { tone.stop(); } catch {}
    tone.disconnect();
    level.disconnect();
    reference.disconnect();
    response.disconnect();
    audioEngine.removeDevice(device.id, true);
  }
  return `${test.name}: ${measured.join(', ')}`;
}

async function probeRv7000Size(): Promise<string> {
  const device = await prepareDevice('rv7000', 'RV7000 size response');
  const node = Reflect.get(device, 'convolver') as unknown;
  if (!(node instanceof ConvolverNode)) throw new Error('RV7000 has no convolution node');
  const duration = () => {
    if (!node.buffer) throw new Error('RV7000 impulse response was cleared unexpectedly');
    return node.buffer.duration;
  };
  const normal = duration();
  try {
    device.setParam('size', 0.1);
    const small = duration();
    device.setParam('size', 1);
    const large = duration();
    if (!(small < normal && normal < large)) {
      throw new Error(`RV7000 Size did not scale the room response (${small.toFixed(2)} < ${normal.toFixed(2)} < ${large.toFixed(2)} seconds expected)`);
    }
    return `RV7000 Size scales impulse duration ${small.toFixed(2)} / ${normal.toFixed(2)} / ${large.toFixed(2)} s`;
  } finally {
    audioEngine.removeDevice(device.id, true);
  }
}

function rv7000Impulse(device: RV7000Device): AudioBuffer {
  const convolver = Reflect.get(device, 'convolver') as unknown;
  if (!(convolver instanceof ConvolverNode) || !convolver.buffer) throw new Error('RV7000 has no impulse response');
  return convolver.buffer;
}

function probeRv7000Determinism(): string {
  const live = new RV7000Device(audioEngine.ctx, 'rv7000_deterministic_live');
  const offlineContext = new OfflineAudioContext(2, 1, audioEngine.ctx.sampleRate);
  const offline = new RV7000Device(offlineContext as unknown as AudioContext, 'rv7000_deterministic_offline');
  try {
    const liveImpulse = rv7000Impulse(live);
    const offlineImpulse = rv7000Impulse(offline);
    if (liveImpulse.length !== offlineImpulse.length) {
      throw new Error(`RV7000 impulse length changed between contexts (${liveImpulse.length} vs ${offlineImpulse.length})`);
    }
    for (let channel = 0; channel < liveImpulse.numberOfChannels; channel++) {
      const liveData = liveImpulse.getChannelData(channel);
      const offlineData = offlineImpulse.getChannelData(channel);
      for (let i = 0; i < liveData.length; i++) {
        if (Math.abs(liveData[i]! - offlineData[i]!) > 1e-8) {
          throw new Error(`RV7000 impulse changed at channel ${channel}, frame ${i} between live and offline contexts`);
        }
      }
    }
    return `RV7000 impulse is deterministic across independent live/offline device graphs (${liveImpulse.length} frames)`;
  } finally {
    live.dispose();
    offline.dispose();
  }
}

function probeCabinetImpulseDeterminism(): string {
  const ctx = audioEngine.ctx;
  const live = cabinetImpulse(ctx, '4×12');
  const offline = cabinetImpulse(new OfflineAudioContext(2, 1, ctx.sampleRate), '4×12');
  const alternate = cabinetImpulse(ctx, '1×12');
  if (live.length !== offline.length || live.numberOfChannels !== offline.numberOfChannels) {
    throw new Error(`4×12 cabinet shape changed between contexts (${live.numberOfChannels}ch/${live.length} vs ${offline.numberOfChannels}ch/${offline.length})`);
  }
  let distinctSamples = 0;
  for (let channel = 0; channel < live.numberOfChannels; channel++) {
    const liveData = live.getChannelData(channel);
    const offlineData = offline.getChannelData(channel);
    const alternateData = alternate.getChannelData(channel);
    for (let i = 0; i < liveData.length; i++) {
      if (Math.abs(liveData[i]! - offlineData[i]!) > 1e-8) {
        throw new Error(`4×12 cabinet impulse changed at channel ${channel}, frame ${i} between live and offline contexts`);
      }
      if (Math.abs(liveData[i]! - alternateData[i]!) > 1e-5) distinctSamples++;
    }
  }
  if (distinctSamples < 64) throw new Error(`4×12 and 1×12 cabinet impulses were not materially distinct (${distinctSamples} differing samples)`);
  return `Cabinet IR is deterministic across live/offline contexts; 4×12 and 1×12 differ at ${distinctSamples} samples`;
}

async function probeCompressor(silence: GainNode): Promise<string> {
  const ctx = audioEngine.ctx;
  const device = await prepareDevice('mclass_compressor', 'Compressor response');
  const keySource = await prepareDevice('gain_tool', 'External sidechain key source');
  if (!(await ensureDynamicsWorklet(ctx))) throw new Error('Dynamics AudioWorklet module did not load in this AudioContext');
  const input = device.audioInputs.get('in_l');
  const output = device.audioOutputs.get('out_l');
  const keyInput = keySource.audioInputs.get('in_l');
  const keyOutput = keySource.audioOutputs.get('out_l');
  if (!input || !output) throw new Error('Masterline Compressor has no left audio input/output');
  if (!keyInput || !keyOutput) throw new Error('Gain Tool key source has no left audio input/output');

  const tone = ctx.createOscillator();
  const sideTone = ctx.createOscillator();
  const level = ctx.createGain();
  const sideLevel = ctx.createGain();
  const reference = ctx.createAnalyser();
  const response = ctx.createAnalyser();
  reference.fftSize = FFT_SIZE;
  response.fftSize = FFT_SIZE;
  tone.frequency.value = (ctx.sampleRate * 341) / FFT_SIZE;
  sideTone.frequency.value = tone.frequency.value;
  tone.connect(level);
  sideTone.connect(sideLevel);
  sideLevel.connect(keyInput);
  const keyCable = audioEngine.connectAudio(keySource.id, 'out_l', device.id, 'sc_l');
  if (!keyCable) throw new Error('Could not patch the Gain Tool output into the compressor sidechain input');
  level.connect(input);
  level.connect(reference);
  reference.connect(silence);
  output.connect(response);
  response.connect(silence);

  try {
    device.setParam('threshold', -24);
    device.setParam('ratio', 20);
    device.setParam('knee', 0);
    device.setParam('attack', 1);
    device.setParam('release', 100);
    device.setParam('makeup', 0);
    device.setParam('adapt', 0);
    device.setParam('sidechain', 0);
    tone.start(ctx.currentTime + 0.025);
    sideTone.start(ctx.currentTime + 0.025);
    level.gain.setValueAtTime(0.01, ctx.currentTime);
    await pause(650);
    const lowInput = rms(reference);
    const lowOutput = rms(response);
    const lowRatio = lowOutput / lowInput;
    level.gain.setValueAtTime(0.5, ctx.currentTime);
    await pause(650);
    const highInput = rms(reference);
    const highOutput = rms(response);
    const highRatio = highOutput / highInput;
    const lowDb = 20 * Math.log10(lowRatio);
    const highDb = 20 * Math.log10(highRatio);
    const gainReduction = device instanceof SpecDevice ? device.meter().gr ?? 0 : 0;
    if (lowDb < -2 || lowDb > 2) throw new Error(`Compressor attenuated its below-threshold tone by ${lowDb.toFixed(2)} dB; expected near unity`);
    if (highDb > -8) throw new Error(`Compressor only attenuated the above-threshold tone by ${highDb.toFixed(2)} dB; expected at least 8 dB (input/output RMS ${highInput.toFixed(4)}/${highOutput.toFixed(4)}, gain reduction meter ${gainReduction.toFixed(2)} dB, threshold=${device.params.threshold}, ratio=${device.params.ratio}, knee=${device.params.knee}, powered=${device.isPowered}, bypassed=${device.isBypassed})`);
    device.setParam('sidechain', 1);
    sideLevel.gain.setValueAtTime(0.01, ctx.currentTime);
    await pause(650);
    const quietKeyDb = 20 * Math.log10(rms(response) / rms(reference));
    if (quietKeyDb < -2 || quietKeyDb > 2) throw new Error(`External sidechain attenuated the signal with a below-threshold key by ${quietKeyDb.toFixed(2)} dB; expected near unity`);
    sideLevel.gain.setValueAtTime(0.5, ctx.currentTime);
    await pause(650);
    const loudKeyDb = 20 * Math.log10(rms(response) / rms(reference));
    if (loudKeyDb > -8) throw new Error(`External sidechain did not compress from its above-threshold key; measured ${loudKeyDb.toFixed(2)} dB`);
    return `Masterline Compressor: below threshold ${lowDb.toFixed(2)} dB, above threshold ${highDb.toFixed(2)} dB, external key ${quietKeyDb.toFixed(2)}/${loudKeyDb.toFixed(2)} dB, meter ${gainReduction.toFixed(2)} dB`;
  } finally {
    try { tone.stop(); } catch {}
    try { sideTone.stop(); } catch {}
    tone.disconnect();
    sideTone.disconnect();
    sideLevel.disconnect();
    level.disconnect();
    reference.disconnect();
    response.disconnect();
    audioEngine.removeDevice(keySource.id, true);
    audioEngine.removeDevice(device.id, true);
  }
}

async function run(): Promise<void> {
  await audioEngine.resumeContext();
  const silence = audioEngine.ctx.createGain();
  silence.gain.value = 0;
  silence.connect(audioEngine.ctx.destination);
  const results: string[] = [];
  try {
    for (const test of EQ_CASES) results.push(await probeEq(test, silence));
    results.push(await probeRv7000Size());
    results.push(probeRv7000Determinism());
    results.push(probeCabinetImpulseDeterminism());
    results.push(await probeCompressor(silence));
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · ${results.join('; ')}`;
  } finally {
    silence.disconnect();
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
