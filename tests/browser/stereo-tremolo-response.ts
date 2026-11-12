import { createSpecDevice } from '../../src/audio/spec/registry.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const rms = (samples: Float32Array, from: number, size: number) => {
  let energy = 0;
  for (let index = from; index < from + size; index++) energy += samples[index]! * samples[index]!;
  return Math.sqrt(energy / size);
};

async function render(depth: number): Promise<number[]> {
  const sampleRate = 48_000;
  const duration = 1.2;
  const context = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate);
  const device = createSpecDevice(context, 'stereo_tremolo', `tremolo-${depth}`);
  if (!device) throw new Error('Stereo Tremolo did not resolve to a spec device.');
  device.setParam('mix', 1);
  device.setParam('rate', 4.5);
  device.setParam('depth', depth);

  const buffer = context.createBuffer(2, context.length, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) data[index] = Math.sin((2 * Math.PI * (channel ? 331 : 277) * index) / sampleRate) * 0.2;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const left = device.audioInputs.get('in_l');
  const right = device.audioInputs.get('in_r');
  const outLeft = device.audioOutputs.get('out_l');
  const outRight = device.audioOutputs.get('out_r');
  if (!left || !right || !outLeft || !outRight) throw new Error('Stereo Tremolo is missing a stereo port.');
  const split = context.createChannelSplitter(2);
  const merge = context.createChannelMerger(2);
  source.connect(split);
  split.connect(left, 0);
  split.connect(right, 1);
  outLeft.connect(merge, 0, 0);
  outRight.connect(merge, 0, 1);
  merge.connect(context.destination);
  source.start();

  const rendered = await context.startRendering();
  const leftSamples = rendered.getChannelData(0);
  const window = 1_024;
  const values: number[] = [];
  // Skip graph-start transients, then observe enough windows for several 4.5 Hz cycles.
  for (let start = Math.floor(sampleRate * 0.2); start + window <= Math.floor(sampleRate); start += window) {
    values.push(rms(leftSamples, start, window));
  }
  device.dispose();
  return values;
}

async function run(): Promise<void> {
  const dry = await render(0);
  const wet = await render(1);
  const dryRatio = Math.min(...dry) / Math.max(...dry);
  const wetRatio = Math.min(...wet) / Math.max(...wet);
  if (dryRatio < 0.96) throw new Error(`Depth 0 unexpectedly changed level over time (${dryRatio.toFixed(3)} min/max RMS).`);
  if (wetRatio > 0.5) throw new Error(`Depth 1 did not create a measurable amplitude sweep (${wetRatio.toFixed(3)} min/max RMS).`);
  result!.dataset.status = 'passed';
  result!.textContent = `PASS · Stereo Tremolo depth 0 held ${dryRatio.toFixed(3)} min/max RMS; depth 1 swept to ${wetRatio.toFixed(3)} across ${wet.length} audio windows.`;
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.message : String(error)}`;
});
