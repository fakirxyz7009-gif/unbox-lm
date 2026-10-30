import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Shared Realtime Scheduler Regression');
  await audioEngine.resumeContext();
  audioEngine.stopTransport();

  const originalInterval = window.setInterval;
  let windowIntervals = 0;
  const created: string[] = [];
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    windowIntervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;

  try {
    // A stopped alligator owns a tempo clock, while the other three cover
    // held-pad repeats, formant movement and wavetable movement respectively.
    const alligator = audioEngine.createDevice('alligator', 'Shared Clock Gate');
    const kong = audioEngine.createDevice('kong', 'Shared Repeat Drums');
    const humana = audioEngine.createDevice('humana', 'Shared Formants');
    const malstrom = audioEngine.createDevice('malstrom', 'Shared Wavetable Motion');
    created.push(alligator.id, kong.id, humana.id, malstrom.id);
    await Promise.all([kong.ready?.(), humana.ready?.(), malstrom.ready?.()]);

    kong.setParam('noteRepeat', 4); // 1/16
    humana.setParam('vowelMotion', 0.55);
    malstrom.setParam('motionDepth', 0.6);
    const at = audioEngine.ctx.currentTime + 0.03;
    kong.noteOn(36, 0.85, at);
    humana.noteOn(60, 0.75, at);
    malstrom.noteOn(60, 0.75, at);

    let kongPeak = 0;
    let humanaPeak = 0;
    let malstromPeak = 0;
    for (let index = 0; index < 24; index++) {
      await wait(20);
      const kongLevels = audioEngine.getTrackStereoLevels(kong.id);
      const humanaLevels = audioEngine.getTrackStereoLevels(humana.id);
      const malstromLevels = audioEngine.getTrackStereoLevels(malstrom.id);
      kongPeak = Math.max(kongPeak, kongLevels.peakL, kongLevels.peakR);
      humanaPeak = Math.max(humanaPeak, humanaLevels.peakL, humanaLevels.peakR);
      malstromPeak = Math.max(malstromPeak, malstromLevels.peakL, malstromLevels.peakR);
    }
    kong.noteOff(36, audioEngine.ctx.currentTime);
    humana.noteOff(60, audioEngine.ctx.currentTime);
    malstrom.noteOff(60, audioEngine.ctx.currentTime);

    const alligatorStep = (alligator as unknown as { meter(): Record<string, number> }).meter().step ?? -1;
    const repeatedAt = (kong as unknown as { meter(): Record<string, number> }).meter().lastAt ?? 0;
    const formantMotion = (humana as unknown as { meter(): Record<string, number> }).meter().motion ?? 0;
    const wavetableMotion = (malstrom as unknown as { meter(): Record<string, number> }).meter().motion ?? 0;
    expect(windowIntervals === 0, `Realtime engines created ${windowIntervals} device-owned window interval(s).`);
    expect(alligatorStep >= 0, 'Stopped Alligator clock never advanced a pattern step.');
    expect(repeatedAt > at + 0.15, `Held pad was not retriggered after its initial hit (last ${repeatedAt.toFixed(3)} s, initial ${at.toFixed(3)} s).`);
    expect(formantMotion > 0.01, `Formant motion did not advance (${formantMotion.toFixed(4)} rad).`);
    expect(wavetableMotion > 0.01, `Wavetable motion did not advance (${wavetableMotion.toFixed(4)} rad).`);
    expect(kongPeak > 1e-4, `Held note-repeat pad was silent (peak ${kongPeak.toExponential(2)}).`);
    expect(humanaPeak > 1e-4, `Formant instrument was silent (peak ${humanaPeak.toExponential(2)}).`);
    expect(malstromPeak > 1e-4, `Wavetable instrument was silent (peak ${malstromPeak.toExponential(2)}).`);

    result.dataset.status = 'passed';
    result.textContent = `PASS · shared realtime scheduler advanced clock step ${alligatorStep}, repeated a held pad at ${repeatedAt.toFixed(3)} s, moved formant/wavetable phases ${formantMotion.toFixed(3)} / ${wavetableMotion.toFixed(3)} rad, and kept all engines audible without device window intervals (peaks ${kongPeak.toFixed(4)} / ${humanaPeak.toFixed(4)} / ${malstromPeak.toFixed(4)}).`;
  } finally {
    window.setInterval = originalInterval;
    created.forEach((id) => audioEngine.removeDevice(id));
  }
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
