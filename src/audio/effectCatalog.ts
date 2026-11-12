/**
 * Insert effects offered by the mixer / editors: built-in effect devices (stereo in → stereo out)
 * grouped like the rack browser. Library effect plugins are added by the UI from the in-app library.
 */
import { INSTRUMENT_CATEGORIES } from './instrumentCatalog.ts';
import type { DeviceType } from './types.ts';

/** Catalog badges whose devices are stereo insert effects. */
const EFFECT_BADGES = new Set(['PROCESSING', 'CLASSIC FX', 'HALF-RACK FX', 'MASTERING', 'OUTBOARD']);
/** Processing items that are not inline stereo effects. */
const NOT_INSERT: Set<DeviceType> = new Set(['spider_audio', 'spider_cv', 'matrix', 'pulsar', 'rpg8', 'midi_out', 'line_mixer', 'combinator', 'automation_clip', 'bvx_vocoder', 'mix_bus']);

export interface EffectEntry {
  type: DeviceType;
  name: string;
  desc: string;
  group: string;
}

export const EFFECT_CATALOG: EffectEntry[] = INSTRUMENT_CATEGORIES.filter((c) => EFFECT_BADGES.has(c.badge)).flatMap((c) =>
  c.items.filter((i) => !NOT_INSERT.has(i.type)).map((i) => ({ type: i.type, name: i.name, desc: i.desc, group: c.label }))
);

export const EFFECT_GROUPS: string[] = [...new Set(EFFECT_CATALOG.map((e) => e.group))];
