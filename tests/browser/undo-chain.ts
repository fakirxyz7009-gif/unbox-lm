import { audioEngine as engine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import { undoJournal } from '../../src/audio/undoJournal.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Mixed Undo Regression');
  const original = engine.createDevice('rec_vcsl_marimba', 'Undo Marimba');
  const initial = Number(original.params.volume);
  undoJournal.clear();
  original.setParam('volume', 0.6);
  engine.changed();
  engine.createDevice('echo', 'Undo Delay');
  expect(engine.undo(), 'Adding a device did not enter undo history');
  expect(![...engine.devices.values()].some((device) => device.name === 'Undo Delay'), 'Undo did not remove the delay');
  expect(engine.undo(), 'Structural undo discarded the earlier parameter history');
  const current = [...engine.devices.values()].find((device) => device.name === 'Undo Marimba')!;
  expect(current && Math.abs(Number(current.params.volume) - initial) < 1e-6, 'Parameter undo targeted a disposed graph instead of the current instrument');
  expect(engine.redo(), 'Parameter redo was discarded');
  expect(Math.abs(Number(current.params.volume) - 0.6) < 1e-6, 'Parameter redo did not update the current graph');
  expect(engine.redo(), 'Structural redo was discarded');
  expect([...engine.devices.values()].some((device) => device.name === 'Undo Delay'), 'Structural redo did not restore the delay');
  expect(engine.undo() && engine.undo(), 'The mixed history cannot be traversed again');
  result.dataset.status = 'passed';
  result.textContent = 'PASS · Parameter → structural edit history survives repeated undo/redo and updates the current graph.';
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
