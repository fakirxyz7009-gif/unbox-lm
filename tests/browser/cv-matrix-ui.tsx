import React from 'react';
import { createRoot } from 'react-dom/client';
import type { BaseDevice } from '../../src/audio/BaseDevice.ts';
import { CVEngine } from '../../src/audio/CVEngine.ts';
import { CVMatrixModal } from '../../src/components/CVMatrixModal.tsx';

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
  const cvEngine = new CVEngine();
  const source = {
    id: 'probe-source', name: 'Probe LFO', isPowered: true, ctx: { currentTime: 0 },
    ports: [{ id: 'lfo', name: 'LFO', type: 'cv_out' }], cvOutputs: new Map(), cvInputs: new Map(),
  } as unknown as BaseDevice;
  const target = {
    id: 'probe-target', name: 'Probe Filter', isPowered: true, ctx: { currentTime: 0 },
    ports: [{ id: 'cutoff', name: 'Cutoff', type: 'cv_in' }], cvOutputs: new Map(), cvInputs: new Map(),
  } as unknown as BaseDevice;
  cvEngine.registerDevice(source);
  cvEngine.registerDevice(target);
  const originalInterval = window.setInterval;
  let intervals = 0;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    intervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;
  try {
    root.render(<CVMatrixModal isOpen onClose={() => undefined} devices={[source, target]} cvEngine={cvEngine} />);
    await until(() => !!document.querySelector('button'), 'CV Matrix did not mount');
    const add = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('ADD CV ROUTE'));
    expect(add, 'CV Matrix add-route button is missing');
    add.click();
    await until(() => cvEngine.matrixEntries.length === 1, 'Adding a CV route did not create a mapping');
    const entryId = cvEngine.matrixEntries[0]!.id;
    await until(() => !!document.querySelector(`[data-testid="cv-meter-${entryId}"]`), 'Structural matrix notification did not render the live meter');
    cvEngine.liveMeterValues.set(entryId, 0.4);
    const fill = document.querySelector<HTMLElement>(`[data-testid="cv-meter-fill-${entryId}"]`)!;
    const meter = document.querySelector<HTMLElement>(`[data-testid="cv-meter-${entryId}"]`)!;
    await until(() => Math.abs(Number.parseFloat(fill.style.width) - 70) < 0.01 && meter.getAttribute('aria-valuenow') === '0.40', 'Live CV meter did not update through the shared frame loop');
    expect(intervals === 0, `CV Matrix created ${intervals} window interval(s) for its meter`);
    cvEngine.removeMatrixEntry(entryId);
    await until(() => !document.querySelector(`[data-testid="cv-meter-${entryId}"]`), 'Removing a mapping did not structurally rerender the matrix');
    result.dataset.status = 'passed';
    result.textContent = 'PASS · CV Matrix structural edits rerender through subscriptions; its live meter reached 70.0% / +0.40 V with no window interval.';
  } finally {
    root.unmount();
    window.setInterval = originalInterval;
    cvEngine.dispose();
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
