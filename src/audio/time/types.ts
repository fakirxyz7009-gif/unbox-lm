/**
 * Canonical timing and transport data types for Unbox Studios.
 * 
 * ONE PROJECT • ONE CLOCK • ONE TRANSPORT • ONE TIME MAP
 */

export const TICKS_PER_16TH = 12;
export const TICKS_PER_BEAT_4_4 = 48; // 4 * 12

export interface MusicalPosition {
  /** 1-based bar number (1, 2, 3...) */
  bar: number;
  /** 1-based beat within bar (1..numerator) */
  beat: number;
  /** 1-based 16th division within beat (1..4 in x/4 meters) */
  sixteenth: number;
  /** 0-based fractional tick within 16th (0..TICKS_PER_16TH - 1) */
  tick: number;
  /** Continuous 0-based total ticks from project start */
  totalTicks: number;
  /** Continuous 0-based total sixteenths from project start */
  totalSixteenths: number;
}

export type Timebase = 'musical' | 'time' | 'musical_position_only';

export interface TempoEvent {
  id: string;
  /** Start position in total ticks */
  tick: number;
  /** Beats per minute (20.0 to 999.0) */
  bpm: number;
  /** Curve to next tempo event: instant step or linear ramp */
  curve: 'instant' | 'linear';
}

export interface MeterEvent {
  id: string;
  /** 1-based bar where this meter takes effect */
  bar: number;
  /** Numerator: beats per bar (e.g. 4, 3, 5, 7, 12) */
  numerator: number;
  /** Denominator: beat note value (e.g. 4, 8, 2, 16) */
  denominator: number;
  /** Calculated starting tick of this bar */
  startTick: number;
}

export interface TimeRange {
  startTick: number;
  endTick: number;
  active: boolean;
}

export interface LoopRange extends TimeRange {
  enabled: boolean;
  followSong: boolean;
}

export interface PunchRange extends TimeRange {
  enabled: boolean;
  preRollBars: number;
  postRollBars: number;
}

export interface MarkerItem {
  id: string;
  name: string;
  color: string;
  bar: number;
  tick: number;
  timebase: Timebase;
  comment?: string;
}

export interface RegionItem {
  id: string;
  name: string;
  color: string;
  startBar: number;
  lengthBars: number;
  startTick: number;
  lengthTicks: number;
  timebase: Timebase;
  tags?: string[];
}

export type TransportStatus = 'stopped' | 'playing' | 'recording' | 'paused';

export type SnapGridDivision =
  | 'bar'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'
  | '1/64'
  | 'triplet_8'
  | 'triplet_16'
  | 'adaptive'
  | 'off';

