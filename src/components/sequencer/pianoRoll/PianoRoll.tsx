/**
 * Canvas piano roll: all 128 notes, any length, horizontal + vertical zoom, velocity lane.
 *
 * Only the visible part is drawn (the canvases are viewport-sized and sticky inside a scroller
 * whose spacer has the full content size), so 1000+ step patterns and long clips stay fast.
 * Edits happen on a working copy during a drag and are committed once on release (onChange).
 *
 * Gestures (draw tool): click empty = add note (+ chord stamp), drag while adding = length,
 * drag note = move (Alt = copy), drag right edge = resize, right-click / double-click = delete.
 * Select tool: click/Shift-click select, drag empty = marquee. Keys: Del, Ctrl+A/C/V/D,
 * arrows (Shift = octave), Q = quantize, Esc. Ctrl+wheel = zoom time, Alt+wheel = zoom rows.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SequencerNote } from '../../../audio/types.ts';
import { rollKey, type RollNote } from './rollAdapters.ts';
import { RollToolbar, type RollAction } from './RollToolbar.tsx';
import {
  flipPitch,
  humanizeNotes,
  invertKeys,
  isEditError,
  legatoNotes,
  rampVelocity,
  reverseNotes,
  rotateNotes,
  scaleLengths,
  selectAllKeys,
  setMuted,
  splitNotesAt,
  transposeNotes,
  type EditOutcome,
} from './rollEdits.ts';

export type RollTool = 'draw' | 'select' | 'erase' | 'mute' | 'split' | 'glue' | 'stretch' | 'zoom' | 'marquee';

export interface GhostNote {
  step: number;
  note: number;
  length: number;
  color: string;
}

export interface PianoRollProps {
  notes: RollNote[];
  /** Content length in grid units (the pattern / clip end). */
  length: number;
  unitsPerBar: number;
  unitsPerBeat: number;
  /** Snap in grid units; 0 = free. */
  snap: number;
  tool: RollTool;
  /** Called when the left toolbar picks a tool; the owner keeps the tool state. */
  onToolChange?: (tool: RollTool) => void;
  defaultLength: number;
  defaultVelocity?: number;
  /** Extra notes added with every drawn note (chord stamp), in semitones. */
  chordOffsets?: number[];
  /** Stored with every new note (e.g. ratchet / chance from the toolbar). */
  newNoteMeta?: Partial<SequencerNote>;
  /** Pitch classes (0..11) of the current scale; rows outside it are darker. */
  scalePcs?: number[] | null;
  rootPc?: number;
  ghostNotes?: GhostNote[];
  color?: string;
  zoomX: number;
  zoomY: number;
  onZoomChange?: (zoomX: number, zoomY: number) => void;
  onChange: (notes: RollNote[]) => void;
  /** Drag the end marker in the ruler (snaps to beats). */
  onLengthChange?: (length: number) => void;
  onAudition?: (note: number, velocity: number) => void;
  onSeek?: (unit: number) => void;
  /** Playhead in grid units, polled every frame (null = hidden). */
  getPlayhead?: () => number | null;
  /** Notes may be drawn past the end (the owner grows the content). */
  growable?: boolean;
  /** Pattern steps mute as a whole (all notes on a step). */
  muteWholeStep?: boolean;
  /** Row labels (e.g. drum names); default: C-notes only. */
  noteLabel?: (midi: number) => string | null;
  /** Initial vertical centre when the roll is empty. */
  centerNote?: number;
  className?: string;
}

const KEY_W = 46;
const RULER_H = 22;
const ROWS = 128;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export function midiName(m: number): string {
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

type Drag =
  | { kind: 'move'; startU: number; startRow: number; orig: RollNote[]; keys: Set<string>; copy: boolean; lastDn: number }
  | { kind: 'resize'; startU: number; orig: RollNote[]; keys: Set<string>; side: 'right' | 'left' }
  | { kind: 'draw'; startStep: number; created: RollNote[] }
  | { kind: 'marquee'; u0: number; r0: number; u1: number; r1: number; additive: Set<string> }
  | { kind: 'erase' }
  | { kind: 'velocity' }
  | { kind: 'length'; value: number };

interface Size {
  w: number;
  h: number;
}

export const PianoRoll: React.FC<PianoRollProps> = (props) => {
  const {
    notes,
    length,
    unitsPerBar,
    unitsPerBeat,
    snap,
    tool,
    onToolChange,
    defaultLength,
    defaultVelocity = 0.85,
    chordOffsets = [],
    newNoteMeta,
    scalePcs,
    rootPc = 0,
    ghostNotes,
    color = '#d6a358',
    onChange,
    onLengthChange,
    onAudition,
    onSeek,
    getPlayhead,
    growable = true,
    muteWholeStep = false,
    noteLabel,
    centerNote = 60,
    className = '',
  } = props;

  const [zx, setZx] = useState(props.zoomX);
  const [zy, setZy] = useState(props.zoomY);
  useEffect(() => setZx(props.zoomX), [props.zoomX]);
  useEffect(() => setZy(props.zoomY), [props.zoomY]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<HTMLCanvasElement | null>(null);
  const rulerRef = useRef<HTMLCanvasElement | null>(null);
  const velRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 600, h: 300 });
  const [velHeight] = useState<number>(38);
  const [velCollapsed, setVelCollapsed] = useState<boolean>(false);
  const curVelH = velCollapsed ? 18 : velHeight;

  const selRef = useRef<Set<string>>(new Set());
  const workRef = useRef<RollNote[] | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const hoverUnitRef = useRef<number>(0);
  const clipboardRef = useRef<RollNote[]>([]);
  const drawPending = useRef(false);
  // Selection size and the short status line are React state: they change on clicks and edits, not per frame.
  const [selCount, setSelCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const live = (): RollNote[] => workRef.current ?? notes;

  // Content extent: the end, notes past it and (when growable) two bars of room to keep drawing.
  const maxEnd = notes.reduce((m, n) => Math.max(m, n.step + n.length), 0);
  const contentUnits = Math.max(length, Math.ceil(maxEnd)) + (growable ? unitsPerBar * 2 : unitsPerBar * 0.25);
  const contentW = Math.max(size.w, contentUnits * zx);
  const contentH = ROWS * zy;

  const propsRef = useRef(props);
  propsRef.current = props;

  // ------------------------------------------------------------------ drawing

  const draw = useCallback(() => {
    drawPending.current = false;
    const sc = scrollerRef.current;
    const grid = gridRef.current;
    if (!sc || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    const sx = sc.scrollLeft;
    const sy = sc.scrollTop;
    const w = size.w;
    const h = size.h;
    const all = live();
    const sel = selRef.current;
    const drag = dragRef.current;

    // --- grid
    const g = grid.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const r0 = Math.max(0, Math.floor(sy / zy));
    const r1 = Math.min(ROWS - 1, Math.ceil((sy + h) / zy));
    for (let r = r0; r <= r1; r++) {
      const midi = 127 - r;
      const pc = midi % 12;
      const y = r * zy - sy;
      const inScale = !scalePcs || scalePcs.includes(pc);
      const isRoot = pc === rootPc && scalePcs;
      
      // Warm studio workstation row colors (bone / amber / dark wood)
      g.fillStyle = isRoot ? '#322416' : BLACK.has(pc) ? (inScale ? '#130f0b' : '#0b0806') : inScale ? '#1c1712' : '#100c08';
      g.fillRect(0, y, w, zy);
      
      // Horizontal row divider line
      g.fillStyle = pc === 0 ? '#765b38' : '#2b2218';
      g.fillRect(0, y + zy - 1, w, 1);
    }
    const u0 = Math.max(0, Math.floor(sx / zx));
    const u1 = Math.ceil((sx + w) / zx);
    const showUnits = zx >= 7;
    for (let u = u0; u <= u1; u++) {
      const x = Math.round(u * zx - sx) + 0.5;
      const isBar = u % unitsPerBar === 0;
      const isBeat = u % unitsPerBeat === 0;
      if (!isBar && !isBeat && !showUnits) continue;
      // Warm brass bar dividers & vintage beat lines
      g.fillStyle = isBar ? '#8d6d45' : isBeat ? '#523f28' : '#2f2418';
      g.fillRect(x - 0.5, 0, 1, h);
    }
    // past the end
    const endX = length * zx - sx;
    if (endX < w) {
      g.fillStyle = 'rgba(10, 8, 6, 0.55)';
      g.fillRect(Math.max(0, endX), 0, w - Math.max(0, endX), h);
      g.fillStyle = '#d69b50';
      g.fillRect(Math.round(endX), 0, 2, h);
    }
    // ghost notes
    if (ghostNotes) {
      for (const n of ghostNotes) {
        const x = n.step * zx - sx;
        const nw = Math.max(2, n.length * zx - 1);
        if (x > w || x + nw < 0) continue;
        const y = (127 - n.note) * zy - sy;
        if (y > h || y + zy < 0) continue;
        g.globalAlpha = 0.28;
        g.fillStyle = n.color || '#d69b50';
        g.fillRect(x, y + 1, nw, zy - 2);
        g.globalAlpha = 1;
      }
    }
    // notes
    g.font = `bold ${Math.max(8, Math.min(11, zy - 4))}px ui-monospace, monospace`;
    g.textBaseline = 'middle';
    for (const n of all) {
      const x = n.step * zx - sx;
      const nw = Math.max(4, n.length * zx - 1);
      if (x > w || x + nw < 0) continue;
      const y = (127 - n.note) * zy - sy;
      if (y > h || y + zy < 0) continue;
      const isSel = sel.has(rollKey(n));
      const vel = Math.max(0.1, Math.min(1, n.velocity));
      const a = 0.55 + 0.45 * vel;
      g.globalAlpha = n.muted ? 0.35 : a;

      // Note body gradient (amber / gold workstation tone)
      const grad = g.createLinearGradient(x, y, x, y + zy);
      if (isSel) {
        grad.addColorStop(0, '#fef0d2');
        grad.addColorStop(1, '#fad794');
      } else {
        grad.addColorStop(0, '#e5ad65');
        grad.addColorStop(1, '#b87c32');
      }
      g.fillStyle = n.muted ? '#605445' : grad;
      g.fillRect(x, y + 1, nw, zy - 2);
      g.globalAlpha = 1;

      // Velocity energy line inside note
      const vH = Math.max(2, (zy - 4) * vel);
      g.fillStyle = isSel ? 'rgba(214, 155, 80, 0.45)' : 'rgba(255, 255, 255, 0.18)';
      g.fillRect(x, y + zy - 1 - vH, nw, vH);

      // Left impact grip
      g.fillStyle = isSel ? '#d69b50' : '#ffe1a8';
      g.fillRect(x, y + 1, 3, zy - 2);

      // Note crisp border
      g.strokeStyle = isSel ? '#f59e0b' : '#221910';
      g.lineWidth = isSel ? 1.5 : 1;
      g.strokeRect(x + 0.5, y + 1.5, nw - 1, zy - 3);

      // Note label
      if (nw > 22 && zy >= 10) {
        g.fillStyle = isSel ? '#1a1309' : '#140e06';
        const label = noteLabel ? noteLabel(n.note) : midiName(n.note);
        g.fillText(label || midiName(n.note), x + 5, y + zy / 2);
      }
    }
    // marquee
    if (drag && drag.kind === 'marquee') {
      const ax = Math.min(drag.u0, drag.u1) * zx - sx;
      const bx = Math.max(drag.u0, drag.u1) * zx - sx;
      const ay = Math.min(drag.r0, drag.r1) * zy - sy;
      const by = (Math.max(drag.r0, drag.r1) + 1) * zy - sy;
      g.fillStyle = 'rgba(214, 163, 88, 0.2)';
      g.fillRect(ax, ay, bx - ax, by - ay);
      g.strokeStyle = '#f59e0b';
      g.lineWidth = 1.5;
      g.strokeRect(ax + 0.5, ay + 0.5, bx - ax, by - ay);
    }

    // --- keys (bone / ivory natural keys & ebony flats)
    const kc = keysRef.current?.getContext('2d');
    if (kc) {
      kc.setTransform(dpr, 0, 0, dpr, 0, 0);
      kc.clearRect(0, 0, KEY_W, h);
      kc.font = `bold ${Math.max(8, Math.min(10, zy - 3))}px ui-monospace, monospace`;
      kc.textBaseline = 'middle';
      for (let r = r0; r <= r1; r++) {
        const midi = 127 - r;
        const pc = midi % 12;
        const y = r * zy - sy;
        const black = BLACK.has(pc);
        
        // Physical key gradients
        if (black) {
          kc.fillStyle = '#1c1610';
          kc.fillRect(0, y, KEY_W * 0.64, zy);
          kc.fillStyle = '#2d2319';
          kc.fillRect(0, y, KEY_W * 0.64, 1.5);
          kc.fillStyle = '#120d09';
          kc.fillRect(KEY_W * 0.64, y, KEY_W * 0.36, zy);
        } else {
          const keyGrad = kc.createLinearGradient(0, y, KEY_W, y);
          keyGrad.addColorStop(0, '#f9f6f0');
          keyGrad.addColorStop(1, '#e8e0d0');
          kc.fillStyle = keyGrad;
          kc.fillRect(0, y, KEY_W, zy);
        }
        
        // Key dividers
        kc.fillStyle = '#6a5944';
        kc.fillRect(0, y + zy - 1, KEY_W, 1);
        
        const label = noteLabel ? noteLabel(midi) : pc === 0 ? midiName(midi) : null;
        if (label && zy >= 8) {
          kc.fillStyle = black ? '#e8dfce' : '#281e14';
          kc.fillText(label.slice(0, 9), 4, y + zy / 2);
        }
      }
    }

    // --- ruler (matching vintage cream/amber hardware)
    const rc = rulerRef.current?.getContext('2d');
    if (rc) {
      rc.setTransform(dpr, 0, 0, dpr, 0, 0);
      rc.clearRect(0, 0, w, RULER_H);
      rc.fillStyle = '#17130f';
      rc.fillRect(0, 0, w, RULER_H);
      rc.fillStyle = '#3a2d1d';
      rc.fillRect(0, RULER_H - 1, w, 1);
      rc.font = 'bold 10px ui-monospace, monospace';
      rc.textBaseline = 'top';
      const barPx = unitsPerBar * zx;
      const labelEvery = barPx >= 36 ? 1 : Math.ceil(36 / Math.max(1, barPx));
      for (let u = u0 - (u0 % unitsPerBeat); u <= u1; u += unitsPerBeat) {
        const x = Math.round(u * zx - sx) + 0.5;
        const isBar = u % unitsPerBar === 0;
        rc.fillStyle = isBar ? '#d69b50' : '#634d31';
        rc.fillRect(x - 0.5, isBar ? 0 : RULER_H - 7, 1, isBar ? RULER_H : 7);
        const bar = u / unitsPerBar;
        if (isBar && bar % labelEvery === 0) {
          rc.fillStyle = '#f0e6d5';
          rc.fillText(String(bar + 1), x + 4, 3);
        }
      }
      const len = drag && drag.kind === 'length' ? drag.value : length;
      const ex = len * zx - sx;
      rc.fillStyle = '#f59e0b';
      rc.beginPath();
      rc.moveTo(ex - 6, 0);
      rc.lineTo(ex + 6, 0);
      rc.lineTo(ex, 10);
      rc.closePath();
      rc.fill();
      rc.fillRect(ex - 1, 0, 2, RULER_H);
    }

    // --- velocity lane
    const vc = velRef.current?.getContext('2d');
    if (vc) {
      vc.setTransform(dpr, 0, 0, dpr, 0, 0);
      vc.clearRect(0, 0, w, curVelH);
      vc.fillStyle = '#130f0c';
      vc.fillRect(0, 0, w, curVelH);
      if (!velCollapsed) {
        vc.fillStyle = '#3a2d1e';
        vc.fillRect(0, curVelH / 2, w, 1);
        for (const n of all) {
          const x = n.step * zx - sx;
          if (x < -4 || x > w + 4) continue;
          const vh = Math.max(3, n.velocity * (curVelH - 8));
          const isSel = sel.has(rollKey(n));
          vc.fillStyle = n.muted ? '#605341' : isSel ? '#fde5b9' : '#d69b50';
          const stalkW = Math.max(2, Math.min(6, zx * 0.5));
          vc.fillRect(x, curVelH - vh, stalkW, vh);
          vc.fillStyle = isSel ? '#f59e0b' : '#ffc773';
          vc.fillRect(x - 1.5, curVelH - vh, Math.max(5, stalkW + 3), 3);
        }
      } else {
        // Collapsed mode: mini indicator dots to save maximum vertical area for notes
        for (const n of all) {
          const x = n.step * zx - sx;
          if (x < -4 || x > w + 4) continue;
          const isSel = sel.has(rollKey(n));
          vc.fillStyle = isSel ? '#f59e0b' : '#d69b50';
          vc.fillRect(x, Math.max(3, Math.min(curVelH - 4, Math.round(curVelH * (1 - n.velocity * 0.7)))), 3, 3);
        }
      }
    }
  }, [notes, length, unitsPerBar, unitsPerBeat, zx, zy, size, scalePcs, rootPc, ghostNotes, color, noteLabel, curVelH, velCollapsed]);

  const requestDraw = useCallback(() => {
    if (drawPending.current) return;
    drawPending.current = true;
    requestAnimationFrame(draw);
  }, [draw]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  // Viewport size → canvas sizes (only when it changes)
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(50, sc.clientWidth);
      const h = Math.max(50, sc.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  // Start centred on the notes (or C4)
  const didCenter = useRef(false);
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    // Wait until the grid is height-constrained (scrollable), otherwise scrollTop can't move.
    if (!sc || didCenter.current || sc.scrollHeight <= sc.clientHeight + 1) return;
    didCenter.current = true;
    const ns = notes.map((n) => n.note);
    const mid = ns.length ? (Math.min(...ns) + Math.max(...ns)) / 2 : centerNote;
    sc.scrollTop = Math.max(0, (127 - mid + 0.5) * zy - sc.clientHeight / 2);
  }, [size.h, size.w, notes, zy, centerNote]);

  // Playhead (DOM transform in rAF; no React state per frame)
  useEffect(() => {
    if (!getPlayhead) return;
    let raf = 0;
    const tick = () => {
      const el = playheadRef.current;
      if (el) {
        const p = getPlayhead();
        if (p === null || !Number.isFinite(p)) el.style.display = 'none';
        else {
          el.style.display = 'block';
          el.style.transform = `translateX(${p * zx}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getPlayhead, zx]);

  // Wheel zoom (native listener: React's wheel handler is passive)
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;
      e.preventDefault();
      const rect = sc.getBoundingClientRect();
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      if (e.altKey) {
        const py = e.clientY - rect.top;
        const row = (sc.scrollTop + py) / zy;
        const nz = Math.max(6, Math.min(40, zy * f));
        setZy(nz);
        propsRef.current.onZoomChange?.(zx, nz);
        requestAnimationFrame(() => (sc.scrollTop = row * nz - py));
      } else {
        const px = e.clientX - rect.left;
        const unit = (sc.scrollLeft + px) / zx;
        const nz = Math.max(2, Math.min(120, zx * f));
        setZx(nz);
        propsRef.current.onZoomChange?.(nz, zy);
        requestAnimationFrame(() => (sc.scrollLeft = unit * nz - px));
      }
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, [zx, zy]);

  // ------------------------------------------------------------------ helpers

  const snapRound = (u: number) => (snap > 0 ? Math.round(u / snap) * snap : u);
  const snapFloor = (u: number) => (snap > 0 ? Math.floor(u / snap + 1e-6) * snap : u);
  const minLen = snap > 0 ? snap : 0.1;
  const pointIn = (e: { clientX: number; clientY: number }) => {
    const sc = scrollerRef.current!;
    const rect = sc.getBoundingClientRect();
    const x = e.clientX - rect.left + sc.scrollLeft;
    const y = e.clientY - rect.top + sc.scrollTop;
    return { u: Math.max(0, x / zx), row: Math.max(0, Math.min(ROWS - 1, Math.floor(y / zy))), x, y };
  };
  const hitNote = (u: number, row: number, list: RollNote[]): { n: RollNote; edge: 'left' | 'right' | null } | null => {
    const midi = 127 - row;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.note !== midi) continue;
      if (u >= n.step && u < n.step + Math.max(n.length, 3 / zx)) {
        const px = (u - n.step) * zx;
        const wpx = n.length * zx;
        const edge = wpx > 12 && wpx - px < 6 ? 'right' : wpx > 16 && px < 4 ? 'left' : null;
        return { n, edge };
      }
    }
    return null;
  };
  const commit = (next: RollNote[], select?: RollNote[]) => {
    workRef.current = null;
    if (select) selRef.current = new Set(select.map(rollKey));
    onChange(next);
    requestDraw();
  };
  const removeKeys = (list: RollNote[], keys: Set<string>) => list.filter((n) => !keys.has(rollKey(n)));
  const withoutCollisions = (list: RollNote[], added: RollNote[]) => {
    const keys = new Set(added.map(rollKey));
    return [...list.filter((n) => !keys.has(rollKey(n))), ...added];
  };
  const autoScroll = (clientX: number) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const rect = sc.getBoundingClientRect();
    if (clientX > rect.right - 28) sc.scrollLeft += 14;
    else if (clientX < rect.left + 28) sc.scrollLeft -= 14;
  };

  // ------------------------------------------------------------------ toolbar and key edits

  const syncSel = () => setSelCount(selRef.current.size);
  const flash = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2400);
  };
  const applyEdit = (outcome: EditOutcome) => {
    if (isEditError(outcome)) {
      flash(outcome.error);
      return;
    }
    commit(outcome.notes, outcome.touched);
    syncSel();
  };
  const deleteSelection = () => {
    const sel = selRef.current;
    if (!notes.some((n) => sel.has(rollKey(n)))) return;
    commit(removeKeys(notes, sel), []);
    syncSel();
  };
  const duplicateSelection = () => {
    const sel = selRef.current;
    const selected = notes.filter((n) => sel.has(rollKey(n)));
    if (!selected.length) return;
    const a = Math.min(...selected.map((n) => n.step));
    const b = Math.max(...selected.map((n) => n.step + n.length));
    const span = Math.max(unitsPerBeat, Math.ceil((b - a) / unitsPerBeat - 1e-6) * unitsPerBeat);
    const dup = selected.map((n) => ({ ...n, step: n.step + span }));
    commit(withoutCollisions(notes, dup), dup);
    syncSel();
  };
  const runAction = (action: RollAction) => {
    const sel = selRef.current;
    const gridStep = snap > 0 ? snap : 1;
    const minLength = snap > 0 ? snap : 0.25;
    switch (action) {
      case 'selectAll':
        selRef.current = selectAllKeys(notes);
        requestDraw();
        syncSel();
        return;
      case 'invertSelection':
        selRef.current = invertKeys(notes, sel);
        requestDraw();
        syncSel();
        return;
      case 'reverse':
        return applyEdit(reverseNotes(notes, sel));
      case 'flipPitch':
        return applyEdit(flipPitch(notes, sel));
      case 'rotateLeft':
        return applyEdit(rotateNotes(notes, sel, -gridStep, length));
      case 'rotateRight':
        return applyEdit(rotateNotes(notes, sel, gridStep, length));
      case 'transposeUp':
        return applyEdit(transposeNotes(notes, sel, 1));
      case 'transposeDown':
        return applyEdit(transposeNotes(notes, sel, -1));
      case 'octaveUp':
        return applyEdit(transposeNotes(notes, sel, 12));
      case 'octaveDown':
        return applyEdit(transposeNotes(notes, sel, -12));
      case 'double':
        return applyEdit(scaleLengths(notes, sel, 2, minLength));
      case 'halve':
        return applyEdit(scaleLengths(notes, sel, 0.5, minLength));
      case 'legato':
        return applyEdit(legatoNotes(notes, sel));
      case 'humanize':
        return applyEdit(humanizeNotes(notes, sel, gridStep / 2, 0.06));
      case 'crescendo':
        return applyEdit(rampVelocity(notes, sel, 0.45, 1));
      case 'splitAtPlayhead':
        return applyEdit(splitNotesAt(notes, sel, getPlayhead?.() ?? hoverUnitRef.current));
      case 'toggleMute': {
        const targets = sel.size ? notes.filter((n) => sel.has(rollKey(n))) : notes;
        const allMuted = targets.length > 0 && targets.every((n) => n.muted);
        return applyEdit(setMuted(notes, sel, !allMuted));
      }
      case 'duplicate':
        return duplicateSelection();
      case 'delete':
        return deleteSelection();
    }
  };
  const snapLabel = snap <= 0 ? 'snap off' : snap === 1 ? '1/16' : snap === 0.5 ? '1/32' : snap === 2 ? '1/8' : snap === 4 ? '1/4' : `${snap} steps`;

  // ------------------------------------------------------------------ grid pointer

  const onGridDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { u, row } = pointIn(e);
    const list = notes.slice();
    const hit = hitNote(u, row, list);
    const sel = selRef.current;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    scrollerRef.current?.focus({ preventScroll: true });
    const right = e.button === 2;

    if (tool === 'zoom') {
      const f = e.altKey || right ? 1 / 1.5 : 1.5;
      const nz = Math.max(2, Math.min(120, zx * f));
      setZx(nz);
      propsRef.current.onZoomChange?.(nz, zy);
      return;
    }
    if (tool === 'erase' || (right && (tool === 'draw' || tool === 'select'))) {
      dragRef.current = { kind: 'erase' };
      workRef.current = hit ? removeKeys(list, new Set([rollKey(hit.n)])) : list;
      requestDraw();
      return;
    }
    if (tool === 'mute') {
      if (!hit) return;
      const target = muteWholeStep ? list.filter((n) => Math.round(n.step) === Math.round(hit.n.step)) : [hit.n];
      const flag = !hit.n.muted;
      const keys = new Set(target.map(rollKey));
      commit(list.map((n) => (keys.has(rollKey(n)) ? { ...n, muted: flag || undefined } : n)));
      return;
    }
    if (tool === 'split') {
      if (!hit) return;
      const at = snapRound(u);
      if (at <= hit.n.step + 1e-6 || at >= hit.n.step + hit.n.length - 1e-6) return;
      const left = { ...hit.n, length: at - hit.n.step };
      const rightN = { ...hit.n, step: at, length: hit.n.step + hit.n.length - at };
      commit([...removeKeys(list, new Set([rollKey(hit.n)])), left, rightN], [left, rightN]);
      return;
    }
    if (tool === 'glue') {
      if (!hit) return;
      const end = hit.n.step + hit.n.length;
      const next = list
        .filter((n) => n.note === hit.n.note && n.step >= end - 1e-6)
        .sort((a, b) => a.step - b.step)[0];
      if (!next) return;
      const joined = { ...hit.n, length: next.step + next.length - hit.n.step };
      commit([...removeKeys(list, new Set([rollKey(hit.n), rollKey(next)])), joined], [joined]);
      return;
    }

    if (hit) {
      const key = rollKey(hit.n);
      if (e.shiftKey && (tool === 'select' || tool === 'marquee')) {
        if (sel.has(key)) sel.delete(key);
        else sel.add(key);
        requestDraw();
        return;
      }
      if (!sel.has(key)) selRef.current = new Set([key]);
      const keys = selRef.current;
      const orig = list.filter((n) => keys.has(rollKey(n)));
      if (hit.edge || tool === 'stretch') {
        dragRef.current = { kind: 'resize', startU: u, orig, keys: new Set(keys), side: hit.edge === 'left' ? 'left' : 'right' };
      } else {
        dragRef.current = { kind: 'move', startU: u, startRow: row, orig, keys: new Set(keys), copy: e.altKey, lastDn: 0 };
        onAudition?.(hit.n.note, hit.n.velocity);
      }
      workRef.current = list;
      requestDraw();
      return;
    }

    if (tool === 'select' || tool === 'marquee') {
      dragRef.current = { kind: 'marquee', u0: u, r0: row, u1: u, r1: row, additive: e.shiftKey ? new Set(sel) : new Set() };
      if (!e.shiftKey) selRef.current = new Set();
      requestDraw();
      return;
    }

    // draw: new note (+ chord stamp)
    const step = Math.max(0, snapFloor(u));
    if (!growable && step >= length) return;
    const base = 127 - row;
    const created = [0, ...chordOffsets]
      .map((o) => base + o)
      .filter((m) => m >= 0 && m <= 127)
      .map((m) => ({ step, note: m, length: Math.max(minLen, defaultLength), velocity: defaultVelocity, meta: newNoteMeta ? { ...newNoteMeta } : undefined }));
    workRef.current = withoutCollisions(list, created);
    selRef.current = new Set(created.map(rollKey));
    dragRef.current = { kind: 'draw', startStep: step, created };
    onAudition?.(base, defaultVelocity);
    requestDraw();
  };

  const onGridMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { u, row } = pointIn(e);
    hoverUnitRef.current = u;
    const drag = dragRef.current;
    const canvas = e.currentTarget;
    if (!drag) {
      const hit = hitNote(u, row, notes);
      canvas.style.cursor =
        tool === 'erase' ? 'not-allowed' : hit?.edge || (hit && tool === 'stretch') ? 'ew-resize' : hit ? 'grab' : tool === 'zoom' ? 'zoom-in' : 'crosshair';
      return;
    }
    autoScroll(e.clientX);
    const base = notes;
    if (drag.kind === 'move') {
      const du = snapRound(u - drag.startU);
      const dn = drag.startRow - row;
      const moved = drag.orig.map((n) => ({
        ...n,
        step: Math.max(0, n.step + du),
        note: Math.max(0, Math.min(127, n.note + dn)),
      }));
      const kept = drag.copy ? base : removeKeys(base, drag.keys);
      workRef.current = withoutCollisions(kept, growable ? moved : moved.filter((n) => n.step < length));
      selRef.current = new Set(moved.map(rollKey));
      if (dn !== drag.lastDn && moved[0]) {
        drag.lastDn = dn;
        onAudition?.(moved[0].note, moved[0].velocity);
      }
    } else if (drag.kind === 'resize') {
      const du = snapRound(u - drag.startU);
      const resized = drag.orig.map((n) => {
        if (drag.side === 'right') return { ...n, length: Math.max(minLen, n.length + du) };
        const end = n.step + n.length;
        const st = Math.max(0, Math.min(end - minLen, n.step + du));
        return { ...n, step: st, length: end - st };
      });
      workRef.current = withoutCollisions(removeKeys(base, drag.keys), resized);
      selRef.current = new Set(resized.map(rollKey));
    } else if (drag.kind === 'draw') {
      const endU = Math.max(drag.startStep + minLen, snap > 0 ? Math.ceil(u / snap - 1e-6) * snap : u);
      const len = Math.max(minLen, Math.max(defaultLength, endU - drag.startStep));
      const created = drag.created.map((n) => ({ ...n, length: u > drag.startStep + defaultLength ? endU - drag.startStep : len }));
      workRef.current = withoutCollisions(base, created);
    } else if (drag.kind === 'marquee') {
      drag.u1 = u;
      drag.r1 = row;
      const ua = Math.min(drag.u0, drag.u1);
      const ub = Math.max(drag.u0, drag.u1);
      const ra = Math.min(drag.r0, drag.r1);
      const rb = Math.max(drag.r0, drag.r1);
      const next = new Set(drag.additive);
      for (const n of base) {
        const r = 127 - n.note;
        if (r >= ra && r <= rb && n.step < ub && n.step + n.length > ua) next.add(rollKey(n));
      }
      selRef.current = next;
    } else if (drag.kind === 'erase') {
      const cur = workRef.current ?? base;
      const hit = hitNote(u, row, cur);
      if (hit) workRef.current = removeKeys(cur, new Set([rollKey(hit.n)]));
    }
    requestDraw();
  };

  const onGridUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    syncSel();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture already released
    }
    if (!drag) return;
    if (drag.kind === 'marquee') {
      requestDraw();
      return;
    }
    const work = workRef.current;
    if (!work) return;
    if (drag.kind === 'erase' && work.length === notes.length) {
      workRef.current = null;
      return;
    }
    commit(work);
  };

  const onGridDouble = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'draw' && tool !== 'select') return;
    const { u, row } = pointIn(e);
    const hit = hitNote(u, row, notes);
    if (hit) commit(removeKeys(notes, new Set([rollKey(hit.n)])));
  };

  // ------------------------------------------------------------------ keys

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const sel = selRef.current;
    const selected = notes.filter((n) => sel.has(rollKey(n)));
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelection();
    } else if (mod && e.key.toLowerCase() === 'a') {
      selRef.current = new Set(notes.map(rollKey));
      requestDraw();
    } else if (mod && e.key.toLowerCase() === 'c') {
      clipboardRef.current = selected.map((n) => ({ ...n }));
    } else if (mod && e.key.toLowerCase() === 'v') {
      const clip = clipboardRef.current;
      if (clip.length) {
        const minStep = Math.min(...clip.map((n) => n.step));
        const at = Math.max(0, snapFloor(hoverUnitRef.current));
        const pasted = clip.map((n) => ({ ...n, step: n.step - minStep + at }));
        commit(withoutCollisions(notes, pasted), pasted);
      }
    } else if (mod && e.key.toLowerCase() === 'd') {
      duplicateSelection();
    } else if (mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      runAction(e.key === 'ArrowLeft' ? 'rotateLeft' : 'rotateRight');
    } else if (mod && e.key.toLowerCase() === 'i') {
      runAction('invertSelection');
    } else if (mod && e.key.toLowerCase() === 'm') {
      runAction('toggleMute');
    } else if (e.shiftKey && !mod && e.key.toLowerCase() === 'r') {
      runAction('reverse');
    } else if (e.shiftKey && !mod && e.key.toLowerCase() === 'f') {
      runAction('flipPitch');
    } else if (e.shiftKey && !mod && e.key.toLowerCase() === 'h') {
      runAction('humanize');
    } else if (e.shiftKey && !mod && e.key.toLowerCase() === 'l') {
      runAction('legato');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (selected.length) {
        const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1);
        const moved = selected.map((n) => ({ ...n, note: Math.max(0, Math.min(127, n.note + d)) }));
        commit(withoutCollisions(removeKeys(notes, sel), moved), moved);
        onAudition?.(moved[0].note, moved[0].velocity);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (selected.length) {
        const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? unitsPerBar : snap > 0 ? snap : 1);
        const moved = selected.map((n) => ({ ...n, step: Math.max(0, n.step + d) }));
        commit(withoutCollisions(removeKeys(notes, sel), moved), moved);
      }
    } else if (e.key.toLowerCase() === 'q' && !mod) {
      const target = selected.length ? selected : notes;
      const keys = new Set(target.map(rollKey));
      const q = target.map((n) => ({ ...n, step: Math.max(0, snapRound(n.step)) }));
      commit(withoutCollisions(removeKeys(notes, keys), q), selected.length ? q : []);
    } else if (e.key === 'Escape') {
      selRef.current = new Set();
      requestDraw();
      syncSel();
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      syncSel();
    }
  };

  // ------------------------------------------------------------------ keys / ruler / velocity pointer

  const onKeysDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top + sc.scrollTop) / zy);
    const midi = 127 - row;
    const vel = Math.max(0.2, Math.min(1, (e.clientX - rect.left) / KEY_W));
    if (midi >= 0 && midi <= 127) onAudition?.(midi, vel);
  };

  const onRulerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + sc.scrollLeft;
    if (onLengthChange && Math.abs(x - length * zx) < 8) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { kind: 'length', value: length };
      return;
    }
    onSeek?.(Math.max(0, snapFloor(x / zx)));
  };
  const onRulerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const sc = scrollerRef.current;
    if (!sc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + sc.scrollLeft;
    e.currentTarget.style.cursor = onLengthChange && Math.abs(x - length * zx) < 8 ? 'ew-resize' : 'pointer';
    if (!drag || drag.kind !== 'length') return;
    drag.value = Math.max(unitsPerBeat, Math.round(x / zx / unitsPerBeat) * unitsPerBeat);
    autoScroll(e.clientX);
    requestDraw();
  };
  const onRulerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'length') return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    if (drag.value !== length) onLengthChange?.(drag.value);
    requestDraw();
  };

  const velocityAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left + sc.scrollLeft) / zx;
    const v = Math.max(0.02, Math.min(1, 1 - (e.clientY - rect.top - 2) / Math.max(8, curVelH - 4)));
    const sel = selRef.current;
    const cur = workRef.current ?? notes;
    const tol = Math.max(0.5, 5 / zx);
    workRef.current = cur.map((n) =>
      Math.abs(n.step - u) <= tol && (sel.size === 0 || sel.has(rollKey(n))) ? { ...n, velocity: v } : n
    );
    requestDraw();
  };
  const onVelDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'velocity' };
    velocityAt(e);
  };
  const onVelMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.kind === 'velocity') velocityAt(e);
  };
  const onVelUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.kind !== 'velocity') return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    if (workRef.current) commit(workRef.current);
  };

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canvasStyle = (w: number, h: number): React.CSSProperties => ({ width: w, height: h, display: 'block' });

  return (
    <div className={`unbox-piano-roll relative flex min-h-0 bg-[#14100c] select-none ${className}`} data-testid="piano-roll">
      <RollToolbar
        tool={tool}
        onTool={(next) => onToolChange?.(next)}
        onAction={runAction}
        selectedCount={selCount}
        snapLabel={snapLabel}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ruler */}
      <div className="flex flex-shrink-0 border-b border-[#59452e]" style={{ height: RULER_H }}>
        <div className="flex-shrink-0 bg-[#1c1611] border-r border-[#59452e] text-[11px] text-[#d6b074] font-mono font-bold flex items-center justify-center tracking-wider" style={{ width: KEY_W }}>
          BAR
        </div>
        <canvas
          ref={rulerRef}
          width={size.w * dpr}
          height={RULER_H * dpr}
          style={canvasStyle(size.w, RULER_H)}
          onPointerDown={onRulerDown}
          onPointerMove={onRulerMove}
          onPointerUp={onRulerUp}
          title="Click to move the playhead · drag the orange end marker to change the length"
        />
      </div>
      {/* keys + grid */}
      <div className="flex flex-1 min-h-0">
        <canvas
          ref={keysRef}
          width={KEY_W * dpr}
          height={size.h * dpr}
          style={{ ...canvasStyle(KEY_W, size.h), flexShrink: 0, cursor: 'pointer' }}
          onPointerDown={onKeysDown}
          title="Click a key to audition (further right = louder)"
        />
        <div
          ref={scrollerRef}
          className="flex-1 min-w-0 overflow-auto outline-none relative"
          tabIndex={0}
          onScroll={requestDraw}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Piano roll note grid"
        >
          <div style={{ width: contentW, height: contentH, position: 'relative' }}>
            <canvas
              ref={gridRef}
              width={size.w * dpr}
              height={size.h * dpr}
              style={{ ...canvasStyle(size.w, size.h), position: 'sticky', left: 0, top: 0 }}
              onPointerDown={onGridDown}
              onPointerMove={onGridMove}
              onPointerUp={onGridUp}
              onPointerCancel={onGridUp}
              onDoubleClick={onGridDouble}
              data-testid="piano-roll-grid"
            />
            {getPlayhead && (
              <div
                ref={playheadRef}
                className="absolute top-0 left-0 w-[1.5px] bg-amber-400 pointer-events-none shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                style={{ height: contentH, display: 'none' }}
              />
            )}
          </div>
        </div>
      </div>
      {/* velocity lane with collapsible toggle */}
      <div className="flex flex-shrink-0 border-t border-[#59452e]" style={{ height: curVelH }}>
        <button
          type="button"
          onClick={() => setVelCollapsed((c) => !c)}
          className="flex-shrink-0 bg-[#1c1611] hover:bg-[#282017] border-r border-[#59452e] text-[11px] text-[#d6b074] hover:text-[#ffc87a] font-mono font-bold flex items-center justify-center gap-1 tracking-wider transition-colors cursor-pointer"
          style={{ width: KEY_W }}
          title={velCollapsed ? "Expand Velocity Lane" : "Collapse Velocity Lane (give more area to Piano Roll)"}
        >
          <span>VEL</span>
          <span className="text-[11px] text-amber-500">{velCollapsed ? '▲' : '▼'}</span>
        </button>
        <canvas
          ref={velRef}
          width={size.w * dpr}
          height={curVelH * dpr}
          style={{ ...canvasStyle(size.w, curVelH), cursor: velCollapsed ? 'pointer' : 'ns-resize' }}
          onPointerDown={velCollapsed ? () => setVelCollapsed(false) : onVelDown}
          onPointerMove={velCollapsed ? undefined : onVelMove}
          onPointerUp={velCollapsed ? undefined : onVelUp}
          title={velCollapsed ? "Click to expand velocity lane" : "Drag to set velocity (selected notes only when a selection exists)"}
        />
      </div>
      </div>
      {notice && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-[30px] z-20 -translate-x-1/2 rounded border border-[#d69b50]/60 bg-[#1c1611]/95 px-3 py-1 font-label text-[12px] font-bold text-[#ffe1a8] shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
};
