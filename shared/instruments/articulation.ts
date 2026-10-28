import type { InstrumentPack, PackArticulation, PackZone } from './types.ts';

/** Stable default for newly loaded or older packs without an explicit default flag. */
export function defaultArticulation(pack: InstrumentPack): PackArticulation | undefined {
  return pack.articulations?.find((articulation) => articulation.default) ?? pack.articulations?.[0];
}

/** Returns the sticky articulation selected by a MIDI keyswitch, if this note is one. */
export function articulationSwitch(pack: InstrumentPack, note: number): PackArticulation | undefined {
  return pack.articulations?.find((articulation) => articulation.keyswitch === note);
}

/** Packs from before articulation support keep all zones playable. */
export function zoneMatchesArticulation(pack: InstrumentPack, zone: PackZone, activeId: string | null): boolean {
  if (!pack.articulations?.length) return true;
  return (zone.articulation ?? defaultArticulation(pack)?.id ?? null) === activeId;
}

/** A keyswitch selector is a silent control note; its state lasts until physical key-up. */
export function pressMomentarySwitch(held: Set<number>, switches: ReadonlySet<number>, note: number): boolean {
  if (!switches.has(note)) return false;
  held.add(note);
  return true;
}

/** Uses physical key-up rather than the later sustain-pedal release to end switch state. */
export function releaseMomentarySwitch(held: Set<number>, switches: ReadonlySet<number>, note: number): boolean {
  if (!switches.has(note)) return false;
  held.delete(note);
  return true;
}
