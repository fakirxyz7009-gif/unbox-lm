import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PatchBrowser } from '../../src/workstation/PatchBrowser.tsx';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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
      <button id="patch-browser-opener" type="button" onClick={() => setOpen(true)}>Open LOAD</button>
      <button id="background-control" type="button">Background control</button>
      {open && <PatchBrowser track={null} partNo={1} onClose={() => setOpen(false)} onChosen={() => undefined} />}
    </>
  );
}
async function run(): Promise<void> {
  root.render(<Harness />);
  await until(() => !!document.querySelector<HTMLButtonElement>('#patch-browser-opener'), 'LOAD opener did not mount');
  const opener = document.querySelector<HTMLButtonElement>('#patch-browser-opener')!;
  opener.focus();
  opener.click();
  await until(() => !!document.querySelector<HTMLElement>('[role="dialog"]'), 'LOAD dialog did not open');
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search the browser"]')!;
  await until(() => document.activeElement === search, 'Opening LOAD did not focus the browser search');
  expect(dialog.getAttribute('aria-modal') === 'true' && dialog.getAttribute('aria-labelledby') === 'patch-browser-title', 'LOAD dialog lost its accessible modal name');
  const entries = focusables(dialog);
  expect(entries.length > 1, 'LOAD did not expose a keyboard focus order');
  const first = entries[0];
  const last = entries[entries.length - 1];
  last.focus();
  const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(next);
  expect(next.defaultPrevented && document.activeElement === first, 'Tab from the last LOAD control escaped instead of wrapping');
  first.focus();
  const previous = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  first.dispatchEvent(previous);
  expect(previous.defaultPrevented && document.activeElement === last, 'Shift+Tab from the first LOAD control escaped instead of wrapping');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  last.dispatchEvent(escape);
  await until(() => !document.querySelector('[role="dialog"]'), 'Escape did not close LOAD');
  await until(() => document.activeElement === opener, 'Closing LOAD did not restore focus to its opener');
  result.dataset.status = 'passed';
  result.textContent = 'PASS · LOAD has an accessible modal name, starts at the browser search, wraps Tab and Shift+Tab, closes with Escape, and returns focus to its opener.';
}
void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
