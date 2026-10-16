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
  | 'percussion_electronic';

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
  length: number;    // In 16th steps (1, 2, 4...)
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
  graphData?: {
    velocity: number[];
    pitch: number[];
    pan: number[];
    cutoff: number[];
    resonance: number[];
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
