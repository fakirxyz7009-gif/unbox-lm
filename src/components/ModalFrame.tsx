import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible, tabbable elements in DOM order. */
function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  );
}

let backgroundLocks = 0;
let rootWasInert = false;
let rootAriaHidden: string | null = null;

/** Hide the app from focus and assistive tech while a portalled dialog is open. */
function lockBackground(): () => void {
  const root = typeof document === 'undefined' ? null : document.getElementById('root');
  if (!root) return () => {};
  if (backgroundLocks === 0) {
    rootWasInert = root.hasAttribute('inert');
    rootAriaHidden = root.getAttribute('aria-hidden');
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
  }
  backgroundLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    backgroundLocks = Math.max(0, backgroundLocks - 1);
    if (backgroundLocks > 0) return;
    if (!rootWasInert) root.removeAttribute('inert');
    if (rootAriaHidden === null) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', rootAriaHidden);
  };
}

/** Only the topmost open dialog owns the tab trap and Escape key. */
const dialogStack: HTMLElement[] = [];

interface ModalFrameProps {
  label: string;
  onClose: () => void;
  className: string;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

/**
 * Shared shell for the app's existing custom dialogs. The dialog is portalled to <body> so
 * setting #root inert cannot disable the dialog itself; focus returns to its trigger on close.
 */
export function ModalFrame({ label, onClose, className, closeOnBackdrop = false, children }: ModalFrameProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Capture before commit: React applies a child's autoFocus during commit, ahead of effects.
  const previouslyFocused = useRef<HTMLElement | null | undefined>(undefined);
  if (previouslyFocused.current === undefined) {
    previouslyFocused.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    dialogStack.push(panel);
    const unlockBackground = lockBackground();

    if (!panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? focusableIn(panel)[0] ?? panel).focus({
        preventScroll: true,
      });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== panel) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusableIn(panel);
      if (!items.length) {
        event.preventDefault();
        event.stopPropagation();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }

      // Stop the app-wide Tab shortcut from flipping the rack behind the dialog.
      event.stopPropagation();
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = dialogStack[dialogStack.length - 1] === panel;
      const index = dialogStack.lastIndexOf(panel);
      if (index >= 0) dialogStack.splice(index, 1);
      unlockBackground();
      if (wasTop) {
        const opener = previouslyFocused.current;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={className}
      onClick={
        closeOnBackdrop
          ? (event) => {
              if (event.target === event.currentTarget) onCloseRef.current();
            }
          : undefined
      }
    >
      {children}
    </div>,
    document.body,
  );
}
