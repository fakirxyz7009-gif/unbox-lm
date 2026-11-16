import type { EngineId, SpecKind } from '../../shared/rack/devices/types.ts';

export type DeviceFamily = 'instrument' | 'effect' | 'utility' | 'player';

export interface DeviceIdentity {
  family: DeviceFamily;
  /** Human family word printed on the signature plate. */
  label: string;
  /** Stable catalogue-style model code, e.g. UBX-DYN-42K. */
  code: string;
  /** Stable four-digit serial for the plate. */
  serial: string;
}

const ENGINE_CODE: Record<EngineId, string> = {
  poly: 'SYN',
  wavetable: 'WAV',
  fm: 'FM',
  westcoast: 'WST',
  modal: 'MOD',
  karplus: 'PLK',
  formant: 'FRM',
  bowed: 'BOW',
  sampler: 'SMP',
  multisample: 'REC',
  granular: 'GRN',
  loops: 'LOP',
  drums: 'DRM',
  groove: 'GRV',
  dynamics: 'DYN',
  eq: 'EQL',
  distortion: 'DRV',
  modulation: 'MOD',
  delay: 'DLY',
  reverb: 'RVB',
  filter: 'FLT',
  vocoder: 'VOC',
  pitch: 'PIT',
  pitchCorrect: 'PCR',
  timed: 'TIM',
  stereo: 'STE',
  mixer: 'MIX',
  di: 'DI',
  patchbay: 'PBX',
  player: 'PLY',
};

const ENGINE_LABEL: Record<EngineId, string> = {
  poly: 'Analog Synth',
  wavetable: 'Wavetable',
  fm: 'FM Synth',
  westcoast: 'West Coast',
  modal: 'Modal',
  karplus: 'Plucked',
  formant: 'Formant',
  bowed: 'Bowed',
  sampler: 'Sampler',
  multisample: 'Recorded',
  granular: 'Granular',
  loops: 'Loop Player',
  drums: 'Drum Machine',
  groove: 'Groovebox',
  dynamics: 'Dynamics',
  eq: 'Equalizer',
  distortion: 'Drive',
  modulation: 'Modulation',
  delay: 'Delay',
  reverb: 'Reverb',
  filter: 'Filter',
  vocoder: 'Vocoder',
  pitch: 'Pitch',
  pitchCorrect: 'Pitch Correct',
  timed: 'Timed FX',
  stereo: 'Stereo',
  mixer: 'Mixer',
  di: 'Direct Box',
  patchbay: 'Patchbay',
  player: 'Player',
};

const familyOf = (kind: SpecKind | undefined, nav: 'instrument' | 'effect' | 'utility'): DeviceFamily => {
  if (kind === 'effect' || kind === 'utility' || kind === 'player') return kind;
  if (kind === 'instrument') return 'instrument';
  return nav;
};

const codePrefix = (family: DeviceFamily): string => {
  switch (family) {
    case 'effect':
      return 'FX';
    case 'utility':
      return 'UTL';
    case 'player':
      return 'PLY';
    default:
      return 'SYN';
  }
};

/** FNV-1a — stable across sessions, so a unit keeps its plate number in every project. */
const hashType = (type: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < type.length; i++) {
    hash ^= type.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function deviceIdentity(
  type: string,
  engine: EngineId | undefined,
  kind: SpecKind | undefined,
  nav: 'instrument' | 'effect' | 'utility',
  /** Instance seed: identical models share a code but get their own serial. */
  unitId: string = type,
): DeviceIdentity {
  const family = familyOf(kind, nav);
  const hash = hashType(type);
  const prefix = engine ? ENGINE_CODE[engine] : codePrefix(family);
  // Four base-36 characters keep two visible units from sharing a plate code.
  const suffix = (hash % 1679616).toString(36).toUpperCase().padStart(4, '0');
  return {
    family,
    label: engine ? ENGINE_LABEL[engine] : family === 'utility' ? 'System' : family === 'effect' ? 'Signal FX' : 'Instrument',
    code: `UBX-${prefix}-${suffix}`,
    serial: String(hashType(unitId) % 10000).padStart(4, '0'),
  };
}
