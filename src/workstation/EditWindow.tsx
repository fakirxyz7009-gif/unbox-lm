/** EDIT: the selected part's full instrument panel in a floating, draggable window. */
import React, { useReducer, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { DeviceFront } from '../rack/DeviceFront.tsx';
import { capturePointer } from '../ui/skin/pointer.ts';
import { useEscapeKey } from '../shell/useEscapeKey.ts';

export const EditWindow: React.FC<{ dev: BaseDevice; onClose: () => void; onMessage: (msg: string, type: 'success' | 'error' | 'info') => void }> = ({ dev, onClose, onMessage }) => {
  useEscapeKey(onClose);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [pos, setPos] = useState({ x: Math.max(20, window.innerWidth / 2 - 480), y: 70 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  return (
    <div
      className="fixed z-40 w-[960px] max-w-[96vw] max-h-[80vh] flex flex-col rounded-lg border border-chrome-line bg-chrome-1 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={`Edit ${dev.name}`}
      data-testid="edit-window"
    >
      <div
        className="h-8 shrink-0 flex items-center gap-2 px-3 cursor-move us-chrome rounded-t-lg"
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPos({ x: Math.max(0, d.px + e.clientX - d.x), y: Math.max(0, d.py + e.clientY - d.y) });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <span className="font-label font-bold text-[13px] text-white flex-1 truncate">EDIT · {dev.name}</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="w-6 h-6 rounded grid place-items-center hover:bg-white/10" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        <DeviceFront device={dev} onUpdate={force} onMessage={onMessage} />
      </div>
    </div>
  );
};
