/**
 * Tab 3 — Mixer & Clip Editor: the console on top and the clip editor below, split by a draggable
 * divider (its position is remembered); or full screen for either the clip editor or the console.
 * The keyboard dock (Alt+K) sits at the bottom.
 */
import React, { useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StudioMixer } from '../components/mixer/StudioMixer.tsx';
import type { SequencerTabMode } from '../components/sequencer/SequencerView.tsx';
import { setUi, useUi } from '../shell/uiStore.ts';
import { capturePointer } from '../ui/skin/pointer.ts';
import { ClipEditorArea, type EditorRequest } from './ClipEditorArea.tsx';

/**
 * Wrapper height (console toolbar included) that keeps a channel strip's fader readout inside the
 * split at 1280×800 with the keyboard dock open. The strip's fixed lower block is ~237 px and the
 * toolbar is ~41 px.
 */
const MIN_SPLIT_MIXER_HEIGHT = 292;

interface Props {
  request: EditorRequest | null;
  renderSequencer: (request: EditorRequest, onModeChange: (mode: SequencerTabMode) => void) => React.ReactNode;
  selectedPart: string | null;
  onSelectPart: (deviceId: string) => void;
  onOpenDevice: (deviceId: string) => void;
  keyboardDock: React.ReactNode;
}

export function MixerTab({ request, renderSequencer, selectedPart, onSelectPart, onOpenDevice, keyboardDock }: Props) {
  const { mixSplit, mixerLayout } = useUi();
  const boxRef = useRef<HTMLDivElement>(null);

  const isClipFull = mixerLayout === 'clip';
  const isMixerFull = mixerLayout === 'mixer';
  const isSplit = !isClipFull && !isMixerFull;

  return (
    <div className="flex-1 min-h-0 flex flex-col us-metal relative overflow-hidden" data-testid="mixer-tab">
      <span className="us-screw absolute left-2 top-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute right-2 top-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute left-2 bottom-2 z-20 pointer-events-none" aria-hidden />
      <span className="us-screw absolute right-2 bottom-2 z-20 pointer-events-none" aria-hidden />
      <div ref={boxRef} className="flex-1 min-h-0 flex flex-col">
        {/* Mixer console: hidden when Clip Editor is full screen */}
        <div
          className={`flex flex-col ${isClipFull ? 'hidden' : isMixerFull ? 'flex-1 min-h-0' : ''}`}
          style={isSplit ? { height: `${mixSplit * 100}%`, minHeight: MIN_SPLIT_MIXER_HEIGHT } : undefined}
        >
          <StudioMixer onOpenDevice={onOpenDevice} selectedPart={selectedPart} onSelectPart={onSelectPart} />
        </div>

        {/* Resizable Divider (visible in split view) */}
        {isSplit && (
          <div
            className="h-[10px] shrink-0 cursor-row-resize flex items-center justify-center group bg-[#c6d1bb] border-y border-[#8b9880] relative select-none"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize mixer and clip editor"
            title="Drag to resize (double-click: reset 50/50, drag to top/bottom to maximize)"
            onPointerDown={(e) => {
              capturePointer(e.currentTarget, e.pointerId);
              e.currentTarget.onpointermove = (ev) => {
                const r = boxRef.current?.getBoundingClientRect();
                if (r) {
                  const frac = (ev.clientY - r.top) / r.height;
                  const minFrac = Math.min(0.88, MIN_SPLIT_MIXER_HEIGHT / r.height);
                  if (frac < 0.12) {
                    setUi({ mixerLayout: 'clip' });
                  } else if (frac > 0.88) {
                    setUi({ mixerLayout: 'mixer' });
                  } else {
                    setUi({ mixSplit: Math.max(minFrac, Math.min(0.88, frac)) });
                  }
                }
              };
              e.currentTarget.onpointerup = (ev) => ((ev.currentTarget as HTMLElement).onpointermove = null);
            }}
            onDoubleClick={() => setUi({ mixSplit: 0.5, mixerLayout: 'split' })}
          >
            {/* Collapse to Clip Editor quick control */}
            <div className="absolute left-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUi({ mixerLayout: 'clip' });
                }}
                className="text-[11px] font-label font-bold text-[#3f4e37] hover:text-sel flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#e2e9d7] border border-[#8b9880]"
                title="Full screen Clip Editor (F10)"
              >
                <ChevronUp className="w-3 h-3 text-sel" /> Clip Editor (Full)
              </button>
            </div>

            <div className="w-16 h-[3px] rounded bg-[#3a3f46] group-hover:bg-sel" />

            {/* Collapse to Mixer quick control */}
            <div className="absolute right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUi({ mixerLayout: 'mixer' });
                }}
                className="text-[11px] font-label font-bold text-[#3f4e37] hover:text-sel flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#e2e9d7] border border-[#8b9880]"
                title="Full screen Mixer"
              >
                Mixer (Full) <ChevronDown className="w-3 h-3 text-sel" />
              </button>
            </div>
          </div>
        )}

        {/* Clip Editor: hidden when Mixer is full screen */}
        <div className={`flex-1 min-h-0 flex flex-col ${isMixerFull ? 'hidden' : ''}`}>
          <ClipEditorArea request={request} renderSequencer={renderSequencer} onSelectPart={onSelectPart} />
        </div>
      </div>
      {keyboardDock}
    </div>
  );
}
