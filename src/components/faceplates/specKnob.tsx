/**
 * Front-panel controls for spec devices: an SVG knob with hardware styles (cap, chicken-head,
 * Moog, metal, plastic, vintage, LED ring, Eurorack pot), log / linear response, vertical drag
 * (Shift = fine), wheel, double-click reset and keyboard (arrows / PageUp / PageDown).
 */
import React, { useRef, useState } from 'react';
import type { KnobStyle, ParamDef } from '../../../shared/rack/devices/index.ts';

export function formatParam(def: ParamDef, v: number): string {
  if (def.options) return def.options[Math.round(v)] ?? String(v);
  const u = def.unit ?? '';
  if (u === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : `${v.toFixed(v < 10 ? 2 : 0)}`;
  if (u === 's') return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
  if (u === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(v < 10 ? 2 : 0)}ms`;
  if (u === 'dB') return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  if (u === '%') return `${Math.round(v * 100)}%`;
  if (u === 'st') return `${v > 0 ? '+' : ''}${Math.round(v)}st`;
  if (u === 'ct') return `${v > 0 ? '+' : ''}${Math.round(v)}c`;
  if (u === ':1') return `${v.toFixed(1)}:1`;
  if (u === 'x') return `${v.toFixed(2)}x`;
  if (def.step === 1) return String(Math.round(v));
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

const toNorm = (def: ParamDef, v: number) => {
  if (def.curve === 'log' && def.min > 0) return Math.log(v / def.min) / Math.log(def.max / def.min);
  return (v - def.min) / (def.max - def.min);
};
const fromNorm = (def: ParamDef, n: number) => {
  const c = Math.max(0, Math.min(1, n));
  let v = def.curve === 'log' && def.min > 0 ? def.min * Math.pow(def.max / def.min, c) : def.min + c * (def.max - def.min);
  if (def.step) v = Math.round(v / def.step) * def.step;
  return Math.max(def.min, Math.min(def.max, v));
};

interface KnobProps {
  def: ParamDef;
  value: number;
  onChange: (v: number) => void;
  style: KnobStyle;
  accent: string;
  text: string;
  size?: number;
  /** Right-click (opens the automate menu at the pointer). */
  onMenu?: (e: React.MouseEvent) => void;
}

export const SpecKnob: React.FC<KnobProps> = ({ def, value, onChange, style, accent, text, size = 40, onMenu }) => {
  const drag = useRef<{ y: number; n: number } | null>(null);
  const [active, setActive] = useState(false);
  const n = Math.max(0, Math.min(1, toNorm(def, value)));
  const ang = -135 + n * 270;
  const r = size / 2;
  const set = (nn: number) => onChange(fromNorm(def, nn));
  const bipolar = def.min < 0 && def.max > 0;

  const arc = (from: number, to: number, rad: number) => {
    const p = (a: number) => [r + rad * Math.sin((a * Math.PI) / 180), r - rad * Math.cos((a * Math.PI) / 180)];
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${x2} ${y2}`;
  };

  const body = () => {
    switch (style) {
      case 'chicken':
        return (
          <g transform={`rotate(${ang} ${r} ${r})`}>
            <circle cx={r} cy={r} r={r * 0.62} fill="#1b1b1b" stroke="#000" />
            <path d={`M ${r} ${r * 0.18} L ${r + r * 0.28} ${r * 0.95} L ${r - r * 0.28} ${r * 0.95} Z`} fill="#242424" stroke="#000" />
            <line x1={r} y1={r * 0.22} x2={r} y2={r * 0.6} stroke="#f2f2f2" strokeWidth={1.6} />
          </g>
        );
      case 'moog':
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.86} fill="url(#skirt)" stroke="#555" />
            <circle cx={r} cy={r} r={r * 0.62} fill="#121212" stroke="#000" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.16} x2={r} y2={r * 0.48} stroke="#f5f5f5" strokeWidth={2} />
            </g>
          </>
        );
      case 'metal':
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.78} fill="url(#metal)" stroke="#333" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.25} x2={r} y2={r * 0.55} stroke="#111" strokeWidth={2} />
            </g>
          </>
        );
      case 'plastic':
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.74} fill={accent} stroke="#000" strokeOpacity={0.5} />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.28} x2={r} y2={r * 0.6} stroke="#fff" strokeWidth={2} />
            </g>
          </>
        );
      case 'vintage':
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.8} fill="#efe6cf" stroke="#6b5b3e" />
            <circle cx={r} cy={r} r={r * 0.55} fill="#e2d6b8" stroke="#a89670" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <circle cx={r} cy={r * 0.32} r={2} fill="#3a2a14" />
            </g>
          </>
        );
      case 'pot':
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.5} fill="#d9d9d9" stroke="#777" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.52} x2={r} y2={r * 0.78} stroke="#111" strokeWidth={2} />
            </g>
          </>
        );
      case 'led':
        return (
          <>
            {Array.from({ length: 13 }, (_, i) => {
              const a = -135 + (i / 12) * 270;
              const on = bipolar ? (n >= 0.5 ? a >= 0 && a <= ang : a <= 0 && a >= ang) : a <= ang;
              return (
                <circle key={i} cx={r + r * 0.86 * Math.sin((a * Math.PI) / 180)} cy={r - r * 0.86 * Math.cos((a * Math.PI) / 180)} r={1.5} fill={on ? accent : '#333'} />
              );
            })}
            <circle cx={r} cy={r} r={r * 0.52} fill="#1e1e1e" stroke="#000" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.52} x2={r} y2={r * 0.72} stroke="#ddd" strokeWidth={1.6} />
            </g>
          </>
        );
      default:
        return (
          <>
            <circle cx={r} cy={r} r={r * 0.74} fill="url(#cap)" stroke="#000" />
            <g transform={`rotate(${ang} ${r} ${r})`}>
              <line x1={r} y1={r * 0.24} x2={r} y2={r * 0.56} stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
            </g>
          </>
        );
    }
  };

  return (
    <div className="flex flex-col items-center select-none" style={{ width: Math.max(size + 6, 46) }}>
      <svg
        width={size}
        height={size}
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={formatParam(def, value)}
        className="cursor-ns-resize outline-none focus-visible:ring-2 rounded-full touch-none"
        onContextMenu={onMenu}
        onPointerDown={(e) => {
          if (e.button !== 0) return; // right-click is the menu, not a drag
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, n };
          setActive(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 0.0015 : 0.006;
          set(drag.current.n + (drag.current.y - e.clientY) * k);
        }}
        onPointerUp={() => {
          drag.current = null;
          setActive(false);
        }}
        onDoubleClick={() => onChange(def.default)}
        onWheel={(e) => set(n - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02))}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -0.02 : e.key === 'PageUp' ? 0.1 : e.key === 'PageDown' ? -0.1 : 0;
          if (d) {
            e.preventDefault();
            e.stopPropagation();
            set(n + d);
          }
        }}
      >
        <defs>
          <radialGradient id="cap" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#4a4a4a" />
            <stop offset="100%" stopColor="#141414" />
          </radialGradient>
          <radialGradient id="metal" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#f4f4f4" />
            <stop offset="70%" stopColor="#a9a9a9" />
            <stop offset="100%" stopColor="#6c6c6c" />
          </radialGradient>
          <radialGradient id="skirt" cx="50%" cy="50%">
            <stop offset="60%" stopColor="#bdbdbd" />
            <stop offset="100%" stopColor="#7d7d7d" />
          </radialGradient>
        </defs>
        {style !== 'led' && <path d={arc(-135, 135, r * 0.94)} stroke="#000" strokeOpacity={0.35} strokeWidth={2} fill="none" />}
        {style !== 'led' && n > 0.001 && (
          <path d={bipolar ? arc(Math.min(0, ang), Math.max(0, ang), r * 0.94) : arc(-135, ang, r * 0.94)} stroke={accent} strokeWidth={2} fill="none" />
        )}
        {body()}
      </svg>
      <span className="text-[11px] leading-tight font-bold uppercase tracking-wide text-center truncate max-w-full" style={{ color: text }} title={def.label}>
        {def.label}
      </span>
      <span className="text-[11px] leading-tight font-mono opacity-80" style={{ color: active ? accent : text }}>
        {formatParam(def, value)}
      </span>
    </div>
  );
};

/** Select / buttons / toggle / fader for non-knob params. */
export const SpecControl: React.FC<{ def: ParamDef; value: number; onChange: (v: number) => void; style: KnobStyle; accent: string; text: string }> = (props) => {
  const { def, value, onChange, accent, text } = props;
  const control = def.control ?? (def.options ? 'select' : 'knob');
  if (control === 'toggle') {
    const on = value >= 0.5;
    return (
      <button
        type="button"
        onClick={() => onChange(on ? 0 : 1)}
        aria-pressed={on}
        className="flex flex-col items-center gap-0.5 px-1"
        title={def.label}
      >
        <span className="w-4 h-2.5 rounded-sm border border-black/60" style={{ background: on ? accent : '#2a2a2a', boxShadow: on ? `0 0 6px ${accent}` : undefined }} />
        <span className="text-[11px] font-bold uppercase whitespace-nowrap" style={{ color: text }}>
          {def.label}
        </span>
      </button>
    );
  }
  if (control === 'buttons' && def.options) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex rounded overflow-hidden border border-black/50">
          {def.options.map((o, i) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(i)}
              className="px-1.5 py-0.5 text-[11px] font-bold"
              style={{ background: Math.round(value) === i ? accent : 'rgba(0,0,0,0.45)', color: Math.round(value) === i ? '#111' : text }}
            >
              {o}
            </button>
          ))}
        </div>
        <span className="text-[11px] uppercase font-bold opacity-80" style={{ color: text }}>
          {def.label}
        </span>
      </div>
    );
  }
  if (def.options) {
    return (
      <label className="flex flex-col items-center gap-0.5">
        <select
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="text-[11px] font-bold rounded px-1 py-0.5 bg-black/60 border border-black/60 max-w-[8.5rem]"
          style={{ color: text }}
          aria-label={def.label}
        >
          {def.options.map((o, i) => (
            <option key={o + i} value={i}>
              {o}
            </option>
          ))}
        </select>
        <span className="text-[11px] uppercase font-bold opacity-80" style={{ color: text }}>
          {def.label}
        </span>
      </label>
    );
  }
  if (control === 'fader') {
    const n = (value - def.min) / (def.max - def.min);
    return (
      <label className="flex flex-col items-center gap-0.5 w-9">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(n * 1000)}
          onChange={(e) => onChange(def.min + (Number(e.target.value) / 1000) * (def.max - def.min))}
          onDoubleClick={() => onChange(def.default)}
          className="h-20 w-3"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: accent }}
          aria-label={def.label}
        />
        <span className="text-[11px] font-mono" style={{ color: text }}>
          {formatParam(def, value)}
        </span>
        <span className="text-[11px] uppercase font-bold truncate max-w-full" style={{ color: text }}>
          {def.label}
        </span>
      </label>
    );
  }
  return <SpecKnob {...props} />;
};
