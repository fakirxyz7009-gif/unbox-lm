import { BUILTIN_DEVICES } from '../../shared/rack/builtinCatalog.ts';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { specFor } from '../../src/audio/spec/registry.ts';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';
import { parsePack } from '../../shared/instruments/types.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const extraChecks: string[] = [];

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitReady(device: BaseDevice): Promise<void> {
  if (!device.ready) return;
  let timer = 0;
  try {
    await Promise.race([
      device.ready(),
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error('device readiness timed out after 15 seconds')), 15_000);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function peakOf(nodes: readonly AnalyserNode[]): number {
  let peak = 0;
  for (const analyser of nodes) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function tapOutputs(device: BaseDevice): AnalyserNode[] {
  const outputs = [...device.audioOutputs.values()];
  if (!outputs.length) throw new Error('catalog marks this as an audio device, but it has no output node');
  return outputs.map((output) => {
    const analyser = audioEngine.ctx.createAnalyser();
    analyser.fftSize = 2048;
    output.connect(analyser);
    analyser.connect(audioEngine.ctx.destination);
    return analyser;
  });
}

function cleanTaps(device: BaseDevice, taps: readonly AnalyserNode[]): void {
  for (const analyser of taps) {
    try { analyser.disconnect(); } catch {}
  }
  audioEngine.removeDevice(device.id, true);
}

async function probeInstrument(type: string): Promise<number> {
  let device: BaseDevice | null = null;
  let taps: AnalyserNode[] = [];
  try {
    device = audioEngine.createDevice(type as Parameters<typeof audioEngine.createDevice>[0], `Device smoke ${type}`);
    await waitReady(device);
    taps = tapOutputs(device);
    let note = specFor(type)?.pads?.[0]?.note ?? 60;
    const packId = specFor(type)?.engineConfig?.pack;
    if (typeof packId === 'string') {
      const response = await fetch(`/instruments/${encodeURIComponent(packId)}/instrument.json`);
      if (!response.ok) throw new Error(`recorded pack manifest returned HTTP ${response.status}`);
      const pack = parsePack(await response.json());
      if (!pack) throw new Error('recorded pack manifest is invalid');
      const attackZones = pack.zones.filter((zone) => zone.trigger !== 'release');
      if (!attackZones.length) throw new Error('recorded pack has no playable note zones');
      if (!attackZones.some((zone) => zone.lokey <= note && zone.hikey >= note)) {
        const nearest = [...attackZones].sort((a, b) =>
          Math.max(a.lokey - note, note - a.hikey, 0) - Math.max(b.lokey - note, note - b.hikey, 0),
        )[0]!;
        note = nearest.root ?? Math.floor((nearest.lokey + nearest.hikey) / 2);
      }
    }
    device.noteOn(note, 0.82, audioEngine.ctx.currentTime + 0.02);
    const deadline = performance.now() + 350;
    let peak = 0;
    while (performance.now() < deadline) {
      await pause(18);
      peak = Math.max(peak, peakOf(taps));
    }
    device.noteOff?.(note, audioEngine.ctx.currentTime);
    if (peak <= 1e-5) throw new Error(`no measurable output (peak ${peak.toExponential(2)})`);
    return peak;
  } finally {
    if (device) cleanTaps(device, taps);
  }
}

async function probeEffect(type: string): Promise<number> {
  let device: BaseDevice | null = null;
  let taps: AnalyserNode[] = [];
  let source: OscillatorNode | null = null;
  let inputGain: GainNode | null = null;
  let bypassGains: GainNode[] = [];
  try {
    const gainDescriptor = type === 'rv7000'
      ? Object.getOwnPropertyDescriptor(audioEngine.ctx, 'createGain')
      : undefined;
    if (type === 'rv7000') {
      const createGain = audioEngine.ctx.createGain.bind(audioEngine.ctx);
      Object.defineProperty(audioEngine.ctx, 'createGain', {
        configurable: true,
        value: () => {
          const gain = createGain();
          bypassGains.push(gain);
          return gain;
        },
      });
    }
    try {
      device = audioEngine.createDevice(type as Parameters<typeof audioEngine.createDevice>[0], `Device smoke ${type}`);
    } finally {
      if (type === 'rv7000') {
        if (gainDescriptor) Object.defineProperty(audioEngine.ctx, 'createGain', gainDescriptor);
        else Reflect.deleteProperty(audioEngine.ctx, 'createGain');
      }
    }
    if (type === 'rv7000') {
      // The generic bypass shim is installed last and creates six gains: wet L/R, dry L/R, output L/R.
      bypassGains = bypassGains.slice(-6);
    }
    await waitReady(device);
    taps = tapOutputs(device);
    const inputs = [...device.audioInputs.values()];
    if (!inputs.length) throw new Error('catalog marks this as an audio effect, but it has no input node');
    source = audioEngine.ctx.createOscillator();
    inputGain = audioEngine.ctx.createGain();
    source.frequency.value = 440;
    inputGain.gain.value = 0.15;
    source.connect(inputGain);
    inputs.forEach((input) => inputGain?.connect(input));
    source.start();
    const deadline = performance.now() + 220;
    let peak = 0;
    while (performance.now() < deadline) {
      await pause(18);
      peak = Math.max(peak, peakOf(taps));
    }
    if (type === 'rv7000' && peak > 1e-5) {
      const inputTap = audioEngine.ctx.createAnalyser();
      inputTap.fftSize = 2048;
      inputGain.connect(inputTap);
      device.isBypassed = true;
      await pause(100);
      const bypassPeak = peakOf(taps);
      device.isBypassed = false;
      await pause(100);
      const restoredPeak = peakOf(taps);
      device.isPowered = false;
      await pause(100);
      const poweredOffPeak = peakOf(taps);
      device.isPowered = true;
      await pause(100);
      const repoweredPeak = peakOf(taps);
      const inputPeak = peakOf([inputTap]);
      const shim = bypassGains.map((gain) => gain.gain.value.toFixed(3)).join('/');
      inputTap.disconnect();
      if (bypassPeak <= 1e-5 || restoredPeak <= 1e-5 || poweredOffPeak > 1e-5 || repoweredPeak <= 1e-5) {
        throw new Error(`bypass/power transition failed (input=${inputPeak.toExponential(2)}, bypass=${bypassPeak.toExponential(2)}, restored=${restoredPeak.toExponential(2)}, off=${poweredOffPeak.toExponential(2)}, repowered=${repoweredPeak.toExponential(2)}, shim=${shim})`);
      }
      extraChecks.push(`RV7000 bypass/power restore passed (bypass ${bypassPeak.toExponential(2)}, repowered ${repoweredPeak.toExponential(2)}, shim ${shim})`);
    }
    if (peak <= 1e-5) {
      let detail = '';
      if (type === 'rv7000') {
        const inputTap = audioEngine.ctx.createAnalyser();
        const rawTap = audioEngine.ctx.createAnalyser();
        const rawOutput = Reflect.get(device, 'outputL');
        const convolver = Reflect.get(device, 'convolver');
        const dryGain = Reflect.get(device, 'dryGain');
        const wetGain = Reflect.get(device, 'wetGain');
        inputTap.fftSize = 2048;
        rawTap.fftSize = 2048;
        inputGain.connect(inputTap);
        if (rawOutput instanceof AudioNode) rawOutput.connect(rawTap);
        device.isBypassed = true;
        await pause(80);
        const bypassPeak = peakOf(taps);
        device.isBypassed = false;
        await pause(100);
        const inputPeak = peakOf([inputTap]);
        const rawPeak = peakOf([rawTap]);
        const irDuration = convolver instanceof ConvolverNode ? convolver.buffer?.duration ?? 0 : 0;
        const dry = dryGain instanceof GainNode ? dryGain.gain.value : NaN;
        const wet = wetGain instanceof GainNode ? wetGain.gain.value : NaN;
        const shim = bypassGains.map((gain) => gain.gain.value.toFixed(3)).join('/');
        detail = `; RV diagnostics input=${inputPeak.toExponential(2)}, bypass=${bypassPeak.toExponential(2)}, raw=${rawPeak.toExponential(2)}, mix=${dry.toFixed(2)}/${wet.toFixed(2)}, shim=${shim}, IR=${irDuration.toFixed(2)} s`;
        inputTap.disconnect();
        rawTap.disconnect();
      }
      throw new Error(`no measurable output from 440 Hz input (peak ${peak.toExponential(2)}; context ${audioEngine.ctx.state} at ${audioEngine.ctx.currentTime.toFixed(3)} s / ${audioEngine.ctx.sampleRate} Hz; ${audioEngine.devices.size} devices registered${detail})`);
    }
    return peak;
  } finally {
    try { source?.stop(); } catch {}
    try { source?.disconnect(); } catch {}
    try { inputGain?.disconnect(); } catch {}
    if (device) cleanTaps(device, taps);
  }
}

async function run(): Promise<void> {
  result!.textContent = 'Waking the DAW audio context…';
  await audioEngine.resumeContext();
  const instruments = BUILTIN_DEVICES.filter((device) => device.role === 'instrument');
  const effects = BUILTIN_DEVICES.filter((device) => device.role === 'effect' && device.audioIn && device.audioOut);
  const query = new URLSearchParams(location.search);
  const failures: string[] = [];
  const peaks: string[] = [];
  // Keep the normal sweep instrument-first; effects-first remains an explicit comparison mode.
  const cases = query.get('order') !== 'effects-first'
    ? [
      ...instruments.map((device) => ({ type: device.type, group: 'instrument' as const })),
      ...effects.map((device) => ({ type: device.type, group: 'effect' as const })),
    ]
    : [
      ...effects.map((device) => ({ type: device.type, group: 'effect' as const })),
      ...instruments.map((device) => ({ type: device.type, group: 'instrument' as const })),
    ];
  const requestedType = query.get('type');
  if (query.get('warmBefore') === '1' && requestedType) {
    const targetIndex = cases.findIndex((device) => device.type === requestedType);
    const priorEffects = cases.slice(0, Math.max(0, targetIndex)).filter((device) => device.group === 'effect');
    const warmCases = [...cases.filter((device) => device.group === 'instrument'), ...priorEffects];
    const warmFailures: string[] = [];
    for (let index = 0; index < warmCases.length; index++) {
      const device = warmCases[index]!;
      result!.textContent = `Warming ${index + 1}/${warmCases.length}: ${device.group} · ${device.type}`;
      try {
        if (device.group === 'instrument') await probeInstrument(device.type);
        else await probeEffect(device.type);
      } catch (error) {
        warmFailures.push(`${device.type}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (warmFailures.length) throw new Error(`Device warm-up failed: ${warmFailures.join('; ')}`);
  }
  const selectedCases = requestedType ? cases.filter((device) => device.type === requestedType) : cases;
  if (!selectedCases.length) throw new Error(`Unknown device type for audio smoke: ${requestedType ?? 'none'}.`);
  const instrumentCount = selectedCases.filter((device) => device.group === 'instrument').length;
  const effectCount = selectedCases.length - instrumentCount;

  for (let index = 0; index < selectedCases.length; index++) {
    const test = selectedCases[index]!;
    result!.textContent = `Checking ${index + 1}/${selectedCases.length}: ${test.group} · ${test.type}`;
    try {
      const peak = test.group === 'instrument' ? await probeInstrument(test.type) : await probeEffect(test.type);
      peaks.push(`${test.type}=${peak.toExponential(2)}`);
    } catch (error) {
      failures.push(`${test.group} ${test.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length) {
    result!.dataset.status = 'failed';
    result!.textContent = `FAIL · ${instrumentCount} instruments and ${effectCount} effects checked; ${failures.length} issue(s):\n${failures.join('\n')}\nPassing peaks: ${peaks.join(', ')}`;
    return;
  }
  result!.dataset.status = 'passed';
  result!.textContent = `PASS · ${instrumentCount} playable instruments and ${effectCount} audio effects instantiated and emitted audio in the DAW Web Audio context.${extraChecks.length ? ` ${extraChecks.join(' ')}` : ''}`;
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
