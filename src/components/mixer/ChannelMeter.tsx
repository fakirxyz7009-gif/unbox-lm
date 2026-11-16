import React, { useRef } from 'react';
import { useMeterFrame } from '../../nexa/useEngine.ts';
import { gainToDb, meterPos } from '../../studio/ui/levels.ts';

const FLOOR = -60;
const CEIL = 6;

interface Props {
  read: () => { peakL: number; peakR: number; rmsL: number; rmsR: number };
  height?: number;
  width?: number;
  /** Split the console's meters over several shared meter frames to keep one frame's work small. */
  phase?: number;
  groups?: number;
}

/**
 * Compact peak / RMS meter for mixer strips. Unlike the canvas meter used on the Meters page, this
 * one changes only a handful of tiny DOM boxes; a console with eight live strips would otherwise
 * rasterise eight canvases on every shared meter frame.
 */
export function ChannelMeter({ read, height = 92, width = 16, phase = 0, groups = 1 }: Props) {
  const peakL = useRef<HTMLSpanElement>(null);
  const peakR = useRef<HTMLSpanElement>(null);
  const rmsL = useRef<HTMLSpanElement>(null);
  const rmsR = useRef<HTMLSpanElement>(null);
  const holdL = useRef<HTMLSpanElement>(null);
  const holdR = useRef<HTMLSpanElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const st = useRef({ pl: -120, pr: -120, hl: -120, hr: -120, holdT: 0, clip: false, drawn: '' });

  useMeterFrame((now) => {
    const r = read();
    const s = st.current;
    // Peak bar falls at 20 dB/s; the shared meter loop runs at about 30 Hz.
    const fall = (20 / 30) * groups;
    const pl = gainToDb(r.peakL);
    const pr = gainToDb(r.peakR);
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
    const px = (db: number) => Math.round(meterPos(db, FLOOR, CEIL) * height);
    const heights = {
      pl: px(s.pl),
      pr: px(s.pr),
      rl: px(gainToDb(r.rmsL)),
      rr: px(gainToDb(r.rmsR)),
      hl: px(s.hl),
      hr: px(s.hr),
    };
    const sig = `${heights.pl},${heights.pr},${heights.rl},${heights.rr},${heights.hl},${heights.hr}`;
    if (sig === s.drawn) return;
    s.drawn = sig;
    // Only write when a bar moved by a whole pixel; the meter frames are already rate-limited.
    if (peakL.current) peakL.current.style.height = `${heights.pl}px`;
    if (peakR.current) peakR.current.style.height = `${heights.pr}px`;
    if (rmsL.current) rmsL.current.style.height = `${heights.rl}px`;
    if (rmsR.current) rmsR.current.style.height = `${heights.rr}px`;
    if (holdL.current) holdL.current.style.bottom = `${heights.hl}px`;
    if (holdR.current) holdR.current.style.bottom = `${heights.hr}px`;
  }, phase, groups);

  const barWidth = Math.max(2, Math.floor((width - 3) / 2));
  const bar = { position: 'absolute' as const, bottom: 0, width: `${barWidth}px` };
  const gradient = 'linear-gradient(to top, #16a34a 0%, #22c55e 45%, #eab308 75%, #ef4444 100%)';

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width }} data-testid="channel-meter">
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
      <div className="relative rounded-sm border border-black bg-[#05070b] overflow-hidden" style={{ width, height }}>
        <span ref={peakL} className="absolute left-[1px]" style={{ ...bar, background: gradient, opacity: 0.45 }} />
        <span ref={peakR} className="absolute right-[1px]" style={{ ...bar, background: gradient, opacity: 0.45 }} />
        <span ref={rmsL} className="absolute left-[1px]" style={{ ...bar, background: gradient }} />
        <span ref={rmsR} className="absolute right-[1px]" style={{ ...bar, background: gradient }} />
        <span ref={holdL} className="absolute left-[1px] h-[1.5px] bg-slate-200" style={{ width: barWidth, bottom: 0 }} />
        <span ref={holdR} className="absolute right-[1px] h-[1.5px] bg-slate-200" style={{ width: barWidth, bottom: 0 }} />
        <span className="absolute inset-x-0 h-px bg-red-500/60" style={{ bottom: `${meterPos(0, FLOOR, CEIL) * height}px` }} />
      </div>
    </div>
  );
}
