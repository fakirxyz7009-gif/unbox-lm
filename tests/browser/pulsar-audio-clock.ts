import { BaseDevice } from '../../src/audio/BaseDevice.ts';
import { CVEngine } from '../../src/audio/CVEngine.ts';
import { PulsarDevice } from '../../src/audio/devices/PulsarDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

class CvProbeTarget extends BaseDevice {
  public values: number[] = [];

  constructor(ctx: AudioContext) {
    super(ctx, 'pulsar_target', 'Pulsar CV target', 'spider_cv', 1);
    this.cvInputs.set('amount', { setter: (value) => this.values.push(value) });
  }

  public setParam(_key: string, _value: unknown): void {}
}

async function run(): Promise<void> {
  const context = new AudioContext();
  const originalRaf = window.requestAnimationFrame;
  let requestedFrames = 0;
  window.requestAnimationFrame = ((_callback: FrameRequestCallback) => {
    requestedFrames++;
    return 1;
  }) as typeof window.requestAnimationFrame;

  const pulsar = new PulsarDevice(context, 'pulsar_audio_clock');
  const target = new CvProbeTarget(context);
  const cv = new CVEngine();
  try {
    pulsar.setParam('rate1', 2);
    pulsar.setParam('depth1', 0.9);
    pulsar.setParam('shape1', 'sine');
    const lfo = pulsar.cvOutputs.get('lfo1_out')?.getter;
    expect(lfo, 'Pulsar did not expose LFO 1 CV.');
    const values = [0, 0.125, 0.25, 0.375, 0.5].map((time) => lfo(time));
    const span = Math.max(...values) - Math.min(...values);
    expect(span > 1.2, `Audio-clock sine LFO did not sweep (span ${span.toFixed(4)}).`);
    expect(requestedFrames === 0, `Pulsar requested ${requestedFrames} animation frame(s) for audio CV.`);

    cv.registerDevice(pulsar);
    cv.registerDevice(target);
    cv.addMatrixEntry({ sourceDeviceId: pulsar.id, sourcePortId: 'lfo1_out', targetDeviceId: target.id, targetParam: 'amount', amount: 1, offset: 0, inverted: false });
    const controlTime = 0.375;
    const expected = lfo(controlTime);
    cv.tickCV(controlTime);
    expect(Math.abs((target.values.at(-1) ?? NaN) - expected) < 1e-9, 'CV engine did not evaluate Pulsar at its scheduled audio time.');

    pulsar.setParam('shape1', 'random');
    const heldA = lfo(0.31);
    const heldB = lfo(0.34);
    expect(heldA === heldB, 'Sample-and-hold CV changed within a single audio-clock cycle.');
    pulsar.isPowered = false;
    expect(lfo(0.6) === 0, 'Powered-off Pulsar did not output zero CV.');
    pulsar.isPowered = true;

    const offline = new OfflineAudioContext(1, 44_100, 44_100);
    const offlinePulsar = new PulsarDevice(offline as unknown as AudioContext, 'offline_pulsar');
    offlinePulsar.setParam('rate1', 2);
    offlinePulsar.setParam('depth1', 0.9);
    offlinePulsar.setParam('shape1', 'sine');
    const offlineLfo = offlinePulsar.cvOutputs.get('lfo1_out')?.getter;
    expect(offlineLfo && Number.isFinite(offlineLfo(0.375)), 'Offline Pulsar did not evaluate at a requested audio time.');
    offlinePulsar.dispose();

    result.dataset.status = 'passed';
    result.textContent = `PASS · Pulsar evaluated audio-clock CV across ${span.toFixed(3)} range, routed the exact scheduled value ${expected.toFixed(4)}, used no animation-frame loop, and exposed deterministic offline values.`;
  } finally {
    window.requestAnimationFrame = originalRaf;
    pulsar.dispose();
    target.dispose();
    cv.dispose();
    await context.close();
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
