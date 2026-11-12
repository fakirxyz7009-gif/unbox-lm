import { ThirdWaveDevice } from '../../src/audio/devices/ThirdWaveDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run(): Promise<void> {
  const context = new AudioContext();
  const device = new ThirdWaveDevice(context, 'third_wave_cleanup');
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  let nextTimer = 1;
  const scheduled: number[] = [];
  const cleared: number[] = [];

  // Keep the callbacks dormant. This makes the assertion about timer ownership
  // deterministic without waiting for each envelope stage in wall-clock time.
  window.setTimeout = ((_callback: TimerHandler, _delay?: number) => {
    const handle = nextTimer++;
    scheduled.push(handle);
    return handle;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((handle?: number) => {
    if (typeof handle === 'number') cleared.push(handle);
  }) as typeof window.clearTimeout;

  try {
    // The 25th note steals the first of 24 active voices. That voice has two
    // wave-envelope callbacks, both of which must be cleared.
    for (let note = 36; note < 60; note++) device.noteOn(note, 0.8);
    expect(scheduled.length === 48, `Expected two envelope callbacks per voice, got ${scheduled.length}.`);
    device.noteOn(60, 0.8);
    const clearedAfterSteal = cleared.length;
    expect(clearedAfterSteal === 2, `Voice stealing cleared ${clearedAfterSteal} callbacks instead of both callbacks.`);
    expect(cleared.includes(1) && cleared.includes(2), 'Voice stealing did not clear the oldest voice callbacks.');

    // A normal note-off must clear both callbacks for the new voice as well.
    device.noteOff(60);
    const clearedAfterNoteOff = cleared.length;
    expect(clearedAfterNoteOff === 4, `Note-off cleared ${clearedAfterNoteOff - 2} callbacks instead of both callbacks.`);
    expect(cleared.includes(49) && cleared.includes(50), 'Note-off did not clear both callbacks for the released voice.');

    // Disposal owns the remaining voices and must release every remaining handle.
    device.dispose();
    const clearedAfterDispose = cleared.length;
    expect(clearedAfterDispose === scheduled.length, `Dispose left ${scheduled.length - clearedAfterDispose} envelope callback(s) pending.`);
    expect(new Set(cleared).size === clearedAfterDispose, 'An envelope callback was cleared more than once.');
    result.dataset.status = 'passed';
    result.textContent = `PASS · 3rd Wave cleared all ${clearedAfterDispose} pending wave-envelope callbacks across voice stealing, note-off, and disposal.`;
  } finally {
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    try { device.dispose(); } catch { /* The device may already be disposed. */ }
    await context.close();
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
