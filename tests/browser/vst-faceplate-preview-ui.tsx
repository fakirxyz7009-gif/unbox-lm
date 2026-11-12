import React from 'react';
import { createRoot } from 'react-dom/client';
import { VstFaceplate } from '../../src/rack/VstFaceplate.tsx';
import type { VstPluginDevice } from '../../src/vst/VstPluginDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 120; i++) { if (test()) return; await wait(16); }
  throw new Error(message);
}

async function run(): Promise<void> {
  let previewing = false;
  const device = {
    snapshot: { name: 'Preview probe', vendor: 'Unbox test', format: 'VST3', arch: 'x64', category: 'synth', macros: [], presets: [], previewId: 'preview-probe' },
    macroSpecs: [],
    analyser: { fftSize: 32, getFloatTimeDomainData: (data: Float32Array) => data.fill(0) },
    role: 'effect',
    params: { mix: 1, output: 0.9, presetId: '' },
    proxyLabel: 'test proxy',
    currentPreset: undefined,
    previewId: 'preview-probe',
    get isPreviewing() { return previewing; },
    async togglePreview() { previewing = !previewing; return previewing; },
    setParam: () => undefined,
  } as unknown as VstPluginDevice;
  const originalInterval = window.setInterval;
  let intervals = 0;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    intervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;
  try {
    root.render(<VstFaceplate device={device} onUpdate={() => undefined} onMessage={() => undefined} />);
    await until(() => !!document.querySelector('button'), 'Proxy preview control did not mount');
    const previewButton = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Audition') || button.textContent?.includes('Stop preview'));
    const first = previewButton();
    expect(first, 'Proxy preview button is missing');
    first.click();
    await until(() => previewButton()?.textContent?.includes('Stop preview') === true, 'Preview start did not update the faceplate');
    previewing = false;
    await until(() => previewButton()?.textContent?.includes('Audition') === true, 'Shared frame loop did not reflect preview completion');
    expect(intervals === 0, `Proxy faceplate created ${intervals} window interval(s) to observe preview completion`);
    result.dataset.status = 'passed';
    result.textContent = 'PASS · Proxy preview start/end state follows the shared frame loop with no component-owned window interval.';
  } finally {
    root.unmount();
    window.setInterval = originalInterval;
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
