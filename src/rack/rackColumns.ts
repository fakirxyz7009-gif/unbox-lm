/**
 * Splits the rack into its three columns. Default places (a saved placement wins):
 *  - middle: every instrument with the players on it and its insert chain, in that order,
 *    and Combiners that hold an instrument;
 *  - right: group buses with their inserts (under the channel list);
 *  - left: send returns with their effects, free effects, modulators, utilities, effect-only
 *    Combiners.
 */
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import type { RackGroup } from '../audio/types.ts';
import { MixBusDevice } from '../audio/mixer/MixBusDevice.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { groupKey, placementOf, type RackCol } from './rackLayout.ts';

export type RackItem =
  | { key: string; kind: 'device'; device: BaseDevice; order: number; col: RackCol }
  | { key: string; kind: 'group'; group: RackGroup; members: BaseDevice[]; order: number; col: RackCol };

export const COLUMN_LABELS: Record<RackCol, string> = { 0: 'left column', 1: 'middle column', 2: 'right column' };

export function rackColumns(engine: AudioEngine, devices: BaseDevice[], groups: RackGroup[]): RackItem[][] {
  const all = devices.filter((d) => (d.type as string) !== 'master');
  const byId = new Map(all.map((d) => [d.id, d]));
  const isBus = (d: BaseDevice) => d instanceof MixBusDevice;
  const isHead = (d: BaseDevice) => !isBus(d) && (engine.isPlayableInstrument(d.type) || engine.mixer.isOwner(d.id));

  // Send returns (with their effects) sit with the effects on the left; group buses on the right.
  const busCol = new Map<string, RackCol>();
  all.forEach((b) => {
    if (!(b instanceof MixBusDevice)) return;
    const col: RackCol = b.busKind === 'return' ? 0 : 2;
    busCol.set(b.id, col);
    engine.mixer.insertsOf(b.id).forEach((x) => busCol.set(x.id, col));
  });

  // Natural sequence: chains first (middle), then the free units and returns (left), then buses (right).
  const seq: { dev: BaseDevice; col: RackCol }[] = [];
  const seen = new Set<string>();
  const push = (d: BaseDevice, col: RackCol) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    seq.push({ dev: d, col });
  };
  for (const d of all) {
    if (!isHead(d)) continue;
    push(d, 1);
    all.forEach((p) => p instanceof SpecDevice && p.spec.kind === 'player' && p.target === d.id && push(p, 1));
    engine.mixer.insertsOf(d.id).forEach((x) => !busCol.has(x.id) && push(x, 1));
  }
  all.forEach((d) => !busCol.has(d.id) && push(d, 0));
  // each bus / return, then its effects in signal order
  all.forEach((b) => {
    if (!(b instanceof MixBusDevice)) return;
    const col = busCol.get(b.id) as RackCol;
    push(b, col);
    engine.mixer.insertsOf(b.id).forEach((x) => push(x, col));
  });

  const groupOf = new Map<string, RackGroup>();
  groups.forEach((g) => g.deviceIds.forEach((id) => groupOf.set(id, g)));
  const items: RackItem[] = [];
  const doneGroups = new Set<string>();
  seq.forEach(({ dev, col }, i) => {
    const group = groupOf.get(dev.id);
    if (!group) {
      const p = placementOf(dev.id);
      items.push({ key: dev.id, kind: 'device', device: dev, order: p?.order ?? i, col: p?.col ?? col });
      return;
    }
    if (doneGroups.has(group.id)) return;
    doneGroups.add(group.id);
    const members = group.deviceIds.map((id) => byId.get(id)).filter((d): d is BaseDevice => !!d);
    const key = groupKey(group.id);
    const p = placementOf(key);
    const holdsInstrument = members.some((m) => engine.isPlayableInstrument(m.type));
    items.push({ key, kind: 'group', group, members, order: p?.order ?? i, col: p?.col ?? (holdsInstrument ? 1 : 0) });
  });

  const cols: RackItem[][] = [[], [], []];
  items.forEach((it) => cols[it.col].push(it));
  cols.forEach((c) => c.sort((a, b) => a.order - b.order));
  return cols;
}

/** Sort key for a unit dropped at `index` of a column (between its neighbours). */
export function orderAt(column: RackItem[], index: number, movingKey: string): number {
  const rest = column.filter((it) => it.key !== movingKey);
  const prev = rest[index - 1]?.order;
  const next = rest[index]?.order;
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return (next as number) - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}
