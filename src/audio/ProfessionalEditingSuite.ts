/**
 * Professional Surgical Audio Editing, Elastic Time-Stretching, High-Resolution MIDI & Dynamic Automation Engine
 */

export interface AudioClipRegion {
  id: string;
  trackId: string;
  name: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  offset: number; // sample-accurate slip offset
  gainDb: number; // -infinity to +36 dB
  fadeInMs: number;
  fadeOutMs: number;
  fadeCurve: 'linear' | 'exponential' | 'logarithmic';
  timeStretchRatio: number; // 0.1 to 4.0
  pitchShiftSemitones: number; // -24 to +24
  formantShift: number; // -12 to +12
}

export interface MidiNoteSurgical {
  id: string;
  pitch: number; // MIDI note 0-127
  startTimeTicks: number;
  durationTicks: number;
  velocity: number; // 0-127
  releaseVelocity: number; // 0-127
  pitchBend14Bit?: number; // 0 to 16384
}

export interface AutomationNodePoint {
  id: string;
  timeSec: number;
  value: number; // 0.0 to 1.0
  curveType: 'linear' | 'bezier' | 'square' | 'freehand';
}

export class ProfessionalEditingSuite {
  public clips: Map<string, AudioClipRegion> = new Map();
  public automationLanes: Map<string, AutomationNodePoint[]> = new Map();
  public automationMode: 'write' | 'touch' | 'latch' | 'read' = 'read';

  public createClip(trackId: string, name: string, startTime: number, duration: number): AudioClipRegion {
    const clip: AudioClipRegion = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      trackId,
      name,
      startTime,
      duration,
      offset: 0,
      gainDb: 0.0,
      fadeInMs: 10,
      fadeOutMs: 10,
      fadeCurve: 'logarithmic',
      timeStretchRatio: 1.0,
      pitchShiftSemitones: 0,
      formantShift: 0,
    };
    this.clips.set(clip.id, clip);
    return clip;
  }

  public setClipGain(clipId: string, gainDb: number): void {
    const clip = this.clips.get(clipId);
    if (clip) {
      clip.gainDb = Math.max(-60, Math.min(36, gainDb));
    }
  }

  public setClipWarp(clipId: string, ratio: number, pitchSemis: number): void {
    const clip = this.clips.get(clipId);
    if (clip) {
      clip.timeStretchRatio = Math.max(0.1, Math.min(4.0, ratio));
      clip.pitchShiftSemitones = Math.max(-24, Math.min(24, pitchSemis));
    }
  }

  public addAutomationPoint(laneId: string, timeSec: number, value: number, curveType: 'linear' | 'bezier' | 'square' | 'freehand' = 'linear'): void {
    let points = this.automationLanes.get(laneId) || [];
    points.push({
      id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timeSec,
      value: Math.max(0, Math.min(1, value)),
      curveType,
    });
    points.sort((a, b) => a.timeSec - b.timeSec);
    this.automationLanes.set(laneId, points);
  }
}
