/**
 * Data model for spec-driven rack devices (Reason lineup + hardware emulations).
 *
 * A spec is pure data: identity, catalog info, parameters (with ranges), ports, the DSP engine
 * that renders it and the look of its faceplate. The browser builds the device from it
 * (src/audio/spec), the faceplate renders it (src/components/faceplates/SpecFaceplate.tsx) and
 * the AI Combinator reads it (shared/rack/builtinCatalog.ts). No DOM / Node APIs here.
 */

export type SpecKind = 'instrument' | 'effect' | 'player' | 'utility';

/** DSP engines in src/audio/spec/engines (one engine renders many models via `engineConfig`). */
export type EngineId =
  | 'poly' // virtual-analog subtractive (mono / poly / unison / dual layer)
  | 'wavetable' // wavetable / graintable / additive with position morph and motion
  | 'fm' // N-operator FM with algorithms
  | 'westcoast' // complex oscillator, wavefolder, low-pass gate, function generator
  | 'modal' // struck / plucked partials (piano, mallets, bells, plucked world instruments)
  | 'formant' // voices through vowel formants (choir, winds)
  | 'bowed' // bowed strings (sustained excitation + body resonances)
  | 'sampler' // multi-zone sample player
  | 'multisample' // recorded instrument packs (velocity layers, round robin, choke groups)
  | 'granular' // grain cloud from a sample
  | 'loops' // sliced loop player (Dr. Octo Rex)
  | 'drums' // synthesized drum voices per machine profile
  | 'groove' // 16-pad sample kit + synth tracks (grooveboxes)
  | 'dynamics' // compressors / limiters / gates (AudioWorklet)
  | 'eq'
  | 'distortion'
  | 'modulation' // chorus / flanger / phaser / ensemble / unison / tremolo
  | 'delay'
  | 'reverb'
  | 'filter' // envelope / gated / swept filters
  | 'vocoder'
  | 'pitch'
  | 'pitchCorrect' // monophonic scale-aware audio pitch correction
  | 'timed' // Synchronous: tempo-synced effect modulation
  | 'stereo' // gain tool, stereo tool, imager
  | 'mixer' // line mixers, summing mixers
  | 'di'
  | 'patchbay'
  | 'player';

export type ParamUnit = '' | 'Hz' | 'ms' | 's' | 'dB' | '%' | 'st' | 'ct' | 'x' | ':1' | 'oct' | 'bpm';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** Discrete choices (value = index). */
  options?: readonly string[];
  unit?: ParamUnit;
  /** Knob response; 'log' for frequencies / times. */
  curve?: 'lin' | 'log';
  step?: number;
  /** How the faceplate draws it. Default: knob (select when options exist). */
  control?: 'knob' | 'fader' | 'toggle' | 'select' | 'buttons';
  /** Adds a CV input `cv_<key>` on the rear panel. */
  cv?: boolean;
  /** Faceplate section title. */
  section?: string;
}

export interface PortsDef {
  /** Stereo audio inputs (in_l/in_r, then in2_l … for mixers). Default: effects 1, others 0. */
  audioIns?: number;
  /** Stereo audio outputs (out_l/out_r, then out2_l …). Default: players 0, others 1. */
  audioOuts?: number;
  /** Labels for audio input pairs (mixer channels, carrier/modulator …). */
  inLabels?: readonly string[];
  outLabels?: readonly string[];
  /** Sidechain / modulator stereo input (sc_l / sc_r). */
  sidechain?: boolean;
  /** CV outputs (ids) — e.g. env_out, gr_out, note_cv, gate_cv, lfo1_out. */
  cvOut?: readonly string[];
  /** Extra CV inputs besides the per-param `cv` ones (e.g. cv_gate, cv_pitch). */
  cvIn?: readonly string[];
}

export type PanelFinish = 'brushed' | 'black' | 'wood' | 'cream' | 'white' | 'gloss' | 'retro' | 'blue' | 'red' | 'green' | 'orange' | 'grey' | 'gold' | 'purple' | 'teal';
export type KnobStyle = 'cap' | 'chicken' | 'moog' | 'metal' | 'plastic' | 'vintage' | 'led' | 'pot';
export type PanelDisplay = 'none' | 'scope' | 'gr' | 'meter' | 'pads' | 'steps' | 'xy' | 'lcd' | 'vu';

export interface PanelDef {
  finish: PanelFinish;
  /** CSS colours. */
  color: string;
  accent: string;
  text?: string;
  knob?: KnobStyle;
  /** Brand-style wordmark shown on the panel (plain text). */
  logo?: string;
  tagline?: string;
  display?: PanelDisplay;
  /** Rack units (1..4). */
  units?: 1 | 2 | 3 | 4;
  /** Number of pads to draw (drum machines / grooveboxes). */
  pads?: number;
}

export interface PadDef {
  name: string;
  note: number;
  /** Synth voice model (src/audio/spec/engines/drumVoices.ts). */
  voice: string;
  tune?: number;
  decay?: number;
  tone?: number;
  level?: number;
  /** Pads in the same choke group cut each other (open / closed hat). */
  choke?: number;
}

export interface DeviceSpec {
  /** DeviceType id (stable: saved in projects). */
  type: string;
  name: string;
  /** Short panel name. */
  short: string;
  kind: SpecKind;
  /** 'reason' = Reason Studios lineup emulation, 'hardware' = studio hardware emulation,
   *  'studio' = the app's own recorded instruments (shared/rack/devices/sampled.ts). */
  family: 'reason' | 'hardware' | 'studio';
  /** Browser group (Rack browser, Studio catalog). */
  group: string;
  /** AI / search category (shared/vst/manifestTypes SoundCategory or 'modulator'/'player'). */
  category: string;
  engine: EngineId;
  engineConfig?: Readonly<Record<string, unknown>>;
  description: string;
  tags: readonly string[];
  params: readonly ParamDef[];
  ports?: PortsDef;
  panel: PanelDef;
  /** Drum / groove pads. */
  pads?: readonly PadDef[];
  /** Param a Combinator macro drives by default. */
  macro?: { label: string; param: string; min: number; max: number };
}

// ---------------------------------------------------------------- param builders

type P = Omit<ParamDef, 'key' | 'label' | 'min' | 'max' | 'default'>;

export const knob = (key: string, label: string, min: number, max: number, def: number, extra: P = {}): ParamDef => ({
  key,
  label,
  min,
  max,
  default: def,
  ...extra,
});

export const sel = (key: string, label: string, options: readonly string[], def = 0, extra: P = {}): ParamDef => ({
  key,
  label,
  min: 0,
  max: options.length - 1,
  default: def,
  options,
  control: options.length <= 4 ? 'buttons' : 'select',
  step: 1,
  ...extra,
});

export const toggle = (key: string, label: string, def = 0, extra: P = {}): ParamDef => ({
  key,
  label,
  min: 0,
  max: 1,
  default: def,
  step: 1,
  control: 'toggle',
  ...extra,
});

export const hz = (key: string, label: string, min: number, max: number, def: number, extra: P = {}): ParamDef =>
  knob(key, label, min, max, def, { unit: 'Hz', curve: 'log', ...extra });

export const secs = (key: string, label: string, min: number, max: number, def: number, extra: P = {}): ParamDef =>
  knob(key, label, min, max, def, { unit: 's', curve: 'log', ...extra });

export const db = (key: string, label: string, min: number, max: number, def: number, extra: P = {}): ParamDef =>
  knob(key, label, min, max, def, { unit: 'dB', ...extra });

export const pct = (key: string, label: string, def: number, extra: P = {}): ParamDef => knob(key, label, 0, 1, def, { unit: '%', ...extra });

/** Amp envelope (keys attack/decay/sustain/release). */
export const ampEnv = (a = 0.005, d = 0.3, s = 0.7, r = 0.3, section = 'Amp Env'): ParamDef[] => [
  secs('attack', 'Attack', 0.001, 8, a, { section }),
  secs('decay', 'Decay', 0.005, 8, d, { section }),
  pct('sustain', 'Sustain', s, { section }),
  secs('release', 'Release', 0.005, 10, r, { section }),
];

/** Filter envelope (keys fAttack/fDecay/fSustain/fRelease + envAmount). */
export const filterEnv = (a = 0.005, d = 0.4, s = 0.2, r = 0.4, amount = 0.4, section = 'Filter Env'): ParamDef[] => [
  secs('fAttack', 'Attack', 0.001, 8, a, { section }),
  secs('fDecay', 'Decay', 0.005, 8, d, { section }),
  pct('fSustain', 'Sustain', s, { section }),
  secs('fRelease', 'Release', 0.005, 10, r, { section }),
  knob('envAmount', 'Env Amt', -1, 1, amount, { section, cv: true }),
];

export const filterBlock = (types: readonly string[], cutoff = 2400, res = 0.2, section = 'Filter'): ParamDef[] => [
  sel('filterType', 'Type', types, 0, { section }),
  hz('cutoff', 'Cutoff', 20, 20000, cutoff, { section, cv: true }),
  pct('resonance', 'Resonance', res, { section, cv: true }),
  pct('keyTrack', 'Key Track', 0.3, { section }),
  pct('drive', 'Drive', 0.1, { section }),
];

export const lfoBlock = (rate = 4, section = 'LFO', waves: readonly string[] = ['Sine', 'Tri', 'Saw', 'Square', 'S&H']): ParamDef[] => [
  sel('lfoWave', 'Wave', waves, 1, { section }),
  hz('lfoRate', 'Rate', 0.05, 40, rate, { section, cv: true }),
  pct('lfoPitch', 'To Pitch', 0, { section }),
  pct('lfoCutoff', 'To Filter', 0, { section }),
  pct('lfoAmp', 'To Amp', 0, { section }),
];

export const outBlock = (vol = 0.8, section = 'Output'): ParamDef[] => [knob('volume', 'Volume', 0, 1.5, vol, { section, cv: true })];

export const mixBlock = (mix = 1, section = 'Output'): ParamDef[] => [
  pct('mix', 'Mix', mix, { section, cv: true }),
  db('output', 'Output', -24, 12, 0, { section }),
];
