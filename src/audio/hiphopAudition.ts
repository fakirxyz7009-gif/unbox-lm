/**
 * Hip-Hop audition settings that belong to the project: which kit, which walk pace, and the pad last
 * hit. Saved as a project section, so a project reopened on another machine lands on the same spot
 * (a browser preference could not travel with the file). The page validates the values against the
 * generated catalog; this module only keeps and serialises them.
 */
import { audioEngine } from './AudioEngine.ts';

export interface HiphopAuditionSettings {
  /** Device type of the kit, e.g. `rec_hiphop_kicks`. */
  kit: string;
  /** Walk pace: a note value (`1/4`, `1/8`, `1/16`) or fixed seconds (`0.75` … `2`). */
  pace: string;
  /** MIDI note of the pad last hit; pads are one-shot lanes, so the note identifies the pad. */
  pad: number;
}

const DEFAULTS: HiphopAuditionSettings = { kit: 'rec_hiphop_kicks', pace: '1/8', pad: 0 };

let settings: HiphopAuditionSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();

export const hiphopAudition = {
  get: (): HiphopAuditionSettings => settings,
  /** UI writes: the page already shows this state, so listeners are not fired. */
  update(patch: Partial<HiphopAuditionSettings>): void {
    settings = { ...settings, ...patch };
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

audioEngine.registerProjectSection('hiphopAudition', {
  save: () => ({ ...settings }),
  load: (data) => {
    const saved = (data ?? {}) as { kit?: unknown; pace?: unknown; pad?: unknown };
    settings = {
      kit: typeof saved.kit === 'string' ? saved.kit : DEFAULTS.kit,
      pace: typeof saved.pace === 'string' ? saved.pace : DEFAULTS.pace,
      pad: typeof saved.pad === 'number' && Number.isFinite(saved.pad) ? saved.pad : DEFAULTS.pad,
    };
    // A loaded project must replace what the open page is showing.
    for (const listener of listeners) listener();
  },
});
