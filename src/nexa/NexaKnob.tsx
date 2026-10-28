import React, { useRef } from 'react';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  def?: number;
  color?: string;
  size?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

/** Compact knob: vertical drag, Shift = fine, wheel, double-click resets, arrow keys. */
export default function NexaKnob({
  label, value, min = 0, max = 1, def, color = '#fb923c', size = 34, format, onChange,
}: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const span = max - min;
  const norm = Math.max(0, Math.min(1, (value - min) / span));
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const ang = -135 + norm * 270;
  const r = size / 2 - 3;
  const cx = size / 2;
  const pt = (a: number, rad: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(t), cx + rad * Math.sin(t)];
  };
  const [sx, sy] = pt(-135, r);
  const [ex, ey] = pt(ang, r);
  const [ix, iy] = pt(ang, r - 6);
  const [ox, oy] = pt(ang, r - 1);
  const large = ang + 135 > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center select-none" style={{ width: size + 14 }}>
      <svg
        width={size}
        height={size}
        tabIndex={0}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="cursor-ns-resize outline-none focus-visible:ring-1 focus-visible:ring-orange-400 rounded-full"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 600 : 150;
          onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / k) * span));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => def !== undefined && onChange(def)}
        onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * span * (e.shiftKey ? 0.005 : 0.03)))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + span * 0.02));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - span * 0.02));
        }}
      >
        <title>{format ? format(value) : value.toFixed(2)}</title>
        <circle cx={cx} cy={cx} r={r + 1.5} fill="#0b0f17" stroke="#1f2937" />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${pt(135, r)[0]} ${pt(135, r)[1]}`} stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {norm > 0.005 && (
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        <circle cx={cx} cy={cx} r={r - 4} fill="url(#nk)" />
        <defs>
          <radialGradient id="nk" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#4b5563" />
            <stop offset="100%" stopColor="#111827" />
          </radialGradient>
        </defs>
        <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[11px] uppercase tracking-wider text-slate-300/80 leading-none mt-0.5 truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}
