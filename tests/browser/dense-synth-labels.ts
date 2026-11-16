/**
 * Dense synth label-fit probe: every generic synthesis spec must render its full parameter
 * matrix at both the 1280 px rack layout and the 1476 px design threshold, with no clipped
 * parameter or section-rail labels, no control escaping its cell, and no label text below the
 * product's 11 px floor.
 *
 * The bespoke synth faces route around SpecFaceplate in DeviceFront; their own contracts are
 * separate. Everything else in the synthesis family is checked dynamically, so a new spec joins
 * this regression as soon as it exists.
 */
import '../../src/main.tsx';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import type { DeviceType } from '../../src/audio/types.ts';
import { functionFaceForSpec } from '../../src/components/faceplates/functionFace.ts';
import { DEVICE_SPECS } from '../../shared/rack/devices/index.ts';

const resultNode = document.querySelector<HTMLPreElement>('#result');
if (!resultNode) throw new Error('Missing #result');
const result: HTMLPreElement = resultNode;

const report = (status: 'passed' | 'failed', text: string): void => {
  result.dataset.status = status;
  result.textContent = text;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Wait for a DOM condition and return the first non-null value, with a named timeout. */
async function waitFor<T>(read: () => T | null | false | undefined, timeoutMs: number, label: string): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (performance.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(50);
  }
}

const nextFrames = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** DeviceFront routes these three synthesis models to their own bespoke faceplates. */
const BESPOKE_SYNTH_TYPES = new Set(['humana', 'polytone', 'prophet6']);
const denseSpecs = DEVICE_SPECS.filter(
  (spec) => functionFaceForSpec(spec).id === 'synthesis' && !BESPOKE_SYNTH_TYPES.has(spec.type),
);

interface Inspection {
  width: number;
  failures: string[];
  specs: number;
  cells: number;
  controls: number;
  labels: number;
  rails: number;
}

type DenseProbeWindow = Window & { __denseSynthProbe?: { inspect: () => Inspection } };

function unitFor(id: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-unit-id]')].find((unit) => unit.dataset.unitId === id) ?? null;
}

function clipped(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth + 1;
}

function tooSmall(element: HTMLElement): boolean {
  return Number.parseFloat(getComputedStyle(element).fontSize) < 10.99;
}

function outside(inner: DOMRect, outer: DOMRect): boolean {
  return inner.left < outer.left - 1 || inner.right > outer.right + 1 || inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1;
}

function summary(inspection: Inspection): string {
  return `${denseSpecs.length} dense synth specs · ${inspection.cells} parameter cells, ` +
    `${inspection.controls} controls, ${inspection.labels} labels and ${inspection.rails} section-rail labels · ` +
    `no clipped text, no cell overflow, every label ≥ 11px at ${inspection.width}px`;
}

function failureText(inspection: Inspection): string {
  const shown = inspection.failures.slice(0, 40).join('\n');
  const more = inspection.failures.length > 40 ? `\n… ${inspection.failures.length - 40} more` : '';
  return `${inspection.failures.length} dense faceplate label-fit failure(s) at ${inspection.width}px:\n${shown}${more}`;
}

async function run(): Promise<void> {
  if (!denseSpecs.length) throw new Error('no dense synthesis specs were found');

  // A fresh browser profile opens the welcome dialog and makes #root inert. Use the real
  // empty-project flow so the app's rack, column width and styles are the same as the user's.
  const emptyProject = await waitFor(
    () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => !button.disabled && button.textContent?.includes('Empty project'),
      ) ?? null,
    30_000,
    'the empty-project button',
  );
  emptyProject.click();
  await waitFor(() => {
    const root = document.getElementById('root');
    return root && !root.hasAttribute('inert') ? true : null;
  }, 30_000, 'the project shell');

  const rackTab = await waitFor(
    () => document.querySelector<HTMLElement>('[data-testid="tab-rack"]'),
    30_000,
    'the Rack tab',
  );
  rackTab.click();
  await waitFor(() => {
    const scroller = document.querySelector<HTMLElement>('[data-testid="rack-scroller"]');
    return scroller && scroller.getClientRects().length > 0 ? scroller : null;
  }, 30_000, 'the visible rack');

  const created: { spec: (typeof denseSpecs)[number]; deviceId: string }[] = [];
  for (const spec of denseSpecs) {
    const device = audioEngine.createDevice(spec.type as DeviceType);
    created.push({ spec, deviceId: device.id });
    await waitFor(() => unitFor(device.id), 20_000, `the ${spec.type} rack unit`);
  }

  await document.fonts.ready;
  await nextFrames();

  /**
   * Inspect the mounted panels at the current viewport width. The runner calls this once at
   * 1280 px and again after resizing to 1476 px, without rebuilding the 21 devices.
   */
  const inspect = (): Inspection => {
    const failures: string[] = [];
    let cells = 0;
    let controls = 0;
    let labels = 0;
    let rails = 0;

    for (const { spec, deviceId } of created) {
      const unit = unitFor(deviceId);
      const face = unit?.querySelector<HTMLElement>('[data-testid="spec-faceplate"]');
      if (!unit || !face) {
        failures.push(`${spec.type}: missing spec-faceplate`);
        continue;
      }
      if (face.dataset.deviceType !== spec.type) {
        failures.push(`${spec.type}: rendered ${face.dataset.deviceType ?? 'no type'} faceplate`);
      }
      if (face.dataset.faceFunction !== 'synthesis') {
        failures.push(`${spec.type}: face function ${face.dataset.faceFunction ?? 'missing'} is not synthesis`);
      }

      const dense = face.querySelector<HTMLElement>('[data-testid="synth-dense"]');
      if (!dense) {
        failures.push(`${spec.type}: missing synth-dense matrix`);
        continue;
      }

      const matrixCells = [...dense.querySelectorAll<HTMLElement>('[data-param]')];
      if (matrixCells.length !== spec.params.length) {
        failures.push(`${spec.type}: ${matrixCells.length} controls rendered for ${spec.params.length} parameters`);
      }

      for (const cell of matrixCells) {
        cells += 1;
        const cellRect = cell.getBoundingClientRect();
        const param = cell.dataset.param ?? 'unknown';

        // A control that leaves its cell is clipped by the cell's overflow:hidden.
        const cellControls = cell.querySelectorAll<HTMLElement>('svg.spec-knob-svg, button, select, .synth-dense__option');
        controls += cell.querySelectorAll<HTMLElement>('button, select, svg.spec-knob-svg').length;
        for (const control of cellControls) {
          if (outside(control.getBoundingClientRect(), cellRect)) {
            failures.push(`${spec.type} · ${param}: control ${control.tagName.toLowerCase()} overflows its cell`);
          }
        }

        const cellLabels = cell.querySelectorAll<HTMLElement>(
          '.spec-knob-readout__label, .synth-dense__control-label, .synth-dense__switch',
        );
        for (const label of cellLabels) {
          labels += 1;
          const text = (label.textContent ?? '').trim() || label.tagName.toLowerCase();
          if (clipped(label)) failures.push(`${spec.type} · ${param}: clipped label “${text}”`);
          if (tooSmall(label)) failures.push(`${spec.type} · ${param}: label “${text}” is below 11px`);
        }

        // Toggle and select values are part of the panel text even though they are not the
        // parameter name; keep the same 11 px floor for them.
        for (const controlText of cell.querySelectorAll<HTMLElement>('.synth-dense__toggle, .synth-dense__select')) {
          if (tooSmall(controlText)) failures.push(`${spec.type} · ${param}: control text is below 11px`);
        }
      }

      for (const rail of dense.querySelectorAll<HTMLElement>('.synth-dense__rail')) {
        if (rail.scrollHeight > rail.clientHeight + 1) {
          failures.push(`${spec.type}: a section rail clips vertically`);
        }
        for (const label of rail.querySelectorAll<HTMLElement>('span')) {
          rails += 1;
          const text = (label.textContent ?? '').trim() || 'section';
          if (clipped(label)) failures.push(`${spec.type}: clipped section rail “${text}”`);
          if (tooSmall(label)) failures.push(`${spec.type}: section rail “${text}” is below 11px`);
        }
      }
    }

    return { width: window.innerWidth, failures, specs: denseSpecs.length, cells, controls, labels, rails };
  };

  (window as DenseProbeWindow).__denseSynthProbe = { inspect };

  const first = inspect();
  if (first.failures.length) throw new Error(failureText(first));
  report('passed', `PASS · ${summary(first)}.`);
}

void run().catch((error: unknown) => {
  report('failed', `FAIL · ${error instanceof Error ? error.message : String(error)}`);
});
