/**
 * UI preferences shared by the shell, the workstation, the sequencer and the rack (not part of a
 * project): whether letter keys play notes, the arrangement tool, the workstation / sequencer
 * split, the rack's library panel and cable colours. Persisted per browser.
 */
import { useSyncExternalStore } from 'react';

export type SeqTool = 'pointer' | 'pencil' | 'eraser' | 'razor' | 'mute' | 'zoom' | 'hand' | 'slip' | 'audition';

export interface UiState {
  /** Letter keys play the selected part (A W S E D …); off = they are commands (Q–U tools …). */
  qwertyPiano: boolean;
  seqTool: SeqTool;
  /** Workstation panel height as a fraction of the tab (the sequencer gets the rest). */
  split: number;
  /** Library panel open beside the rack. */
  rackLibrary: boolean;
  /** Cable colours: by signal type (audio to mixer / between units / CV / inside a Combiner) or each cable's own. */
  cableColors: 'type' | 'cable';
  /** Mixer console height as a fraction of the Mixer & Clip Editor tab (the clip editor gets the rest). */
  mixSplit: number;
  /** Layout of Mixer & Clip Editor tab: 'split' = console on top + clip editor below; 'clip' = full-screen clip editor; 'mixer' = full-screen console. */
  mixerLayout: 'split' | 'clip' | 'mixer';
  /** Timeline horizontal zoom (pixels per bar). */
  timelineBarPx: number;
  /** Timeline track row height (pixels). */
  timelineLaneH: number;
  /** Timeline horizontal scroll position. */
  timelineScrollX: number;
  /** Timeline vertical scroll position. */
  timelineScrollY: number;
  /** Stationary edit cursor bar position. */
  editCursorBar: number | null;
}

const KEY = 'unbox.ui.v1';
const DEFAULTS: UiState = {
  qwertyPiano: true,
  seqTool: 'pointer',
  split: 0.56,
  rackLibrary: false,
  cableColors: 'type',
  mixSplit: 0.45,
  mixerLayout: 'split',
  timelineBarPx: 56,
  timelineLaneH: 52,
  timelineScrollX: 0,
  timelineScrollY: 0,
  editCursorBar: null,
};
const fraction = (v: unknown, def: number) => (typeof v === 'number' && v > 0.2 && v < 0.85 ? v : def);

function load(): UiState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<UiState>;
    return {
      qwertyPiano: typeof raw.qwertyPiano === 'boolean' ? raw.qwertyPiano : DEFAULTS.qwertyPiano,
      seqTool: DEFAULTS.seqTool,
      split: fraction(raw.split, DEFAULTS.split),
      rackLibrary: typeof raw.rackLibrary === 'boolean' ? raw.rackLibrary : DEFAULTS.rackLibrary,
      cableColors: raw.cableColors === 'cable' ? 'cable' : DEFAULTS.cableColors,
      mixSplit: fraction(raw.mixSplit, DEFAULTS.mixSplit),
      mixerLayout: raw.mixerLayout === 'clip' || raw.mixerLayout === 'mixer' || raw.mixerLayout === 'split' ? raw.mixerLayout : DEFAULTS.mixerLayout,
      timelineBarPx: typeof raw.timelineBarPx === 'number' && raw.timelineBarPx >= 4 && raw.timelineBarPx <= 480 ? raw.timelineBarPx : DEFAULTS.timelineBarPx,
      timelineLaneH: typeof raw.timelineLaneH === 'number' && raw.timelineLaneH >= 24 && raw.timelineLaneH <= 200 ? raw.timelineLaneH : DEFAULTS.timelineLaneH,
      timelineScrollX: typeof raw.timelineScrollX === 'number' ? raw.timelineScrollX : 0,
      timelineScrollY: typeof raw.timelineScrollY === 'number' ? raw.timelineScrollY : 0,
      editCursorBar: typeof raw.editCursorBar === 'number' ? raw.editCursorBar : null,
    };
  } catch {
    return DEFAULTS;
  }
}

let state = load();
const subs = new Set<() => void>();

export function getUi(): UiState {
  return state;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    const { qwertyPiano, split, rackLibrary, cableColors, mixSplit, mixerLayout, timelineBarPx, timelineLaneH, timelineScrollX, timelineScrollY, editCursorBar } = state;
    localStorage.setItem(KEY, JSON.stringify({ qwertyPiano, split, rackLibrary, cableColors, mixSplit, mixerLayout, timelineBarPx, timelineLaneH, timelineScrollX, timelineScrollY, editCursorBar }));
  } catch {
    // storage blocked: keep it for this session
  }
}

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  persist();
  subs.forEach((s) => s());
}

/**
 * Remembers the timeline's zoom, row height and scroll for its next mount without re-rendering
 * anyone (nothing shows them live, and a scroll or zoom gesture writes many times a second); the
 * save is batched.
 */
export function rememberUi(patch: Partial<Pick<UiState, 'timelineBarPx' | 'timelineLaneH' | 'timelineScrollX' | 'timelineScrollY'>>): void {
  state = { ...state, ...patch };
  if (saveTimer === undefined) saveTimer = setTimeout(persist, 400);
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state
  );
}
