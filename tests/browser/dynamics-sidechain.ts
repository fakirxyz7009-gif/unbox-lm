import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { ensureDynamicsWorklet } from '../../src/audio/spec/worklets.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;
const FFT_SIZE = 16_384;

interface SidechainCase {
  type: string;
  params: Record<string, number>;
}

const CASES: SidechainCase[] = [
  { type: 'channel_dynamics', params: { threshold: -36, ratio: 20, attack: 0.05, release: 100, makeup: 0, gateThreshold: -80, fastAttack: 1, sidechain: 1 } },
  { type: 'mclass_compressor', params: { threshold: -36, ratio: 20, knee: 0, attack: 1, release: 100, makeup: 0, adapt: 0, sidechain: 1 } },
  { type: 'ssl_gbus', params: { threshold: -20, ratio: 2, attack: 2, release: 0, makeup: 0, sidechain: 1 } },
  { type: 'distressor', params: { input: 4, attackKnob: 5, releaseKnob: 5, outputKnob: 5, ratio: 6, dist: 0, detector: 0, sidechain: 1 } },
  { type: 'la2a', params: { peakReduction: 75, gain: 40, limit: 1, emphasis: 0.5, mix: 1, sidechain: 1 } },
  { type: 'ua1176', params: { input: 24, outputKnob: 24, attackKnob: 7, releaseKnob: 7, ratio: 4, mix: 1, sidechain: 1 } },
  { type: 'portico2_mbp', params: { threshold: -30, ratio: 20, knee: 0, attack: 1, release: 100, makeup: 0, mix: 1, silk: 0, texture: 0, width: 1, ceiling: 0, sidechain: 1 } },
  { type: 'api2500', params: { threshold: -20, ratio: 6, attack: 0, release: 0, makeup: 0, kneeSel: 0, thrust: 0, topology: 0, sidechain: 1 } },
  { type: 'avalon747', params: { threshold: -30, ratio: 20, attack: 1, release: 100, makeup: 0, mix: 1, sidechain: 1, eq1: 0, eq2: 0, eq3: 0, eq4: 0, eq5: 0, eq6: 0 } },
  { type: 'manley_varimu', params: { threshold: -30, input: 0, attack: 0, release: 0, modeSel: 1, scHp: 0, makeup: 0, mix: 1, sidechain: 1 } },
  { type: 'wa2a', params: { peakReduction: 75, gain: 40, limit: 1, emphasis: 0.5, mix: 1, sidechain: 1 } },
];

function rms(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / data.length);
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function probe(test: SidechainCase): Promise<string> {
  const ctx = audioEngine.ctx;
  const compressor = audioEngine.createDevice(test.type as Parameters<typeof audioEngine.createDevice>[0], `${test.type} sidechain probe`);
  const keySource = audioEngine.createDevice('gain_tool', `${test.type} sidechain key`);
  const mainInput = compressor.audioInputs.get('in_l');
  const compressorOutput = compressor.audioOutputs.get('out_l');
  const keyInput = keySource.audioInputs.get('in_l');
  const keyOutput = keySource.audioOutputs.get('out_l');
  if (!mainInput || !compressorOutput || !keyInput || !keyOutput) throw new Error(`${test.type} is missing an audio port`);

  const main = ctx.createOscillator();
  const key = ctx.createOscillator();
  const mainLevel = ctx.createGain();
  const keyLevel = ctx.createGain();
  const reference = ctx.createAnalyser();
  const output = ctx.createAnalyser();
  const silence = ctx.createGain();
  reference.fftSize = FFT_SIZE;
  output.fftSize = FFT_SIZE;
  main.frequency.value = 997;
  key.frequency.value = 997;
  mainLevel.gain.value = 0.18;
  keyLevel.gain.value = 0.01;
  silence.gain.value = 0;
  main.connect(mainLevel);
  mainLevel.connect(mainInput);
  mainLevel.connect(reference);
  reference.connect(silence);
  key.connect(keyLevel);
  keyLevel.connect(keyInput);
  const leftCable = audioEngine.connectAudio(keySource.id, 'out_l', compressor.id, 'sc_l');
  const rightCable = audioEngine.connectAudio(keySource.id, 'out_r', compressor.id, 'sc_r');
  if (!leftCable || !rightCable) throw new Error(`${test.type} could not connect the stereo external key`);
  compressorOutput.connect(output);
  output.connect(silence);
  silence.connect(ctx.destination);

  try {
    await compressor.ready?.();
    await keySource.ready?.();
    if (!(await ensureDynamicsWorklet(ctx))) throw new Error('Dynamics AudioWorklet module did not load');
    compressor.isPowered = true;
    compressor.isBypassed = false;
    keySource.isPowered = true;
    keySource.isBypassed = false;
    for (const [param, value] of Object.entries(test.params)) compressor.setParam(param, value);
    main.start(ctx.currentTime + 0.025);
    key.start(ctx.currentTime + 0.025);
    await pause(650);
    const quietInput = rms(reference);
    const quietOutput = rms(output);
    if (quietInput < 0.04 || quietOutput < 1e-5) throw new Error(`${test.type} quiet-key signal is not measurable`);
    const quietGainDb = 20 * Math.log10(quietOutput / quietInput);
    keyLevel.gain.setValueAtTime(0.5, ctx.currentTime);
    await pause(900);
    const loudInput = rms(reference);
    const loudOutput = rms(output);
    if (loudInput < 0.04 || loudOutput < 1e-5) throw new Error(`${test.type} loud-key signal is not measurable`);
    const loudGainDb = 20 * Math.log10(loudOutput / loudInput);
    const attenuation = quietGainDb - loudGainDb;
    if (attenuation < 2.5) {
      throw new Error(`${test.type} changed only ${attenuation.toFixed(2)} dB from quiet to loud external key (gain ${quietGainDb.toFixed(2)} → ${loudGainDb.toFixed(2)} dB)`);
    }
    return `${test.type} ${quietGainDb.toFixed(2)} → ${loudGainDb.toFixed(2)} dB (${attenuation.toFixed(2)} dB key response)`;
  } finally {
    try { main.stop(); } catch {}
    try { key.stop(); } catch {}
    main.disconnect();
    key.disconnect();
    mainLevel.disconnect();
    keyLevel.disconnect();
    reference.disconnect();
    output.disconnect();
    silence.disconnect();
    audioEngine.removeDevice(keySource.id, true);
    audioEngine.removeDevice(compressor.id, true);
  }
}

async function run(): Promise<void> {
  await audioEngine.resumeContext();
  const results: string[] = [];
  for (const test of CASES) results.push(await probe(test));
  resultNode.dataset.status = 'passed';
  resultNode.textContent = `PASS · ${results.length}/${CASES.length} sidechain-capable dynamics devices respond to real stereo rack-cable key signals: ${results.join('; ')}`;
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
