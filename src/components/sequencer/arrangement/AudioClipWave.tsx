/** Waveform of an audio clip as it plays (offset, speed, loop, reverse, gain and fades). */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ArrangementClip } from '../../../audio/types.ts';
import { PEAK_BIN, audioStore } from '../../../audio/clips/audioStore.ts';
import { audioClipRate, fadeGainAt, secPerBar } from '../../../audio/clips/clipMath.ts';

/** Wide enough for a few bars at the deepest timeline zoom (Chrome allows 32767). */
const MAX_CANVAS = 16384;

export function useAudioStoreVersion(): number {
  return useSyncExternalStore(
    (cb) => audioStore.subscribe(cb),
    () => audioStore.all().length + audioStore.missing.size * 1000,
    () => 0
  );
}

export function AudioClipWave({ clip, width, height, color, bpm, spb }: { clip: ArrangementClip; width: number; height: number; color: string; bpm: number; spb: number }) {
  useAudioStoreVersion();
  const ref = useRef<HTMLCanvasElement>(null);
  const asset = audioStore.get(clip.audioId);
  const missing = !!clip.audioId && audioStore.missing.has(clip.audioId);

  useEffect(() => {
    if (!asset && clip.audioId && !missing) void audioStore.load(clip.audioId);
  }, [asset, clip.audioId, missing]);

  const w = Math.max(1, Math.min(MAX_CANVAS, Math.round(width)));
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    if (!asset) return;
    const peaks = asset.peaks;
    const bins = peaks.length / 2;
    const sr = asset.buffer.sampleRate;
    const dur = asset.buffer.duration;
    const clipSec = clip.lengthBars * secPerBar(bpm, spb);
    const rate = audioClipRate(clip, bpm);
    const base = clip.audioOffset ?? 0;
    const loop = Math.max(0.01, Math.min(clip.loopSec ?? dur - base, dur - base));
    const span = Math.min(dur - base, clipSec * rate);
    const mid = cv.height / 2;
    g.fillStyle = color;
    const chans = Array.from({ length: asset.buffer.numberOfChannels }, (_, c) => asset.buffer.getChannelData(c));
    const posAt = (p: number) => {
      let pos = clip.loopAudio ? base + (p % loop) : base + p;
      if (clip.reverse) pos = clip.loopAudio ? base + loop - (p % loop) : base + span - p;
      return pos;
    };
    for (let x = 0; x < w; x++) {
      const t0 = (x / w) * clipSec;
      const t1 = ((x + 1) / w) * clipSec;
      const gain = fadeGainAt(clip, t0, clipSec);
      let lo = 0;
      let hi = 0;
      // source range covered by this pixel
      const p0 = t0 * rate;
      const p1 = t1 * rate;
      // zoomed in past the stored peaks (one per PEAK_BIN samples): read the samples themselves
      const a = posAt(p0);
      const z = posAt(p1);
      if ((p1 - p0) * sr < PEAK_BIN && Math.abs(z - a) <= (p1 - p0) + 1 / sr) {
        const i0 = Math.max(0, Math.floor(Math.min(a, z) * sr));
        const i1 = Math.min(asset.buffer.length - 1, Math.ceil(Math.max(a, z) * sr));
        for (const d of chans) {
          for (let i = i0; i <= i1; i++) {
            const v = d[i];
            if (v < lo) lo = v;
            else if (v > hi) hi = v;
          }
        }
        const y0 = mid - Math.min(1, hi * gain) * mid;
        const y1 = mid - Math.max(-1, lo * gain) * mid;
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
        continue;
      }
      for (let p = p0; p <= p1; p += Math.max(PEAK_BIN / sr, (p1 - p0) / 8)) {
        let pos = clip.loopAudio ? base + (p % loop) : base + p;
        if (clip.reverse) pos = clip.loopAudio ? base + loop - (p % loop) : base + span - p;
        if (pos < 0 || pos >= dur) continue;
        const b = Math.min(bins - 1, Math.floor((pos * sr) / PEAK_BIN));
        if (peaks[b * 2] < lo) lo = peaks[b * 2];
        if (peaks[b * 2 + 1] > hi) hi = peaks[b * 2 + 1];
      }
      const y0 = mid - Math.min(1, hi * gain) * mid;
      const y1 = mid - Math.max(-1, lo * gain) * mid;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    // fade shapes
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    const fi = clip.fadeIn ?? 0;
    const fo = clip.fadeOut ?? 0;
    if (fi > 0) {
      g.beginPath();
      g.moveTo(0, cv.height);
      g.lineTo((fi / clipSec) * w, 0);
      g.stroke();
    }
    if (fo > 0) {
      g.beginPath();
      g.moveTo(w - (fo / clipSec) * w, 0);
      g.lineTo(w, cv.height);
      g.stroke();
    }
    // Clips are edited in place: depend on the fields drawn, not on the object identity.
  }, [asset, clip.audioId, clip.audioOffset, clip.lengthBars, clip.gainDb, clip.fadeIn, clip.fadeOut, clip.reverse, clip.pitch, clip.warp, clip.sourceBpm, clip.loopAudio, clip.loopSec, w, height, color, bpm, spb]);

  if (!asset) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-300/80 pointer-events-none">
        {missing ? 'Missing audio (not in this app)' : 'Loading audio…'}
      </div>
    );
  }
  return <canvas ref={ref} width={w} height={Math.max(4, Math.round(height))} style={{ width, height }} className="absolute left-0 top-0 pointer-events-none" />;
}
