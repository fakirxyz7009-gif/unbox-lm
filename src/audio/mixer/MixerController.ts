/**
 * Mixer: channel strips for tracks, buses / returns and rack channels, sends, output routing,
 * VCA faders, linked mixer groups and solo-in-place. Reached as `audioEngine.mixer`.
 *
 * A channel is identified by its owner device id:
 *  - a track's instrument / audio-track device,
 *  - a MixBusDevice (bus or return),
 *  - any other device that ends on the master without a single upstream owner (rack channel,
 *    e.g. a hardware mixer summing several instruments).
 * Insert effects are rack units cabled between the owner and the master; the cable into the
 * master lands on the owner's strip.
 */
import type { BaseDevice } from '../BaseDevice.ts';
import type { AudioConnection, ChannelDyn, ChannelEq, ChannelSend, ChannelSettings, MixGroup, SequencerTrack, VcaFader } from '../types.ts';
import { applyStrip, buildStrip, disposeStrip, dynOf, eqOf, routeStrip, stripGainReduction, stripLevels, stripValues, syncSends, type StripNodes } from './channelStrip.ts';
import { MixBusDevice, type BusKind } from './MixBusDevice.ts';
import { computeAudibility, wouldLoop, type RouteNode } from './routing.ts';
import { undoJournal } from '../undoJournal.ts';

export type ChannelKind = 'track' | 'audio' | 'bus' | 'return' | 'rack';

export interface ChannelRef {
  id: string;
  kind: ChannelKind;
  settings: ChannelSettings;
  track?: SequencerTrack;
  device?: BaseDevice;
}

/** What the mixer needs from the engine (keeps this module free of an AudioEngine import). */
export interface MixerHost {
  ctx: AudioContext;
  devices: Map<string, BaseDevice>;
  tracks: SequencerTrack[];
  audioConnections: AudioConnection[];
  /** Stereo input of the master bus. */
  masterInput: AudioNode;
  masterGain: GainNode;
  createDevice(type: 'mix_bus', name: string): BaseDevice;
  removeDevice(id: string): void;
  connectAudio(s: string, sp: string, t: string, tp: string): string | null;
  insertEffectOnTrack(fxId: string, ownerId: string): boolean;
  /** Structural change (re-render + autosave). */
  changed(): void;
  /** Automation: does a lane drive this channel param right now? */
  automationDrives?(channelId: string, param: string): boolean;
  /** Automation recording hook for user moves. */
  onUserChange?(channelId: string, param: string, value: number): void;
  /** True while the engine is rebuilding the graph or applying a structural undo step. */
  undoSuspended?(): boolean;
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const AUDIO_INS = new Set(['in_l', 'in_r', 'in2_l', 'in2_r', 'in3_l', 'in3_r', 'in4_l', 'in4_r', 'sc_l', 'sc_r', 'ret_l', 'ret_r']);

export interface MixerState {
  vcas: VcaFader[];
  groups: MixGroup[];
  rackChannels: [string, ChannelSettings][];
  buses: { id: string; kind: BusKind; channel: ChannelSettings }[];
  masterVolume: number;
}

/** What one mixer undo step restores: the saved mixer plus every channel's (cloned) settings. */
interface MixerUndoState {
  mix: MixerState;
  channels: [string, ChannelSettings][];
}

export class MixerController {
  readonly strips = new Map<string, StripNodes>();
  vcas: VcaFader[] = [];
  groups: MixGroup[] = [];
  private rackChannels = new Map<string, ChannelSettings>();

  constructor(private host: MixerHost) {}

  /* ------------------------------------------------------------ channels */

  isBus(id: string): boolean {
    return this.host.devices.get(id) instanceof MixBusDevice;
  }

  buses(): MixBusDevice[] {
    return [...this.host.devices.values()].filter((d): d is MixBusDevice => d instanceof MixBusDevice);
  }

  private trackOf(id: string): SequencerTrack | undefined {
    return this.host.tracks.find((t) => t.deviceId === id);
  }

  /** Track devices and buses own a strip. */
  isOwner(id: string): boolean {
    return !!this.trackOf(id) || this.isBus(id);
  }

  /** Walks upstream through single-source cables until it reaches a track device or bus. */
  ownerOf(deviceId: string): string {
    let id = deviceId;
    const seen = new Set<string>();
    while (!this.isOwner(id) && !seen.has(id)) {
      seen.add(id);
      const ups = new Set(
        this.host.audioConnections
          .filter((c) => c.targetDeviceId === id && AUDIO_INS.has(c.targetPortId) && c.targetPortId !== 'sc_l' && c.targetPortId !== 'sc_r')
          .map((c) => c.sourceDeviceId)
      );
      if (ups.size !== 1) break;
      id = [...ups][0];
    }
    return this.isOwner(id) ? id : deviceId;
  }

  /** All channels in mixer order: tracks, rack channels, buses, returns. */
  channels(): ChannelRef[] {
    const out: ChannelRef[] = [];
    for (const t of this.host.tracks) {
      out.push({ id: t.deviceId, kind: t.kind === 'audio' ? 'audio' : 'track', settings: t, track: t, device: this.host.devices.get(t.deviceId) });
    }
    const masterOwners = new Set(this.host.audioConnections.filter((c) => c.targetDeviceId === 'master').map((c) => c.stripId ?? c.sourceDeviceId));
    for (const id of masterOwners) {
      if (this.isOwner(id)) continue;
      const dev = this.host.devices.get(id);
      if (!dev) continue;
      let s = this.rackChannels.get(id);
      if (!s) {
        s = { name: dev.name, color: '#94a3b8', mute: false, solo: false, volume: 1 };
        this.rackChannels.set(id, s);
      }
      out.push({ id, kind: 'rack', settings: s, device: dev });
    }
    const buses = this.buses();
    for (const b of buses.filter((x) => x.busKind === 'bus')) out.push({ id: b.id, kind: 'bus', settings: b.channel, device: b });
    for (const b of buses.filter((x) => x.busKind === 'return')) out.push({ id: b.id, kind: 'return', settings: b.channel, device: b });
    return out;
  }

  channel(id: string): ChannelRef | undefined {
    return this.channels().find((c) => c.id === id);
  }

  settingsOf(id: string): ChannelSettings | undefined {
    const t = this.trackOf(id);
    if (t) return t;
    const d = this.host.devices.get(id);
    if (d instanceof MixBusDevice) return d.channel;
    return this.rackChannels.get(id);
  }

  strip(id: string): StripNodes {
    let s = this.strips.get(id);
    if (!s) {
      s = buildStrip(this.host.ctx);
      routeStrip(s, this.host.masterInput);
      this.strips.set(id, s);
    }
    return s;
  }

  /** Insert effects between a channel's owner and the master, in signal order. */
  insertsOf(id: string): BaseDevice[] {
    const chain: BaseDevice[] = [];
    let cur = id;
    for (let guard = 0; guard < 32; guard++) {
      if (this.host.audioConnections.some((c) => c.sourceDeviceId === cur && c.targetDeviceId === 'master')) break;
      const next = this.host.audioConnections.find((c) => c.sourceDeviceId === cur && c.sourcePortId === 'out_l' && c.targetDeviceId !== 'master');
      if (!next) break;
      const dev = this.host.devices.get(next.targetDeviceId);
      if (!dev || chain.includes(dev)) break;
      chain.push(dev);
      cur = dev.id;
    }
    return chain;
  }

  /** True when the channel's audio reaches the master through its own strip. */
  feedsMaster(id: string): boolean {
    return this.host.audioConnections.some((c) => c.targetDeviceId === 'master' && (c.stripId ?? c.sourceDeviceId) === id);
  }

  /* ------------------------------------------------------------ apply */

  private routeNodes(chs: ChannelRef[]): RouteNode[] {
    return chs.map((c) => {
      const s = c.settings;
      const vca = s.vcaId ? this.vcas.find((v) => v.id === s.vcaId) : undefined;
      return {
        id: c.id,
        mute: s.mute || !!vca?.mute || !!c.track?.disabled,
        solo: s.solo,
        soloSafe: s.soloSafe,
        output: this.validOutput(c.id, s.output),
        sends: (s.sends ?? []).filter((x) => !x.muted && x.level > 0 && this.isBus(x.busId)).map((x) => x.busId),
      };
    });
  }

  private validOutput(id: string, out: string | undefined): string {
    return out && out !== 'master' && out !== id && this.isBus(out) ? out : 'master';
  }

  private destFor(output: string): AudioNode {
    const bus = output !== 'master' ? this.host.devices.get(output) : undefined;
    return bus instanceof MixBusDevice ? bus.input : this.host.masterInput;
  }

  /** Recomputes every strip from the channel settings (cheap; call after any change). */
  apply(smooth = true): void {
    const chs = this.channels();
    const nodes = this.routeNodes(chs);
    const audible = computeAudibility(nodes);
    for (const c of chs) {
      const s = c.settings;
      const strip = this.strip(c.id);
      const vca = s.vcaId ? this.vcas.find((v) => v.id === s.vcaId) : undefined;
      const host = this.host;
      applyStrip(strip, stripValues(s, vca ? vca.level : 1, audible.get(c.id) ?? true), host.ctx, smooth, host.automationDrives ? (p) => !!host.automationDrives?.(c.id, p) : undefined);
      routeStrip(strip, this.destFor(this.validOutput(c.id, s.output)));
      syncSends(
        strip,
        this.host.ctx,
        (s.sends ?? [])
          .filter((x) => this.isBus(x.busId) && x.busId !== c.id)
          .map((x) => ({ busId: x.busId, level: x.muted ? 0 : Math.max(0, Math.min(1.5, x.level)), pre: !!x.pre, dest: this.destFor(x.busId), automated: !!this.host.automationDrives?.(c.id, `send:${x.busId}`) })),
        smooth
      );
    }
    this.trackUndoState();
  }

  /** Mixer settings are JSON-snapshotted per apply so every fader / EQ / send move is undoable. */
  private undoState: MixerUndoState | null = null;
  private restoringMixer = false;

  /** `save()` covers buses and rack channels; track channel settings live on the tracks, so they
   *  are copied separately for undo. */
  private undoSnapshot(): MixerUndoState {
    return {
      mix: this.save(),
      channels: this.channels().map((c) => [c.id, structuredClone(c.settings)]),
    };
  }

  private trackUndoState(): void {
    if (this.restoringMixer || this.host.undoSuspended?.()) {
      this.undoState = this.undoSnapshot();
      return;
    }
    const next = this.undoSnapshot();
    if (this.undoState === null) {
      this.undoState = next;
      return;
    }
    const prev = this.undoState;
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    this.undoState = next;
    const applyState = (state: MixerUndoState) => {
      this.restoringMixer = true;
      try {
        this.load(state.mix, new Map());
        for (const [id, settings] of state.channels) {
          const cur = this.settingsOf(id);
          if (cur) Object.assign(cur, structuredClone(settings));
        }
        this.apply();
        this.host.changed();
      } finally {
        this.restoringMixer = false;
        this.undoState = this.undoSnapshot();
      }
    };
    undoJournal.push('mixer', 'Mixer change', () => applyState(prev), () => applyState(next));
  }

  /** Re-points master cables at their current owner's strip (after any cable change). */
  rebindMasterConnections(): void {
    for (const c of this.host.audioConnections) {
      if (c.targetDeviceId !== 'master') continue;
      const owner = this.ownerOf(c.sourceDeviceId);
      const cur = c.stripId ?? c.sourceDeviceId;
      if (owner === cur && c.stripId) continue;
      const src = this.host.devices.get(c.sourceDeviceId)?.audioOutputs.get(c.sourcePortId);
      if (!src) continue;
      const old = this.strips.get(cur);
      if (old) {
        try {
          src.disconnect(c.targetPortId === 'master_r' ? old.inR : old.inL);
        } catch {
          // was not connected
        }
      }
      const strip = this.strip(owner);
      src.connect(c.targetPortId === 'master_r' ? strip.inR : strip.inL);
      c.stripId = owner;
    }
    // Drop strips nothing feeds any more (neither an owner nor a master cable target).
    const used = new Set(this.host.audioConnections.filter((c) => c.targetDeviceId === 'master').map((c) => c.stripId ?? c.sourceDeviceId));
    for (const [id, strip] of this.strips) {
      if (!used.has(id) && !this.isOwner(id)) {
        disposeStrip(strip);
        this.strips.delete(id);
        this.rackChannels.delete(id);
      }
    }
    this.apply();
    this.updatePdc();
  }

  /** Updates Plugin Delay Compensation (PDC) across all channels. */
  public updatePdc(): void {
    const channels = this.channels();
    const latencies = new Map<string, number>();
    for (const c of channels) {
      let lat = 0;
      if (c.kind === 'track') {
        const dev = this.host.devices.get(c.device?.id ?? '');
        if (dev && 'latencySeconds' in dev) {
          lat += Number((dev as any).latencySeconds) || 0;
        }
      }
      latencies.set(c.id, lat);
    }
    const maxLat = Math.max(0, ...latencies.values());
    for (const [id, lat] of latencies) {
      const s = this.strips.get(id);
      if (s) {
        const comp = maxLat - lat;
        try {
          s.pdcDelay.delayTime.setTargetAtTime(Math.max(0, comp), this.host.ctx.currentTime, 0.02);
        } catch {}
      }
    }
  }

  /** Called by the engine when a device is removed. */
  forget(id: string): void {
    this.levelCache.delete(id);
    const strip = this.strips.get(id);
    if (strip) {
      disposeStrip(strip);
      this.strips.delete(id);
    }
    this.rackChannels.delete(id);
    // Anything routed / sending to a removed bus falls back to the master.
    for (const c of this.channels()) {
      if (c.settings.output === id) c.settings.output = 'master';
      if (c.settings.sends?.some((s) => s.busId === id)) c.settings.sends = c.settings.sends.filter((s) => s.busId !== id);
    }
  }

  private levelCache = new Map<string, { t: number; v: { peakL: number; peakR: number; rmsL: number; rmsR: number } }>();

  /** Post-fader levels; several meters of one channel in the same frame share one analyser read. */
  levels(id: string): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
    const now = performance.now();
    const hit = this.levelCache.get(id);
    if (hit && now - hit.t < 8) return hit.v;
    const s = this.strips.get(id);
    const v = s ? stripLevels(s) : { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
    this.levelCache.set(id, { t: now, v });
    return v;
  }

  /* ------------------------------------------------------------ setters */

  private members(groupId: string | undefined, exclude: string): ChannelRef[] {
    if (!groupId) return [];
    return this.channels().filter((c) => c.id !== exclude && c.settings.mixGroupId === groupId);
  }

  private group(id: string | undefined): MixGroup | undefined {
    return id ? this.groups.find((g) => g.id === id) : undefined;
  }

  setVolume(id: string, v: number, linked = true): void {
    const s = this.settingsOf(id);
    if (!s) return;
    const next = Math.max(0, Math.min(1.5, v));
    const prev = s.volume ?? 0.85;
    s.volume = next;
    this.host.onUserChange?.(id, 'volume', next);
    const g = this.group(s.mixGroupId);
    if (linked && g?.linkVolume && prev > 0.0001) {
      const ratio = next / prev;
      this.members(g.id, id).forEach((m) => (m.settings.volume = Math.max(0, Math.min(1.5, (m.settings.volume ?? 0.85) * ratio))));
    }
    this.apply();
  }

  setPan(id: string, v: number): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.pan = Math.max(-1, Math.min(1, v));
    this.host.onUserChange?.(id, 'pan', s.pan);
    this.apply();
  }

  setMute(id: string, on: boolean, linked = true): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.mute = on;
    this.host.onUserChange?.(id, 'mute', on ? 1 : 0);
    const g = this.group(s.mixGroupId);
    if (linked && g?.linkMute) this.members(g.id, id).forEach((m) => (m.settings.mute = on));
    this.apply();
    this.host.changed();
  }

  setSolo(id: string, on: boolean, exclusive = false, linked = true): void {
    const s = this.settingsOf(id);
    if (!s) return;
    if (exclusive) this.channels().forEach((c) => (c.settings.solo = false));
    s.solo = on;
    const g = this.group(s.mixGroupId);
    if (linked && g?.linkSolo) this.members(g.id, id).forEach((m) => (m.settings.solo = on));
    this.apply();
    this.host.changed();
  }

  setTrim(id: string, db: number): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.trimDb = Math.max(-24, Math.min(24, db));
    this.host.onUserChange?.(id, 'trim', s.trimDb);
    this.apply();
  }

  setPhase(id: string, invert: boolean): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.phaseInvert = invert;
    this.apply();
    this.host.changed();
  }

  setWidth(id: string, w: number): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.width = Math.max(0, Math.min(2, w));
    this.host.onUserChange?.(id, 'width', s.width);
    this.apply();
  }

  /** Channel EQ (values are clamped; the UI saves with `changed()` when a drag ends). */
  setEq(id: string, patch: Partial<ChannelEq>): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.eq = eqOf({ ...eqOf(s.eq), ...patch });
    this.apply();
  }

  /** Channel compressor / gate. */
  setDyn(id: string, patch: Partial<ChannelDyn>): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.dyn = dynOf({ ...dynOf(s.dyn), ...patch });
    this.apply();
  }

  /** Current gain reduction of a channel's dynamics (dB, <= 0). */
  gainReduction(id: string): number {
    const strip = this.strips.get(id);
    return strip ? stripGainReduction(strip) : 0;
  }

  setSoloSafe(id: string, on: boolean): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.soloSafe = on;
    this.apply();
    this.host.changed();
  }

  /** Kick duck depth (0 = off). Keeps the chosen trigger source. */
  setDuck(id: string, amount: number, releaseMs = 140): void {
    const s = this.settingsOf(id);
    if (!s) return;
    const source = s.duck?.source;
    s.duck = amount > 0 || source ? { amount: Math.max(0, Math.min(1, amount)), releaseMs, source } : undefined;
    this.host.changed();
  }

  /** Trigger of the kick duck: a part's device id, or undefined for the drum parts' beats. */
  setDuckSource(id: string, source: string | undefined): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.duck = { amount: s.duck?.amount ?? 0, releaseMs: s.duck?.releaseMs ?? 140, source: source || undefined };
    this.host.changed();
  }

  /** Output to the master or a bus. Returns false (unchanged) when it would create a loop. */
  setOutput(id: string, dest: string): boolean {
    const s = this.settingsOf(id);
    if (!s) return false;
    if (dest !== 'master' && (!this.isBus(dest) || wouldLoop(this.routeNodes(this.channels()), id, dest))) return false;
    s.output = dest;
    this.apply();
    this.host.changed();
    return true;
  }

  setSend(id: string, busId: string, level: number, pre?: boolean): boolean {
    const s = this.settingsOf(id);
    if (!s || !this.isBus(busId)) return false;
    const sends = s.sends ?? [];
    const cur = sends.find((x) => x.busId === busId);
    if (!cur && wouldLoop(this.routeNodes(this.channels()), id, busId)) return false;
    this.host.onUserChange?.(id, `send:${busId}`, Math.max(0, Math.min(1.5, level)));
    if (cur) {
      cur.level = Math.max(0, Math.min(1.5, level));
      if (pre !== undefined) cur.pre = pre;
    } else {
      sends.push({ busId, level: Math.max(0, Math.min(1.5, level)), pre: !!pre });
    }
    s.sends = sends;
    this.apply();
    if (!cur) this.host.changed();
    return true;
  }

  updateSend(id: string, busId: string, patch: Partial<ChannelSend>): void {
    const send = this.settingsOf(id)?.sends?.find((x) => x.busId === busId);
    if (!send) return;
    Object.assign(send, patch);
    this.apply();
    this.host.changed();
  }

  removeSend(id: string, busId: string): void {
    const s = this.settingsOf(id);
    if (!s?.sends) return;
    s.sends = s.sends.filter((x) => x.busId !== busId);
    this.apply();
    this.host.changed();
  }

  rename(id: string, name: string): void {
    const s = this.settingsOf(id);
    if (!s || !name.trim()) return;
    s.name = name.trim();
    const dev = this.host.devices.get(id);
    if (dev instanceof MixBusDevice) dev.name = s.name;
    this.host.changed();
  }

  setColor(id: string, color: string): void {
    const s = this.settingsOf(id);
    if (!s) return;
    s.color = color;
    this.host.changed();
  }

  /* ------------------------------------------------------------ buses */

  createBus(name: string, kind: BusKind = 'bus', color?: string): MixBusDevice {
    const dev = this.host.createDevice('mix_bus', name) as MixBusDevice;
    dev.busKind = kind;
    dev.params.kind = kind;
    dev.channel.name = name;
    dev.channel.soloSafe = kind === 'return';
    if (color) dev.channel.color = color;
    this.host.connectAudio(dev.id, 'out_l', 'master', 'master_l');
    this.host.connectAudio(dev.id, 'out_r', 'master', 'master_r');
    this.apply();
    this.host.changed();
    return dev;
  }

  /** A return with one effect inserted (fully wet), e.g. Reverb / Delay. */
  createReturn(name: string, effect: BaseDevice | null, color?: string): MixBusDevice {
    const bus = this.createBus(name, 'return', color);
    if (effect) {
      effect.setParam('mix', 1);
      this.host.insertEffectOnTrack(effect.id, bus.id);
    }
    return bus;
  }

  /** Removes a bus (its inserts stay in the rack, unpatched). */
  deleteBus(id: string): void {
    if (!this.isBus(id)) return;
    this.forget(id);
    this.host.removeDevice(id);
    this.apply();
    this.host.changed();
  }

  /* ------------------------------------------------------------ VCA + groups */

  createVca(name: string, color = '#f59e0b'): VcaFader {
    const v: VcaFader = { id: uid('vca'), name, color, level: 1, mute: false };
    this.vcas.push(v);
    this.host.changed();
    return v;
  }

  setVca(id: string, patch: Partial<Omit<VcaFader, 'id'>>): void {
    const v = this.vcas.find((x) => x.id === id);
    if (!v) return;
    Object.assign(v, patch);
    if (patch.level !== undefined) v.level = Math.max(0, Math.min(1.5, patch.level));
    this.apply();
    if (patch.name || patch.mute !== undefined || patch.color) this.host.changed();
  }

  deleteVca(id: string): void {
    this.vcas = this.vcas.filter((v) => v.id !== id);
    this.channels().forEach((c) => c.settings.vcaId === id && (c.settings.vcaId = undefined));
    this.apply();
    this.host.changed();
  }

  assignVca(channelId: string, vcaId: string | undefined): void {
    const s = this.settingsOf(channelId);
    if (!s) return;
    s.vcaId = vcaId && this.vcas.some((v) => v.id === vcaId) ? vcaId : undefined;
    this.apply();
    this.host.changed();
  }

  createGroup(name: string, color = '#22d3ee'): MixGroup {
    const g: MixGroup = { id: uid('grp'), name, color, linkVolume: true, linkMute: true, linkSolo: true };
    this.groups.push(g);
    this.host.changed();
    return g;
  }

  setGroup(id: string, patch: Partial<Omit<MixGroup, 'id'>>): void {
    const g = this.groups.find((x) => x.id === id);
    if (!g) return;
    Object.assign(g, patch);
    this.host.changed();
  }

  deleteGroup(id: string): void {
    this.groups = this.groups.filter((g) => g.id !== id);
    this.channels().forEach((c) => c.settings.mixGroupId === id && (c.settings.mixGroupId = undefined));
    this.host.changed();
  }

  assignGroup(channelId: string, groupId: string | undefined): void {
    const s = this.settingsOf(channelId);
    if (!s) return;
    s.mixGroupId = groupId && this.groups.some((g) => g.id === groupId) ? groupId : undefined;
    this.host.changed();
  }

  /* ------------------------------------------------------------ master */

  get masterVolume(): number {
    return this.host.masterGain.gain.value;
  }

  setMasterVolume(v: number): void {
    this.host.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.host.ctx.currentTime, 0.015);
  }

  /* ------------------------------------------------------------ project */

  save(): MixerState {
    return {
      vcas: this.vcas.map((v) => ({ ...v })),
      groups: this.groups.map((g) => ({ ...g })),
      rackChannels: [...this.rackChannels].map(([id, s]) => [id, { ...s }]),
      buses: this.buses().map((b) => ({ id: b.id, kind: b.busKind, channel: { ...b.channel, sends: b.channel.sends?.map((s) => ({ ...s })) } })),
      masterVolume: this.host.masterGain.gain.value,
    };
  }

  /** Restores after devices, tracks and cables were rebuilt (`idMap`: saved id → new id). */
  load(data: unknown, idMap: Map<string, string>): void {
    this.restoringMixer = true;
    try {
      this.loadInner(data, idMap);
    } finally {
      this.restoringMixer = false;
      this.undoState = this.undoSnapshot();
    }
  }

  private loadInner(data: unknown, idMap: Map<string, string>): void {
    const d = (data ?? {}) as Partial<MixerState>;
    const map = (id: string | undefined) => (id && id !== 'master' ? idMap.get(id) ?? id : id);
    this.vcas = Array.isArray(d.vcas) ? d.vcas.map((v) => ({ ...v })) : [];
    this.groups = Array.isArray(d.groups) ? d.groups.map((g) => ({ ...g })) : [];
    this.rackChannels.clear();
    const fix = (s: ChannelSettings) => {
      s.output = map(s.output) ?? 'master';
      s.sends = s.sends?.map((x) => ({ ...x, busId: map(x.busId) ?? x.busId }));
    };
    for (const b of Array.isArray(d.buses) ? d.buses : []) {
      const dev = this.host.devices.get(map(b.id) ?? b.id);
      if (!(dev instanceof MixBusDevice)) continue;
      dev.busKind = b.kind === 'return' ? 'return' : 'bus';
      dev.params.kind = dev.busKind;
      dev.channel = { ...b.channel };
      fix(dev.channel);
    }
    for (const [id, s] of Array.isArray(d.rackChannels) ? d.rackChannels : []) {
      const nid = map(id);
      if (nid && this.host.devices.has(nid)) {
        const copy = { ...s };
        fix(copy);
        this.rackChannels.set(nid, copy);
      }
    }
    this.host.tracks.forEach(fix);
    if (typeof d.masterVolume === 'number') this.host.masterGain.gain.value = Math.max(0, Math.min(1.5, d.masterVolume));
    this.rebindMasterConnections();
  }
}
