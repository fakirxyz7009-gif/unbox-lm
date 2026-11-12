import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function peakOf(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  return peak;
}

async function run(): Promise<void> {
  const engine = audioEngine;
  await engine.resumeContext();
  engine.stopTransport();
  engine.setPlaybackMode('song_arrangement');
  engine.setBpm(120);
  const device = engine.createDevice('subtractor', 'Cold scheduler transport probe');
  const track = engine.tracks.find((candidate) => candidate.deviceId === device.id) as SequencerTrack | undefined;
  const output = device.audioOutputs.get('out_l');
  if (!track || !output) throw new Error('Cold-start probe could not create its instrument track/output.');
  const analyser = engine.ctx.createAnalyser();
  analyser.fftSize = 2048;
  output.connect(analyser).connect(engine.ctx.destination);
  track.arrangementClips = [{
    id: 'cold_scheduler_note', kind: 'notes', startBar: 0, lengthBars: 1, name: 'Cold scheduler note',
    notes: [{ step: 0, note: 60, velocity: 0.85, length: 4 }],
  }];
  try {
    await engine.startTransport();
    // Simulate a cold startup/temporary main-thread stall after the worker has been armed.
    const blockedUntil = performance.now() + 700;
    while (performance.now() < blockedUntil) {
      // Deliberately block only this test page; AudioContext time continues to advance.
    }
    let peak = 0;
    for (let i = 0; i < 28; i++) {
      await pause(20);
      peak = Math.max(peak, peakOf(analyser));
    }
    if (peak <= 1e-4) throw new Error(`Delayed first scheduler tick lost the first arrangement note (peak ${peak.toExponential(2)}).`);
    result.dataset.status = 'passed';
    result.textContent = `PASS · A 700 ms delayed first scheduler tick rebased to AudioContext time and played the arrangement note (peak ${peak.toFixed(4)}).`;
  } finally {
    engine.stopTransport();
    try { analyser.disconnect(); } catch {}
    engine.removeDevice(device.id, true);
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
