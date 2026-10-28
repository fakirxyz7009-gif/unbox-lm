/**
 * sampleManifestTypes.ts
 *
 * Types for the real multi-sampled audio manifest:
 * Mapping: Device ID -> Sub-Voice Name -> Velocity Layers -> Root Note / Pitch Zones -> File Path.
 * Supports pitch-shifting interpolation when chromatic samples have gaps (e.g., minor thirds).
 */

export interface SamplePitchZone {
  /** Relative path to audio file (WAV / FLAC / OGG) from the sample storage root */
  file: string;
  /** MIDI root note (e.g. 60 for C4) */
  root: number;
  /** Lower bound MIDI note key range (inclusive) */
  keyLow: number;
  /** Upper bound MIDI note key range (inclusive) */
  keyHigh: number;
  /** Velocity range lower bound (1..127) */
  velLow: number;
  /** Velocity range upper bound (1..127) */
  velHigh: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Fine tuning adjustment in cents (-50..+50) */
  tune?: number;
  /** Linear gain adjustment */
  gain?: number;
  /** Stereo pan (-1..1) */
  pan?: number;
  /** Loop start and end in seconds [loopStart, loopEnd] */
  loop?: [number, number];
  /** Round robin index (1-based) */
  seq?: number;
  /** Total round robins in sequence */
  seqLength?: number;
  /** Round robin index shorthand */
  roundRobin?: number;
  /** Trigger mode */
  trigger?: 'attack' | 'release';
}

export interface SampleVelocityLayer {
  /** 0-based index or dynamic label (e.g. 0: p, 1: mf, 2: f, 3: ff) */
  layerIndex: number;
  /** Name of layer, e.g. "Soft", "Medium", "Loud" */
  name?: string;
  minVel: number;
  maxVel: number;
  /** Flag for progressive loading: load middle velocity layer first for instant playback */
  isMiddleLayer?: boolean;
  /** Zones included in this layer */
  zones: SamplePitchZone[];
}

export interface SubVoiceDefinition {
  id: string;
  name: string;
  category?: 'Mic Position' | 'Articulation' | 'Voice' | 'Tone';
  micPosition?: string;
  description?: string;
  default?: boolean;
  /** Velocity layers arranged from softest to loudest */
  velocityLayers: SampleVelocityLayer[];
  /** Flattened lookup list of zones for direct matching */
  zones?: SamplePitchZone[];
}

export interface DeviceSampleManifest {
  deviceId: string;
  deviceName: string;
  defaultSubVoice: string;
  subVoices: Record<string, SubVoiceDefinition>;
}

export interface MultiSampleManifest {
  version: 1;
  generatedAt: string;
  /** Base URL path to sample files, e.g. "/samples/" */
  sampleBaseUrl?: string;
  devices: Record<string, DeviceSampleManifest>;
}
