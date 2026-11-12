import { audioEngine as engine } from '../../src/audio/AudioEngine.ts';
import { UniversalPercussionElectronicDevice } from '../../src/audio/devices/UniversalPercussionElectronicDevice.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

function selectedVoice(device: unknown): string | undefined {
  return device instanceof UniversalPercussionElectronicDevice ? device.activeSubVoice : undefined;
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Sub-voice State Regression');

  const initial = engine.createDevice('percussion_electronic', 'Xylophone', 'xylophone-close');
  expect(initial instanceof UniversalPercussionElectronicDevice, 'The generic percussion device did not mount.');
  expect(initial.params.subVoice === 'xylophone-close' && selectedVoice(initial) === 'xylophone-close', 'Selected sub-voice was not passed into the mounted device.');

  const track = engine.tracks.find((candidate) => candidate.deviceId === initial.id);
  expect(track, 'The generic percussion device has no sequencer track.');
  engine.cloneTrack(track.id);
  const copied = [...engine.devices.values()].find((device) => device.id !== initial.id && device.name === `${track.name} (Copy)`);
  expect(copied && copied.params.subVoice === 'xylophone-close' && selectedVoice(copied) === 'xylophone-close', 'Track clone lost the selected sub-voice.');

  await projectManager.save();
  const projectId = projectManager.currentId;
  expect(projectId && !projectManager.dirty, 'The sub-voice project did not save.');
  engine.newProject(true);
  expect(await projectManager.open(projectId), 'The sub-voice project did not reopen.');
  const reopened = [...engine.devices.values()].find((device) => device.name === 'Xylophone');
  expect(reopened && reopened.params.subVoice === 'xylophone-close' && selectedVoice(reopened) === 'xylophone-close', 'Project reload lost the selected sub-voice.');

  const offlineContext = new OfflineAudioContext(2, 128, engine.ctx.sampleRate);
  const offline = engine.instantiateOffline(offlineContext, reopened);
  expect(offline.params.subVoice === 'xylophone-close' && selectedVoice(offline) === 'xylophone-close', 'Offline clone lost the selected sub-voice.');
  offline.dispose();

  result.dataset.status = 'passed';
  result.textContent = 'PASS · Selected sub-voice survives mounting, track copy, IndexedDB reload, and the offline-render clone.';
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
