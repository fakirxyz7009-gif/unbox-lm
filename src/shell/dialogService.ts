/**
 * Promise-based dialog requests for code that is not a React component (engine-adjacent helpers,
 * old panels, async handlers). `DialogHost` in dialogs.tsx renders the queue. No DOM access here,
 * so Node-side imports of ProjectManager stay testable.
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'normal';
}

export interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
}

export interface AlertOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

export type DialogRequest =
  | (ConfirmOptions & { kind: 'confirm'; resolve: (answer: boolean) => void })
  | (PromptOptions & { kind: 'prompt'; resolve: (value: string | null) => void })
  | (AlertOptions & { kind: 'alert'; resolve: () => void });

type DialogListener = (request: DialogRequest) => void;

let listener: DialogListener | null = null;

/** Called once by DialogHost. Returns the unregister function for effect cleanup. */
export function setDialogListener(next: DialogListener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

function request<T>(build: (resolve: (value: T) => void) => DialogRequest, fallback: T): Promise<T> {
  const host = listener;
  if (!host) {
    // A dialog asked for before the host mounts (or after an unmount) must not leave the caller waiting.
    console.warn('[dialogs] No dialog host is mounted; resolving without showing a dialog.');
    return Promise.resolve(fallback);
  }
  return new Promise<T>((resolve) => host(build(resolve)));
}

/** Ask for confirmation. Resolves false when cancelled. */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return request<boolean>((resolve) => ({ kind: 'confirm', ...options, resolve }), false);
}

/** Ask for a non-empty name. Resolves null when cancelled. */
export function showPrompt(options: PromptOptions): Promise<string | null> {
  return request<string | null>((resolve) => ({ kind: 'prompt', ...options, resolve }), null);
}

/** Show one acknowledgement. Resolves when it is dismissed. */
export function showAlert(options: AlertOptions): Promise<void> {
  return request<void>((resolve) => ({ kind: 'alert', ...options, resolve }), undefined);
}
