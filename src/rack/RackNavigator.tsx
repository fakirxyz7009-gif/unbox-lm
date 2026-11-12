/**
 * Rack navigator: a miniature of the three columns with the visible area framed. Click or drag
 * in it to scroll the rack. Unit rectangles are measured only when the layout changes (the jack
 * registry's resize signal); scrolling only redraws the frame.
 */
import React, { useEffect, useRef } from 'react';
import { capturePointer } from '../ui/skin/pointer.ts';
import type { JackRegistry } from './jackRegistry.ts';

const COLORS: Record<string, string> = {
  instrument: '#e8a33d',
  effect: '#4f8fd9',
  utility: '#8b95a3',
  group: '#d9466a',
  channels: '#5fae6a',
  hw: '#c9ced6',
  column: '#15181d',
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface Props {
  scroller: HTMLElement | null;
  content: HTMLElement | null;
  registry: JackRegistry;
  /** Changes when units move, fold or change: re-measure. */
  layoutKey: string;
}

export const RackNavigator: React.FC<Props> = ({ scroller, content, registry, layoutKey }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rects = useRef<Rect[]>([]);
  const size = useRef({ w: 1, h: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scroller || !content) return;
    let frame = 0;

    const scale = () => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      return Math.min(cw / Math.max(1, size.current.w), ch / Math.max(1, size.current.h));
    };

    const draw = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      const s = scale();
      for (const r of rects.current) {
        g.fillStyle = r.color;
        g.fillRect(r.x * s, r.y * s, Math.max(1, r.w * s), Math.max(1, r.h * s - 0.5));
      }
      g.strokeStyle = '#d8ad6d';
      g.lineWidth = 1.5;
      g.fillStyle = 'rgba(216, 173, 109, 0.12)';
      const vx = scroller.scrollLeft * s;
      const vy = scroller.scrollTop * s;
      const vw = scroller.clientWidth * s;
      const vh = scroller.clientHeight * s;
      g.fillRect(vx, vy, vw, vh);
      g.strokeRect(vx + 0.75, vy + 0.75, Math.max(2, vw - 1.5), Math.max(2, vh - 1.5));
    };
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const measure = () => {
      const box = content.getBoundingClientRect();
      size.current = { w: content.scrollWidth, h: content.scrollHeight };
      const out: Rect[] = [];
      const add = (el: Element, color: string) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) out.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, color });
      };
      content.querySelectorAll('[data-rack-col]').forEach((el) => add(el, COLORS.column));
      content.querySelectorAll('[data-nav]').forEach((el) => add(el, COLORS[(el as HTMLElement).dataset.nav ?? ''] ?? COLORS.utility));
      rects.current = out;
      redraw();
    };

    // the observer's first report (after the browser's layout) does the initial measure; measuring
    // here forced a full rack layout during every tab switch
    const off = registry.onChange(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    ro.observe(canvas);
    scroller.addEventListener('scroll', redraw, { passive: true });
    return () => {
      off();
      ro.disconnect();
      scroller.removeEventListener('scroll', redraw);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, content, registry, layoutKey]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !scroller) return;
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width / Math.max(1, size.current.w), r.height / Math.max(1, size.current.h));
    scroller.scrollTo({ left: (e.clientX - r.left) / s - scroller.clientWidth / 2, top: (e.clientY - r.top) / s - scroller.clientHeight / 2 });
  };

  return (
    <div className="rack-nav" aria-label="Rack navigator">
      <canvas
        ref={canvasRef}
        className="rack-nav-canvas"
        title="Navigator — click or drag to scroll the rack"
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => e.buttons & 1 && jump(e)}
      />
    </div>
  );
};
