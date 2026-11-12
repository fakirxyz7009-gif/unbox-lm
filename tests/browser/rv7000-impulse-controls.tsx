import React from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { RV7000Device } from '../../src/audio/devices/RV7000Device.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { DeviceFaceplate } from '../../src/components/faceplates/DeviceFaceplate.tsx';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const near = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1e-6;

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const FaceplateProbe: React.FC<{ device: RV7000Device }> = ({ device }) => {
  const [, rerender] = React.useState(0);
  return <DeviceFaceplate device={device} onUpdate={() => rerender((version) => version + 1)} />;
};

async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (test()) return;
    await wait(16);
  }
  throw new Error(message);
}

async function run(): Promise<void> {
  const device = audioEngine.createDevice('rv7000', 'Project Audio IR Faceplate Probe') as RV7000Device;
  let assetId: string | undefined;
  try {
    root.render(<FaceplateProbe device={device} />);
    const selector = () => editor.querySelector<HTMLSelectElement>('select[aria-label="Use project audio as the custom impulse response"]');
    await until(() => !!selector(), 'RV7000 project-audio selector did not mount');

    // Add after mounting: the faceplate must subscribe to the shared audio store so recorded
    // takes and imported clips become selectable without reopening the rack.
    const response = audioEngine.ctx.createBuffer(2, 96, audioEngine.ctx.sampleRate);
    response.getChannelData(0)[0] = 0.82;
    response.getChannelData(1)[0] = 0.47;
    response.getChannelData(0)[31] = -0.19;
    const asset = audioStore.add('Captured IR Take', response);
    assetId = asset.id;
    await until(() => !!selector()?.querySelector(`option[value="${asset.id}"]`), 'New project audio did not appear in the RV7000 selector');

    const select = selector()!;
    select.value = asset.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const convolver = Reflect.get(device, 'convolver') as ConvolverNode;
    await until(() => device.params.impulseAssetId === asset.id && near(convolver.buffer?.getChannelData(0)[31], -0.19), 'Selecting project audio did not replace the RV7000 impulse');
    expect(near(convolver.buffer?.getChannelData(0)[0], 0.82) && near(convolver.buffer?.getChannelData(1)[0], 0.47), 'RV7000 did not keep the selected project-audio channels');

    await until(() => [...editor.querySelectorAll<HTMLButtonElement>('button')].some((button) => button.textContent?.trim() === 'RESET IR'), 'RV7000 reset-IR control did not appear after project-audio selection');
    const reset = [...editor.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'RESET IR');
    expect(reset, 'RV7000 reset-IR control disappeared before it could be used');
    reset.click();
    await until(() => !device.params.impulseAssetId && !near(convolver.buffer?.getChannelData(0)[0], 0.82), 'Reset IR did not restore the deterministic built-in response');

    result.dataset.status = 'passed';
    result.textContent = 'PASS · RV7000 live-updated its selector for a captured project-audio take, installed its stereo IR, and restored the built-in response on reset.';
  } finally {
    root.unmount();
    audioEngine.removeDevice(device.id, true);
    if (assetId) await audioStore.remove(assetId);
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
