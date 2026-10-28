/** Short status message from anywhere in the UI; App shows it as its feedback toast. */
export type ToastKind = 'success' | 'error' | 'info';

export function toast(message: string, type: ToastKind = 'info'): void {
  window.dispatchEvent(new CustomEvent<{ message: string; type: ToastKind }>('unbox:toast', { detail: { message, type } }));
}
