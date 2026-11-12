/**
 * Project block for the CV Matrix window's routes. A route made in the window is saved here; a route
 * made by a CV cable is also saved as that cable. The window edits a route's own amount, offset and
 * inversion, so on load each saved route is matched to the route its cable rebuilt, and unmatched
 * routes are added.
 */
import type { CVEngine } from './CVEngine.ts';

const clamp = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function cvMatrixSection(cv: CVEngine): { save(): unknown; load(data: unknown, idMap: Map<string, string>): void } {
  return {
    save: () => ({
      routes: cv.matrixEntries.map((m) => ({
        sourceDeviceId: m.sourceDeviceId,
        sourcePortId: m.sourcePortId,
        targetDeviceId: m.targetDeviceId,
        targetParam: m.targetParam,
        amount: m.amount,
        offset: m.offset,
        inverted: m.inverted,
      })),
    }),
    load: (data, idMap) => {
      const routes = (data as { routes?: unknown } | undefined)?.routes;
      if (!Array.isArray(routes)) return;
      const matched = new Set<string>();
      for (const item of routes) {
        const raw = item as Record<string, unknown> | null;
        if (!raw) continue;
        const src = typeof raw.sourceDeviceId === 'string' ? idMap.get(raw.sourceDeviceId) : undefined;
        const tgt = typeof raw.targetDeviceId === 'string' ? idMap.get(raw.targetDeviceId) : undefined;
        if (!src || !tgt || typeof raw.sourcePortId !== 'string' || typeof raw.targetParam !== 'string') continue;
        const sourcePortId = raw.sourcePortId;
        const targetParam = raw.targetParam;
        const fields = {
          amount: clamp(raw.amount, 1, -1, 1),
          offset: clamp(raw.offset, 0, -1, 1),
          inverted: raw.inverted === true,
        };
        const cable = cv.matrixEntries.find((m) =>
          !matched.has(m.id) && m.sourceDeviceId === src && m.sourcePortId === sourcePortId &&
          m.targetDeviceId === tgt && m.targetParam === targetParam);
        if (cable) {
          matched.add(cable.id);
          cv.updateMatrixEntry(cable.id, fields);
        } else {
          matched.add(cv.addMatrixEntry({ sourceDeviceId: src, sourcePortId, targetDeviceId: tgt, targetParam, ...fields }));
        }
      }
    },
  };
}
