import type { DeviceSpec, EngineId } from '../../../shared/rack/devices/index.ts';

/** Visual families are chosen by what the device does, not just its colour. */
export type FaceFunction =
  | 'synthesis'
  | 'rhythm'
  | 'sampling'
  | 'dynamics'
  | 'eq'
  | 'drive'
  | 'modulation'
  | 'space'
  | 'filter'
  | 'voice'
  | 'routing'
  | 'player';

interface FunctionCopy {
  id: FaceFunction;
  /** Short functional name printed beside the crest. */
  label: string;
  /** Three-letter engine code used in the panel edition stamp. */
  code: string;
  /** Left-to-right signal path printed quietly into the panel. */
  stages: readonly string[];
}

const ENGINE_COPY: Record<EngineId, FunctionCopy> = {
  poly: { id: 'synthesis', label: 'ANALOG SYNTH', code: 'SYN', stages: ['SOURCE', 'SHAPE', 'FILTER', 'AMP'] },
  wavetable: { id: 'synthesis', label: 'WAVETABLE', code: 'WAV', stages: ['TABLE', 'MORPH', 'FILTER', 'AMP'] },
  fm: { id: 'synthesis', label: 'FM SYNTH', code: 'FM', stages: ['OPERATORS', 'ALGORITHM', 'TONE', 'OUT'] },
  westcoast: { id: 'synthesis', label: 'WEST COAST', code: 'WST', stages: ['FOLD', 'LOPASS', 'FUNCTION', 'OUT'] },
  modal: { id: 'synthesis', label: 'MODAL', code: 'MOD', stages: ['EXCITE', 'PARTIALS', 'BODY', 'OUT'] },
  karplus: { id: 'synthesis', label: 'PLUCKED', code: 'PLK', stages: ['EXCITE', 'STRING', 'BODY', 'OUT'] },
  formant: { id: 'synthesis', label: 'FORMANT', code: 'FRM', stages: ['GLOTTAL', 'VOWEL', 'BODY', 'OUT'] },
  bowed: { id: 'synthesis', label: 'BOWED', code: 'BOW', stages: ['BOW', 'STRING', 'BODY', 'OUT'] },
  sampler: { id: 'sampling', label: 'SAMPLER', code: 'SMP', stages: ['ZONES', 'TUNE', 'ENVELOPE', 'OUT'] },
  multisample: { id: 'sampling', label: 'RECORDED', code: 'REC', stages: ['PACK', 'VELOCITY', 'TONE', 'OUT'] },
  granular: { id: 'sampling', label: 'GRANULAR', code: 'GRN', stages: ['GRAINS', 'SPRAY', 'FILTER', 'OUT'] },
  loops: { id: 'sampling', label: 'LOOP PLAYER', code: 'LOP', stages: ['SLICES', 'TRIGGER', 'FILTER', 'OUT'] },
  drums: { id: 'rhythm', label: 'DRUM MACHINE', code: 'DRM', stages: ['VOICES', 'PADS', 'MIX', 'OUT'] },
  groove: { id: 'rhythm', label: 'GROOVEBOX', code: 'GRV', stages: ['PADS', 'TRACKS', 'MIX', 'OUT'] },
  dynamics: { id: 'dynamics', label: 'DYNAMICS', code: 'DYN', stages: ['INPUT', 'DETECT', 'GAIN', 'OUT'] },
  eq: { id: 'eq', label: 'EQUALIZER', code: 'EQL', stages: ['LOW', 'MID', 'HIGH', 'OUT'] },
  distortion: { id: 'drive', label: 'SATURATION', code: 'DRV', stages: ['INPUT', 'DRIVE', 'TONE', 'OUT'] },
  modulation: { id: 'modulation', label: 'MODULATION', code: 'MOD', stages: ['LFO', 'DEPTH', 'MIX', 'OUT'] },
  delay: { id: 'space', label: 'DELAY', code: 'DLY', stages: ['TAP', 'FEEDBACK', 'TONE', 'OUT'] },
  reverb: { id: 'space', label: 'REVERB', code: 'RVB', stages: ['EARLY', 'TAIL', 'DAMP', 'OUT'] },
  filter: { id: 'filter', label: 'FILTER', code: 'FLT', stages: ['CUTOFF', 'RESONANCE', 'DRIVE', 'OUT'] },
  vocoder: { id: 'voice', label: 'VOCODER', code: 'VOC', stages: ['CARRIER', 'BANDS', 'ENVELOPE', 'OUT'] },
  pitch: { id: 'voice', label: 'PITCH', code: 'PIT', stages: ['DETECT', 'SHIFT', 'FORMANT', 'OUT'] },
  pitchCorrect: { id: 'voice', label: 'PITCH CORRECT', code: 'PCR', stages: ['SCALE', 'TRACK', 'RETUNE', 'OUT'] },
  timed: { id: 'modulation', label: 'TIMED FX', code: 'TIM', stages: ['CLOCK', 'DIVISION', 'SHAPE', 'OUT'] },
  stereo: { id: 'dynamics', label: 'STEREO', code: 'STE', stages: ['WIDTH', 'PAN', 'TONE', 'OUT'] },
  mixer: { id: 'routing', label: 'SUMMING', code: 'MIX', stages: ['CHANNELS', 'PAN', 'BUS', 'OUT'] },
  di: { id: 'routing', label: 'DIRECT BOX', code: 'DI', stages: ['INPUT', 'PAD', 'TRANSFORMER', 'OUT'] },
  patchbay: { id: 'routing', label: 'PATCHBAY', code: 'PBX', stages: ['INPUTS', 'ROUTE', 'OUTPUTS', 'OUT'] },
  player: { id: 'player', label: 'PLAYER', code: 'PLY', stages: ['INPUT', 'TRANSFORM', 'TARGET', 'OUT'] },
};

export interface FunctionFace extends FunctionCopy {
  /** Stable 0–3 variation, so two models in the same family still read as different units. */
  variant: number;
  edition: string;
}

const hashType = (type: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < type.length; i++) {
    hash ^= type.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function functionFaceForSpec(spec: Pick<DeviceSpec, 'engine' | 'type'>): FunctionFace {
  const copy = ENGINE_COPY[spec.engine];
  const variant = hashType(spec.type) % 4;
  return { ...copy, variant, edition: String(variant + 1).padStart(2, '0') };
}
