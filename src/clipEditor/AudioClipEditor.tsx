/**
 * Large audio clip editor (Clip Editor): the clip's waveform as it plays, with handles on it —
 * drag an edge to trim (applied on release, snapped like the timeline), a top corner for the fade
 * in / out, the gain line up or down — and the clip controls below (normalize, transpose, reverse,
 * tempo follow, loop, takes).
 */
import React, { useLayoutEffect, useReducer, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../audio/types.ts';
import { audioClipRate, secPerBar } from '../audio/clips/clipMath.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import { AudioClipPanel } from '../components/sequencer/arrangement/AudioClipPanel.tsx';
import { AudioClipWave } from '../components/sequencer/arrangement/AudioClipWave.tsx';
import { capturePointer } from '../ui/skin/pointer.ts';
import { focusClip } from '../shell/clipFocus.ts';

const H = 176;
const PAD = 10;
const DB_TOP = 12;
const DB_BOTTOM = -24;
const EDGE = 9;

type Grab =
  | { kind: 'trim-start' | 'trim-end'; x0: number; dx: number }
  | { kind: 'slip'; x0: number; dx: number; sourceOffset: number }
  | { kind: 'fade-in' | 'fade-out' | 'gain' };

const yOfDb = (db: number) => PAD + ((DB_TOP - db) / (DB_TOP - DB_BOTTOM)) * (H - 2 * PAD);
const dbOfY = (y: number) => Math.round(Math.max(DB_BOTTOM, Math.min(DB_TOP, DB_TOP - ((y - PAD) / (H - 2 * PAD)) * (DB_TOP - DB_BOTTOM))) * 2) / 2;

export function AudioClipEditor({ track, clip, onClose }: { track: SequencerTrack; clip: ArrangementClip; onClose: () => void }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [grab, setGrab] = useState<Grab | null>(null);
  const seq = audioEngine.sequencer;
  const spb = audioEngine.stepsPerBar;
  const bpm = audioEngine.bpm;
  const clipSec = clip.lengthBars * secPerBar(bpm, spb);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xIn = ((clip.fadeIn ?? 0) / clipSec) * w;
  const xOut = w - ((clip.fadeOut ?? 0) / clipSec) * w;
  const yGain = yOfDb(clip.gainDb ?? 0);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hit = (x: number, y: number): Exclude<Grab['kind'], 'slip'> | null => {
    // fade corners first: at fade 0 they sit on the trim edges, which still take the rest of the height
    if (y < 22 && Math.abs(x - xIn) < 10) return 'fade-in';
    if (y < 22 && Math.abs(x - xOut) < 10) return 'fade-out';
    if (x < EDGE) return 'trim-start';
    if (x > w - EDGE) return 'trim-end';
    if (Math.abs(y - yGain) < 7) return 'gain';
    return null;
  };
  const cursor = (k: Grab['kind'] | null) => (k === 'trim-start' || k === 'trim-end' || k === 'fade-in' || k === 'fade-out' ? 'ew-resize' : k === 'gain' ? 'ns-resize' : k === 'slip' ? 'grabbing' : 'default');
  const edit = (patch: Parameters<typeof seq.updateAudioClip>[2]) => {
    seq.updateAudioClip(track.id, clip.id, patch, false);
    bump();
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = local(e);
    if (!grab) {
      e.currentTarget.style.cursor = e.altKey && !clip.reverse ? 'grab' : cursor(hit(x, y));
      return;
    }
    const t = Math.max(0, Math.min(1, x / w)) * clipSec;
    if (grab.kind === 'slip') {
      const asset = audioStore.get(clip.audioId);
      const sourceSpan = clip.loopAudio ? Math.max(0.01, clip.loopSec ?? 0.01) : clipSec * audioClipRate(clip, bpm);
      const maxOffset = Math.max(0, (asset?.buffer.duration ?? 0) - sourceSpan);
      const delta = ((x - grab.x0) / w) * clipSec * audioClipRate(clip, bpm);
      edit({ audioOffset: Math.max(0, Math.min(maxOffset, grab.sourceOffset - delta)) });
      setGrab({ ...grab, dx: x - grab.x0 });
    } else if (grab.kind === 'fade-in') edit({ fadeIn: Math.round(Math.min(t, clipSec - (clip.fadeOut ?? 0)) * 1000) / 1000 });
    else if (grab.kind === 'fade-out') edit({ fadeOut: Math.round(Math.min(clipSec - t, clipSec - (clip.fadeIn ?? 0)) * 1000) / 1000 });
    else if (grab.kind === 'gain') edit({ gainDb: dbOfY(y) });
    else if ('x0' in grab) setGrab({ ...grab, dx: x - grab.x0 });
  };

  const onUp = () => {
    const g = grab;
    setGrab(null);
    if (!g) return;
    if (g.kind === 'trim-start' || g.kind === 'trim-end') {
      const dBars = (g.dx / w) * clip.lengthBars;
      if (Math.abs(g.dx) < 2) return;
      if (g.kind === 'trim-start') seq.resizeClip(track.id, clip.id, 'start', clip.startBar + dBars);
      else seq.resizeClip(track.id, clip.id, 'end', clip.startBar + clip.lengthBars + dBars);
    } else audioEngine.commitEdit();
  };

  // trim preview: the part that will be removed (inward) or added (outward)
  const trimShade =
    grab && (grab.kind === 'trim-start' || grab.kind === 'trim-end')
      ? grab.kind === 'trim-start'
        ? { left: Math.min(0, grab.dx), width: Math.abs(grab.dx), removing: grab.dx > 0 }
        : { left: Math.min(w, w + grab.dx), width: Math.abs(grab.dx), removing: grab.dx < 0 }
      : null;

  // song bar ruler under the wave
  const first = Math.ceil(clip.startBar - 1e-9);
  const last = Math.floor(clip.startBar + clip.lengthBars + 1e-9);
  const every = Math.max(1, Math.ceil(44 / (w / clip.lengthBars)));
  const ticks: number[] = [];
  for (let b = first; b <= last; b++) if ((b - first) % every === 0) ticks.push(b);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-[#100d0a]" data-testid="audio-clip-editor">
      <div className="px-2 pt-2">
        <div
          ref={box}
          className="relative rounded border border-[#40352a] bg-[#14100c] overflow-visible select-none shadow-inner"
          style={{ height: H, touchAction: 'none' }}
          onPointerDown={(e) => {
            const { x, y } = local(e);
            if (e.button === 0 && e.altKey && audioStore.get(clip.audioId) && !clip.reverse) {
              capturePointer(e.currentTarget, e.pointerId);
              setGrab({ kind: 'slip', x0: x, dx: 0, sourceOffset: clip.audioOffset ?? 0 });
              return;
            }
            const k = hit(x, y);
            if (!k || e.button !== 0) return;
            capturePointer(e.currentTarget, e.pointerId);
            setGrab(k === 'trim-start' || k === 'trim-end' ? { kind: k, x0: x, dx: 0 } : { kind: k });
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setGrab(null)}
          onDoubleClick={(e) => {
            const { x, y } = local(e);
            const k = hit(x, y);
            if (k === 'gain') edit({ gainDb: 0 });
            else if (k === 'fade-in') edit({ fadeIn: 0 });
            else if (k === 'fade-out') edit({ fadeOut: 0 });
            else return;
            audioEngine.commitEdit();
          }}
          aria-label="Audio clip waveform — drag the edges to trim, Alt-drag to slip the source, the top corners for fades, the line for gain"
        >
          <div className="absolute inset-0 overflow-hidden rounded">
            <AudioClipWave clip={clip} width={w} height={H} color={clip.color || track.color} bpm={bpm} spb={spb} />
          </div>
          {/* 0 dB reference and the gain line */}
          <div className="absolute left-0 right-0 border-t border-dashed border-white/15 pointer-events-none" style={{ top: yOfDb(0) }} />
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: yGain - 1, height: 2, background: '#f39a2b', boxShadow: '0 0 6px #f39a2b' }} />
          <span className="absolute left-2 pointer-events-none font-mono text-[11px] text-amber-200 bg-black/60 px-1 rounded" style={{ top: Math.max(0, yGain - 18) }}>
            gain {(clip.gainDb ?? 0) > 0 ? '+' : ''}
            {(clip.gainDb ?? 0).toFixed(1)} dB
          </span>
          {clip.invertPhase && (
            <span className="absolute top-2 right-2 pointer-events-none bg-amber-500 text-black font-bold text-[11px] px-1.5 py-0.5 rounded shadow">
              Ø INVERTED
            </span>
          )}
          {clip.fadeCurve && clip.fadeCurve !== 'linear' && (
            <span className="absolute top-2 right-24 pointer-events-none bg-sky-600/80 text-white font-mono text-[11px] px-1.5 py-0.5 rounded shadow">
              {clip.fadeCurve.replace('_', ' ').toUpperCase()}
            </span>
          )}
          {/* fade handles */}
          {(
            [
              ['fade-in', xIn, clip.fadeIn ?? 0],
              ['fade-out', xOut, clip.fadeOut ?? 0],
            ] as const
          ).map(([k, x, sec]) => (
            <span
              key={k}
              className="absolute top-1 w-3 h-3 -ml-1.5 rounded-sm pointer-events-none"
              style={{ left: x, background: '#e6e9ec', boxShadow: '0 0 0 1px #000, 0 0 6px rgba(255,255,255,0.5)' }}
              title={`${k === 'fade-in' ? 'Fade in' : 'Fade out'} ${sec.toFixed(2)} s`}
            />
          ))}
          {/* trim edges */}
          <span className="absolute top-0 bottom-0 left-0 w-[5px] bg-[#d69b50] rounded-l pointer-events-none shadow-[0_0_6px_rgba(214,155,80,0.6)]" />
          <span className="absolute top-0 bottom-0 right-0 w-[5px] bg-[#d69b50] rounded-r pointer-events-none shadow-[0_0_6px_rgba(214,155,80,0.6)]" />
          {trimShade && (
            <span
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: trimShade.left, width: trimShade.width, background: trimShade.removing ? 'rgba(239,68,68,0.35)' : 'rgba(34,211,238,0.25)', borderLeft: '1px solid #fff', borderRight: '1px solid #fff' }}
            />
          )}
        </div>
        <div className="relative h-5 mt-0.5" aria-hidden="true">
          {ticks.map((b) => (
            <span key={b} className="absolute top-0 font-mono text-[11px] text-chrome-ink border-l border-chrome-line pl-1 h-4" style={{ left: ((b - clip.startBar) / clip.lengthBars) * w }}>
              {b + 1}
            </span>
          ))}
        </div>
        <div className="font-label text-[13px] text-chrome-ink pb-1">
          Drag the cyan edges to trim · Alt-drag the waveform to slip its source · the white corner squares for fades · the orange line for clip gain · double-click a handle to reset it.
        </div>
      </div>
      <AudioClipPanel
        key={clip.id}
        audioEngine={audioEngine}
        track={track}
        clip={clip}
        onClose={onClose}
        onComped={(clipId) => focusClip({ trackId: track.id, clipId })}
        showWave={false}
      />
    </div>
  );
}
