/**
 * Timing of audio clips (pure). Clips sit on the bar grid; the audio inside plays at a speed set
 * by warp / pitch. Swing never applies to audio.
 */
import type { ArrangementClip } from '../types.ts';
import { TICKS_PER_16TH, barToTick } from '../sequencer/model.ts';
import type { ProjectTimeMap } from '../time/ProjectTimeMap.ts';

export const secPerBar = (bpm: number, spb: number): number => (spb * 60) / bpm / 4;
export const secPerTick = (bpm: number): number => 60 / bpm / 4 / TICKS_PER_16TH;

/** Source seconds played per timeline second. */
export function audioClipRate(c: ArrangementClip, bpm: number): number {
  const warp = c.warp === 'repitch' && c.sourceBpm ? bpm / c.sourceBpm : 1;
  return warp * Math.pow(2, (c.pitch ?? 0) / 12);
}

/** Length (seconds) of the clip on the timeline. */
export const clipSeconds = (c: ArrangementClip, bpm: number, spb: number): number => c.lengthBars * secPerBar(bpm, spb);

export interface AudioClipStart {
  /** Timeline seconds already past at the start point. */
  elapsed: number;
  /** Timeline seconds left until the clip ends. */
  remaining: number;
  /** Seconds into the (forward) source where playback begins. */
  sourceOffset: number;
  rate: number;
}

/** Where to start a clip when playback reaches `tick` (inside the clip). */
export function audioClipStart(
  c: ArrangementClip,
  tick: number,
  bpm: number,
  spb: number,
  sourceDuration: number,
  timeMap?: ProjectTimeMap
): AudioClipStart | null {
  const start = barToTick(c.startBar, spb);
  const end = barToTick(c.startBar + c.lengthBars, spb);
  if (tick < start || tick >= end) return null;
  let elapsed: number;
  let remaining: number;
  if (timeMap) {
    const startSec = timeMap.tickToSeconds(start);
    const curSec = timeMap.tickToSeconds(tick);
    const endSec = timeMap.tickToSeconds(end);
    elapsed = Math.max(0, curSec - startSec);
    remaining = Math.max(0, endSec - curSec);
  } else {
    const spt = secPerTick(bpm);
    elapsed = (tick - start) * spt;
    remaining = (end - tick) * spt;
  }
  const rate = audioClipRate(c, bpm);
  const base = c.audioOffset ?? 0;
  let sourceOffset = base + elapsed * rate;
  if (c.loopAudio) {
    const loop = Math.max(0.01, Math.min(c.loopSec ?? sourceDuration - base, sourceDuration - base));
    sourceOffset = base + ((elapsed * rate) % loop);
  }
  if (!c.loopAudio && sourceOffset >= sourceDuration) return null;
  return { elapsed, remaining, sourceOffset, rate };
}

/** Clip gain envelope value at `t` seconds into a clip of length `len` with polarity and curve shape support. */
export function fadeGainAt(c: ArrangementClip, t: number, len: number): number {
  const g = (c.invertPhase ? -1 : 1) * Math.pow(10, (c.gainDb ?? 0) / 20);
  let fi = Math.max(0, c.fadeIn ?? 0);
  let fo = Math.max(0, c.fadeOut ?? 0);
  if (fi + fo > len && len > 0) {
    const scale = len / (fi + fo);
    fi *= scale;
    fo *= scale;
  }
  let kIn = 1;
  let kOut = 1;

  const shape = c.fadeCurve ?? 'linear';
  const applyCurve = (x: number): number => {
    const clamped = Math.max(0, Math.min(1, x));
    if (shape === 'equal_power') {
      // sin(pi/2 * x) maintains constant power across uncorrelated transitions (-3dB center dip)
      return Math.sin(Math.PI * 0.5 * clamped);
    }
    if (shape === 's_curve') {
      // 3x^2 - 2x^3 smooth cubic Hermite transition
      return clamped * clamped * (3 - 2 * clamped);
    }
    return clamped;
  };

  if (fi > 0 && t < fi) {
    kIn = applyCurve(t / fi);
  }
  if (fo > 0 && t > len - fo) {
    kOut = applyCurve((len - t) / fo);
  }
  return g * Math.min(kIn, kOut);
}

/** Bars an audio buffer covers at its natural speed under `bpm` (rounded up to a 16th). */
export function barsForSeconds(seconds: number, bpm: number, spb: number): number {
  return Math.max(1 / spb, Math.ceil((seconds / secPerBar(bpm, spb)) * spb) / spb);
}
