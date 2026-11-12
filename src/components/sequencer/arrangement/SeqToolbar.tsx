/**
 * Light toolbar of the Workstation sequencer: tools (Q W E R T Y U when computer keys are
 * commands), Edit Mode, Snap + grid, Pattern / Song, add track, automation mode, zoom to fit.
 */
import React, { useState } from 'react';
import { ArrowLeftRight, Eraser, Hand, Headphones, Maximize2, MousePointer2, PenTool, Plus, Scissors, VolumeX, ZoomIn, ZoomOut, AudioLines } from 'lucide-react';
import type { SeqTool } from '../../../shell/uiStore.ts';
import type { AutoMode } from '../../../audio/automation/model.ts';
import type { TrackFolder } from '../../../audio/types.ts';
import { TrackFolderMenu } from './TrackFolderMenu.tsx';

export type SnapId = 'auto' | 'bar' | 'half' | 'beat' | '8th' | '16th' | '32nd';

const TOOLS: { id: SeqTool; Icon: React.FC<{ className?: string }>; label: string; key: string }[] = [
  { id: 'pointer', Icon: MousePointer2, label: 'Select: move, Alt = copy, edges = trim', key: 'Q' },
  { id: 'slip', Icon: ArrowLeftRight, label: 'Slip: drag clip content inside bounds', key: 'I' },
  { id: 'pencil', Icon: PenTool, label: 'Pencil: draw clips', key: 'W' },
  { id: 'eraser', Icon: Eraser, label: 'Eraser: delete clips', key: 'E' },
  { id: 'razor', Icon: Scissors, label: 'Razor: split clips', key: 'R' },
  { id: 'mute', Icon: VolumeX, label: 'Mute clips', key: 'T' },
  { id: 'audition', Icon: Headphones, label: 'Audition: click to preview audio clips', key: 'P' },
  { id: 'zoom', Icon: ZoomIn, label: 'Zoom: click = in, Alt-click = out', key: 'Y' },
  { id: 'hand', Icon: Hand, label: 'Hand: drag to scroll', key: 'U' },
];

interface Props {
  tool: SeqTool;
  onTool: (t: SeqTool) => void;
  snapOn: boolean;
  onSnapOn: (on: boolean) => void;
  snapId: SnapId;
  onSnap: (s: SnapId) => void;
  blockMode: boolean;
  onBlockMode: (on: boolean) => void;
  noteChaseEnabled: boolean;
  onNoteChaseEnabled: (on: boolean) => void;
  folders: TrackFolder[];
  activeTrackId?: string;
  activeFolderId?: string;
  onCreateTrackFolder: () => void;
  onSetTrackFolder: (folderId?: string) => void;
  paintKind: 'pattern' | 'notes';
  onPaintKind: (k: 'pattern' | 'notes') => void;
  autoMode: AutoMode;
  onAutoMode: (m: AutoMode) => void;
  onEditMode: () => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onAddAudioTrack: () => void;
  onAddMidiOutTrack?: () => void;
  onAddInstrument?: () => void;
}

export const SeqToolbar: React.FC<Props> = (p) => {
  const [addOpen, setAddOpen] = useState(false);
  const sep = <div className="w-px h-5 bg-[#634a2e] mx-1" />;
  return (
    <div className="h-[34px] shrink-0 flex items-center gap-1 px-2 border-b border-[#634a2e]" style={{ background: 'linear-gradient(180deg,#35291b,#19130e)' }} data-testid="seq-toolbar">
      <div className="flex items-center gap-0.5" role="group" aria-label="Tools">
        {TOOLS.map(({ id, Icon, label, key }) => (
          <button
            key={id}
            type="button"
            onClick={() => p.onTool(id)}
            title={`${label} (${key})`}
            aria-label={label}
            aria-pressed={p.tool === id}
            data-testid={`arr-tool-${id}`}
            className={`w-[28px] h-[26px] rounded-[4px] grid place-items-center transition-all ${p.tool === id ? 'bg-[#c89655] text-[#21160c] shadow-inner font-bold' : 'us-btn-light text-[#2c3137] hover:bg-[#fff7ea]'}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
      {sep}
      <button type="button" onClick={p.onEditMode} className="us-btn-light rounded-[4px] px-1.5 h-[26px] font-label font-bold text-[11px] leading-[10px] text-[#2c3137] hover:bg-[#fff7ea]" title="Open the selected clip in its editor (Enter)">
        EDIT
        <br />
        MODE
      </button>
      {sep}
      <button
        type="button"
        onClick={() => p.onSnapOn(!p.snapOn)}
        aria-pressed={p.snapOn}
        className={`rounded-[4px] px-2 h-[26px] font-label font-bold text-[11px] transition-all ${p.snapOn ? 'bg-[#c89655] text-[#21160c] shadow-inner' : 'us-btn-light text-[#2c3137] hover:bg-[#fff7ea]'}`}
        title="Snap to the grid (S)"
      >
        SNAP
      </button>
      <select
        value={p.snapId}
        onChange={(e) => p.onSnap(e.target.value as SnapId)}
        className="bg-[#241a12] border border-[#634a2e] rounded-[4px] px-1.5 h-[26px] font-label font-bold text-[11px] text-[#f5debe] outline-none cursor-pointer"
        title="Grid"
        aria-label="Snap grid"
      >
        <option value="auto" title="Follows the zoom: zoom in for finer lines to cut and move on">Auto</option>
        <option value="bar">Bar</option>
        <option value="half">1/2</option>
        <option value="beat">Beat</option>
        <option value="8th">1/8</option>
        <option value="16th">1/16</option>
        <option value="32nd">1/32</option>
      </select>
      {sep}
      <div className="flex rounded-[4px] overflow-hidden border border-[#634a2e]" role="group" aria-label="Pattern or Song">
        <button
          type="button"
          onClick={() => p.onBlockMode(true)}
          aria-pressed={p.blockMode}
          className={`px-2.5 h-[26px] font-label font-bold text-[11px] transition-all ${p.blockMode ? 'bg-[#c89655] text-[#21160c]' : 'bg-[#2b2116] text-[#b8a98c] hover:bg-[#382b1d]'}`}
          title="Pattern: every part loops the pattern it is on, and the transport loops with them (B)"
          data-testid="mode-pattern"
        >
          PATTERN
        </button>
        <button
          type="button"
          onClick={() => p.onBlockMode(false)}
          aria-pressed={!p.blockMode}
          className={`px-2.5 h-[26px] font-label font-bold text-[11px] transition-all ${!p.blockMode ? 'bg-[#c89655] text-[#21160c]' : 'bg-[#2b2116] text-[#b8a98c] hover:bg-[#382b1d]'}`}
          title="Song: plays the clips placed in the arrangement (B)"
          data-testid="mode-song"
        >
          SONG
        </button>
      </div>
      <TrackFolderMenu
        folders={p.folders}
        activeTrackId={p.activeTrackId}
        activeFolderId={p.activeFolderId}
        light
        onCreate={p.onCreateTrackFolder}
        onAssign={p.onSetTrackFolder}
      />
      <button
        type="button"
        onClick={() => p.onNoteChaseEnabled(!p.noteChaseEnabled)}
        aria-pressed={p.noteChaseEnabled}
        className={`rounded-[4px] px-2 h-[26px] font-label font-bold text-[11px] transition-all ${p.noteChaseEnabled ? 'bg-[#c89655] text-[#21160c]' : 'us-btn-light text-[#504538]'}`}
        title="When enabled, sustained notes continue when playback starts or seeks into them"
        data-testid="note-chase"
      >
        CHASE {p.noteChaseEnabled ? 'ON' : 'OFF'}
      </button>
      <select
        value={p.paintKind}
        onChange={(e) => p.onPaintKind(e.target.value as 'pattern' | 'notes')}
        className="us-btn-light rounded-[4px] px-1.5 h-[26px] text-[11px] font-label font-semibold text-[#2c3137]"
        title="What the pencil draws"
        data-testid="arr-paint-kind"
      >
        <option value="pattern">Pencil: pattern clip</option>
        <option value="notes">Pencil: note clip</option>
      </select>
      <div className="relative">
        <button type="button" onClick={() => setAddOpen((v) => !v)} className="w-[26px] h-[26px] rounded-full us-btn-light grid place-items-center text-[#2c3137] hover:bg-[#fff7ea]" title="Add a track" aria-label="Add a track">
          <Plus className="w-3.5 h-3.5" />
        </button>
        {addOpen && (
          <div className="absolute z-50 top-[30px] left-0 min-w-[170px] rounded border border-[#8f959c] bg-white shadow-xl py-1 text-[13px] text-[#2c3137]" onPointerLeave={() => setAddOpen(false)}>
            {p.onAddInstrument && (
              <button type="button" className="w-full text-left px-3 py-1 hover:bg-[#ffd59b]" onClick={() => { setAddOpen(false); p.onAddInstrument?.(); }}>
                Instrument part…
              </button>
            )}
            <button type="button" className="w-full text-left px-3 py-1 hover:bg-[#ffd59b] flex items-center gap-1" onClick={() => { setAddOpen(false); p.onAddAudioTrack(); }} data-testid="arr-add-audio-track">
              <AudioLines className="w-3.5 h-3.5" /> Audio track
            </button>
            {p.onAddMidiOutTrack && (
              <button type="button" className="w-full text-left px-3 py-1 hover:bg-[#ffd59b]" onClick={() => { setAddOpen(false); p.onAddMidiOutTrack?.(); }} data-testid="arr-add-midi-out-track">
                MIDI Out track
              </button>
            )}
          </div>
        )}
      </div>
      <label className="flex items-center gap-1 font-label font-bold text-[13px] text-[#d6b074] bg-[#241a12] border border-[#634a2e] px-1.5 rounded-[4px] h-[26px]" title="Automation mode (TOUCH / LATCH / WRITE record control moves while playing)">
        ∿
        <select value={p.autoMode} onChange={(e) => p.onAutoMode(e.target.value as AutoMode)} className="bg-transparent text-[11px] text-[#f5debe] font-bold outline-none cursor-pointer" data-testid="arr-auto-mode">
          {(['read', 'touch', 'latch', 'write', 'off'] as const).map((m) => (
            <option key={m} value={m} className="bg-[#241a12] text-[#f5debe]">
              {m.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="flex-1" />
      <button type="button" onClick={() => p.onZoom(1 / 1.4)} className="w-[26px] h-[26px] us-btn-light rounded-[4px] grid place-items-center text-[#2c3137]" title="Zoom out (Ctrl+wheel)" aria-label="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => p.onZoom(1.4)} className="w-[26px] h-[26px] us-btn-light rounded-[4px] grid place-items-center text-[#2c3137]" title="Zoom in (Ctrl+wheel)" aria-label="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={p.onFit} className="w-[26px] h-[26px] us-btn-light rounded-[4px] grid place-items-center text-[#2c3137]" title="Zoom to fit the song" aria-label="Zoom to fit">
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
