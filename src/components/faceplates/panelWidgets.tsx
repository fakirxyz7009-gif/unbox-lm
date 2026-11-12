/**
 * Small interactive front-panel widgets shared by device faceplates.
 *  - SvgFilterCurve: live filter response; drag left/right = cutoff, click the mode = next mode.
 *  - VerticalAdsrBank: four vertical sliders (attack / decay / sustain / release).
 */
import React, { useRef } from 'react';

const FILTER_MODES = ['LP12', 'LP24', 'HP12', 'BP', 'NOTCH'] as const;

function magnitude(mode: string, f: number, fc: number, q: number): number {
  const x = f / fc;
  const den = Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2);
  switch (mode) {
    case 'LP24':
      return 1 / (den * den);
    case 'HP12':
    case 'HP':
      return (x * x) / den;
    case 'BP':
      return x / q / den;
    case 'NOTCH':
      return Math.abs(1 - x * x) / den;
    default:
      return 1 / den;
  }
}

export const SvgFilterCurve: React.FC<{
  cutoffHz: number;
  resonance: number;
  filterMode: string;
  accentColor?: string;
  width?: number;
  height?: number;
  onChangeCutoff: (hz: number) => void;
  onChangeMode?: (mode: string) => void;
}> = ({ cutoffHz, resonance, filterMode, accentColor = '#d6a358', width = 132, height = 56, onChangeCutoff, onChangeMode }) => {
  const drag = useRef<{ x: number; hz: number } | null>(null);
  const fc = Math.max(20, Math.min(20000, Number(cutoffHz) || 1000));
  // resonance knobs use 0.1..12+; map to a filter Q
  const q = Math.max(0.5, Math.min(14, Number(resonance) || 0.7));
  const fMin = 20;
  const fMax = 20000;
  const xOf = (f: number) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * width;
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / 64);
    const db = 20 * Math.log10(Math.max(1e-4, magnitude(filterMode, f, fc, q)));
    const y = height * 0.35 - (db / 36) * height * 0.6;
    pts.push(`${xOf(f).toFixed(1)},${Math.max(1, Math.min(height - 1, y)).toFixed(1)}`);
  }
  const mode = String(filterMode || 'LP24');
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width={width}
        height={height}
        className="bg-black/60 rounded border border-neutral-800 cursor-ew-resize touch-none"
        onPointerDown={(e) => {
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, hz: fc };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const hz = drag.current.hz * Math.pow(fMax / fMin, dx / (width * 1.5));
          onChangeCutoff(Math.round(Math.max(30, Math.min(18000, hz))));
        }}
        onPointerUp={() => (drag.current = null)}
        role="slider"
        aria-label="Filter cutoff"
        aria-valuenow={Math.round(fc)}
        aria-valuemin={30}
        aria-valuemax={18000}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChangeCutoff(Math.min(18000, Math.round(fc * 1.06)));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChangeCutoff(Math.max(30, Math.round(fc / 1.06)));
        }}
      >
        {[100, 1000, 10000].map((f) => (
          <line key={f} x1={xOf(f)} x2={xOf(f)} y1={0} y2={height} stroke="#1f2937" strokeWidth={1} />
        ))}
        <polyline points={pts.join(' ')} fill="none" stroke={accentColor} strokeWidth={1.6} />
        <line x1={xOf(fc)} x2={xOf(fc)} y1={0} y2={height} stroke={accentColor} strokeOpacity={0.35} strokeDasharray="2 2" />
      </svg>
      <div className="flex items-center gap-1 mt-0.5 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => {
            const i = FILTER_MODES.indexOf(mode as (typeof FILTER_MODES)[number]);
            onChangeMode?.(FILTER_MODES[(i + 1) % FILTER_MODES.length]);
          }}
          className="px-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          title="Filter mode (click for next)"
        >
          {mode}
        </button>
        <span className="text-neutral-400">{fc >= 1000 ? `${(fc / 1000).toFixed(1)}k` : Math.round(fc)}Hz</span>
      </div>
    </div>
  );
};

type AdsrKey = 'attack' | 'decay' | 'sustain' | 'release';
const ADSR: { k: AdsrKey; label: string; min: number; max: number; log: boolean }[] = [
  { k: 'attack', label: 'A', min: 0.001, max: 4, log: true },
  { k: 'decay', label: 'D', min: 0.01, max: 4, log: true },
  { k: 'sustain', label: 'S', min: 0, max: 1, log: false },
  { k: 'release', label: 'R', min: 0.01, max: 6, log: true },
];

export const VerticalAdsrBank: React.FC<{
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  accentColor?: string;
  onChange: (key: AdsrKey, value: number) => void;
}> = ({ attack, decay, sustain, release, accentColor = '#d6a358', onChange }) => {
  const vals: Record<AdsrKey, number> = { attack, decay, sustain, release };
  return (
    <div className="flex items-end gap-1.5 bg-black/45 px-2 py-1 rounded border border-neutral-800">
      {ADSR.map((a) => {
        const v = Math.max(a.min, Math.min(a.max, Number(vals[a.k]) || a.min));
        const norm = a.log ? Math.log(v / a.min) / Math.log(a.max / a.min) : (v - a.min) / (a.max - a.min);
        return (
          <label key={a.k} className="flex flex-col items-center gap-0.5 text-[11px] font-mono text-neutral-400">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(norm * 1000)}
              onChange={(e) => {
                const n = Number(e.target.value) / 1000;
                onChange(a.k, a.log ? a.min * Math.pow(a.max / a.min, n) : a.min + n * (a.max - a.min));
              }}
              className="h-14 w-3"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor }}
              aria-label={a.k}
            />
            <span style={{ color: accentColor }}>{a.label}</span>
          </label>
        );
      })}
    </div>
  );
};
