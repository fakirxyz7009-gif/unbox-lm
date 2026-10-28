/** Shared controls for the studio pages and the console (Unbox skin: dark chrome, lit buttons, LCD readouts). */
import React from 'react';

const TONES = {
  orange: '#d6a358',
  yellow: '#e0b266',
  cyan: '#d6a358',
  red: '#f87171',
  green: '#4ade80',
  violet: '#c4b5fd',
  slate: '#cbd5e1',
} as const;

export function Btn({
  on,
  onClick,
  children,
  title,
  tone = 'orange',
  className = '',
  disabled,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  tone?: keyof typeof TONES;
  className?: string;
  disabled?: boolean;
}) {
  const c = TONES[tone];
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on === undefined ? undefined : on}
      disabled={disabled}
      onClick={onClick}
      className={`us-btn rounded-[4px] min-h-[22px] px-2 py-0.5 inline-flex items-center justify-center gap-1 font-label font-bold text-[13px] leading-tight tracking-wide hover:text-white disabled:opacity-40 ${className}`}
      style={on ? { background: `linear-gradient(180deg, ${c}, ${c}b0)`, color: '#141414', boxShadow: `0 0 8px ${c}99, inset 0 1px 0 rgba(255,255,255,0.5)` } : undefined}
    >
      {children}
    </button>
  );
}

export function Sel<T extends string>({
  value,
  onChange,
  options,
  title,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  title?: string;
  className?: string;
}) {
  return (
    <select title={title} aria-label={title} value={value} onChange={(e) => onChange(e.target.value as T)} className={`us-field h-[22px] px-1 font-label text-[13px] ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Dark chassis panel with a metal name plate and screws. */
export function Panel({ title, right, children, className = '' }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`us-panel ${className}`}>
      {(title || right) && (
        <header className="us-panel-head">
          <span className="us-screw shrink-0" aria-hidden="true" />
          {title && <h3 className="us-plate">{title}</h3>}
          <div className="flex-1" />
          {right}
          <span className="us-screw shrink-0" aria-hidden="true" />
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

/** Number entry as a small LCD. */
export function NumField({
  value,
  onChange,
  min,
  max,
  step = 1,
  title,
  width = 56,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
  width?: number;
  suffix?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1 font-label text-[13px] text-chrome-ink">
      <input
        type="number"
        aria-label={title}
        title={title}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(min !== undefined || max !== undefined ? Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)) : v);
        }}
        style={{ width }}
        className="us-lcd-field h-[22px] px-1.5"
      />
      {suffix}
    </label>
  );
}

/** Labelled horizontal slider with an LCD value readout. */
export function Slide({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  format,
  labelWidth = 84,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  labelWidth?: number;
}) {
  const fill = ((Math.max(min, Math.min(max, value)) - min) / (max - min || 1)) * 100;
  return (
    <label className="flex items-center gap-2 font-label text-[13px] text-chrome-ink">
      <span className="shrink-0 truncate" style={{ width: labelWidth }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="us-range flex-1 min-w-0"
        style={{ ['--fill' as string]: `${fill}%` } as React.CSSProperties}
        aria-label={label}
      />
      <span className="us-lcd-chip w-[70px] text-right">{format ? format(value) : `${value}${unit}`}</span>
    </label>
  );
}
