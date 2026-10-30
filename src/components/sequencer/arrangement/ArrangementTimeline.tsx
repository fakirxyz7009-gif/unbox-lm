/**
 * Reason-style song timeline with unlimited bars.
 *
 * - One lane per track. Pattern clips loop a pattern of the track; note clips hold notes;
 *   audio tracks hold audio clips (drop audio files on a lane or use IMPORT AUDIO).
 * - Tools: Pointer (move / Alt-copy / trim / resize / loop handle), Pencil (paint), Eraser,
 *   Razor (split), Mute. Double-click a clip to edit it (pattern → piano roll, note clip →
 *   editor below). Right-click for the clip menu.
 * - Ruler: top band = loop (drag L/R or drag a new range), middle = markers (double-click to
 *   add), bottom = bars (click to move the playhead).
 * - The timeline grows with the song; "+ Bars" adds room. Ctrl+wheel zooms time, Alt+wheel lanes.
 * Drags preview in local state and commit once on release (one undo step).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  AudioLines,
  ChevronDown,
  ChevronRight,
  Download,
  Eraser,
  FileAudio,
  Flag,
  FolderOpen,
  Hand,
  Headphones,
  Maximize2,
  MousePointer2,
  Pause,
  Pencil,
  PenTool,
  Play,
  Plus,
  Repeat,
  Scissors,
  Square,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack, TrackFolder } from '../../../audio/types.ts';
import { beatSteps, clipEndBar, findPattern, patternLength16ths, syncTrackPatterns } from '../../../audio/sequencer/model.ts';
import { ClipPreview } from './ClipPreview.tsx';
import { NoteClipEditor } from './NoteClipEditor.tsx';
import { AudioClipWave } from './AudioClipWave.tsx';
import { AutomationLaneRow } from './AutomationLaneRow.tsx';
import type { AutoMode, AutoTarget } from '../../../audio/automation/model.ts';
import { targetKey } from '../../../audio/automation/model.ts';
import { AudioClipPanel, clipSourcePeak } from './AudioClipPanel.tsx';
import { audioStore, calculateClipRms, removeDcOffset } from '../../../audio/clips/audioStore.ts';
import { audioClipRate, secPerBar } from '../../../audio/clips/clipMath.ts';
import { gainToDb, meterPos } from '../../../studio/ui/levels.ts';
import { setUi, useUi, type SeqTool } from '../../../shell/uiStore.ts';
import { focusClip } from '../../../shell/clipFocus.ts';
import { setText, setWidth } from '../../../ui/skin/dom.ts';
import { DARK_TIMELINE, LIGHT_TIMELINE } from './timelineTheme.ts';
import { TrackHeader } from './TrackHeader.tsx';
import { SeqToolbar, type SnapId } from './SeqToolbar.tsx';
import { TrackFolderMenu } from './TrackFolderMenu.tsx';
import { SongBlockEditor } from './SongBlockEditor.tsx';

interface Props {
  audioEngine: AudioEngine;
  tracks: SequencerTrack[];
  activeTrack?: SequencerTrack;
  onSelectTrack: (trackId: string) => void;
  /** Open a pattern in the piano roll. */
  onEditPattern: (trackId: string, patternId: string) => void;
  onAudition: (trackId: string, note: number, velocity: number) => void;
  /** 'light' = the Workstation sequencer (light palette + its own toolbar). */
  theme?: 'dark' | 'light';
  /** Light toolbar "+" → new instrument part. */
  onAddInstrument?: () => void;
}

type Tool = SeqTool;
const COLLAPSED_H = 26;
const FOLDER_H = 26;
const BLOCK_H = 30;

const HEADER_W = 196;
const RULER_H = 44;
const AUTO_H = 44;
const ADD_H = 20;
const EDGE_PX = 7;

interface ClipRef {
  trackId: string;
  clipId: string;
}

type Drag =
  | { kind: 'move'; refs: ClipRef[]; startBar: number; startLane: number; deltaBars: number; deltaLanes: number; copy: boolean; moved: boolean }
  | { kind: 'folderClipMove'; folderId: string; clipId: string; startBar: number; pointerBar: number; deltaBars: number; moved: boolean }
  | { kind: 'blockMove'; placementId: string; startBar: number; pointerBar: number; deltaBars: number; moved: boolean }
  | { kind: 'blockResize'; placementId: string; startLength: number; pointerBar: number; deltaBars: number; moved: boolean }
  | { kind: 'trim'; ref: ClipRef; edge: 'start' | 'end'; bar: number }
  | { kind: 'loop'; ref: ClipRef; pass: number; length: number }
  | { kind: 'paint'; trackId: string; startBar: number; endBar: number; defaultLen: number }
  | { kind: 'loopRange'; mode: 'L' | 'R' | 'new'; a: number; b: number }
  | { kind: 'marker'; id: string; bar: number }
  | { kind: 'hand'; x: number; y: number; left: number; top: number }
  | { kind: 'slip'; ref: ClipRef; startX: number; deltaSeconds: number }
  | { kind: 'erase' };

interface Menu {
  x: number;
  y: number;
  ref: ClipRef;
  bar: number;
}

const keyOf = (r: ClipRef) => `${r.trackId}::${r.clipId}`;

export const ArrangementTimeline: React.FC<Props> = ({ audioEngine, tracks, activeTrack, onSelectTrack, onEditPattern, onAudition, theme = 'dark', onAddInstrument }) => {
  const seq = audioEngine.sequencer;
  const spb = audioEngine.stepsPerBar;
  const beatsPerBar = Math.max(1, Math.round(spb / beatSteps(audioEngine.timeSignature)));
  const light = theme === 'light';
  const P = light ? LIGHT_TIMELINE : DARK_TIMELINE;

  const tool = useUi().seqTool;
  const setTool = (t: Tool) => setUi({ seqTool: t });
  const [paintKind, setPaintKind] = useState<'pattern' | 'notes'>('pattern');
  const [snapId, setSnapId] = useState<SnapId>('bar');
  const [snapOn, setSnapOn] = useState(true);
  const ui = useUi();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const meterEls = useRef(new Map<string, HTMLDivElement>());
  const auditionSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [barPx, setBarPxState] = useState(ui.timelineBarPx);
  const [laneH, setLaneHState] = useState(ui.timelineLaneH);

  const setBarPx = useCallback((valOrFn: number | ((prev: number) => number)) => {
    setBarPxState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      setUi({ timelineBarPx: next });
      return next;
    });
  }, []);

  const setLaneH = useCallback((valOrFn: number | ((prev: number) => number)) => {
    setLaneHState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      setUi({ timelineLaneH: next });
      return next;
    });
  }, []);

  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [openClip, setOpenClip] = useState<ClipRef | null>(null);
  const [openAudio, setOpenAudio] = useState<ClipRef | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  // One selected clip is what the Clip Editor (Mixer & Clip Editor tab) shows.
  useEffect(() => {
    if (selected.size !== 1) return;
    const [trackId, clipId] = [...selected][0].split('::');
    focusClip({ trackId, clipId });
  }, [selected]);
  useEffect(
    () => audioEngine.recorder.onMidiClipRecorded(({ trackId, clipId }) => {
      setSelected(new Set([keyOf({ trackId, clipId })]));
    }),
    [audioEngine]
  );
  /** Tracks whose automation lanes are shown. */
  const [autoOpen, setAutoOpen] = useState<Set<string>>(new Set());
  const [showTempo, setShowTempo] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editingMarker, setEditingMarker] = useState<{ id: string; name: string } | null>(null);
  const [vpW, setVpW] = useState(800);
  const vpWRef = useRef(vpW);
  vpWRef.current = vpW;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<HTMLSpanElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    if (ui.timelineScrollX || ui.timelineScrollY) {
      sc.scrollLeft = ui.timelineScrollX;
      sc.scrollTop = ui.timelineScrollY;
    }
    const onScroll = () => {
      setUi({ timelineScrollX: sc.scrollLeft, timelineScrollY: sc.scrollTop });
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, []);

  // snap off = the sequencer's tick resolution (12 ticks per 16th)
  const snap = !snapOn
    ? 1 / (spb * 12)
    : snapId === 'bar'
      ? 1
      : snapId === 'half'
        ? 0.5
        : snapId === 'beat'
          ? 1 / beatsPerBar
          : snapId === '8th'
            ? 2 / spb
            : snapId === '16th'
              ? 1 / spb
              : 0.5 / spb;
  const snapFloor = (b: number) => Math.max(0, Math.floor(b / snap + 1e-6) * snap);
  const snapRound = (b: number) => Math.round(b / snap) * snap;

  const viewBars = Math.max(audioEngine.arrangementViewBars, Math.ceil((vpW - HEADER_W) / barPx) + 1);
  const lanesW = viewBars * barPx;
  const songEnd = audioEngine.arrangementEndBar();
  const loop = audioEngine.getLoopRange();

  // ------------------------------------------------------------------ geometry helpers

  const barAt = (clientX: number): number => {
    const sc = scrollerRef.current;
    if (!sc) return 0;
    const r = sc.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + sc.scrollLeft - HEADER_W) / barPx);
  };
  // Track rows can be taller than laneH (automation lanes under the clip lane).
  const auto = audioEngine.automation;
  const tempoH = showTempo ? AUTO_H : 0;
  const laneHOf = (t: SequencerTrack) => (collapsed.has(t.id) ? COLLAPSED_H : laneH);
  const rowH = (t: SequencerTrack) => laneHOf(t) + (autoOpen.has(t.id) ? auto.lanesFor(t.id).length * AUTO_H + ADD_H : 0);
  const folderOf = (t: SequencerTrack) => audioEngine.trackFolders.find((f) => f.id === t.folderId);
  const folderAtStart = (i: number): TrackFolder | undefined => {
    const id = tracks[i]?.folderId;
    if (!id || (i > 0 && tracks[i - 1]?.folderId === id)) return undefined;
    return audioEngine.trackFolders.find((f) => f.id === id);
  };
  const rowTops: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (folderAtStart(i)) acc += FOLDER_H;
      rowTops.push(acc);
      if (!folderOf(t)?.collapsed) acc += rowH(t);
    }
    rowTops.push(acc);
  }
  const rowTop = (i: number) => rowTops[Math.max(0, Math.min(tracks.length, i))] ?? 0;
  const laneAt = (clientY: number): number => {
    const sc = scrollerRef.current;
    if (!sc) return 0;
    const r = sc.getBoundingClientRect();
    const yy = clientY - r.top + sc.scrollTop - RULER_H - tempoH - BLOCK_H;
    if (yy < 0) return Math.floor(yy / laneH);
    let y = 0;
    for (let i = 0; i < tracks.length; i++) {
      if (folderAtStart(i)) {
        if (yy < y + FOLDER_H) return i;
        y += FOLDER_H;
      }
      if (folderOf(tracks[i])?.collapsed) continue;
      const height = rowH(tracks[i]);
      if (yy < y + height) return i;
      y += height;
    }
    return tracks.length + Math.floor((yy - y) / laneH);
  };
  const findClip = (ref: ClipRef): { t: SequencerTrack; c: ArrangementClip } | null => {
    const t = tracks.find((x) => x.id === ref.trackId);
    const c = t?.arrangementClips?.find((x) => x.id === ref.clipId);
    return t && c ? { t, c } : null;
  };
  const passBars = (t: SequencerTrack, c: ArrangementClip): number => {
    if (c.kind === 'notes') return c.loopBars && c.loopBars > 0 ? c.loopBars : c.lengthBars;
    if (c.kind === 'audio') {
      const srcPerBar = secPerBar(audioEngine.bpm, spb) * audioClipRate(c, audioEngine.bpm);
      return c.loopAudio && c.loopSec ? Math.max(1 / spb, c.loopSec / srcPerBar) : c.lengthBars;
    }
    const p = findPattern(t, c.patternId) || syncTrackPatterns(t, audioEngine.activePatternIndex);
    return Math.max(1 / spb, patternLength16ths(p) / spb);
  };

  // ------------------------------------------------------------------ ruler + playhead drawing

  const drawRuler = useCallback(() => {
    const cv = rulerRef.current;
    const sc = scrollerRef.current;
    if (!cv || !sc) return;
    const g = cv.getContext('2d');
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, vpW - HEADER_W);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, RULER_H);
    const sx = sc.scrollLeft;
    g.fillStyle = P.rulerBg;
    g.fillRect(0, 0, w, RULER_H);
    g.fillStyle = P.rulerLoopBand;
    g.fillRect(0, 0, w, 14);
    g.fillStyle = P.rulerMarkerBand;
    g.fillRect(0, 14, w, 12);

    // loop band
    const d = dragRef.current;
    const lr = d && d.kind === 'loopRange' ? { start: Math.min(d.a, d.b), end: Math.max(d.a, d.b) } : audioEngine.getLoopRange();
    const lx = lr.start * barPx - sx;
    const rx = lr.end * barPx - sx;
    g.fillStyle = audioEngine.loopEnabled ? 'rgba(214,163,88,0.32)' : 'rgba(116,97,68,0.28)';
    g.fillRect(lx, 1, rx - lx, 12);
    g.fillStyle = audioEngine.loopEnabled ? '#d6a358' : '#746144';
    g.font = 'bold 9px ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.fillRect(lx, 0, 3, 14);
    g.fillRect(rx - 3, 0, 3, 14);
    g.fillStyle = P.rulerLetter;
    if (rx - lx > 22) {
      g.fillText('L', lx + 5, 7);
      g.fillText('R', rx - 11, 7);
    }

    // bars
    const b0 = Math.max(0, Math.floor(sx / barPx));
    const b1 = Math.ceil((sx + w) / barPx);
    const every = barPx >= 30 ? 1 : Math.pow(2, Math.ceil(Math.log2(30 / Math.max(1, barPx))));
    g.textBaseline = 'top';
    g.font = '10px ui-monospace, monospace';
    for (let b = b0; b <= b1; b++) {
      const x = Math.round(b * barPx - sx) + 0.5;
      const major = b % every === 0;
      g.fillStyle = major ? P.rulerMajor : P.rulerMinor;
      g.fillRect(x - 0.5, 26, 1, RULER_H - 26);
      if (major) {
        g.fillStyle = P.rulerText;
        g.fillText(String(b + 1), x + 3, 29);
      }
      if (barPx / beatsPerBar >= 10) {
        for (let k = 1; k < beatsPerBar; k++) {
          const bx = Math.round((b + k / beatsPerBar) * barPx - sx) + 0.5;
          g.fillStyle = P.rulerBeat;
          g.fillRect(bx - 0.5, RULER_H - 6, 1, 6);
        }
      }
    }

    // markers
    g.font = '9px ui-monospace, monospace';
    g.textBaseline = 'middle';
    for (const m of audioEngine.arrangementMarkers) {
      const bar = d && d.kind === 'marker' && d.id === m.id ? d.bar : m.bar;
      const x = bar * barPx - sx;
      if (x < -120 || x > w + 4) continue;
      g.fillStyle = m.color;
      g.fillRect(x, 14, 2, 12);
      g.beginPath();
      g.moveTo(x + 2, 14);
      g.lineTo(x + 9, 17);
      g.lineTo(x + 2, 20);
      g.fill();
      g.fillStyle = P.markerText;
      g.fillText(m.name, x + 11, 20);
    }

    // song end
    if (audioEngine.arrangementEndBar() > 0) {
      const ex = audioEngine.arrangementEndBar() * barPx - sx;
      g.fillStyle = '#f43f5e';
      g.fillRect(ex - 1, 26, 2, RULER_H - 26);
      g.fillText('E', ex + 3, 33);
    }

    // stationary edit cursor
    if (ui.editCursorBar !== null && ui.editCursorBar !== undefined) {
      const ecX = ui.editCursorBar * barPx - sx;
      if (ecX >= -10 && ecX <= w + 10) {
        g.fillStyle = '#06b6d4';
        g.fillRect(ecX - 0.5, 26, 1, RULER_H - 26);
        g.beginPath();
        g.moveTo(ecX - 4, 26);
        g.lineTo(ecX + 4, 26);
        g.lineTo(ecX, 32);
        g.closePath();
        g.fill();
      }
    }

    // playhead
    const ph = (audioEngine.getPlayheadPosition() / spb) * barPx - sx;
    g.fillStyle = light ? '#e8861a' : '#fbbf24';
    g.beginPath();
    g.moveTo(ph - 6, 26);
    g.lineTo(ph + 6, 26);
    g.lineTo(ph, 36);
    g.closePath();
    g.fill();
  }, [audioEngine, barPx, vpW, spb, beatsPerBar, P, light, ui.editCursorBar]);

  useLayoutEffect(() => {
    drawRuler();
  });

  // playhead line, position readout, follow-scroll (rAF, DOM writes only)
  useEffect(() => {
    let raf = 0;
    let lastPos = -1;
    const tick = () => {
      const pos = audioEngine.getPlayheadPosition();
      if (pos !== lastPos || audioEngine.isPlaying) {
        lastPos = pos;
        const x = (pos / spb) * barPx;
        // read scroll geometry before any style write (no forced layout); width comes from the ResizeObserver
        const sc = scrollerRef.current;
        if (sc && follow && audioEngine.isPlaying && !dragRef.current) {
          const left = sc.scrollLeft;
          const view = vpWRef.current - HEADER_W;
          if (x < left || x > left + view - 24) sc.scrollLeft = Math.max(0, x - 48);
        }
        if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
        const bar = Math.floor(pos / spb);
        const inBar = pos - bar * spb;
        const bs = beatSteps(audioEngine.timeSignature);
        setText(posRef.current, `${bar + 1}.${Math.floor(inBar / bs) + 1}.${Math.floor(inBar % bs) + 1}`);
        drawRuler();
      }
      meterEls.current.forEach((el, devId) => {
        const lv = audioEngine.mixer.levels(devId);
        setWidth(el, Math.round(meterPos(gainToDb(Math.max(lv.peakL, lv.peakR)), -48, 3) * 100));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioEngine, barPx, spb, follow, drawRuler]);

  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => setVpW(sc.clientWidth));
    ro.observe(sc);
    setVpW(sc.clientWidth);
    return () => ro.disconnect();
  }, []);

  // wheel zoom (native: React wheel listeners are passive)
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      if (e.altKey) {
        setLaneH((h) => Math.max(28, Math.min(140, Math.round(h * f))));
        return;
      }
      const r = sc.getBoundingClientRect();
      const px = e.clientX - r.left - HEADER_W;
      const bar = (sc.scrollLeft + px) / barPx;
      const nb = Math.max(4, Math.min(480, barPx * f));
      setBarPx(nb);
      requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, bar * nb - px)));
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, [barPx]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // ------------------------------------------------------------------ actions

  const zoomToFit = () => {
    const sc = scrollerRef.current;
    const bars = Math.max(4, Math.ceil(songEnd) + 1);
    const w = (sc?.clientWidth || vpW) - HEADER_W - 16;
    setBarPx(Math.max(4, Math.min(480, w / bars)));
    if (sc) sc.scrollLeft = 0;
  };

  /** Zooms time by `f` keeping the bar under clientX in place. */
  const zoomAt = (clientX: number, f: number) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const px = clientX - r.left - HEADER_W;
    const bar = (sc.scrollLeft + px) / barPx;
    const nb = Math.max(4, Math.min(480, barPx * f));
    setBarPx(nb);
    requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, bar * nb - px)));
  };
  /** Zoom / hand tools act the same on clips and empty lanes. */
  const viewTool = (e: React.PointerEvent): boolean => {
    const sc = scrollerRef.current;
    if (tool === 'zoom') {
      zoomAt(e.clientX, e.altKey || e.ctrlKey ? 1 / 1.6 : 1.6);
      return true;
    }
    if (tool === 'hand' && sc) {
      setDrag({ kind: 'hand', x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop });
      capture(e);
      return true;
    }
    return false;
  };

  const deleteSelected = () => {
    selected.forEach((k) => {
      const [trackId, clipId] = k.split('::');
      seq.deleteClip(trackId, clipId, false);
    });
    setSelected(new Set());
    audioEngine.commitEdit();
  };

  const duplicateSelected = () => {
    const next = new Set<string>();
    selected.forEach((k) => {
      const [trackId, clipId] = k.split('::');
      const c = seq.duplicateClip(trackId, clipId, false);
      if (c) next.add(keyOf({ trackId, clipId: c.id }));
    });
    setSelected(next);
    audioEngine.commitEdit();
  };

  const toggleMuteSelected = () => {
    selected.forEach((k) => {
      const [trackId, clipId] = k.split('::');
      const f = findClip({ trackId, clipId });
      if (f) seq.updateClip(trackId, clipId, { muted: !f.c.muted }, false);
    });
    audioEngine.commitEdit();
  };

  const healSelected = () => {
    if (selected.size < 2) return;
    const byTrack = new Map<string, string[]>();
    selected.forEach((k) => {
      const [trackId, clipId] = k.split('::');
      if (!byTrack.has(trackId)) byTrack.set(trackId, []);
      byTrack.get(trackId)!.push(clipId);
    });

    let healedAny = false;
    byTrack.forEach((clipIds, trackId) => {
      const t = tracks.find((tr) => tr.id === trackId);
      if (!t || !t.arrangementClips) return;
      const trackClips = t.arrangementClips
        .filter((c) => clipIds.includes(c.id))
        .sort((a, b) => a.startBar - b.startBar);

      for (let i = 0; i < trackClips.length - 1; i++) {
        const c1 = trackClips[i];
        const c2 = trackClips[i + 1];
        const res = seq.healClips(trackId, c1.id, c2.id, false);
        if (res) {
          healedAny = true;
          trackClips[i + 1] = res;
        }
      }
    });

    if (healedAny) {
      audioEngine.commitEdit();
    }
  };

  /** Edit Mode: open the first selected clip in its editor. */
  const openSelected = () => {
    const first = [...selected][0];
    if (!first) return;
    const [trackId, clipId] = first.split('::');
    const f = findClip({ trackId, clipId });
    if (f) onClipDouble(f.t, f.c);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) deleteSelected();
    else if (mod && e.key.toLowerCase() === 'd' && selected.size) duplicateSelected();
    else if (mod && e.key.toLowerCase() === 'j' && selected.size >= 2) healSelected();
    else if (!mod && e.key.toLowerCase() === 'm' && selected.size) toggleMuteSelected();
    else if (!mod && e.key.toLowerCase() === 'i') setTool('slip');
    else if (!mod && e.key.toLowerCase() === 'p') setTool('audition');
    else if (e.key === 'Enter' && selected.size) openSelected();
    else if (mod && e.key.toLowerCase() === 'a') {
      const all = new Set<string>();
      tracks.forEach((t) => (t.arrangementClips || []).forEach((c) => all.add(keyOf({ trackId: t.id, clipId: c.id }))));
      setSelected(all);
    } else if (e.key === 'Escape') {
      setSelected(new Set());
      setMenu(null);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // ------------------------------------------------------------------ pointer: clips & lanes

  const capture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // element gone
    }
  };

  const onClipDown = (e: React.PointerEvent<HTMLDivElement>, t: SequencerTrack, c: ArrangementClip, laneIdx: number) => {
    if (e.button === 2) return;
    e.stopPropagation();
    scrollerRef.current?.focus({ preventScroll: true });
    if (viewTool(e)) return;
    const ref = { trackId: t.id, clipId: c.id };
    const k = keyOf(ref);
    const bar = barAt(e.clientX);
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    onSelectTrack(t.id);

    if (tool === 'eraser') {
      seq.deleteClip(t.id, c.id);
      setDrag({ kind: 'erase' });
      capture(e);
      return;
    }
    if (tool === 'razor') {
      seq.splitClip(t.id, c.id, snapRound(bar));
      return;
    }
    if (tool === 'mute') {
      seq.updateClip(t.id, c.id, { muted: !c.muted });
      return;
    }
    if (tool === 'audition') {
      try {
        if (auditionSourceRef.current) {
          auditionSourceRef.current.stop();
          auditionSourceRef.current.disconnect();
          auditionSourceRef.current = null;
        }
      } catch {
        // source may have finished
      }
      if (c.kind === 'audio' && c.audioId) {
        const asset = audioStore.get(c.audioId);
        if (asset?.buffer) {
          const ctx = audioEngine.ctx;
          const src = ctx.createBufferSource();
          src.buffer = asset.buffer;
          const gain = ctx.createGain();
          const gainVal = Math.pow(10, (c.gainDb ?? 0) / 20) * (c.invertPhase ? -1 : 1);
          gain.gain.setValueAtTime(gainVal, ctx.currentTime);
          src.connect(gain);
          gain.connect(ctx.destination);
          const startOffset = c.audioOffset ?? 0;
          const duration = Math.min(6, c.lengthBars * secPerBar(audioEngine.bpm, spb) * audioClipRate(c, audioEngine.bpm));
          src.start(ctx.currentTime, startOffset, duration);
          auditionSourceRef.current = src;
        }
      } else if (c.kind === 'notes' && c.notes && c.notes.length > 0) {
        const n0 = c.notes[0];
        onAudition(t.id, n0.note, n0.velocity ?? 100);
      } else if (c.kind === 'pattern' && c.patternId) {
        const pat = t.patternList?.find((p) => p.id === c.patternId);
        if (pat) {
          const hit = pat.steps.find((s) => s !== null);
          if (hit) {
            onAudition(t.id, hit.note, hit.velocity);
          }
        }
      }
      return;
    }
    if (tool === 'slip' || (e.altKey && e.shiftKey)) {
      setSelected(new Set([k]));
      setDrag({ kind: 'slip', ref, startX: e.clientX, deltaSeconds: 0 });
      capture(e);
      return;
    }
    // pointer / pencil
    if (px > rect.width - 12 && py < 12) {
      setSelected(new Set([k]));
      setDrag({ kind: 'loop', ref, pass: passBars(t, c), length: c.lengthBars });
      capture(e);
      return;
    }
    if (px > rect.width - EDGE_PX || (rect.width > 3 * EDGE_PX && px < EDGE_PX)) {
      setSelected(new Set([k]));
      setDrag({ kind: 'trim', ref, edge: px < EDGE_PX ? 'start' : 'end', bar: px < EDGE_PX ? c.startBar : clipEndBar(c) });
      capture(e);
      return;
    }
    let sel = selected;
    if (e.shiftKey) {
      sel = new Set(selected);
      if (sel.has(k)) sel.delete(k);
      else sel.add(k);
      setSelected(sel);
      return;
    }
    if (!sel.has(k)) {
      sel = new Set([k]);
      setSelected(sel);
    }
    const refs = [...sel].map((s) => {
      const [trackId, clipId] = s.split('::');
      return { trackId, clipId };
    });
    setDrag({ kind: 'move', refs, startBar: bar, startLane: laneIdx, deltaBars: 0, deltaLanes: 0, copy: e.altKey, moved: false });
    capture(e);
  };

  const onFolderClipDown = (e: React.PointerEvent<HTMLDivElement>, folderId: string, clipId: string, startBar: number, trackId: string) => {
    if (e.button === 2 || tool !== 'pointer' || viewTool(e)) return;
    e.stopPropagation();
    onSelectTrack(trackId);
    setDrag({ kind: 'folderClipMove', folderId, clipId, startBar, pointerBar: barAt(e.clientX), deltaBars: 0, moved: false });
    capture(e);
  };

  const onBlockDown = (e: React.PointerEvent<HTMLDivElement>, placementId: string, startBar: number) => {
    if (e.button === 2 || tool !== 'pointer' || viewTool(e)) return;
    e.stopPropagation();
    setDrag({ kind: 'blockMove', placementId, startBar, pointerBar: barAt(e.clientX), deltaBars: 0, moved: false });
    capture(e);
  };

  const onBlockResizeDown = (e: React.PointerEvent<HTMLDivElement>, placementId: string, lengthBars: number) => {
    if (e.button === 2 || tool !== 'pointer' || viewTool(e)) return;
    e.stopPropagation();
    setDrag({ kind: 'blockResize', placementId, startLength: lengthBars, pointerBar: barAt(e.clientX), deltaBars: 0, moved: false });
    capture(e);
  };

  const onBlockLaneDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2 || tool !== 'pencil' || viewTool(e)) return;
    e.stopPropagation();
    const block = audioEngine.createSongBlock();
    if (block) audioEngine.placeSongBlock(block.id, snapFloor(barAt(e.clientX)), 4);
  };

  const onLaneDown = (e: React.PointerEvent<HTMLDivElement>, t: SequencerTrack) => {
    if (e.button === 2) return;
    scrollerRef.current?.focus({ preventScroll: true });
    onSelectTrack(t.id);
    setMenu(null);
    if (viewTool(e)) return;
    if (tool === 'pencil' && t.kind !== 'audio') {
      const start = snapFloor(barAt(e.clientX));
      const defaultLen =
        paintKind === 'notes' ? Math.max(snap, 1) : Math.max(snap, seq.patternBars(t.id, t.activePatternId));
      setDrag({ kind: 'paint', trackId: t.id, startBar: start, endBar: start + defaultLen, defaultLen });
      capture(e);
      return;
    }
    if (tool === 'eraser') {
      setDrag({ kind: 'erase' });
      capture(e);
      return;
    }
    const clickBar = snapFloor(barAt(e.clientX));
    setUi({ editCursorBar: clickBar });
    setSelected(new Set());
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const sc = scrollerRef.current;
    if (d.kind === 'hand') {
      if (sc) {
        sc.scrollLeft = Math.max(0, d.left - (e.clientX - d.x));
        sc.scrollTop = Math.max(0, d.top - (e.clientY - d.y));
      }
      return;
    }
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientX > r.right - 30) sc.scrollLeft += 16;
      else if (e.clientX < r.left + HEADER_W + 20) sc.scrollLeft = Math.max(0, sc.scrollLeft - 16);
    }
    const bar = barAt(e.clientX);
    if (d.kind === 'move') {
      const db = snapRound(bar - d.startBar);
      const dl = laneAt(e.clientY) - d.startLane;
      if (db !== d.deltaBars || dl !== d.deltaLanes) setDrag({ ...d, deltaBars: db, deltaLanes: dl, moved: true });
    } else if (d.kind === 'folderClipMove') {
      const db = snapRound(bar - d.pointerBar);
      if (db !== d.deltaBars) setDrag({ ...d, deltaBars: db, moved: true });
    } else if (d.kind === 'blockMove' || d.kind === 'blockResize') {
      const db = snapRound(bar - d.pointerBar);
      if (db !== d.deltaBars) setDrag({ ...d, deltaBars: db, moved: true });
    } else if (d.kind === 'trim') {
      setDrag({ ...d, bar: Math.max(0, snapRound(bar)) });
    } else if (d.kind === 'loop') {
      const f = findClip(d.ref);
      if (!f) return;
      const passes = Math.max(1, Math.round((bar - f.c.startBar) / d.pass));
      setDrag({ ...d, length: passes * d.pass });
    } else if (d.kind === 'paint') {
      const end = Math.max(d.startBar + snap, Math.ceil(bar / snap - 1e-6) * snap);
      setDrag({ ...d, endBar: bar > d.startBar + d.defaultLen ? end : d.startBar + d.defaultLen });
    } else if (d.kind === 'erase') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-clip-key]');
      const k = el?.dataset.clipKey;
      if (k) {
        const [trackId, clipId] = k.split('::');
        seq.deleteClip(trackId, clipId);
      }
    } else if (d.kind === 'loopRange') {
      const b = Math.max(0, snapRound(bar));
      setDrag(d.mode === 'L' ? { ...d, a: b } : { ...d, b });
    } else if (d.kind === 'marker') {
      setDrag({ ...d, bar: Math.max(0, snapRound(bar)) });
    } else if (d.kind === 'slip') {
      const deltaPx = e.clientX - d.startX;
      const secPerBar = (spb / 4) * (60 / Math.max(1, audioEngine.bpm));
      const deltaSec = (deltaPx / barPx) * secPerBar;
      setDrag({ ...d, deltaSeconds: deltaSec });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'move') {
      if (!d.moved || (d.deltaBars === 0 && d.deltaLanes === 0)) return;
      const next = new Set<string>();
      for (const ref of d.refs) {
        const f = findClip(ref);
        if (!f) continue;
        const laneIdx = tracks.indexOf(f.t) + (f.c.kind === 'notes' || f.c.kind === 'audio' ? d.deltaLanes : 0);
        const dest = tracks[Math.max(0, Math.min(tracks.length - 1, laneIdx))];
        let clipId = ref.clipId;
        if (d.copy) {
          const copy = seq.duplicateClip(ref.trackId, ref.clipId, false);
          if (!copy) continue;
          clipId = copy.id;
        }
        const owner = seq.moveClip(ref.trackId, clipId, f.c.startBar + d.deltaBars, dest?.id, false);
        if (owner) next.add(keyOf({ trackId: owner, clipId }));
      }
      setSelected(next);
      audioEngine.commitEdit();
    } else if (d.kind === 'folderClipMove') {
      if (d.moved && d.deltaBars !== 0) audioEngine.moveTrackFolderClip(d.folderId, d.clipId, d.startBar + d.deltaBars);
    } else if (d.kind === 'blockMove') {
      if (d.moved && d.deltaBars !== 0) audioEngine.moveSongBlockPlacement(d.placementId, d.startBar + d.deltaBars);
    } else if (d.kind === 'blockResize') {
      if (d.moved && d.deltaBars !== 0) audioEngine.resizeSongBlockPlacement(d.placementId, d.startLength + d.deltaBars);
    } else if (d.kind === 'trim') {
      seq.resizeClip(d.ref.trackId, d.ref.clipId, d.edge, d.bar);
    } else if (d.kind === 'loop') {
      const f = findClip(d.ref);
      if (!f || Math.abs(d.length - f.c.lengthBars) < 1e-6) return;
      if (f.c.kind === 'notes' && !(f.c.loopBars && f.c.loopBars > 0)) seq.setClipLoop(d.ref.trackId, d.ref.clipId, f.c.lengthBars, false);
      seq.resizeClip(d.ref.trackId, d.ref.clipId, 'end', f.c.startBar + d.length);
    } else if (d.kind === 'paint') {
      const len = Math.max(snap, d.endBar - d.startBar);
      const t = tracks.find((x) => x.id === d.trackId);
      if (!t) return;
      const c =
        paintKind === 'notes'
          ? seq.addNoteClip(t.id, d.startBar, len)
          : seq.addPatternClip(t.id, d.startBar, { lengthBars: len, patternId: t.activePatternId });
      if (c) {
        setSelected(new Set([keyOf({ trackId: t.id, clipId: c.id })]));
        if (paintKind === 'notes') setOpenClip({ trackId: t.id, clipId: c.id });
      }
    } else if (d.kind === 'loopRange') {
      const a = Math.min(d.a, d.b);
      const b = Math.max(d.a, d.b);
      if (b - a >= 1 / spb) audioEngine.setLoopLocators(a, b);
    } else if (d.kind === 'marker') {
      seq.updateMarker(d.id, { bar: d.bar });
    } else if (d.kind === 'slip') {
      if (Math.abs(d.deltaSeconds) > 0.001) {
        seq.slipClip(d.ref.trackId, d.ref.clipId, d.deltaSeconds);
      }
    }
  };

  const onClipDouble = (t: SequencerTrack, c: ArrangementClip) => {
    if (c.kind === 'audio') setOpenAudio({ trackId: t.id, clipId: c.id });
    else if (c.kind === 'notes') setOpenClip({ trackId: t.id, clipId: c.id });
    else if (c.patternId) onEditPattern(t.id, c.patternId);
  };

  // ------------------------------------------------------------------ ruler pointer

  const onRulerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    const bar = barAt(e.clientX);
    scrollerRef.current?.focus({ preventScroll: true });
    if (y < 14) {
      const lx = loop.start * barPx;
      const rx = loop.end * barPx;
      const x = bar * barPx;
      if (Math.abs(x - lx) < 8) setDrag({ kind: 'loopRange', mode: 'L', a: loop.start, b: loop.end });
      else if (Math.abs(x - rx) < 8) setDrag({ kind: 'loopRange', mode: 'R', a: loop.start, b: loop.end });
      else setDrag({ kind: 'loopRange', mode: 'new', a: snapFloor(bar), b: snapFloor(bar) + snap });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (y < 26) {
      const hit = audioEngine.arrangementMarkers.find((m) => Math.abs(m.bar * barPx - bar * barPx) < 10);
      if (hit) {
        if (e.button === 2) {
          seq.removeMarker(hit.id);
          return;
        }
        setDrag({ kind: 'marker', id: hit.id, bar: hit.bar });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    const targetBar = snapFloor(bar);
    audioEngine.seekToSongPosition(Math.round(targetBar * spb));
    setUi({ editCursorBar: targetBar });
  };

  const onRulerDouble = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < 14 || y >= 26) return;
    const bar = barAt(e.clientX);
    const hit = audioEngine.arrangementMarkers.find((m) => Math.abs(m.bar * barPx - bar * barPx) < 10);
    if (hit) setEditingMarker({ id: hit.id, name: hit.name });
    else seq.addMarker(snapFloor(bar));
  };

  // ------------------------------------------------------------------ render helpers

  const previewFor = (t: SequencerTrack, c: ArrangementClip, laneIdx: number): { start: number; len: number; lane: number; ghost?: boolean } => {
    const k = keyOf({ trackId: t.id, clipId: c.id });
    const d = drag;
    if (d?.kind === 'move' && d.moved && d.refs.some((r) => keyOf(r) === k)) {
      return { start: Math.max(0, c.startBar + d.deltaBars), len: c.lengthBars, lane: c.kind === 'notes' || c.kind === 'audio' ? laneIdx + d.deltaLanes : laneIdx, ghost: true };
    }
    if (d?.kind === 'trim' && keyOf(d.ref) === k) {
      if (d.edge === 'end') return { start: c.startBar, len: Math.max(1 / spb, d.bar - c.startBar), lane: laneIdx };
      const end = clipEndBar(c);
      const st = Math.min(end - 1 / spb, Math.max(c.startBar - (c.offsetSteps || 0) / spb, d.bar));
      return { start: st, len: end - st, lane: laneIdx };
    }
    if (d?.kind === 'loop' && keyOf(d.ref) === k) return { start: c.startBar, len: d.length, lane: laneIdx };
    return { start: c.startBar, len: c.lengthBars, lane: laneIdx };
  };

  const clipColor = (t: SequencerTrack, c: ArrangementClip) =>
    c.kind === 'notes' || c.kind === 'audio' ? c.color || t.color || '#10b981' : findPattern(t, c.patternId)?.color || t.color || '#f59e0b';

  const clipLabel = (t: SequencerTrack, c: ArrangementClip) =>
    c.kind === 'audio' ? c.name || 'Audio' : c.kind === 'notes' ? c.name || 'Note clip' : findPattern(t, c.patternId)?.name || 'Pattern';

  /** Imports audio files onto a lane (new audio track when the lane is not an audio track). */
  const importFiles = async (files: File[], trackId?: string, bar = 0) => {
    const audio = files.filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aiff?|m4a|aac|opus|webm)$/i.test(f.name));
    if (!audio.length) return;
    let lane = trackId;
    let at = bar;
    for (const f of audio) {
      setImporting(f.name);
      try {
        const asset = await audioStore.importFile(f);
        const placed = audioEngine.addAudioClip(asset.id, at, lane);
        if (placed) {
          lane = placed.trackId;
          const t = audioEngine.tracks.find((x) => x.id === placed.trackId);
          const c = t?.arrangementClips?.find((x) => x.id === placed.clipId);
          if (c) at = c.startBar + c.lengthBars;
        }
      } catch (err) {
        window.alert(`Could not import ${f.name}: ${(err as Error).message}`);
      }
    }
    setImporting(null);
  };

  const onDropFiles = (e: React.DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    const idx = laneAt(e.clientY);
    const t = idx >= 0 && idx < tracks.length ? tracks[idx] : undefined;
    void importFiles([...e.dataTransfer.files], t?.kind === 'audio' ? t.id : undefined, snapFloor(barAt(e.clientX)));
  };

  const gridBg = useMemo(() => {
    const beat = barPx / beatsPerBar;
    const [g4, g1, gb] = P.grid;
    const layers = [
      `repeating-linear-gradient(to right, ${g4} 0, ${g4} 1px, transparent 1px, transparent ${barPx * 4}px)`,
      `repeating-linear-gradient(to right, ${g1} 0, ${g1} 1px, transparent 1px, transparent ${barPx}px)`,
    ];
    if (beat >= 10) layers.push(`repeating-linear-gradient(to right, ${gb} 0, ${gb} 1px, transparent 1px, transparent ${beat}px)`);
    return layers.join(',');
  }, [barPx, beatsPerBar, P]);

  const open = openClip ? findClip(openClip) : null;
  const mode = audioEngine.playbackMode;
  const contentH = RULER_H + tempoH + BLOCK_H + rowTop(tracks.length);
  const toolBtn = (id: Tool, Icon: React.FC<{ className?: string }>, label: string, hk: string) => (
    <button
      key={id}
      onClick={() => setTool(id)}
      className={`px-2 py-1 rounded font-bold flex items-center gap-1 ${tool === id ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
      title={`${label} (${hk})`}
      data-testid={`arr-tool-${id}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 text-xs font-mono" style={{ background: P.root }} data-testid="arrangement-timeline">
      {light ? (
        <SeqToolbar
          tool={tool}
          onTool={setTool}
          snapOn={snapOn}
          onSnapOn={setSnapOn}
          snapId={snapId}
          onSnap={setSnapId}
          blockMode={mode === 'pattern_loop'}
          onBlockMode={(b) => audioEngine.setPlaybackMode(b ? 'pattern_loop' : 'song_arrangement')}
          noteChaseEnabled={audioEngine.noteChaseEnabled}
          onNoteChaseEnabled={(on) => audioEngine.setNoteChaseEnabled(on)}
          folders={audioEngine.trackFolders}
          activeTrackId={activeTrack?.id}
          activeFolderId={activeTrack?.folderId}
          onCreateTrackFolder={() => activeTrack && audioEngine.createTrackFolder(activeTrack.id)}
          onSetTrackFolder={(folderId) => activeTrack && audioEngine.setTrackFolder(activeTrack.id, folderId)}
          paintKind={paintKind}
          onPaintKind={setPaintKind}
          autoMode={auto.globalMode}
          onAutoMode={(m) => auto.setAllModes(m)}
          onEditMode={openSelected}
          onZoom={(f) => {
            const sc = scrollerRef.current;
            if (sc) zoomAt(sc.getBoundingClientRect().left + HEADER_W + (sc.clientWidth - HEADER_W) / 2, f);
          }}
          onFit={zoomToFit}
          onAddAudioTrack={() => audioEngine.createAudioTrack()}
          onAddMidiOutTrack={() => audioEngine.createMidiOutTrack()}
          onAddInstrument={onAddInstrument}
        />
      ) : (
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-[#12161f] border-b border-neutral-800 text-[11px] flex-shrink-0">
        <div className="flex items-center bg-slate-950 rounded border border-slate-700 p-0.5" role="group" aria-label="Playback mode">
          <button
            onClick={() => audioEngine.setPlaybackMode('pattern_loop')}
            className={`px-2 py-0.5 rounded font-black ${mode === 'pattern_loop' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
            title="Pattern mode: every track loops the pattern you are editing"
            data-testid="mode-pattern"
          >
            PATTERN
          </button>
          <button
            onClick={() => audioEngine.setPlaybackMode('song_arrangement')}
            className={`px-2 py-0.5 rounded font-black ${mode === 'song_arrangement' ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-white'}`}
            title="Song mode: play the clips of the arrangement"
            data-testid="mode-song"
          >
            SONG
          </button>
        </div>
        <button
          onClick={() => void audioEngine.togglePlay()}
          className={`px-2 py-1 rounded font-black flex items-center gap-1 ${audioEngine.isPlaying ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'}`}
          title="Play / pause (Space)"
          data-testid="arr-play"
        >
          {audioEngine.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => audioEngine.stopTransport()} className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700" title="Stop and go to bar 1">
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => audioEngine.setNoteChaseEnabled(!audioEngine.noteChaseEnabled)}
          aria-pressed={audioEngine.noteChaseEnabled}
          className={`px-2 py-1 rounded font-black border ${audioEngine.noteChaseEnabled ? 'bg-violet-900 text-violet-200 border-violet-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
          title="Resume sustained MIDI notes when playback starts or seeks into them"
          data-testid="note-chase"
        >
          CHASE {audioEngine.noteChaseEnabled ? 'ON' : 'OFF'}
        </button>
        <TrackFolderMenu
          folders={audioEngine.trackFolders}
          activeTrackId={activeTrack?.id}
          activeFolderId={activeTrack?.folderId}
          onCreate={() => activeTrack && audioEngine.createTrackFolder(activeTrack.id)}
          onAssign={(folderId) => activeTrack && audioEngine.setTrackFolder(activeTrack.id, folderId)}
        />
        <span className="px-2 py-0.5 rounded bg-black/60 border border-slate-800 text-amber-300 font-black min-w-[64px] text-center" title="Bar.Beat.16th">
          <span ref={posRef}>1.1.1</span>
        </span>
        <button
          onClick={() => audioEngine.toggleLoop()}
          className={`px-2 py-1 rounded font-bold flex items-center gap-1 border ${audioEngine.loopEnabled ? 'bg-cyan-900 text-cyan-200 border-cyan-500' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
          title="Loop between the L and R locators (Song mode). Off: stop at the song end."
          data-testid="arr-loop"
        >
          <Repeat className="w-3.5 h-3.5" /> L {+(loop.start + 1).toFixed(2)} – R {+(loop.end + 1).toFixed(2)}
        </button>
        <label className="flex items-center gap-1 text-slate-400" title="R locator follows the end of the song">
          <input type="checkbox" checked={audioEngine.loopFollowsSong} onChange={(e) => audioEngine.setLoopFollowsSong(e.target.checked)} />
          R = END
        </label>

        <div className="w-px h-5 bg-slate-700" />
        <div className="flex items-center gap-0.5 bg-slate-950 rounded border border-slate-800 p-0.5">
          {toolBtn('pointer', MousePointer2, 'SELECT', 'drag = move, Alt = copy, edges = trim')}
          {toolBtn('pencil', PenTool, 'PAINT', 'click/drag empty lane')}
          {toolBtn('eraser', Eraser, 'ERASE', 'click/drag')}
          {toolBtn('razor', Scissors, 'SPLIT', 'click a clip')}
          {toolBtn('mute', VolumeX, 'MUTE', 'click a clip')}
          {toolBtn('slip', ArrowLeftRight, 'SLIP', 'slip audio or notes within clip boundaries (I)')}
          {toolBtn('audition', Headphones, 'AUDITION', 'click to audition clip audio or notes (P)')}
          {toolBtn('zoom', ZoomIn, 'ZOOM', 'click = in, Alt-click = out')}
          {toolBtn('hand', Hand, 'HAND', 'drag to scroll')}
        </div>
        <select
          value={paintKind}
          onChange={(e) => setPaintKind(e.target.value as 'pattern' | 'notes')}
          className="bg-slate-900 text-white rounded px-1 py-0.5 border border-slate-700"
          title="What the paint tool creates"
          data-testid="arr-paint-kind"
        >
          <option value="pattern">Paint: pattern clip</option>
          <option value="notes">Paint: note clip</option>
        </select>
        <select
          value={snapOn ? snapId : 'off'}
          onChange={(e) => {
            if (e.target.value === 'off') setSnapOn(false);
            else {
              setSnapOn(true);
              setSnapId(e.target.value as SnapId);
            }
          }}
          className="bg-slate-900 text-white rounded px-1 py-0.5 border border-slate-700"
          title="Snap"
        >
          <option value="bar">Snap: bar</option>
          <option value="half">Snap: 1/2 bar</option>
          <option value="beat">Snap: beat</option>
          <option value="8th">Snap: 1/8</option>
          <option value="16th">Snap: 1/16</option>
          <option value="32nd">Snap: 1/32</option>
          <option value="off">Snap: off</option>
        </select>

        <div className="w-px h-5 bg-slate-700" />
        <button onClick={() => setBarPx((b) => Math.max(4, b / 1.4))} className="p-1 rounded hover:bg-slate-800 text-slate-300" title="Zoom out (Ctrl+wheel)" aria-label="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setBarPx((b) => Math.min(480, b * 1.4))} className="p-1 rounded hover:bg-slate-800 text-slate-300" title="Zoom in (Ctrl+wheel)" aria-label="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setLaneH((h) => Math.max(28, h - 8))} className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-bold" title="Smaller lanes (Alt+wheel)">
          ↕−
        </button>
        <button onClick={() => setLaneH((h) => Math.min(140, h + 8))} className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-bold" title="Taller lanes (Alt+wheel)">
          ↕+
        </button>
        <button onClick={zoomToFit} className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 flex items-center gap-1" title="Zoom to fit the song">
          <Maximize2 className="w-3.5 h-3.5" /> FIT
        </button>
        <button onClick={() => audioEngine.addArrangementBars(8)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold" title="Add 8 bars of room" data-testid="arr-add-bars">
          <Plus className="w-3 h-3 inline" /> 8 BARS
        </button>
        <button onClick={() => audioEngine.addArrangementBars(32)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold" title="Add 32 bars of room">
          <Plus className="w-3 h-3 inline" /> 32
        </button>
        <label className="flex items-center gap-1 text-slate-400" title="Scroll with the playhead">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> FOLLOW
        </label>
        <label className="flex items-center gap-1 text-violet-300" title="Automation mode for all lanes. TOUCH / LATCH / WRITE also create a lane for any control you move while playing.">
          AUTO
          <select
            value={auto.globalMode}
            onChange={(e) => auto.setAllModes(e.target.value as AutoMode)}
            className="bg-slate-900 text-white rounded px-1 py-0.5 border border-violet-700"
            data-testid="arr-auto-mode"
          >
            {(['read', 'touch', 'latch', 'write', 'off'] as const).map((m) => (
              <option key={m} value={m}>{m.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            if (!auto.lane({ kind: 'tempo' })) {
              const l = auto.addLane({ kind: 'tempo' }, 'read');
              auto.setPoints(l.id, [{ pos: 0, value: (audioEngine.bpm - 40) / 200 }]);
            }
            setShowTempo((v) => !v);
          }}
          className={`px-1.5 py-0.5 rounded font-bold ${showTempo ? 'bg-violet-600 text-white' : 'bg-slate-800 text-violet-300 hover:bg-slate-700'}`}
          title="Tempo track (tempo map / tempo automation)"
          data-testid="arr-tempo-track"
        >
          TEMPO
        </button>
        <button
          onClick={() => seq.addMarker(Math.floor(audioEngine.getPlayheadPosition() / spb))}
          className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-pink-300 flex items-center gap-1"
          title="Add a marker at the playhead (double-click the marker band to add, drag to move, right-click to delete)"
        >
          <Flag className="w-3.5 h-3.5" /> MARKER
        </button>
        <div className="w-px h-5 bg-slate-700" />
        <button onClick={() => audioEngine.createAudioTrack()} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold flex items-center gap-1" title="New audio track (record or import audio)" data-testid="arr-add-audio-track">
          <AudioLines className="w-3.5 h-3.5" /> + AUDIO TRACK
        </button>
        <button onClick={() => audioEngine.createMidiOutTrack()} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-violet-300 font-bold" title="New MIDI track routed to the selected Web MIDI output" data-testid="arr-add-midi-out-track">
          + MIDI OUT
        </button>
        <button onClick={() => fileRef.current?.click()} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold flex items-center gap-1" title="Import audio files at the playhead (or drop files on a lane)" data-testid="arr-import-audio">
          <FileAudio className="w-3.5 h-3.5" /> IMPORT AUDIO
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            const t = activeTrack?.kind === 'audio' ? activeTrack.id : undefined;
            void importFiles(files, t, Math.floor(audioEngine.getPlayheadPosition() / spb));
          }}
        />
        {importing && <span className="text-cyan-300 animate-pulse">Importing {importing}…</span>}
        <span className="text-slate-500">
          {Math.ceil(songEnd)} bars · {tracks.reduce((n, t) => n + (t.arrangementClips?.length || 0), 0)} clips
        </span>
        <button
          onClick={() => void audioEngine.exportUncompressedWav(undefined, 'wav')}
          className="ml-auto px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center gap-1"
          title="Render the arrangement to a 24-bit WAV (full mix with every effect). More formats, stems and MIDI: Export page."
        >
          <Download className="w-3.5 h-3.5" /> WAV
        </button>
      </div>
      )}

      {/* timeline */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-auto relative outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={drawRuler}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={onDropFiles}
        data-testid="arr-scroller"
      >
        <div style={{ width: HEADER_W + lanesW, height: contentH, position: 'relative' }}>
          {/* ruler row */}
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-40 flex-shrink-0 border-r border-b flex items-center px-2 text-[11px]" style={{ width: HEADER_W, background: P.headerBg, borderColor: P.headerBorder, color: light ? '#4b5159' : '#94a3b8' }}>
              {light ? (
                <span className="font-label font-bold text-[13px]">
                  <span ref={posRef}>1.1.1</span> · {tracks.length} TRACKS
                </span>
              ) : (
                <>TRACKS ({tracks.length})</>
              )}
            </div>
            <canvas
              ref={rulerRef}
              className="sticky border-b"
              style={{ left: HEADER_W, width: Math.max(10, vpW - HEADER_W), height: RULER_H, cursor: 'pointer', borderColor: P.headerBorder }}
              width={Math.max(10, vpW - HEADER_W) * (window.devicePixelRatio || 1)}
              height={RULER_H * (window.devicePixelRatio || 1)}
              onPointerDown={onRulerDown}
              onDoubleClick={onRulerDouble}
              onContextMenu={(e) => e.preventDefault()}
              data-testid="arr-ruler"
            />
          </div>

          {tracks.length === 0 && (
            <div className="absolute text-slate-400 p-6" style={{ left: HEADER_W, top: RULER_H }}>
              Add an instrument (rack or + ADD INSTRUMENT) — every instrument gets a lane here.
            </div>
          )}

          {showTempo && auto.lane({ kind: 'tempo' }) && (
            <AutomationLaneRow audioEngine={audioEngine} lane={auto.lane({ kind: 'tempo' })!} headerW={HEADER_W} width={lanesW} height={AUTO_H} barPx={barPx} spb={spb} snap={snapId === '16th' ? 1 / spb : snap} targets={[{ kind: 'tempo' }]} light={light} />
          )}
          <div className="flex" style={{ height: BLOCK_H }} data-testid="arr-block-row">
            <div
              className="sticky left-0 z-20 flex-shrink-0 border-r border-b flex items-center gap-2 px-2"
              style={{ width: HEADER_W, background: light ? '#dddfe2' : '#202a3a', borderColor: P.headerBorder, color: light ? '#30363d' : '#dbeafe' }}
            >
              <span className="font-black text-[11px] text-[#7c4a03]">BLOCKS</span>
              <button
                type="button"
                disabled={!tracks.some((t) => t.kind !== 'audio')}
                onClick={() => {
                  const block = audioEngine.createSongBlock();
                  if (block) audioEngine.placeSongBlock(block.id, audioEngine.arrangementEndBar(), 4);
                }}
                className="ml-auto px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-bold text-amber-200 hover:text-white disabled:opacity-40"
                title={`Create a reusable block from scene ${audioEngine.activePatternIndex + 1}, then place it at the song end`}
                aria-label={`Create block from scene ${audioEngine.activePatternIndex + 1}`}
              >
                + SCENE {audioEngine.activePatternIndex + 1}
              </button>
              <button
                type="button"
                disabled={!tracks.some((t) => t.kind !== 'audio')}
                onClick={() => {
                  const block = audioEngine.createSongBlock(undefined, audioEngine.activePatternIndex, { startBar: loop.start, endBar: loop.end });
                  if (block) audioEngine.placeSongBlock(block.id, audioEngine.arrangementEndBar());
                }}
                className="px-1.5 py-0.5 rounded bg-emerald-950 text-[11px] font-bold text-emerald-200 hover:text-white disabled:opacity-40"
                title={`Create a block from scene ${audioEngine.activePatternIndex + 1}; capture overlapping audio clips and automation from the current L–R range (${loop.start.toFixed(2)}–${loop.end.toFixed(2)} bars)`}
                aria-label={`Create block from scene ${audioEngine.activePatternIndex + 1} and current loop range`}
              >
                + L–R
              </button>
            </div>
            <div
              className={`relative border-b ${tool === 'pencil' ? 'cursor-crosshair' : ''}`}
              style={{ width: lanesW, height: BLOCK_H, background: light ? '#eceef0' : '#101724', borderColor: P.laneBorder, backgroundImage: gridBg }}
              onPointerDown={onBlockLaneDown}
              data-testid="arr-block-lane"
            >
              {audioEngine.blockPlacements.map((placement) => {
                const block = audioEngine.songBlocks.find((b) => b.id === placement.blockId);
                if (!block) return null;
                const audioClipCount = Object.values(block.audioClipsByTrack ?? {}).reduce((count, clips) => count + clips.length, 0);
                const automationLaneCount = block.automationLanes?.length ?? 0;
                const moving = drag?.kind === 'blockMove' && drag.placementId === placement.id ? drag : null;
                const resizing = drag?.kind === 'blockResize' && drag.placementId === placement.id ? drag : null;
                const start = Math.max(0, placement.startBar + (moving?.deltaBars || 0));
                const length = Math.max(1 / spb, placement.lengthBars + (resizing?.deltaBars || 0));
                return (
                  <div
                    key={placement.id}
                    className="absolute top-[3px] bottom-[3px] z-[5] rounded border flex items-center px-1.5 text-[11px] font-black select-none overflow-hidden"
                    style={{ left: start * barPx, width: Math.max(18, length * barPx), color: light ? '#18212d' : '#fff7ed', background: `${block.color}55`, borderColor: block.color, cursor: tool === 'pointer' ? 'grab' : undefined }}
                    onPointerDown={(e) => onBlockDown(e, placement.id, placement.startBar)}
                    onDoubleClick={() => {
                      const name = window.prompt('Rename song block', block.name);
                      if (name !== null) audioEngine.renameSongBlock(block.id, name);
                    }}
                    title={`${block.name} · Scene ${block.patternIndex + 1} · ${length.toFixed(2)} bars · ${audioClipCount} captured audio clips · ${automationLaneCount} captured automation lanes. Drag to move; drag the right edge to resize.`}
                    data-testid="arr-block-clip"
                  >
                    <span className="truncate flex-1">{block.name}</span>
                    {audioClipCount > 0 && <span className="mx-0.5 text-[11px] text-emerald-200" aria-label={`${audioClipCount} captured audio clips`}>A{audioClipCount}</span>}
                    {automationLaneCount > 0 && <span className="mx-0.5 text-[11px] text-cyan-200" aria-label={`${automationLaneCount} captured automation lanes`}>AUTO{automationLaneCount}</span>}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => setEditingBlockId(block.id)}
                      className="px-0.5 opacity-80 hover:text-white"
                      aria-label={`Edit ${block.name}`}
                      title={`Edit the captured audio and automation in ${block.name}`}
                    ><Pencil className="h-2.5 w-2.5" /></button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => audioEngine.switchPatternBank(block.patternIndex)}
                      className="opacity-80 hover:text-white text-[11px] mx-1"
                      title="Select this block's copied scene for editing"
                    >S{block.patternIndex + 1}</button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => audioEngine.duplicateSongBlockPlacement(placement.id)}
                      className="px-0.5 opacity-70 hover:opacity-100"
                      aria-label={`Repeat ${block.name} after this placement`}
                      title="Repeat once after this placement"
                    >↻</button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => audioEngine.deleteSongBlockPlacement(placement.id)}
                      className="px-0.5 opacity-70 hover:opacity-100"
                      aria-label={`Remove ${block.name} from song`}
                      title="Remove this placement"
                    >×</button>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/60"
                      onPointerDown={(e) => onBlockResizeDown(e, placement.id, placement.lengthBars)}
                      aria-label={`Resize ${block.name}`}
                    />
                  </div>
                );
              })}
              {audioEngine.blockPlacements.length === 0 && (
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-slate-600 pointer-events-none">
                  Create a block from the selected scene, or choose Pencil and click here to place a new one.
                </span>
              )}
            </div>
          </div>
          {tracks.map((t, laneIdx) => {
            const folder = folderOf(t);
            const folderStart = folderAtStart(laneIdx);
            const folderCount = folderStart ? tracks.filter((x) => x.folderId === folderStart.id).length : 0;
            const folderHeader = folderStart ? (
              <div className="flex" style={{ height: FOLDER_H }} data-testid="arr-folder-row" data-folder-id={folderStart.id}>
                <div
                  className="sticky left-0 z-20 flex-shrink-0 border-r border-b flex items-center gap-1 px-1.5"
                  style={{ width: HEADER_W, background: light ? '#d6d9dd' : '#202a3a', borderColor: P.headerBorder, color: light ? '#30363d' : '#dbeafe' }}
                  onPointerDown={() => onSelectTrack(t.id)}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => audioEngine.toggleTrackFolder(folderStart.id)}
                    className="w-4 h-5 grid place-items-center"
                    aria-label={`${folderStart.collapsed ? 'Expand' : 'Collapse'} ${folderStart.name}`}
                    title={folderStart.collapsed ? 'Expand folder' : 'Collapse folder'}
                  >
                    {folderStart.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      const name = window.prompt('Rename track folder', folderStart.name);
                      if (name !== null) audioEngine.renameTrackFolder(folderStart.id, name);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-bold text-[11px]"
                    title="Rename this track folder"
                    aria-label={`Rename ${folderStart.name}`}
                  >
                    {folderStart.name}
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => audioEngine.createTrackFolderClip(folderStart.id)}
                    disabled={!tracks.some((x) => x.folderId === folderStart.id && (x.arrangementClips || []).length > 0)}
                    className="px-1 text-[11px] font-bold text-cyan-300 hover:text-white disabled:opacity-30"
                    title="Create a folder region spanning the member clips; dragging it moves those clips together"
                    aria-label={`Create a grouped clip in ${folderStart.name}`}
                  >
                    +CLIP
                  </button>
                  <span className="text-[11px] opacity-70">{folderCount}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => audioEngine.deleteTrackFolder(folderStart.id)}
                    className="px-1 opacity-70 hover:opacity-100 hover:text-red-400"
                    title="Ungroup member tracks and remove this folder"
                    aria-label={`Remove folder ${folderStart.name}`}
                  >
                    ×
                  </button>
                </div>
                <div className="relative border-b" style={{ width: lanesW, background: light ? '#e5e7e9' : '#141c29', borderColor: P.laneBorder }} data-testid="arr-folder-lane">
                  {(folderStart.clips || []).map((grouped) => {
                    const moving = drag?.kind === 'folderClipMove' && drag.folderId === folderStart.id && drag.clipId === grouped.id ? drag : null;
                    const start = grouped.startBar + (moving?.deltaBars || 0);
                    return (
                      <div
                        key={grouped.id}
                        className="absolute top-[3px] bottom-[3px] z-[4] rounded border border-amber-400/80 bg-amber-500/30 text-amber-100 flex items-center px-1 text-[11px] font-bold truncate cursor-grab select-none"
                        style={{ left: start * barPx, width: Math.max(14, grouped.lengthBars * barPx) }}
                        onPointerDown={(e) => onFolderClipDown(e, folderStart.id, grouped.id, grouped.startBar, t.id)}
                        title="Drag to move every member clip fully inside this folder region"
                        data-testid="arr-folder-clip"
                      >
                        <span className="truncate flex-1">{grouped.name}</span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => audioEngine.deleteTrackFolderClip(folderStart.id, grouped.id)}
                          className="ml-1 opacity-70 hover:opacity-100"
                          title="Remove folder region; keep member clips"
                          aria-label={`Delete folder region ${grouped.name}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null;
            if (folder?.collapsed) return <React.Fragment key={t.id}>{folderHeader}</React.Fragment>;
            const isActive = t.id === activeTrack?.id;
            const active = syncTrackPatterns(t, audioEngine.activePatternIndex);
            const clips = [...(t.arrangementClips || [])].sort((a, b) => a.startBar - b.startBar);
            const paint = drag?.kind === 'paint' && drag.trackId === t.id ? drag : null;
            const lanes = autoOpen.has(t.id) ? auto.lanesFor(t.id) : [];
            const targets: AutoTarget[] = autoOpen.has(t.id) ? auto.targetsFor(t.id) : [];
            return (
              <React.Fragment key={t.id}>
              {folderHeader}
              <div className="flex" style={{ height: laneHOf(t) }} data-testid="arr-lane-row">
                <TrackHeader
                  audioEngine={audioEngine}
                  track={t}
                  width={HEADER_W}
                  height={laneHOf(t)}
                  active={isActive}
                  light={light}
                  palette={P}
                  autoShown={autoOpen.has(t.id)}
                  autoHasPoints={auto.lanesFor(t.id).some((l) => l.points.length > 0)}
                  collapsed={collapsed.has(t.id)}
                  onSelect={() => onSelectTrack(t.id)}
                  onToggleCollapse={() =>
                    setCollapsed((cur) => {
                      const n = new Set(cur);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                  onToggleAuto={() =>
                    setAutoOpen((cur) => {
                      const n = new Set(cur);
                      if (n.has(t.id)) n.delete(t.id);
                      else {
                        n.add(t.id);
                        if (!auto.lanesFor(t.id).length) auto.addLane({ kind: 'channel', channelId: t.deviceId, param: 'volume' }, auto.globalMode === 'off' ? 'read' : auto.globalMode, t.id);
                      }
                      return n;
                    })
                  }
                  meterRef={(el) => {
                    if (el) meterEls.current.set(t.deviceId, el);
                    else meterEls.current.delete(t.deviceId);
                  }}
                />

                {/* lane */}
                <div
                  className="relative border-b"
                  style={{ width: lanesW, backgroundImage: gridBg, backgroundColor: laneIdx % 2 ? P.laneB : P.laneA, borderColor: P.laneBorder }}
                  onPointerDown={(e) => onLaneDown(e, t)}
                  onDoubleClick={(e) => {
                    if (tool !== 'pointer' || e.target !== e.currentTarget || t.kind === 'audio') return;
                    const start = snapFloor(barAt(e.clientX));
                    if (paintKind === 'notes') seq.addNoteClip(t.id, start, 1);
                    else seq.addPatternClip(t.id, start, { patternId: t.activePatternId });
                  }}
                  data-testid="arr-lane"
                  data-track-id={t.id}
                >
                  {clips.map((c) => {
                    const pv = previewFor(t, c, laneIdx);
                    const k = keyOf({ trackId: t.id, clipId: c.id });
                    const isSel = selected.has(k);
                    const color = clipColor(t, c);
                    const w = Math.max(4, pv.len * barPx);
                    const top = rowTop(pv.lane) - rowTop(laneIdx) + 2;
                    const p = c.kind === 'notes' ? undefined : findPattern(t, c.patternId) || active;
                    const h = laneHOf(t) - 4;
                    const ink = c.muted ? '#94a3b8' : light ? P.clipInk : color;
                    const showBody = h > 24;
                    return (
                      <div
                        key={c.id}
                        data-clip-key={k}
                        data-testid="arr-clip"
                        className={`absolute rounded-sm overflow-hidden ${pv.ghost ? 'opacity-80' : ''} ${isSel ? `ring-2 ${light ? 'ring-[#f39a2b]' : 'ring-amber-300'} z-10` : 'z-[5]'}`}
                        style={{
                          left: pv.start * barPx,
                          width: w,
                          top,
                          height: h,
                          background: c.muted ? P.muted : P.clipBody(color),
                          border: `1px solid ${c.muted ? '#8a929b' : P.clipBorder(color)}`,
                          cursor: tool === 'eraser' ? 'not-allowed' : tool === 'razor' ? 'col-resize' : tool === 'slip' ? 'ew-resize' : 'grab',
                        }}
                        onPointerDown={(e) => onClipDown(e, t, c, laneIdx)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onClipDouble(t, c);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelected(new Set([k]));
                          setMenu({ x: e.clientX, y: e.clientY, ref: { trackId: t.id, clipId: c.id }, bar: barAt(e.clientX) });
                        }}
                        title={`${clipLabel(t, c)} · bar ${+(c.startBar + 1).toFixed(3)} · ${+c.lengthBars.toFixed(3)} bars${c.muted ? ' · muted' : ''}`}
                      >
                        {showBody && (
                          <div className="absolute left-0 right-0" style={{ top: light ? 14 : 0 }}>
                            {c.kind === 'audio' ? (
                              <AudioClipWave clip={c} width={w} height={h - 16} color={ink} bpm={audioEngine.bpm} spb={spb} />
                            ) : (
                              <ClipPreview clip={c} pattern={p} barPx={barPx} spb={spb} width={w} height={h - 16} color={ink} />
                            )}
                          </div>
                        )}
                        <div
                          className={`absolute left-0 right-0 ${light ? 'top-0' : 'bottom-0'} px-1 text-[11px] leading-[14px] font-bold truncate pointer-events-none`}
                          style={{ background: c.muted ? 'transparent' : P.clipBar(color), color: c.muted ? '#4b5563' : P.clipBarInk }}
                        >
                          {c.kind === 'notes' ? '♪ ' : c.kind === 'audio' ? '∿ ' : ''}
                          {clipLabel(t, c)}
                        </div>
                        <div className="absolute top-0 bottom-0 left-0 w-[5px] cursor-ew-resize hover:bg-white/20" />
                        <div className="absolute top-0 bottom-0 right-0 w-[5px] cursor-ew-resize hover:bg-white/20" />
                        <div className="absolute top-0 right-0 w-[11px] h-[11px] bg-white/25 hover:bg-white/60 cursor-e-resize flex items-center justify-center" title="Drag to loop (repeat the content)">
                          <Repeat className="w-2 h-2 text-black" />
                        </div>
                      </div>
                    );
                  })}
                  {paint && (
                    <div
                      className="absolute rounded-sm border-2 border-dashed border-emerald-300 bg-emerald-400/20 pointer-events-none z-20"
                      style={{ left: paint.startBar * barPx, width: (paint.endBar - paint.startBar) * barPx, top: 2, height: laneHOf(t) - 4 }}
                    />
                  )}
                </div>
              </div>
              {lanes.map((l) => (
                <AutomationLaneRow key={l.id} audioEngine={audioEngine} lane={l} headerW={HEADER_W} width={lanesW} height={AUTO_H} barPx={barPx} spb={spb} snap={snapId === '16th' ? 1 / spb : snap} targets={targets} light={light} />
              ))}
              {autoOpen.has(t.id) && (
                <div className="flex" style={{ height: ADD_H }}>
                  <div className="sticky left-0 z-20 flex-shrink-0 border-r border-b flex items-center px-1.5" style={{ width: HEADER_W, background: P.headerBg, borderColor: P.headerBorder }}>
                    <select
                      value=""
                      onChange={(e) => {
                        const tg = targets.find((x) => targetKey(x) === e.target.value);
                        if (tg) auto.addLane(tg, auto.globalMode === 'off' ? 'read' : auto.globalMode, t.id);
                      }}
                      className={`w-full text-[11px] rounded border ${light ? 'bg-white text-violet-700 border-[#a7adb4]' : 'bg-slate-900 text-violet-300 border-slate-700'}`}
                      aria-label="Add automation lane"
                    >
                      <option value="">+ automation lane…</option>
                      {targets.filter((x) => !auto.lane(x)).map((x) => (
                        <option key={targetKey(x)} value={targetKey(x)}>{auto.label(x)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="border-b" style={{ width: lanesW, background: P.addRow, borderColor: P.laneBorder }} />
                </div>
              )}
              </React.Fragment>
            );
          })}

          {/* loop shading over the lanes */}
          {mode === 'song_arrangement' && (
            <div
              className="absolute pointer-events-none z-[1]"
              style={{
                left: HEADER_W + loop.start * barPx,
                width: (loop.end - loop.start) * barPx,
                top: RULER_H,
                height: tempoH + rowTop(tracks.length),
                background: audioEngine.loopEnabled ? P.loopShade : 'transparent',
                borderLeft: audioEngine.loopEnabled ? '1px solid rgba(34,211,238,0.5)' : undefined,
                borderRight: audioEngine.loopEnabled ? '1px solid rgba(34,211,238,0.5)' : undefined,
              }}
            />
          )}

          {/* playhead */}
          <div
            ref={playheadRef}
            className={`absolute top-0 w-px pointer-events-none z-[15] ${light ? 'bg-[#e8861a]' : 'bg-amber-300 shadow-[0_0_6px_#fbbf24]'}`}
            style={{ left: HEADER_W, height: contentH }}
          />
        </div>

        {editingMarker && (
          <input
            autoFocus
            value={editingMarker.name}
            onChange={(e) => setEditingMarker({ ...editingMarker, name: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                seq.updateMarker(editingMarker.id, { name: editingMarker.name });
                setEditingMarker(null);
              } else if (e.key === 'Escape') setEditingMarker(null);
            }}
            onBlur={() => {
              seq.updateMarker(editingMarker.id, { name: editingMarker.name });
              setEditingMarker(null);
            }}
            className="fixed z-50 px-2 py-1 bg-slate-900 border border-pink-400 text-white text-xs rounded"
            style={{ left: (scrollerRef.current?.getBoundingClientRect().left || 0) + HEADER_W + 20, top: (scrollerRef.current?.getBoundingClientRect().top || 0) + 16 }}
            aria-label="Marker name"
          />
        )}
      </div>

      {menu && (
        <ClipMenu
          menu={menu}
          onClose={() => setMenu(null)}
          tracks={tracks}
          audioEngine={audioEngine}
          onEdit={(ref) => {
            const f = findClip(ref);
            if (f) onClipDouble(f.t, f.c);
          }}
          snapBar={(b) => snapRound(b)}
        />
      )}

      {openAudio && findClip(openAudio) && (
        <AudioClipPanel
          key={openAudio.clipId}
          audioEngine={audioEngine}
          track={findClip(openAudio)!.t}
          clip={findClip(openAudio)!.c}
          onClose={() => setOpenAudio(null)}
          onComped={(clipId) => setOpenAudio({ trackId: openAudio.trackId, clipId })}
        />
      )}

      {open && (
        <NoteClipEditor
          key={open.c.id}
          audioEngine={audioEngine}
          track={open.t}
          clip={open.c}
          onClose={() => setOpenClip(null)}
          onAudition={(n, v) => onAudition(open.t.id, n, v)}
        />
      )}
      {editingBlockId && audioEngine.songBlocks.find((block) => block.id === editingBlockId) && (
        <SongBlockEditor
          audioEngine={audioEngine}
          block={audioEngine.songBlocks.find((block) => block.id === editingBlockId)!}
          onClose={() => setEditingBlockId(null)}
        />
      )}
    </div>
  );
};

const ClipMenu: React.FC<{
  menu: Menu;
  tracks: SequencerTrack[];
  audioEngine: AudioEngine;
  onClose: () => void;
  onEdit: (ref: ClipRef) => void;
  snapBar: (b: number) => number;
}> = ({ menu, tracks, audioEngine, onClose, onEdit, snapBar }) => {
  const seq = audioEngine.sequencer;
  const t = tracks.find((x) => x.id === menu.ref.trackId);
  const c = t?.arrangementClips?.find((x) => x.id === menu.ref.clipId);
  if (!t || !c) return null;
  const item = (label: string, fn: () => void, testId?: string, danger = false) => (
    <button
      key={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        fn();
        onClose();
      }}
      className={`w-full text-left px-3 py-1 hover:bg-slate-800 ${danger ? 'text-red-300' : 'text-slate-200'}`}
      data-testid={testId}
    >
      {label}
    </button>
  );
  return (
    <div
      className="fixed z-50 min-w-[190px] py-1 rounded border border-cyan-500/60 bg-[#111826] shadow-2xl text-[11px] font-mono"
      style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 320) }}
      onPointerDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {item(c.kind === 'audio' ? 'Edit audio clip…' : c.kind === 'notes' ? 'Edit notes…' : 'Edit pattern in piano roll', () => onEdit(menu.ref))}
      {c.kind === 'audio' && (
        <>
          {item('Fade in 0.5 s / out 1 s', () => seq.updateAudioClip(t.id, c.id, { fadeIn: 0.5, fadeOut: 1 }))}
          {item('Remove fades', () => seq.updateAudioClip(t.id, c.id, { fadeIn: 0, fadeOut: 0 }))}
          {item('Normalize (-0.3 dB peak)', () => {
            const peak = clipSourcePeak(c, audioEngine.bpm, audioEngine.stepsPerBar);
            if (peak > 0) seq.updateAudioClip(t.id, c.id, { gainDb: Math.round((-0.3 - 20 * Math.log10(peak)) * 10) / 10 });
          })}
          {item(c.reverse ? 'Play forwards' : 'Reverse', () => seq.updateAudioClip(t.id, c.id, { reverse: !c.reverse }))}
          {item(c.invertPhase ? 'Restore Polarity (0°)' : 'Invert Polarity (180° Ø)', () => seq.updateAudioClip(t.id, c.id, { invertPhase: !c.invertPhase }))}
          {item('Normalize RMS (-18 dBFS)', () => {
            const a = audioStore.get(c.audioId);
            if (a) {
              const base = c.audioOffset ?? 0;
              const span = c.lengthBars * secPerBar(audioEngine.bpm, audioEngine.stepsPerBar) * audioClipRate(c, audioEngine.bpm);
              const rms = calculateClipRms(a.buffer, base, span);
              if (rms > 0.00001) {
                const targetGain = -18 - 20 * Math.log10(rms);
                seq.updateAudioClip(t.id, c.id, { gainDb: Math.max(-60, Math.min(24, Math.round(targetGain * 10) / 10)) });
              }
            }
          })}
          {item('Clean DC Offset', () => {
            const a = audioStore.get(c.audioId);
            // A new asset for this clip only: other clips that play the original keep their audio.
            if (a) seq.updateAudioClip(t.id, c.id, { audioId: audioStore.add(`${a.name} (DC removed)`, removeDcOffset(a.buffer)).id });
          })}
          {item('Transpose +1 semitone', () => seq.updateAudioClip(t.id, c.id, { pitch: (c.pitch ?? 0) + 1 }))}
          {item('Transpose -1 semitone', () => seq.updateAudioClip(t.id, c.id, { pitch: (c.pitch ?? 0) - 1 }))}
          {item(c.warp === 'repitch' ? 'Stop following tempo' : 'Follow project tempo', () =>
            seq.updateAudioClip(t.id, c.id, { warp: c.warp === 'repitch' ? 'off' : 'repitch', sourceBpm: c.sourceBpm ?? audioEngine.bpm })
          )}
          {item('Fit length to audio', () => {
            const a = audioStore.get(c.audioId);
            if (a) seq.fitAudioClip(t.id, c.id, a.buffer.duration);
          })}
        </>
      )}
      {item('Duplicate (Ctrl+D)', () => seq.duplicateClip(t.id, c.id), 'clip-menu-duplicate')}
      {item('Split here', () => seq.splitClip(t.id, c.id, snapBar(menu.bar)), 'clip-menu-split')}
      {item('Split at playhead', () => seq.splitClip(t.id, c.id, audioEngine.getPlayheadPosition() / audioEngine.stepsPerBar))}
      {item('Heal with Next Clip (Ctrl+J)', () => {
        const clips = (t.arrangementClips || []).slice().sort((a, b) => a.startBar - b.startBar);
        const idx = clips.findIndex((x) => x.id === c.id);
        if (idx !== -1 && idx < clips.length - 1) {
          seq.healClips(t.id, c.id, clips[idx + 1].id);
        }
      })}
      {item('Loop once more', () => seq.extendClipLoop(t.id, c.id), 'clip-menu-loop')}
      {item(c.muted ? 'Unmute (M)' : 'Mute (M)', () => seq.updateClip(t.id, c.id, { muted: !c.muted }))}
      {c.kind !== 'notes' && c.kind !== 'audio' && item('Convert to note clip', () => seq.convertClipToNotes(t.id, c.id), 'clip-menu-convert')}
      {c.kind === 'notes' && item('Copy notes to a new pattern', () => seq.clipToPattern(t.id, c.id))}
      {c.kind !== 'notes' && c.kind !== 'audio' && (t.patternList || []).length > 1 && (
        <div className="px-3 py-1 border-t border-slate-800">
          <div className="text-slate-500 text-[11px] mb-0.5">PLAY PATTERN</div>
          <select
            value={c.patternId}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              seq.updateClip(t.id, c.id, { patternId: e.target.value });
              onClose();
            }}
            className="w-full bg-slate-900 text-white rounded border border-slate-700"
          >
            {(t.patternList || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="border-t border-slate-800 my-0.5" />
      {item('Delete (Del)', () => seq.deleteClip(t.id, c.id), 'clip-menu-delete', true)}
    </div>
  );
};

