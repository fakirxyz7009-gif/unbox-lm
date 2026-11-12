import React from 'react';
import { ArrowUpRight, AudioLines, Layers, Power, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { DeviceType, SequencerTrack } from '../../../audio/types.ts';
import { SpecDevice } from '../../../audio/spec/SpecDevice.ts';
import { EFFECT_CATALOG } from '../../../audio/effectCatalog.ts';
import { SPEC_BY_TYPE } from '../../../../shared/rack/devices/index.ts';

interface Props {
  audioEngine: AudioEngine;
  track?: SequencerTrack;
  onOpenRack?: (deviceId: string) => void;
  onOpenMixer?: (trackNumber: number) => void;
}

/** Compact selected-track overview inspired by Reason 14's sequencer Track Panel. */
export function TrackPanel({ audioEngine, track, onOpenRack, onOpenMixer }: Props) {
  if (!track) {
    return <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-800">Select a track to see its device, signal chain and mix controls.</div>;
  }

  const device = audioEngine.devices.get(track.deviceId);
  const inserts = audioEngine.mixer.insertsOf(track.deviceId).filter(
    (d) => d.type === 'vst_effect' || EFFECT_CATALOG.some((entry) => entry.type === d.type)
  );
  const players = [...audioEngine.devices.values()].filter(
    (d): d is SpecDevice => d instanceof SpecDevice && !!d.engine.player && d.target === track.deviceId
  );
  const sends = audioEngine.mixer.settingsOf(track.deviceId)?.sends ?? [];
  const buses = audioEngine.mixer.buses().filter((b) => b.busKind === 'bus' || b.busKind === 'return');
  const textField = 'w-24 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-200';
  const openDevice = (id: string) => onOpenRack?.(id);
  const playerSpecs = [...SPEC_BY_TYPE.entries()].filter(([, spec]) => spec.engine === 'player');
  const addEffect = (type: DeviceType) => {
    const entry = EFFECT_CATALOG.find((e) => e.type === type);
    if (!entry) return;
    const effect = audioEngine.createDevice(type, entry.name);
    if (!audioEngine.insertEffectOnTrack(effect.id, track.deviceId)) audioEngine.removeDevice(effect.id, true);
  };
  const addPlayer = (type: DeviceType) => {
    const spec = SPEC_BY_TYPE.get(type);
    if (!spec || spec.engine !== 'player') return;
    const player = audioEngine.createDevice(type, spec.name);
    audioEngine.setPlayerTarget(player.id, track.deviceId);
  };

  return (
    <section className="flex-shrink-0 border-b border-slate-800 bg-[#0b111d] px-3 py-2 text-[11px]" data-testid="sequencer-track-panel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: track.color }} />
          <div className="min-w-0">
            <div className="font-black text-slate-100 truncate">{track.name}</div>
            <div className="text-[11px] text-slate-500 truncate">{track.kind === 'audio' ? 'Audio track' : device?.name ?? 'Instrument track'}</div>
          </div>
          {device && (
            <button type="button" onClick={() => openDevice(device.id)} className="px-1.5 py-1 rounded bg-cyan-950 text-cyan-300 hover:text-white" title="Open this track device in the Rack">
              RACK <ArrowUpRight className="inline w-2.5 h-2.5" />
            </button>
          )}
          <button type="button" onClick={() => onOpenMixer?.(track.mixerTrack ?? 1)} className="px-1.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white" title="Open this track's mixer channel">
            MIX <ArrowUpRight className="inline w-2.5 h-2.5" />
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-slate-400" title="Track fader">
          <SlidersHorizontal className="w-3 h-3 text-cyan-400" /> VOL
          <input
            aria-label={`${track.name} volume`}
            className="w-24 accent-cyan-400"
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={track.volume ?? 0.85}
            onChange={(e) => { audioEngine.mixer.setVolume(track.deviceId, Number(e.target.value)); audioEngine.changed(); }}
          />
          <span className="w-7 text-right text-slate-300">{Math.round((track.volume ?? 0.85) * 100)}%</span>
        </label>
        <label className="flex items-center gap-1.5 text-slate-400" title="Track pan">
          PAN
          <input
            aria-label={`${track.name} pan`}
            className="w-20 accent-cyan-400"
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={track.pan ?? 0}
            onChange={(e) => { audioEngine.mixer.setPan(track.deviceId, Number(e.target.value)); audioEngine.changed(); }}
          />
          <span className="w-8 text-right text-slate-300">{Math.round((track.pan ?? 0) * 100)}</span>
        </label>

        <div className="flex min-w-0 items-center gap-1.5 text-slate-400" title="Effects connected to this track">
          <AudioLines className="w-3 h-3 text-violet-400" /> FX
          {inserts.length ? inserts.map((fx) => (
            <span key={fx.id} className="inline-flex max-w-48 items-center rounded border border-violet-900 bg-violet-950/40 text-violet-200">
              <button type="button" onClick={() => openDevice(fx.id)} className="max-w-32 truncate px-1.5 py-0.5 hover:text-white" title={`Open ${fx.name} in the Rack`}>
                {fx.name}
              </button>
              <button type="button" onClick={() => { fx.isBypassed = !fx.isBypassed; audioEngine.changed(); }} className={`px-1 py-0.5 ${fx.isBypassed ? 'text-amber-300' : 'text-slate-500 hover:text-white'}`} aria-pressed={fx.isBypassed} title={`${fx.isBypassed ? 'Enable' : 'Bypass'} ${fx.name}`}>
                <Power className="w-2.5 h-2.5" />
              </button>
              <button type="button" onClick={() => audioEngine.removeDevice(fx.id)} className="px-1 py-0.5 text-slate-500 hover:text-red-300" aria-label={`Remove ${fx.name}`} title={`Remove ${fx.name}`}>
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </span>
          )) : <span className="text-slate-600">No inserts</span>}
          <select className="max-w-28 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-violet-200" value="" onChange={(e) => { if (e.target.value) addEffect(e.target.value as DeviceType); }} aria-label="Add effect to selected track" title="Create and insert an effect">
            <option value="">+ Add FX</option>
            {EFFECT_CATALOG.map((entry) => <option key={entry.type} value={entry.type}>{entry.name}</option>)}
          </select>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-slate-400" title="Player devices targeting this track">
          <Layers className="w-3 h-3 text-amber-400" /> PLAYERS
          {players.length ? players.map((player) => (
            <span key={player.id} className="inline-flex max-w-40 items-center rounded border border-amber-900 bg-amber-950/40 text-amber-200">
              <button type="button" onClick={() => openDevice(player.id)} className="max-w-28 truncate px-1.5 py-0.5 hover:text-white" title={`Open ${player.name} in the Rack`}>
                {player.name}
              </button>
              <button type="button" onClick={() => audioEngine.removeDevice(player.id)} className="px-1 py-0.5 text-slate-500 hover:text-red-300" aria-label={`Remove ${player.name}`} title={`Remove ${player.name}`}>
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </span>
          )) : <span className="text-slate-600">None</span>}
          <select className="max-w-32 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-amber-200" value="" onChange={(e) => { if (e.target.value) addPlayer(e.target.value as DeviceType); }} aria-label="Add player to selected track" title="Create a MIDI player and target it to this track">
            <option value="">+ PLAYER</option>
            {playerSpecs.map(([type, spec]) => <option key={type} value={type}>{spec.name}</option>)}
          </select>
        </div>
      </div>

      {!!buses.length && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-800/80 pt-2">
          <span className="text-[11px] font-black text-emerald-400">SEND EFFECTS</span>
          {buses.map((bus) => {
            const send = sends.find((s) => s.busId === bus.id);
            return (
              <label key={bus.id} className="flex items-center gap-1 text-slate-400" title={`${bus.name} send level`}>
                <span className="max-w-24 truncate">{bus.name}</span>
                <input
                  aria-label={`${track.name} send to ${bus.name}`}
                  className="w-16 accent-emerald-400"
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={send?.level ?? 0}
                  onChange={(e) => { audioEngine.mixer.setSend(track.deviceId, bus.id, Number(e.target.value)); audioEngine.changed(); }}
                />
              </label>
            );
          })}
          <select
            className={textField}
            value={track.output ?? 'master'}
            onChange={(e) => { audioEngine.mixer.setOutput(track.deviceId, e.target.value); audioEngine.changed(); }}
            aria-label={`${track.name} output`}
            title="Track output routing"
          >
            <option value="master">Output: Master</option>
            {buses.filter((b) => b.busKind === 'bus').map((bus) => <option key={bus.id} value={bus.id}>Output: {bus.name}</option>)}
          </select>
        </div>
      )}
    </section>
  );
}
