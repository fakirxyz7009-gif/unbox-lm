/**
 * 3-column rack layout, saved with the project (section `rackLayout`): the column a unit sits in,
 * its position there and whether its front panel is folded. Keys are device ids, or
 * `group:<id>` for a Combiner (its members move with it). Units without an entry get a column
 * from their role (rackColumns.ts); the engine's device order is never changed.
 */
import { useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';

export type RackCol = 0 | 1 | 2;

export interface Placement {
  col?: RackCol;
  /** Sort key inside the column (same scale as the default order: 0, 1, 2 …). */
  order?: number;
  folded?: boolean;
}

const placements = new Map<string, Placement>();
let version = 0;
const subs = new Set<() => void>();

function bump(): void {
  version++;
  subs.forEach((s) => s());
}

export const groupKey = (groupId: string): string => `group:${groupId}`;

export function placementOf(key: string): Placement | undefined {
  return placements.get(key);
}

export function isFolded(key: string): boolean {
  return !!placements.get(key)?.folded;
}

export function moveUnit(key: string, col: RackCol, order: number): void {
  placements.set(key, { ...placements.get(key), col, order });
  bump();
  audioEngine.changed();
}

/** Every unit back to its default column and order (folds stay). */
export function resetLayout(): void {
  placements.forEach((p, k) => (p.folded ? placements.set(k, { folded: true }) : placements.delete(k)));
  bump();
  audioEngine.changed();
}

export function setFolded(keys: string[], folded: boolean): void {
  keys.forEach((k) => placements.set(k, { ...placements.get(k), folded }));
  bump();
  audioEngine.changed();
}

/** Re-renders when a unit moves or folds. */
export function useRackLayoutVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version
  );
}

const alive = (key: string): boolean =>
  key.startsWith('group:') ? audioEngine.rackGroups.some((g) => groupKey(g.id) === key) : audioEngine.devices.has(key);

const isCol = (v: unknown): v is RackCol => v === 0 || v === 1 || v === 2;

audioEngine.registerProjectSection('rackLayout', {
  save: () => Object.fromEntries([...placements].filter(([k]) => alive(k))),
  load: (data, idMap) => {
    placements.clear();
    if (data && typeof data === 'object') {
      for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
        if (!raw || typeof raw !== 'object') continue;
        const p = raw as Record<string, unknown>;
        const entry: Placement = {};
        if (isCol(p.col)) entry.col = p.col;
        if (typeof p.order === 'number' && Number.isFinite(p.order)) entry.order = p.order;
        if (p.folded === true) entry.folded = true;
        placements.set(key.startsWith('group:') ? key : idMap.get(key) ?? key, entry);
      }
    }
    bump();
  },
});
