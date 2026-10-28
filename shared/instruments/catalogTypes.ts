import type { PackArticulation, PackKind, PackLane } from './types.ts';

export interface PackSwitch {
  note: number;
  mode: 'down' | 'up';
}

/** What the app needs to know about a pack before loading it (one rack device per entry). */
export interface PackEntry {
  id: string;
  name: string;
  kind: PackKind;
  category: string;
  description: string;
  spdx: string;
  author: string;
  source: string;
  lanes?: PackLane[];
  articulations?: PackArticulation[];
  /** Momentary SFZ keyswitch notes recognized by this recorded pack. */
  switches?: PackSwitch[];
  /** Melodic strikes ring to their natural end; the panel offers Length instead of Release. */
  oneShot?: boolean;
  /** Default release (s). */
  release?: number;
  /** Sample data size in bytes. */
  bytes: number;
}

/** Exact licenses cleared for this app's share builds; NC, ND and SA variants need another policy. */
export const isRedistributable = (spdx: string): boolean => /^(CC0-1\.0|CC-BY-(1\.0|2\.0|2\.5|3\.0|4\.0))$/i.test(spdx.trim());

export function redistributablePacks<T extends { spdx: string }>(packs: readonly T[]): T[] {
  return packs.filter((pack) => isRedistributable(pack.spdx));
}

/** Device type of a pack's rack unit (stable: saved in projects). */
export const packDeviceType = (id: string): `rec_${string}` => `rec_${id.replace(/-/g, '_')}`;
