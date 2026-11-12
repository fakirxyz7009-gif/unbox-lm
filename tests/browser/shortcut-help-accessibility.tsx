import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShortcutHelpModal } from '../../src/components/ShortcutHelpModal.tsx';

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
  const [actions, setActions] = useState<string[]>([]);
  return <>
    <button id="shortcut-help-opener" type="button" onClick={() => setOpen(true)}>Open shortcuts</button>
    <button id="background-control" type="button">Background control</button>
    <div id="actions">{actions.join(',')}</div>
    <ShortcutHelpModal isOpen={open} onClose={() => setOpen(false)} onTriggerShortcutAction={(id) => setActions((current) => [...current, id])} />
  </>;
}
async function run(): Promise<void> {
  root.render(<Harness />);
  await until(() => !!document.querySelector<HTMLButtonElement>('#shortcut-help-opener'), 'Shortcut-help opener did not mount');
  const opener = document.querySelector<HTMLButtonElement>('#shortcut-help-opener')!;
  opener.focus();
  opener.click();
  await until(() => !!document.querySelector<HTMLElement>('[role="dialog"]'), 'Shortcut-help dialog did not open');
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[aria-label="Close keyboard shortcuts"]')!;
  await until(() => document.activeElement === close, 'Opening shortcut help did not focus its close control');
  expect(dialog.getAttribute('aria-modal') === 'true' && dialog.getAttribute('aria-labelledby') === 'shortcut-help-title', 'Shortcut-help dialog lost its accessible modal name');
  const action = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Workstation & Sequencer'));
  expect(action, 'Shortcut actions are not keyboard buttons');
  action.click();
  await until(() => document.querySelector('#actions')?.textContent === 'view_sequencer', 'Keyboard shortcut action button did not invoke its action');
  let leakedShortcut = 0;
  const onWindowKey = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'm') leakedShortcut++; };
  window.addEventListener('keydown', onWindowKey);
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
  window.removeEventListener('keydown', onWindowKey);
  expect(leakedShortcut === 0, 'A DAW shortcut key leaked through the open shortcut-help modal');
  const entries = focusables(dialog);
  const first = entries[0];
  const last = entries[entries.length - 1];
  last.focus();
  const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(next);
  expect(next.defaultPrevented && document.activeElement === first, 'Tab from the last help control escaped instead of wrapping');
  first.focus();
  const previous = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  first.dispatchEvent(previous);
  expect(previous.defaultPrevented && document.activeElement === last, 'Shift+Tab from the first help control escaped instead of wrapping');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  last.dispatchEvent(escape);
  await until(() => !document.querySelector('[role="dialog"]'), 'Escape did not close shortcut help');
  await until(() => document.activeElement === opener, 'Closing shortcut help did not restore focus to its opener');
  result.dataset.status = 'passed';
  result.textContent = 'PASS · Shortcut help has an accessible modal name, keyboard buttons for actions, focus wrapping, Escape close, and opener-focus restoration.';
}
void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
