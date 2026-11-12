/**
 * The pattern copied with COPY in a pattern bar. One for the whole app, so PASTE works on any
 * other instrument; it is a snapshot, so the source pattern may change or go away afterwards.
 */
import { useSyncExternalStore } from 'react';
import type { PatternSnapshot } from '../../audio/sequencer/editor.ts';

let copied: PatternSnapshot | null = null;
const subs = new Set<() => void>();

export function copyPattern(snap: PatternSnapshot): void {
  copied = snap;
  subs.forEach((s) => s());
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};

export function useCopiedPattern(): PatternSnapshot | null {
  return useSyncExternalStore(subscribe, () => copied, () => null);
}
