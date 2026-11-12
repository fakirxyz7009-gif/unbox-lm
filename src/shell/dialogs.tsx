/**
 * In-app dialogs for project flows. Native `window.confirm` / `window.prompt` look like a browser
 * warning inside the cabinet, cannot be styled, and block the audio-independent UI thread, so the
 * shell uses these instead. They are portalled to <body> so no tab's overflow can clip them.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Disc3, FolderOpen, Music2 } from 'lucide-react';
import { setDialogListener, type DialogRequest } from './dialogService.ts';

const inputClass =
  'w-full rounded border border-[#2b3442] bg-[#070a0f] px-2 py-1.5 text-[13px] text-slate-100 outline-none focus:border-orange-500';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    backgroundLocks -= 1;
    if (backgroundLocks > 0) return;
    backgroundLocks = 0;
    if (!rootWasInert) root.removeAttribute('inert');
    if (rootAriaHidden === null) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', rootAriaHidden);
  };
}

function Frame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Capture before commit: React applies the child's autoFocus during commit, ahead of effects.
  const previouslyFocused = useRef<HTMLElement | null | undefined>(undefined);
  if (previouslyFocused.current === undefined) {
    previouslyFocused.current = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  // Focus belongs inside a modal while it is open, and back on the trigger when it closes.
  useEffect(() => {
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[autofocus]') ?? focusableIn(panel)[0] ?? panel).focus({ preventScroll: true });
    }
    const unlockBackground = lockBackground();
    return () => {
      // Remove inert before focusing the trigger, otherwise a background trigger cannot receive focus.
      unlockBackground();
      previouslyFocused.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A document-level trap also recovers focus if a backdrop click or assistive tech moves it out.
  useEffect(() => {
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = ref.current;
      if (!panel) return;
      const items = focusableIn(panel);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const atEdge = e.shiftKey ? active === first : active === last;
      if (atEdge || !items.includes(active as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (onClose) onClose();
        else ref.current?.focus();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${wide ? 'max-w-[620px]' : 'max-w-[460px]'} rounded-lg border border-[#2b3442] bg-[#0d1119] p-4 text-slate-200 shadow-2xl outline-none`}
      >
        <div className="mb-3">
          <h2 className="text-[18px] font-black leading-tight text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-[13px] leading-snug text-slate-400">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-4 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'normal';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Frame
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="us-btn rounded px-3 py-1.5 font-label font-bold text-[13px]" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            className={`rounded px-3 py-1.5 font-label font-bold text-[13px] disabled:opacity-50 ${
              tone === 'danger' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-orange-500 text-black hover:bg-orange-400'
            }`}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onConfirm()).finally(() => setBusy(false));
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 rounded border border-[#2b3442] bg-[#070a0f] p-3 text-[13px] leading-snug">
        {tone === 'danger' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
        <span>{message}</span>
      </div>
    </Frame>
  );
}

export function AlertDialog({
  title,
  message,
  confirmLabel = 'OK',
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}) {
  return (
    <Frame
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          autoFocus
          className="rounded bg-orange-500 px-3 py-1.5 font-label font-bold text-[13px] text-black hover:bg-orange-400"
          onClick={onClose}
        >
          {confirmLabel}
        </button>
      }
    >
      <div className="rounded border border-[#2b3442] bg-[#070a0f] p-3 text-[13px] leading-snug">{message}</div>
    </Frame>
  );
}

/**
 * The one host for imperative confirm/prompt/alert requests. Mounted outside the app error
 * boundary so a crashed shell can still show its recovery message.
 */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => setDialogListener((request) => setQueue((cur) => [...cur, request])), []);
  const current = queue[0];
  if (!current) return null;
  const finish = () => setQueue((cur) => cur.slice(1));

  if (current.kind === 'confirm') {
    return (
      <ConfirmDialog
        title={current.title}
        message={current.message}
        confirmLabel={current.confirmLabel}
        tone={current.tone}
        onConfirm={() => {
          current.resolve(true);
          finish();
        }}
        onCancel={() => {
          current.resolve(false);
          finish();
        }}
      />
    );
  }

  if (current.kind === 'prompt') {
    return (
      <PromptDialog
        title={current.title}
        label={current.label}
        defaultValue={current.defaultValue}
        confirmLabel={current.confirmLabel}
        onConfirm={(value) => {
          current.resolve(value);
          finish();
        }}
        onCancel={() => {
          current.resolve(null);
          finish();
        }}
      />
    );
  }

  return (
    <AlertDialog
      title={current.title}
      message={current.message}
      confirmLabel={current.confirmLabel}
      onClose={() => {
        current.resolve();
        finish();
      }}
    />
  );
}

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  confirmLabel = 'OK',
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();
  const submit = () => {
    if (!trimmed || busy) return;
    setBusy(true);
    void Promise.resolve(onConfirm(trimmed)).finally(() => setBusy(false));
  };
  return (
    <Frame
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="us-btn rounded px-3 py-1.5 font-label font-bold text-[13px]" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed || busy}
            className="rounded bg-orange-500 px-3 py-1.5 font-label font-bold text-[13px] text-black hover:bg-orange-400 disabled:opacity-50"
            onClick={submit}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <label className="block text-[11px] font-label font-bold uppercase tracking-wider text-slate-400">
        {label}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          onFocus={(e) => e.currentTarget.select()}
          className={`${inputClass} mt-1 normal-case tracking-normal`}
        />
      </label>
    </Frame>
  );
}

export type ProjectStartKind = 'empty' | 'default';

/** First-run and File > New share this chooser so a project is never created with no name. */
export function ProjectStartDialog({
  mode,
  onChoose,
  onOpen,
  onCancel,
}: {
  mode: 'welcome' | 'new';
  onChoose: (kind: ProjectStartKind, name: string) => void | Promise<void>;
  onOpen?: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('Untitled');
  const [busy, setBusy] = useState<ProjectStartKind | null>(null);
  const trimmed = name.trim() || 'Untitled';
  const choose = (kind: ProjectStartKind) => {
    if (busy) return;
    setBusy(kind);
    void Promise.resolve(onChoose(kind, trimmed)).finally(() => setBusy(null));
  };
  return (
    <Frame
      wide
      title={mode === 'welcome' ? 'Welcome to Unbox Studio' : 'New project'}
      subtitle={
        mode === 'welcome'
          ? 'Choose how to start. Projects stay inside this app (IndexedDB), so nothing is written outside it.'
          : 'Choose a starting point and give it a name. The current project is saved first.'
      }
      onClose={mode === 'new' ? onCancel : undefined}
      footer={
        <>
          {onOpen && (
            <button
              type="button"
              className="mr-auto flex items-center gap-1.5 rounded px-2 py-1.5 font-label font-bold text-[13px] text-slate-300 hover:bg-white/5 hover:text-white"
              onClick={onOpen}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open an existing project…
            </button>
          )}
          {onCancel && (
            <button type="button" className="us-btn rounded px-3 py-1.5 font-label font-bold text-[13px]" onClick={onCancel}>
              Cancel
            </button>
          )}
        </>
      }
    >
      <label className="mb-3 block text-[11px] font-label font-bold uppercase tracking-wider text-slate-400">
        Project name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          className={`${inputClass} mt-1 normal-case tracking-normal`}
          aria-label="Project name"
        />
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => choose('empty')}
          className="group rounded-lg border border-[#2b3442] bg-[#070a0f] p-3 text-left transition-colors hover:border-orange-500 disabled:opacity-50"
        >
          <Disc3 className="mb-2 h-5 w-5 text-slate-400 group-hover:text-orange-400" />
          <div className="text-[13px] font-bold text-slate-100">{busy === 'empty' ? 'Starting…' : 'Empty project'}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-500">No tracks. A clean rack, master and returns.</div>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => choose('default')}
          className="group rounded-lg border border-[#2b3442] bg-[#070a0f] p-3 text-left transition-colors hover:border-orange-500 disabled:opacity-50"
        >
          <Music2 className="mb-2 h-5 w-5 text-slate-400 group-hover:text-orange-400" />
          <div className="text-[13px] font-bold text-slate-100">{busy === 'default' ? 'Starting…' : 'Starter groove'}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
            7 tracks, 128 BPM C minor. Drums, bass, lead and pad are ready to edit.
          </div>
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        {mode === 'welcome'
          ? 'You can start empty and add instruments from the browser; the starter groove is the quickest way to hear the engine.'
          : 'Both choices create a new project immediately; the current one is saved or confirmed first.'}
      </p>
    </Frame>
  );
}
