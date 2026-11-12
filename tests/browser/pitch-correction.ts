import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { SpecDevice } from '../../src/audio/spec/SpecDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function settleAudio(seconds: number): Promise<void> {
  const start = audioEngine.ctx.currentTime;
  const deadline = Date.now() + 5000;
  while (audioEngine.ctx.currentTime - start < seconds) {
    if (Date.now() > deadline) throw new Error('AudioContext did not advance during the pitch-correction probe.');
    await pause(10);
  }
}

function estimatePitch(samples: Float32Array, rate: number, minHz = 170, maxHz = 240): number {
  const minLag = Math.floor(rate / maxHz);
  const maxLag = Math.ceil(rate / minHz);
  let bestLag = -1;
  let bestError = Infinity;
  const usable = samples.length - maxLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let error = 0;
    for (let i = 0; i < usable; i++) {
      const delta = samples[i] - samples[i + lag];
      error += delta * delta;
    }
    if (error < bestError) {
      bestError = error;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return 0;
  const before = bestLag > minLag ? autocorrelationError(samples, bestLag - 1, usable) : bestError;
  const after = bestLag < maxLag ? autocorrelationError(samples, bestLag + 1, usable) : bestError;
  const divisor = before - 2 * bestError + after;
  const adjustment = Math.abs(divisor) < 1e-9 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / divisor));
  return rate / (bestLag + adjustment);
}

function autocorrelationError(samples: Float32Array, lag: number, usable: number): number {
  let error = 0;
  for (let i = 0; i < usable; i++) {
    const delta = samples[i] - samples[i + lag];
    error += delta * delta;
  }
  return error;
}

function measureLive(analyser: AnalyserNode, minHz = 170, maxHz = 240): number {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  return estimatePitch(samples, audioEngine.ctx.sampleRate, minHz, maxHz);
}

function measureLivePeak(analyser: AnalyserNode, minHz = 170, maxHz = 240): number {
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  const rate = audioEngine.ctx.sampleRate;
  const low = Math.ceil(minHz * analyser.fftSize / rate);
  const high = Math.floor(maxHz * analyser.fftSize / rate);
  let peak = low;
  for (let i = low + 1; i <= high; i++) if (bins[i] > bins[peak]) peak = i;
  const before = bins[peak - 1];
  const center = bins[peak];
  const after = bins[peak + 1];
  const divisor = before - 2 * center + after;
  const offset = Math.abs(divisor) < 1e-9 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / divisor));
  return (peak + offset) * rate / analyser.fftSize;
}

function measureOffline(buffer: AudioBuffer, startSec: number): number {
  const count = Math.min(16_384, Math.floor(buffer.sampleRate * 0.35));
  const start = Math.max(0, Math.min(buffer.length - count, Math.floor(startSec * buffer.sampleRate)));
  return estimatePitch(buffer.getChannelData(0).subarray(start, start + count), buffer.sampleRate);
}

async function run(): Promise<void> {
  let device: SpecDevice | null = null;
  let sax: SpecDevice | null = null;
  let oscillator: OscillatorNode | null = null;
  let analyser: AnalyserNode | null = null;
  let sourceAnalyser: AnalyserNode | null = null;
  try {
    await audioEngine.resumeContext();
    const created = audioEngine.createDevice('pitch_correct', 'Scale Tune Response Probe');
    if (!(created instanceof SpecDevice)) throw new Error('Scale Tune was not created as a spec-driven device.');
    device = created;
    await device.ready();
    device.setParam('mix', 1);
    device.setParam('correct', 1);
    device.setParam('key', 0);
    device.setParam('scale', 0);
    device.setParam('amount', 1);
    device.setParam('retune', 5);
    device.setParam('sensitivity', 0.8);

    const leftInput = device.audioInputs.get('in_l');
    const leftOutput = device.audioOutputs.get('out_l');
    if (!leftInput || !leftOutput) throw new Error('Scale Tune is missing its stereo audio ports.');
    analyser = audioEngine.ctx.createAnalyser();
    analyser.fftSize = 16_384;
    analyser.smoothingTimeConstant = 0;
    leftOutput.connect(analyser);
    oscillator = audioEngine.ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 205;
    oscillator.connect(leftInput);
    sourceAnalyser = audioEngine.ctx.createAnalyser();
    sourceAnalyser.fftSize = 16_384;
    sourceAnalyser.smoothingTimeConstant = 0;
    oscillator.connect(sourceAnalyser);
    oscillator.start(audioEngine.ctx.currentTime + 0.03);

    await settleAudio(0.5);
    const cMajorHz = measureLive(analyser);
    const cMajorPeakHz = measureLivePeak(analyser);
    const cMajorMeter = device.meter();
    if (Math.abs(cMajorPeakHz - 196) > 3 || Math.abs(cMajorHz - 196) > 3) throw new Error(`C major correction measured ${cMajorPeakHz.toFixed(2)} Hz by spectrum and ${cMajorHz.toFixed(2)} Hz by period estimate; tracker ${JSON.stringify(cMajorMeter)}.`);
    if (cMajorMeter.worklet !== 1 || cMajorMeter.note !== 56 || cMajorMeter.cents > -40 || cMajorMeter.confidence < 0.5) {
      throw new Error(`Live note tracking/correction meter is inconsistent: ${JSON.stringify(cMajorMeter)}.`);
    }

    device.setParam('key', 9);
    await settleAudio(0.4);
    const aMajorHz = measureLive(analyser);
    const aMajorPeakHz = measureLivePeak(analyser);
    if (Math.abs(aMajorHz - 207.65) > 3 || Math.abs(aMajorPeakHz - 207.65) > 3) throw new Error(`A major correction measured ${aMajorPeakHz.toFixed(2)} Hz by spectrum and ${aMajorHz.toFixed(2)} Hz by period estimate instead of G#3 (207.65 Hz).`);

    device.setParam('correct', 0);
    await settleAudio(0.5);
    const bypassHz = measureLive(analyser);
    const bypassPeakHz = measureLivePeak(analyser);
    const sourcePeakHz = sourceAnalyser ? measureLivePeak(sourceAnalyser) : 0;
    if (Math.abs(bypassHz - sourcePeakHz) > 0.5 || Math.abs(bypassPeakHz - sourcePeakHz) > 0.5) throw new Error(`Correction-off measured ${bypassPeakHz.toFixed(2)} Hz by spectrum / ${bypassHz.toFixed(2)} Hz by period estimate vs ${sourcePeakHz.toFixed(2)} Hz raw source.`);

    const offline = new OfflineAudioContext(1, Math.ceil(audioEngine.ctx.sampleRate * 1.4), audioEngine.ctx.sampleRate);
    const offlineDevice = device.cloneForOfflineContext(offline);
    if (!(offlineDevice instanceof SpecDevice)) throw new Error('Scale Tune did not clone into OfflineAudioContext.');
    offlineDevice.setParam('correct', 1);
    offlineDevice.setParam('key', 0);
    offlineDevice.setParam('scale', 0);
    offlineDevice.setParam('amount', 1);
    offlineDevice.setParam('retune', 5);
    offlineDevice.setParam('sensitivity', 0.8);
    await offlineDevice.ready();
    const offlineInput = offlineDevice.audioInputs.get('in_l');
    const offlineOutput = offlineDevice.audioOutputs.get('out_l');
    if (!offlineInput || !offlineOutput) throw new Error('Offline Scale Tune clone is missing audio ports.');
    offlineOutput.connect(offline.destination);
    const offlineOsc = offline.createOscillator();
    offlineOsc.type = 'sine';
    offlineOsc.frequency.value = 205;
    offlineOsc.connect(offlineInput);
    offlineOsc.start(0);
    const rendered = await offline.startRendering();
    const offlineHz = measureOffline(rendered, 0.7);
    if (Math.abs(offlineHz - 196) > 3) throw new Error(`Offline clone corrected to ${offlineHz.toFixed(2)} Hz instead of G3 (196.00 Hz).`);

    // Verify tracking and correction on a licensed musician-recorded timbre, not only a sine.
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
    if (!sourceAnalyser) throw new Error('The raw-source analyser is unavailable.');
    sourceAnalyser.disconnect();
    const recorded = audioEngine.createDevice('rec_bear_sax', 'Recorded Sax Pitch-Correction Probe');
    if (!(recorded instanceof SpecDevice)) throw new Error('The recorded Bear Sax pack did not create a spec instrument.');
    sax = recorded;
    await sax.ready();
    const saxOut = sax.audioOutputs.get('out_l');
    const correctionIn = device.audioInputs.get('in_l');
    if (!saxOut || !correctionIn) throw new Error('Recorded sax or pitch-corrector audio ports are missing.');
    saxOut.connect(correctionIn);
    saxOut.connect(sourceAnalyser);
    // C#4 is equidistant between C4 and D4; bias the recorded note 25 cents flat so C is
    // unambiguously the nearest C-major note and the test covers downward correction.
    sax.setParam('fine', -25);
    device.setParam('correct', 1);
    device.setParam('key', 0);
    const saxStart = audioEngine.ctx.currentTime + 0.05;
    sax.noteOn(61, 0.85, saxStart);
    await settleAudio(0.9);
    const saxRawHz = measureLive(sourceAnalyser, 250, 310);
    const saxCorrectedHz = measureLive(analyser, 250, 310);
    const saxCorrectedPeakHz = measureLivePeak(analyser, 250, 310);
    const saxMeter = device.meter();
    sax.noteOff(61, audioEngine.ctx.currentTime + 0.03);
    if (saxRawHz < 269 || saxRawHz > 276) throw new Error(`Recorded Bear Sax MIDI 61 source measured ${saxRawHz.toFixed(2)} Hz; expected the flat C#4 probe pitch.`);
    if (Math.abs(saxCorrectedPeakHz - 261.63) > 10 || Math.abs(saxCorrectedHz - 261.63) > 12) {
      throw new Error(`Recorded sax C#4 correction measured ${saxCorrectedPeakHz.toFixed(2)} Hz by spectrum and ${saxCorrectedHz.toFixed(2)} Hz by period estimate; raw source was ${saxRawHz.toFixed(2)} Hz. Tracker ${JSON.stringify(saxMeter)}.`);
    }
    if (saxMeter.worklet !== 1 || saxMeter.note !== 61 || saxMeter.cents > -50 || saxMeter.confidence < 0.5) {
      throw new Error(`Recorded sax note tracking/correction meter is inconsistent: ${JSON.stringify(saxMeter)}.`);
    }
    await settleAudio(0.6);
    sax.setParam('fine', 25);
    sax.noteOn(61, 0.85, audioEngine.ctx.currentTime + 0.05);
    await settleAudio(0.9);
    const saxSharpRawHz = measureLive(sourceAnalyser, 250, 320);
    const saxSharpCorrectedHz = measureLive(analyser, 250, 320);
    const saxSharpCorrectedPeakHz = measureLivePeak(analyser, 250, 320);
    const saxSharpMeter = device.meter();
    sax.noteOff(61, audioEngine.ctx.currentTime + 0.03);
    if (saxSharpRawHz < 278 || saxSharpRawHz > 286) throw new Error(`Recorded Bear Sax MIDI 61 sharp probe measured ${saxSharpRawHz.toFixed(2)} Hz; expected the sharp C#4 region.`);
    if (Math.abs(saxSharpCorrectedPeakHz - 293.66) > 10 || Math.abs(saxSharpCorrectedHz - 293.66) > 12) {
      throw new Error(`Recorded sax sharp C#4 correction measured ${saxSharpCorrectedPeakHz.toFixed(2)} Hz by spectrum and ${saxSharpCorrectedHz.toFixed(2)} Hz by period estimate; raw source was ${saxSharpRawHz.toFixed(2)} Hz. Tracker ${JSON.stringify(saxSharpMeter)}.`);
    }
    if (saxSharpMeter.worklet !== 1 || saxSharpMeter.note !== 61 || saxSharpMeter.cents < 50 || saxSharpMeter.confidence < 0.5) {
      throw new Error(`Recorded sax upward correction meter is inconsistent: ${JSON.stringify(saxSharpMeter)}.`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · live 205 Hz input corrected to ${cMajorPeakHz.toFixed(2)} Hz in C major and ${aMajorPeakHz.toFixed(2)} Hz in A major; correction-off returned ${bypassPeakHz.toFixed(2)} Hz; offline clone rendered ${offlineHz.toFixed(2)} Hz; CC0 Bear Sax MIDI 61 corrected ${saxRawHz.toFixed(2)}→${saxCorrectedPeakHz.toFixed(2)} Hz downward and ${saxSharpRawHz.toFixed(2)}→${saxSharpCorrectedPeakHz.toFixed(2)} Hz upward. Tracker reported ${saxSharpMeter.note}, ${saxSharpMeter.cents.toFixed(1)} cents, confidence ${saxSharpMeter.confidence.toFixed(2)}.`;
  } catch (error) {
    resultNode.dataset.status = 'failed';
    resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
  } finally {
    try {
      oscillator?.stop();
    } catch {
      // The probe may fail before its test oscillator starts.
    }
    sax?.noteOff(61);
    oscillator?.disconnect();
    analyser?.disconnect();
    sourceAnalyser?.disconnect();
    if (device) audioEngine.removeDevice(device.id);
    if (sax) audioEngine.removeDevice(sax.id);
  }
}

void run();
