import React, { useRef } from 'react';
import { useMeterFrame } from '../../nexa/useEngine.ts';
import { gainToDb, meterPos } from './levels.ts';

export interface LevelReading {
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

interface MeterProps {
  read: () => LevelReading;
  height?: number;
  width?: number;
  /** Show the numeric peak-hold readout under the bars. */
  readout?: boolean;
}

const FLOOR = -60;
const CEIL = 6;

/**
 * Stereo peak / RMS meter on a canvas (updated every frame, never through React state).
 * Peak hold lasts 1.5 s; the clip LED latches above 0 dBFS until clicked.
 */
export function StereoMeter({ read, height = 150, width = 16, readout = true }: MeterProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const st = useRef({ pl: -120, pr: -120, hl: -120, hr: -120, holdT: 0, clip: false, shown: '', drawn: '' });

  useMeterFrame((now) => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const r = read();
    const s = st.current;
    // fall-back of 20 dB/s for the peak bar
    const fall = 20 / 60;
    const pl = gainToDb(r.peakL);
    const pr = gainToDb(r.peakR);
    // falling bars stop below the scale, so a silent meter settles and stops redrawing
    s.pl = Math.max(pl, s.pl - fall, FLOOR - 1);
    s.pr = Math.max(pr, s.pr - fall, FLOOR - 1);
    if (pl > s.hl || pr > s.hr || now - s.holdT > 1500) {
      s.hl = Math.max(pl, now - s.holdT > 1500 ? -120 : s.hl);
      s.hr = Math.max(pr, now - s.holdT > 1500 ? -120 : s.hr);
      s.holdT = now;
    }
    if ((r.peakL >= 1 || r.peakR >= 1) && !s.clip) {
      s.clip = true;
      if (clipRef.current) clipRef.current.style.background = '#ef4444';
    }
    const W = c.width;
    const H = c.height;
    // redraw only when a bar moved by a pixel or more
    const px = (db: number) => Math.round(meterPos(db, FLOOR, CEIL) * H);
    const sig = `${px(s.pl)},${px(s.pr)},${px(gainToDb(r.rmsL))},${px(gainToDb(r.rmsR))},${px(s.hl)},${px(s.hr)}`;
    if (sig === s.drawn) return;
    s.drawn = sig;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#05070b';
    g.fillRect(0, 0, W, H);
    const bw = (W - 3) / 2;
    const draw = (x: number, peakDb: number, rmsDb: number, holdDb: number) => {
      const ph = meterPos(peakDb, FLOOR, CEIL) * H;
      const rh = meterPos(rmsDb, FLOOR, CEIL) * H;
      const grad = g.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, '#16a34a');
      grad.addColorStop(meterPos(-12, FLOOR, CEIL), '#22c55e');
      grad.addColorStop(meterPos(-6, FLOOR, CEIL), '#eab308');
      grad.addColorStop(meterPos(-1, FLOOR, CEIL), '#f97316');
      grad.addColorStop(meterPos(0, FLOOR, CEIL), '#ef4444');
      g.globalAlpha = 0.45;
      g.fillStyle = grad;
      g.fillRect(x, H - ph, bw, ph);
      g.globalAlpha = 1;
      g.fillRect(x, H - rh, bw, rh);
      const hy = H - meterPos(holdDb, FLOOR, CEIL) * H;
      g.fillStyle = holdDb >= 0 ? '#ef4444' : '#e2e8f0';
      g.fillRect(x, hy, bw, 1.5);
    };
    draw(1, s.pl, gainToDb(r.rmsL), s.hl);
    draw(2 + bw, s.pr, gainToDb(r.rmsR), s.hr);
    // 0 dB line
    g.fillStyle = 'rgba(239,68,68,0.6)';
    g.fillRect(0, H - meterPos(0, FLOOR, CEIL) * H, W, 1);
    if (label.current) {
      const hold = Math.max(s.hl, s.hr);
      const txt = hold <= -90 ? '-∞' : hold.toFixed(1);
      if (txt !== s.shown) {
        s.shown = txt;
        label.current.textContent = txt;
      }
    }
  });

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        ref={clipRef}
        type="button"
        title="Clip indicator (click to reset)"
        aria-label="Reset clip indicator"
        className="w-3 h-1.5 rounded-sm bg-red-950 border border-red-900"
        onClick={() => {
          st.current.clip = false;
          if (clipRef.current) clipRef.current.style.background = '';
        }}
      />
      <canvas ref={canvas} width={width} height={height} style={{ width, height }} className="rounded-sm border border-black" />
      {readout && <span ref={label} className="text-[11px] font-mono text-slate-400 leading-none">-∞</span>}
    </div>
  );
}
