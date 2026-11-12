import type { AutoLane } from './automation/model.ts';

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
  | 'third_wave'
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
  | 'pitch_correct'
  | 'quartet'
  | 'sweeper'
  | 'audiomatic'
  | 'rotor'
  | 'softube_amp'
  | 'combinator'
  | 'rpg8'
  | 'midi_out'
  | 'line_mixer'
  // Spec-driven Reason devices (shared/rack/devices/reason.ts; rebuilt ones above keep their ids)
  | 'rytmik' | 'synchronous' | 'softube_bass_amp' | 'channel_dynamics' | 'channel_eq'
  | 'mclass_eq' | 'mclass_compressor' | 'mclass_imager' | 'mclass_maximizer'
  | 'ecf42' | 'cf101' | 'ddl1' | 'ph90' | 'rv7' | 'd11' | 'comp01' | 'peq2' | 'un16'
  | 'scales_chords' | 'dual_arp' | 'beat_map' | 'note_echo' | 'quad_note_gen' | 'chord_sequencer'
  | 'mixer_14_2' | 'gain_tool' | 'stereo_tool'
  // Hardware emulations (shared/rack/devices/hardware.ts)
  | 'moog_sub37' | 'prophet6' | 'minilogue_xd' | 'matrixbrute' | 'nord_lead4' | 'juno_x'
  | 'novation_peak' | 'waldorf_iridium' | 'moog_grandmother' | 'make_noise_shared'
  | 'mpc_one' | 'mpc_live2' | 'mpc_xse' | 'akai_force' | 'maschine_plus' | 'octatrack'
  | 'syntakt' | 'mc707' | 'circuit_tracks' | 'polyend_play'
  | 'tr08' | 'tr8s' | 'digitakt2' | 'volca_beats' | 'rd8' | 'perkons' | 'drumbrute_impact'
  | 'tempest' | 'pulsar23' | 'drm1'
  | 'ssl_gbus' | 'distressor' | 'la2a' | 'ua1176' | 'pultec_eqp1a' | 'portico2_mbp' | 'api2500'
  | 'avalon747' | 'manley_varimu' | 'wa2a'
  | 'neve5059' | 'dangerous_2bus' | 'ssl_sigma' | 'heritage_mcm24' | 'spl_mixdream'
  | 'nicerizer16' | 'burl_b32' | 'api8200' | 'folcrom' | 'antelope_satori'
  | 'radial_j48' | 'radial_jdi' | 'countryman85' | 'rndi'
  | 'spatch_plus' | 'neutrik_patchbay' | 'blacklion_pbr' | 'flock_patch_lt' | 'switchcraft9625' | 'art_p16'
  // Recorded instrument packs (shared/rack/devices/sampled.ts), one type per pack
  | `rec_${string}`
  // Plugin library units — src/vst/VstPluginDevice.ts. Two types because "playable" is per type.
  | 'vst_instrument'
  | 'vst_effect'
  // Mixer bus / return channel (src/audio/mixer/MixBusDevice.ts) and audio track player
  | 'mix_bus'
  | 'audio_track';

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
  /** Master cables only: the mixer channel (owner device id) the cable feeds. */
  stripId?: string;
}

/** A send from a mixer channel to a bus / return (post-fader unless `pre`). */
export interface ChannelSend {
  busId: string;
  /** Linear gain 0..1 (1 = 0 dB). */
  level: number;
  pre?: boolean;
  muted?: boolean;
}

/** Kick-triggered ducking (sidechain) of a channel (audio/mixer/duck.ts). */
export interface ChannelDuck {
  /** 0..1: how far the channel dips on each trigger hit. */
  amount: number;
  releaseMs: number;
  /** Device id of the part whose hits trigger the dip; missing = the drum parts' beats. */
  source?: string;
}

/** Mixer settings shared by tracks, buses and rack channels. Optional fields default to unity / centre / master. */
export interface ChannelSettings {
  name: string;
  color: string;
  mute: boolean;
  solo: boolean;
  /** Fader, linear gain 0..1.5 (default 0.85). */
  volume?: number;
  /** -1..1 (default 0). */
  pan?: number;
  /** Input trim in dB, -24..+24. */
  trimDb?: number;
  phaseInvert?: boolean;
  /** Stereo width 0 (mono) .. 2 (extra wide), default 1. */
  width?: number;
  /** 'master' (default) or a bus channel id. */
  output?: string;
  sends?: ChannelSend[];
  vcaId?: string;
  mixGroupId?: string;
  /** Keeps playing when other channels are soloed. */
  soloSafe?: boolean;
  duck?: ChannelDuck;
  /** Channel EQ (after trim / polarity); missing = off with flat defaults. */
  eq?: ChannelEq;
  /** Channel dynamics (after the EQ); missing = off. */
  dyn?: ChannelDyn;
}

/** Console channel EQ: high-pass, low shelf, two bell bands, high shelf, low-pass. */
export interface ChannelEq {
  on: boolean;
  hpOn: boolean;
  hpHz: number;
  lpOn: boolean;
  lpHz: number;
  lowDb: number;
  lowHz: number;
  lmDb: number;
  lmHz: number;
  lmQ: number;
  hmDb: number;
  hmHz: number;
  hmQ: number;
  highDb: number;
  highHz: number;
}

/** Console channel dynamics: compressor and gate ('unbox-dynamics' worklet). */
export interface ChannelDyn {
  compOn: boolean;
  /** dBFS */
  threshold: number;
  ratio: number;
  /** seconds */
  attack: number;
  release: number;
  /** dB */
  makeup: number;
  gateOn: boolean;
  gateThreshold: number;
  /** Attenuation when closed, dB (negative). */
  gateRange: number;
  gateRelease: number;
}

/** VCA fader: scales the faders of its member channels. */
export interface VcaFader {
  id: string;
  name: string;
  color: string;
  /** Linear gain 0..1.5, default 1. */
  level: number;
  mute: boolean;
}

/** Mixer group: linked faders / mutes / solos. */
export interface MixGroup {
  id: string;
  name: string;
  color: string;
  linkVolume: boolean;
  linkMute: boolean;
  linkSolo: boolean;
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
  matrixEntryId?: string;
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

/** One Combinator macro knob driving several device params (value 0..1 lerps min → max). */
export interface RackMacroTarget {
  deviceId: string;
  param: string;
  min: number;
  max: number;
}

export interface RackMacro {
  id: string;
  label: string;
  value: number;
  targets: RackMacroTarget[];
}

/** A Combiner exposes at most eight front-panel macro controls. */
export const MAX_RACK_MACROS = 8;

/** Combinator-style group of rack units (created by the AI Combinator or the user). */
export interface RackGroup {
  id: string;
  name: string;
  deviceIds: string[];
  macros: RackMacro[];
  source: 'gemini' | 'local' | 'user';
  prompt?: string;
  description?: string;
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
  chordLengths?: number[]; // Per chord-note length in steps (piano roll); defaults to `length`
  chordVelocities?: number[]; // Per chord-note velocity (piano roll); defaults to `velocity`
  strum?: number; // Chord strum in ms (0–40): the chord's notes start this far apart, lowest first
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

/** Length of one pattern step. 'T' = triplet. See src/audio/sequencer/model.ts (DIVISION_TICKS). */
export type StepDivision = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32';

/** One pattern of a track. A track can have any number of patterns. */
export interface SequencerPattern {
  id: string;
  name: string;
  color: string;
  /** Number of steps that play (1..1024). `steps.length === length`. */
  length: number;
  division: StepDivision;
  steps: (SequencerNote | null)[];
}

/** A note inside a note clip. `step` is in 16ths from the clip start (fractions allowed, e.g. triplets). */
export interface ClipNote extends SequencerNote {
  step: number;
  /** Slip inside the clip (ticks, set by Slip); playback shifts the note without moving the clip. */
  offsetTicks?: number;
}

export type ArrangementClipKind = 'pattern' | 'notes' | 'audio';

export interface ArrangementClip {
  id: string;
  /**
   * Note lane of an instrument track (0 = the first). Every lane plays at the same time, so one
   * instrument can play several patterns / note clips at once (Song mode).
   */
  lane?: number;
  /** Bar position, 0-based, unlimited. Fractions are allowed down to one 16th (1 / steps-per-bar). */
  startBar: number;
  /** Duration in bars (> 0, same resolution as startBar). */
  lengthBars: number;
  /** 'pattern' (default): loops a pattern of the track. 'notes': plays its own `notes`. */
  kind?: ArrangementClipKind;
  /** Pattern played by a pattern clip (see SequencerTrack.patternList). */
  patternId?: string;
  /** Legacy pattern bank index (0..7) from v1 projects; migrated to patternId on load. */
  patternIndex?: number;
  /** Where playback starts inside the source, in 16ths (set when a clip is split or trimmed from the left). */
  offsetSteps?: number;
  /** Note clips only. */
  notes?: ClipNote[];
  /** Note clips only: the content repeats every `loopBars` bars across the clip length. */
  loopBars?: number;
  name: string;
  color?: string;
  muted?: boolean;
  stretchRatio?: number; // 0.5x to 2.0x
  // ---- audio clips (kind 'audio', audio tracks) ----
  /** Recorded / imported audio in the audio store (see src/audio/clips/audioStore.ts). */
  audioId?: string;
  /** Source position (seconds) heard at the clip start. */
  audioOffset?: number;
  /** Clip gain in dB. */
  gainDb?: number;
  /** Fade lengths in seconds. */
  fadeIn?: number;
  fadeOut?: number;
  reverse?: boolean;
  /** Transpose in semitones (varispeed: also changes speed). */
  pitch?: number;
  /** Invert audio polarity (180° phase flip). */
  invertPhase?: boolean;
  /** Fade curve shape. */
  fadeCurve?: 'linear' | 'equal_power' | 'equal_gain' | 's_curve';
  /** 'off': original speed. 'repitch': speed follows the project tempo from sourceBpm (pitch follows). */
  warp?: 'off' | 'repitch';
  sourceBpm?: number;
  /** Repeat the source region [audioOffset, audioOffset + loopSec) across the clip. */
  loopAudio?: boolean;
  loopSec?: number;
  /** Recorded takes (loop / multi-take recording). The clip plays audioId, the active take. */
  takes?: { id: string; audioId: string; name: string }[];
}

export interface ProjectMarker {
  id: string;
  bar: number;
  name: string;
  color: string;
}

/** Reusable song section; instrument parts come from a copied scene, with optional captured arrangement content. */
export interface SongBlock {
  id: string;
  name: string;
  patternIndex: number;
  color: string;
  lengthBars?: number;
  /** Audio clips intersecting the captured source range, trimmed to it with start bars relative to the Block. */
  audioClipsByTrack?: Record<string, ArrangementClip[]>;
  /** Automation lanes captured from the source range; point positions are relative 16ths. */
  automationLanes?: AutoLane[];
  /** Source lanes intentionally removed from this Block. */
  automationDisabledLaneIds?: string[];
}

/** One occurrence of a reusable block in the song timeline. */
export interface SongBlockPlacement {
  id: string;
  blockId: string;
  startBar: number;
  lengthBars: number;
}

export interface FolderClip {
  id: string;
  startBar: number;
  lengthBars: number;
  name: string;
}

/** Arrangement group row; member tracks keep their own clips and mixer routing. */
export interface TrackFolder {
  id: string;
  name: string;
  collapsed?: boolean;
  /** Group regions move contained clips on all member tracks together. */
  clips?: FolderClip[];
}

export type TrackKind = 'instrument' | 'audio';

export interface SequencerTrack extends ChannelSettings {
  id: string;
  deviceId: string;
  /** 'instrument' (default): notes play a rack device. 'audio': plays audio clips. */
  kind?: TrackKind;
  /** Optional arrangement folder membership. */
  folderId?: string;
  /** Recording: armed for the next recording pass. */
  armed?: boolean;
  /** MIDI take receipts used to clear crash journals only after this track has saved. */
  midiTakeIds?: string[];
  /** Input monitoring: 'auto' = while armed, 'on' = always, 'off'. */
  monitor?: 'auto' | 'on' | 'off';
  /** Audio input channel(s) recorded on this track. */
  inputChannel?: 'stereo' | 'left' | 'right';
  hidden?: boolean;
  locked?: boolean;
  /** Disabled tracks are silent and skipped by playback and export. */
  disabled?: boolean;
  /** Frozen: this audio track is the rendered copy of the instrument track `frozenFrom`. */
  frozenFrom?: string;
  /** Frozen: the instrument track is disabled while the audio track `frozenBy` plays its render. */
  frozenBy?: string;
  /** Timing offset in ms (+ plays later, − earlier). Compensates hardware / monitoring latency. */
  offsetMs?: number;
  /** Arrangement lane height in px. */
  height?: number;
  icon?: string;
  /** Track notes (free text). */
  memo?: string;
  /**
   * Steps of the ACTIVE pattern. This is the same array as `patternList[active].steps`
   * (the engine re-links them; code may edit `track.steps` directly as before).
   */
  steps: (SequencerNote | null)[];
  /** All patterns of this track (unlimited). */
  patternList?: SequencerPattern[];
  /** Pattern being edited (and played in Pattern mode / by tracks without clips). */
  activePatternId?: string;
  // Groove
  mixerTrack?: number;   // 0 for Master, 1 to 500 for Inserts (default: 1)
  swingMix?: number;     // 0 to 1 (default: 0)
  group?: 'All' | 'Drums' | 'Synths' | 'Samplers' | 'World' | 'Automation' | 'FX' | 'Audio';
  pitchOffset?: number;  // -24 to +24 semitones
  cutoff?: number;       // 0 to 1
  resonance?: number;    // 0 to 1
  generatorType?: string;
  frozen?: boolean;      // Multi-track Stem Freeze state
  activeTake?: number;   // Comping multi-take index (0, 1, 2)
  takes?: Record<number, (SequencerNote | null)[]>;
  /** @deprecated v1 pattern bank (0..7). Migrated into `patternList` on load, then removed. */
  patterns?: Record<number, (SequencerNote | null)[]>;
  arrangementClips?: ArrangementClip[];
  /** Note lanes shown for this instrument track (1 when missing); clips on any lane play together. */
  noteLanes?: number;
  /** Per-step lanes (Graph & CC) by step index; null / missing = no value (the device's knobs rule). */
  graphData?: {
    /** Velocity multiplier (legacy; the editor now draws note velocities directly). */
    velocity?: (number | null)[];
    /** Semitone offset. */
    pitch?: (number | null)[];
    /** 0..1 → filter cutoff. */
    cutoff?: (number | null)[];
    resonance?: (number | null)[];
  };
}


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
