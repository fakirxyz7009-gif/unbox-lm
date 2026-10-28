/**
 * Channel EQ curve. Small and passive in a strip; large and editable in the inspector, where the
 * band handles drag frequency (x) and gain (y), the wheel over a bell band sets its Q, and
 * double-click resets a band (or switches a high / low-pass off).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import type { ChannelEq } from '../../audio/types.ts';
import { EQ_RANGE } from '../../audio/mixer/channelStrip.ts';
import { capturePointer } from '../../ui/skin/pointer.ts';
import { eqResponseDb, logFreqs } from './eqCurve.ts';

type Handle = 'hp' | 'low' | 'lm' | 'hm' | 'high' | 'lp';

const DB = 18;
const COLORS: Record<Handle, string> = { hp: '#94a3b8', low: '#f59e0b', lm: '#22c55e', hm: '#38bdf8', high: '#a78bfa', lp: '#94a3b8' };
const LABEL: Record<Handle, string> = { hp: 'HP', low: 'LO', lm: 'LM', hm: 'HM', high: 'HI', lp: 'LP' };
const HZ_KEY: Record<Handle, keyof ChannelEq> = { hp: 'hpHz', low: 'lowHz', lm: 'lmHz', hm: 'hmHz', high: 'highHz', lp: 'lpHz' };
const DB_KEY: Partial<Record<Handle, keyof ChannelEq>> = { low: 'lowDb', lm: 'lmDb', hm: 'hmDb', high: 'highDb' };
const HZ_RANGE: Record<Handle, readonly [number, number]> = {
  hp: EQ_RANGE.hpHz,
  low: EQ_RANGE.lowHz,
  lm: EQ_RANGE.lmHz,
  hm: EQ_RANGE.hmHz,
  high: EQ_RANGE.highHz,
  lp: EQ_RANGE.lpHz,
};

const xOf = (f: number, w: number) => (Math.log10(f / 20) / 3) * w;
const fOf = (x: number, w: number) => 20 * Math.pow(1000, Math.max(0, Math.min(1, x / w)));
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));

interface Props {
  eq: ChannelEq;
  width: number;
  height: number;
  color?: string;
  /** Editable handles (inspector). */
  onChange?: (patch: Partial<ChannelEq>) => void;
  onCommit?: () => void;
}

export const EqCurve: React.FC<Props> = ({ eq, width, height, color = '#20d3ee', onChange, onCommit }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Handle | null>(null);
  const editable = !!onChange;
  const freqs = useMemo(() => logFreqs(Math.max(32, Math.round(width / 2))), [width]);
  const yOf = (db: number) => height / 2 - (db / DB) * (height / 2 - 6);

  const handles = (): { h: Handle; x: number; y: number }[] =>
    (Object.keys(HZ_KEY) as Handle[])
      .filter((h) => editable || (h !== 'hp' && h !== 'lp'))
      .map((h) => {
        const dbKey = DB_KEY[h];
        // pass filters have no gain: their handles ride low in the display
        return { h, x: xOf(eq[HZ_KEY[h]] as number, width), y: dbKey ? yOf(eq[dbKey] as number) : height * 0.82 };
      });

  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#0b0e11';
    g.fillRect(0, 0, width, height);
    // grid
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    if (editable) {
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        const x = Math.round(xOf(f, width)) + 0.5;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, height);
        g.stroke();
      }
      for (const db of [-12, -6, 6, 12]) {
        const y = Math.round(yOf(db)) + 0.5;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(width, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(163,171,181,0.6)';
      g.font = '9px "JetBrains Mono", monospace';
      [100, 1000, 10000].forEach((f) => g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, xOf(f, width) + 2, height - 3));
      [12, -12].forEach((db) => g.fillText(`${db > 0 ? '+' : ''}${db}`, 2, yOf(db) - 2));
    }
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(0, Math.round(yOf(0)) + 0.5);
    g.lineTo(width, Math.round(yOf(0)) + 0.5);
    g.stroke();
    // curve: the live one, or (editor, EQ off) the one it would be, dimmed
    const shown = eq.on || !editable ? eq : { ...eq, on: true };
    const resp = eqResponseDb(shown, freqs);
    const alpha = eq.on ? 1 : 0.35;
    g.globalAlpha = alpha;
    g.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = (i / (freqs.length - 1)) * width;
      const y = Math.max(1, Math.min(height - 1, yOf(resp[i])));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = color;
    g.lineWidth = editable ? 2 : 1.5;
    g.stroke();
    g.lineTo(width, yOf(0));
    g.lineTo(0, yOf(0));
    g.closePath();
    g.fillStyle = `${color}22`;
    g.fill();
    g.globalAlpha = 1;
    if (!editable) return;
    for (const { h, x, y } of handles()) {
      const off = (h === 'hp' && !eq.hpOn) || (h === 'lp' && !eq.lpOn);
      g.globalAlpha = off ? 0.4 : eq.on ? 1 : 0.6;
      g.fillStyle = COLORS[h];
      g.beginPath();
      g.arc(x, y, 6.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#0b0e11';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#0b0e11';
      g.font = 'bold 7px "JetBrains Mono", monospace';
      g.textAlign = 'center';
      g.fillText(LABEL[h], x, y + 2.5);
      g.textAlign = 'start';
    }
    g.globalAlpha = 1;
  }, [eq, width, height, color, freqs, editable]);

  // Wheel over a bell band = Q (non-passive so the page doesn't scroll).
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !editable) return;
    const onWheel = (e: WheelEvent) => {
      const h = nearest(e);
      if (h !== 'lm' && h !== 'hm') return;
      e.preventDefault();
      const q = clamp((h === 'lm' ? eq.lmQ : eq.hmQ) * (e.deltaY < 0 ? 1.12 : 1 / 1.12), EQ_RANGE.q);
      onChange?.(h === 'lm' ? { lmQ: q } : { hmQ: q });
      onCommit?.();
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const nearest = (e: { clientX: number; clientY: number }): Handle | null => {
    const p = local(e);
    let best: Handle | null = null;
    let bestD = 14;
    for (const { h, x, y } of handles()) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  };

  const move = (h: Handle, e: { clientX: number; clientY: number }) => {
    const p = local(e);
    const patch: Record<string, number | boolean> = { [HZ_KEY[h]]: Math.round(clamp(fOf(p.x, width), HZ_RANGE[h])) };
    const dbKey = DB_KEY[h];
    if (dbKey) patch[dbKey] = Math.round(clamp(((height / 2 - p.y) / (height / 2 - 6)) * DB, EQ_RANGE.db) * 2) / 2;
    if (h === 'hp') patch.hpOn = true;
    if (h === 'lp') patch.lpOn = true;
    if (!eq.on) patch.on = true; // grabbing a band switches the EQ in
    onChange?.(patch as Partial<ChannelEq>);
  };

  return (
    <canvas
      ref={ref}
      style={{ width, height, cursor: editable ? 'crosshair' : 'pointer', touchAction: 'none' }}
      className="block rounded-[3px] border border-black"
      aria-label={editable ? 'EQ curve — drag the band handles' : 'EQ curve'}
      onPointerDown={(e) => {
        if (!editable || e.button !== 0) return;
        const h = nearest(e);
        if (!h) return;
        capturePointer(e.currentTarget, e.pointerId);
        drag.current = h;
      }}
      onPointerMove={(e) => drag.current && move(drag.current, e)}
      onPointerUp={() => {
        if (drag.current) onCommit?.();
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        const h = editable ? nearest(e) : null;
        if (!h) return;
        if (h === 'hp') onChange?.({ hpOn: !eq.hpOn });
        else if (h === 'lp') onChange?.({ lpOn: !eq.lpOn });
        else onChange?.({ [DB_KEY[h] as string]: 0 } as Partial<ChannelEq>);
        onCommit?.();
      }}
    />
  );
};
