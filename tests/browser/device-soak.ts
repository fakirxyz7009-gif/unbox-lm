import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';
import type { SequencerNote, SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitReady(device: BaseDevice): Promise<void> {
  if (!device.ready) return;
  let timer = 0;
  try {
    await Promise.race([
      device.ready(),
      new Promise<never>((_resolve, reject) => { timer = window.setTimeout(() => reject(new Error(`${device.type} readiness timed out`)), 30_000); }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function patternSteps(track: SequencerTrack, values: (SequencerNote | null)[]): void {
  const pattern = track.patternList?.find((entry) => entry.id === track.activePatternId);
  if (!pattern) throw new Error(`${track.name} has no active pattern`);
  track.steps = values;
  pattern.length = values.length;
  pattern.steps = values;
}

async function run(): Promise<void> {
  const seconds = Math.max(5, Math.min(3600, Number(new URLSearchParams(location.search).get('seconds')) || 600));
  const engine = audioEngine;
  const oldBpm = engine.bpm;
  const oldMode = engine.playbackMode;
  const oldLoop = engine.loopEnabled;
  const oldPosition = engine.songPosition;
  const devices: BaseDevice[] = [];
  let observer: PerformanceObserver | null = null;
  let monitor: AudioWorkletNode | null = null;
  let objectUrl = '';
  let longTaskCount = 0;
  let maxLongTaskMs = 0;
  let priorFrame: number | null = null;
  let maxRenderGapMs = 0;
  let renderGapCount500ms = 0;
  const frameBytes = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;

  try {
    result!.textContent = 'Loading the recorded instruments…';
    await engine.resumeContext();
    for (const type of ['rec_meta_piano', 'rec_bear_sax', 'subtractor', 'redrum']) {
      const device = engine.createDevice(type as Parameters<typeof engine.createDevice>[0], `10-minute soak · ${type}`);
      devices.push(device);
      await waitReady(device);
    }
    const [piano, sax, bass, drums] = devices;
    if (!piano || !sax || !bass || !drums) throw new Error('soak instrument setup is incomplete');
    const trackFor = (device: BaseDevice): SequencerTrack => {
      const track = engine.tracks.find((candidate) => candidate.deviceId === device.id);
      if (!track) throw new Error(`${device.type} did not create a sequencer track`);
      return track;
    };

    const pianoSteps: (SequencerNote | null)[] = Array(16).fill(null);
    [[0, 60], [4, 64], [8, 67], [12, 72]].forEach(([step, note]) => { pianoSteps[step!] = { note: note!, velocity: 0.58, length: 3, chordNotes: [note! + 3, note! + 7] }; });
    patternSteps(trackFor(piano), pianoSteps);

    const saxSteps: (SequencerNote | null)[] = Array(16).fill(null);
    [[0, 60], [4, 62], [8, 64], [12, 67]].forEach(([step, note]) => { saxSteps[step!] = { note: note!, velocity: 0.62, length: 2 }; });
    patternSteps(trackFor(sax), saxSteps);

    const bassSteps: (SequencerNote | null)[] = Array(16).fill(null);
    [[0, 36], [4, 43], [8, 40], [12, 31]].forEach(([step, note]) => { bassSteps[step!] = { note: note!, velocity: 0.72, length: 3 }; });
    patternSteps(trackFor(bass), bassSteps);

    const drumSteps: (SequencerNote | null)[] = Array(16).fill(null);
    for (let step = 0; step < 16; step++) {
      const note = step % 8 === 4 ? 61 : step % 4 === 0 ? 60 : 62;
      drumSteps[step] = { note, velocity: step % 2 === 0 ? 0.6 : 0.36, length: 1 };
    }
    patternSteps(trackFor(drums), drumSteps);

    const echo = engine.createDevice('echo', '10-minute soak · delay');
    devices.push(echo);
    const reverb = engine.createDevice('rv7000', '10-minute soak · reverb');
    devices.push(reverb);
    const directSaxRoutes = engine.audioConnections.filter((c) => c.sourceDeviceId === sax.id && c.targetDeviceId === 'master');
    directSaxRoutes.forEach((connection) => engine.disconnectAudio(connection.id));
    const cables = [
      engine.connectAudio(sax.id, 'out_l', echo.id, 'in_l'),
      engine.connectAudio(sax.id, 'out_r', echo.id, 'in_r'),
      engine.connectAudio(echo.id, 'out_l', reverb.id, 'in_l'),
      engine.connectAudio(echo.id, 'out_r', reverb.id, 'in_r'),
      engine.connectAudio(reverb.id, 'out_l', 'master', 'master_l'),
      engine.connectAudio(reverb.id, 'out_r', 'master', 'master_r'),
    ];
    if (cables.some((id) => !id)) throw new Error('could not establish the test delay/reverb chain');

    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount++;
          maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    }

    const moduleCode = `class UnboxSoakWatch extends AudioWorkletProcessor {
      constructor() { super(); this.blocks = 0; }
      process(_inputs, outputs) {
        for (const channel of outputs[0] || []) channel.fill(0);
        if (++this.blocks % 64 === 0) this.port.postMessage(currentFrame);
        return true;
      }
    }
    registerProcessor('unbox-audio-soak-watch', UnboxSoakWatch);`;
    objectUrl = URL.createObjectURL(new Blob([moduleCode], { type: 'text/javascript' }));
    await engine.ctx.audioWorklet.addModule(objectUrl);
    monitor = new AudioWorkletNode(engine.ctx, 'unbox-audio-soak-watch', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    monitor.port.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'number') return;
      if (priorFrame !== null) {
        const gap = ((event.data - priorFrame) / engine.ctx.sampleRate) * 1000;
        maxRenderGapMs = Math.max(maxRenderGapMs, gap);
        if (gap > 500) renderGapCount500ms++;
      }
      priorFrame = event.data;
    };
    monitor.connect(engine.ctx.destination);

    engine.setBpm(120);
    engine.setPlaybackMode('pattern_loop');
    engine.loopEnabled = false;
    engine.seekToSongPosition(0);
    await engine.startTransport();
    await pause(1000);

    const startPerf = performance.now();
    const startAudioTime = engine.ctx.currentTime;
    const startPosition = engine.getPlayheadPosition();
    let lastPosition = startPosition;
    let samples = 0;
    let nonSilent = 0;
    while (performance.now() - startPerf < seconds * 1000) {
      await pause(1000);
      samples++;
      if (!engine.isPlaying || engine.ctx.state !== 'running') throw new Error('transport or AudioContext stopped during the soak');
      const position = engine.getPlayheadPosition();
      if (position + 0.1 < lastPosition) throw new Error(`transport moved backwards (${lastPosition.toFixed(2)} → ${position.toFixed(2)})`);
      lastPosition = position;
      const levels = engine.masterLevels();
      if (Math.max(levels.peakL, levels.peakR) > 1e-4) nonSilent++;
      result!.textContent = `Audio soak · ${Math.min(seconds, Math.floor((performance.now() - startPerf) / 1000))}/${seconds}s · song position ${position.toFixed(1)} · signal windows ${nonSilent}/${samples}`;
    }

    const elapsedSec = (performance.now() - startPerf) / 1000;
    const audioElapsedSec = engine.ctx.currentTime - startAudioTime;
    const finalPosition = engine.getPlayheadPosition();
    const actualSixteenths = finalPosition - startPosition;
    const sixteenthsPerSecond = (engine.bpm / 60) * 4;
    const expectedAudioSixteenths = audioElapsedSec * sixteenthsPerSecond;
    const audioTransportErrorPct = Math.abs(actualSixteenths - expectedAudioSixteenths) / expectedAudioSixteenths * 100;
    const expectedWallSixteenths = elapsedSec * sixteenthsPerSecond;
    const wallTransportErrorPct = Math.abs(actualSixteenths - expectedWallSixteenths) / expectedWallSixteenths * 100;
    const clockRateDeltaPct = Math.abs(audioElapsedSec - elapsedSec) / elapsedSec * 100;
    const finalHeap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const heapDelta = frameBytes !== null && finalHeap !== null ? `${((finalHeap - frameBytes) / 1_048_576).toFixed(1)} MB` : 'unavailable';
    const signalPct = samples ? (nonSilent / samples) * 100 : 0;
    const summary = `${elapsedSec.toFixed(0)}s · ${devices.length - 2} instruments + delay/reverb · song/context drift ${audioTransportErrorPct.toFixed(3)}% · song/wall drift ${wallTransportErrorPct.toFixed(2)}% · audio-vs-wall clock delta ${clockRateDeltaPct.toFixed(2)}% · signal ${signalPct.toFixed(1)}% of 1s windows · render gap max ${maxRenderGapMs.toFixed(1)} ms (${renderGapCount500ms} >500ms) · long tasks ${longTaskCount} / max ${maxLongTaskMs.toFixed(1)} ms · heap Δ ${heapDelta}`;
    const failures: string[] = [];
    if (elapsedSec < seconds * 0.98) failures.push('soak ended before its requested duration');
    if (audioTransportErrorPct > 1) failures.push('song position drifted more than 1% from the AudioContext clock');
    if (signalPct < 50) failures.push('master output was silent in over half of sampled windows');
    if (renderGapCount500ms > 0) failures.push('AudioWorklet render-frame gaps exceeded 500 ms');
    if (failures.length) {
      result!.dataset.status = 'failed';
      result!.textContent = `FAIL · ${summary}\n${failures.join('\n')}`;
    } else {
      result!.dataset.status = 'passed';
      result!.textContent = `PASS · ${summary}`;
    }
  } finally {
    observer?.disconnect();
    engine.stopTransport();
    try { monitor?.disconnect(); monitor?.port.close(); } catch {}
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    for (const device of [...devices].reverse()) engine.removeDevice(device.id, true);
    engine.setBpm(oldBpm);
    engine.setPlaybackMode(oldMode);
    engine.loopEnabled = oldLoop;
    engine.seekToSongPosition(oldPosition);
  }
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
