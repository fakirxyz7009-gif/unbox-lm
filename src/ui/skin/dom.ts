/**
 * Per-frame DOM writes for meters and readouts: the element is touched only when the value
 * changed, so an idle meter costs no style recalculation or repaint.
 */
const last = new WeakMap<HTMLElement, string>();

export function setWidth(el: HTMLElement | null, percent: number): void {
  if (!el) return;
  const v = `${Math.max(0, Math.min(100, percent)).toFixed(1)}%`;
  if (last.get(el) === v) return;
  last.set(el, v);
  el.style.width = v;
}

export function setText(el: HTMLElement | null, text: string): void {
  if (!el || last.get(el) === text) return;
  last.set(el, text);
  el.textContent = text;
}
