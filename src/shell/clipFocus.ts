/**
 * The clip the Clip Editor (Mixer & Clip Editor tab) shows: set when one clip is selected in a song
 * timeline or picked in the editor. UI state only (not saved with the project).
 */
import { useSyncExternalStore } from 'react';

export interface ClipFocus {
  trackId: string;
  clipId: string;
}

let focus: ClipFocus | null = null;
const subs = new Set<() => void>();

export function focusClip(next: ClipFocus | null): void {
  if (focus?.trackId === next?.trackId && focus?.clipId === next?.clipId) return;
  focus = next;
  subs.forEach((s) => s());
}

export function useClipFocus(): ClipFocus | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => focus
  );
}
