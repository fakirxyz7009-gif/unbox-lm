/**
 * Recording (`audioEngine.recorder`): audio into armed audio tracks, MIDI into armed instrument
 * tracks. Count-in, pre-roll, post-roll, punch in/out, loop (cycle) recording into takes,
 * overdub / replace / takes modes and latency compensation.
 *
 * Audio is captured by the 'unbox-recorder' worklet with exact context frames, then cut to the
 * recorded song range on stop, so the clip lands on the grid where it was played.
 */
import type { BaseDevice } from '../BaseDevice.ts';
import type { ArrangementClip, ClipNote, SequencerTrack } from '../types.ts';
import type { PlaybackMode } from '../sequencer/model.ts';
import { TICKS_PER_16TH, barToTick, newSeqId, syncTrackPatterns, divisionTicks } from '../sequencer/model.ts';
import { AudioTrackDevice } from '../clips/AudioTrackDevice.ts';
import { audioStore } from '../clips/audioStore.ts';
import { InputManager } from './InputManager.ts';
import { WorkletCapture, ensureRecorderWorklet } from './recorderWorklet.ts';
import { toast } from '../../shell/toast.ts';
import type { ProjectTimeMap } from '../time/ProjectTimeMap.ts';

export type RecordMode = 'overdub' | 'replace' | 'takes';

export interface RecordedMidiClipRef {
  trackId: string;
  clipId: string;
}

export interface RecordSettings {
  countInBars: number;
  preRollBars: number;
  postRollBars: number;
  punch: boolean;
  punchInBar: number;
  punchOutBar: number;
  mode: RecordMode;
  /** Input quantize for MIDI recording in 16ths (0 = off). */
  midiQuantize: number;
  /** Manual latency correction added to the measured one (ms, + = recording moves earlier). */
  offsetMs: number;
}

export interface RecordHost {
  ctx: AudioContext;
  readonly bpm: number;
  readonly stepsPerBar: number;
  readonly timeMap?: ProjectTimeMap;
  tracks: SequencerTrack[];
  devices: Map<string, BaseDevice>;
  isPlaying: boolean;
  isRecording: boolean;
  loopEnabled: boolean;
  playbackMode: PlaybackMode;
  activePatternIndex: number;
  songPosition: number;
  audioConnections: { targetDeviceId: string }[];
  getLoopRange(): { start: number; end: number };
  getPlayheadPosition(): number;
  timeOfSongPosition(pos16: number): number | null;
  positionAtTime(t: number): number;
  startTransport(startAt?: number): Promise<void>;
  stopTransport(): void;
  seekToSongPosition(pos16: number): void;
  clickAt(time: number, downbeat: boolean): void;
  /** Stereo tap of the master output (before the monitor section). */
  readonly masterTap: AudioNode;
  createAudioTrack(name?: string): SequencerTrack;
  /** Request Web MIDI access from the Record gesture for armed instrument tracks. */
  enableMidiInput(): Promise<boolean>;
  commitEdit(): void;
  changed(): void;
}

interface AudioJob {
  track: SequencerTrack;
  capture: WorkletCapture;
  /** Physical input (latency compensated) or rack cables (no compensation). */
  physical: boolean;
}

interface Pending {
  deviceId: string;
  note: number;
  vel: number;
  tick: number;
  patternId: string | null;
}

export class RecordController {
  readonly input: InputManager;
  readonly settings: RecordSettings = {
    countInBars: 0, preRollBars: 0, postRollBars: 0, punch: false, punchInBar: 0, punchOutBar: 4, mode: 'overdub', midiQuantize: 0, offsetMs: 0,
  };
  state: 'idle' | 'count-in' | 'recording' = 'idle';
  /** Last error to show (permission, no armed track…). */
  message: string | null = null;
  private jobs: AudioJob[] = [];
  private startPos = 0;
  private startTime = 0;
  /** A scheduled punch range; MIDI-only takes use a silent native alarm for their end event. */
  private punchAlarm: { node: ConstantSourceNode | null; endPos: number; endTime: number } | null = null;
  /** Silent native alarm that flips the visible count-in state at the audio-clock boundary. */
  private countInAlarm: ConstantSourceNode | null = null;
  private midiPending = new Map<string, Pending>();
  private midiNotes = new Map<string, { deviceId: string; patternId: string | null; notes: ClipNote[]; startTick: number }>();
  private recordingPlaybackMode: PlaybackMode = 'song_arrangement';
  private readonly patternTargets = new Map<string, string>();
  private midiClipListeners = new Set<(clip: RecordedMidiClipRef) => void>();
  private masterJob: { capture: WorkletCapture; track: SequencerTrack } | null = null;
  private takeCounter = 0;

  constructor(private host: RecordHost) {
    this.input = new InputManager(host.ctx);
  }

  /** UI may select the latest recorded arrangement clip so the take is immediately inspectable. */
  onMidiClipRecorded(fn: (clip: RecordedMidiClipRef) => void): () => void {
    this.midiClipListeners.add(fn);
    return () => this.midiClipListeners.delete(fn);
  }

  /** Total delay between a sound being scheduled and the same sound coming back in (seconds). */
  get roundTripLatency(): number {
    const ctx = this.host.ctx as AudioContext & { outputLatency?: number };
    return (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + this.input.inputLatency + this.settings.offsetMs / 1000;
  }

  private armedAudio(): SequencerTrack[] {
    return this.host.tracks.filter((t) => t.kind === 'audio' && t.armed && !t.disabled);
  }

  private armedMidi(): SequencerTrack[] {
    return this.host.tracks.filter((t) => t.kind !== 'audio' && t.armed && !t.disabled);
  }

  /** A track recording what is cabled into it in the rack (resampling) needs no input device. */
  private hasCables(dev: BaseDevice | undefined): boolean {
    return !!dev && this.host.audioConnections.some((c) => c.targetDeviceId === dev.id);
  }

  /** Routes the physical input into armed / monitoring audio tracks and sets their monitor switch. */
  async syncInputs(): Promise<void> {
    const needs = this.host.tracks.filter((t) => t.kind === 'audio' && (t.armed || t.monitor === 'on') && !this.hasCables(this.host.devices.get(t.deviceId)));
    if (needs.length) {
      try {
        await this.input.open();
      } catch (e) {
        this.message = (e as Error).message;
        this.host.changed();
      }
    }
    for (const t of this.host.tracks) {
      const dev = this.host.devices.get(t.deviceId);
      if (!(dev instanceof AudioTrackDevice)) continue;
      const wants = needs.includes(t) && this.input.isOpen;
      try {
        this.input.output('stereo').disconnect(dev.liveInput);
      } catch {
        // not connected
      }
      try {
        this.input.output('left').disconnect(dev.liveInput);
      } catch {
        // not connected
      }
      try {
        this.input.output('right').disconnect(dev.liveInput);
      } catch {
        // not connected
      }
      if (wants) this.input.output(t.inputChannel ?? 'stereo').connect(dev.liveInput);
      const monitor = t.monitor === 'on' || ((t.monitor ?? 'auto') === 'auto' && !!t.armed);
      dev.setMonitoring(monitor);
    }
  }

  /** Record button: start, or stop when already recording. */
  async toggle(): Promise<void> {
    if (this.state !== 'idle') await this.stop();
    else await this.start();
  }

  async start(): Promise<boolean> {
    const h = this.host;
    this.message = null;
    const audio = this.armedAudio();
    const midi = this.armedMidi();
    if (!audio.length && !midi.length) {
      this.message = 'Arm a track first (● REC on an audio or instrument track).';
      h.changed();
      return false;
    }
    if (midi.length) {
      const reportUnavailable = (): void => {
        this.message = 'MIDI input is unavailable. Check MIDI permission and connection; the on-screen keyboard can still record.';
        h.changed();
      };
      // Permission prompts can remain unresolved until the user responds. Start the
      // take immediately so MIDI access never blocks transport or keyboard capture.
      try {
        void h.enableMidiInput().then((available) => {
          if (!available) reportUnavailable();
        }, reportUnavailable);
      } catch {
        reportUnavailable();
      }
    }
    // A take must keep the destination it started with, even if the user changes modes before Stop.
    this.recordingPlaybackMode = h.playbackMode;
    this.patternTargets.clear();
    if (this.recordingPlaybackMode === 'pattern_loop') {
      for (const track of midi) this.patternTargets.set(track.deviceId, syncTrackPatterns(track, h.activePatternIndex).id);
    }
    if (audio.length) {
      if (!(await ensureRecorderWorklet(h.ctx))) {
        this.message = 'This browser cannot record (AudioWorklet unavailable).';
        h.changed();
        return false;
      }
      await this.syncInputs();
      if (audio.some((t) => !this.hasCables(h.devices.get(t.deviceId))) && !this.input.isOpen) {
        h.changed();
        return false;
      }
    }
    const spb = h.stepsPerBar;
    const s = this.settings;
    this.takeCounter++;
    this.jobs = audio.map((track) => {
      const dev = h.devices.get(track.deviceId) as AudioTrackDevice;
      return { track, capture: new WorkletCapture(h.ctx, dev.recordTap, 2), physical: !this.hasCables(dev) };
    });
    // Wait for each worklet's own render-thread acknowledgement before a
    // count-in, punch edge, or physical note can be scheduled against it.
    await Promise.all(this.jobs.map((j) => j.capture.start()));
    this.midiPending.clear();
    this.midiNotes.clear();

    if (h.isPlaying) {
      this.startPos = s.punch ? Math.max(Math.ceil(h.getPlayheadPosition()), Math.round(s.punchInBar * spb)) : Math.ceil(h.getPlayheadPosition());
      this.startTime = h.timeOfSongPosition(this.startPos) ?? h.ctx.currentTime;
    } else {
      this.startPos = s.punch ? Math.round(s.punchInBar * spb) : h.songPosition;
      const transportStart = Math.max(0, this.startPos - Math.round(s.preRollBars * spb));
      const beat = 60 / h.bpm;
      const beatsPerBar = Math.max(1, Math.round(spb / 4));
      const countBeats = Math.round(s.countInBars * beatsPerBar);
      const t0 = h.ctx.currentTime + 0.12 + countBeats * beat;
      for (let b = 0; b < countBeats; b++) h.clickAt(t0 - (countBeats - b) * beat, b % beatsPerBar === 0);
      h.seekToSongPosition(transportStart);
      if (countBeats) this.state = 'count-in';
      await h.startTransport(t0);
      this.startTime = h.timeOfSongPosition(this.startPos) ?? t0;
    }
    if (this.state !== 'count-in') this.state = 'recording';
    h.isRecording = true;
    this.scheduleCountInState();
    this.schedulePunchOut();
    h.changed();
    return true;
  }

  /**
   * Schedule an exact worklet-frame capture boundary and a zero-gain AudioContext
   * alarm for the controller transition. Unlike an interval, neither drifts with a
   * busy UI thread and the final recorded sample cannot pass the punch edge.
   */
  private schedulePunchOut(): void {
    const h = this.host;
    if (!this.settings.punch || h.loopEnabled) return;
    const endPos = Math.round(this.settings.punchOutBar * h.stepsPerBar);
    const endTime = h.timeOfSongPosition(endPos);
    if (endTime === null || endTime <= h.ctx.currentTime + 0.002) {
      void this.stop(true);
      return;
    }
    // Audio takes report only after their worklet has already cut its current quantum at the
    // requested frame. Waiting for that report avoids racing an ordinary stop message against
    // the exact-boundary message when the main thread is congested.
    this.punchAlarm = { node: null, endPos, endTime };
    const captures = this.jobs.map((job) => job.capture.stopAt(endTime));
    if (captures.length) {
      void Promise.all(captures).then(() => {
        if (this.punchAlarm?.endTime === endTime) void this.stop(true);
      });
      return;
    }
    // A MIDI-only take has no recorder worklet, so a zero-gain scheduled source gives it the
    // same AudioContext-clock transition without a wall-clock polling loop.
    const alarm = h.ctx.createConstantSource();
    const silence = h.ctx.createGain();
    silence.gain.value = 0;
    alarm.connect(silence).connect(h.ctx.destination);
    this.punchAlarm = { node: alarm, endPos, endTime };
    alarm.onended = () => {
      if (this.punchAlarm?.node !== alarm) return;
      void this.stop(true);
    };
    alarm.start();
    alarm.stop(endTime);
  }

  private scheduleCountInState(): void {
    if (this.state !== 'count-in') return;
    const h = this.host;
    const alarm = h.ctx.createConstantSource();
    const silence = h.ctx.createGain();
    silence.gain.value = 0;
    alarm.connect(silence).connect(h.ctx.destination);
    this.countInAlarm = alarm;
    alarm.onended = () => {
      if (this.countInAlarm !== alarm) return;
      this.countInAlarm = null;
      this.beginRecordingAfterCountIn();
      try { alarm.disconnect(); } catch {}
    };
    alarm.start();
    alarm.stop(Math.max(h.ctx.currentTime + 0.002, this.startTime));
  }

  private clearCountInAlarm(): void {
    const alarm = this.countInAlarm;
    this.countInAlarm = null;
    if (!alarm) return;
    alarm.onended = null;
    try { alarm.stop(this.host.ctx.currentTime); } catch {}
    try { alarm.disconnect(); } catch {}
  }

  private beginRecordingAfterCountIn(): void {
    if (this.state !== 'count-in' || this.host.ctx.currentTime < this.startTime) return;
    this.clearCountInAlarm();
    this.state = 'recording';
    this.host.changed();
  }

  /** Stops recording; `auto` = reached punch-out (transport keeps going for the post-roll). */
  async stop(auto = false): Promise<void> {
    if (this.state === 'idle') return;
    const h = this.host;
    this.clearCountInAlarm();
    const scheduledPunch = this.punchAlarm;
    this.punchAlarm = null;
    if (scheduledPunch?.node) {
      scheduledPunch.node.onended = null;
      try { scheduledPunch.node.stop(h.ctx.currentTime); } catch {}
      try { scheduledPunch.node.disconnect(); } catch {}
    }
    const spb = h.stepsPerBar;
    const s = this.settings;
    const now = h.ctx.currentTime;
    // End of the recorded range on the song grid.
    // Keep the fractional 16th position so held MIDI notes end where transport actually stopped.
    let endPos = h.getPlayheadPosition();
    if (s.punch) endPos = Math.min(endPos, Math.round(s.punchOutBar * spb));
    if (auto && scheduledPunch) endPos = scheduledPunch.endPos;
    const endTime = s.punch && auto ? scheduledPunch?.endTime ?? h.timeOfSongPosition(endPos) ?? now : now;
    this.state = 'idle';
    h.isRecording = false;

    const loop = h.loopEnabled && h.playbackMode === 'song_arrangement' ? h.getLoopRange() : null;
    const results = await Promise.all(this.jobs.map(async (j) => ({ j, data: await j.capture.stop() })));
    this.jobs = [];
    for (const { j, data } of results) this.placeAudio(j, data, endTime, loop);
    this.finishMidi(endPos);

    if (auto && s.postRollBars > 0) {
      const stopAt = endTime + s.postRollBars * spb * (60 / h.bpm / 4);
      this.scheduleTransportStop(stopAt);
    }
    h.commitEdit();
    h.changed();
  }

  /** Keep post-roll on the audio clock as well; no wall-clock timer controls transport. */
  private scheduleTransportStop(time: number): void {
    const h = this.host;
    const alarm = h.ctx.createConstantSource();
    const silence = h.ctx.createGain();
    silence.gain.value = 0;
    alarm.connect(silence).connect(h.ctx.destination);
    alarm.onended = () => {
      try { alarm.disconnect(); } catch {}
      if (h.isPlaying && !h.isRecording) h.stopTransport();
    };
    alarm.start();
    alarm.stop(Math.max(h.ctx.currentTime + 0.002, time));
  }

  private placeAudio(j: AudioJob, data: { frame: number; channels: Float32Array[] }, endTime: number, loop: { start: number; end: number } | null): void {
    const h = this.host;
    const sr = h.ctx.sampleRate;
    const spb = h.stepsPerBar;
    const comp = j.physical ? this.roundTripLatency : 0;
    const len = data.channels[0]?.length ?? 0;
    if (!len) return;
    const slice = (t0: number, t1: number): AudioBuffer | null => {
      const i0 = Math.round((t0 + comp) * sr) - data.frame;
      const i1 = Math.round((t1 + comp) * sr) - data.frame;
      const n = i1 - i0;
      if (n < sr * 0.05) {
        toast('A take shorter than 50 ms was not kept.', 'info');
        return null;
      }
      const buf = new AudioBuffer({ length: n, numberOfChannels: data.channels.length, sampleRate: sr });
      data.channels.forEach((ch, c) => {
        const out = buf.getChannelData(c);
        for (let k = 0; k < n; k++) {
          const i = i0 + k;
          out[k] = i >= 0 && i < ch.length ? ch[i] : 0;
        }
      });
      return buf;
    };
    const posSec = h.timeMap
      ? Math.max(0.01, h.timeMap.sixteenthToSeconds(1) - h.timeMap.sixteenthToSeconds(0))
      : 60 / h.bpm / 4;
    const name = `${j.track.name} take ${this.takeCounter}`;
    const loopStart = loop ? Math.round(loop.start * spb) : 0;
    const loopEnd = loop ? Math.round(loop.end * spb) : 0;
    const cycling = loop && this.startPos >= loopStart && this.startPos < loopEnd;
    if (cycling) {
      // Cycle recording: every pass of the loop becomes a take of one clip covering the loop.
      const passSec = h.timeMap
        ? Math.max(0.05, h.timeMap.sixteenthToSeconds(loopEnd) - h.timeMap.sixteenthToSeconds(loopStart))
        : (loopEnd - loopStart) * posSec;
      const firstEnd = h.timeMap
        ? this.startTime + Math.max(0, h.timeMap.sixteenthToSeconds(loopEnd) - h.timeMap.sixteenthToSeconds(this.startPos))
        : this.startTime + (loopEnd - this.startPos) * posSec;
      const padFirstSec = h.timeMap
        ? Math.max(0, h.timeMap.sixteenthToSeconds(this.startPos) - h.timeMap.sixteenthToSeconds(loopStart))
        : (this.startPos - loopStart) * posSec;
      const takes: { id: string; audioId: string; name: string }[] = [];
      const push = (t0: number, t1: number, padStart: number) => {
        const b = slice(t0 - padStart, t1);
        if (!b) return;
        if (padStart > 0) {
          const pad = Math.round(padStart * sr);
          for (let c = 0; c < b.numberOfChannels; c++) b.getChannelData(c).fill(0, 0, Math.min(pad, b.length));
        }
        const a = audioStore.add(`${name}.${takes.length + 1}`, b);
        takes.push({ id: newSeqId('take'), audioId: a.id, name: `Take ${takes.length + 1}` });
      };
      push(this.startTime, Math.min(firstEnd, endTime), padFirstSec);
      for (let t = firstEnd; t < endTime - 0.05; t += passSec) push(t, Math.min(t + passSec, endTime), 0);
      if (!takes.length) return;
      this.addClip(j.track, {
        startBar: loopStart / spb,
        lengthBars: (loopEnd - loopStart) / spb,
        audioId: takes[takes.length - 1].audioId,
        takes,
        name,
      });
      return;
    }
    const buf = slice(this.startTime, endTime);
    if (!buf) return;
    const a = audioStore.add(name, buf);
    const lengthPos = Math.max(1, Math.round(buf.duration / posSec));
    this.addClip(j.track, { startBar: this.startPos / spb, lengthBars: lengthPos / spb, audioId: a.id, name });
  }

  private addClip(track: SequencerTrack, c: { startBar: number; lengthBars: number; audioId: string; name: string; takes?: { id: string; audioId: string; name: string }[] }): void {
    const clips = (track.arrangementClips ??= []);
    const mode = this.settings.mode;
    const end = c.startBar + c.lengthBars;
    if (mode === 'takes') {
      const same = clips.find((x) => x.kind === 'audio' && Math.abs(x.startBar - c.startBar) < 1e-6 && Math.abs(x.lengthBars - c.lengthBars) < 1e-6);
      if (same) {
        const prev = same.takes ?? [{ id: newSeqId('take'), audioId: same.audioId!, name: 'Take 1' }];
        const added = (c.takes ?? [{ id: newSeqId('take'), audioId: c.audioId, name: '' }]).map((t, i) => ({ ...t, name: `Take ${prev.length + i + 1}` }));
        same.takes = [...prev, ...added];
        same.audioId = added[added.length - 1].audioId;
        return;
      }
    }
    if (mode === 'replace') {
      // cut existing audio out of the recorded range
      track.arrangementClips = clips.flatMap((x) => {
        if (x.kind !== 'audio') return [x];
        const xe = x.startBar + x.lengthBars;
        if (xe <= c.startBar || x.startBar >= end) return [x];
        const keep: ArrangementClip[] = [];
        if (x.startBar < c.startBar) keep.push({ ...x, lengthBars: c.startBar - x.startBar, fadeOut: undefined });
        if (xe > end) {
          const cut = end - x.startBar;
          const rate = x.warp === 'repitch' && x.sourceBpm ? this.host.bpm / x.sourceBpm : 1;
          const srcPerBar = this.host.stepsPerBar * (60 / this.host.bpm / 4) * rate * Math.pow(2, (x.pitch ?? 0) / 12);
          keep.push({ ...x, id: newSeqId('clip'), startBar: end, lengthBars: xe - end, audioOffset: (x.audioOffset ?? 0) + cut * srcPerBar, fadeIn: undefined });
        }
        return keep;
      });
    }
    track.arrangementClips!.push({
      id: newSeqId('clip'),
      kind: 'audio',
      startBar: c.startBar,
      lengthBars: c.lengthBars,
      audioId: c.audioId,
      audioOffset: 0,
      name: c.name,
      color: track.color,
      takes: c.takes && c.takes.length > 1 ? c.takes : undefined,
    });
  }

  /* ------------------------------------------------------------ MIDI */

  /** Called for every live note (keyboard, MIDI, on-screen keys) on an instrument. */
  noteOn(deviceId: string, note: number, vel: number, channel = 0): void {
    this.beginRecordingAfterCountIn();
    if (this.state !== 'recording') return;
    const track = this.host.tracks.find((t) => t.deviceId === deviceId && t.kind !== 'audio' && t.armed);
    if (!track) return;
    const key = JSON.stringify([deviceId, channel & 0x0f, note & 0x7f]);
    const tick = this.liveTick();
    const retriggered = this.midiPending.get(key);
    if (retriggered) this.commitNote(deviceId, retriggered, tick);
    let patternId: string | null = null;
    if (this.recordingPlaybackMode === 'pattern_loop') {
      patternId = this.patternTargets.get(deviceId) ?? syncTrackPatterns(track, this.host.activePatternIndex).id;
      this.patternTargets.set(deviceId, patternId);
    }
    this.midiPending.set(key, { deviceId, note, vel, tick, patternId });
  }

  noteOff(deviceId: string, note: number, channel = 0): void {
    this.beginRecordingAfterCountIn();
    const key = JSON.stringify([deviceId, channel & 0x0f, note & 0x7f]);
    const p = this.midiPending.get(key);
    if (!p) return;
    this.midiPending.delete(key);
    this.commitNote(deviceId, p, this.liveTick());
  }

  /** Song position (ticks) the performer heard at this moment (output latency removed). */
  private liveTick(): number {
    const ctx = this.host.ctx as AudioContext & { outputLatency?: number };
    const t = ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
    return Math.round(this.host.positionAtTime(t) * TICKS_PER_16TH);
  }

  private commitNote(deviceId: string, p: Pending, endTick: number): void {
    const q = this.settings.midiQuantize > 0 ? this.settings.midiQuantize * TICKS_PER_16TH : 0;
    let start = p.tick;
    if (q) start = Math.round(start / q) * q;
    const lenTicks = Math.max(TICKS_PER_16TH / 4, endTick >= p.tick ? endTick - p.tick : TICKS_PER_16TH);
    const recordKey = JSON.stringify([deviceId, p.patternId]);
    const rec = this.midiNotes.get(recordKey) ?? {
      deviceId,
      patternId: p.patternId,
      notes: [],
      startTick: Math.round(this.startPos * TICKS_PER_16TH),
    };
    rec.notes.push({ step: start / TICKS_PER_16TH, note: p.note, velocity: Math.max(0.05, Math.min(1, p.vel)), length: lenTicks / TICKS_PER_16TH });
    this.midiNotes.set(recordKey, rec);
  }

  private finishMidi(endPos: number): void {
    const h = this.host;
    const recordedClips: RecordedMidiClipRef[] = [];
    // notes still held at stop end there
    for (const p of this.midiPending.values()) this.commitNote(p.deviceId, p, endPos * TICKS_PER_16TH);
    this.midiPending.clear();
    const spb = h.stepsPerBar;
    for (const rec of this.midiNotes.values()) {
      const track = h.tracks.find((t) => t.deviceId === rec.deviceId);
      if (!track || !rec.notes.length) continue;
      if (this.recordingPlaybackMode === 'pattern_loop') {
        this.writePattern(track, rec.notes, rec.patternId);
        continue;
      }
      const loop = h.loopEnabled ? h.getLoopRange() : null;
      const first = Math.min(...rec.notes.map((n) => n.step));
      const last = Math.max(...rec.notes.map((n) => n.step + n.length));
      const startBar = loop && first >= loop.start * spb && last <= loop.end * spb + spb ? loop.start : Math.floor(Math.min(this.startPos, first) / spb);
      const endBar = loop && startBar === loop.start ? loop.end : Math.ceil(Math.max(last, endPos) / spb);
      const clips = (track.arrangementClips ??= []);
      const startTick = barToTick(startBar, spb);
      // Overdub merges into a note clip that starts here; replace / takes make a new clip.
      const existing = this.settings.mode === 'overdub' ? clips.find((c) => c.kind === 'notes' && Math.abs(c.startBar - startBar) < 1e-6) : undefined;
      const local = rec.notes.map((n) => ({ ...n, step: Math.max(0, n.step - startTick / TICKS_PER_16TH) }));
      if (existing) {
        existing.notes = [...(existing.notes ?? []), ...local];
        existing.lengthBars = Math.max(existing.lengthBars, endBar - startBar);
        recordedClips.push({ trackId: track.id, clipId: existing.id });
      } else {
        if (this.settings.mode === 'replace') track.arrangementClips = clips.filter((c) => c.startBar + c.lengthBars <= startBar || c.startBar >= endBar);
        const clipId = newSeqId('clip');
        track.arrangementClips!.push({
          id: clipId,
          kind: 'notes',
          startBar,
          lengthBars: Math.max(1 / spb, endBar - startBar),
          notes: local,
          name: `${track.name} rec ${this.takeCounter}`,
          color: track.color,
        });
        recordedClips.push({ trackId: track.id, clipId });
      }
    }
    this.midiNotes.clear();
    this.patternTargets.clear();
    recordedClips.forEach((clip) => this.midiClipListeners.forEach((listener) => listener(clip)));
  }

  /** Pattern mode: notes go into the active pattern at their step (wrapping), with real lengths. */
  private writePattern(track: SequencerTrack, notes: ClipNote[], patternId: string | null): void {
    const active = syncTrackPatterns(track, this.host.activePatternIndex);
    const p = patternId ? track.patternList?.find((pattern) => pattern.id === patternId) ?? active : active;
    const stepTicks = divisionTicks(p.division);
    const len = Math.max(1, p.length);
    if (this.settings.mode === 'replace') p.steps.fill(null);
    for (const n of notes) {
      const idx = ((Math.round((n.step * TICKS_PER_16TH) / stepTicks) % len) + len) % len;
      const length = Math.max(1, Math.round((n.length * TICKS_PER_16TH) / stepTicks));
      const ex = p.steps[idx];
      if (ex && ex.note !== n.note) {
        ex.chordNotes = Array.from(new Set([...(ex.chordNotes ?? []), n.note]));
        ex.chordLengths = undefined;
      } else p.steps[idx] = { note: n.note, velocity: n.velocity, length };
    }
  }

  /* ------------------------------------------------------------ master */

  /** Starts / stops capturing the master output onto a new audio track (muted, so it doesn't double). */
  async toggleMasterRecording(): Promise<boolean> {
    const h = this.host;
    if (this.masterJob) {
      const job = this.masterJob;
      this.masterJob = null;
      const data = await job.capture.stop();
      const len = data.channels[0]?.length ?? 0;
      if (len > h.ctx.sampleRate * 0.05) {
        const sr = h.ctx.sampleRate;
        const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
        data.channels.forEach((ch, c) => buf.getChannelData(c).set(ch));
        const a = audioStore.add('Master recording', buf);
        const spb = h.stepsPerBar;
        const startPos = Math.max(0, Math.round(h.positionAtTime(data.frame / sr)));
        job.track.arrangementClips = [
          { id: newSeqId('clip'), kind: 'audio', startBar: startPos / spb, lengthBars: Math.max(1, Math.round(buf.duration / (60 / h.bpm / 4))) / spb, audioId: a.id, audioOffset: 0, name: 'Master recording', color: job.track.color },
        ];
        h.commitEdit();
      }
      h.changed();
      return false;
    }
    if (!(await ensureRecorderWorklet(h.ctx))) return false;
    const track = h.createAudioTrack('Master recording');
    track.mute = true;
    const capture = new WorkletCapture(h.ctx, h.masterTap, 2);
    await capture.start();
    this.masterJob = { capture, track };
    h.changed();
    return true;
  }

  get recordingMaster(): boolean {
    return !!this.masterJob;
  }
}
