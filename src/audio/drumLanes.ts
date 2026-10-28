/**
 * Drum lanes of a kit: one row per sound with the note that plays it (Redrum lanes, the pads of
 * drum machines / grooveboxes). Null = not a kit (tuned percussion plays by pitch).
 */
import type { BaseDevice } from './BaseDevice.ts';
import { SpecDevice } from './spec/SpecDevice.ts';

export interface DrumLane {
  name: string;
  note: number;
}

const BEATBOX8 = ['Kick', 'Snare', 'Closed Hat', 'Open Hat', 'Clap', 'Low Tom', 'High Tom', 'Crash'];
export function drumLanesFor(dev: BaseDevice | undefined | null): DrumLane[] | null {
  if (!dev) return null;
  if (dev.type === 'redrum') return BEATBOX8.map((name, i) => ({ name, note: 60 + i }));
  if (dev instanceof SpecDevice && dev.spec.pads?.length) return dev.spec.pads.map((p) => ({ name: p.name, note: p.note }));
  return null;
}
