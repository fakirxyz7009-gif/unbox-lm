/**
 * Clip Editor area (lower half of the Mixer & Clip Editor tab, or full screen when maximized):
 * the "Clip" tab edits the selected clip; the other tabs show the pattern / song editors
 * (step grid, piano roll, graph & CC, drum editor, clips & scenes, arrangement) without their own tab row.
 */
import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { SequencerTabMode } from '../components/sequencer/SequencerView.tsx';
import { useClipFocus } from '../shell/clipFocus.ts';
import { setUi, useUi } from '../shell/uiStore.ts';
import { ClipFocusEditor } from './ClipFocusEditor.tsx';

export type EditorRequest = { tab: string; seq: number };
type EditorTab = 'clip' | SequencerTabMode;

const TABS: { id: EditorTab; label: string; title: string }[] = [
  { id: 'clip', label: 'Clip', title: 'The clip selected in the song: piano roll for note clips, waveform for audio clips' },
  { id: 'channel_rack', label: 'Step grid', title: 'Step grid of every part (Shift+1)' },
  { id: 'piano_roll', label: 'Piano roll', title: "Piano roll of the selected part's pattern (Shift+2)" },
  { id: 'arrangement', label: 'Arrangement', title: 'Song arrangement, dark view (Shift+3)' },
  { id: 'graph_editor', label: 'Graph & CC', title: 'Velocity, pitch, cutoff and resonance lanes (Shift+4)' },
  { id: 'drum_editor', label: 'Drum editor', title: 'Drum lanes (Shift+5)' },
  { id: 'loop_tracker', label: 'Clips & scenes', title: 'Clip launcher and scenes (Shift+6)' },
];

interface Props {
  /** Open a given editor (main menu, workstation "edit pattern"). */
  request: EditorRequest | null;
  renderSequencer: (request: EditorRequest, onModeChange: (mode: SequencerTabMode) => void) => React.ReactNode;
  onSelectPart: (deviceId: string) => void;
}

export function ClipEditorArea({ request, renderSequencer, onSelectPart }: Props) {
  const [tab, setTab] = useState<EditorTab>('clip');
  const [seqReq, setSeqReq] = useState<EditorRequest>({ tab: 'channel_rack', seq: 0 });
  const focus = useClipFocus();
  const { mixerLayout } = useUi();
  const isFullscreen = mixerLayout === 'clip';

  useEffect(() => {
    if (!request) return;
    setTab(request.tab as SequencerTabMode);
    setSeqReq(request);
  }, [request]);

  const open = (t: EditorTab) => {
    setTab(t);
    if (t !== 'clip') setSeqReq({ tab: t, seq: Date.now() });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0b0e12]" data-testid="clip-editor-area">
      <div className="rack-toolbar">
        <span className="font-label font-bold text-[13px] tracking-[0.2em] text-white mr-1">CLIP EDITOR</span>
        <div className="rack-seg" role="tablist" aria-label="Editors">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} title={t.title} onClick={() => open(t.id)}>
              {t.label}
              {t.id === 'clip' && focus && tab !== 'clip' ? ' •' : ''}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Fullscreen / Split toggle */}
        <div className="flex items-center gap-1.5 mr-1">
          <div className="rack-seg" role="group" aria-label="Layout view mode">
            <button
              type="button"
              onClick={() => setUi({ mixerLayout: 'split' })}
              aria-pressed={mixerLayout === 'split'}
              title="Split view (Mixer console above, Clip Editor below)"
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setUi({ mixerLayout: 'clip' })}
              aria-pressed={isFullscreen}
              title="Full screen Clip Editor (F10)"
            >
              Full Screen
            </button>
          </div>

          <button
            type="button"
            className="rack-tool font-bold"
            onClick={() => setUi({ mixerLayout: isFullscreen ? 'split' : 'clip' })}
            title={isFullscreen ? 'Restore split view with Mixer (F10 / Esc)' : 'Expand Clip Editor to full screen (F10)'}
            aria-pressed={isFullscreen}
            data-testid="clip-editor-fullscreen-btn"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-sel" /> : <Maximize2 className="w-3.5 h-3.5 text-sel" />}
            <span>{isFullscreen ? 'Split View' : 'Full Screen'}</span>
          </button>
        </div>
      </div>
      {tab === 'clip' ? (
        <ClipFocusEditor onOpenEditor={(t) => open(t)} onSelectPart={onSelectPart} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{renderSequencer(seqReq, (mode) => setTab((cur) => (cur === 'clip' ? cur : mode)))}</div>
      )}
    </div>
  );
}
