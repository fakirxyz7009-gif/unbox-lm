/**
 * Track templates (instrument / audio track + its insert chain + channel settings) and mixer
 * templates (buses / returns with their inserts, VCAs and groups), saved in the app database.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { MixBusDevice } from '../audio/mixer/MixBusDevice.ts';
import type { ChannelSettings, DeviceType, MixGroup, VcaFader } from '../audio/types.ts';
import { VstPluginDevice, type VstUnitSnapshot } from '../vst/VstPluginDevice.ts';
import { dbByIndex, dbDelete, dbPut } from './db.ts';

interface DeviceSnap {
  type: DeviceType;
  name: string;
  params: Record<string, number>;
  vst?: VstUnitSnapshot;
}

type ChannelSnap = Omit<ChannelSettings, 'sends' | 'output' | 'vcaId' | 'mixGroupId'> & { sends?: { bus: string; level: number; pre?: boolean }[] };

export interface TrackTemplate {
  id: string;
  deviceType: 'track-template';
  name: string;
  createdAt: number;
  audio: boolean;
  device?: DeviceSnap;
  inserts: DeviceSnap[];
  channel: ChannelSnap;
}

export interface MixerTemplate {
  id: string;
  deviceType: 'mixer-template';
  name: string;
  createdAt: number;
  buses: { name: string; kind: 'bus' | 'return'; channel: ChannelSnap; inserts: DeviceSnap[] }[];
  vcas: Omit<VcaFader, 'id'>[];
  groups: Omit<MixGroup, 'id'>[];
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function snapDevice(d: BaseDevice): DeviceSnap {
  const params: Record<string, number> = {};
  Object.entries(d.params).forEach(([k, v]) => typeof v === 'number' && Number.isFinite(v) && (params[k] = v));
  return { type: d.type, name: d.name, params, vst: d instanceof VstPluginDevice ? d.toProjectData().snapshot : undefined };
}

function buildDevice(s: DeviceSnap): BaseDevice {
  const dev = s.vst ? audioEngine.createVstDevice(s.vst, { name: s.name }) : audioEngine.createDevice(s.type, s.name);
  Object.entries(s.params).forEach(([k, v]) => dev.setParam(k, v));
  return dev;
}

function snapChannel(s: ChannelSettings): ChannelSnap {
  const busName = (id: string) => (audioEngine.devices.get(id) as MixBusDevice | undefined)?.channel.name ?? '';
  return {
    name: s.name, color: s.color, mute: false, solo: false, volume: s.volume, pan: s.pan, trimDb: s.trimDb, phaseInvert: s.phaseInvert,
    width: s.width, soloSafe: s.soloSafe, duck: s.duck,
    sends: s.sends?.map((x) => ({ bus: busName(x.busId), level: x.level, pre: x.pre })).filter((x) => x.bus),
  };
}

function applyChannel(id: string, c: ChannelSnap): void {
  const m = audioEngine.mixer;
  const s = m.settingsOf(id);
  if (!s) return;
  Object.assign(s, { volume: c.volume, pan: c.pan, trimDb: c.trimDb, phaseInvert: c.phaseInvert, width: c.width, soloSafe: c.soloSafe, duck: c.duck, color: c.color });
  for (const send of c.sends ?? []) {
    const bus = m.buses().find((b) => b.channel.name === send.bus);
    if (bus) m.setSend(id, bus.id, send.level, send.pre);
  }
  m.apply();
}

/* ------------------------------------------------------------ track templates */

export async function saveTrackTemplate(trackId: string, name: string): Promise<TrackTemplate | null> {
  const t = audioEngine.tracks.find((x) => x.id === trackId);
  const dev = t && audioEngine.devices.get(t.deviceId);
  if (!t || !dev) return null;
  const tpl: TrackTemplate = {
    id: uid('ttpl'), deviceType: 'track-template', name, createdAt: Date.now(), audio: t.kind === 'audio',
    device: t.kind === 'audio' ? undefined : snapDevice(dev),
    inserts: audioEngine.mixer.insertsOf(dev.id).map(snapDevice),
    channel: snapChannel(t),
  };
  await dbPut('presets', tpl);
  return tpl;
}

export async function listTrackTemplates(): Promise<TrackTemplate[]> {
  return (await dbByIndex<TrackTemplate>('presets', 'deviceType', 'track-template')).sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds a new track from a template (instrument + inserts + channel settings). */
export function applyTrackTemplate(tpl: TrackTemplate): string | null {
  let ownerId: string;
  if (tpl.audio) ownerId = audioEngine.createAudioTrack(tpl.channel.name).deviceId;
  else if (tpl.device) ownerId = buildDevice(tpl.device).id;
  else return null;
  for (const ins of tpl.inserts) {
    const fx = buildDevice(ins);
    if (!audioEngine.insertEffectOnTrack(fx.id, ownerId)) audioEngine.removeDevice(fx.id, true);
  }
  const t = audioEngine.tracks.find((x) => x.deviceId === ownerId);
  if (t) t.name = tpl.channel.name;
  applyChannel(ownerId, tpl.channel);
  audioEngine.commitEdit();
  audioEngine.changed();
  return ownerId;
}

/* ------------------------------------------------------------ mixer templates */

export async function saveMixerTemplate(name: string): Promise<MixerTemplate> {
  const m = audioEngine.mixer;
  const tpl: MixerTemplate = {
    id: uid('mtpl'), deviceType: 'mixer-template', name, createdAt: Date.now(),
    buses: m.buses().map((b) => ({ name: b.channel.name, kind: b.busKind, channel: snapChannel(b.channel), inserts: m.insertsOf(b.id).map(snapDevice) })),
    vcas: m.vcas.map(({ id: _id, ...v }) => v),
    groups: m.groups.map(({ id: _id, ...g }) => g),
  };
  await dbPut('presets', tpl);
  return tpl;
}

export async function listMixerTemplates(): Promise<MixerTemplate[]> {
  return (await dbByIndex<MixerTemplate>('presets', 'deviceType', 'mixer-template')).sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds the template's buses / returns (with inserts), VCAs and groups to the mixer. */
export function applyMixerTemplate(tpl: MixerTemplate): void {
  const m = audioEngine.mixer;
  const made: { id: string; channel: ChannelSnap }[] = [];
  for (const b of tpl.buses) {
    const bus = m.createBus(b.name, b.kind, b.channel.color);
    for (const ins of b.inserts) {
      const fx = buildDevice(ins);
      if (!audioEngine.insertEffectOnTrack(fx.id, bus.id)) audioEngine.removeDevice(fx.id, true);
    }
    made.push({ id: bus.id, channel: b.channel });
  }
  made.forEach((x) => applyChannel(x.id, x.channel));
  tpl.vcas.forEach((v) => {
    const n = m.createVca(v.name, v.color);
    m.setVca(n.id, { level: v.level });
  });
  tpl.groups.forEach((g) => {
    const n = m.createGroup(g.name, g.color);
    m.setGroup(n.id, { linkVolume: g.linkVolume, linkMute: g.linkMute, linkSolo: g.linkSolo });
  });
  audioEngine.changed();
}

export async function deleteTemplate(id: string): Promise<void> {
  await dbDelete('presets', id);
}
