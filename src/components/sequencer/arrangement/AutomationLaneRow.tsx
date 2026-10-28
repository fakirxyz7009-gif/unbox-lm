/**
 * One automation lane under a track in the arrangement (or the tempo lane).
 * Click empty space = add a point · drag a point = move (Shift = value only) · double-click or
 * Alt-click a point = delete · Alt-drag between two points = bend the curve · right-click a point =
 * toggle step (hold) · pencil drag (Ctrl) = draw freehand.
 */
import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import { type AutoLane, type AutoMode, type AutoPoint, type AutoTarget, denorm, sortPoints, targetKey, valueAt } from '../../../audio/automation/model.ts';

interface Props {
  audioEngine: AudioEngine;
  lane: AutoLane;
  headerW: number;
  width: number;
  height: number;
  barPx: number;
  spb: number;
  /** Snap in bars (0 = free). */
  snap: number;
  /** Targets the header select may switch to (same track). */
  targets: AutoTarget[];
  /** Light Workstation sequencer palette. */
  light?: boolean;
}

const MODES: AutoMode[] = ['read', 'touch', 'latch', 'write', 'off'];
const MODE_COLOR: Record<AutoMode, string> = { read: '#22c55e', touch: '#eab308', latch: '#f97316', write: '#ef4444', off: '#64748b' };

export function AutomationLaneRow({ audioEngine, lane, headerW, width, height, barPx, spb, snap, targets, light }: Props) {
  const auto = audioEngine.automation;
  const r = auto.range(lane.target);
  const [drag, setDrag] = useState<{ idx: number; shift: boolean } | { curve: number; startY: number; base: number } | { draw: true } | null>(null);
  const [preview, setPreview] = useState<AutoPoint[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = preview ?? lane.points;
  const pad = 3;
  const H = height - 2 * pad;
  const x = (pos: number) => (pos / spb) * barPx;
  const y = (v: number) => pad + (1 - v) * H;
  const toPos = (px: number) => {
    const bar = Math.max(0, px / barPx);
    return (snap > 0 ? Math.round(bar / snap) * snap : bar) * spb;
  };
  const toVal = (py: number) => Math.max(0, Math.min(1, 1 - (py - pad) / H));
  const local = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };
  const hitPoint = (px: number, py: number) => pts.findIndex((p) => Math.abs(x(p.pos) - px) < 6 && Math.abs(y(p.value) - py) < 6);
  const commit = (next: AutoPoint[]) => {
    auto.setPoints(lane.id, next);
    setPreview(null);
  };

  // path: points + flat extension to both ends, curve segments sampled
  let d = '';
  if (pts.length) {
    d = `M 0 ${y(pts[0].value)} L ${x(pts[0].pos)} ${y(pts[0].value)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.hold) d += ` L ${x(b.pos)} ${y(a.value)} L ${x(b.pos)} ${y(b.value)}`;
      else if (a.curve) {
        for (let k = 1; k <= 12; k++) {
          const pos = a.pos + ((b.pos - a.pos) * k) / 12;
          d += ` L ${x(pos)} ${y(valueAt(pts, pos)!)}`;
        }
      } else d += ` L ${x(b.pos)} ${y(b.value)}`;
    }
    d += ` L ${width} ${y(pts[pts.length - 1].value)}`;
  }
  const color = MODE_COLOR[lane.mode];
  const fmt = (n: number) => {
    const v = denorm(r, n);
    return r.toggle ? (v ? 'on' : 'off') : `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}${r.unit ? ` ${r.unit}` : ''}`;
  };

  return (
    <div className="flex" style={{ height }} data-testid="auto-lane">
      <div className={`sticky left-0 z-20 flex-shrink-0 border-r border-b flex flex-col justify-center gap-0.5 px-1.5 ${light ? 'border-[#b8bdc3] bg-[#dfe2e6]' : 'border-slate-800 bg-[#0c1119]'}`} style={{ width: headerW }}>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-3 rounded" style={{ background: color }} />
          <select
            value={targetKey(lane.target)}
            onChange={(e) => {
              const t = targets.find((x) => targetKey(x) === e.target.value);
              if (!t) return;
              auto.removeLane(lane.id);
              auto.addLane(t, lane.mode, lane.trackId);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`flex-1 min-w-0 text-[11px] rounded border ${light ? 'bg-white text-[#2a2f36] border-[#a7adb4]' : 'bg-slate-900 text-slate-200 border-slate-700'}`}
            title="Automated parameter"
            aria-label="Automated parameter"
          >
            {(targets.some((t) => targetKey(t) === targetKey(lane.target)) ? targets : [lane.target, ...targets]).map((t) => (
              <option key={targetKey(t)} value={targetKey(t)}>{auto.label(t)}</option>
            ))}
          </select>
          <button type="button" aria-label="Remove lane" title="Remove this automation lane" className="text-slate-500 hover:text-red-400" onClick={() => auto.removeLane(lane.id)}>
            <X className="w-3 h-3" />
          </button>
        </div>
        {height >= 34 && (
          <div className="flex items-center gap-1 text-[11px]">
            <select value={lane.mode} onChange={(e) => auto.setMode(lane.id, e.target.value as AutoMode)} onPointerDown={(e) => e.stopPropagation()} className={`rounded border text-[11px] ${light ? 'bg-white border-[#a7adb4]' : 'bg-slate-900 border-slate-700'}`} style={{ color }} aria-label="Automation mode">
              {MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
            <span className="text-slate-500">{lane.points.length} pts</span>
            <button type="button" className="ml-auto text-slate-500 hover:text-white" title="Delete all points" onClick={() => auto.setPoints(lane.id, [])}>clear</button>
          </div>
        )}
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`border-b cursor-crosshair select-none ${light ? 'border-[#cdd1d6] bg-[#f7f8f9]' : 'border-slate-800/80 bg-[#090d14]'}`}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          e.stopPropagation();
          const { px, py } = local(e);
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          const i = hitPoint(px, py);
          if (i >= 0 && e.altKey) {
            commit(pts.filter((_, k) => k !== i));
            return;
          }
          if (i >= 0) {
            setDrag({ idx: i, shift: e.shiftKey });
            setPreview(pts.map((p) => ({ ...p })));
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            setDrag({ draw: true });
            setPreview(sortPoints([...pts, { pos: toPos(px), value: toVal(py) }]));
            return;
          }
          if (e.altKey && pts.length > 1) {
            const pos = px / barPx * spb;
            const seg = pts.findIndex((p, k) => k < pts.length - 1 && p.pos <= pos && pts[k + 1].pos > pos);
            if (seg >= 0) {
              setDrag({ curve: seg, startY: e.clientY, base: pts[seg].curve ?? 0 });
              setPreview(pts.map((p) => ({ ...p })));
              return;
            }
          }
          const next = sortPoints([...pts, { pos: toPos(px), value: toVal(py) }]);
          commit(next);
        }}
        onPointerMove={(e) => {
          if (!drag || !preview) return;
          const { px, py } = local(e);
          if ('draw' in drag) {
            const pos = toPos(px);
            setPreview(sortPoints([...preview.filter((p) => Math.abs(p.pos - pos) > 0.2), { pos, value: toVal(py) }]));
          } else if ('idx' in drag) {
            const next = preview.map((p) => ({ ...p }));
            const p = next[drag.idx];
            if (!p) return;
            if (!drag.shift) p.pos = toPos(px);
            p.value = toVal(py);
            setPreview(next);
          } else {
            const next = preview.map((p) => ({ ...p }));
            next[drag.curve].curve = Math.max(-1, Math.min(1, drag.base + (e.clientY - drag.startY) / 60));
            setPreview(next);
          }
        }}
        onPointerUp={() => {
          if (preview && drag) commit(preview);
          setDrag(null);
        }}
        onDoubleClick={(e) => {
          const { px, py } = local(e as unknown as React.PointerEvent);
          const i = hitPoint(px, py);
          if (i >= 0) commit(pts.filter((_, k) => k !== i));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const { px, py } = local(e as unknown as React.PointerEvent);
          const i = hitPoint(px, py);
          if (i >= 0) commit(pts.map((p, k) => (k === i ? { ...p, hold: !p.hold } : p)));
        }}
        aria-label={`${auto.label(lane.target)} automation`}
      >
        <line x1={0} x2={width} y1={y(0.5)} y2={y(0.5)} stroke="rgba(148,163,184,0.12)" />
        {d && <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`${color}18`} />}
        {d && <path d={d} stroke={color} strokeWidth={1.5} fill="none" />}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.pos)} cy={y(p.value)} r={3.5} fill={p.hold ? '#0b1120' : color} stroke={color} strokeWidth={1.5}>
              <title>{`bar ${(p.pos / spb + 1).toFixed(2)} · ${fmt(p.value)}${p.hold ? ' · step' : ''}`}</title>
            </circle>
          </g>
        ))}
        {!pts.length && (
          <text x={8} y={height / 2 + 3} fill="#64748b" fontSize={9}>
            Click to add points · Ctrl-drag to draw · or move the control while playing in TOUCH / LATCH / WRITE
          </text>
        )}
      </svg>
    </div>
  );
}
