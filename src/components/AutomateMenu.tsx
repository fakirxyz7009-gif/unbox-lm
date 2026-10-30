/**
 * Right-click on a knob → "Create automation lane". The lane goes under the knob's track in the
 * song sequencer (AutomationController.createLane); the result shows as a toast. Knobs call
 * `automateMenuAt`; App mounts `AutomateMenu` once.
 */
import React, { useEffect, useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { AutoTarget } from '../audio/automation/model.ts';
import { toast } from '../shell/toast.ts';

interface OpenMenu {
  x: number;
  y: number;
  name: string;
  target: AutoTarget;
}

let current: OpenMenu | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

/** Opens the menu at the pointer for a knob; `name` says what it is ("Subtractor · Cutoff"). */
export function openAutomateMenu(x: number, y: number, name: string, target: AutoTarget): void {
  current = { x, y, name, target };
  emit();
}

/** Handles a right-click on a knob: suppresses the browser menu and opens the automate menu. */
export function automateMenuAt(e: React.MouseEvent, name: string, target: AutoTarget): void {
  e.preventDefault();
  openAutomateMenu(e.clientX, e.clientY, name, target);
}

export function AutomateMenu() {
  const open = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      current = null;
      emit();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!open) return null;
  const exists = !!audioEngine.automation.lane(open.target);
  return (
    <div
      role="menu"
      data-testid="automate-menu"
      className="fixed z-50 min-w-[220px] rounded border border-chrome-line bg-chrome-1 shadow-2xl py-1 text-[12px] text-[#d5dae0]"
      style={{ left: Math.max(0, Math.min(open.x, window.innerWidth - 240)), top: Math.max(0, Math.min(open.y, window.innerHeight - 80)) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1 font-label font-bold text-sel truncate">{open.name}</div>
      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-0.5 hover:bg-sel hover:text-black"
        onClick={() => {
          const r = audioEngine.automation.createLane(open.target);
          toast(r.message, r.ok ? 'success' : 'error');
          current = null;
          emit();
        }}
      >
        {exists ? 'Automation lane exists (song sequencer)' : 'Create automation lane'}
      </button>

      <div className="border-t border-neutral-700/60 my-1 pt-1 px-3 text-[10px] text-cyan-400 font-mono font-bold flex items-center justify-between">
        <span>⚡ LOCAL AI AUTO-CURVES</span>
        <span className="text-[9px] text-emerald-400">ON-DEVICE</span>
      </div>

      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-0.5 hover:bg-cyan-500 hover:text-black text-[11px]"
        onClick={async () => {
          const { localHardwareAi } = await import('../ai/hardware/localHardwareAiEngine.ts');
          let lane = audioEngine.automation.lane(open.target);
          if (!lane) {
            lane = audioEngine.automation.addLane(open.target, 'read');
          }
          const { points } = localHardwareAi.generateAutomationOnHardware('sidechain_pump', 4);
          audioEngine.automation.setPoints(lane.id, points);
          toast(`Sidechain ducking pump applied to ${open.name}`, 'success');
          current = null;
          emit();
        }}
      >
        Sidechain ducking pump (4 bars, fixed shape)
      </button>

      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-0.5 hover:bg-cyan-500 hover:text-black text-[11px]"
        onClick={async () => {
          const { localHardwareAi } = await import('../ai/hardware/localHardwareAiEngine.ts');
          let lane = audioEngine.automation.lane(open.target);
          if (!lane) {
            lane = audioEngine.automation.addLane(open.target, 'read');
          }
          const { points } = localHardwareAi.generateAutomationOnHardware('riser_sweep', 4);
          audioEngine.automation.setPoints(lane.id, points);
          toast(`Filter riser sweep applied to ${open.name}`, 'success');
          current = null;
          emit();
        }}
      >
        Filter riser sweep (4 bars, fixed shape)
      </button>

      <button
        type="button"
        role="menuitem"
        className="w-full text-left px-3 py-0.5 hover:bg-cyan-500 hover:text-black text-[11px]"
        onClick={async () => {
          const { localHardwareAi } = await import('../ai/hardware/localHardwareAiEngine.ts');
          let lane = audioEngine.automation.lane(open.target);
          if (!lane) {
            lane = audioEngine.automation.addLane(open.target, 'read');
          }
          const { points } = localHardwareAi.generateAutomationOnHardware('lfo_wobble', 4);
          audioEngine.automation.setPoints(lane.id, points);
          toast(`LFO wobble applied to ${open.name}`, 'success');
          current = null;
          emit();
        }}
      >
        LFO wobble (4 bars, fixed shape)
      </button>
    </div>
  );
}
