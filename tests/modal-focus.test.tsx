import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"><button id="trigger" type="button">Open dialog</button><div id="react-root"></div></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true },
);

const { window } = dom;
for (const [key, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
})) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

// jsdom has no layout, so treat every connected control as visible for the focus list.
Object.defineProperty(window.HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value: () => ({ length: 1 }) as unknown as DOMRectList,
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { ModalFrame } = await import('../src/components/ModalFrame.tsx');

test('ModalFrame traps focus, hides the background, and returns focus on close', async () => {
  const trigger = document.getElementById('trigger') as HTMLButtonElement;
  const appRoot = document.getElementById('root') as HTMLDivElement;
  const reactRoot = document.getElementById('react-root') as HTMLDivElement;
  trigger.focus();
  assert.equal(document.activeElement, trigger);

  let closed = false;
  const onClose = () => {
    closed = true;
  };

  const root = createRoot(reactRoot);
  await act(async () => {
    root.render(
      <ModalFrame label="Regression dialog" onClose={onClose} className="modal">
        <button id="first" type="button">
          First
        </button>
        <button id="last" type="button">
          Last
        </button>
      </ModalFrame>,
    );
  });

  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(dialog, 'dialog is rendered');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('aria-label'), 'Regression dialog');
  assert.equal(dialog.parentElement, document.body, 'dialog is portalled out of #root');
  assert.equal(document.activeElement?.id, 'first', 'initial focus moves inside the dialog');
  assert.equal(appRoot.hasAttribute('inert'), true, '#root becomes inert');
  assert.equal(appRoot.getAttribute('aria-hidden'), 'true', '#root is hidden from assistive tech');

  const press = (key: string, shiftKey = false) => {
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  };

  press('Tab', true);
  assert.equal(document.activeElement?.id, 'last', 'Shift+Tab wraps from the first control to the last');
  press('Tab');
  assert.equal(document.activeElement?.id, 'first', 'Tab wraps from the last control to the first');

  press('Escape');
  assert.equal(closed, true, 'Escape requests close');

  await act(async () => {
    root.unmount();
  });

  assert.equal(document.querySelector('[role="dialog"]'), null, 'dialog is removed');
  assert.equal(document.activeElement, trigger, 'focus returns to the trigger');
  assert.equal(appRoot.hasAttribute('inert'), false, '#root inert state is removed');
  assert.equal(appRoot.getAttribute('aria-hidden'), null, '#root accessibility state is restored');
});
