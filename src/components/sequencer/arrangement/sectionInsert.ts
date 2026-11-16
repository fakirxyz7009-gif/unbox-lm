/**
 * Insert settings shared by the section strip's RIPPLE INSERT button and the Shift+I key, so the
 * two always open the same gap at the same bar. UI state only: not saved with the project.
 */
import { useSyncExternalStore } from 'react';

export type SectionInsertMode = 'section' | 'playhead';

export interface SectionInsertSettings {
  mode: SectionInsertMode;
  /** Gap length in bars; null means "the section's own length". */
  gapBars: number | null;
}

let state: SectionInsertSettings = { mode: 'section', gapBars: null };
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const sectionInsertSettings = {
  get: (): SectionInsertSettings => state,
  subscribe: (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  setMode: (mode: SectionInsertMode) => {
    if (mode === state.mode) return;
    state = { ...state, mode };
    emit();
  },
  /** Only positive finite values are kept; anything else falls back to the section length. */
  setGapBars: (gapBars: number | null) => {
    const next = gapBars !== null && Number.isFinite(gapBars) && gapBars > 0 ? gapBars : null;
    if (next === state.gapBars) return;
    state = { ...state, gapBars: next };
    emit();
  },
};

export function useSectionInsertSettings(): SectionInsertSettings {
  return useSyncExternalStore(sectionInsertSettings.subscribe, sectionInsertSettings.get, sectionInsertSettings.get);
}
