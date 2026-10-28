/**
 * Built-in rack devices the AI Combinator may use, with their REAL port ids and parameter ranges
 * (taken from src/audio/devices/*). Keep in sync when a device's ports or params change.
 * Also defines the fixed port layout of mounted library (VST) units.
 */
import type { SoundCategory, UnitRole } from '../vst/manifestTypes.ts';
import { categoriesInText, tokenize } from '../vst/search.ts';
import { DEVICE_SPECS, audioInCount, audioOutCount, specCvInputs, specCvOutputs, type DeviceSpec } from './devices/index.ts';

export type RackRole = UnitRole | 'modulator';

export interface ParamRange {
  min: number;
  max: number;
}

export interface UnitPortLayout {
  audioIn: boolean;
  audioOut: boolean;
  cvIn: string[];
  cvOut: string[];
}

export interface BuiltinDeviceSpec extends UnitPortLayout {
  type: string;
  name: string;
  role: RackRole;
  category: SoundCategory | 'modulator';
  description: string;
  tags: string[];
  params: Record<string, ParamRange>;
  options?: Record<string, string[]>;
  booleans?: string[];
  /** Param a Combinator macro should drive by default, with a musically useful range. */
  macro?: { label: string; param: string } & ParamRange;
}

const ADSR = {
  attack: { min: 0.004, max: 2 },
  decay: { min: 0.02, max: 3 },
  sustain: { min: 0, max: 1 },
  release: { min: 0.03, max: 4 },
};
const FILTER = { cutoff: { min: 40, max: 18000 }, resonance: { min: 0.5, max: 20 } };
const VOLUME = { volume: { min: 0, max: 1.5 } };
const SYNTH_CV = ['cv_cutoff', 'cv_pitch', 'cv_gate'];
const WAVES = ['sawtooth', 'square', 'triangle', 'sine'];

const LEGACY_BUILTINS: BuiltinDeviceSpec[] = [
  {
    type: 'subtractor', name: 'Twin-Osc Analog Synth', role: 'instrument', category: 'synth',
    description: 'Dual-oscillator subtractive synth: punchy leads, basses, plucks',
    tags: ['lead', 'bass', 'pluck', 'analog', 'acid', 'synthwave'],
    audioIn: false, audioOut: true, cvIn: SYNTH_CV, cvOut: [],
    params: { ...FILTER, ...ADSR, ...VOLUME, glide: { min: 0.005, max: 0.35 }, subOscLevel: { min: 0, max: 1 }, osc2Detune: { min: -50, max: 50 } },
    options: { osc1Type: WAVES, osc2Type: WAVES, filterType: ['lowpass', 'highpass', 'bandpass'] },
    macro: { label: 'Cutoff', param: 'cutoff', min: 200, max: 9000 },
  },
  {
    type: 'thor', name: 'Thunderhead Polysonic Synth', role: 'instrument', category: 'synth',
    description: 'Three-oscillator polysynth with drive and chorus: rich leads and chords',
    tags: ['poly', 'chords', 'lead', 'rich', 'chorus'],
    audioIn: false, audioOut: true, cvIn: SYNTH_CV, cvOut: [],
    params: { ...FILTER, ...ADSR, ...VOLUME, drive: { min: 0, max: 10 }, chorusAmount: { min: 0, max: 1 } },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 10000 },
  },
  {
    type: 'third_wave', name: '3rd Wave Advanced Wavetable Synth', role: 'instrument', category: 'synth',
    description: '24-voice wavetable synth with 3 oscs, Wave Surfer, dual analog/SVF filters & vintage PPG engine',
    tags: ['3rd wave', 'third wave', 'wavetable', 'ppg', 'wave surfer', 'analog', 'hybrid', 'evolving', 'lush', 'poly', 'chords', 'vintage', 'digital', 'pad', 'lead'],
    audioIn: true, audioOut: true,
    cvIn: ['cv_gate', 'cv_pitch', 'cv_wave_surfer', 'cv_filter1_cutoff', 'cv_filter2_cutoff', 'cv_amp'],
    cvOut: ['cv_out_wave_env', 'cv_out_filter_env', 'cv_out_lfo1'],
    params: {
      waveSurfer: { min: -63, max: 63 },
      waveFlow: { min: 0, max: 100 },
      circuitDrift: { min: 0, max: 100 },
      osc1_wave: { min: 0, max: 63 },
      osc1_pitch: { min: -24, max: 24 },
      osc1_fine: { min: -50, max: 50 },
      osc1_level: { min: 0, max: 100 },
      osc1_kw: { min: -63, max: 63 },
      osc2_wave: { min: 0, max: 63 },
      osc2_pitch: { min: -24, max: 24 },
      osc2_fine: { min: -50, max: 50 },
      osc2_level: { min: 0, max: 100 },
      osc2_fm: { min: 0, max: 1 },
      osc3_wave: { min: 0, max: 63 },
      osc3_pitch: { min: -24, max: 24 },
      osc3_fine: { min: -50, max: 50 },
      osc3_level: { min: 0, max: 100 },
      osc3_fm: { min: 0, max: 1 },
      f1_cutoff: { min: 20, max: 20000 },
      f1_resonance: { min: 0.5, max: 20 },
      f1_envAmt: { min: -100, max: 100 },
      f2_cutoff: { min: 20, max: 20000 },
      f2_resonance: { min: 0.5, max: 25 },
      f2_drive: { min: 0, max: 100 },
      f2_bassComp: { min: 0, max: 100 },
      f2_envAmt: { min: -100, max: 100 },
      fenv_attack: { min: 0.005, max: 6 },
      fenv_decay: { min: 0.01, max: 10 },
      fenv_sustain: { min: 0, max: 1 },
      fenv_release: { min: 0.01, max: 10 },
      aenv_attack: { min: 0.005, max: 6 },
      aenv_decay: { min: 0.01, max: 10 },
      aenv_sustain: { min: 0, max: 1 },
      aenv_release: { min: 0.01, max: 10 },
      panSpread: { min: 0, max: 100 },
      unisonVoices: { min: 1, max: 8 },
      unisonDetune: { min: 0, max: 50 },
      glide: { min: 0, max: 2.0 },
      volume: { min: 0, max: 1.5 },
      fx1_mix: { min: 0, max: 1 },
      fx1_time: { min: 0.02, max: 2.0 },
      fx1_feedback: { min: 0, max: 0.92 },
      fx2_mix: { min: 0, max: 1 },
      fx2_decay: { min: 0.5, max: 12 },
    },
    options: {
      osc1_type: ['p', 'u', 'a', 's'],
      osc2_type: ['p', 'u', 'a', 's'],
      osc3_type: ['p', 'u', 'a', 's'],
      f1_mode: ['lowpass', 'notch', 'highpass', 'bandpass'],
      fx1_type: ['chorus', 'bbd_delay', 'stereo_delay', 'tape_delay', 'flanger', 'phaser'],
      fx2_type: ['hall_reverb', 'room_reverb', 'superplate', 'distortion'],
    },
    macro: { label: 'Wave Surfer', param: 'waveSurfer', min: -63, max: 63 },
  },
  {
    type: 'europa', name: 'Aurora Wavetable Synth', role: 'instrument', category: 'synth',
    description: 'Wavetable synth with morph and unison: evolving pads and modern leads',
    tags: ['pad', 'wavetable', 'ambient', 'evolving', 'lush', 'atmosphere'],
    audioIn: false, audioOut: true, cvIn: ['cv_cutoff', 'cv_morph', 'cv_pitch', 'cv_gate'], cvOut: [],
    params: {
      ...FILTER, ...ADSR, ...VOLUME, morph: { min: 0, max: 1 }, harmonics: { min: 0.5, max: 4 }, subLevel: { min: 0, max: 1 },
      unison: { min: 0, max: 1 }, formantFreq: { min: 200, max: 4000 }, drive: { min: 0, max: 10 },
    },
    macro: { label: 'Morph', param: 'morph', min: 0, max: 1 },
  },
  {
    type: 'monotone', name: 'Monobass Synth', role: 'instrument', category: 'bass',
    description: 'Monophonic ladder-filter bass synth: sub, acid and 808-style bass',
    tags: ['bass', 'sub', '808', 'acid', 'mono', 'low end'],
    audioIn: false, audioOut: true, cvIn: SYNTH_CV, cvOut: [],
    params: {
      cutoff: { min: 40, max: 6000 }, resonance: { min: 0.5, max: 20 }, envAmount: { min: 0, max: 1 }, decay: { min: 0.05, max: 2 },
      drive: { min: 0, max: 10 }, subLevel: { min: 0, max: 1 }, glide: { min: 0, max: 0.4 }, ...VOLUME,
    },
    options: { waveform: ['sawtooth', 'square'] },
    macro: { label: 'Cutoff', param: 'cutoff', min: 120, max: 3000 },
  },
  {
    type: 'three_osc', name: 'Tri-Osc Power Synth', role: 'instrument', category: 'synth',
    description: 'Three detuned oscillators: supersaw leads and fat chords',
    tags: ['supersaw', 'lead', 'trance', 'fat', 'chords'],
    audioIn: false, audioOut: true, cvIn: ['cv_cutoff', 'cv_pitch'], cvOut: [],
    params: { ...FILTER, ...ADSR, ...VOLUME },
    macro: { label: 'Cutoff', param: 'cutoff', min: 300, max: 12000 },
  },
  {
    type: 'redrum', name: 'Beatbox 8 Drum Computer', role: 'instrument', category: 'drums',
    description: 'Synthesized 8-voice drum machine (kick, snare, hats, claps, toms)',
    tags: ['drum machine', 'electronic drums', '808', '909', 'beat', 'kick', 'snare'],
    audioIn: false, audioOut: true, cvIn: ['cv_gate_bd', 'cv_gate_sd'], cvOut: [],
    params: { ...VOLUME, shuffle: { min: 0, max: 0.5 }, accentLevel: { min: 1, max: 2 } },
  },
  {
    type: 'bansuri', name: 'Bansuri Bamboo Flute', role: 'instrument', category: 'winds',
    description: 'Indian bamboo flute with breath and meend (pitch bend) modelling',
    tags: ['flute', 'indian', 'world', 'breathy', 'meditative'],
    audioIn: false, audioOut: true, cvIn: ['cv_pitch'], cvOut: [],
    params: { ...VOLUME, breathPressure: { min: 0.2, max: 1.2 }, vibratoDepth: { min: 0, max: 1 } },
  },
  {
    type: 'harmonium', name: 'Classical Harmonium', role: 'instrument', category: 'keys',
    description: 'Reed harmonium with bellows and drone coupling',
    tags: ['harmonium', 'indian', 'devotional', 'reed', 'organ'],
    audioIn: false, audioOut: true, cvIn: ['cv_bellows'], cvOut: [],
    params: { ...VOLUME, airReservoir: { min: 0.2, max: 1.2 }, droneCoupling: { min: 0, max: 1 } },
  },
  {
    type: 'tabla', name: 'Tabla (Dayan & Bayan)', role: 'instrument', category: 'percussion',
    description: 'Indian tabla pair with skin tension and bayan resonance',
    tags: ['tabla', 'indian', 'world', 'percussion', 'hand drum'],
    audioIn: false, audioOut: true, cvIn: ['cv_pitch', 'cv_gate'], cvOut: [],
    params: { ...VOLUME, skinTension: { min: 0.3, max: 1.6 }, bayanResonance: { min: 0.2, max: 1.5 } },
  },
  {
    // the sound follows the unit's name (Piano, Guitar, Flute, Harmonium …; anything else = sitar)
    type: 'world_instrument', name: 'World Instrument', role: 'instrument', category: 'strings',
    description: 'Acoustic world strings (sitar-style pluck with sympathetic shimmer)',
    tags: ['sitar', 'indian', 'world', 'acoustic', 'plucked'],
    audioIn: false, audioOut: true, cvIn: [], cvOut: [],
    params: { ...VOLUME, toneColor: { min: 0.1, max: 1 }, resonance: { min: 0.1, max: 1 } },
  },
  {
    type: 'dhol', name: 'Dhol Folk Drum', role: 'instrument', category: 'percussion',
    description: 'Punjabi barrel drum: deep dugga bass and sharp tilli stick',
    tags: ['dhol', 'bhangra', 'punjabi', 'indian', 'world', 'percussion', 'drum'],
    audioIn: false, audioOut: true, cvIn: ['cv_gate'], cvOut: [],
    params: { ...VOLUME, punchTension: { min: 0.4, max: 1.6 }, cutoff: { min: 200, max: 18000 } },
  },
  {
    type: 'tumbi', name: 'Tumbi Folk Resonator', role: 'instrument', category: 'strings',
    description: 'Single-string Punjabi folk lute with a bright, twangy pluck',
    tags: ['tumbi', 'punjabi', 'bhangra', 'indian', 'world', 'plucked'],
    audioIn: false, audioOut: true, cvIn: [], cvOut: [],
    params: { ...VOLUME, stringTension: { min: 0.5, max: 1.5 } },
  },
  {
    type: 'percussion_electronic', name: 'Percussion/Electronic Instrument', role: 'instrument', category: 'percussion',
    description: 'Hand drums, big drums or electronic hits, chosen by the unit name',
    tags: ['percussion', 'hand drum', 'electronic', 'hits', 'world'],
    audioIn: false, audioOut: true, cvIn: ['cv_pitch', 'cv_gate'], cvOut: [],
    params: { ...VOLUME, brilliance: { min: 0.1, max: 1 }, decay: { min: 0.1, max: 2 } },
  },
  {
    type: 'scream4', name: 'Howler Distortion', role: 'effect', category: 'saturation',
    description: 'Heavy distortion / tape / tube destruction with tone control',
    tags: ['distortion', 'heavy', 'aggressive', 'destroy', 'fuzz', 'industrial', 'scream'],
    audioIn: true, audioOut: true, cvIn: ['cv_drive', 'cv_tone'], cvOut: [],
    params: { drive: { min: 1, max: 20 }, warmth: { min: 0, max: 1 }, bias: { min: -0.5, max: 0.5 }, tone: { min: 500, max: 18000 }, mix: { min: 0, max: 1 } },
    macro: { label: 'Drive', param: 'drive', min: 1, max: 16 },
  },
  {
    type: 'echo', name: 'Repeater Stereo Delay', role: 'effect', category: 'delay',
    description: 'Stereo / ping-pong delay with feedback damping',
    tags: ['delay', 'echo', 'ping-pong', 'dub', 'slapback'],
    audioIn: true, audioOut: true, cvIn: ['cv_time', 'cv_feedback'], cvOut: [],
    params: { time: { min: 0.02, max: 2.5 }, feedback: { min: 0, max: 0.92 }, damp: { min: 300, max: 18000 }, mix: { min: 0, max: 1 } },
    booleans: ['pingPong'],
    macro: { label: 'Echo', param: 'mix', min: 0, max: 0.6 },
  },
  {
    type: 'rv7000', name: 'Cathedral Reverb', role: 'effect', category: 'reverb',
    description: 'Algorithmic reverb: hall, plate, room, spring, space',
    tags: ['reverb', 'hall', 'plate', 'room', 'space', 'ambient', 'lush'],
    audioIn: true, audioOut: true, cvIn: ['cv_decay', 'cv_mix'], cvOut: [],
    params: { decay: { min: 0.2, max: 12 }, size: { min: 0.1, max: 1 }, preDelay: { min: 0, max: 0.2 }, damping: { min: 500, max: 18000 }, mix: { min: 0, max: 1 } },
    options: { preset: ['Hall', 'Plate', 'Room', 'Spring', 'Space'] },
    macro: { label: 'Space', param: 'mix', min: 0, max: 0.7 },
  },
  {
    type: 'mclass_master', name: 'Masterline Mastering Suite', role: 'effect', category: 'dynamics',
    description: 'Mastering chain: 4-band EQ, compressor, stereo width, limiter',
    tags: ['mastering', 'master bus', 'glue', 'compressor', 'limiter', 'polish'],
    audioIn: true, audioOut: true, cvIn: [], cvOut: [],
    params: {
      eqLowGain: { min: -12, max: 12 }, eqLowMidGain: { min: -12, max: 12 }, eqHighMidGain: { min: -12, max: 12 }, eqHighGain: { min: -12, max: 12 },
      compThreshold: { min: -40, max: 0 }, compRatio: { min: 1, max: 20 }, compAttack: { min: 0.001, max: 0.1 }, compRelease: { min: 0.02, max: 1 },
      makeupGain: { min: 0.5, max: 3 }, stereoWidth: { min: 0, max: 2 }, limiterCeiling: { min: -6, max: 0 }, warmthDrive: { min: 0, max: 6 },
    },
    macro: { label: 'Glue', param: 'compThreshold', min: -6, max: -30 },
  },
  {
    type: 'pulsar', name: 'Twin LFO', role: 'modulator', category: 'modulator',
    description: 'Two LFOs as CV sources for wobble, tremolo, filter and mix movement',
    tags: ['lfo', 'wobble', 'movement', 'modulation', 'pulse', 'evolving'],
    audioIn: false, audioOut: false, cvIn: [], cvOut: ['lfo1_out', 'lfo2_out'],
    params: { rate1: { min: 0.05, max: 20 }, depth1: { min: 0, max: 1 }, rate2: { min: 0.05, max: 20 }, depth2: { min: 0, max: 1 } },
    options: { shape1: ['sine', 'triangle', 'saw', 'square', 'random'], shape2: ['sine', 'triangle', 'saw', 'square', 'random'] },
    macro: { label: 'Movement', param: 'depth1', min: 0, max: 1 },
  },
  {
    type: 'matrix', name: 'Matrix Pattern Sequencer', role: 'modulator', category: 'modulator',
    description: '16-step CV sequencer: note (semitones), gate and curve outputs',
    tags: ['sequencer', 'arp', 'arpeggio', 'pattern', 'steps', 'acid'],
    audioIn: false, audioOut: false, cvIn: [], cvOut: ['note_cv', 'gate_cv', 'curve_cv'],
    params: { numSteps: { min: 1, max: 32 } },
  },
];

/** Spec-driven devices (shared/rack/devices) as AI built-ins: real ports, ranges, options. */
function fromSpec(s: DeviceSpec): BuiltinDeviceSpec {
  const params: Record<string, ParamRange> = {};
  const options: Record<string, string[]> = {};
  const booleans: string[] = [];
  for (const p of s.params) {
    if (p.options) options[p.key] = [...p.options];
    else if (p.control === 'toggle') booleans.push(p.key);
    else params[p.key] = { min: p.min, max: p.max };
  }
  const cat = s.kind === 'player' ? 'modulator' : (s.category as SoundCategory);
  return {
    type: s.type,
    name: s.name,
    role: s.kind === 'instrument' ? 'instrument' : s.kind === 'player' ? 'modulator' : 'effect',
    category: cat,
    description: s.description,
    tags: [...s.tags],
    audioIn: audioInCount(s) > 0,
    audioOut: audioOutCount(s) > 0,
    cvIn: specCvInputs(s),
    cvOut: specCvOutputs(s),
    params,
    options: Object.keys(options).length ? options : undefined,
    booleans: booleans.length ? booleans : undefined,
    macro: s.macro,
  };
}

export const BUILTIN_DEVICES: BuiltinDeviceSpec[] = [...LEGACY_BUILTINS, ...DEVICE_SPECS.map(fromSpec)];

export const BUILTIN_BY_TYPE: Map<string, BuiltinDeviceSpec> = new Map(BUILTIN_DEVICES.map((d) => [d.type, d]));

/**
 * Built-ins ranked for a prompt (name / tag / category / description matches). The AI route sends
 * full details for the best matches and a one-line list for the rest, keeping prompts small.
 */
export function rankBuiltins(prompt: string): BuiltinDeviceSpec[] {
  const words = new Set(tokenize(prompt));
  const cats = new Set<string>(categoriesInText(prompt));
  const text = prompt.toLowerCase();
  const score = (d: BuiltinDeviceSpec) => {
    let s = 0;
    if (cats.has(d.category)) s += 6;
    for (const t of d.tags) if (text.includes(t.toLowerCase())) s += t.includes(' ') ? 5 : 3;
    for (const w of tokenize(d.name)) if (words.has(w)) s += 4;
    for (const w of tokenize(d.description)) if (w.length > 3 && words.has(w)) s += 1;
    return s;
  };
  return BUILTIN_DEVICES.map((d, i) => ({ d, s: score(d), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.d);
}

/** Port layout of every mounted library unit (src/vst/VstPluginDevice.ts builds its ports from this). */
export const VST_MACRO_CV_INPUTS = ['cv_m1', 'cv_m2', 'cv_m3', 'cv_m4'];

export function vstPortLayout(role: UnitRole): UnitPortLayout {
  return role === 'effect'
    ? { audioIn: true, audioOut: true, cvIn: [...VST_MACRO_CV_INPUTS, 'cv_mix'], cvOut: ['env_out'] }
    : { audioIn: false, audioOut: true, cvIn: ['cv_gate', 'cv_pitch', ...VST_MACRO_CV_INPUTS], cvOut: ['env_out'] };
}

/** Numeric params every library unit accepts. */
export const VST_PARAM_RANGES: Record<string, ParamRange> = {
  macro1: { min: 0, max: 1 },
  macro2: { min: 0, max: 1 },
  macro3: { min: 0, max: 1 },
  macro4: { min: 0, max: 1 },
  mix: { min: 0, max: 1 },
  output: { min: 0, max: 1.5 },
};
