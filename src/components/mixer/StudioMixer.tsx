/**
 * Mixer console on the real mixer engine (audioEngine.mixer): one strip per track, rack channel,
 * bus and return, VCA faders and the master / monitor section, with the channel inspector (EQ and
 * dynamics of the selected strip) on the left.
 */
import React, { useMemo, useReducer, useState } from 'react';
import { Maximize2, Minimize2, PanelLeft, SkipForward, Trash2, X } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { useEngineVersion } from '../../nexa/useEngine.ts';
import { setUi, useUi } from '../../shell/uiStore.ts';
import { Fader } from '../../studio/ui/Fader.tsx';
import { formatDb } from '../../studio/ui/levels.ts';
import { StereoMeter } from '../../studio/ui/Meter.tsx';
import { LedButton } from '../../ui/skin/panel.tsx';
import { ChannelInspector } from './ChannelInspector.tsx';
import { ConsoleStrip, PALETTE } from './ConsoleStrip.tsx';

interface MixerProps {
  /** Open a rack unit (insert) in the rack view. */
  onOpenDevice?: (deviceId: string) => void;
  /** The workstation's selected part: the inspector starts on its channel. */
  selectedPart?: string | null;
  /** A track channel was selected in the console (it becomes the played part). */
  onSelectPart?: (deviceId: string) => void;
}

const mixer = () => audioEngine.mixer;
const save = () => audioEngine.changed();

function VcaStrip({ id }: { id: string }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const m = mixer();
  const v = m.vcas.find((x) => x.id === id);
  if (!v) return null;
  const members = m.channels().filter((c) => c.settings.vcaId === id).length;
  return (
    <div className="cs-strip cs-strip--vca" aria-label={`${v.name} VCA`}>
      <div className="h-1.5 w-full rounded-t-[5px] shrink-0" style={{ background: v.color }} />
      <div className="cs-name shrink-0">
        <span className="cs-badge">VCA</span>
        <input defaultValue={v.name} aria-label="VCA name" onBlur={(e) => m.setVca(id, { name: e.target.value || v.name })} className="w-full bg-transparent font-label font-bold text-[13px] text-ink outline-none focus:bg-white" />
      </div>
      <div className="cs-scroll items-center">
        <span className="font-label text-[13px] text-chrome-ink">
          {members} channel{members === 1 ? '' : 's'}
        </span>
        <button type="button" aria-label="Delete VCA" title="Delete VCA" className="text-chrome-ink hover:text-red-400" onClick={() => m.deleteVca(id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="cs-bottom shrink-0">
        <div className="flex justify-center py-1">
          <LedButton on={v.mute} onClick={() => (m.setVca(id, { mute: !v.mute }), bump())} title="Mute every member" className="w-[24px] h-[18px] text-[11px]" color="#ffb347">
            M
          </LedButton>
        </div>
        <div className="flex justify-center">
          <Fader value={v.level} def={1} color={v.color} label={`${v.name} VCA level`} height={92} onChange={(x) => (m.setVca(id, { level: x }), bump())} onCommit={save} />
        </div>
        <div className="cs-readout">{formatDb(v.level)} dB</div>
      </div>
    </div>
  );
}

function MasterStrip() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const m = mixer();
  const mon = audioEngine.monitor;
  const ms = mon.state;
  const setMon = (patch: Partial<typeof ms>) => {
    mon.set(patch);
    bump();
  };
  const lamp = (on: boolean, label: string, title: string, color: string, onClick: () => void) => (
    <LedButton on={on} onClick={onClick} title={title} className="h-[18px] px-1 text-[11px]" color={color}>
      {label}
    </LedButton>
  );
  return (
    <div className="cs-strip cs-strip--master" aria-label="Master section">
      <div className="h-1.5 w-full rounded-t-[5px] shrink-0 bg-red-500" />
      <div className="cs-name shrink-0">
        <span className="cs-badge">OUT</span>
        <div className="font-label font-bold text-[18px] text-ink">MASTER</div>
      </div>
      <div className="cs-scroll">
        <div className="font-label text-[13px] text-chrome-ink leading-tight">Master EQ, limiter and loudness: Mastering page.</div>
        <div className="cs-label">MONITOR</div>
        <div className="font-label text-[11px] text-chrome-ink/80 leading-tight -mt-1">speakers only — never in exports</div>
        <div className="flex flex-wrap gap-0.5">
          {lamp(ms.dim, 'DIM', `Dim ${ms.dimDb} dB`, '#ffb347', () => setMon({ dim: !ms.dim }))}
          {lamp(ms.mono, 'MONO', 'Mono check', '#7dd3fc', () => setMon({ mono: !ms.mono }))}
          {lamp(ms.swap, 'L⇄R', 'Swap left / right', '#c4b5fd', () => setMon({ swap: !ms.swap }))}
          {lamp(ms.mute, 'CUT', 'Mute the speakers (exports are not affected)', '#f87171', () => setMon({ mute: !ms.mute }))}
          {lamp(ms.source === 'reference', ms.source === 'mix' ? 'A: MIX' : 'B: REF', 'Listen to the reference track instead of the mix (A/B)', '#86efac', () => setMon({ source: ms.source === 'mix' ? 'reference' : 'mix' }))}
        </div>
      </div>
      <div className="cs-bottom shrink-0">
        <div className="flex justify-center gap-1 pt-1">
          <Fader
            value={m.masterVolume}
            def={0.9}
            color="#ef4444"
            label="Master volume"
            height={92}
            onChange={(v) => {
              m.setMasterVolume(v);
              setTimeout(bump, 30);
            }}
            onCommit={save}
          />
          <StereoMeter read={() => audioEngine.masterLevels()} height={92} width={22} />
        </div>
        <div className="cs-readout">{formatDb(m.masterVolume)} dB</div>
      </div>
    </div>
  );
}

export function StudioMixer({ onOpenDevice, selectedPart, onSelectPart }: MixerProps) {
  useEngineVersion();
  const { mixerLayout } = useUi();
  const isMixerFull = mixerLayout === 'mixer';
  const [compact, setCompact] = useState(false);
  const [filter, setFilter] = useState<'all' | 'tracks' | 'buses'>('all');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const m = mixer();
  const channels = m.channels();
  const buses = channels.filter((c) => c.kind === 'bus' || c.kind === 'return');
  const shown = useMemo(
    () => channels.filter((c) => !c.track?.hidden && (filter === 'all' || (filter === 'buses' ? c.kind === 'bus' || c.kind === 'return' : c.kind !== 'bus' && c.kind !== 'return'))),
    [channels, filter]
  );
  // The inspector follows the clicked strip, else the selected part.
  const inspect = (picked && channels.some((c) => c.id === picked) ? picked : null) ?? (selectedPart && channels.some((c) => c.id === selectedPart) ? selectedPart : null);
  const select = (id: string) => {
    setPicked(id);
    setInspectorOpen(true);
    if (channels.find((c) => c.id === id)?.track) onSelectPart?.(id);
  };
  const newBus = (kind: 'bus' | 'return') => {
    const n = buses.filter((b) => b.kind === kind).length + 1;
    m.createBus(kind === 'bus' ? `Bus ${n}` : `Return ${n}`, kind, PALETTE[(n + (kind === 'bus' ? 3 : 5)) % PALETTE.length]);
  };
  const tool = (label: string, title: string, onClick: () => void, on?: boolean) => (
    <button type="button" className="rack-tool" aria-pressed={on} title={title} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#07090c] text-[#d5dae0]" aria-label="Mixer" data-testid="mixer-console">
      <div className="rack-toolbar">
        <button type="button" className="rack-tool" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((v) => !v)} title="Show / hide the channel inspector (EQ and dynamics)">
          <PanelLeft className="w-3.5 h-3.5" /> Inspector
        </button>
        <span className="font-label font-bold text-[13px] tracking-[0.2em] text-white ml-1">MIXER</span>
        <span className="font-label text-[13px] text-chrome-ink mr-2">{channels.length} channels</span>
        {tool('+ Bus', 'New group / submix bus', () => newBus('bus'))}
        {tool('+ Return', 'New effect return (fed by sends)', () => newBus('return'))}
        {tool('+ VCA', 'New VCA fader', () => m.createVca(`VCA ${m.vcas.length + 1}`))}
        {tool('+ Group', 'New mixer group (linked faders / mute / solo)', () => m.createGroup(`Group ${m.groups.length + 1}`))}
        {m.groups.map((g) => (
          <span key={g.id} className="flex items-center gap-1 h-6 px-1.5 rounded bg-black/40 border border-chrome-line font-label text-[13px]">
            <input defaultValue={g.name} aria-label="Group name" onBlur={(e) => m.setGroup(g.id, { name: e.target.value || g.name })} className="w-16 bg-transparent outline-none text-white" />
            <label title="Link faders">
              <input type="checkbox" checked={g.linkVolume} onChange={(e) => m.setGroup(g.id, { linkVolume: e.target.checked })} /> vol
            </label>
            <label title="Link mutes">
              <input type="checkbox" checked={g.linkMute} onChange={(e) => m.setGroup(g.id, { linkMute: e.target.checked })} /> mute
            </label>
            <label title="Link solos">
              <input type="checkbox" checked={g.linkSolo} onChange={(e) => m.setGroup(g.id, { linkSolo: e.target.checked })} /> solo
            </label>
            <button type="button" aria-label="Delete group" onClick={() => m.deleteGroup(g.id)} className="text-chrome-ink hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <span className="flex-1" />
        <div className="rack-seg" role="group" aria-label="Show channels">
          {(['all', 'tracks', 'buses'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'tracks' ? 'Tracks' : 'Buses'}
            </button>
          ))}
        </div>
        {tool('Compact', 'Hide input, EQ, dynamics, inserts, sends and routing', () => setCompact((v) => !v), compact)}
        <button type="button" className="rack-tool" onClick={() => channels.forEach((c) => c.settings.solo && m.setSolo(c.id, false))} title="Clear all solos">
          <SkipForward className="w-3.5 h-3.5" /> Unsolo
        </button>
        <button
          type="button"
          className="rack-tool font-bold"
          onClick={() => setUi({ mixerLayout: isMixerFull ? 'split' : 'mixer' })}
          title={isMixerFull ? 'Restore split view with Clip Editor (F10)' : 'Expand Mixer to full screen (hide Clip Editor)'}
          aria-pressed={isMixerFull}
          data-testid="mixer-fullscreen-btn"
        >
          {isMixerFull ? <Minimize2 className="w-3.5 h-3.5 text-sel" /> : <Maximize2 className="w-3.5 h-3.5 text-sel" />}
          <span>{isMixerFull ? 'Split View' : 'Full Screen'}</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        {inspectorOpen && <ChannelInspector channelId={inspect} onClose={() => setInspectorOpen(false)} />}
        <div className="flex-1 min-w-0 flex gap-1 p-1.5 overflow-x-auto overflow-y-hidden items-stretch cs-console">
          {shown.map((c) => (
            <ConsoleStrip key={c.id} ch={c} buses={buses} onOpenDevice={onOpenDevice} compact={compact} selected={c.id === inspect} onSelect={select} />
          ))}
          {m.vcas.map((v) => (
            <VcaStrip key={v.id} id={v.id} />
          ))}
          <span className="flex-1" />
        </div>
        <div className="p-1.5 flex shrink-0 cs-console border-l border-black">
          <MasterStrip />
        </div>
      </div>
    </div>
  );
}
