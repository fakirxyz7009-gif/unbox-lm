import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'CV Shared Realtime Scheduler Regression');
  await audioEngine.resumeContext();
  audioEngine.stopTransport();

  const privateEngine = audioEngine as unknown as { realtimeTasks: Set<unknown>; realtimeTimer: unknown; isPlaying: boolean };
  const baselineTasks = privateEngine.realtimeTasks.size;
  const pulsar = audioEngine.createDevice('pulsar', 'Shared CV LFO');
  const target = audioEngine.createDevice('subtractor', 'Shared CV Target');
  const values: number[] = [];
  target.cvInputs.set('cv_cutoff', { setter: (value) => values.push(value) });
  try {
    pulsar.setParam('rate1', 6);
    pulsar.setParam('depth1', 0.8);
    pulsar.setParam('shape1', 'sine');
    const cable = audioEngine.connectCV(pulsar.id, 'lfo1_out', target.id, 'cv_cutoff', 1);
    expect(cable, 'Could not connect Pulsar LFO to the target CV input.');
    expect(privateEngine.realtimeTasks.size === baselineTasks + 1, 'A live CV cable did not register one shared realtime task.');

    // A fresh Chrome profile can take more than the 160 ms former window to spin up a Blob
    // worker. The immediate queued tick proves registration; wait up to 600 ms for the worker
    // to demonstrate repeated AudioContext-time delivery without weakening the three-update
    // requirement.
    for (let index = 0; index < 30 && values.length < 3; index++) await wait(20);
    const span = Math.max(...values) - Math.min(...values);
    expect(values.length >= 3, `Shared CV task updated only ${values.length} time(s); realtime tasks ${privateEngine.realtimeTasks.size}, expected ${baselineTasks + 1}, stopped timer ${privateEngine.realtimeTimer ? 'present' : 'missing'}, playing ${privateEngine.isPlaying}.`);
    expect(span > 0.05, `Shared CV task did not vary the LFO value (span ${span.toFixed(4)}).`);

    audioEngine.disconnectCV(cable);
    expect(privateEngine.realtimeTasks.size === baselineTasks, 'Removing the last CV cable left its shared realtime task active.');
    result.dataset.status = 'passed';
    result.textContent = `PASS · one shared CV task delivered ${values.length} AudioContext-time LFO updates across ${span.toFixed(4)} range and retired with its cable.`;
  } finally {
    audioEngine.removeDevice(target.id, true);
    audioEngine.removeDevice(pulsar.id, true);
  }
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
