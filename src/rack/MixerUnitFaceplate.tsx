/**
 * Front panels for the mixer's rack units: bus / return channels and audio tracks.
 * They show the real channel controls (the same ones as the mixer).
 */
import React, { useReducer } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { AudioTrackDevice } from '../audio/clips/AudioTrackDevice.ts';
import { MixBusDevice } from '../audio/mixer/MixBusDevice.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import NexaKnob from '../nexa/NexaKnob.tsx';
import { Btn } from '../studio/ui/controls.tsx';
import { formatDb } from '../studio/ui/levels.ts';
import { StereoMeter } from '../studio/ui/Meter.tsx';

export const isMixerUnit = (d: BaseDevice): boolean => d instanceof MixBusDevice || d instanceof AudioTrackDevice;

export function MixerUnitFaceplate({ device }: { device: BaseDevice }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const m = audioEngine.mixer;
  const s = m.settingsOf(device.id);
  const track = audioEngine.tracks.find((t) => t.deviceId === device.id);
  const set = (fn: () => void) => {
    fn();
    bump();
  };
  if (!s) return <div className="p-3 text-slate-400 text-[11px]">Channel not found.</div>;
  const isBus = device instanceof MixBusDevice;
  const inserts = m.insertsOf(device.id);
  const clips = track?.arrangementClips?.filter((c) => c.kind === 'audio').length ?? 0;
  return (
    <div className="flex flex-col gap-2 px-3 py-2 text-[11px] text-[#e3d7c1] bg-gradient-to-r from-[#21170f] to-[#120e09] min-h-[86px]">
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-slate-400">{isBus ? (device.busKind === 'return' ? 'Return channel' : 'Group bus') : 'Audio track'}</div>
          <div className="text-slate-300 leading-tight truncate" title={isBus ? inserts.map((d) => d.name).join(' → ') : undefined}>
            {isBus ? `Inserts: ${inserts.map((d) => d.name).join(' → ') || 'none'}` : `${clips} audio clip${clips === 1 ? '' : 's'} · inserts: ${inserts.length}`}
          </div>
        </div>
        <StereoMeter read={() => m.levels(device.id)} height={42} width={12} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <NexaKnob label="Vol" min={0} max={1.5} def={isBus ? 1 : 0.85} size={30} color={s.color} value={s.volume ?? 0.85} format={(v) => `${formatDb(v)} dB`} onChange={(v) => set(() => m.setVolume(device.id, v))} />
        <NexaKnob label="Pan" min={-1} max={1} def={0} size={28} color={s.color} value={s.pan ?? 0} onChange={(v) => set(() => m.setPan(device.id, v))} />
        <NexaKnob label="Width" min={0} max={2} def={1} size={28} color={s.color} value={s.width ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(() => m.setWidth(device.id, v))} />
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Btn on={s.mute} tone="yellow" onClick={() => set(() => m.setMute(device.id, !s.mute))}>MUTE</Btn>
            <Btn on={s.solo} tone="cyan" onClick={() => set(() => m.setSolo(device.id, !s.solo))}>SOLO</Btn>
          </div>
          {track && (
            <div className="flex gap-1 items-center">
              <Btn on={!!track.armed} tone="red" onClick={() => set(() => audioEngine.setTrackArmed(track.id, !track.armed))}>● ARM</Btn>
              <select
                value={track.monitor ?? 'auto'}
                onChange={(e) => set(() => audioEngine.setTrackMonitor(track.id, e.target.value as 'auto' | 'on' | 'off'))}
                className="bg-black/60 border border-slate-700 rounded text-[11px]"
                aria-label="Input monitoring"
              >
                <option value="auto">Mon auto</option>
                <option value="on">Mon on</option>
                <option value="off">Mon off</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
