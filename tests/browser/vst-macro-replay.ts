import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { VstPluginDevice, type VstUnitSnapshot } from '../../src/vst/VstPluginDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

// A synth whose presets voice the tone macro (macro 1) when they are selected.
const snapshot: VstUnitSnapshot = {
  itemId: 'macro-replay-probe',
  kind: 'plugin',
  name: 'Macro Replay Probe',
  format: 'VST3',
  arch: 'x64',
  role: 'instrument',
  category: 'synth',
  macros: [
    { id: 'macro1', label: 'Tone', default: 0.5 },
    { id: 'macro2', label: 'Attack', default: 0.5 },
    { id: 'macro3', label: 'Body', default: 0.5 },
    { id: 'macro4', label: 'Space', default: 0.5 },
  ],
  hostable: true,
  path: '',
  presets: [
    { id: 'bright-lead', name: 'Bright Lead' },
    { id: 'soft-pad', name: 'Soft Pad' },
  ],
};

function expectMacro(label: string, device: VstPluginDevice, slot: 'macro1' | 'macro3', expected: number): void {
  const actual = device.params[slot];
  if (actual !== expected) throw new Error(`${label}: ${slot} should be ${expected}, got ${String(actual)}`);
}

async function run(): Promise<void> {
  audioEngine.newProject(true);

  // Mounting with a preset voices the macros; the user then moves two of them.
  const mounted = audioEngine.createVstDevice(snapshot, { name: 'Replay Probe', presetId: 'bright-lead' });
  expectMacro('mounted with a preset', mounted, 'macro1', 0.8);
  mounted.setParam('macro1', 0.3);
  mounted.setParam('macro3', 0.7);

  const json = audioEngine.exportProjectJSON();
  audioEngine.newProject(true);
  if (!audioEngine.importProjectJSON(json)) throw new Error('The saved project did not import');
  const restored = [...audioEngine.devices.values()].find(
    (device): device is VstPluginDevice => device instanceof VstPluginDevice && device.name === 'Replay Probe',
  );
  if (!restored) throw new Error('The VST unit did not come back after reopening the project');
  if (restored.params.presetId !== 'bright-lead') throw new Error(`The preset did not survive reopening: ${String(restored.params.presetId)}`);
  expectMacro('reopened project', restored, 'macro1', 0.3);
  expectMacro('reopened project', restored, 'macro3', 0.7);

  const offline = audioEngine.instantiateOffline(new OfflineAudioContext(2, 48000, 48000), restored);
  if (!(offline instanceof VstPluginDevice)) throw new Error('The offline copy is not a VST unit');
  expectMacro('offline copy', offline, 'macro1', 0.3);
  expectMacro('offline copy', offline, 'macro3', 0.7);

  // Choosing another preset still voices the macros.
  restored.setParam('presetId', 'soft-pad');
  expectMacro('soft pad selected', restored, 'macro1', 0.25);

  result!.dataset.status = 'passed';
  result!.textContent = 'PASS · a reopened project and its offline copy keep the saved macros (tone 0.3, body 0.7) instead of the preset voicing (0.8); choosing a preset still voices the macros (soft pad 0.25).';
}

void run().catch((error: unknown) => {
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
