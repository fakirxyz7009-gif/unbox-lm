import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';
import type { DeviceType } from '../audio/types.ts';

const WORLD_TYPES = new Set<string>(['tabla', 'dhol', 'bansuri', 'harmonium', 'tanpura', 'tumbi', 'world_instrument', 'pangea']);

export const isWorldInstrument = (type: DeviceType): boolean => WORLD_TYPES.has(type);

/** Faceplate finish per hardware archetype (classes from index.css + Tailwind). */
export function faceplateClass(type: DeviceType): string {
  // spec devices paint their own panel (SpecFaceplate)
  if (SPEC_BY_TYPE.has(type)) return 'text-slate-100';
  if (isWorldInstrument(type)) return 'bg-gradient-to-r from-[#231409] via-[#341f0e] to-[#231409] text-amber-100';
  switch (type) {
    case 'combinator':
      return 'bg-gradient-to-r from-[#5c121b] via-[#881b26] to-[#4c0e16] text-rose-50';
    case 'rv7000':
    case 'rv9':
      return 'bg-gradient-to-r from-[#17110b] via-[#453019] to-[#17110b] text-amber-50';
    case 'scream4':
      return 'bg-gradient-to-r from-[#163238] via-[#23545e] to-[#12282d] text-cyan-50';
    case 'mclass_master':
      return 'bg-gradient-to-r from-[#4a300d] via-[#925811] to-[#3d260a] text-amber-50';
    case 'three_osc':
      return 'faceplate-light-grey-metal text-slate-900';
    case 'sytrus':
      return 'faceplate-forest-green text-emerald-100';
    case 'flex':
    case 'redrum':
    case 'mimic':
      return 'faceplate-crisp-white text-slate-900';
    case 'thor':
    case 'europa':
    case 'wyvern':
      return 'faceplate-studio-blue text-white';
    case 'subtractor':
    case 'monotone':
    case 'kong':
    case 'umpf':
    case 'dr_octo_rex':
      return 'faceplate-slate-black text-neutral-100';
    case 'pulveriser':
    case 'alligator':
    case 'ember':
      return 'bg-gradient-to-r from-[#1c1410] via-[#281c15] to-[#1c1410] text-amber-100';
    case 'vst_effect':
      return 'faceplate-vst-effect text-slate-100';
    case 'vst_instrument':
      return 'faceplate-vst-instrument text-slate-100';
    default:
      return 'faceplate-brushed-grey text-neutral-900';
  }
}

/** Minimum unit height per rack units (front panels need this much room). */
export function unitMinHeight(heightUnits: number): number {
  return heightUnits <= 1 ? 120 : heightUnits === 2 ? 200 : heightUnits === 3 ? 290 : 380;
}
