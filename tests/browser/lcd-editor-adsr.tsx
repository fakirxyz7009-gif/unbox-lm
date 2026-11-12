import React from 'react';
import '../../src/index.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import { createRoot } from 'react-dom/client';
import { audioEngine as engine } from '../../src/audio/AudioEngine.ts';
import { setPadSample, deviceSample } from '../../src/audio/deviceSamples.ts';
import { drumLanesFor } from '../../src/audio/drumLanes.ts';
import { undoJournal } from '../../src/audio/undoJournal.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import { LcdEditor } from '../../src/workstation/LcdEditor.tsx';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 100; i++) { if (test()) return; await wait(20); }
  throw new Error(message);
}

function mount(): void {
  const dev = [...engine.devices.values()].find((item) => item.name === 'ADSR Regression Kong')!;
  const track = engine.tracks.find((item) => item.deviceId === dev.id)!;
  root.render(<LcdEditor dev={dev} track={track} parts={[track]} page="easy" onPage={() => undefined} />);
}

function moveAttack(): void {
  const slider = editor.querySelector<HTMLElement>('[role="slider"][aria-label="A"]')
    ?? editor.querySelector<HTMLElement>('[role="slider"][aria-label="Attack"]');
  expect(slider, 'ADSR attack slider is missing');
  const box = slider.getBoundingClientRect();
  const pointer = (type: string, y: number) => slider.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 71, clientX: box.left + box.width / 2, clientY: y,
  }));
  // drag 60 px up from where it starts: the probe page renders without the app's utility CSS, so
  // the slider's own height cannot be relied on
  const y = box.top + box.height / 2;
  pointer('pointerdown', y);
  pointer('pointermove', y - 60);
  pointer('pointerup', y - 60);
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'LCD ADSR Regression');
  const dev = engine.createDevice('kong', 'ADSR Regression Kong');
  const note = drumLanesFor(dev)?.[0]?.note ?? 36;
  undoJournal.clear();
  mount();
  await until(() => !!editor.querySelector('button[title="Synthesizer ADSR envelopes"]'), 'LCD editor did not mount');
  editor.querySelector<HTMLButtonElement>('button[title="Synthesizer ADSR envelopes"]')!.click();
  await until(() => !!editor.querySelector('[role="slider"]'), 'ADSR page did not open');

  moveAttack();
  await wait(30);
  expect(!deviceSample(dev.id)?.pads?.[note], 'ADSR changed an uncaptured note into an empty audio assignment');
  expect(!engine.canUndo(), 'ADSR change without captured audio created an undo entry');
  expect(editor.textContent?.includes('Capture note audio'), 'ADSR change without captured audio did not explain the required capture step');

  setPadSample(dev.id, note, { audioId: 'fixture-audio', level: 1, attack: 0.01, decay: 0.25, sustain: 1, release: 0.05 });
  mount();
  await wait(30);
  editor.querySelector<HTMLButtonElement>('button[title="Synthesizer ADSR envelopes"]')!.click();
  await until(() => !!editor.querySelector('[role="slider"]'), 'ADSR page did not reopen');
  moveAttack();
  await until(() => (deviceSample(dev.id)?.pads?.[note]?.attack ?? 0) > 0.01, 'ADSR did not edit an existing captured-note assignment');
  const edited = deviceSample(dev.id)!.pads![note].attack!;
  expect(engine.undo(), 'Captured-note ADSR change did not enter undo history');
  expect(deviceSample(dev.id)?.pads?.[note]?.attack === 0.01, 'ADSR undo did not restore the captured-note envelope');
  expect(engine.redo(), 'Captured-note ADSR change did not redo');
  expect(deviceSample(dev.id)?.pads?.[note]?.attack === edited, 'ADSR redo did not restore the changed envelope');
  result.dataset.status = 'passed';
  result.textContent = 'PASS · LCD ADSR declines uncaptured notes, explains capture, and edits/undoes/redoes a captured note envelope.';
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
