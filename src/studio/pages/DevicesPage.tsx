/**
 * Device browser pages (Instruments, Drums, Synths, Samplers, Effects, Patchbay / Routing):
 * every built-in device of the category with its description, one-click add, the library
 * plugins of that kind, and the units of that kind already in this project.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { EFFECT_CATALOG } from '../../audio/effectCatalog.ts';
import { INSTRUMENT_CATEGORIES } from '../../audio/instrumentCatalog.ts';
import type { DeviceType } from '../../audio/types.ts';
import { useEngineVersion } from '../../nexa/useEngine.ts';
import { SHIPPED_PACKS } from '../../../shared/instruments/packs.ts';
import { isRedistributable, packDeviceType } from '../../../shared/instruments/catalogTypes.ts';
import { isRecordedInstrument, isSamplerDevice } from './deviceCatalogFilters.ts';
import { useVstLibrary, vstLibrary } from '../../vst/libraryClient.ts';
import { snapshotFromItem } from '../../vst/VstPluginDevice.ts';
import type { MountableItem } from '../../../shared/vst/manifestTypes.ts';
import { Btn, Panel } from '../ui/controls.tsx';
import type { PageId } from '../sections.ts';
import { toast } from '../../shell/toast.ts';
import { showConfirm } from '../../shell/dialogService.ts';

type Cat = Extract<PageId, 'instruments' | 'drums' | 'synths' | 'sampler' | 'effects' | 'patchbay'>;

interface Entry {
  type: DeviceType;
  name: string;
  desc: string;
  group: string;
}

const DRUM_BADGES = new Set(['RHYTHM', 'PERCUSSION', 'CLASSIC DRUMS', 'RECORDED KITS', 'DRUM MACHINES', 'GROOVEBOXES']);
const SYNTH_BADGES = new Set(['SYNTHS', 'CLASSIC SYNTHS', 'HW SYNTHS']);
const PATCH_BADGES = new Set(['DI & PATCH', 'SUMMING']);
const ROUTING_TYPES = new Set<DeviceType>(['spider_audio', 'spider_cv', 'line_mixer', 'mixer_14_2', 'matrix', 'pulsar', 'combinator']);
// This is a user-facing pack list. In a share build it must never retain private custom-pack
// metadata, even if a component is rendered before an instrument is mounted.
const PACK_BY_DEVICE_TYPE = new Map<string, (typeof SHIPPED_PACKS)[number]>(SHIPPED_PACKS.map((pack) => [packDeviceType(pack.id), pack]));
const midiNoteName = (note: number): string => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12]}${Math.floor(note / 12) - 1}`;

function entriesFor(cat: Cat): Entry[] {
  if (cat === 'effects') return EFFECT_CATALOG;
  const all = INSTRUMENT_CATEGORIES.flatMap((c) => c.items.map((i) => ({ type: i.type, name: i.name, desc: i.desc, group: c.label, badge: c.badge, playable: c.playable ?? (c.badge !== 'PROCESSING' && c.badge !== 'CONTROL') })));
  const pick =
    cat === 'instruments' ? all.filter((e) => e.playable)
    : cat === 'drums' ? all.filter((e) => DRUM_BADGES.has(e.badge))
    : cat === 'synths' ? all.filter((e) => SYNTH_BADGES.has(e.badge))
    : cat === 'sampler' ? all.filter((e) => isSamplerDevice(e.type))
    : all.filter((e) => PATCH_BADGES.has(e.badge) || ROUTING_TYPES.has(e.type));
  const seen = new Set<string>();
  return pick.filter((e) => !seen.has(`${e.type}:${e.name}`) && seen.add(`${e.type}:${e.name}`)).map(({ type, name, desc, group }) => ({ type, name, desc, group }));
}

const TITLES: Record<Cat, { title: string; help: string }> = {
  instruments: { title: 'Instruments', help: 'Every playable instrument. Adding one creates its track and mixer channel.' },
  drums: { title: 'Drums & Grooveboxes', help: 'Drum machines, kits, grooveboxes and percussion. Program them in the step sequencer, drum pads or piano roll.' },
  synths: { title: 'Synthesizers', help: 'Analog, wavetable, FM, west-coast and hardware-modelled synths (Web Audio models).' },
  sampler: { title: 'Samplers', help: 'Samplers, granular and loop players. Load your own samples on their front panels (or drag from the Sample Browser).' },
  effects: { title: 'Effects', help: 'Insert effects. "Insert" places it on the chosen track; it also appears in that channel\'s inserts in the mixer.' },
  patchbay: { title: 'Patchbay & Routing', help: 'Splitters, mixers, DI boxes and patchbays. Cable them on the back of the rack (Tab).' },
};

export function DevicesPage({ cat, onOpenDevice, onOpenRear }: { cat: Cat; onOpenDevice: (id: string) => void; onOpenRear: () => void }) {
  useEngineVersion();
  const lib = useVstLibrary();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<string>('');
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [recordedOnly, setRecordedOnly] = useState(false);
  const previewTicket = useRef(0);
  const previewTimer = useRef<number | null>(null);
  const entries = useMemo(() => entriesFor(cat), [cat]);
  const visibleEntries = useMemo(
    () => recordedOnly ? entries.filter((entry) => isRecordedInstrument(entry.type)) : entries,
    [entries, recordedOnly],
  );
  const groups = [...new Set(visibleEntries.map((e) => e.group))];
  const match = (e: { name: string; desc?: string }) => !q || `${e.name} ${e.desc ?? ''}`.toLowerCase().includes(q.toLowerCase());
  const channels = audioEngine.mixer.channels().filter((c) => c.kind !== 'rack');
  const targetId = target || channels[0]?.id || '';
  const types = new Set(visibleEntries.map((e) => e.type));
  const inProject = [...audioEngine.devices.values()].filter((d) => types.has(d.type) || (cat === 'effects' && d.type === 'vst_effect') || (cat === 'instruments' && d.type === 'vst_instrument'));
  const libItems = (recordedOnly ? [] : lib.manifest?.items ?? []).filter((i): i is MountableItem => {
    if (i.duplicateOf) return false;
    if (i.kind !== 'plugin' && i.kind !== 'instrument') return false;
    if (i.kind === 'plugin' && (!i.hostable || !i.primaryVariant)) return false;
    if (cat === 'effects') {
      return i.kind === 'plugin' && i.role === 'effect';
    }
    if (cat === 'instruments') {
      return i.kind === 'instrument' || i.role === 'instrument';
    }
    if (cat === 'drums') {
      return i.category === 'drums' || i.category === 'percussion';
    }
    return false;
  });

  const selectPart = (deviceId: string) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('unbox:select-part', { detail: deviceId }));
  };
  const add = (type: DeviceType, name: string) => {
    const dev = audioEngine.createDevice(type, name);
    if (cat === 'effects') {
      if (targetId && !audioEngine.insertEffectOnTrack(dev.id, targetId)) {
        toast('Added to the rack, but it could not be inserted on that channel (patch it on the back of the rack).', 'error');
        return;
      }
      const channel = channels.find((c) => c.id === targetId)?.settings.name;
      toast(channel ? `Inserted ${dev.name} on ${channel}` : `Added ${dev.name}`, 'success');
      return;
    }
    selectPart(dev.id);
    const partNo = audioEngine.tracks.findIndex((t) => t.deviceId === dev.id) + 1;
    toast(partNo > 0 ? `Added ${dev.name} — selected part ${partNo}` : `Added ${dev.name}`, 'success');
  };
  const addLib = (item: MountableItem) => {
    const dev = audioEngine.createVstDevice(snapshotFromItem(item, vstLibrary.manifest));
    if (dev.role === 'effect' && targetId) {
      if (!audioEngine.insertEffectOnTrack(dev.id, targetId)) {
        toast('Added to the rack, but it could not be inserted on that channel.', 'error');
        return;
      }
      toast(`Inserted ${dev.name}`, 'success');
      return;
    }
    selectPart(dev.id);
    toast(`Added ${dev.name} — selected`, 'success');
  };

  const removeDevice = (id: string, name: string) => {
    void showConfirm({
      title: 'Remove device',
      message: `Remove “${name}” from the project? Its track, clips and cables are removed as well.`,
      confirmLabel: 'Remove',
    }).then((ok) => {
      if (!ok) return;
      audioEngine.removeDevice(id);
      toast(`Removed ${name}`, 'info');
    });
  };

  const preview = async (type: DeviceType, name: string) => {
    const key = `${type}:${name}`;
    if (previewing === key) {
      previewTicket.current += 1;
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
      previewTimer.current = null;
      audioEngine.stopInstrumentPreview();
      setPreviewing(null);
      return;
    }
    const ticket = ++previewTicket.current;
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreviewing(key);
    try {
      await audioEngine.previewInstrument(type, name);
      if (ticket !== previewTicket.current) return;
      previewTimer.current = window.setTimeout(() => {
        if (ticket === previewTicket.current) setPreviewing(null);
        previewTimer.current = null;
      }, 1500);
    } catch {
      if (ticket === previewTicket.current) setPreviewing(null);
    }
  };

  useEffect(() => () => {
    previewTicket.current += 1;
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    audioEngine.stopInstrumentPreview();
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 bg-[#070a10] text-slate-200 text-[11px]" data-testid={`devices-${cat}`}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[13px] font-black text-white">{TITLES[cat].title}</h2>
        <span className="text-slate-500">{TITLES[cat].help}</span>
        <div className="flex-1" />
        {cat === 'effects' && (
          <label className="flex items-center gap-1 text-slate-400">Insert on
            <select value={targetId} onChange={(e) => setTarget(e.target.value)} className="bg-black/60 border border-slate-700 rounded" aria-label="Insert on channel">
              {channels.map((c) => <option key={c.id} value={c.id}>{c.settings.name}</option>)}
            </select>
          </label>
        )}
        {cat === 'patchbay' && <Btn onClick={onOpenRear}>Open rack rear (cables)</Btn>}
        {['instruments', 'drums', 'sampler'].includes(cat) && (
          <Btn on={recordedOnly} tone="green" onClick={() => setRecordedOnly((value) => !value)} title="Show recorded sample packs only; synthesized and modeled instruments are hidden.">
            Recorded audio only
          </Btn>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search devices" className="w-44 bg-black/60 border border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-orange-500" />
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-3">
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const list = visibleEntries.filter((e) => e.group === g && match(e));
            if (!list.length) return null;
            return (
              <Panel key={g} title={g}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                  {list.map((e) => {
                    const pack = PACK_BY_DEVICE_TYPE.get(e.type);
                    const customPack = pack !== undefined && !isRedistributable(pack.spdx);
                    const articulationInfo = pack?.articulations?.length
                      ? ` Articulations: ${pack.articulations.map((articulation) => `${articulation.label}${articulation.keyswitch === null ? '' : ` (${midiNoteName(articulation.keyswitch)})`}${articulation.default ? ' · default' : ''}`).join(', ')}.`
                      : '';
                    const switchInfo = pack?.switches?.length
                      ? ` Momentary keyswitches: ${pack.switches.map((sw) => `${midiNoteName(sw.note)} (${sw.mode === 'down' ? 'held' : 'released'})`).join(', ')}.`
                      : '';
                    return (
                      <div key={`${e.type}:${e.name}`} className="flex flex-col gap-2 rounded bg-slate-900/80 border border-slate-800 p-2">
                        <div className="min-w-0">
                          {pack && <div className={customPack ? 'text-[11px] font-bold text-amber-300' : 'text-[11px] font-bold text-emerald-300'}>{customPack ? `RECORDED · ${pack.spdx} · CHECK RIGHTS` : `RECORDED · ${pack.spdx}`}</div>}
                          <div className="font-bold text-[13px] leading-snug text-slate-100">{e.name}</div>
                          <div className="text-[11px] text-slate-500 leading-tight line-clamp-2" title={pack ? `Attribution: ${pack.author}. Source: ${pack.source}.${articulationInfo}${switchInfo}` : undefined}>
                            {pack ? `${pack.description}${articulationInfo}${switchInfo} Attribution: ${pack.author}.` : e.desc}
                            {customPack && ' Recording provenance and reuse rights have not been verified.'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 self-end">
                          {cat !== 'effects' && audioEngine.isPlayableInstrument(e.type) && (
                            <Btn on={previewing === `${e.type}:${e.name}`} tone="cyan" onClick={() => void preview(e.type, e.name)} title="Audition one note through the monitor without adding a track">
                              <Play className="inline w-3 h-3" /> {previewing === `${e.type}:${e.name}` ? 'Stop' : 'Preview'}
                            </Btn>
                          )}
                          <Btn onClick={() => add(e.type, e.name)} title={cat === 'effects' ? 'Insert on the chosen channel' : 'Add to the project'}><Plus className="inline w-3 h-3" /> {cat === 'effects' ? 'Insert' : 'Add'}</Btn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            );
          })}
          {libItems.filter(match).length > 0 && (
            <Panel title="Plugin library (Web Audio proxy DSP — the plugin binaries are not loaded)">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                {libItems.filter(match).map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded bg-slate-900/80 border border-slate-800 p-1.5">
                    <div className="flex-1 min-w-0"><div className="font-bold truncate">{i.name}</div><div className="text-[11px] text-slate-500 truncate">{i.vendor ?? ''} · {i.category}</div></div>
                    <Btn onClick={() => addLib(i)}><Plus className="inline w-3 h-3" /> Add</Btn>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
        <Panel title={`In this project (${inProject.length})`}>
          <ul className="space-y-1">
            {inProject.map((d) => (
              <li key={d.id} className="flex items-center gap-1">
                <button type="button" className="flex-1 text-left truncate hover:text-orange-300" onClick={() => onOpenDevice(d.id)} title="Open in the rack">{d.name}</button>
                <button type="button" aria-label={`Remove ${d.name}`} title="Remove" className="text-slate-500 hover:text-red-400" onClick={() => removeDevice(d.id, d.name)}><Trash2 className="w-3 h-3" /></button>
              </li>
            ))}
            {!inProject.length && <li className="text-slate-500">None yet.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
