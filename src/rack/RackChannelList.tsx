/**
 * Right rack column: the channel list. One row per mixer channel (tracks, rack channels, buses,
 * returns) with colour, name, mute, solo and level. On the rear each row carries the channel's
 * master inputs, so every chain's cable visibly ends in its own channel.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { ChannelKind, ChannelRef } from '../audio/mixer/MixerController.ts';
import { LevelBar } from '../ui/skin/LevelBar.tsx';
import { useChannelAutomation } from '../nexa/useEngine.ts';
import { LedButton } from '../ui/skin/panel.tsx';
import type { CableController } from './PatchCableLayer.tsx';
import type { JackRegistry } from './jackRegistry.ts';
import { channelJackKey } from './patching.ts';
import type { RackFace } from './RackUnitFrame.tsx';

const KIND_LABEL: Record<ChannelKind, string> = { track: 'instrument channel', audio: 'audio track', bus: 'group bus', return: 'effect return', rack: 'rack channel' };

interface Props {
  engine: AudioEngine;
  face: RackFace;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Re-render after a mute / solo / level change. */
  onChanged: () => void;
  controller: CableController;
  registry: JackRegistry;
  plugged: Map<string, string>;
}

const nameOf = (c: ChannelRef) => c.settings.name || c.device?.name || 'Channel';

export const RackChannelList: React.FC<Props> = ({ engine, face, selectedId, onSelect, onChanged, controller, registry, plugged }) => {
  const channels = engine.mixer.channels();
  useChannelAutomation(channels.map((c) => c.id));
  const show = (c: ChannelRef) => {
    onSelect(c.id);
    requestAnimationFrame(() => document.querySelector(`[data-unit-id="${c.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }));
  };

  return (
    <section className="rack-chans" aria-label="Mixer channels" data-nav="channels">
      <header className="rack-chans-head">
        <span>CHANNELS</span>
        <span className="opacity-70">{channels.length}</span>
      </header>
      {channels.length === 0 && <div className="rack-chans-empty">No channels yet — add an instrument.</div>}
      {channels.map((c) => {
        const name = nameOf(c);
        const color = c.settings.color || '#94a3b8';
        const selected = c.id === selectedId;
        if (face === 'rear') {
          return (
            <div key={c.id} className="rack-chan rack-chan--rear" data-channel-id={c.id}>
              <span className="rack-chan-name" style={{ ['--chan' as string]: color } as React.CSSProperties} title={name}>
                {name}
              </span>
              <span className="rack-chan-tag">TO MASTER</span>
              {(['master_l', 'master_r'] as const).map((port) => {
                const key = channelJackKey(c.id, port);
                const plug = plugged.get(key);
                const label = port === 'master_l' ? 'L' : 'R';
                return (
                  <span key={port} className="flex items-center gap-1">
                    <button
                      type="button"
                      ref={registry.ref(key)}
                      data-jack-key={key}
                      className={`rack-jack rack-jack--audio rack-jack--mini ${plug ? 'rack-jack--plugged' : ''}`}
                      style={plug ? ({ ['--plug' as string]: plug } as React.CSSProperties) : undefined}
                      title={`${name} · channel input ${label} (to the master bus)`}
                      aria-label={`${name} channel input ${label}${plug ? ', patched' : ''}`}
                      onPointerDown={(e) => controller.onJackPointerDown(e, key)}
                      onKeyDown={(e) => controller.onJackKeyDown(e, key)}
                    />
                    <span className="rack-jack-label">{label}</span>
                  </span>
                );
              })}
            </div>
          );
        }
        return (
          <div key={c.id} className={`rack-chan ${selected ? 'rack-chan--sel' : ''}`} data-channel-id={c.id}>
            <button type="button" className="rack-chan-jump" onClick={() => show(c)} title={`Show ${name} in the rack`} aria-label={`Show ${name} in the rack`}>
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              className="rack-chan-name"
              style={{ ['--chan' as string]: color } as React.CSSProperties}
              onClick={() => onSelect(c.id)}
              title={`${name} — ${KIND_LABEL[c.kind]} (click to select)`}
            >
              {name}
            </button>
            <LedButton
              on={!!c.settings.mute}
              onClick={() => {
                engine.mixer.setMute(c.id, !c.settings.mute);
                onChanged();
              }}
              title={`Mute ${name}`}
              className="w-[26px] h-[18px] text-[11px]"
            >
              M
            </LedButton>
            <LedButton
              on={!!c.settings.solo}
              onClick={(e) => {
                engine.mixer.setSolo(c.id, !c.settings.solo, e.ctrlKey || e.metaKey);
                onChanged();
              }}
              title={`Solo ${name} (Ctrl: exclusive)`}
              className="w-[26px] h-[18px] text-[11px]"
              color="#e0b266"
            >
              S
            </LedButton>
            <div className="rack-chan-level">
              <LevelBar
                value={c.settings.volume ?? 0.85}
                height={15}
                segments={12}
                title={`${name} level`}
                onChange={(v) => {
                  engine.mixer.setVolume(c.id, v);
                  onChanged();
                }}
                meter={() => {
                  const lv = engine.mixer.levels(c.id);
                  return Math.max(lv.peakL, lv.peakR);
                }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
};
