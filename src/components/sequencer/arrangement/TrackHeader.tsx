/**
 * Track header of the arrangement: name, mute / solo / automation / record arm, and the pattern
 * (instrument tracks) or input monitoring (audio tracks). The light variant (Workstation) adds a
 * collapse arrow, a live meter in the colour tab and a delete button.
 */
import React from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { SequencerTrack } from '../../../audio/types.ts';
import { syncTrackPatterns } from '../../../audio/sequencer/model.ts';
import type { TimelinePalette } from './timelineTheme.ts';
import { showAlert, showConfirm } from '../../../shell/dialogService.ts';

interface Props {
  audioEngine: AudioEngine;
  track: SequencerTrack;
  width: number;
  height: number;
  active: boolean;
  light: boolean;
  palette: TimelinePalette;
  autoShown: boolean;
  autoHasPoints: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggleAuto: () => void;
  onToggleCollapse: () => void;
  /** Light variant: the meter bar in the colour tab (updated by the timeline's frame loop). */
  meterRef?: (el: HTMLDivElement | null) => void;
}

export const TrackHeader: React.FC<Props> = ({
  audioEngine,
  track: t,
  width,
  height,
  active,
  light,
  palette: P,
  autoShown,
  autoHasPoints,
  collapsed,
  onSelect,
  onToggleAuto,
  onToggleCollapse,
  meterRef,
}) => {
  const seq = audioEngine.sequencer;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const btn = (on: boolean, onCls: string, offCls: string) =>
    `w-5 h-[18px] rounded-[3px] text-[11px] font-bold font-label grid place-items-center ${on ? onCls : offCls}`;
  const off = light ? 'bg-white/70 text-[#59606a] border border-[#a7adb4]' : 'bg-slate-800 text-slate-400';
  const patternSelect =
    t.kind !== 'audio' ? (
      <select
        value={syncTrackPatterns(t, audioEngine.activePatternIndex).id}
        onChange={(e) => seq.selectPattern(t.id, e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        className={`text-[11px] rounded px-0.5 min-w-0 flex-1 ${light ? 'bg-white border border-[#a7adb4] text-[#2a2f36]' : 'bg-slate-900 text-amber-200 border border-slate-700'}`}
        title="Pattern the paint tool places (and the one you edit)"
      >
        {(t.patternList || []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.length}×{p.division}
          </option>
        ))}
      </select>
    ) : (
      <>
        <select
          value={t.monitor ?? 'auto'}
          onChange={(e) => audioEngine.setTrackMonitor(t.id, e.target.value as 'auto' | 'on' | 'off')}
          onPointerDown={(e) => e.stopPropagation()}
          className={`text-[11px] rounded ${light ? 'bg-white border border-[#a7adb4] text-[#2a2f36]' : 'bg-slate-900 text-slate-200 border border-slate-700'}`}
          title="Input monitoring"
        >
          <option value="auto">Mon: auto</option>
          <option value="on">Mon: on</option>
          <option value="off">Mon: off</option>
        </select>
        <select
          value={t.inputChannel ?? 'stereo'}
          onChange={(e) => {
            t.inputChannel = e.target.value as 'stereo' | 'left' | 'right';
            void audioEngine.recorder.syncInputs();
            audioEngine.changed();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`text-[11px] rounded ${light ? 'bg-white border border-[#a7adb4] text-[#2a2f36]' : 'bg-slate-900 text-slate-200 border border-slate-700'}`}
          title="Input channel(s) recorded"
        >
          <option value="stereo">In: stereo</option>
          <option value="left">In: 1 (L)</option>
          <option value="right">In: 2 (R)</option>
        </select>
      </>
    );

  const controls = (
    <>
      <button onClick={stop(() => audioEngine.toggleTrackMute(t.id))} className={btn(t.mute, light ? 'bg-[#ffb347] text-black border border-[#b86a10]' : 'bg-red-700 text-white', off)} title="Mute track">
        M
      </button>
      <button onClick={stop(() => audioEngine.toggleTrackSolo(t.id))} className={btn(t.solo, light ? 'bg-[#7ee08a] text-black border border-[#2f8a3a]' : 'bg-emerald-600 text-white', off)} title="Solo track">
        S
      </button>
      <button
        onClick={stop(onToggleAuto)}
        className={btn(autoShown, 'bg-violet-600 text-white', autoHasPoints ? (light ? 'bg-violet-100 text-violet-700 border border-violet-400' : 'bg-violet-950 text-violet-300') : off)}
        title="Show / hide automation lanes"
        data-testid="arr-auto"
      >
        {light ? '∿' : 'A'}
      </button>
      <button
        onClick={stop(() => audioEngine.setTrackArmed(t.id, !t.armed))}
        className={btn(!!t.armed, 'bg-red-600 text-white', light ? 'bg-white/70 text-red-600 border border-[#a7adb4]' : 'bg-slate-800 text-red-300')}
        title={t.kind === 'audio' ? 'Arm: record audio input on this track' : 'Arm: record MIDI notes on this track'}
        data-testid="arr-arm"
      >
        ●
      </button>
      {(t.kind !== 'audio' || t.frozenFrom || t.frozenBy) && (
        <button
          onClick={stop(() => {
            if (t.frozenFrom) {
              audioEngine.unfreezeTrack(t.id);
              return;
            }
            void audioEngine.freezeTrack(t.id).then((id) => {
              if (!id) void showAlert({ title: 'Freeze unavailable', message: 'Freeze needs an arranged song, and cannot run while recording.' });
            });
          })}
          className={btn(!!(t.frozenFrom || t.frozenBy), 'bg-amber-400 text-black', light ? 'bg-white/70 text-[#59606a] border border-[#a7adb4]' : 'bg-slate-800 text-cyan-200')}
          title={
            t.frozenFrom
              ? 'Unfreeze: remove this render and re-enable the instrument'
              : t.frozenBy
                ? 'Frozen: the instrument is disabled — click to unfreeze'
                : 'Freeze: render this track to audio and disable its devices (saves CPU)'
          }
          data-testid="arr-freeze"
        >
          {t.frozenFrom || t.frozenBy ? '☀' : '❄'}
        </button>
      )}
    </>
  );

  if (!light) {
    return (
      <div
        className="sticky left-0 z-20 flex-shrink-0 border-r border-b flex flex-col justify-center gap-0.5 px-1.5"
        style={{ width, height, background: active ? P.headerActive : P.headerBg, borderColor: P.headerBorder }}
        onPointerDown={onSelect}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="w-1.5 self-stretch rounded" style={{ backgroundColor: t.color }} />
          <span className="truncate font-bold text-[11px] flex-1" style={{ color: P.headerText }} title={t.name}>
            {t.name}
          </span>
          {controls}
        </div>
        {height >= 40 && <div className="flex items-center gap-1">{patternSelect}</div>}
      </div>
    );
  }

  return (
    <div
      className="sticky left-0 z-20 flex-shrink-0 border-r border-b flex items-stretch"
      style={{ width, height, background: active ? P.headerActive : P.headerBg, borderColor: P.headerBorder }}
      onPointerDown={onSelect}
      data-testid="track-header"
    >
      <button onClick={stop(onToggleCollapse)} className="w-4 grid place-items-center text-[#59606a] hover:text-black" title={collapsed ? 'Expand lane' : 'Collapse lane'}>
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      <div className="w-[78px] shrink-0 my-[3px] rounded-[3px] flex flex-col justify-between px-1 py-0.5 overflow-hidden" style={{ background: t.color, boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.25)' }}>
        <span className="font-label font-bold text-[13px] leading-none text-black/85 truncate" title={t.name}>
          {t.name}
        </span>
        {!collapsed && (
          <div className="h-[6px] rounded-sm bg-black/70 overflow-hidden">
            <div ref={meterRef} className="h-full bg-gradient-to-r from-cyan-300 to-sky-500 will-change-transform" style={{ width: 0 }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[3px] px-1">
        <div className="flex items-center gap-[3px]">{controls}</div>
        {!collapsed && (
          <div className="flex items-center gap-[3px] min-w-0">
            {patternSelect}
            <button
              onClick={stop(() => {
                void showConfirm({
                  title: `Delete "${t.name}"?`,
                  message: `This removes the track and its ${t.kind === 'audio' ? 'clips' : 'instrument'}.`,
                  confirmLabel: 'Delete track',
                }).then((ok) => {
                  if (ok) audioEngine.removeDevice(t.deviceId);
                });
              })}
              className="w-4 h-4 grid place-items-center text-[#59606a] hover:text-red-600"
              title="Delete track"
              aria-label="Delete track"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
