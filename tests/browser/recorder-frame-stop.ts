import { WorkletCapture, ensureRecorderWorklet } from '../../src/audio/recording/recorderWorklet.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const ctx = new AudioContext();
  const source = ctx.createConstantSource();
  let capture: WorkletCapture | null = null;
  try {
    if (!(await ensureRecorderWorklet(ctx))) throw new Error('Recorder AudioWorklet did not load.');
    await ctx.resume();
    source.offset.value = 0.25;
    capture = new WorkletCapture(ctx, source, 1);
    source.start();
    // The capture start promise resolves from the audio worklet itself, so the
    // stop boundary is not gated by a wall-clock settle delay.
    await capture.start();
    const stopTime = ctx.currentTime + 0.24;
    const expectedFrame = Math.round(stopTime * ctx.sampleRate);
    await capture.stopAt(stopTime);
    const data = await capture.stop();
    const frames = data.channels[0]?.length ?? 0;
    const actualEndFrame = data.frame + frames;
    const max = data.channels[0]?.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) ?? 0;
    if (!frames || max < 0.1) throw new Error(`Recorder captured no live signal (frames ${frames}, peak ${max}).`);
    if (Math.abs(actualEndFrame - expectedFrame) > 1) {
      throw new Error(`Recorder ended at frame ${actualEndFrame}, expected exact punch frame ${expectedFrame}.`);
    }
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · recorder cut live audio at exact frame ${actualEndFrame} (${frames} frames, peak ${max.toFixed(2)}).`;
  } finally {
    try { source.stop(); } catch {}
    if (capture) await capture.stop();
    await ctx.close();
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
