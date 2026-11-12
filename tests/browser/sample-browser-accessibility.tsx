import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SampleBrowser } from '../../src/components/browser/SampleBrowser.tsx';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
let stage = 'loading';
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 100; i++) { if (test()) return; await wait(20); }
  throw new Error(message);
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusables(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    const style = window.getComputedStyle(element);
    return element.tabIndex >= 0 && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="sample-browser-opener" type="button" onClick={() => setOpen(true)}>Open samples</button>
      <button id="background-control" type="button">Background control</button>
      <SampleBrowser isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

async function run(): Promise<void> {
  stage = 'initialising';
  // The probe has no Express API. Expose an available trained model so this proves that availability
  // alone cannot silently select it; the user must explicitly acknowledge it first.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(requestUrl, location.href).pathname === '/api/separate/status') {
      return new Response(JSON.stringify({ demucs: true, spleeter: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (new URL(requestUrl, location.href).pathname === '/api/import/status') {
      return new Response(JSON.stringify({ ytDlp: false, ffmpeg: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
  };
  root.render(<Harness />);
  stage = 'opening';
  await until(() => !!document.querySelector<HTMLButtonElement>('#sample-browser-opener'), 'Sample browser opener did not mount');
  const opener = document.querySelector<HTMLButtonElement>('#sample-browser-opener')!;
  opener.focus();
  opener.click();
  await until(() => !!document.querySelector<HTMLElement>('[role="dialog"]'), 'Sample browser dialog did not open');
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await until(() => document.activeElement === document.querySelector<HTMLInputElement>('[placeholder="Search samples"]'), 'Opening the dialog did not focus the sample search field');
  expect(dialog.getAttribute('aria-modal') === 'true' && dialog.getAttribute('aria-labelledby') === 'sample-browser-title', 'Sample browser dialog lost its accessible modal name');
  stage = 'trained-model consent';
  const consent = document.querySelector<HTMLInputElement>('[data-testid="trained-separation-consent"] input');
  const modelMode = document.querySelector<HTMLButtonElement>('[data-testid="trained-separation-mode"]');
  expect(consent && modelMode, 'Source separation did not expose the trained-model acknowledgement gate');
  expect(modelMode.disabled && modelMode.getAttribute('aria-disabled') === 'true', 'An available trained model was selectable before explicit acknowledgement');
  expect(!document.querySelector('[data-testid="trained-separation-options"]'), 'An available trained model replaced the fast local separator on dialog open');
  consent!.click();
  await until(() => !modelMode!.disabled, 'Acknowledging trained-model use did not unlock its explicit mode control');
  modelMode!.click();
  await until(() => !!document.querySelector('[data-testid="trained-separation-options"]'), 'The acknowledged trained model mode did not become selectable');
  const entries = focusables(dialog);
  expect(entries.length > 1, 'Sample browser did not expose a keyboard focus order');
  const first = entries[0];
  const last = entries[entries.length - 1];
  stage = 'Tab wrap';
  last.focus();
  const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(next);
  expect(next.defaultPrevented && document.activeElement === first, 'Tab from the last dialog control escaped instead of wrapping to the first control');
  first.focus();
  stage = 'Shift+Tab wrap';
  const previous = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  first.dispatchEvent(previous);
  expect(previous.defaultPrevented && document.activeElement === last, 'Shift+Tab from the first dialog control escaped instead of wrapping to the last control');
  stage = 'Escape close';
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  last.dispatchEvent(escape);
  await until(() => !document.querySelector('[role="dialog"]'), 'Escape did not close the sample browser dialog');
  await until(() => document.activeElement === opener, 'Closing the dialog did not restore focus to its opener');
  result.dataset.status = 'passed';
  result.textContent = 'PASS · Samples & Stems defaults to heuristic separation, gates trained-model selection behind explicit acknowledgement, and keeps accessible modal focus behaviour.';
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${stage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
