import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Player Realtime Scheduler Regression');
  await audioEngine.resumeContext();
  audioEngine.stopTransport();

  const originalInterval = window.setInterval;
  let intervals = 0;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    intervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;

  const synth = audioEngine.createDevice('subtractor', 'Player Clock Synth');
  const arp = audioEngine.createDevice('rpg8', 'Player Clock Arp');
  const engineState = audioEngine as unknown as { realtimeTasks: Set<unknown>; realtimeTimer: unknown; isPlaying: boolean };
  const noteOn = synth.noteOn.bind(synth);
  let scheduledNotes = 0;
  const player = arp as unknown as { target: string | null; engine: { player?: { tick?: (...args: unknown[]) => void } } };
  const tick = player.engine.player?.tick?.bind(player.engine.player);
  let ticks = 0;
  if (tick) player.engine.player!.tick = (...args: unknown[]) => { ticks++; tick(...args); };
  synth.noteOn = (note, velocity, time) => {
    scheduledNotes++;
    noteOn(note, velocity, time);
  };
  try {
    audioEngine.setPlayerTarget(arp.id, synth.id);
    audioEngine.liveNoteOn(synth, 60, 0.82);

    let peak = 0;
    let sourcePeak = 0;
    const waveform = new Float32Array(synth.analyser.fftSize);
    for (let index = 0; index < 18; index++) {
      await wait(20);
      const levels = audioEngine.getTrackStereoLevels(synth.id);
      peak = Math.max(peak, levels.peakL, levels.peakR);
      synth.analyser.getFloatTimeDomainData(waveform);
      for (const sample of waveform) sourcePeak = Math.max(sourcePeak, Math.abs(sample));
    }
    audioEngine.liveNoteOff(synth, 60);
    await wait(80);

    expect(intervals === 0, `Live player created ${intervals} window interval(s).`);
    expect(scheduledNotes > 0, `Held live arpeggiator never scheduled a synth note (target ${player.target ?? 'none'}, ticks ${ticks}, tasks ${engineState.realtimeTasks.size}, timer ${engineState.realtimeTimer ? 'present' : 'missing'}, playing ${engineState.isPlaying}).`);
    expect(sourcePeak > 1e-4, `Held live arpeggiator scheduled notes but rendered no source audio (peak ${sourcePeak.toExponential(2)}).`);
    result.dataset.status = 'passed';
    result.textContent = `PASS · shared realtime scheduler emitted ${scheduledNotes} held live arpeggiator note(s) at ${sourcePeak.toFixed(4)} source peak without a window interval; mixer peak observed ${peak.toFixed(4)}.`;
  } finally {
    window.setInterval = originalInterval;
    audioEngine.removeDevice(arp.id, true);
    audioEngine.removeDevice(synth.id, true);
  }
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
