import React, { useRef } from 'react';
import { gainToDb } from './levels.ts';

/** Fader law: position 0..1 ↔ linear gain 0..max (fourth-power taper, 0 dB near the top). */
const TAPER = 4;
const toPos = (gain: number, max: number) => Math.pow(Math.max(0, gain) / max, 1 / TAPER);
const toGain = (pos: number, max: number) => Math.pow(Math.max(0, Math.min(1, pos)), TAPER) * max;

interface FaderProps {
  /** Linear gain. */
  value: number;
  onChange: (gain: number) => void;
  /** Called once when a drag / wheel gesture ends (good place for an undo or autosave mark). */
  onCommit?: () => void;
  max?: number;
  /** Double-click value (linear). */
  def?: number;
  height?: number;
  color?: string;
  label?: string;
}

const MARKS = [6, 0, -6, -12, -24, -40];

/** Vertical channel fader in dB: drag, Shift = fine, wheel, double-click resets, arrow keys. */
export function Fader({ value, onChange, onCommit, max = 1.5, def = 1, height = 150, color = '#f97316', label = 'Volume' }: FaderProps) {
  const drag = useRef<{ y: number; pos: number } | null>(null);
  const pos = toPos(value, max);
  const travel = height - 18;
  const set = (p: number) => onChange(toGain(p, max));
  const db = gainToDb(value);
  return (
    <div className="relative select-none" style={{ width: 34, height }}>
      {/* scale */}
      {MARKS.filter((m) => toGain(1, max) >= Math.pow(10, m / 20)).map((m) => {
        const y = 9 + (1 - toPos(Math.pow(10, m / 20), max)) * travel;
        return (
          <div key={m} className="absolute left-0 w-full flex items-center pointer-events-none" style={{ top: y - 4 }}>
            <span className="text-[11px] text-slate-500 w-3 text-right leading-none">{m > 0 ? `+${m}` : m}</span>
            <span className="ml-0.5 h-px w-1.5 bg-slate-600" />
          </div>
        );
      })}
      <div className="absolute left-[19px] top-[9px] w-[3px] rounded bg-black/80 border border-slate-800" style={{ height: travel }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={db <= -90 ? '-inf dB' : `${db.toFixed(1)} dB`}
        aria-valuenow={Math.round(db * 10) / 10}
        title={db <= -90 ? '-inf dB' : `${db.toFixed(1)} dB`}
        className="absolute left-[11px] w-[19px] h-[18px] rounded-sm cursor-ns-resize outline-none focus-visible:ring-1 focus-visible:ring-orange-400 shadow-md"
        style={{
          top: (1 - pos) * travel,
          background: `linear-gradient(180deg, #e2e8f0 0%, #94a3b8 45%, ${color} 50%, #94a3b8 55%, #475569 100%)`,
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, pos };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 4 : 1;
          set(drag.current.pos + (drag.current.y - e.clientY) / travel / k);
        }}
        onPointerUp={() => {
          drag.current = null;
          onCommit?.();
        }}
        onDoubleClick={() => {
          onChange(def);
          onCommit?.();
        }}
        onWheel={(e) => {
          set(pos - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.02));
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') set(pos + 0.01);
          else if (e.key === 'ArrowDown') set(pos - 0.01);
          else return;
          e.preventDefault();
          onCommit?.();
        }}
      />
    </div>
  );
}
