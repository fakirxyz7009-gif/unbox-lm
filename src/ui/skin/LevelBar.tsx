/**
 * Horizontal level bar (Unbox skin): brass segments up to the fader value with an orange handle,
 * plus an optional live meter line. The fader uses a dB law (−48 dB … +3.5 dB), so the middle of
 * the bar is musically useful instead of "almost silent".
 */
import React, { useRef } from 'react';
import { useFrame } from '../../nexa/useEngine.ts';
import { gainToDb, meterPos } from '../../studio/ui/levels.ts';
import { capturePointer } from './pointer.ts';
import { setWidth } from './dom.ts';

const FLOOR = -48;
const CEIL = 20 * Math.log10(1.5);

export const gainToBar = (g: number) => (g <= 0.0001 ? 0 : Math.max(0, Math.min(1, (gainToDb(g) - FLOOR) / (CEIL - FLOOR))));
export const barToGain = (p: number) => (p <= 0.005 ? 0 : Math.pow(10, (FLOOR + p * (CEIL - FLOOR)) / 20));

interface Props {
  value: number;
  onChange: (gain: number) => void;
  /** Live peak (linear) for the meter line, read every frame. */
  meter?: () => number;
  segments?: number;
  height?: number;
  title?: string;
  defaultValue?: number;
}

export const LevelBar: React.FC<Props> = ({ value, onChange, meter, segments = 22, height = 18, title, defaultValue = 0.85 }) => {
  const meterRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const peak = useRef(0);
  const peakAt = useRef(0);
  const drag = useRef(false);
  const pos = gainToBar(value);
  useFrame(() => {
    if (!meter) return;
    const v = meter();
    setWidth(meterRef.current, Math.round(meterPos(gainToDb(v), -48, 3.5) * 100));
    const now = performance.now();
    if (v >= peak.current) {
      peak.current = v;
      peakAt.current = now;
    } else if (now - peakAt.current > 1400) {
      peak.current = Math.max(v, peak.current * 0.9);
    }
    if (peakRef.current) peakRef.current.style.left = `${Math.round(meterPos(gainToDb(peak.current), -48, 3.5) * 100)}%`;
  });
  const setFrom = (el: HTMLElement, clientX: number, fine: boolean) => {
    const r = el.getBoundingClientRect();
    const p = (clientX - r.left) / Math.max(1, r.width);
    onChange(barToGain(fine ? pos + (p - pos) * 0.15 : p));
  };
  const lit = Math.round(pos * segments);
  return (
    <div
      className="relative flex-1 min-w-[90px] rounded-sm cursor-ew-resize select-none"
      style={{ height, background: '#100c08', boxShadow: 'inset 0 1px 3px #000, 0 1px 0 rgba(255,238,206,0.18)' }}
      role="slider"
      aria-label={title ?? 'Level'}
      aria-valuemin={0}
      aria-valuemax={1.5}
      aria-valuenow={value}
      tabIndex={0}
      title={`${title ?? 'Level'}: ${value <= 0.0001 ? '-∞' : gainToDb(value).toFixed(1)} dB (double-click = ${gainToDb(defaultValue).toFixed(1)} dB)`}
      onPointerDown={(e) => {
        capturePointer(e.currentTarget, e.pointerId);
        drag.current = true;
        setFrom(e.currentTarget, e.clientX, e.shiftKey);
      }}
      onPointerMove={(e) => drag.current && setFrom(e.currentTarget, e.clientX, e.shiftKey)}
      onPointerUp={() => (drag.current = false)}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(barToGain(Math.max(0, Math.min(1, pos + d * 0.02))));
      }}
    >
      <div className="absolute inset-[3px] flex gap-[2px]">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{ background: i < lit ? 'linear-gradient(180deg,#c9a464,#8a5c28)' : '#221c14', boxShadow: i < lit ? '0 0 2px rgba(214,163,88,0.35)' : undefined }}
          />
        ))}
      </div>
      {meter && <div ref={meterRef} className="absolute left-[3px] bottom-[1px] h-[2px] bg-emerald-300/90 rounded-full" style={{ width: 0 }} />}
      {meter && <div ref={peakRef} className="absolute bottom-[1px] w-[2px] h-[3px] bg-white/80 rounded-sm" style={{ left: '0%' }} title="Peak hold" />}
      <div
        className="absolute top-[-2px] bottom-[-2px] w-[11px] -ml-[5px] rounded-[2px]"
          style={{ left: `${pos * 100}%`, background: 'linear-gradient(180deg,#f1d49d,#d49b50 55%,#8f5d26)', boxShadow: '0 1px 2px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.6)' }}
      />
    </div>
  );
};
