/**
 * Unboxed Modular DAW Type System
 */

export type DeviceType =
  | 'subtractor'
  | 'thor'
  | 'europa'
  | 'monotone'
  | 'redrum'
  | 'mimic'
  | 'matrix'
  | 'pulsar'
  | 'scream4'
  | 'rv7000'
  | 'echo'
  | 'mclass_master'
  | 'spider_audio'
  | 'spider_cv'
  | 'three_osc'
  | 'sytrus'
  | 'flex'
  | 'automation_clip'
  | 'bansuri'
  | 'harmonium'
  | 'tabla'
  | 'tanpura'
  | 'dhol'
  | 'tumbi'
  | 'world_instrument'
  | 'percussion_electronic'
  | 'wyvern'
  | 'ember'
  | 'malstrom'
  | 'algoritm'
  | 'complex1'
  | 'parsec2'
  | 'polytone'
  | 'objekt'
  | 'grain'
  | 'nnxt'
  | 'nn19'
  | 'kong'
  | 'dr_octo_rex'
  | 'umpf'
  | 'friktion'
  | 'scenic'
  | 'humana'
  | 'pangea'
  | 'klang'
  | 'radical_piano'
  | 'reason_performance'
  | 'layers_id8'
  | 'rv9'
  | 'ripley'
  | 'osmium'
  | 'pulveriser'
  | 'alligator'
  | 'bvx_vocoder'
  | 'neptune'
  | 'quartet'
  | 'sweeper'
  | 'audiomatic'
  | 'rotor'
  | 'softube_amp'
  | 'combinator'
  | 'rpg8'
  | 'midi_out'
  | 'line_mixer';

export type PortType = 'audio_in' | 'audio_out' | 'cv_in' | 'cv_out';

export interface PortDefinition {
  id: string;
  name: string;
  type: PortType;
  channel?: 'left' | 'right' | 'mono';
  description?: string;
}

export interface AudioConnection {
  id: string;
  sourceDeviceId: string;
  sourcePortId: string;
  targetDeviceId: string;
  targetPortId: string;
  color: string;
}

export interface CVConnection {
  id: string;
  sourceDeviceId: string;
  sourcePortId: string;
  targetDeviceId: string;
  targetPortId: string;
  amount: number; // -1 to 1 scaling
  inverted?: boolean;
  color: string;
}

export interface CVMatrixEntry {
  id: string;
  sourceDeviceId: string;
  sourcePortId: string;
  targetDeviceId: string;
  targetParam: string;
  amount: number; // -1.0 to 1.0
  offset: number; // -1.0 to 1.0
  inverted: boolean;
}

export interface StepSequence {
  notes: number[]; // semitone offset from root
  gates: boolean[];
  velocities: number[]; // 0 to 1
  curveCV: number[]; // 0 to 1
}

export interface DrumVoice {
  id: string;
  name: string;
  pitch: number;
  decay: number;
  tone: number;
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  pattern: boolean[];
  accentPattern: boolean[];
}

export interface DeviceState {
  id: string;
  type: DeviceType;
  name: string;
  heightUnits: number; // 1U, 2U, 3U
  params: Record<string, any>;
  power: boolean;
  bypass: boolean;
}

export interface TelemetryData {
  rmsL: number;
  rmsR: number;
  peakL: number;
  peakR: number;
  gainReductionDb: number;
  currentStep: number;
  bpm: number;
  isPlaying: boolean;
  isRecording: boolean;
  audioTime: number;
}

export interface SequencerNote {
  note: number;      // MIDI note number 24 (C1) to 84 (C6)
  velocity: number;  // 0.0 to 1.0
  length: number;    // In 16th steps (1, 2, 4, 8, 16...)
  muted?: boolean;   // Per-note mute state (Mute Tool)
  chordNotes?: number[]; // Additional chord intervals/notes triggered on this step
  finePitch?: number; // Vari-Pitch / fine cents offset (-100 to +100)
  microOffset?: number; // Micro-timing offset (-0.5 to +0.5 step)
  probability?: number; // Per-Step Random Number Note Chance Probability (0.1 to 1.0, default 1.0)
  ratchet?: number;     // Step Ratchet Note Subdivision Repetition Sub-Loop (1, 2, 3, 4)
  aftertouch?: number;  // Polyphonic Aftertouch Continuous Pressure Value (0.0 to 1.0)
  mpePitch?: number;    // MPE Per-Note Pitch Bend (-24 to +24 semitones)
  mpePressure?: number; // MPE Per-Note Pressure (0.0 to 1.0)
  mpeSlide?: number;    // MPE Per-Note Y-Axis Slide / Timbre (0.0 to 1.0)
}

export type InternalOptionCategory =
  | 'unboxed_gold'
  | 'f1_sequencer'
  | 'f2_mixer'
  | 'f3_rack'
  | 'split_view'
  | 'add_module'
  | 'ai_copilot'
  | 'cv_matrix'
  | 'master_knob'
  | 'vu_dials'
  | 'step_grid'
  | 'piano_roll'
  | 'arrangement'
  | 'graph_cc'
  | 'sample_warp'
  | 'dsp_analyzer';

export type AdvancedOptionCategory =
  | 'neural_stem_sep'
  | 'ai_text_to_inst'
  | 'algo_chord_harm'
  | 'style_midi_mutator'
  | 'formant_pitch_core'
  | 'vocal_layer_harm'
  | 'granular_vocal_resynth'
  | 'sibilance_deesser'
  | 'tag_db_browser'
  | 'smart_preview_vocoder'
  | 'multi_col_streamer'
  | 'predictive_preroll'
  | 'vintage_tube_sat'
  | 'opto_leveling_amp'
  | 'fet_dynamic_limiter'
  | 'vari_mu_glue_comp'
  | 'convolution_ir_space'
  | 'spring_plate_reverb'
  | 'bbd_analog_delay';

export interface ArrangementClip {
  id: string;
  startBar: number;   // 0-indexed bar position (0..31)
  lengthBars: number; // Duration in bars (1..16)
  patternIndex: number; // Pattern 0..7
  name: string;
  color?: string;
  muted?: boolean;
  stretchRatio?: number; // 0.5x to 2.0x
}

export interface ProjectMarker {
  id: string;
  bar: number;
  name: string;
  color: string;
}

export interface SequencerTrack {
  id: string;
  deviceId: string;
  name: string;
  color: string;
  mute: boolean;
  solo: boolean;
  steps: (SequencerNote | null)[]; // 16 to 512 steps
  // Channel controls & groove
  volume?: number;       // 0 to 1 (default: 0.85)
  pan?: number;          // -1 to 1 (default: 0)
  mixerTrack?: number;   // 0 for Master, 1 to 500 for Inserts (default: 1)
  swingMix?: number;     // 0 to 1 (default: 0)
  group?: 'All' | 'Drums' | 'Synths' | 'Samplers' | 'World' | 'Automation' | 'FX';
  pitchOffset?: number;  // -24 to +24 semitones
  cutoff?: number;       // 0 to 1
  resonance?: number;    // 0 to 1
  generatorType?: string;
  frozen?: boolean;      // Multi-track Stem Freeze state
  activeTake?: number;   // Comping multi-take index (0, 1, 2)
  takes?: Record<number, (SequencerNote | null)[]>;
  patterns?: Record<number, (SequencerNote | null)[]>; // Pattern bank 0..7 per instrument
  arrangementClips?: ArrangementClip[];
  graphData?: {
    velocity: number[];
    pitch: number[];
    pan: number[];
    cutoff: number[];
    resonance: number[];
    cc1?: number[];  // Mod Wheel
    cc74?: number[]; // Filter Brightness
    cc91?: number[]; // Reverb Send
  };
}

export type WorkspaceViewMode = 'sequencer' | 'mixer' | 'rack' | 'parallel';

export interface MixerFxSlot {
  id: string;
  name: string;
  type: 'none' | 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'chorus' | 'flanger' | 'limiter' | 'widener' | 'gate';
  enabled: boolean;
  mix: number; // 0 to 1 wet/dry
  sidechainSourceTrack?: number; // 0 for Master, 1..500
  sidechainAmount?: number;
}

export interface MixerTrackState {
  index: number; // 0 for Master, 1..500 for Inserts
  name: string;
  color: string;
  volume: number; // 0.0 to 1.5 (default: 0.85)
  pan: number; // -1 to 1 (default: 0)
  mute: boolean;
  solo: boolean;
  phaseInvert: boolean; // Polarity inversion ø
  stereoSeparation: number; // -1 (100% Mono) to 0 (Normal) to +1 (100% Expanded Width)
  pdcEnabled: boolean; // Plugin Delay Compensation
  pdcMs: number;
  lowEq: number; // -12dB to +12dB
  midEq: number;
  highEq: number;
  fxSlots: MixerFxSlot[]; // 10 dedicated FX slots
  routedToMaster: boolean;
  sendToTracks: number[]; // sidechain / send routes
  peakL: number;
  peakR: number;
}
