/**
 * Tracks every rear-panel jack element and its centre relative to the rack content box.
 * Measured only when layout changes (never per animation frame) and kept out of React state.
 */
export interface Point {
  x: number;
  y: number;
}

export class JackRegistry {
  private els = new Map<string, HTMLElement>();
  private refs = new Map<string, (el: HTMLElement | null) => void>();
  private pos = new Map<string, Point>();
  private container: HTMLElement | null = null;
  private listeners = new Set<() => void>();
  private frame = 0;
  private observer: ResizeObserver | null = null;

  /** The element cables are drawn in (it scrolls together with the jacks). */
  setContainer(el: HTMLElement | null): void {
    this.observer?.disconnect();
    this.container = el;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.invalidate());
      this.observer.observe(el);
    }
    this.invalidate();
  }

  /** Stable ref callback for a jack element. */
  ref(key: string): (el: HTMLElement | null) => void {
    let cb = this.refs.get(key);
    if (!cb) {
      cb = (el) => {
        if (el) this.els.set(key, el);
        else this.els.delete(key);
        this.invalidate();
      };
      this.refs.set(key, cb);
    }
    return cb;
  }

  element(key: string): HTMLElement | undefined {
    return this.els.get(key);
  }

  keys(): string[] {
    return Array.from(this.els.keys());
  }

  get(key: string): Point | undefined {
    return this.pos.get(key);
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Re-measure on the next frame (coalesced). */
  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
      this.listeners.forEach((cb) => cb());
    });
  }

  measure(): void {
    const c = this.container;
    this.pos.clear();
    if (!c) return;
    const box = c.getBoundingClientRect();
    this.els.forEach((el, key) => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      this.pos.set(key, { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 });
    });
  }

  /** Viewport coordinates → container coordinates. */
  toLocal(clientX: number, clientY: number): Point {
    const box = this.container?.getBoundingClientRect();
    return box ? { x: clientX - box.left, y: clientY - box.top } : { x: clientX, y: clientY };
  }

  /** Closest jack within `radius` px that passes `accept`. */
  nearest(p: Point, radius: number, accept: (key: string) => boolean): string | null {
    let best: string | null = null;
    let bestD = radius;
    this.pos.forEach((q, key) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD && accept(key)) {
        best = key;
        bestD = d;
      }
    });
    return best;
  }

  dispose(): void {
    this.observer?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.listeners.clear();
  }
}
