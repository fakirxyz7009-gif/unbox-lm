/**
 * One console channel strip (Unbox skin). The header and the pan / buttons / fader block are fixed;
 * input, EQ, dynamics, inserts, sends and routing scroll between them, so the fader is always on
 * screen. Clicking the name, the EQ curve or the DYN row selects the channel for the inspector.
 */
import React, { useReducer, useRef, useState } from 'react';
import { Plus, Power, Trash2, X } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import type { BaseDevice } from '../../audio/BaseDevice.ts';
import { EFFECT_CATALOG, EFFECT_GROUPS } from '../../audio/effectCatalog.ts';
import { dynOf, eqOf } from '../../audio/mixer/channelStrip.ts';
import type { ChannelRef } from '../../audio/mixer/MixerController.ts';
import type { DeviceType } from '../../audio/types.ts';
import { useChannelAutomation, useMeterFrame } from '../../nexa/useEngine.ts';
import { setWidth } from '../../ui/skin/dom.ts';
import { Sel } from '../../studio/ui/controls.tsx';
import { Fader } from '../../studio/ui/Fader.tsx';
import { formatDb } from '../../studio/ui/levels.ts';
import { StereoMeter } from '../../studio/ui/Meter.tsx';
import { RingKnob } from '../../ui/skin/RingKnob.tsx';
import { automateMenuAt } from '../AutomateMenu.tsx';
import { LedButton } from '../../ui/skin/panel.tsx';
import { vstLibrary } from '../../vst/libraryClient.ts';
import { snapshotFromItem } from '../../vst/VstPluginDevice.ts';
import { EqCurve } from './EqCurve.tsx';

const KIND_BADGE: Record<ChannelRef['kind'], string> = { track: 'INST', audio: 'AUDIO', bus: 'BUS', return: 'RETURN', rack: 'RACK' };
export const PALETTE = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8'];
const save = () => audioEngine.changed();

function InsertPicker({ onPick, onClose }: { onPick: (type: DeviceType | `lib:${string}`) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const lib = (vstLibrary.manifest?.items ?? []).filter((i) => i.kind === 'plugin' && i.role === 'effect' && i.hostable && i.primaryVariant && !i.duplicateOf);
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  return (
    <div className="absolute z-40 left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto us-chrome border border-black rounded shadow-2xl p-1.5 text-[11px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1 mb-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search effects…" aria-label="Search effects" className="flex-1 bg-black/60 border border-chrome-line rounded px-1.5 py-0.5 outline-none focus:border-sel" />
        <button type="button" aria-label="Close" onClick={onClose} className="text-chrome-ink hover:text-white">
          <X className="w-3 h-3" />
        </button>
      </div>
      {EFFECT_GROUPS.map((g) => {
        const items = EFFECT_CATALOG.filter((e) => e.group === g && (match(e.name) || match(e.desc)));
        if (!items.length) return null;
        return (
          <div key={g} className="mb-1">
            <div className="font-label text-[11px] uppercase tracking-widest text-chrome-ink px-1">{g}</div>
            {items.map((e) => (
              <button key={`${e.type}:${e.name}`} type="button" title={e.desc} onClick={() => onPick(e.type)} className="w-full text-left px-1.5 py-0.5 rounded hover:bg-sel hover:text-black truncate">
                {e.name}
              </button>
            ))}
          </div>
        );
      })}
      {lib.filter((i) => match(i.name)).length > 0 && (
        <div>
          <div className="font-label text-[11px] uppercase tracking-widest text-chrome-ink px-1">Plugin library (proxy DSP)</div>
          {lib
            .filter((i) => match(i.name))
            .map((i) => (
              <button key={i.id} type="button" onClick={() => onPick(`lib:${i.id}`)} className="w-full text-left px-1.5 py-0.5 rounded hover:bg-sel hover:text-black truncate">
                {i.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function addInsert(channelId: string, pick: DeviceType | `lib:${string}`): BaseDevice | null {
  let dev: BaseDevice;
  if (pick.startsWith('lib:')) {
    const item = vstLibrary.item(pick.slice(4));
    if (!item || (item.kind !== 'plugin' && item.kind !== 'instrument')) return null;
    dev = audioEngine.createVstDevice(snapshotFromItem(item, vstLibrary.manifest));
  } else {
    const entry = EFFECT_CATALOG.find((e) => e.type === pick);
    dev = audioEngine.createDevice(pick as DeviceType, entry?.name);
  }
  if (!audioEngine.insertEffectOnTrack(dev.id, channelId)) {
    audioEngine.removeDevice(dev.id, true);
    return null;
  }
  return dev;
}

/** Compact dynamics status: COMP / GATE lamps and a gain-reduction bar (animated in rAF). */
function DynRow({ channelId, compOn, gateOn, onClick }: { channelId: string; compOn: boolean; gateOn: boolean; onClick: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useMeterFrame(() => {
    const gr = compOn || gateOn ? audioEngine.mixer.gainReduction(channelId) : 0;
    setWidth(bar.current, (-gr / 18) * 100);
  });
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-1 text-left" title="Dynamics — click to edit in the inspector">
      <span className={`cs-lamp ${compOn ? 'cs-lamp--on' : ''}`}>C</span>
      <span className={`cs-lamp ${gateOn ? 'cs-lamp--gate' : ''}`}>G</span>
      <span className="flex-1 h-1.5 rounded-sm bg-black/80 overflow-hidden flex justify-end" aria-label="Gain reduction">
        <span ref={bar} className="h-full bg-gradient-to-l from-amber-300 to-orange-600" style={{ width: 0 }} />
      </span>
    </button>
  );
}

interface StripProps {
  ch: ChannelRef;
  buses: ChannelRef[];
  compact: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpenDevice?: (id: string) => void;
}

export function ConsoleStrip({ ch, buses, compact, selected, onSelect, onOpenDevice }: StripProps) {
  useChannelAutomation(ch.id);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState(false);
  const s = ch.settings;
  const m = audioEngine.mixer;
  const inserts = m.insertsOf(ch.id);
  const fed = m.feedsMaster(ch.id);
  const otherBuses = buses.filter((b) => b.id !== ch.id);
  const track = ch.track;
  const eq = eqOf(s.eq);
  const dyn = dynOf(s.dyn);
  const set = (fn: () => void) => {
    fn();
    bump();
  };
  const select = () => onSelect(ch.id);

  return (
    <div className={`cs-strip ${selected ? 'cs-strip--sel' : ''}`} data-channel={ch.id} aria-label={`${s.name} channel strip`}>
      <button
        type="button"
        className="h-1.5 w-full rounded-t-[5px] shrink-0"
        style={{ background: s.color }}
        title="Click to change colour"
        aria-label={`Change ${s.name} colour`}
        onClick={() => set(() => m.setColor(ch.id, PALETTE[(PALETTE.indexOf(s.color) + 1) % PALETTE.length]))}
      />
      <div className="cs-name shrink-0">
        <div className="flex items-center gap-1">
          <span className="cs-badge">{KIND_BADGE[ch.kind]}</span>
          {(ch.kind === 'bus' || ch.kind === 'return') && (
            <button type="button" title="Delete this bus" aria-label="Delete bus" className="ml-auto text-ink/50 hover:text-red-600" onClick={() => window.confirm(`Delete ${s.name}? Channels routed to it go to the master.`) && m.deleteBus(ch.id)}>
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        {renaming ? (
          <input
            autoFocus
            defaultValue={s.name}
            aria-label="Channel name"
            className="w-full bg-white border border-sel rounded px-1 font-label text-[13px] text-ink"
            onBlur={(e) => {
              m.rename(ch.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button type="button" className="w-full text-left font-label font-bold text-[13px] leading-tight text-ink truncate" title={`${s.name} — click to inspect, double-click to rename`} onClick={select} onDoubleClick={() => setRenaming(true)}>
            {s.name}
          </button>
        )}
      </div>
      {!fed && ch.kind !== 'bus' && ch.kind !== 'return' && (
        <div className="mx-1.5 font-label text-[11px] text-amber-300/90 leading-tight shrink-0" title="This channel's audio does not reach the master through its own strip (it is patched into another unit in the rack).">
          routed in rack
        </div>
      )}

      <div className="cs-scroll">
        {!compact && (
          <>
            <div className="cs-sec !flex-row items-center justify-between">
              <RingKnob label="Trim" tone="dark" onContextMenu={(e) => automateMenuAt(e, `${s.name} · Trim`, { kind: 'channel', channelId: ch.id, param: 'trim' })} size={22} min={-24} max={24} defaultValue={0} bipolar value={s.trimDb ?? 0} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => set(() => m.setTrim(ch.id, v))} onCommit={save} />
              <LedButton on={!!s.phaseInvert} onClick={() => set(() => m.setPhase(ch.id, !s.phaseInvert))} title="Polarity invert (Ø)" className="w-[16px] h-[16px] text-[11px] -mx-1" color="#c4b5fd">
                Ø
              </LedButton>
              <RingKnob label="Width" tone="dark" onContextMenu={(e) => automateMenuAt(e, `${s.name} · Width`, { kind: 'channel', channelId: ch.id, param: 'width' })} size={22} min={0} max={2} defaultValue={1} value={s.width ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(() => m.setWidth(ch.id, v))} onCommit={save} />
            </div>

            <div className="cs-sec">
              <div className="cs-label">
                EQ
                <button type="button" className={`cs-lamp ml-auto ${eq.on ? 'cs-lamp--on' : ''}`} onClick={() => set(() => (m.setEq(ch.id, { on: !eq.on }), save()))} title={eq.on ? 'EQ in (click to bypass)' : 'EQ bypassed (click to switch in)'}>
                  {eq.on ? 'ON' : 'OFF'}
                </button>
              </div>
              <div onClick={select} title="EQ — click to edit in the inspector">
                <EqCurve eq={eq} width={86} height={24} color={s.color || '#20d3ee'} />
              </div>
            </div>

            <div className="cs-sec !flex-row items-center gap-1" title="Dynamics: C = compressor, G = gate, bar = gain reduction">
              <span className="cs-label">DYN</span>
              <DynRow channelId={ch.id} compOn={dyn.compOn} gateOn={dyn.gateOn} onClick={select} />
            </div>

            <div className="cs-sec relative">
              <div className="cs-label">
                INSERTS
                <button type="button" aria-label="Add insert effect" title="Add an insert effect" className="ml-auto text-chrome-ink hover:text-sel" onClick={() => setPicker((v) => !v)}>
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {picker && (
                <InsertPicker
                  onClose={() => setPicker(false)}
                  onPick={(t) => {
                    setPicker(false);
                    if (!addInsert(ch.id, t)) window.alert('Could not insert here: the channel must reach the master through its own strip.');
                  }}
                />
              )}
              {inserts.length === 0 && <div className="font-label text-[11px] text-chrome-ink/60">none</div>}
              {inserts.map((d) => (
                <div key={d.id} className="flex items-center gap-0.5 text-[11px] group">
                  <button
                    type="button"
                    title={d.isBypassed ? 'Bypassed (click to enable)' : 'Bypass'}
                    aria-label={`Bypass ${d.name}`}
                    className={d.isBypassed ? 'text-slate-600' : 'text-emerald-400'}
                    onClick={() =>
                      set(() => {
                        d.isBypassed = !d.isBypassed;
                        audioEngine.changed();
                      })
                    }
                  >
                    <Power className="w-2.5 h-2.5" />
                  </button>
                  <button type="button" className={`flex-1 text-left truncate ${d.isBypassed ? 'text-slate-600 line-through' : 'text-[#d5dae0] hover:text-white'}`} title={`${d.name} — open in rack`} onClick={() => onOpenDevice?.(d.id)}>
                    {d.name}
                  </button>
                  <button type="button" aria-label={`Remove ${d.name}`} title="Remove" className="opacity-0 group-hover:opacity-100 text-chrome-ink hover:text-red-400" onClick={() => audioEngine.removeDevice(d.id)}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>

            {otherBuses.length > 0 && (
              <div className="cs-sec">
                <div className="cs-label">SENDS</div>
                {otherBuses.map((b) => {
                  const send = s.sends?.find((x) => x.busId === b.id);
                  return (
                    <div key={b.id} className="flex items-center gap-0.5">
                      <RingKnob tone="dark" size={18} min={0} max={1} defaultValue={0} color={b.settings.color} onContextMenu={(e) => automateMenuAt(e, `${s.name} · Send to ${b.settings.name}`, { kind: 'channel', channelId: ch.id, param: `send:${b.id}` })} value={send?.level ?? 0} title={`${b.settings.name} send: ${formatDb(send?.level ?? 0)} dB`} onChange={(v) => set(() => m.setSend(ch.id, b.id, v))} onCommit={save} />
                      <span className="flex-1 font-label text-[11px] truncate text-chrome-ink -ml-2" title={b.settings.name}>
                        {b.settings.name}
                      </span>
                      {send && (
                        <button
                          type="button"
                          title={send.pre ? 'Pre-fader (click for post)' : 'Post-fader (click for pre)'}
                          className={`text-[11px] px-0.5 rounded font-bold ${send.pre ? 'bg-sky-600 text-white' : 'bg-black/50 text-chrome-ink'}`}
                          onClick={() => set(() => m.updateSend(ch.id, b.id, { pre: !send.pre }))}
                        >
                          {send.pre ? 'PRE' : 'PST'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="cs-sec flex flex-col gap-0.5">
              <div className="cs-label">OUTPUT</div>
              <Sel
                title="Output"
                value={s.output && s.output !== ch.id ? s.output : 'master'}
                onChange={(v) =>
                  set(() => {
                    if (!m.setOutput(ch.id, v)) window.alert('That routing would create a feedback loop.');
                  })
                }
                options={[{ value: 'master', label: '→ Master' }, ...otherBuses.map((b) => ({ value: b.id, label: `→ ${b.settings.name}` }))]}
              />
              {m.vcas.length > 0 && (
                <Sel title="VCA" value={s.vcaId ?? ''} onChange={(v) => set(() => m.assignVca(ch.id, v || undefined))} options={[{ value: '', label: 'VCA: none' }, ...m.vcas.map((v) => ({ value: v.id, label: `VCA: ${v.name}` }))]} />
              )}
              {m.groups.length > 0 && (
                <Sel title="Group" value={s.mixGroupId ?? ''} onChange={(v) => set(() => m.assignGroup(ch.id, v || undefined))} options={[{ value: '', label: 'Group: none' }, ...m.groups.map((g) => ({ value: g.id, label: `Grp: ${g.name}` }))]} />
              )}
              {track && track.group !== 'Drums' && (
                <div className="flex flex-col gap-0.5" title="Kick duck: this channel dips on each hit of its trigger (sidechain pumping)">
                  <div className="flex items-center gap-0.5">
                    <RingKnob tone="dark" size={18} min={0} max={0.9} defaultValue={0} color="#f472b6" value={s.duck?.amount ?? 0} title={`Kick duck ${Math.round((s.duck?.amount ?? 0) * 100)}%`} onChange={(v) => set(() => m.setDuck(ch.id, v))} onCommit={save} />
                    <span className="font-label text-[11px] text-chrome-ink -ml-2">Kick duck</span>
                  </div>
                  <Sel
                    title="Duck trigger: the drum beats, or the hits of one part (also when that part is muted)"
                    value={s.duck?.source ?? ''}
                    onChange={(v) => set(() => m.setDuckSource(ch.id, v || undefined))}
                    options={[
                      { value: '', label: 'Drum beats' },
                      ...audioEngine.tracks.filter((t) => t.kind !== 'audio' && t.deviceId !== ch.id).map((t) => ({ value: t.deviceId, label: t.name })),
                    ]}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="cs-bottom shrink-0">
        <div className="flex items-center">
          <RingKnob
            tone="dark"
            size={28}
            min={-1}
            max={1}
            defaultValue={0}
            bipolar
            color={s.color || '#20d3ee'}
            value={s.pan ?? 0}
            label={Math.abs(s.pan ?? 0) < 0.01 ? 'C' : (s.pan ?? 0) < 0 ? `L${Math.round(-(s.pan ?? 0) * 100)}` : `R${Math.round((s.pan ?? 0) * 100)}`}
            title={`${s.name} pan`}
            onContextMenu={(e) => automateMenuAt(e, `${s.name} · Pan`, { kind: 'channel', channelId: ch.id, param: 'pan' })}
            onChange={(v) => set(() => m.setPan(ch.id, v))}
            onCommit={save}
          />
          <div className="grid grid-cols-2 gap-0.5 ml-auto">
            <LedButton on={s.mute} onClick={() => set(() => m.setMute(ch.id, !s.mute))} title={`Mute ${s.name}`} className="w-[22px] h-[18px] text-[11px]" color="#ffb347">
              M
            </LedButton>
            <LedButton on={s.solo} onClick={(e) => set(() => m.setSolo(ch.id, !s.solo, e.ctrlKey || e.metaKey))} title={`Solo ${s.name} (Ctrl: exclusive)`} className="w-[22px] h-[18px] text-[11px]" color="#7dd3fc">
              S
            </LedButton>
            <LedButton on={!!s.soloSafe} onClick={() => set(() => m.setSoloSafe(ch.id, !s.soloSafe))} title="Solo safe: keeps playing when others are soloed" className="w-[22px] h-[18px] text-[11px]" color="#cbd5e1">
              SS
            </LedButton>
            {track && (
              <LedButton on={!!track.armed} onClick={() => set(() => audioEngine.setTrackArmed(track.id, !track.armed))} title={`Record arm ${s.name}`} className="w-[22px] h-[18px] text-[11px]" color="#f87171">
                ●
              </LedButton>
            )}
          </div>
        </div>
        <div className="flex justify-center gap-1 pt-1">
          <Fader value={s.volume ?? 0.85} def={0.85} color={s.color} label={`${s.name} volume`} height={92} onChange={(v) => set(() => m.setVolume(ch.id, v))} onCommit={save} />
          <StereoMeter read={() => m.levels(ch.id)} height={92} />
        </div>
        <div className="cs-readout">{formatDb(s.volume ?? 0.85)} dB</div>
      </div>
    </div>
  );
}
