/**
 * Plays audio clips from the step scheduler (live and offline export). Each 16th the scheduler
 * calls `step()` for every audio track; a clip that covers that 16th and is not sounding yet is
 * started there (with the right source offset), so playback can start anywhere inside a clip.
 * Voices whose clip no longer covers the playhead (moved, trimmed, deleted, loop wrap) are stopped.
 * Edges cut inside a recording get a short fade (no clicks); two clips that touch — e.g. the halves
 * of a split — overlap by that fade, so the cut crossfades instead of jumping.
 */
import type { ArrangementClip } from '../types.ts';
import { audioStore } from './audioStore.ts';
import { audioClipStart, fadeGainAt } from './clipMath.ts';
import type { ProjectTimeMap } from '../time/ProjectTimeMap.ts';

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
  sig: string;
}

/** Shortest fade on a cut edge, and the overlap of touching clips (seconds). */
const EDGE = 0.006;

interface Edges {
  /** Another audio clip ends where this one starts / starts where this one ends. */
  prev: boolean;
  next: boolean;
}

const signature = (c: ArrangementClip) =>
  [c.startBar, c.lengthBars, c.audioId, c.audioOffset, c.gainDb, c.fadeIn, c.fadeOut, c.fadeCurve, c.invertPhase, c.reverse, c.pitch, c.warp, c.sourceBpm, c.loopAudio, c.loopSec, c.muted].join('|');

export class ClipVoices {
  private voices = new Map<string, Voice>();

  constructor(private ctx: BaseAudioContext) {}

  /**
   * Schedules the clips of one track for the 16th at `tick` (audio time `time`).
   * `dest` is the track device's clip input.
   */
  step(clips: readonly ArrangementClip[], tick: number, time: number, bpm: number, spb: number, dest: AudioNode, trackKey: string, timeMap?: ProjectTimeMap): void {
    const covering = new Set<string>();
    // Clip edges on this track, built once per 16th: a clip that ends where another starts (a split,
    // or two takes butted together) crossfades with it.
    const barKey = (b: number) => Math.round(b * 1e6);
    const audible = clips.filter((o) => o.kind === 'audio' && !o.muted && !!o.audioId);
    const starts = new Set(audible.map((o) => barKey(o.startBar)));
    const ends = new Set(audible.map((o) => barKey(o.startBar + o.lengthBars)));
    for (const c of clips) {
      if (c.kind !== 'audio' || c.muted || !c.audioId) continue;
      const asset = audioStore.get(c.audioId);
      if (!asset) continue;
      const key = `${trackKey}:${c.id}`;
      const edges: Edges = { prev: ends.has(barKey(c.startBar)), next: starts.has(barKey(c.startBar + c.lengthBars)) };
      const sig = `${signature(c)}|${edges.prev}|${edges.next}`;
      const cur = this.voices.get(key);
      if (cur && cur.sig === sig && cur.end > time + 0.001) {
        covering.add(key);
        continue;
      }
      const st = audioClipStart(c, tick, bpm, spb, asset.buffer.duration, timeMap);
      if (!st) continue;
      if (cur) this.stopVoice(key, time);
      covering.add(key);
      this.start(key, sig, c, st, time, dest, asset.buffer.duration, edges);
    }
    // Anything of this track still sounding that no clip covers any more stops now.
    for (const [key, v] of this.voices) {
      if (key.startsWith(`${trackKey}:`) && !covering.has(key) && v.end > time + 0.001) this.stopVoice(key, time);
    }
  }

  private start(key: string, sig: string, c: ArrangementClip, st: ReturnType<typeof audioClipStart> & object, time: number, dest: AudioNode, srcDur: number, edges: Edges): void {
    const buffer = c.reverse ? audioStore.reversedBuffer(c.audioId!) : audioStore.get(c.audioId)!.buffer;
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = st.rate;
    let offset = st.sourceOffset;
    const base = c.audioOffset ?? 0;
    const loop = Math.max(0.01, Math.min(c.loopSec ?? srcDur - base, srcDur - base));
    if (c.loopAudio) {
      src.loop = true;
      src.loopStart = c.reverse ? srcDur - base - loop : base;
      src.loopEnd = c.reverse ? srcDur - base : base + loop;
    }
    if (c.reverse) {
      // Forward position p sits at (dur - p) in the reversed copy; the region plays end → start.
      if (c.loopAudio) offset = srcDur - base - loop + (st.sourceOffset - base);
      else {
        const span = Math.min(srcDur - base, (st.elapsed + st.remaining) * st.rate);
        offset = srcDur - (base + span) + st.elapsed * st.rate;
      }
    }
    const gain = this.ctx.createGain();
    const len = st.elapsed + st.remaining;
    // the user's fades, at least EDGE on edges cut inside the recording; a clip followed by a
    // touching clip keeps full level to its end and fades out over EDGE past it (the crossfade)
    const crossOut = edges.next && (c.fadeOut ?? 0) < EDGE;
    let fi = Math.max(c.fadeIn ?? 0, base > 0 || c.reverse || edges.prev ? EDGE : 0);
    let fo = crossOut ? 0 : Math.max(c.fadeOut ?? 0, EDGE);
    if (fi + fo > len && len > 0) {
      const scale = len / (fi + fo);
      fi *= scale;
      fo *= scale;
    }
    const e: ArrangementClip = { ...c, fadeIn: fi, fadeOut: fo };
    const g = (c.invertPhase ? -1 : 1) * Math.pow(10, (c.gainDb ?? 0) / 20);
    const startGain = fadeGainAt(e, st.elapsed, len);
    if (st.elapsed > 0 && fi <= st.elapsed) {
      // starting inside the clip (seek, loop): ramp in instead of jumping to the level
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(startGain, time + Math.min(EDGE, st.remaining));
    } else gain.gain.setValueAtTime(startGain, time);

    const shape = c.fadeCurve ?? 'linear';
    const scheduleFade = (startVal: number, endVal: number, t0: number, dur: number, isIn: boolean) => {
      if (dur <= 0.001) return;
      try {
        if (shape === 'linear' || shape === 'equal_gain') {
          gain.gain.setValueAtTime(startVal, t0);
          gain.gain.linearRampToValueAtTime(endVal, t0 + dur);
          return;
        }
        const steps = 16;
        const curve = new Float32Array(steps + 1);
        for (let i = 0; i <= steps; i++) {
          const x = i / steps;
          let factor = x;
          if (shape === 'equal_power') {
            factor = Math.sin(Math.PI * 0.5 * x);
          } else if (shape === 's_curve') {
            factor = x * x * (3 - 2 * x);
          }
          curve[i] = isIn ? startVal + (endVal - startVal) * factor : endVal + (startVal - endVal) * (1 - factor);
        }
        gain.gain.setValueCurveAtTime(curve, t0, dur);
      } catch {
        // Fallback if AudioParam has conflicting scheduled events
        gain.gain.setValueAtTime(endVal, t0 + dur);
      }
    };

    // fade in / fade out as shaped ramps on the clip timeline
    if (fi > st.elapsed) scheduleFade(startGain, g, time, fi - st.elapsed, true);
    if (fo > 0) {
      const foStart = Math.max(st.elapsed, len - fo);
      const foTime = time + (foStart - st.elapsed);
      const foDur = st.remaining - (foStart - st.elapsed);
      const curFoGain = fadeGainAt(e, foStart, len);
      scheduleFade(curFoGain, 0, foTime, foDur, false);
    }
    src.connect(gain).connect(dest);
    const end = time + st.remaining;
    let stopAt = end + 0.005;
    if (crossOut) {
      gain.gain.setValueAtTime(g, end);
      gain.gain.linearRampToValueAtTime(0, end + EDGE);
      stopAt = end + EDGE + 0.002;
    }
    src.start(time, Math.max(0, offset));
    src.stop(stopAt);
    const v: Voice = { src, gain, end, sig };
    src.onended = () => {
      if (this.voices.get(key) === v) this.voices.delete(key);
      try { src.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    this.voices.set(key, v);
  }

  private stopVoice(key: string, at: number): void {
    const v = this.voices.get(key);
    if (!v) return;
    this.voices.delete(key);
    const t = Math.max(at, this.ctx.currentTime);
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.004);
      v.src.stop(t + 0.03);
      setTimeout(() => {
        try { v.src.disconnect(); } catch {}
        try { v.gain.disconnect(); } catch {}
      }, 40);
    } catch {
      // already stopped
    }
  }

  /** Stops everything (transport stop, seek, loop wrap at `at`). */
  stopAll(at = this.ctx.currentTime): void {
    [...this.voices.keys()].forEach((k) => this.stopVoice(k, at));
  }

  get active(): number {
    return this.voices.size;
  }
}
