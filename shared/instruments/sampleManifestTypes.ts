/**
 * sampleManifestTypes.ts
 *
 * Types for the multi-sampled audio manifest.
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

/**
 * How the audio in a cache was made. `unknown` is intentionally not playable
 * through RealMultiSampler: a file path or an instrument-shaped filename is
 * not evidence that a person recorded it.
 */
export type SampleSourceKind = 'recorded' | 'synthesized' | 'unknown';

/**
 * Source information for an entire multi-sample cache. Recorded caches need
 * a concrete source and licence before the recorded-sample playback path will
 * admit them. Synthetic caches remain useful for DSP development, but must
 * never be presented as a musician performance.
 */
export interface SampleManifestProvenance {
  sourceKind: SampleSourceKind;
  source?: string;
  license?: string;
  performer?: string;
  attribution?: string;
  generator?: string;
}

export interface MultiSampleManifest {
  version: 1;
  generatedAt: string;
  /** Base URL path to sample files, e.g. "/samples/" */
  sampleBaseUrl?: string;
  /** Omitted by legacy manifests. Omission is treated as unknown, not recorded. */
  provenance?: SampleManifestProvenance;
  devices: Record<string, DeviceSampleManifest>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns a human-readable reason when a manifest cannot safely supply an
 * instrument advertised as a real recording. This is deliberately structural
 * and dependency-free because it is used by both the server and browser.
 */
export function recordedManifestAdmissionError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'manifest is not an object';
  const manifest = value as Partial<MultiSampleManifest>;
  if (manifest.version !== 1) return 'manifest version is unsupported';
  if (!manifest.provenance || manifest.provenance.sourceKind !== 'recorded') {
    return 'manifest is not declared as a recorded source';
  }
  if (!nonEmptyString(manifest.provenance.source)) return 'recorded manifest has no source';
  if (!nonEmptyString(manifest.provenance.license)) return 'recorded manifest has no license';
  if (!nonEmptyString(manifest.provenance.performer)) return 'recorded manifest has no performer or rights holder';
  if (/\bcc\s*-?by\b/i.test(manifest.provenance.license) && !nonEmptyString(manifest.provenance.attribution)) {
    return 'CC-BY recorded manifest has no attribution text';
  }
  if (!manifest.devices || typeof manifest.devices !== 'object') return 'recorded manifest has no device map';
  return null;
}

export function isAdmittedRecordedManifest(value: unknown): value is MultiSampleManifest {
  return recordedManifestAdmissionError(value) === null;
}
