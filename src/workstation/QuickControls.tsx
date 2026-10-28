/**
 * The six big knobs under the LCD: quick controls of the selected part. Right-click a knob to
 * choose which parameter it drives (saved per part with the project).
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { deviceParams } from '../audio/deviceParams.ts';
import { useFrame } from '../nexa/useEngine.ts';
import { audioEngine } from '../audio/AudioEngine.ts';
import { toast } from '../shell/toast.ts';
import { RingKnob } from '../ui/skin/RingKnob.tsx';
import { midiControlChanges } from './midiControls.ts';
import { assignQuick, quickControls, QUICK_COUNT } from './partState.ts';

export const QuickControls: React.FC<{ dev: BaseDevice | null }> = ({ dev }) => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  // hardware knobs (midiControls.ts) turn these too: redraw at most once per frame
  const midiSeen = useRef(midiControlChanges.version);
  useFrame(() => {
    if (midiControlChanges.version === midiSeen.current) return;
    midiSeen.current = midiControlChanges.version;
    force();
  });
  const [menu, setMenu] = useState<{ slot: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);
  const slots = dev ? quickControls(dev) : Array<null>(QUICK_COUNT).fill(null);
  const menuParam = menu ? slots[menu.slot] ?? null : null;
  return (
    <div className="flex justify-around items-start px-2" data-testid="quick-controls">
      {slots.map((p, i) =>
        p && dev ? (
          <RingKnob
            key={i}
            value={p.value}
            min={p.min}
            max={p.max}
            curve={p.curve}
            step={p.step}
            defaultValue={p.defaultValue}
            bipolar={p.min < 0 && p.max > 0}
            size={36}
            label={p.label}
            title={`${p.label} — right-click to assign another parameter`}
            onChange={(v) => {
              dev.setParam(p.key, v);
              force();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ slot: i, x: e.clientX, y: e.clientY });
            }}
          />
        ) : (
          <RingKnob
            key={i}
            value={0}
            min={0}
            max={1}
            size={52}
            label="—"
            disabled
            title="Right-click to assign a parameter"
            onChange={() => undefined}
            onContextMenu={(e) => {
              e.preventDefault();
              if (dev) setMenu({ slot: i, x: e.clientX, y: e.clientY });
            }}
          />
        )
      )}
      {menu && dev && (
        <div
          className="fixed z-50 max-h-[320px] overflow-y-auto min-w-[200px] rounded border border-chrome-line bg-chrome-1 shadow-2xl py-1 text-[13px] text-[#d5dae0]"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 330) }}
          onPointerDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <div className="px-3 py-1 font-label font-bold text-sel">Knob {menu.slot + 1} controls…</div>
          {menuParam && dev && (
            <button
              type="button"
              className="w-full text-left px-3 py-0.5 hover:bg-sel hover:text-black"
              onClick={() => {
                const r = audioEngine.automation.createLane({ kind: 'device', deviceId: dev.id, param: menuParam.key });
                toast(r.message, r.ok ? 'success' : 'error');
                setMenu(null);
              }}
            >
              Create automation lane · {menuParam.label}
            </button>
          )}
          <button type="button" className="w-full text-left px-3 py-0.5 hover:bg-sel hover:text-black" onClick={() => { assignQuick(dev.id, menu.slot, null); setMenu(null); }}>
            Default
          </button>
          {deviceParams(dev)
            .filter((p) => !p.options)
            .map((p) => (
              <button
                key={p.key}
                type="button"
                className="w-full text-left px-3 py-0.5 hover:bg-sel hover:text-black"
                onClick={() => {
                  assignQuick(dev.id, menu.slot, p.key);
                  setMenu(null);
                }}
              >
                {p.section ? `${p.section} · ` : ''}
                {p.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
