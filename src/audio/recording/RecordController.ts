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
import { userRecordingProvenance } from '../../../shared/audio/provenance.ts';
import { InputManager } from './InputManager.ts';
import { WorkletCapture, ensureRecorderWorklet } from './recorderWorklet.ts';
import { ActiveRecordingJournal, type RecordingJournalTrack } from './recordingJournal.ts';
import { toast } from '../../shell/toast.ts';
import type { ProjectTimeMap } from '../time/ProjectTimeMap.ts';

export type RecordMode = 'overdub' | 'replace' | 'takes';
/**
 * `finalizing` deliberately remains observable until every captured worklet buffer has been
 * placed into the project.  Project changes must not treat a stopped transport as a finished
 * take: the final capture message arrives asynchronously from the audio render thread.
 */
export type RecorderPhase = 'idle' | 'arming' | 'count-in' | 'recording' | 'finalizing';

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
  updateTrackChannelStrip?(trackId: string): void;
  /** Optional project identity supplied by ProjectManager for a durable recording journal. */
  recordingJournalInfo?(): { projectId: string | null; projectName: string };
  /** Request Web MIDI access from the Record gesture for armed instrument tracks. */
  enableMidiInput(): Promise<boolean>;
  /** The instrument track Record arms when nothing is armed (the selected part). */
  recordTarget?(): SequencerTrack | undefined;
  commitEdit(): void;
  changed(): void;
}

interface AudioJob {
  track: SequencerTrack;
  capture: WorkletCapture;
  /** Frozen at arm time so normal placement and crash recovery use the same capture edge. */
  latencyCompensationFrames: number;
}

interface Pending {
  deviceId: string;
  trackId: string;
  sequence: number;
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
  state: RecorderPhase = 'idle';
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
  private masterJob: {
    capture: WorkletCapture;
    track: SequencerTrack;
    journal: ActiveRecordingJournal | null;
    startPos: number;
    stepsPerBar: number;
    secondsPer16th: number;
  } | null = null;
  private masterStarting = false;
  private masterFinalizing = false;
  private startToken = 0;
  private startPromise: Promise<boolean> | null = null;
  private stopPromise: Promise<void> | null = null;
  private takeCounter = 0;
  /** Present only while armed audio is writing a durable best-effort crash journal. */
  private journal: ActiveRecordingJournal | null = null;
  private midiJournal: ActiveRecordingJournal | null = null;
  private midiJournalSequence = 0;
  private midiCheckpointTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * True for every period in which a project save/rebuild could omit or detach a take.  This is
   * intentionally broader than `host.isRecording`: it covers microphone/worklet preparation,
   * final audio placement and master-capture finalization too.
   */
  get busy(): boolean {
    return this.state !== 'idle' || this.masterStarting || this.masterFinalizing || !!this.masterJob;
  }

  get isFinalizing(): boolean {
    return this.state === 'finalizing' || this.masterFinalizing;
  }

  /** Start a journal before worklet capture so the first audio block is eligible for recovery. */
  private async startAudioJournal(tracks: SequencerTrack[], startPos: number): Promise<void> {
    this.journal = await this.openTakeJournal(tracks.map((track) => {
      const physical = !this.hasCables(this.host.devices.get(track.deviceId));
      return {
        trackId: track.id,
        name: track.name,
        physical,
        // Preserve a signed compensation so recovery applies the same edge as normal placement.
        latencyCompensationFrames: physical ? Math.round(this.roundTripLatency * this.host.ctx.sampleRate) : 0,
      };
    }), startPos);
  }

  private async openTakeJournal(tracks: RecordingJournalTrack[], startPos: number, midiMode?: PlaybackMode): Promise<ActiveRecordingJournal | null> {
    const h = this.host;
    const context = h.recordingJournalInfo?.() ?? { projectId: null, projectName: 'Untitled' };
    const journal = new ActiveRecordingJournal({
      projectId: context.projectId,
      projectName: context.projectName,
      sampleRate: h.ctx.sampleRate,
      startPos,
      bpm: h.bpm,
      stepsPerBar: h.stepsPerBar,
      tracks,
      midiMode,
    });
    try {
      await journal.start();
      return journal;
    } catch (error) {
      // Recording itself remains usable if IndexedDB is unavailable, but the status must not
      // pretend an active take has crash recovery in that browser/profile.
      this.message = `Active-take recovery is unavailable: ${(error as Error).message}`;
      return null;
    }
  }

  private async discardAudioJournal(): Promise<void> {
    const journal = this.journal;
    this.journal = null;
    if (!journal) return;
    try { await journal.discard(); } catch { /* a cancelled arm must not get stuck on storage */ }
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
    if (this.state === 'idle') {
      await this.start();
      return;
    }
    if (this.state === 'count-in' || this.state === 'recording' || this.state === 'arming') {
      await this.stop();
      return;
    }
    this.message = 'Finishing the current take…';
    this.host.changed();
  }

  async start(): Promise<boolean> {
    if (this.state !== 'idle') {
      this.message = this.state === 'finalizing' ? 'Finishing the current take…' : 'Recording is already being prepared or is active.';
      this.host.changed();
      return false;
    }
    const token = ++this.startToken;
    const task = this.startInner(token);
    this.startPromise = task;
    try {
      return await task;
    } finally {
      if (this.startPromise === task) this.startPromise = null;
    }
  }

  private isCurrentStart(token: number): boolean {
    return this.startToken === token && this.state === 'arming';
  }

  /** Disposes captures created while an asynchronous arm was cancelled before transport began. */
  private async discardArmingJobs(): Promise<void> {
    const jobs = this.jobs.splice(0);
    await Promise.all(jobs.map(async (job) => {
      try { await job.capture.stop(); } catch { /* A failed worklet cannot hold a project transition. */ }
    }));
    await this.discardAudioJournal();
    const midiJournal = this.midiJournal;
    this.midiJournal = null;
    await midiJournal?.discard().catch(() => {});
  }

  private async startInner(token: number): Promise<boolean> {
    const h = this.host;
    let started = false;
    this.message = null;
    this.state = 'arming';
    h.changed();
    const audio = this.armedAudio();
    let midi = this.armedMidi();
    const spb = h.stepsPerBar;
    const s = this.settings;
    try {
      if (!audio.length && !midi.length) {
        // Like a workstation: with nothing armed, the selected part records (and stays armed, so it shows).
        const target = h.recordTarget?.();
        if (!target) {
          this.message = 'Arm a track first (● REC on an audio or instrument track).';
          return false;
        }
        target.armed = true;
        midi = [target];
        this.message = `Recording ${target.name}: the selected part, armed for you.`;
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
        // The first worklet acknowledgement needs a running context. Resume during the
        // Record gesture, before input permission or storage can delay preparation.
        if (h.ctx.state === 'suspended') await h.ctx.resume();
        if (!this.isCurrentStart(token)) return false;
        const plannedStartPos = h.isPlaying
          ? (s.punch ? Math.max(Math.ceil(h.getPlayheadPosition()), Math.round(s.punchInBar * spb)) : Math.ceil(h.getPlayheadPosition()))
          : (s.punch ? Math.round(s.punchInBar * spb) : h.songPosition);
        if (!(await ensureRecorderWorklet(h.ctx)) || !this.isCurrentStart(token)) {
          if (this.isCurrentStart(token)) this.message = 'This browser cannot record (AudioWorklet unavailable).';
          return false;
        }
        await this.syncInputs();
        if (!this.isCurrentStart(token)) return false;
        if (audio.some((t) => !this.hasCables(h.devices.get(t.deviceId))) && !this.input.isOpen) return false;
        // This begins only after physical input setup has supplied its latency measurement, but
        // still before a recorder worklet can receive a sample.
        await this.startAudioJournal(audio, plannedStartPos);
        if (!this.isCurrentStart(token)) return false;
      }
      if (!this.isCurrentStart(token)) return false;
      if (midi.length && h.recordingJournalInfo?.().projectId) {
        const targets = midi.map((track) => ({ trackId: track.id, name: track.name, physical: false }));
        this.midiJournal = await this.openTakeJournal(targets, h.getPlayheadPosition(), this.recordingPlaybackMode);
        if (!this.isCurrentStart(token)) return false;
      }
      this.takeCounter++;
      this.jobs = audio.map((track) => {
        const dev = h.devices.get(track.deviceId) as AudioTrackDevice;
        const physical = !this.hasCables(dev);
        return {
          track,
          capture: new WorkletCapture(h.ctx, dev.recordTap, 2, {
            onChunk: ({ frame, channels }) => this.journal?.append(track.id, frame, channels),
          }),
          latencyCompensationFrames: physical ? Math.round(this.roundTripLatency * h.ctx.sampleRate) : 0,
        };
      });
      // Wait for each worklet's own render-thread acknowledgement before a
      // count-in, punch edge, or physical note can be scheduled against it.
      await Promise.all(this.jobs.map((j) => j.capture.start()));
      if (!this.isCurrentStart(token)) {
        await this.discardArmingJobs();
        return false;
      }
      this.midiPending.clear();
      this.midiNotes.clear();
      this.midiJournalSequence = 0;

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
        if (this.startToken !== token || (this.state !== 'arming' && this.state !== 'count-in')) return false;
        this.startTime = h.timeOfSongPosition(this.startPos) ?? t0;
      }
      if (this.state !== 'count-in') this.state = 'recording';
      this.journal?.updateStart(this.startPos, Math.round(this.startTime * h.ctx.sampleRate));
      this.midiJournal?.updateStart(this.startPos, Math.round(this.startTime * h.ctx.sampleRate));
      h.isRecording = true;
      this.scheduleCountInState();
      this.schedulePunchOut();
      h.changed();
      started = true;
      return true;
    } catch (error) {
      if (this.isCurrentStart(token)) this.message = `Could not prepare recording: ${(error as Error).message}`;
      return false;
    } finally {
      if (!started && this.startToken === token && (this.state === 'arming' || this.state === 'count-in')) {
        await this.discardArmingJobs();
        this.state = 'idle';
        h.isRecording = false;
        h.changed();
      }
    }
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
    if (this.stopPromise) return this.stopPromise;
    if (this.state === 'idle') return;
    const task = this.state === 'arming' ? this.cancelArming() : this.finishStop(auto);
    this.stopPromise = task;
    try {
      await task;
    } finally {
      if (this.stopPromise === task) this.stopPromise = null;
    }
  }

  /** Cancel an in-flight AudioWorklet/input preparation without letting it become a live take. */
  private async cancelArming(): Promise<void> {
    const h = this.host;
    this.startToken++;
    this.state = 'finalizing';
    h.isRecording = false;
    h.changed();
    try {
      await this.startPromise;
    } catch {
      // start() reports preparation errors through `message`; cancellation itself stays safe.
    } finally {
      await this.discardArmingJobs();
      this.state = 'idle';
      h.isRecording = false;
      h.changed();
    }
  }

  private async finishStop(auto: boolean): Promise<void> {
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
    this.state = 'finalizing';
    h.isRecording = false;
    h.changed();

    const loop = h.loopEnabled && h.playbackMode === 'song_arrangement' ? h.getLoopRange() : null;
    const jobs = this.jobs;
    this.jobs = [];
    const journal = this.journal;
    const midiJournal = this.midiJournal;
    this.clearMidiCheckpoint();
    for (const p of this.midiPending.values()) this.commitNote(p.deviceId, p, endPos * TICKS_PER_16TH);
    this.midiPending.clear();
    let placedMidiTrackIds: string[] = [];
    try {
      const [results] = await Promise.all([
        Promise.all(jobs.map(async (j) => ({ j, data: await j.capture.stop() }))),
        midiJournal?.finish(endPos),
      ]);
      placedMidiTrackIds = this.finishMidi();
      if (midiJournal) {
        if (placedMidiTrackIds.length) await midiJournal.markMidiCompleted(placedMidiTrackIds);
        else if (!midiJournal.snapshot.hasMidiNotes) await midiJournal.discard();
      }
      await journal?.finish(endPos, Math.round(endTime * h.ctx.sampleRate));
      const placedAudioIds: string[] = [];
      for (const { j, data } of results) placedAudioIds.push(...await this.placeAudio(j, data, endTime, loop));

      if (auto && s.postRollBars > 0) {
        const stopAt = endTime + s.postRollBars * spb * (60 / h.bpm / 4);
        this.scheduleTransportStop(stopAt);
      }
      h.commitEdit();
      // Keep a completed journal until ProjectManager has made the containing project durable.
      // If the app dies in that tiny gap, startup can still recover the captured audio.
      await journal?.markCompleted(placedAudioIds);
    } catch (error) {
      if (placedMidiTrackIds.length) h.commitEdit();
      this.message = `Could not finish recording: ${(error as Error).message}`;
      toast(this.message, 'error');
      // Avoid leaving in-memory MIDI state attached to a later unrelated take after an error.
      this.midiPending.clear();
      this.midiNotes.clear();
      this.patternTargets.clear();
    } finally {
      this.journal = null;
      this.midiJournal = null;
      this.state = 'idle';
      h.isRecording = false;
      h.changed();
    }
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

  private async placeAudio(j: AudioJob, data: { frame: number; channels: Float32Array[] }, endTime: number, loop: { start: number; end: number } | null): Promise<string[]> {
    const h = this.host;
    const sr = h.ctx.sampleRate;
    const spb = h.stepsPerBar;
    const comp = j.latencyCompensationFrames / sr;
    const len = data.channels[0]?.length ?? 0;
    if (!len) return [];
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
      // Micro-fade take boundaries to eliminate punch-in/out and loop transition clicks
      const fadeSamples = Math.min(Math.round(sr * 0.003), Math.floor(n / 4));
      if (fadeSamples > 0) {
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const out = buf.getChannelData(c);
          for (let k = 0; k < fadeSamples; k++) {
            const fi = 0.5 * (1 - Math.cos((Math.PI * k) / fadeSamples));
            out[k] *= fi;
            out[n - 1 - k] *= fi;
          }
        }
      }
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
    const push = async (t0: number, t1: number, padStart: number) => {
        const b = slice(t0 - padStart, t1);
        if (!b) return;
        if (padStart > 0) {
          const pad = Math.round(padStart * sr);
          for (let c = 0; c < b.numberOfChannels; c++) b.getChannelData(c).fill(0, 0, Math.min(pad, b.length));
        }
        const a = audioStore.add(`${name}.${takes.length + 1}`, b, {
          provenance: userRecordingProvenance(`Input take on ${j.track.name}`),
        });
        if (!(await audioStore.ensurePersisted(a.id))) throw new Error('Recorded take could not be persisted.');
        takes.push({ id: newSeqId('take'), audioId: a.id, name: `Take ${takes.length + 1}` });
      };
      await push(this.startTime, Math.min(firstEnd, endTime), padFirstSec);
      for (let t = firstEnd; t < endTime - 0.05; t += passSec) await push(t, Math.min(t + passSec, endTime), 0);
      if (!takes.length) return [];
      this.addClip(j.track, {
        startBar: loopStart / spb,
        lengthBars: (loopEnd - loopStart) / spb,
        audioId: takes[takes.length - 1].audioId,
        takes,
        name,
      });
      return takes.map((take) => take.audioId);
    }
    const buf = slice(this.startTime, endTime);
    if (!buf) return [];
    const a = audioStore.add(name, buf, { provenance: userRecordingProvenance(`Input take on ${j.track.name}`) });
    if (!(await audioStore.ensurePersisted(a.id))) throw new Error('Recorded take could not be persisted.');
    const lengthPos = Math.max(1, Math.round(buf.duration / posSec));
    this.addClip(j.track, { startBar: this.startPos / spb, lengthBars: lengthPos / spb, audioId: a.id, name });
    return [a.id];
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
    const pending = { deviceId, trackId: track.id, sequence: this.midiJournalSequence++, note, vel, tick, patternId };
    this.midiPending.set(key, pending);
    this.checkpointMidiNote(pending, this.midiClipNote(pending, tick));
    this.scheduleMidiCheckpoint();
  }

  noteOff(deviceId: string, note: number, channel = 0): void {
    this.beginRecordingAfterCountIn();
    const key = JSON.stringify([deviceId, channel & 0x0f, note & 0x7f]);
    const p = this.midiPending.get(key);
    if (!p) return;
    this.midiPending.delete(key);
    this.commitNote(deviceId, p, this.liveTick());
    if (!this.midiPending.size) this.clearMidiCheckpoint();
  }

  /** Song position (ticks) the performer heard at this moment (output latency removed). */
  private liveTick(): number {
    const ctx = this.host.ctx as AudioContext & { outputLatency?: number };
    const t = ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
    return Math.round(this.host.positionAtTime(t) * TICKS_PER_16TH);
  }

  private midiClipNote(p: Pending, endTick: number): ClipNote {
    const q = this.settings.midiQuantize > 0 ? this.settings.midiQuantize * TICKS_PER_16TH : 0;
    let start = p.tick;
    if (q) start = Math.round(start / q) * q;
    const lenTicks = Math.max(TICKS_PER_16TH / 4, endTick >= p.tick ? endTick - p.tick : TICKS_PER_16TH);
    return { step: start / TICKS_PER_16TH, note: p.note, velocity: Math.max(0.05, Math.min(1, p.vel)), length: lenTicks / TICKS_PER_16TH };
  }

  private checkpointMidiNote(p: Pending, note: ClipNote): void {
    this.midiJournal?.checkpointMidi(p.sequence, p.trackId, p.patternId, note);
  }

  private clearMidiCheckpoint(): void {
    if (this.midiCheckpointTimer !== null) clearTimeout(this.midiCheckpointTimer);
    this.midiCheckpointTimer = null;
  }

  private scheduleMidiCheckpoint(): void {
    if (!this.midiJournal || this.midiCheckpointTimer !== null || !this.midiPending.size) return;
    // The timeout only schedules storage. Note timing comes from the AudioContext clock.
    this.midiCheckpointTimer = setTimeout(() => {
      this.midiCheckpointTimer = null;
      if (this.state !== 'recording') return;
      const tick = this.liveTick();
      for (const note of this.midiPending.values()) this.checkpointMidiNote(note, this.midiClipNote(note, tick));
      this.scheduleMidiCheckpoint();
    }, 200);
  }

  private commitNote(deviceId: string, p: Pending, endTick: number): void {
    const recordKey = JSON.stringify([deviceId, p.patternId]);
    const rec = this.midiNotes.get(recordKey) ?? {
      deviceId,
      patternId: p.patternId,
      notes: [],
      startTick: Math.round(this.startPos * TICKS_PER_16TH),
    };
    const note = this.midiClipNote(p, endTick);
    rec.notes.push(note);
    this.checkpointMidiNote(p, note);
    this.midiNotes.set(recordKey, rec);
  }

  private finishMidi(endPos = this.host.getPlayheadPosition()): string[] {
    const h = this.host;
    const recordedClips: RecordedMidiClipRef[] = [];
    const targetIds = new Set<string>();
    const spb = h.stepsPerBar;
    for (const rec of this.midiNotes.values()) {
      const track = h.tracks.find((t) => t.deviceId === rec.deviceId);
      if (!track || !rec.notes.length) continue;
      targetIds.add(track.id);
      if (this.midiJournal) {
        const receipts = (track.midiTakeIds ??= []);
        if (!receipts.includes(this.midiJournal.sessionId)) receipts.push(this.midiJournal.sessionId);
      }
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
    return [...targetIds];
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
    if (this.masterStarting || this.masterFinalizing) {
      this.message = 'Finishing or preparing the master capture…';
      h.changed();
      return false;
    }
    if (this.masterJob) {
      const job = this.masterJob;
      this.masterJob = null;
      this.masterFinalizing = true;
      h.changed();
      try {
        const data = await job.capture.stop();
        const len = data.channels[0]?.length ?? 0;
        const sampleRate = h.ctx.sampleRate;
        if (len < sampleRate * 0.05) {
          await job.journal?.discard();
          return false;
        }
        const lengthPos = len / sampleRate / job.secondsPer16th;
        await job.journal?.finish(job.startPos + lengthPos, data.frame + len);
        const buffer = h.ctx.createBuffer(data.channels.length, len, sampleRate);
        data.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel));
        const asset = audioStore.add('Master recording', buffer, {
          provenance: userRecordingProvenance('Master capture in Unbox Studio'),
        });
        if (!(await audioStore.ensurePersisted(asset.id))) throw new Error('Master capture could not be persisted.');
        job.track.arrangementClips = [{
          id: newSeqId('clip'), kind: 'audio', startBar: job.startPos / job.stepsPerBar,
          lengthBars: Math.max(1, Math.ceil(lengthPos)) / job.stepsPerBar,
          audioId: asset.id, audioOffset: 0, name: 'Master recording', color: job.track.color,
        }];
        h.commitEdit();
        await job.journal?.markCompleted([asset.id]);
        return false;
      } catch (error) {
        this.message = `Could not finish master capture: ${(error as Error).message}`;
        toast(this.message, 'error');
        return false;
      } finally {
        this.masterFinalizing = false;
        h.changed();
      }
    }
    this.masterStarting = true;
    this.message = null;
    h.changed();
    let journal: ActiveRecordingJournal | null = null;
    try {
      if (h.ctx.state === 'suspended') await h.ctx.resume();
      if (!(await ensureRecorderWorklet(h.ctx))) throw new Error('AudioWorklet is unavailable.');
      const track = h.createAudioTrack('Master recording');
      track.mute = true;
      h.updateTrackChannelStrip?.(track.id);
      journal = await this.openTakeJournal([
        { trackId: track.id, name: track.name, physical: false, muteOnRecovery: true },
      ], h.getPlayheadPosition());
      const capture = new WorkletCapture(h.ctx, h.masterTap, 2, {
        onChunk: ({ frame, channels }) => journal?.append(track.id, frame, channels),
      });
      const startFrame = await capture.start();
      const startPos = Math.max(0, Math.round(h.positionAtTime(startFrame / h.ctx.sampleRate)));
      journal?.updateStart(startPos, startFrame);
      const stepsPerBar = journal?.snapshot.stepsPerBar ?? h.stepsPerBar;
      const secondsPer16th = 60 / (journal?.snapshot.bpm ?? h.bpm) / 4;
      this.masterJob = { capture, track, journal, startPos, stepsPerBar, secondsPer16th };
      return true;
    } catch (error) {
      await journal?.discard().catch(() => {});
      this.message = `Could not prepare master capture: ${(error as Error).message}`;
      toast(this.message, 'error');
      return false;
    } finally {
      this.masterStarting = false;
      h.changed();
    }
  }

  get recordingMaster(): boolean {
    return !!this.masterJob;
  }
}
