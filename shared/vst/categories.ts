import type { MacroId, MacroSpec, SoundCategory, UnitRole } from './manifestTypes.ts';

/**
 * Macro meaning per category. The proxy DSP (src/vst/proxyDsp.ts) interprets macro1..macro4 by
 * category, so these labels describe what each knob really does on a mounted unit.
 */
const MACROS: Record<SoundCategory, [string, number][]> = {
  eq: [['Low', 0.5], ['Low-Mid', 0.5], ['High-Mid', 0.5], ['High', 0.5]],
  dynamics: [['Threshold', 0.4], ['Ratio', 0.3], ['Attack', 0.2], ['Makeup', 0.2]],
  limiter: [['Threshold', 0.35], ['Output', 1], ['Release', 0.3]],
  saturation: [['Drive', 0.35], ['Asymmetry', 0.2], ['Tone', 0.6], ['Trim', 0.75]],
  pitch: [['Pitch Shift', 0.5], ['Bitcrush', 0], ['Tone', 0.5]],
  reverb: [['Decay', 0.45], ['Pre-Delay', 0.2], ['Damping', 0.5]],
  delay: [['Time', 0.35], ['Feedback', 0.4], ['Tone', 0.6], ['Spread', 0.3]],
  modulation: [['Rate', 0.3], ['Depth', 0.5], ['Feedback', 0.2]],
  filter: [['Cutoff', 0.6], ['Resonance', 0.25], ['Drive', 0]],
  utility: [['Gain', 0.6667]],
  piano: [['Brightness', 0.5], ['Decay', 0.5], ['Body', 0.5], ['Room', 0.25]],
  keys: [['Brightness', 0.5], ['Decay', 0.5], ['Body', 0.5], ['Room', 0.25]],
  strings: [['Attack', 0.3], ['Brightness', 0.5], ['Vibrato', 0.35], ['Release', 0.45]],
  brass: [['Attack', 0.15], ['Brightness', 0.6], ['Vibrato', 0.2], ['Release', 0.35]],
  winds: [['Attack', 0.2], ['Brightness', 0.5], ['Vibrato', 0.4], ['Release', 0.35]],
  orchestral: [['Attack', 0.3], ['Brightness', 0.5], ['Vibrato', 0.3], ['Release', 0.5]],
  choir: [['Attack', 0.4], ['Brightness', 0.45], ['Vibrato', 0.3], ['Release', 0.55]],
  drums: [['Kick Tune', 0.5], ['Snare Tone', 0.5], ['Hat Decay', 0.4], ['Room', 0.2]],
  percussion: [['Kick Tune', 0.5], ['Snare Tone', 0.5], ['Hat Decay', 0.4], ['Room', 0.25]],
  guitar: [['Brightness', 0.5], ['Pick', 0.6], ['Decay', 0.5], ['Body', 0.5]],
  bass: [['Cutoff', 0.4], ['Resonance', 0.3], ['Decay', 0.5], ['Drive', 0.2]],
  synth: [['Cutoff', 0.6], ['Resonance', 0.3], ['Attack', 0.05], ['Release', 0.35]],
  sampler: [['Cutoff', 0.6], ['Resonance', 0.3], ['Attack', 0.05], ['Release', 0.35]],
  unknown: [['Cutoff', 0.6], ['Resonance', 0.3], ['Attack', 0.05], ['Release', 0.35]],
};

const MACRO_IDS: MacroId[] = ['macro1', 'macro2', 'macro3', 'macro4'];

/** Macro specs for a category, optionally renaming knobs (semantics stay fixed by position). */
export function macrosForCategory(category: SoundCategory, labels?: (string | undefined)[]): MacroSpec[] {
  return MACROS[category].map(([label, def], i) => ({
    id: MACRO_IDS[i],
    label: labels?.[i] || label,
    default: def,
  }));
}

export const EFFECT_CATEGORIES: SoundCategory[] = [
  'eq',
  'dynamics',
  'limiter',
  'saturation',
  'pitch',
  'reverb',
  'delay',
  'modulation',
  'filter',
  'utility',
];

export function roleForCategory(category: SoundCategory): UnitRole {
  return EFFECT_CATEGORIES.includes(category) ? 'effect' : 'instrument';
}

export const CATEGORY_LABELS: Record<SoundCategory, string> = {
  eq: 'EQ',
  dynamics: 'Dynamics',
  limiter: 'Limiter',
  saturation: 'Saturation',
  pitch: 'Pitch / Vocal',
  reverb: 'Reverb',
  delay: 'Delay',
  modulation: 'Modulation',
  filter: 'Filter',
  utility: 'Utility',
  piano: 'Piano',
  keys: 'Keys',
  strings: 'Strings',
  brass: 'Brass',
  winds: 'Winds',
  orchestral: 'Orchestral',
  choir: 'Choir',
  drums: 'Drums',
  percussion: 'Percussion',
  guitar: 'Guitar',
  bass: 'Bass',
  synth: 'Synth',
  sampler: 'Sampler',
  unknown: 'Other',
};

/**
 * Words that point at a category. Used by the scanner (names → category), search (query
 * expansion) and the local planner (prompt → intent). Keep entries lowercase.
 */
export const CATEGORY_KEYWORDS: Record<SoundCategory, string[]> = {
  eq: ['eq', 'equalizer', 'equaliser', 'dynamic eq', 'surgical', 'tame', 'harsh', 'mud', 'muddy', 'de-ess', 'deess', 'sibilance', 'clean', 'clarity', 'tonal'],
  dynamics: ['compressor', 'compression', 'comp', 'glue', 'squash', 'punchy', 'transient', 'gate'],
  limiter: ['limiter', 'limit', 'loud', 'loudness', 'maximizer', 'maximiser', 'master', 'mastering', 'brickwall', 'radio', 'lufs'],
  saturation: ['saturation', 'saturator', 'saturate', 'warm', 'warmth', 'analog', 'analogue', 'tape', 'tube', 'valve', 'console', 'drive', 'overdrive', 'grit', 'gritty', 'crunch', 'harmonics', 'fuzz', 'dirty', 'distortion', 'distorted', 'lofi', 'lo-fi'],
  pitch: ['pitch', 'autotune', 'auto-tune', 'tune', 'tuning', 'correction', 'vocal', 'vocals', 'voice', 'formant', 'robot', 'robotic', 'chipmunk', 'octave', 'harmonizer', 'bitcrush', 'bitcrusher'],
  reverb: ['reverb', 'verb', 'hall', 'room', 'plate', 'space', 'spacious', 'cathedral', 'ambience', 'ambient', 'wet', 'lush', 'huge', 'epic', 'shimmer'],
  delay: ['delay', 'echo', 'dub', 'slapback', 'ping-pong', 'pingpong', 'repeat', 'tape echo'],
  modulation: ['chorus', 'flanger', 'phaser', 'ensemble', 'wide', 'width', 'stereo', 'vibrato', 'tremolo', 'rotary', 'wobble'],
  filter: ['filter', 'sweep', 'wah', 'lowpass', 'highpass', 'resonant', 'cutoff'],
  utility: ['utility', 'gain', 'trim', 'meter', 'analyzer', 'analyser'],
  piano: ['piano', 'grand', 'upright', 'felt', 'keys', 'pianist', 'ballad'],
  keys: ['rhodes', 'wurlitzer', 'electric piano', 'organ', 'clavinet', 'keyboard'],
  strings: ['strings', 'string', 'violin', 'violins', 'viola', 'violas', 'cello', 'cellos', 'contrabass', 'basses', 'legato', 'pizzicato', 'spiccato', 'tremolos', 'sordino', 'ensemble strings', 'solo strings'],
  brass: ['brass', 'horn', 'horns', 'trumpet', 'trumpets', 'trombone', 'trombones', 'tuba', 'french horn', 'fanfare'],
  winds: ['winds', 'woodwind', 'woodwinds', 'flute', 'flutes', 'clarinet', 'oboe', 'bassoon', 'piccolo'],
  orchestral: ['orchestra', 'orchestral', 'cinematic', 'film', 'score', 'trailer', 'majestic', 'symphonic', 'heroic', 'epic orchestra'],
  choir: ['choir', 'choral', 'voices', 'chant', 'aahs', 'oohs'],
  drums: ['drums', 'drum', 'kit', 'beat', 'groove', 'kick', 'snare', 'hihat', 'hi-hat', 'cymbal', 'breakbeat', 'rock drums', 'acoustic drums'],
  percussion: ['percussion', 'perc', 'timpani', 'taiko', 'toms', 'mallets', 'shaker'],
  guitar: ['guitar', 'guitars', 'acoustic guitar', 'strum', 'strumming', 'fingerpicking', 'steel string', 'nylon', 'folk', 'riff'],
  bass: ['bass', 'bassline', 'sub', '808', 'low end', 'reese'],
  synth: ['synth', 'synthesizer', 'lead', 'pad', 'arp', 'pluck', 'analog synth', 'wavetable', 'supersaw', 'acid', 'retro', 'synthwave'],
  sampler: ['sampler', 'sample player', 'rompler'],
  unknown: [],
};
