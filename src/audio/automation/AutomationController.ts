/**
 * Automation playback and recording (`audioEngine.automation`).
 *
 * Playback: every scheduled 16th, lanes in read / touch / latch mode ramp their AudioParams
 * (fader, pan, trim, width, sends, master volume) sample-accurately from the step time; device
 * knobs, master EQ / width and mutes follow at control rate (4 updates per 16th); a tempo lane
 * sets the BPM before the next 16th is scheduled.
 * Recording: user moves of an automated target while playing write points (touch: until 0.5 s
 * after you let go; latch: until stop; write: overwrites everything while playing).
 */
import type { BaseDevice } from '../BaseDevice.ts';
import { SpecDevice } from '../spec/SpecDevice.ts';
import { paramDef } from '../../../shared/rack/devices/index.ts';
import { VstPluginDevice } from '../../vst/VstPluginDevice.ts';
import type { MixerController } from '../mixer/MixerController.ts';
import type { SequencerTrack } from '../types.ts';
import {
  type AutoLane, type AutoMode, type AutoPoint, type AutoTarget, type TargetRange, clearRange, denorm, norm, sameTarget, sortPoints, thinPoints, valueAt,
} from './model.ts';
import { undoJournal } from '../undoJournal.ts';

export interface AutomationHost {
  ctx: AudioContext;
  bpm: number;
  readonly isPlaying: boolean;
  readonly stepsPerBar: number;
  devices: Map<string, BaseDevice>;
  tracks: SequencerTrack[];
  mixer: MixerController;
  masterGain: GainNode;
  masterSpectrumState: Record<'low' | 'mid' | 'high' | 'width', number>;
  setMasterSpectrumParam(p: 'low' | 'mid' | 'high' | 'width', v: number): void;
  getPlayheadPosition(): number;
  changed(): void;
}

interface Pending {
  time: number;
  run: () => void;
}

const uid = () => `aut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const MASTER_LABEL: Record<string, string> = { volume: 'Master volume', width: 'Master width', low: 'Master low EQ', mid: 'Master mid EQ', high: 'Master high EQ' };

export class AutomationController {
  lanes: AutoLane[] = [];
  /** New lanes are created in this mode when you move an unautomated control while playing ('off' / 'read' = never). */
  globalMode: AutoMode = 'read';
  /** True while automation itself sets device params (so it doesn't record itself). */
  applying = false;
  private queue: Pending[] = [];
  private touch = new Map<string, { until: number; last: number; value: number }>();

  constructor(private host: AutomationHost) {}

  /* ------------------------------------------------------------ targets */

  range(t: AutoTarget): TargetRange {
    switch (t.kind) {
      case 'tempo':
        return { min: 40, max: 240, unit: 'BPM', label: 'Tempo' };
      case 'master':
        return t.param === 'volume' ? { min: 0, max: 1.5, label: MASTER_LABEL.volume } : { min: 0, max: 1, label: MASTER_LABEL[t.param] };
      case 'channel': {
        const name = this.host.mixer.settingsOf(t.channelId)?.name ?? 'Channel';
        if (t.param === 'volume') return { min: 0, max: 1.5, label: `${name} · Volume` };
        if (t.param === 'pan') return { min: -1, max: 1, label: `${name} · Pan` };
        if (t.param === 'mute') return { min: 0, max: 1, toggle: true, label: `${name} · Mute` };
        if (t.param === 'trim') return { min: -24, max: 24, unit: 'dB', label: `${name} · Trim` };
        if (t.param === 'width') return { min: 0, max: 2, label: `${name} · Width` };
        const bus = this.host.mixer.settingsOf(t.param.slice(5))?.name ?? 'bus';
        return { min: 0, max: 1, label: `${name} · Send ${bus}` };
      }
      case 'device': {
        const dev = this.host.devices.get(t.deviceId);
        const label = `${dev?.name ?? 'Device'} · ${t.param}`;
        if (dev instanceof SpecDevice) {
          const d = paramDef(dev.spec, t.param);
          if (d) return { min: d.min, max: d.max, log: d.curve === 'log' && d.min > 0, toggle: d.control === 'toggle', label: `${dev.name} · ${d.label}` };
        }
        const v = Number(dev?.params[t.param] ?? 0);
        if (dev instanceof VstPluginDevice || (v >= 0 && v <= 1)) return { min: 0, max: 1, label };
        return v < 0 ? { min: Math.min(-1, v * 2), max: Math.max(1, -v * 2), label } : { min: 0, max: Math.max(1, v * 2), label };
      }
    }
  }

  label(t: AutoTarget): string {
    return this.range(t).label;
  }

  /** Current (real) value of a target. */
  current(t: AutoTarget): number {
    const h = this.host;
    switch (t.kind) {
      case 'tempo':
        return h.bpm;
      case 'master':
        return t.param === 'volume' ? h.masterGain.gain.value : h.masterSpectrumState[t.param];
      case 'channel': {
        const s = h.mixer.settingsOf(t.channelId);
        if (!s) return 0;
        if (t.param === 'volume') return s.volume ?? 0.85;
        if (t.param === 'pan') return s.pan ?? 0;
        if (t.param === 'mute') return s.mute ? 1 : 0;
        if (t.param === 'trim') return s.trimDb ?? 0;
        if (t.param === 'width') return s.width ?? 1;
        return s.sends?.find((x) => x.busId === t.param.slice(5))?.level ?? 0;
      }
      case 'device':
        return Number(h.devices.get(t.deviceId)?.params[t.param] ?? 0);
    }
  }

  /** Targets offered for a track: its channel (volume, pan, sends…) and its instrument / insert knobs. */
  targetsFor(trackId: string): AutoTarget[] {
    const t = this.host.tracks.find((x) => x.id === trackId);
    if (!t) return [];
    const ch = t.deviceId;
    const out: AutoTarget[] = (['volume', 'pan', 'mute', 'trim', 'width'] as const).map((param) => ({ kind: 'channel', channelId: ch, param }));
    this.host.mixer.buses().forEach((b) => out.push({ kind: 'channel', channelId: ch, param: `send:${b.id}` }));
    const devs = [this.host.devices.get(ch), ...this.host.mixer.insertsOf(ch)].filter((d): d is BaseDevice => !!d);
    for (const d of devs) {
      const keys = d instanceof SpecDevice ? d.spec.params.filter((p) => !p.options).map((p) => p.key) : Object.keys(d.params).filter((k) => typeof d.params[k] === 'number');
      keys.forEach((param) => out.push({ kind: 'device', deviceId: d.id, param }));
    }
    return out;
  }

  /* ------------------------------------------------------------ lanes */

  lane(t: AutoTarget): AutoLane | undefined {
    return this.lanes.find((l) => sameTarget(l.target, t));
  }

  lanesFor(trackId: string): AutoLane[] {
    return this.lanes.filter((l) => l.trackId === trackId);
  }

  /** The track whose arrangement shows lanes for `target`; undefined when none does (a return / bus channel, or a device outside every track's chain). */
  ownerTrackOf(target: AutoTarget): string | undefined {
    if (target.kind === 'channel') return this.host.tracks.find((t) => t.deviceId === target.channelId)?.id;
    if (target.kind === 'device') {
      return this.host.tracks.find((t) => t.deviceId === target.deviceId || this.host.mixer.insertsOf(t.deviceId).some((d) => d.id === target.deviceId))?.id;
    }
    return undefined;
  }

  /** Right-click "Create automation lane" on a knob: the lane goes under the target's track, in the global mode (read when off). */
  createLane(target: AutoTarget): { ok: boolean; message: string } {
    const name = this.label(target);
    if (this.lane(target)) return { ok: false, message: `${name} already has an automation lane` };
    const owner = this.ownerTrackOf(target);
    if (!owner) return { ok: false, message: `${name}: no track shows lanes for it. Put the device in an instrument's chain (returns and buses have no track).` };
    this.addLane(target, this.globalMode === 'off' ? 'read' : this.globalMode, owner);
    const track = this.host.tracks.find((t) => t.id === owner);
    return { ok: true, message: `Automation lane for ${name} added under ${track?.name ?? 'its track'}: draw it in the song sequencer` };
  }

  addLane(target: AutoTarget, mode: AutoMode = 'read', trackId?: string): AutoLane {
    const have = this.lane(target);
    if (have) return have;
    const owner = trackId ?? this.ownerTrackOf(target);
    const lane: AutoLane = { id: uid(), target, points: [], mode: mode === 'off' ? 'read' : mode, trackId: owner, visible: true };
    this.lanes.push(lane);
    this.host.changed();
    undoJournal.push(
      `auto:add:${lane.id}`,
      'Add automation lane',
      () => this.restoreLane(null, lane.id),
      () => this.restoreLane(structuredClone(lane), null)
    );
    return lane;
  }

  /** Puts a lane back (undo of add / delete) or removes it, then re-applies the mix. */
  private restoreLane(lane: AutoLane | null, removeId: string | null): void {
    if (removeId) this.lanes = this.lanes.filter((l) => l.id !== removeId);
    if (lane && !this.lanes.some((l) => l.id === lane.id)) this.lanes.push(structuredClone(lane));
    this.host.mixer.apply();
    this.host.changed();
  }

  removeLane(id: string): void {
    const lane = this.lanes.find((l) => l.id === id);
    if (!lane) return;
    this.lanes = this.lanes.filter((l) => l.id !== id);
    this.host.mixer.apply();
    this.host.changed();
    undoJournal.push(
      `auto:del:${id}`,
      'Delete automation lane',
      () => this.restoreLane(structuredClone(lane), null),
      () => this.restoreLane(null, id)
    );
  }

  setMode(id: string, mode: AutoMode): void {
    const l = this.lanes.find((x) => x.id === id);
    if (!l) return;
    l.mode = mode;
    this.host.mixer.apply();
    this.host.changed();
  }

  setAllModes(mode: AutoMode): void {
    this.globalMode = mode;
    this.lanes.forEach((l) => (l.mode = mode));
    this.host.mixer.apply();
    this.host.changed();
  }

  setPoints(id: string, points: AutoPoint[]): void {
    const l = this.lanes.find((x) => x.id === id);
    if (!l) return;
    const prev = l.points.map((p) => ({ ...p }));
    l.points = sortPoints(points.map((p) => ({ ...p, pos: Math.max(0, p.pos), value: Math.max(0, Math.min(1, p.value)) })));
    const next = l.points.map((p) => ({ ...p }));
    this.host.changed();
    const applyPoints = (pts: AutoPoint[]) => {
      const lane = this.lanes.find((x) => x.id === id);
      if (!lane) return;
      lane.points = sortPoints(pts.map((p) => ({ ...p })));
      this.host.changed();
    };
    undoJournal.push(`auto:pts:${id}`, 'Edit automation', () => applyPoints(prev), () => applyPoints(next));
  }

  /** Lanes whose target no longer exists are dropped (device / channel removed). */
  forgetDevice(id: string): void {
    const n = this.lanes.length;
    this.lanes = this.lanes.filter((l) => !(l.target.kind === 'device' && l.target.deviceId === id) && !(l.target.kind === 'channel' && (l.target.channelId === id || l.target.param === `send:${id}`)));
    if (this.lanes.length !== n) this.host.changed();
  }

  /** True when automation drives this channel param during playback (the mixer leaves it alone). */
  drives(channelId: string, param: string): boolean {
    if (!this.host.isPlaying) return false;
    const l = this.lane({ kind: 'channel', channelId, param: param as never });
    return !!l && l.points.length > 0 && l.mode !== 'off' && l.mode !== 'write' && !this.touch.has(l.id);
  }

  /* ------------------------------------------------------------ playback */

  /** Called for every scheduled 16th (before notes) with its audio time and duration. */
  step(
    pos: number,
    time: number,
    dur: number,
    playbackLanes: readonly AutoLane[] = this.lanes,
    readValueAt: (lane: AutoLane, position: number) => number | null = (lane, position) => valueAt(lane.points, position),
  ): void {
    const h = this.host;
    const now = h.ctx.currentTime;
    this.releaseTouches(now);
    for (const l of playbackLanes) {
      const sourceLane = this.lanes.find((item) => item.id === l.id);
      if (l.mode === 'write' || (l.mode === 'latch' && this.touch.has(l.id))) {
        // keep writing the held value
        const held = this.touch.get(l.id)?.value ?? norm(this.range(l.target), this.current(l.target));
        if (sourceLane) this.record(sourceLane, pos, held);
        continue;
      }
      if (l.mode === 'off' || !['read', 'touch', 'latch'].includes(l.mode) || this.touch.has(l.id) || readValueAt(l, pos) === null) continue;
      const r = this.range(l.target);
      const n0 = readValueAt(l, pos)!;
      const n1 = readValueAt(l, pos + 1)!;
      const v0 = denorm(r, n0);
      const v1 = denorm(r, n1);
      const t = l.target;
      if (t.kind === 'tempo') {
        if (Math.abs(h.bpm - v0) > 0.001) h.bpm = v0;
        continue;
      }
      if (t.kind === 'master') {
        if (t.param === 'volume') this.ramp(h.masterGain.gain, v0, v1, time, dur);
        else this.at(time, () => h.setMasterSpectrumParam(t.param as 'low' | 'mid' | 'high' | 'width', v0));
        continue;
      }
      if (t.kind === 'device') {
        const dev = h.devices.get(t.deviceId);
        if (!dev) continue;
        for (let k = 0; k < 4; k++) {
          const normalized = readValueAt(l, pos + k / 4);
          if (normalized === null) continue;
          const v = denorm(r, normalized);
          this.at(time + (k * dur) / 4, () => {
            this.applying = true;
            try {
              dev.setParam(t.param, v);
            } finally {
              this.applying = false;
            }
          });
        }
        continue;
      }
      this.stepChannel(t.channelId, t.param, v0, v1, time, dur);
    }
  }

  private stepChannel(id: string, param: string, v0: number, v1: number, time: number, dur: number): void {
    const m = this.host.mixer;
    const s = m.settingsOf(id);
    const strip = m.strips.get(id);
    if (!s || !strip) return;
    const vca = s.vcaId ? (m.vcas.find((v) => v.id === s.vcaId)?.level ?? 1) : 1;
    if (param === 'volume') {
      this.ramp(strip.fader.gain, v0 * vca, v1 * vca, time, dur);
      this.at(time, () => (s.volume = v0));
    } else if (param === 'pan') {
      this.ramp(strip.pan.pan, v0, v1, time, dur);
      this.at(time, () => (s.pan = v0));
    } else if (param === 'trim') {
      this.ramp(strip.trim.gain, Math.pow(10, v0 / 20), Math.pow(10, v1 / 20), time, dur);
      this.at(time, () => (s.trimDb = v0));
    } else if (param === 'width') {
      const d = (w: number) => (1 + w) / 2;
      const c = (w: number) => (1 - w) / 2;
      this.ramp(strip.wLL.gain, d(v0), d(v1), time, dur);
      this.ramp(strip.wRR.gain, d(v0), d(v1), time, dur);
      this.ramp(strip.wRL.gain, c(v0), c(v1), time, dur);
      this.ramp(strip.wLR.gain, c(v0), c(v1), time, dur);
      this.at(time, () => (s.width = v0));
    } else if (param === 'mute') {
      const on = v0 >= 0.5;
      if (on !== s.mute) this.at(time, () => {
        s.mute = on;
        m.apply();
      });
    } else if (param.startsWith('send:')) {
      const send = strip.sends.get(param.slice(5));
      if (send) this.ramp(send.gain.gain, v0, v1, time, dur);
      const cfg = s.sends?.find((x) => x.busId === param.slice(5));
      if (cfg) this.at(time, () => (cfg.level = v0));
    }
  }

  private ramp(p: AudioParam, v0: number, v1: number, time: number, dur: number): void {
    try {
      p.cancelScheduledValues(time);
      p.setValueAtTime(v0, time);
      p.linearRampToValueAtTime(v1, time + dur);
    } catch {
      // param of a removed node
    }
  }

  private at(time: number, run: () => void): void {
    this.queue.push({ time, run });
  }

  /** Runs control-rate events that are due (called from the scheduler timer, every ~25 ms). */
  pump(now: number): void {
    if (!this.queue.length) return;
    const due = this.queue.filter((e) => e.time <= now + 0.012);
    if (!due.length) return;
    this.queue = this.queue.filter((e) => e.time > now + 0.012);
    due.sort((a, b) => a.time - b.time).forEach((e) => e.run());
  }

  /* ------------------------------------------------------------ recording */

  /** A user moved a control (mixer / knob). Records while playing in touch / latch / write. */
  userChanged(target: AutoTarget, value: number): void {
    const h = this.host;
    if (this.applying || !h.isPlaying) return;
    let lane = this.lane(target);
    if (!lane) {
      if (this.globalMode !== 'touch' && this.globalMode !== 'latch' && this.globalMode !== 'write') return;
      lane = this.addLane(target, this.globalMode);
    }
    if (lane.mode !== 'touch' && lane.mode !== 'latch' && lane.mode !== 'write') return;
    const n = norm(this.range(target), value);
    const pos = h.getPlayheadPosition();
    const first = !this.touch.has(lane.id);
    if (first && lane.points.length) {
      // keep the curve up to the touch point
      const before = valueAt(lane.points, pos - 0.05);
      if (before !== null) lane.points = sortPoints([...lane.points, { pos: Math.max(0, pos - 0.05), value: before }]);
    }
    this.touch.set(lane.id, { until: lane.mode === 'touch' ? h.ctx.currentTime + 0.5 : Infinity, last: pos, value: n });
    this.record(lane, pos, n);
  }

  private record(lane: AutoLane, pos: number, n: number): void {
    const t = this.touch.get(lane.id);
    const from = t ? Math.min(t.last, pos) : pos;
    lane.points = sortPoints([...clearRange(lane.points, from, pos), { pos, value: n }]);
    if (t) {
      t.last = pos;
      t.value = n;
    } else if (lane.mode === 'write') this.touch.set(lane.id, { until: Infinity, last: pos, value: n });
  }

  private releaseTouches(now: number): void {
    for (const [id, t] of this.touch) {
      if (t.until > now) continue;
      this.touch.delete(id);
      const lane = this.lanes.find((l) => l.id === id);
      if (lane) lane.points = thinPoints(lane.points);
    }
  }

  /** Transport stopped: finish latch / write passes. */
  stopped(): void {
    for (const id of this.touch.keys()) {
      const lane = this.lanes.find((l) => l.id === id);
      if (lane) lane.points = thinPoints(lane.points);
    }
    this.touch.clear();
    this.queue = [];
    this.host.mixer.apply();
  }

  /* ------------------------------------------------------------ project */

  save(): { lanes: AutoLane[]; globalMode: AutoMode } {
    return { lanes: this.lanes.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) })), globalMode: this.globalMode };
  }

  load(data: unknown, idMap: Map<string, string>): void {
    const d = (data ?? {}) as { lanes?: AutoLane[]; globalMode?: AutoMode };
    const map = (id: string) => idMap.get(id) ?? id;
    this.globalMode = d.globalMode ?? 'read';
    this.touch.clear();
    this.queue = [];
    this.lanes = (Array.isArray(d.lanes) ? d.lanes : []).flatMap((l): AutoLane[] => {
      const t = l.target;
      const target: AutoTarget =
        t.kind === 'channel' ? { ...t, channelId: map(t.channelId), param: t.param.startsWith('send:') ? (`send:${map(t.param.slice(5))}` as const) : t.param }
        : t.kind === 'device' ? { ...t, deviceId: map(t.deviceId) }
        : t;
      const ok = target.kind === 'channel' ? !!this.host.mixer.settingsOf(target.channelId) : target.kind === 'device' ? this.host.devices.has(target.deviceId) : true;
      if (!ok) return [];
      const trackId = l.trackId && this.host.tracks.some((x) => x.id === l.trackId) ? l.trackId : undefined;
      return [{ ...l, target, trackId, points: sortPoints((l.points ?? []).map((p) => ({ ...p }))) }];
    });
  }

}
