/**
 * Metal knob with a cyan value ring (Unbox skin). Drag up/down (Shift = fine), mouse wheel,
 * arrow keys, double-click = default. `curve: 'log'` for frequencies / times.
 */
import React, { useRef } from 'react';
import { capturePointer } from './pointer.ts';

export interface RingKnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label?: string;
  /** Diameter in px. */
  size?: number;
  curve?: 'lin' | 'log';
  step?: number;
  defaultValue?: number;
  format?: (v: number) => string;
  /** Label colour: dark on metal, LCD ink on the LCD, light on the dark console. */
  tone?: 'metal' | 'lcd' | 'dark';
  /** Value ring colour (default brass). */
  color?: string;
  /** Called once when a drag / wheel gesture ends (save the project then, not on every move). */
  onCommit?: () => void;
  /** Ring track drawn from the centre (pan-style) instead of from the minimum. */
  bipolar?: boolean;
  disabled?: boolean;
  title?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function toNorm(v: number, min: number, max: number, curve: 'lin' | 'log' = 'lin'): number {
  if (curve === 'log' && min > 0) return clamp(Math.log(clamp(v, min, max) / min) / Math.log(max / min), 0, 1);
  return clamp((v - min) / (max - min || 1), 0, 1);
}

export function fromNorm(n: number, min: number, max: number, curve: 'lin' | 'log' = 'lin'): number {
  const x = clamp(n, 0, 1);
  return curve === 'log' && min > 0 ? min * Math.pow(max / min, x) : min + x * (max - min);
}

const START = -135;
const SWEEP = 270;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

const RingKnobComponent: React.FC<RingKnobProps> = ({
  value,
  min,
  max,
  onChange,
  label,
  size = 44,
  curve = 'lin',
  step,
  defaultValue,
  format,
  tone = 'metal',
  bipolar,
  disabled,
  title,
  onContextMenu,
  color,
  onCommit,
}) => {
  const ringColor = color ?? (tone === 'lcd' ? '#00e5ff' : '#d6a358');
  const drag = useRef<{ lastY: number; norm: number } | null>(null);
  const n = toNorm(value, min, max, curve);
  const emit = (norm: number) => {
    let v = fromNorm(norm, min, max, curve);
    if (step) v = Math.round(v / step) * step;
    v = clamp(v, min, max);
    if (v !== value) onChange(v);
  };
  const angle = START + n * SWEEP;
  const c = size / 2;
  const rRing = c - 2;
  const rCap = c * 0.66;
  const zeroA = bipolar ? START + toNorm(0, min, max, curve) * SWEEP : START;
  const ink = tone === 'lcd' ? 'text-[#112328] font-bold' : tone === 'dark' ? 'text-chrome-ink' : 'text-ink';
  const commitTimer = useRef(0);
  const commitSoon = () => {
    if (!onCommit) return;
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(onCommit, 400);
  };

  return (
    <div className="flex flex-col items-center select-none" style={{ width: Math.max(size, 40) }}>
      <svg
        width={size}
        height={size}
        role="slider"
        aria-label={label ?? title}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        className={`outline-none focus-visible:drop-shadow-[0_0_4px_#d6a358] ${disabled ? 'opacity-40' : 'cursor-ns-resize'}`}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          capturePointer(e.currentTarget, e.pointerId);
          drag.current = { lastY: e.clientY, norm: n };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = d.lastY - e.clientY;
          d.lastY = e.clientY;
          const px = e.shiftKey ? 800 : 160;
          d.norm = clamp(d.norm + dy / px, 0, 1);
          emit(d.norm);
        }}
        onPointerUp={() => {
          if (drag.current) onCommit?.();
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => {
          if (disabled || defaultValue === undefined) return;
          onChange(defaultValue);
          onCommit?.();
        }}
        onWheel={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          emit(n + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.025));
          commitSoon();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          emit(n + d * (e.shiftKey ? 0.005 : 0.025));
          commitSoon();
        }}
        onContextMenu={onContextMenu}
      >
        <title>{title ?? (label ? `${label}: ${format ? format(value) : value.toFixed(2)}` : '')}</title>
        <defs>
          <radialGradient id="us-cap" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#c9ced4" />
            <stop offset="100%" stopColor="#6e747c" />
          </radialGradient>
          <linearGradient id="us-skirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b4047" />
            <stop offset="100%" stopColor="#0d0f12" />
          </linearGradient>
        </defs>
        {/* ring track + value arc */}
        <path d={arc(c, c, rRing, START, START + SWEEP)} stroke={tone === 'lcd' ? 'rgba(18, 42, 48, 0.32)' : tone === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(20,30,36,0.55)'} strokeWidth={3.2} fill="none" strokeLinecap="round" />
        {Math.abs(angle - zeroA) > 0.5 && (
          <path
            d={arc(c, c, rRing, Math.min(zeroA, angle), Math.max(zeroA, angle))}
            stroke={ringColor}
            strokeWidth={3.2}
            fill="none"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${ringColor})` }}
          />
        )}
        {/* skirt + cap */}
        <circle cx={c} cy={c + 1} r={rCap + 3} fill="url(#us-skirt)" />
        <circle cx={c} cy={c} r={rCap} fill="url(#us-cap)" stroke="#5a6067" strokeWidth={0.8} />
        <line
          x1={c}
          y1={c - rCap * 0.15}
          x2={c}
          y2={c - rCap * 0.88}
          stroke="#16191d"
          strokeWidth={Math.max(1.6, size / 26)}
          strokeLinecap="round"
          transform={`rotate(${angle} ${c} ${c})`}
        />
      </svg>
      {label && <span className={`font-label font-semibold text-[13px] leading-tight mt-0.5 ${ink} whitespace-nowrap`}>{label}</span>}
    </div>
  );
};

export const RingKnob = React.memo(RingKnobComponent);
