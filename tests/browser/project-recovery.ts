import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { dbGet, dbPut } from '../../src/project/db.ts';
import { projectManager, type ProjectRecord, type RecoveryRecord } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function persistRecovery(record: RecoveryRecord): Promise<void> {
  await dbPut('settings', { key: 'recovery', value: JSON.stringify(record) });
}

function recoveredProjectId(): string | null {
  return projectManager.recovery?.projectId ?? null;
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  // Switching projects with unsaved edits and autosave off asks first; the probe answers and records the prompt.
  const prompts: string[] = [];
  let answer = true;
  window.confirm = (message?: string) => {
    prompts.push(message ?? '');
    return answer;
  };

  const beforeRejectedImport = audioEngine.exportProjectJSON();
  expect(!audioEngine.importProjectJSON(JSON.stringify({ format: 'unbox-project', version: 5, devices: [] })),
    'A project from a newer unsupported format version was accepted');
  expect(!audioEngine.importProjectJSON(JSON.stringify({ format: 'unbox-project', version: 4, devices: [], tracks: {} })),
    'A project with a malformed track list was accepted');
  const unsupportedDeviceProject = JSON.parse(beforeRejectedImport) as { devices: { type: string }[] };
  unsupportedDeviceProject.devices[0]!.type = 'missing_device_type';
  expect(!audioEngine.importProjectJSON(JSON.stringify(unsupportedDeviceProject)),
    'A project with an unsupported device type was accepted');
  expect(!audioEngine.importProjectJSON(JSON.stringify({
    format: 'unbox-project', version: 4,
    devices: [{ id: 'missing-vst', type: 'vst_effect', vst: { itemId: 'effect-1', macros: [] } }],
  })), 'A VST device without a rebuildable snapshot was accepted');
  expect(audioEngine.exportProjectJSON() === beforeRejectedImport,
    'A rejected project import changed the currently open session');

  await projectManager.create('empty', 'Last Saved Project');
  const baseId = projectManager.currentId;
  expect(!!baseId, 'Could not create the base project');
  audioEngine.setBpm(91);
  audioEngine.commitEdit();
  await projectManager.save();
  const baseBefore = await dbGet<ProjectRecord>('projects', baseId);
  expect(!!baseBefore, 'The base project was not saved');

  await projectManager.create('empty', 'Recovery Target');
  const targetId = projectManager.currentId;
  expect(!!targetId && targetId !== baseId, 'Could not create a distinct recovery target project');
  audioEngine.setBpm(103);
  audioEngine.commitEdit();
  await projectManager.save();
  const targetBefore = await dbGet<ProjectRecord>('projects', targetId);
  expect(!!targetBefore, 'The recovery target project was not saved');

  audioEngine.setBpm(131);
  audioEngine.commitEdit();
  projectManager.setNotes('Recovered edits for the existing target project.');
  const targetRecoveryJson = audioEngine.exportProjectJSON();
  // Declining the prompt keeps the open project and its unsaved edits.
  answer = false;
  expect(!(await projectManager.open(baseId)), 'Declining the discard prompt still switched projects');
  expect(projectManager.currentId === targetId && audioEngine.bpm === 131,
    'Declining the discard prompt lost the open project’s unsaved edits');
  answer = true;
  expect(await projectManager.open(baseId), 'Could not simulate startup into the last saved project');
  expect(prompts.some((message) => message.includes('Discard them and open Last Saved Project')),
    'Switching away from unsaved edits did not ask before discarding them');
  const existingTargetRecovery: RecoveryRecord = {
    json: targetRecoveryJson,
    at: Date.now(),
    name: 'Recovery Target',
    projectId: targetId,
  };
  await persistRecovery(existingTargetRecovery);
  projectManager.autosaveSec = 2;
  projectManager.autosave = true;
  await projectManager.init();
  await pause(2200);
  expect(recoveredProjectId() === targetId,
    'An autosave tick discarded recovery for a different project while the open project was clean');
  projectManager.autosave = false;

  expect(await projectManager.restoreRecovery(), 'Could not restore the existing-project recovery');
  expect(projectManager.currentId === targetId, 'Recovery was written into the last-open project instead of its recorded project');
  expect(String(projectManager.currentName) === 'Recovery Target', 'Recovery did not restore its recorded project name');
  const baseAfterExistingRestore = await dbGet<ProjectRecord>('projects', baseId);
  const targetAfterRestore = await dbGet<ProjectRecord>('projects', targetId);
  const lastProjectAfterExistingRestore = await dbGet<{ key: string; value: string }>('settings', 'lastProjectId');
  const recoveryAfterExistingRestore = await dbGet<{ key: string; value: string }>('settings', 'recovery');
  expect(baseAfterExistingRestore?.json === baseBefore.json, 'Restoring another project overwrote the last saved project');
  expect(targetAfterRestore?.bpm === 131, 'The recovery snapshot was not saved into its recorded project');
  expect(lastProjectAfterExistingRestore?.value === targetId, 'The last-project pointer was not moved to the restored project');
  expect(!recoveryAfterExistingRestore, 'A successfully saved recovery record was left behind');
  expect(await projectManager.open(targetId), 'Could not reload the recovered target project');
  expect(audioEngine.bpm === 131 && projectManager.notes === 'Recovered edits for the existing target project.',
    'Recovered target content did not survive a fresh IndexedDB load');

  const sameContentOtherProjectRecovery: RecoveryRecord = {
    json: targetAfterRestore.json,
    at: Date.now(),
    name: 'Other project with matching content',
    projectId: baseId,
  };
  await persistRecovery(sameContentOtherProjectRecovery);
  projectManager.recovery = null;
  await projectManager.init();
  expect(recoveredProjectId() === baseId,
    'Startup discarded a recovery for another project because its content matched the current save');
  await projectManager.discardRecovery();

  audioEngine.newProject(true);
  audioEngine.setBpm(143);
  audioEngine.commitEdit();
  projectManager.setNotes('Recovered edits from an interrupted new-project save.');
  const newProjectRecoveryJson = audioEngine.exportProjectJSON();
  expect(await projectManager.open(baseId), 'Could not simulate startup before an interrupted Save As');
  const interruptedSaveAsRecovery: RecoveryRecord = {
    json: newProjectRecoveryJson,
    at: Date.now(),
    name: 'Recovered New Project',
    projectId: 'project-not-yet-created',
  };
  await persistRecovery(interruptedSaveAsRecovery);
  projectManager.recovery = interruptedSaveAsRecovery;

  expect(await projectManager.restoreRecovery(), 'Could not restore the interrupted Save As recovery');
  const recoveredNewId = projectManager.currentId;
  expect(!!recoveredNewId && recoveredNewId !== baseId && recoveredNewId !== targetId,
    'An interrupted new-project recovery reused an unrelated project id');
  expect(String(projectManager.currentName) === 'Recovered New Project', 'The new recovery project lost its recorded name');
  const recoveredNewProject = await dbGet<ProjectRecord>('projects', recoveredNewId);
  const baseAfterNewRestore = await dbGet<ProjectRecord>('projects', baseId);
  const targetAfterNewRestore = await dbGet<ProjectRecord>('projects', targetId);
  const lastProjectAfterNewRestore = await dbGet<{ key: string; value: string }>('settings', 'lastProjectId');
  const recoveryAfterNewRestore = await dbGet<{ key: string; value: string }>('settings', 'recovery');
  expect(recoveredNewProject?.bpm === 143, 'The interrupted new project was not saved under its own record');
  expect(baseAfterNewRestore?.json === baseBefore.json, 'New-project recovery overwrote the last saved project');
  expect(targetAfterNewRestore?.json === targetAfterRestore?.json, 'New-project recovery overwrote the prior recovery target');
  expect(lastProjectAfterNewRestore?.value === recoveredNewId, 'The last-project pointer was not updated after recovery');
  expect(!recoveryAfterNewRestore, 'The interrupted Save As recovery record was not cleared after saving');
  expect(await projectManager.open(recoveredNewId), 'Could not reload the recovered new project');
  expect(Number(audioEngine.bpm) === 143 && String(projectManager.notes) === 'Recovered edits from an interrupted new-project save.',
    'Recovered new-project content did not survive a fresh IndexedDB load');

  result!.dataset.status = 'passed';
  result!.textContent = 'PASS · malformed, future-version, unsupported-device and incomplete VST imports leave the open session intact; recovery and interrupted Save As remain safe.';
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
