/**
 * Workstation part list: one row per instrument track — number, MUTE, LINK (layer with the
 * selected part from the keyboard / MIDI), PATCH (click = select, double-click = LOAD) and a
 * LEVEL bar on the part's mixer channel with a live meter.
 */
import React, { useReducer, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { SequencerTrack } from '../audio/types.ts';
import { isLinked, setLinked } from '../audio/liveLink.ts';
import { LevelBar } from '../ui/skin/LevelBar.tsx';
import { LedButton } from '../ui/skin/panel.tsx';
import { useChannelAutomation, useFrame } from '../nexa/useEngine.ts';
import { midiControlChanges } from './midiControls.ts';

interface Props {
  parts: SequencerTrack[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
  onLoad: (track: SequencerTrack) => void;
}

export const PartList: React.FC<Props> = ({ parts, selectedId, onSelect, onLoad }) => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useChannelAutomation(parts.map((t) => t.deviceId));
  // the controller's fader moves the selected part's level (midiControls.ts)
  const midiSeen = useRef(midiControlChanges.version);
  useFrame(() => {
    if (midiControlChanges.version === midiSeen.current) return;
    midiSeen.current = midiControlChanges.version;
    force();
  });
  return (
    <div className="flex flex-col min-h-0 h-full" data-testid="part-list">
      <div className="flex items-center gap-1.5 pl-1 pr-2 pb-1 font-label font-bold text-[11px] tracking-wider text-ink/80">
        <span className="w-6" />
        <span className="w-[38px] text-center">MUTE</span>
        <span className="w-[44px] text-center">LINK</span>
        <span className="flex-1 text-center">PATCH</span>
        <span className="w-[40%] text-center">LEVEL</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-[2px]">
        {parts.length === 0 && <div className="p-3 font-label text-[13px] text-ink/70">No parts yet — press LOAD to add an instrument.</div>}
        {parts.map((t, i) => {
          const dev = audioEngine.devices.get(t.deviceId);
          const sel = t.deviceId === selectedId;
          const linked = !!dev && isLinked(dev.id);
          return (
            <div key={t.id} className="flex items-center gap-1.5 h-[23px] pl-1 rounded-[3px]" data-testid="part-row" data-selected={sel}>
              <span className="w-6 text-right font-label font-bold text-[13px] leading-none text-ink">{i + 1}</span>
              <LedButton on={t.mute} onClick={() => audioEngine.toggleTrackMute(t.id)} title={`Mute part ${i + 1}`} className="w-[38px] h-[19px] text-[11px]" color="#ffb347" testId="part-mute">
                {t.mute ? 'M' : ''}
              </LedButton>
              <button
                type="button"
                onClick={() => dev && !sel && setLinked(dev.id, !linked)}
                title={sel ? 'Selected part: plays from the keyboard' : linked ? 'Linked: plays along with the selected part (click to unlink)' : 'Link: play along with the selected part'}
                aria-pressed={sel || linked}
                className="w-[44px] h-[19px] rounded-[3px] grid place-items-center font-bold text-[13px] leading-none"
                style={{
                  background: 'linear-gradient(180deg,#ffffff,#dfe3e7)',
                  border: '1px solid #8c9299',
                  color: sel || linked ? '#121417' : '#9aa0a7',
                  boxShadow: linked ? 'inset 0 -2px 0 #20d3ee' : undefined,
                }}
                data-testid="part-link"
              >
                {linked && !sel ? '↳' : '→'}
              </button>
              <button
                type="button"
                onClick={() => onSelect(t.deviceId)}
                onDoubleClick={() => onLoad(t)}
                title={`${t.name}${dev ? ` — ${dev.name}` : ''} (double-click: load another instrument)`}
                className={`flex-1 min-w-0 h-[21px] rounded-[3px] px-2 text-left font-label font-semibold text-[13px] leading-none truncate ${sel ? 'us-sel-row' : ''}`}
                style={
                  sel
                    ? { border: '1px solid #b86a10' }
                    : { background: 'linear-gradient(180deg,#eef3f6,#d3dbe1)', border: '1px solid #8c9299', color: '#1d2126' }
                }
                data-testid="part-patch"
              >
                {t.name}
              </button>
              <div className="w-[40%] flex">
                <LevelBar
                  value={t.volume ?? 0.85}
                  title={`Part ${i + 1} level`}
                  onChange={(v) => {
                    audioEngine.mixer.setVolume(t.deviceId, v);
                    force();
                  }}
                  meter={() => {
                    const lv = audioEngine.mixer.levels(t.deviceId);
                    return Math.max(lv.peakL, lv.peakR);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
