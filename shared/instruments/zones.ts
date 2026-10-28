import type { InstrumentPack, PackModWheelFade, PackZone } from './types.ts';
import type { PackSwitch } from './catalogTypes.ts';
import { zoneMatchesArticulation } from './articulation.ts';

export type PackTrigger = 'attack' | 'release';
const EMPTY_SWITCHES: ReadonlySet<number> = new Set();

/** SFZ velocity crossfade level for one zone (SFZ's equal-power curve is the default). */
export function velocityFadeGain(zone: Pick<PackZone, 'velocityFadeIn' | 'velocityFadeOut' | 'velocityFadeCurve'>, velocity: number): number {
  const curve = zone.velocityFadeCurve ?? 'power';
  const fade = (range: [number, number], direction: 'in' | 'out'): number => {
    const [start, end] = range;
    const x = end > start
      ? Math.max(0, Math.min(1, (velocity - start) / (end - start)))
      : velocity >= end ? 1 : 0;
    if (x <= 0) return direction === 'in' ? 0 : 1;
    if (x >= 1) return direction === 'in' ? 1 : 0;
    if (direction === 'in') return curve === 'gain' ? x : Math.sin(x * Math.PI / 2);
    return curve === 'gain' ? 1 - x : Math.cos(x * Math.PI / 2);
  };
  return (zone.velocityFadeIn ? fade(zone.velocityFadeIn, 'in') : 1) *
    (zone.velocityFadeOut ? fade(zone.velocityFadeOut, 'out') : 1);
}

/** SFZ CC1 dynamic-layer gain; the value is in MIDI's 0..127 controller range. */
export function modWheelFadeGain(fade: PackModWheelFade, value: number): number {
  const cc = Math.max(0, Math.min(127, value));
  const apply = (range: [number, number], direction: 'in' | 'out'): number => {
    const [start, end] = range;
    const x = end > start
      ? Math.max(0, Math.min(1, (cc - start) / (end - start)))
      : cc >= end ? 1 : 0;
    if (x <= 0) return direction === 'in' ? 0 : 1;
    if (x >= 1) return direction === 'in' ? 1 : 0;
    if (fade.curve === 'gain') return direction === 'in' ? x : 1 - x;
    return direction === 'in' ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
  };
  return (fade.in ? apply(fade.in, 'in') : 1) * (fade.out ? apply(fade.out, 'out') : 1);
}

/** Builds stable UI metadata for the momentary keyswitches referenced by a pack's zones. */
export function packSwitchesFromZones(zones: readonly PackZone[]): PackSwitch[] {
  const switches = new Map<string, PackSwitch>();
  for (const zone of zones) {
    if (zone.swDown !== undefined) switches.set(`down:${zone.swDown}`, { note: zone.swDown, mode: 'down' });
    if (zone.swUp !== undefined) switches.set(`up:${zone.swUp}`, { note: zone.swUp, mode: 'up' });
  }
  return [...switches.values()];
}

/** Selects matching attack or release recordings for one MIDI event. */
export function matchingPackZones(
  pack: InstrumentPack,
  note: number,
  velocity: number,
  articulation: string | null,
  trigger: PackTrigger,
  hit: number,
  roll: number,
  heldSwitches: ReadonlySet<number> = EMPTY_SWITCHES,
  previousNote: number | null = null
): PackZone[] {
  return pack.zones.filter(
    (zone) =>
      (zone.trigger ?? 'attack') === trigger &&
      zoneMatchesArticulation(pack, zone, articulation) &&
      (zone.swDown === undefined || heldSwitches.has(zone.swDown)) &&
      (zone.swUp === undefined || !heldSwitches.has(zone.swUp)) &&
      (zone.swPrevious === undefined || zone.swPrevious === previousNote) &&
      note >= zone.lokey &&
      note <= zone.hikey &&
      velocity >= zone.lovel &&
      velocity <= zone.hivel &&
      velocityFadeGain(zone, velocity) > 0 &&
      (!zone.seqLength || (hit % zone.seqLength) + 1 === zone.seq) &&
      (zone.lorand === undefined || (roll >= zone.lorand && (roll < (zone.hirand ?? 1) || (zone.hirand ?? 1) >= 1)))
  );
}
