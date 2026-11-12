import { WorkletCapture, ensureRecorderWorklet } from '../../src/audio/recording/recorderWorklet.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

async function run(): Promise<void> {
  const ctx = new AudioContext();
  const source = ctx.createConstantSource();
  let capture: WorkletCapture | null = null;
  const observed: { frame: number; channels: Float32Array[] }[] = [];
  try {
    if (!(await ensureRecorderWorklet(ctx))) throw new Error('Recorder AudioWorklet did not load.');
    await ctx.resume();
    source.offset.value = 0.25;
    capture = new WorkletCapture(ctx, source, 1, {
      onChunk: (chunk) => observed.push({
        frame: chunk.frame,
        // The journal observer must receive usable copies/typed arrays before
        // the normal take is assembled, including the final partial block.
        channels: chunk.channels.map((channel) => channel.slice()),
      }),
    });
    source.start();
    // The capture start promise resolves from the audio worklet itself, so the
    // stop boundary is not gated by a wall-clock settle delay.
    const startFrame = await capture.start();
    const stopTime = ctx.currentTime + 0.24;
    const expectedFrame = Math.round(stopTime * ctx.sampleRate);
    await capture.stopAt(stopTime);
    const data = await capture.stop();
    const frames = data.channels[0]?.length ?? 0;
    const actualEndFrame = data.frame + frames;
    const max = data.channels[0]?.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) ?? 0;
    if (!frames || max < 0.1) throw new Error(`Recorder captured no live signal (frames ${frames}, peak ${max}).`);
    if (!observed.length) throw new Error('Recorder journal observer received no worklet blocks.');
    const observedFrames = observed.reduce((total, chunk) => total + (chunk.channels[0]?.length ?? 0), 0);
    if (observedFrames < ctx.sampleRate * 0.20) throw new Error(`Only ${observedFrames} PCM frames reached the recorder.`);
    const firstObserved = observed[0];
    const lastObserved = observed[observed.length - 1];
    const observedEndFrame = lastObserved.frame + (lastObserved.channels[0]?.length ?? 0);
    if (startFrame !== data.frame || firstObserved.frame !== data.frame || observedEndFrame !== actualEndFrame) {
      throw new Error(
        `Journal observer blocks do not match take (start ${firstObserved.frame}/${data.frame}, end ${observedEndFrame}/${actualEndFrame}, frames ${observedFrames}/${frames}).`,
      );
    }
    const expected = new Float32Array(frames);
    let previousEnd = data.frame;
    for (const chunk of observed) {
      if (chunk.frame < previousEnd) throw new Error(`Recorder blocks overlap at frame ${chunk.frame}.`);
      expected.set(chunk.channels[0], chunk.frame - data.frame);
      previousEnd = chunk.frame + chunk.channels[0].length;
    }
    if (!data.channels[0].every((sample, index) => sample === expected[index])) {
      throw new Error('The returned take differs from the journal blocks or failed to preserve a capture gap as silence.');
    }
    const observedPeak = observed.reduce(
      (peak, chunk) => Math.max(peak, chunk.channels[0]?.reduce((blockPeak, value) => Math.max(blockPeak, Math.abs(value)), 0) ?? 0),
      0,
    );
    if (observedPeak < 0.1) throw new Error(`Recorder journal observer received silent blocks (peak ${observedPeak}).`);
    if (Math.abs(actualEndFrame - expectedFrame) > 1) {
      throw new Error(`Recorder ended at frame ${actualEndFrame}, expected exact punch frame ${expectedFrame}.`);
    }
    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · recorder cut live audio at exact frame ${actualEndFrame}; ${observed.length} journal blocks matched ${observedFrames} captured frames and ${frames - observedFrames} gap frames.`;
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
