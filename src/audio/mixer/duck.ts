/**
 * Sidechain ducking ("Kick duck"): a channel with a duck setting dips on the hits of its source —
 * one chosen part (e.g. the kick track) or, without a source, the downbeats of the drum parts.
 * Shared by live playback and the export render, so exports pump like the live mix.
 */
import type { SequencerTrack } from '../types.ts';
import type { StripNodes } from './channelStrip.ts';

export interface DuckHit {
  deviceId: string;
  time: number;
  /** Counts for channels without a chosen source: a drum part on a beat or on note 48 / 60. */
  drumBeat: boolean;
}

export const isDrumBeat = (track: SequencerTrack, stepIdx: number, note: number): boolean =>
  track.group === 'Drums' && (stepIdx % 4 === 0 || note === 60 || note === 48);

/** True when some channel ducks (skip collecting hits otherwise). */
export const anyDucking = (tracks: readonly SequencerTrack[]): boolean => tracks.some((t) => (t.duck?.amount ?? 0) > 0);

/** Schedules one dip per ducked channel for this 16th's hits (`stepTime` = the 16th's start). */
export function applyDucks(tracks: readonly SequencerTrack[], hits: readonly DuckHit[], stripOf: (deviceId: string) => StripNodes | undefined, stepTime: number): void {
  if (!hits.length) return;
  for (const t of tracks) {
    const d = t.duck;
    if (!d || d.amount <= 0) continue;
    let at = Infinity;
    if (d.source) {
      for (const h of hits) if (h.deviceId === d.source && h.deviceId !== t.deviceId) at = Math.min(at, h.time);
    } else if (t.group !== 'Drums' && hits.some((h) => h.drumBeat)) at = stepTime;
    if (!Number.isFinite(at)) continue;
    const strip = stripOf(t.deviceId);
    if (!strip) continue;
    const ratio = Math.max(0.05, 1 - d.amount);
    const release = Math.max(0.03, d.releaseMs / 1000);
    for (const g of [strip.duckL.gain, strip.duckR.gain]) {
      g.cancelScheduledValues(at);
      g.setValueAtTime(1, at);
      g.linearRampToValueAtTime(ratio, at + 0.008);
      g.exponentialRampToValueAtTime(1, at + release);
    }
  }
}
