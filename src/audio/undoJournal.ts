/**
 * UndoJournal — one stack for every kind of edit.
 *
 * Entries carry their own undo/redo closures, so a knob move restores one value instantly while a
 * structural edit can rebuild the project. Consecutive edits to the same target coalesce into one
 * step, which is what a drag should feel like.
 */
export interface UndoEntry {
  label: string;
  undo: () => void;
  redo: () => void;
}

const COALESCE_MS = 700;
const MAX_STEPS = 120;

class UndoJournal {
  private steps: UndoEntry[] = [];
  private forward: UndoEntry[] = [];
  private lastKey = '';
  private lastAt = 0;
  /** The engine records its pending sequencer capture here, so it lands before the edit being pushed. */
  beforePush: (() => void) | null = null;

  /**
   * Records a reversible edit. `key` identifies the target (e.g. `dev:abc:cutoff`); repeated edits
   * on the same key within the coalesce window fold into the step already on the stack.
   */
  push(key: string, label: string, undo: () => void, redo: () => void): void {
    this.beforePush?.();
    const now = performance.now();
    if (key && key === this.lastKey && now - this.lastAt < COALESCE_MS) {
      // Same gesture: keep the state from before it started, but redo to the newest state.
      const top = this.steps[this.steps.length - 1];
      if (top) top.redo = redo;
      this.lastAt = now;
      this.forward = [];
      return;
    }
    this.lastKey = key;
    this.lastAt = now;
    this.steps.push({ label, undo, redo });
    if (this.steps.length > MAX_STEPS) this.steps.shift();
    this.forward = [];
  }

  undo(): string | null {
    const entry = this.steps.pop();
    if (!entry) return null;
    this.lastKey = '';
    entry.undo();
    this.forward.push(entry);
    return entry.label;
  }

  redo(): string | null {
    const entry = this.forward.pop();
    if (!entry) return null;
    this.lastKey = '';
    entry.redo();
    this.steps.push(entry);
    return entry.label;
  }

  get canUndo(): boolean {
    return this.steps.length > 0;
  }

  get canRedo(): boolean {
    return this.forward.length > 0;
  }

  clear(): void {
    this.steps = [];
    this.forward = [];
    this.lastKey = '';
  }
}

export const undoJournal = new UndoJournal();
