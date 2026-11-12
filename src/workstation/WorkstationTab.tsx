/**
 * Tab 1 — Workstation & Sequencer: the workstation panel on top and the light song sequencer
 * below, split by a draggable divider (its position is remembered).
 */
import React, { useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { ArrangementTimeline } from '../components/sequencer/arrangement/ArrangementTimeline.tsx';
import { setUi, useUi } from '../shell/uiStore.ts';
import { WorkstationPanel } from './WorkstationPanel.tsx';
import { capturePointer } from '../ui/skin/pointer.ts';

interface Props {
  tracks: SequencerTrack[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
  onOpenSettings: () => void;
  /** Open a pattern in the piano roll (Mixer & Clip Editor tab). */
  onEditPattern: () => void;
  onMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const WorkstationTab: React.FC<Props> = ({ tracks, selectedId, onSelect, onOpenSettings, onEditPattern, onMessage }) => {
  const { split } = useUi();
  const [addRequest, setAddRequest] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const active = tracks.find((t) => t.deviceId === selectedId);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div ref={boxRef} className="flex-1 min-h-0 flex flex-col us-metal relative overflow-hidden" data-testid="workstation-tab">
      <span className="us-screw absolute left-2 top-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute right-2 top-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute left-2 bottom-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute right-2 bottom-2 z-20 pointer-events-none" aria-hidden />
      {!collapsed && (
        <div className="min-h-[190px] p-1 pb-0 transition-all" style={{ height: `${split * 100}%` }}>
          <WorkstationPanel selectedId={selectedId} onSelect={onSelect} onOpenSettings={onOpenSettings} onMessage={onMessage} addRequest={addRequest} />
        </div>
      )}
      <div
        className="h-[14px] shrink-0 cursor-row-resize flex items-center justify-between px-3 group bg-[#16120d] border-y border-[#3a2f22]"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize workstation and sequencer"
        title="Drag to resize (presets: Full Roll, 35% Balanced, 60% Workstation)"
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          e.currentTarget.onpointermove = (ev) => {
            const r = boxRef.current?.getBoundingClientRect();
            if (r) setUi({ split: Math.max(0.18, Math.min(0.75, (ev.clientY - r.top) / r.height)) });
          };
          e.currentTarget.onpointerup = (ev) => ((ev.currentTarget as HTMLElement).onpointermove = null);
        }}
        onDoubleClick={() => {
          setCollapsed(false);
          setUi({ split: 0.35 });
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-[11px] font-mono text-[#d69b50] hover:text-[#fde2b4] flex items-center gap-1 font-bold select-none py-0.5 px-1.5 rounded hover:bg-black/40 cursor-pointer"
          >
            {collapsed ? '▼ SHOW WORKSTATION' : '▲ MAX PIANO ROLL / TIMELINE'}
          </button>
          {!collapsed && (
            <>
              <button
                type="button"
                onClick={() => setUi({ split: 0.25 })}
                className="text-[11px] font-mono text-[#a8957e] hover:text-white px-1 py-0.2 rounded hover:bg-white/10"
                title="75% Piano Roll & Sequencer / 25% Workstation"
              >
                75% ROLL
              </button>
              <button
                type="button"
                onClick={() => setUi({ split: 0.35 })}
                className="text-[11px] font-mono text-[#a8957e] hover:text-white px-1 py-0.2 rounded hover:bg-white/10"
                title="65% Piano Roll & Sequencer / 35% Workstation (Balanced)"
              >
                BALANCED
              </button>
              <button
                type="button"
                onClick={() => setUi({ split: 0.58 })}
                className="text-[11px] font-mono text-[#a8957e] hover:text-white px-1 py-0.2 rounded hover:bg-white/10"
                title="58% Workstation / 42% Sequencer"
              >
                SYNTH FOCUS
              </button>
            </>
          )}
        </div>

        <div className="w-16 h-[3px] rounded bg-[#504030] group-hover:bg-[#d69b50]" />

        <span className="text-[11px] font-mono text-[#a8957e]">Drag to resize · Double-click: Balanced 35%</span>
      </div>
      <div className="flex-1 min-h-[140px] flex flex-col mx-1 mb-1 rounded-sm overflow-hidden border border-[#796d5b]/60 shadow-inner">
        <ArrangementTimeline
          theme="light"
          audioEngine={audioEngine}
          tracks={tracks}
          activeTrack={active}
          onSelectTrack={(trackId) => {
            const t = tracks.find((x) => x.id === trackId);
            if (t) onSelect(t.deviceId);
          }}
          onEditPattern={(trackId, patternId) => {
            audioEngine.sequencer.selectPattern(trackId, patternId);
            const t = tracks.find((x) => x.id === trackId);
            if (t) onSelect(t.deviceId);
            onEditPattern();
          }}
          onAudition={(trackId, note, vel) => {
            const t = tracks.find((x) => x.id === trackId);
            const dev = t ? audioEngine.devices.get(t.deviceId) : undefined;
            if (!dev?.noteOn) return;
            const now = audioEngine.ctx.currentTime;
            dev.noteOn(note, vel, now);
            dev.noteOff?.(note, now + 0.22);
          }}
          onAddInstrument={() => setAddRequest((n) => n + 1)}
        />
      </div>
    </div>
  );
};
