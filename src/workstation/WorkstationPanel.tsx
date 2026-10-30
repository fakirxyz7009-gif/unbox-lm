/**
 * The workstation front panel: part list, LCD editor with quick-control knobs, the side
 * function buttons (LOAD / EDIT / MIDI / MIX / FX / COMBI / SETUP) and the keyboard.
 */
import React, { useEffect, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { isLinked } from '../audio/liveLink.ts';
import { useEngineVersion } from '../nexa/useEngine.ts';
import { useClipFocus } from '../shell/clipFocus.ts';
import { MetalPanel, PanelButton } from '../ui/skin/panel.tsx';
import { PartList } from './PartList.tsx';
import { LcdEditor, type LcdPage } from './LcdEditor.tsx';
import { QuickControls } from './QuickControls.tsx';
import { WorkstationKeyboard } from './WorkstationKeyboard.tsx';
import { PatchBrowser } from './PatchBrowser.tsx';
import { EditWindow } from './EditWindow.tsx';

interface Props {
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
  onOpenSettings: () => void;
  onMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Bumped by the sequencer's "+ Instrument part": opens LOAD in add mode. */
  addRequest: number;
}

export const WorkstationPanel: React.FC<Props> = ({ selectedId, onSelect, onOpenSettings, onMessage, addRequest }) => {
  useEngineVersion();
  const [page, setPage] = useState<LcdPage>('easy');
  const [load, setLoad] = useState<{ track: SequencerTrack | null } | null>(null);
  useEffect(() => {
    if (addRequest > 0) setLoad({ track: null });
  }, [addRequest]);
  const [editing, setEditing] = useState(false);
  const focus = useClipFocus();
  const allTracks = audioEngine.tracks;
  // Parts are playable instruments: audio tracks (recordings, frozen renders) live in the
  // arrangement and mixer, not in the part list.
  const parts = allTracks.filter((t) => t.kind !== 'audio');

  // Prioritize the track of the focused audio clip selected in the grey timeline / MIDI interface
  const focusedTrack = focus ? allTracks.find((t) => t.id === focus.trackId) : null;
  const focusedClip = focusedTrack?.arrangementClips?.find((c) => c.id === focus?.clipId);
  const isAudioClipFocused = focusedClip?.kind === 'audio' || !!focusedClip?.audioId;

  // If the user selected a part in the PartList / Rack (selectedId), ALWAYS prioritize that active instrument!
  const selectedTrack = selectedId ? allTracks.find((t) => t.deviceId === selectedId) : null;
  const track = selectedTrack ?? (isAudioClipFocused && focusedTrack ? focusedTrack : parts[0] ?? null);
  const dev = track ? audioEngine.devices.get(track.deviceId) ?? null : null;

  useEffect(() => {
    if (isAudioClipFocused) {
      setPage('easy');
    }
  }, [isAudioClipFocused, focus?.clipId]);

  const toggle = (p: LcdPage) => setPage((cur) => (cur === p ? 'easy' : p));

  return (
    <MetalPanel className="h-full flex flex-col gap-1 px-2 pt-1.5 pb-1 min-h-0" screws>
      <div className="flex-1 min-h-0 flex gap-2 px-1">
        <div className="w-[38%] min-w-[340px] min-h-0">
          <PartList parts={parts} selectedId={track?.deviceId ?? null} onSelect={onSelect} onLoad={(t) => setLoad({ track: t })} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1 min-h-0">
          <div className="flex-1 min-h-[130px]">
            <LcdEditor key={dev?.id ?? 'none'} dev={dev} track={track} parts={parts} page={page} onPage={setPage} />
          </div>
          <QuickControls dev={dev} />
        </div>
        <div className="w-[70px] shrink-0 flex flex-col justify-between items-center py-0.5 min-h-0 overflow-y-auto" role="toolbar" aria-label="Workstation functions">
          <PanelButton label="LOAD" title="Load an instrument for this part (or add a part)" onClick={() => setLoad({ track })} testId="ws-load" />
          <PanelButton label="EDIT" title="Open this part's full instrument panel" active={editing && !!dev} onClick={() => setEditing((v) => !v)} testId="ws-edit" />
          <PanelButton label="CLIP" title="Audio clip editor: trim duration, split and slice audio" active={page === 'clip'} onClick={() => toggle('clip')} testId="ws-clip" />
          <PanelButton label="MIDI" title="Keyboard, MIDI input and recording for this part" active={page === 'midi'} onClick={() => toggle('midi')} testId="ws-midi" />
          <PanelButton label="MIX" title="Level, pan, width, trim and sends" active={page === 'mix'} onClick={() => toggle('mix')} testId="ws-mix" />
          <PanelButton label="FX" title="Insert effects of this part" active={page === 'fx'} onClick={() => toggle('fx')} testId="ws-fx" />
          <PanelButton label="COMBI" title="Layer parts (LINK) and combine them" active={page === 'combi'} led={parts.some((p) => p.id !== track?.id && isLinked(p.deviceId))} onClick={() => toggle('combi')} testId="ws-combi" />
          <PanelButton label="SETUP" title="Settings: audio output, MIDI, monitor" onClick={onOpenSettings} testId="ws-setup" />
        </div>
      </div>
      <div className="h-[90px] shrink-0 px-1">
        <WorkstationKeyboard dev={dev} track={track} />
      </div>
      {load && (
        <PatchBrowser
          track={load.track}
          partNo={load.track ? parts.indexOf(load.track) + 1 : parts.length + 1}
          onClose={() => setLoad(null)}
          onChosen={(id) => {
            onSelect(id);
            onMessage(`Loaded ${audioEngine.devices.get(id)?.name ?? 'instrument'}`, 'success');
          }}
        />
      )}
      {editing && dev && <EditWindow dev={dev} onClose={() => setEditing(false)} onMessage={onMessage} />}
    </MetalPanel>
  );
};

