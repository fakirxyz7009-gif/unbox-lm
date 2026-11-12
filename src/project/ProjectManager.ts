/**
 * Projects inside the app (IndexedDB): new / open / save / save as, autosave, version history,
 * user templates, notes and metadata, `.unbox` archives (project + all its audio) and missing
 * media detection / relinking. `projectManager` is the singleton the UI uses.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import { deleteRecordingJournal, discardCompletedRecordingJournals, listRecordingJournals, loadRecordingJournal, type RecordingJournalChunk, type RecordingJournalManifest } from '../audio/recording/recordingJournal.ts';
import { newSeqId } from '../audio/sequencer/model.ts';
import { encodeWav, safeFileName } from '../audio/export/wav.ts';
import { toast } from '../shell/toast.ts';
import { showConfirm } from '../shell/dialogService.ts';
import { dbAll, dbByIndex, dbDelete, dbGet, dbPut, requestPersistence } from './db.ts';
import { parseImportableProject } from './projectFormat.ts';
import { GENRE_TEMPLATES, applyTemplate } from './templates.ts';
import { readZip, writeZip } from './zip.ts';
import { projectAudioIds } from '../../shared/project/audioAssets.ts';
import { parseAudioProvenance, userFileProvenance, userRecordingProvenance, type AudioProvenance } from '../../shared/audio/provenance.ts';

export interface ProjectMeta {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  isrc: string;
  upc: string;
  comment: string;
  tags: string[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  json: string;
  audioIds: string[];
  bpm: number;
  key: string;
  tracks: number;
  bars: number;
  color: string;
  /** Saved as a user template (listed under New). */
  template?: boolean;
}

export interface VersionRecord {
  id: string;
  projectId: string;
  label: string;
  createdAt: number;
  json: string;
  auto: boolean;
}

/** Unsaved state kept in IndexedDB so a crash or a closed tab does not lose the session. */
export interface RecoveryRecord {
  json: string;
  at: number;
  name: string;
  projectId: string | null;
}

export const EMPTY_META: ProjectMeta = { title: '', artist: '', album: '', genre: '', year: '', isrc: '', upc: '', comment: '', tags: [] };
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const COLORS = ['#f97316', '#22d3ee', '#a78bfa', '#f43f5e', '#84cc16', '#eab308', '#38bdf8'];
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const AUTO_VERSIONS_KEPT = 20;
const RECOVERY_DEBOUNCE_MS = 250;

interface ArchiveAudioInfo {
  id: string;
  name: string;
  sourceBpm?: number;
  detectedBpm?: number;
  key?: string;
  provenance?: AudioProvenance;
}

/** Reads only the portable project-audio fields from archive metadata. */
function archiveAudioInfo(value: unknown): ArchiveAudioInfo | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ArchiveAudioInfo>;
  if (typeof input.id !== 'string' || !input.id || typeof input.name !== 'string') return null;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  const key = typeof input.key === 'string' && input.key.length <= 64 ? input.key : undefined;
  const provenance = parseAudioProvenance(input.provenance);
  return {
    id: input.id,
    name: input.name.slice(0, 256),
    ...(finite(input.sourceBpm) !== undefined ? { sourceBpm: finite(input.sourceBpm) } : {}),
    ...(finite(input.detectedBpm) !== undefined ? { detectedBpm: finite(input.detectedBpm) } : {}),
    ...(key ? { key } : {}),
    ...(provenance ? { provenance } : {}),
  };
}

class ProjectManager {
  currentId: string | null = null;
  currentName = 'Untitled';
  meta: ProjectMeta = { ...EMPTY_META };
  notes = '';
  autosave = true;
  /** Seconds between automatic saves while something changed. */
  autosaveSec = 5;
  /** Minutes between automatic history versions. */
  versionMin = 10;
  missing: string[] = [];
  lastSavedAt = 0;
  status = '';
  /** No project exists yet: the shell shows the first-run chooser instead of silently saving a demo. */
  needsWelcome = false;
  /** Unsaved work recovered from IndexedDB after a crash / closed tab. */
  recovery: RecoveryRecord | null = null;
  /** Durable worklet chunks from an audio take that did not get a confirmed project save. */
  recordingJournals: RecordingJournalManifest[] = [];
  private lastSavedJson = '';
  /** Cheap UI marker: any structural engine notification means the saved copy is behind. */
  private dirtyMarker = false;
  private lastVersionAt = 0;
  private lastRecoveryJson = '';
  private timer: number | null = null;
  private recoveryTimer: number | null = null;
  private listeners = new Set<() => void>();
  /** Writes queued or running; autosave waits for them instead of stacking another. */
  private pendingWrites = 0;
  /** Writes run one at a time (see enqueue), so an older autosave never lands after a newer save. */
  private queue: Promise<unknown> = Promise.resolve();
  /** The open project loaded with parts missing: saving over it would destroy them. */
  private protectedId: string | null = null;
  private autosaveFailing = false;
  private recoveryFailing = false;
  private flushListening = false;
  /** Prevent a double-click or overlapping banner action from placing a journal twice. */
  private journalOperations = new Set<string>();

  constructor() {
    audioEngine.setRecordingJournalInfoSource(() => ({ projectId: this.currentId, projectName: this.currentName }));
    audioEngine.registerProjectSection('project', {
      save: () => ({ meta: this.meta, notes: this.notes }),
      load: (data) => {
        const d = (data ?? {}) as { meta?: Partial<ProjectMeta>; notes?: string };
        this.meta = { ...EMPTY_META, ...(d.meta ?? {}), tags: Array.isArray(d.meta?.tags) ? d.meta!.tags : [] };
        this.notes = typeof d.notes === 'string' ? d.notes : '';
      },
    });
    // AudioEngine notifications are structural (not animation or meter frames), so this
    // captures an edit promptly without putting persistent I/O in a real-time path.
    audioEngine.subscribe(() => {
      this.dirtyMarker = true;
      this.scheduleRecovery();
    });
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(status?: string): void {
    if (status !== undefined) this.status = status;
    this.listeners.forEach((cb) => cb());
  }

  /**
   * Worklet capture completes asynchronously after Stop. A project snapshot, graph rebuild or
   * deletion during that interval can omit the take which is about to be placed, so persistence
   * and project-transition entry points fail closed until the recorder becomes idle.
   */
  private ensureRecorderIdle(action: string, quiet = false): boolean {
    if (!audioEngine.recorder.busy) return true;
    if (!quiet) {
      const phase = audioEngine.recorder.isFinalizing ? 'the current take to finish' : 'recording to stop';
      const message = `Wait for ${phase} before ${action}.`;
      this.emit(message);
      toast(message, 'info');
    }
    return false;
  }

  get dirty(): boolean {
    return audioEngine.exportProjectJSON() !== this.lastSavedJson;
  }

  /** For the title-bar indicator; does not serialize the project on every render. */
  get hasUnsavedChanges(): boolean {
    return this.dirtyMarker;
  }

  /** Opens the last project (or creates a new one) and starts autosave. */
  async init(): Promise<void> {
    void requestPersistence();
    try {
      const last = await dbGet<{ key: string; value: string }>('settings', 'lastProjectId');
      const previous = last?.value ? await dbGet<ProjectRecord>('projects', last.value) : undefined;
      const allProjects = await dbAll<ProjectRecord>('projects');
      const recent = allProjects.filter((p) => !p.template).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      // Never create a project here: first run must choose a start, and an older session opens its most recent record.
      if (!previous || !(await this.open(previous.id))) {
        if (!recent || !(await this.open(recent.id))) {
          this.needsWelcome = true;
          this.emit();
        }
      }
      await this.checkRecovery();
      await this.refreshRecordingJournals();
    } catch (e) {
      this.emit(`Projects unavailable: ${(e as Error).message}`);
    }
    this.startAutosave();
  }

  /** Close the first-run chooser without creating anything (the user chose to open a project instead). */
  dismissWelcome(): void {
    if (!this.needsWelcome) return;
    this.needsWelcome = false;
    // "Open existing" can leave no project open. Replace the boot demo with a real empty
    // workspace so the Workstation does not show phantom tracks that were never saved.
    if (!this.currentId) {
      audioEngine.newProject(true);
      this.dirtyMarker = false;
    }
    this.emit();
  }

  /**
   * Autosave: one tick per `autosaveSec` writes the project when it changed, and unsaved state goes
   * to a recovery slot first. Hiding the tab or closing it flushes.
   */
  startAutosave(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.autosaveTick(), Math.max(2, Math.min(60, this.autosaveSec)) * 1000);
    // The page listeners are installed once: the autosave setting restarts the timer on every change.
    if (this.flushListening) return;
    this.flushListening = true;
    const flush = () => {
      if (this.needsWelcome || !this.currentId || !this.autosave || !this.dirty || audioEngine.recorder.busy) return;
      const json = audioEngine.exportProjectJSON();
      void this.writeRecovery(json);
      void this.save();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  private async autosaveTick(): Promise<void> {
    // The first-run chooser is not a project: never write a recovery copy of the demo session.
    if (this.needsWelcome || !this.currentId || !this.autosave || this.pendingWrites > 0 || audioEngine.recorder.busy) return;
    const json = audioEngine.exportProjectJSON();
    // Nothing changed since the last save: drop any stale recovery copy.
    if (json === this.lastSavedJson) {
      const persistedRecoveryIsCurrentSave = this.recovery?.projectId === this.currentId && this.recovery.json === json;
      const sessionRecoveryIsStale = !this.recovery && !!this.lastRecoveryJson;
      if (persistedRecoveryIsCurrentSave || sessionRecoveryIsStale) await this.clearRecovery();
      return;
    }
    await this.writeRecovery(json);
    if (!this.currentId || audioEngine.recorder.busy) return;
    await this.write(json, Date.now() - this.lastVersionAt > this.versionMin * 60000 ? 'Autosave' : undefined, true);
  }

  /**
   * Keep a crash-recovery copy shortly after an edit, rather than waiting for the
   * full project autosave interval. This never saves the project record itself:
   * the normal autosave policy and version cadence remain unchanged.
   */
  private scheduleRecovery(): void {
    if (!this.autosave || !this.currentId || this.recoveryTimer !== null || audioEngine.recorder.busy) return;
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null;
      // Let an already-queued save finish first. Otherwise a recovery write queued
      // after it could reintroduce a stale banner for content that was just saved.
      if (this.pendingWrites > 0) {
        this.scheduleRecovery();
        return;
      }
      if (!this.autosave || !this.currentId || !this.dirty || audioEngine.recorder.busy) return;
      void this.writeRecovery(audioEngine.exportProjectJSON());
    }, RECOVERY_DEBOUNCE_MS);
  }

  /** Storage writes run one after another, so an older autosave can never land after a newer one. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private writeRecovery(json: string): Promise<void> {
    return this.enqueue(async () => {
      if (audioEngine.recorder.busy) return;
      if (json === this.lastRecoveryJson) return;
      this.lastRecoveryJson = json;
      try {
        await dbPut('settings', {
          key: 'recovery',
          value: JSON.stringify({ json, at: Date.now(), name: this.currentName, projectId: this.currentId } satisfies RecoveryRecord),
        });
        this.recoveryFailing = false;
      } catch (e) {
        // Retried on the next tick. Only the first failure of a streak toasts, so a full quota is not silent.
        this.lastRecoveryJson = '';
        if (!this.recoveryFailing) {
          this.recoveryFailing = true;
          toast(`Recovery copy could not be written (${(e as Error).message}). Unsaved changes are not protected against a crash.`, 'error');
        }
      }
    });
  }

  private clearRecovery(): Promise<void> {
    return this.enqueue(async () => {
      this.lastRecoveryJson = '';
      this.recovery = null;
      try {
        await dbDelete('settings', 'recovery');
      } catch {
        // ignore
      }
    });
  }

  private async keepRecovery(rec: RecoveryRecord): Promise<void> {
    this.recovery = rec;
    try {
      await dbPut('settings', { key: 'recovery', value: JSON.stringify(rec) });
    } catch {
      // Keep the in-memory recovery banner when IndexedDB is unavailable.
    }
  }

  private async checkRecovery(): Promise<void> {
    try {
      const row = await dbGet<{ key: string; value: string }>('settings', 'recovery');
      if (!row?.value) return;
      const rec = JSON.parse(row.value) as RecoveryRecord;
      if (typeof rec?.json !== 'string' || !rec.json || typeof rec.at !== 'number') return;
      if ((rec.projectId === this.currentId && rec.json === this.lastSavedJson) ||
          Date.now() - rec.at > 7 * 24 * 60 * 60 * 1000) {
        await this.clearRecovery();
        return;
      }
      this.recovery = rec;
      this.emit('Recovered unsaved work from your last session');
    } catch {
      // unreadable recovery data is ignored
    }
  }

  /** Replaces the open project with the recovered unsaved state and saves it. */
  async restoreRecovery(): Promise<boolean> {
    if (!this.ensureRecorderIdle('restoring recovery')) return false;
    const rec = this.recovery;
    if (!rec) return false;
    const target = typeof rec.projectId === 'string' && rec.projectId
      ? await dbGet<ProjectRecord>('projects', rec.projectId)
      : undefined;
    this.missing = await audioStore.ensure(projectAudioIds(rec.json));
    if (!this.ensureRecorderIdle('restoring recovery')) return false;
    let loaded = false;
    try {
      loaded = this.loadJson(rec.json);
    } catch {
      // loadJson has put the session back the way it was
    }
    if (!loaded) {
      this.emit('The recovered copy could not be opened');
      return false;
    }

    this.currentName = typeof rec.name === 'string' && rec.name.trim()
      ? rec.name.trim()
      : target?.name ?? 'Recovered session';
    this.currentId = target?.id ?? null;

    const saved = this.currentId
      ? await this.write(audioEngine.exportProjectJSON(), 'Recovered session')
      : await this.saveAs(this.currentName);
    if (!saved) {
      let retainedRec = rec;
      if (this.currentId) {
        try {
          const persisted = await dbGet<ProjectRecord>('projects', this.currentId);
          if (persisted) retainedRec = { ...rec, projectId: persisted.id, name: persisted.name };
        } catch {
          // Keep the original recovery identity if the project store cannot be read.
        }
      }
      await this.keepRecovery(retainedRec);
      this.emit('Recovery is still available; saving it failed');
      return false;
    }

    if (target) {
      try {
        await dbPut('settings', { key: 'lastProjectId', value: target.id });
      } catch {
        await this.keepRecovery({ ...rec, projectId: target.id, name: this.currentName });
        this.emit('Recovered session saved, but startup selection failed; recovery copy retained');
        return false;
      }
    }
    this.emit('Last session restored');
    return true;
  }

  async discardRecovery(): Promise<void> {
    await this.clearRecovery();
    this.emit('Recovery copy discarded');
  }

  /** Refresh durable audio-take journals left by a browser/Electron crash or an unconfirmed save. */
  async refreshRecordingJournals(): Promise<void> {
    try {
      const journals = await listRecordingJournals();
      // An unconfirmed manifest may still be arming in another window. A list operation must
      // never delete it or race its first worklet batch.
      this.recordingJournals = journals.filter((journal) => journal.recordEdgeConfirmed && journal.startFrame !== null);
    } catch {
      this.recordingJournals = [];
    }
    this.emit();
  }

  async discardRecordingJournal(sessionId: string): Promise<void> {
    if (this.journalOperations.has(sessionId)) return;
    this.journalOperations.add(sessionId);
    try {
      await deleteRecordingJournal(sessionId);
      await this.refreshRecordingJournals();
      this.emit('Recorded-take recovery discarded');
    } finally {
      this.journalOperations.delete(sessionId);
    }
  }

  /** Rebuild one journalled audio take as new audio tracks in the currently open project. */
  async recoverRecordingJournal(sessionId: string): Promise<boolean> {
    if (this.journalOperations.has(sessionId)) return false;
    this.journalOperations.add(sessionId);
    try {
      if (!this.ensureRecorderIdle('recovering an audio take')) return false;
      const projectId = this.currentId;
      const projectTracks = audioEngine.tracks;
      const loaded = await loadRecordingJournal(sessionId);
      if (!loaded) return false;
      const { manifest } = loaded;
      if (!manifest.recordEdgeConfirmed || manifest.startFrame === null) {
        this.emit('That recording journal ended before its record edge; no take is available to recover');
        return false;
      }
      // A journal belongs to the project that owned the armed track. Never silently inject it
      // into whatever project happens to be open now: that looks like a successful recovery while
      // putting the take in the wrong song. The banner keeps it visible and names the project to
      // open first.
      if (manifest.projectId && manifest.projectId !== projectId) {
        const message = `Open "${manifest.projectName}" before recovering this recorded take.`;
        this.emit(message);
        toast(message, 'info');
        return false;
      }
      const byTrack = new Map<string, RecordingJournalChunk[]>();
      loaded.chunks.forEach((chunk) => {
        const list = byTrack.get(chunk.trackId) ?? [];
        list.push(chunk);
        byTrack.set(chunk.trackId, list);
      });
      const staged: { name: string; audioId: string; duration: number; mute: boolean }[] = [];
      const journalSpb = Math.max(1, manifest.stepsPerBar);
      const secondsPer16th = 60 / Math.max(1, manifest.bpm) / 4;
      for (const [index, savedTrack] of manifest.tracks.entries()) {
        const chunks = byTrack.get(savedTrack.trackId) ?? [];
        const buffer = this.rebuildJournalBuffer(manifest, savedTrack, chunks);
        if (!buffer) continue;
        const audioId = `recovered_${sessionId}_${index}`;
        const asset = audioStore.get(audioId) ?? audioStore.add(`Recovered take — ${savedTrack.name}`, buffer, {
          id: audioId,
          provenance: userRecordingProvenance(`Recovered crash journal from ${savedTrack.name}`),
        });
        if (!(await audioStore.ensurePersisted(asset.id))) throw new Error('Recovered audio could not be persisted.');
        staged.push({ name: savedTrack.name, audioId, duration: asset.buffer.duration, mute: savedTrack.muteOnRecovery === true });
      }
      if (!staged.length) {
        this.emit('No usable audio was found in that recorded-take recovery');
        return false;
      }
      if (this.currentId !== projectId || audioEngine.tracks !== projectTracks) {
        const message = 'The project changed during recovery. The take is still available to recover.';
        this.emit(message);
        toast(message, 'info');
        return false;
      }
      if (!this.ensureRecorderIdle('recovering an audio take')) return false;
      let added = false;
      for (const take of staged) {
        // A previous recovery may have saved the project just before the process exited. Keep
        // the same asset id so retrying that recovery cannot insert a duplicate arrangement clip.
        if (audioEngine.tracks.some((track) => track.arrangementClips?.some((clip) => clip.audioId === take.audioId))) continue;
        const track = audioEngine.createAudioTrack(`Recovered — ${take.name}`);
        if (take.mute) {
          track.mute = true;
          audioEngine.updateTrackChannelStrip(track.id);
        }
        const lengthBars = Math.max(1 / journalSpb, Math.ceil(take.duration / secondsPer16th) / journalSpb);
        (track.arrangementClips ??= []).push({
          id: newSeqId('clip'),
          kind: 'audio',
          startBar: Math.max(0, manifest.startPos / journalSpb),
          lengthBars,
          audioId: take.audioId,
          audioOffset: 0,
          name: `Recovered take — ${take.name}`,
          color: track.color,
        });
        added = true;
      }
      if (added) audioEngine.commitEdit();
      const save = this.save('Recovered active audio take');
      const savedId = this.currentId;
      if (!(await save)) {
        this.emit('Recovered audio is in the current session, but it could not be saved; the journal was kept');
        return false;
      }
      const saved = savedId ? await dbGet<ProjectRecord>('projects', savedId) : undefined;
      const savedAudioIds = saved ? new Set(projectAudioIds(saved.json)) : new Set<string>();
      if (!staged.every((take) => savedAudioIds.has(take.audioId))) {
        this.emit('Recovered audio is in the current session, but its project save could not be verified; the journal was kept');
        return false;
      }
      await deleteRecordingJournal(sessionId);
      await this.refreshRecordingJournals();
      this.emit(`Recovered ${staged.length} audio take${staged.length === 1 ? '' : 's'}`);
      return true;
    } catch (error) {
      const message = `Could not recover recorded audio: ${(error as Error).message}`;
      this.emit(message);
      toast(message, 'error');
      return false;
    } finally {
      this.journalOperations.delete(sessionId);
    }
  }

  /** Assemble the durable worklet blocks without assuming that all channels/trailing batches survived. */
  private rebuildJournalBuffer(manifest: RecordingJournalManifest, track: RecordingJournalManifest['tracks'][number], chunks: RecordingJournalChunk[]): AudioBuffer | null {
    const valid = chunks.filter((chunk) => chunk.channels.length > 0 && chunk.channels[0] instanceof ArrayBuffer && chunk.channels[0].byteLength > 0)
      .sort((a, b) => a.sequence - b.sequence);
    if (!valid.length || !Number.isFinite(manifest.sampleRate) || manifest.sampleRate < 8_000) return null;
    let first = Infinity;
    let last = 0;
    let channelCount = 1;
    for (const chunk of valid) {
      const frames = Math.floor(chunk.channels[0].byteLength / Float32Array.BYTES_PER_ELEMENT);
      first = Math.min(first, chunk.frame);
      last = Math.max(last, chunk.frame + frames);
      channelCount = Math.min(2, Math.max(channelCount, chunk.channels.length));
    }
    if (!manifest.recordEdgeConfirmed || manifest.startFrame === null) return null;
    const compensation = Math.round(track.latencyCompensationFrames ?? 0);
    const start = Math.max(first, manifest.startFrame + compensation);
    const end = Math.min(last, manifest.endFrame === undefined ? last : manifest.endFrame + compensation);
    const length = Math.max(0, end - start);
    if (length < manifest.sampleRate * 0.05) return null;
    const buffer = audioEngine.ctx.createBuffer(channelCount, length, manifest.sampleRate);
    for (const chunk of valid) {
      const frameOffset = chunk.frame - start;
      for (let channel = 0; channel < channelCount; channel++) {
        const raw = chunk.channels[channel] ?? chunk.channels[0];
        if (!(raw instanceof ArrayBuffer)) continue;
        const source = new Float32Array(raw);
        const from = Math.max(0, -frameOffset);
        const to = Math.min(source.length, length - frameOffset);
        if (to > from) buffer.getChannelData(channel).set(source.subarray(from, to), Math.max(0, frameOffset + from));
      }
    }
    return buffer;
  }

  private record(json: string, id: string, name: string, prev?: ProjectRecord): ProjectRecord {
    const tracks = audioEngine.tracks.length;
    let bars = 0;
    audioEngine.tracks.forEach((t) => (t.arrangementClips ?? []).forEach((c) => (bars = Math.max(bars, c.startBar + c.lengthBars))));
    return {
      id,
      name,
      createdAt: prev?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      json,
      audioIds: projectAudioIds(json),
      bpm: audioEngine.bpm,
      key: `${NOTE[audioEngine.rootKey] ?? 'C'} ${audioEngine.scaleType.replace('_', ' ')}`,
      tracks,
      bars: Math.ceil(bars),
      color: prev?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
      template: prev?.template,
    };
  }

  /** A save that did not happen. The status line says why; autosave retries every few seconds, so only the first failure of a streak toasts. */
  private saveFailed(reason: string, auto: boolean): false {
    this.emit(`Save failed: ${reason}`);
    if (!auto) toast(`Save failed: ${reason}`, 'error');
    else if (!this.autosaveFailing) {
      this.autosaveFailing = true;
      toast(`Autosave failed: ${reason}. Changes are not saved until a save succeeds.`, 'error');
    }
    return false;
  }

  private write(json: string, versionLabel?: string, auto = false): Promise<boolean> {
    const projectId = this.currentId;
    if (!projectId) return Promise.resolve(false);
    this.pendingWrites += 1;
    return this.enqueue(() => {
      const writeSnapshot = () => this.writeNow(projectId, json, versionLabel, auto);
      if (typeof navigator !== 'undefined' && 'locks' in navigator && typeof navigator.locks?.request === 'function') {
        return navigator.locks.request(`unbox_project_${projectId}`, writeSnapshot);
      }
      return writeSnapshot();
    }).finally(() => {
      this.pendingWrites -= 1;
    });
  }

  private async writeNow(projectId: string, json: string, versionLabel: string | undefined, auto: boolean): Promise<boolean> {
    if (this.currentId !== projectId) return false;
    const tracks = audioEngine.tracks;
    const isCurrent = () => this.currentId === projectId && audioEngine.tracks === tracks;
    if (!this.ensureRecorderIdle('saving this project', auto)) return false;
    if (projectId === this.protectedId) {
      return this.saveFailed(`saving is paused for "${this.currentName}" because some of its parts could not be loaded. Use Save as… to keep a copy.`, auto);
    }
    try {
      const prev = await dbGet<ProjectRecord>('projects', projectId);
      if (!isCurrent() || !this.ensureRecorderIdle('saving this project', auto)) return false;
      const record = this.record(json, projectId, this.currentName, prev);
      await dbPut('projects', record);
      // Cleanup uses the committed record's destination and asset references even if the user
      // has since opened a different project.
      try { await discardCompletedRecordingJournals(projectId, record.audioIds); } catch { /* best effort */ }
      if (!isCurrent()) return true;
      this.lastSavedJson = json;
      this.dirtyMarker = false;
      this.lastSavedAt = Date.now();
      this.autosaveFailing = false;
      // The project record is now the recovery copy.
      if (this.lastRecoveryJson || this.recovery) {
        this.lastRecoveryJson = '';
        this.recovery = null;
        try {
          await dbDelete('settings', 'recovery');
        } catch {
          // ignore
        }
      }
      if (versionLabel) await this.addVersion(projectId, json, versionLabel, auto);
      if (isCurrent()) this.emit(auto ? 'Autosaved' : 'Saved');
      return true;
    } catch (e) {
      return this.saveFailed((e as Error).message, auto);
    }
  }

  /** Saves the open project now (Ctrl+S). */
  async save(versionLabel?: string): Promise<boolean> {
    if (this.needsWelcome) return false;
    if (!this.currentId) {
      // "Open existing" can leave the app with no project. Ctrl+S must not quietly create an Untitled one.
      this.emit('No project is open — choose New project or Save as… first');
      return false;
    }
    if (!this.ensureRecorderIdle('saving this project')) return false;
    return this.write(audioEngine.exportProjectJSON(), versionLabel);
  }

  /** Saves the current state as a new project and switches to it. */
  async saveAs(name: string): Promise<boolean> {
    if (this.needsWelcome) return false;
    if (!this.ensureRecorderIdle('saving this project as a new copy')) return false;
    const previous = { id: this.currentId, name: this.currentName, protectedId: this.protectedId };
    const projectId = uid('prj');
    this.currentId = projectId;
    this.currentName = name.trim() || 'Untitled';
    const saved = await this.write(audioEngine.exportProjectJSON(), 'Created');
    if (!saved) {
      if (this.currentId === projectId) {
        this.currentId = previous.id;
        this.currentName = previous.name;
        this.protectedId = previous.protectedId;
        this.emit();
      }
      return false;
    }
    try {
      if (this.currentId === projectId) await dbPut('settings', { key: 'lastProjectId', value: projectId });
    } catch (e) {
      this.emit(`Project saved, but startup selection failed: ${(e as Error).message}`);
      return false;
    }
    return true;
  }

  async list(): Promise<ProjectRecord[]> {
    const all = await dbAll<ProjectRecord>('projects');
    return all.filter((p) => !p.template).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async userTemplates(): Promise<ProjectRecord[]> {
    return (await dbAll<ProjectRecord>('projects')).filter((p) => p.template).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Loads a project. Unsaved edits to the open project are saved first (autosave on) or confirmed (autosave off). */
  async open(id: string): Promise<boolean> {
    if (!this.ensureRecorderIdle('opening another project')) return false;
    const rec = await dbGet<ProjectRecord>('projects', id);
    if (!rec) return this.openFailed('that project no longer exists.');
    // Re-opening the project that is already open reloads its stored copy; the project list does not offer that while it is open.
    if (id !== this.currentId && !(await this.keepUnsaved(`open ${rec.name}`))) return false;
    this.missing = await audioStore.ensure(projectAudioIds(rec.json));
    if (!this.ensureRecorderIdle('opening another project')) return false;
    let loaded = false;
    try {
      loaded = this.loadJson(rec.json);
    } catch (e) {
      return this.openFailed(`"${rec.name}" could not be loaded: ${(e as Error).message}`);
    }
    if (!loaded) return this.openFailed(`"${rec.name}" is damaged or from an unsupported version.`);
    const dropped = rec.template ? 0 : this.droppedParts(rec.json);
    this.currentId = rec.template ? null : rec.id;
    this.currentName = rec.template ? `${rec.name} (copy)` : rec.name;
    this.protectedId = dropped ? rec.id : null;
    this.lastSavedJson = rec.template ? '' : audioEngine.exportProjectJSON();
    this.dirtyMarker = false;
    this.lastSavedAt = rec.updatedAt;
    this.lastVersionAt = Date.now();
    this.needsWelcome = false;
    if (dropped) toast(`${dropped} part(s) of "${rec.name}" could not be loaded. Saving over this project is paused; use Save as… to keep a copy.`, 'error');
    if (rec.template) await this.saveAs(this.currentName);
    else await dbPut('settings', { key: 'lastProjectId', value: rec.id });
    await this.refreshRecordingJournals();
    this.emit(this.missing.length ? `${this.missing.length} audio file(s) missing` : `Opened ${rec.name}`);
    return true;
  }

  private openFailed(reason: string): false {
    this.emit(`Could not open: ${reason}`);
    toast(`Could not open: ${reason}`, 'error');
    return false;
  }

  /**
   * Clears the way for another project. Edits to the open project are saved first when autosave is on;
   * otherwise the user confirms they are discarded. Resolves false when the change is cancelled or the save fails.
   */
  private async keepUnsaved(next: string): Promise<boolean> {
    if (!this.currentId || !this.dirty) return true;
    if (this.autosave) return this.save();
    return showConfirm({
      title: 'Unsaved changes',
      message: `"${this.currentName}" has unsaved changes. Discard them and ${next}?`,
      confirmLabel: 'Discard',
    });
  }

  /**
   * Loads project JSON into the engine. Nothing changes when the file fails preflight (false). If the
   * rebuild throws, the session that was open before is restored first, then the error is rethrown.
   */
  private loadJson(json: string): boolean {
    if (!parseImportableProject(json)) return false;
    const before = audioEngine.exportProjectJSON();
    try {
      return audioEngine.importProjectJSON(json);
    } catch (e) {
      try {
        audioEngine.importProjectJSON(before);
      } catch {
        // the previous session could not be rebuilt either; the original error is the one to report
      }
      throw e;
    }
  }

  /** Parts the project saved that the engine could not rebuild (a damaged device). */
  private droppedParts(json: string): number {
    const saved = parseImportableProject(json)?.devices.filter((d) => d.type !== 'master').length ?? 0;
    const rebuilt = (JSON.parse(audioEngine.exportProjectJSON()) as { devices?: unknown[] }).devices?.length ?? 0;
    return Math.max(0, saved - rebuilt);
  }

  /** New project: 'default' session, 'empty', a built-in genre template id or a user template id. */
  async create(source: string, name?: string): Promise<boolean> {
    if (!this.ensureRecorderIdle('starting a new project')) return false;
    if (!(await this.keepUnsaved('start a new project'))) return false;
    if (!this.ensureRecorderIdle('starting a new project')) return false;
    const genre = GENRE_TEMPLATES.find((t) => t.id === source);
    if (genre) {
      if (!audioEngine.resetProject()) return false;
      audioEngine.createDefaultReturns();
      applyTemplate(audioEngine, genre);
      this.meta = { ...EMPTY_META, genre: genre.genre };
      this.notes = '';
    } else if (source === 'empty' || source === 'default') {
      if (!audioEngine.newProject(source === 'empty')) return false;
      this.meta = { ...EMPTY_META };
      this.notes = '';
    } else {
      const rec = await dbGet<ProjectRecord>('projects', source);
      if (!rec) {
        this.openFailed('that project no longer exists.');
        return false;
      }
      await audioStore.ensure(rec.audioIds);
      if (!this.ensureRecorderIdle('starting a new project')) return false;
      if (!this.loadJson(rec.json)) {
        this.openFailed(`"${rec.name}" is damaged or from an unsupported version.`);
        return false;
      }
      const dropped = this.droppedParts(rec.json);
      if (dropped) toast(`${dropped} part(s) of "${rec.name}" could not be loaded into the new project.`, 'error');
    }
    audioEngine.commitEdit();
    // Clear the first-run lock for this one deliberate save; restore it if the save fails.
    const wasWelcome = this.needsWelcome;
    this.needsWelcome = false;
    const saved = await this.saveAs(name ?? (genre ? `${genre.name} idea` : 'Untitled'));
    if (!saved && wasWelcome) {
      this.needsWelcome = true;
      this.emit();
    }
    return saved;
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Queued behind the saves, so the copy it writes back is the newest one (an autosave cannot be overwritten with an older copy).
    await this.enqueue(async () => {
      const rec = await dbGet<ProjectRecord>('projects', id);
      if (!rec) return;
      rec.name = trimmed;
      await dbPut('projects', rec);
    });
    if (id === this.currentId) this.currentName = trimmed;
    this.emit();
  }

  async duplicate(id: string): Promise<void> {
    const rec = await dbGet<ProjectRecord>('projects', id);
    if (!rec) return;
    await dbPut('projects', { ...rec, id: uid('prj'), name: `${rec.name} copy`, createdAt: Date.now(), updatedAt: Date.now(), template: false });
    this.emit();
  }

  async remove(id: string): Promise<void> {
    if (!this.ensureRecorderIdle('deleting a project')) return;
    // Preserve the open session under a new id before deleting its old record. This means an
    // asynchronous recording start can never leave the current engine state without a project id.
    if (id === this.currentId && !(await this.saveAs(this.currentName))) return;
    const rec = await dbGet<ProjectRecord>('projects', id);
    const versions = await this.versions(id);
    if (!this.ensureRecorderIdle('deleting a project')) return;
    // Audio that this project and its history used may go, once nothing else still needs it.
    const candidates = [...(rec?.audioIds ?? []), ...versions.flatMap((v) => projectAudioIds(v.json))];
    await dbDelete('projects', id);
    for (const v of versions) await dbDelete('versions', v.id);
    await this.dropUnusedAudio(candidates);
    this.emit();
  }

  /** Audio ids that something still keeps: the open session, every saved project and version, and the recovery copy. Throws when a record cannot be read. */
  private async usedAudioIds(): Promise<Set<string>> {
    const used = new Set<string>();
    const add = (json: string): void => {
      JSON.parse(json); // a damaged record could hide references, so it must fail here instead of looking empty
      projectAudioIds(json).forEach((id) => used.add(id));
    };
    add(audioEngine.exportProjectJSON());
    for (const p of await dbAll<ProjectRecord>('projects')) {
      p.audioIds.forEach((id) => used.add(id));
      add(p.json);
    }
    for (const v of await dbAll<VersionRecord>('versions')) add(v.json);
    const recovery = await dbGet<{ key: string; value: string }>('settings', 'recovery');
    if (recovery?.value) add((JSON.parse(recovery.value) as RecoveryRecord).json);
    return used;
  }

  private async dropUnusedAudio(candidates: string[]): Promise<void> {
    if (!candidates.length) return;
    let used: Set<string>;
    try {
      used = await this.usedAudioIds();
    } catch {
      return; // an unreadable record might still use the audio, so nothing is deleted
    }
    for (const id of candidates) if (!used.has(id)) await audioStore.remove(id);
  }

  async saveAsTemplate(name: string): Promise<void> {
    if (!this.ensureRecorderIdle('saving a template')) return;
    const json = audioEngine.exportProjectJSON();
    await dbPut('projects', { ...this.record(json, uid('tpl'), name), template: true });
    this.emit('Template saved');
  }

  /* ------------------------------------------------------------ versions */

  async versions(projectId = this.currentId ?? ''): Promise<VersionRecord[]> {
    return (await dbByIndex<VersionRecord>('versions', 'projectId', projectId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  private async addVersion(projectId: string, json: string, label: string, auto: boolean): Promise<void> {
    await dbPut('versions', { id: uid('ver'), projectId, label, createdAt: Date.now(), json, auto } satisfies VersionRecord);
    if (this.currentId === projectId) this.lastVersionAt = Date.now();
    const autos = (await this.versions(projectId)).filter((v) => v.auto);
    for (const v of autos.slice(AUTO_VERSIONS_KEPT)) await dbDelete('versions', v.id);
  }

  async saveVersion(label: string): Promise<void> {
    if (!this.ensureRecorderIdle('saving a version')) return;
    await this.save(label.trim() || new Date().toLocaleString());
  }

  async restoreVersion(versionId: string): Promise<boolean> {
    if (!this.ensureRecorderIdle('restoring a version')) return false;
    const v = await dbGet<VersionRecord>('versions', versionId);
    if (!v) return false;
    if (!(await this.save('Before restore'))) return false;
    this.missing = await audioStore.ensure(projectAudioIds(v.json));
    if (!this.ensureRecorderIdle('restoring a version')) return false;
    let ok = false;
    try {
      ok = this.loadJson(v.json);
    } catch {
      // loadJson has put the session back the way it was
    }
    if (!ok) {
      this.emit('That version could not be restored');
      toast(`"${v.label}" could not be restored`, 'error');
      return false;
    }
    const dropped = this.droppedParts(v.json);
    if (dropped) {
      // Saving this version would overwrite parts the project still holds, so the save is paused instead.
      this.protectedId = this.currentId;
      toast(`${dropped} part(s) of "${v.label}" could not be loaded. Saving over the project is paused; use Save as… to keep a copy.`, 'error');
      this.emit('Restored version is not saved: some of its parts could not be loaded');
      return false;
    }
    if (!(await this.save())) return false;
    this.emit(`Restored "${v.label}"`);
    return true;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await dbDelete('versions', versionId);
    this.emit();
  }

  /* ------------------------------------------------------------ archives */

  /** `.unbox` archive: project.json + every audio file it uses (32-bit float WAV, lossless). Throws with the reason when it cannot be written. */
  async exportArchive(id = this.currentId ?? ''): Promise<{ blob: Blob; name: string }> {
    if (id === this.currentId && !this.ensureRecorderIdle('exporting this project')) {
      throw new Error('Finish the current recording take before exporting.');
    }
    if (id === this.currentId && !(await this.save())) throw new Error('the project could not be saved first.');
    const rec = await dbGet<ProjectRecord>('projects', id);
    if (!rec) throw new Error('that project no longer exists.');
    const uniqueAudioIds = Array.from(new Set(rec.audioIds));
    await audioStore.ensure(uniqueAudioIds);
    const entries: { name: string; data: Uint8Array | string; compress?: boolean }[] = [
      { name: 'project.json', data: rec.json, compress: true },
      {
        name: 'info.json',
        data: JSON.stringify({
          format: 'unbox-archive', version: 2, name: rec.name, savedAt: new Date().toISOString(),
          audio: uniqueAudioIds.map((id) => {
            const asset = audioStore.get(id);
            return {
              id,
              name: asset?.name ?? id,
              ...(asset?.sourceBpm !== undefined ? { sourceBpm: asset.sourceBpm } : {}),
              ...(asset?.detectedBpm !== undefined ? { detectedBpm: asset.detectedBpm } : {}),
              ...(asset?.key ? { key: asset.key } : {}),
              ...(asset?.provenance ? { provenance: asset.provenance } : {}),
            };
          }),
        }),
        compress: true,
      },
    ];
    let absent = 0;
    for (const aid of uniqueAudioIds) {
      const a = audioStore.get(aid);
      if (!a) {
        absent += 1;
        continue;
      }
      const chans = Array.from({ length: a.buffer.numberOfChannels }, (_, c) => a.buffer.getChannelData(c));
      const wav = encodeWav(chans, a.buffer.sampleRate, { bitDepth: 32, float: true });
      entries.push({ name: `audio/${aid}.wav`, data: new Uint8Array(await wav.arrayBuffer()) });
    }
    // The archive is still written so the rest of the project is kept, but the user is told what it lacks.
    if (absent) toast(`${absent} audio file(s) are missing and were left out of the archive. Relink them, then export again.`, 'error');
    return { blob: await writeZip(entries), name: `${safeFileName(rec.name)}.unbox` };
  }

  /**
   * Imports a `.unbox` archive (or a plain project .json) as a new project and opens it. Resolves false when
   * the user keeps the current project; throws when the file is not a usable project.
   */
  async importArchive(file: Blob, fallbackName = 'Imported project'): Promise<boolean> {
    if (!this.ensureRecorderIdle('importing a project')) return false;
    let json: string;
    let name = fallbackName;
    // Audio is decoded here but reaches the store only once the project has proven usable, so a bad file leaves nothing behind.
    const audio: { id: string; buffer: AudioBuffer; info?: ArchiveAudioInfo }[] = [];
    let assetInfo = new Map<string, ArchiveAudioInfo>();
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) {
      const files = await readZip(file);
      const pj = files.get('project.json');
      if (!pj) throw new Error('This archive has no project.json');
      json = new TextDecoder().decode(pj);
      const info = files.get('info.json');
      const meta = info ? (JSON.parse(new TextDecoder().decode(info)) as { name?: string; audio?: unknown[] }) : undefined;
      name = meta?.name ?? name;
      assetInfo = new Map((meta?.audio ?? []).map(archiveAudioInfo).filter((item): item is ArchiveAudioInfo => !!item).map((item) => [item.id, item]));
      for (const [path, data] of files) {
        const m = /^audio\/(.+)\.wav$/.exec(path);
        if (!m || audioStore.get(m[1])) continue;
        audio.push({ id: m[1], buffer: await audioEngine.ctx.decodeAudioData(data.slice().buffer), info: assetInfo.get(m[1]) });
      }
    } else {
      json = await file.text();
    }
    if (!parseImportableProject(json)) throw new Error('This file is not a valid Unbox Studio project.');
    if (!(await this.keepUnsaved('import this file'))) return false;
    if (!this.ensureRecorderIdle('importing a project')) return false;

    const added = audio.map((a) => a.id);
    audio.forEach(({ id, buffer, info }) => audioStore.add(info?.name ?? id, buffer, {
      id,
      ...(info?.sourceBpm !== undefined ? { sourceBpm: info.sourceBpm } : {}),
      ...(info?.detectedBpm !== undefined ? { detectedBpm: info.detectedBpm } : {}),
      ...(info?.key ? { key: info.key } : {}),
      ...(info?.provenance ? { provenance: info.provenance } : {}),
    }));
    this.missing = await audioStore.ensure(projectAudioIds(json));
    if (!this.ensureRecorderIdle('importing a project')) {
      await Promise.all(added.map((id) => audioStore.remove(id)));
      return false;
    }
    let loaded = false;
    try {
      loaded = this.loadJson(json);
    } finally {
      if (!loaded) await Promise.all(added.map((id) => audioStore.remove(id)));
    }
    if (!loaded) throw new Error('This file is not a valid Unbox Studio project.');
    const dropped = this.droppedParts(json);
    if (dropped) toast(`${dropped} part(s) of "${name}" could not be loaded.`, 'error');
    return this.saveAs(name);
  }

  /** Replaces a missing audio file with a file the user picked. */
  async relink(audioId: string, file: File): Promise<void> {
    const buf = await audioEngine.ctx.decodeAudioData(await file.arrayBuffer());
    audioStore.add(file.name.replace(/\.[^.]+$/, ''), buf, {
      id: audioId,
      provenance: userFileProvenance(file.name),
    });
    this.missing = this.missing.filter((m) => m !== audioId);
    audioEngine.changed();
    this.emit(this.missing.length ? `${this.missing.length} audio file(s) missing` : 'All audio found');
  }

  setMeta(patch: Partial<ProjectMeta>): void {
    this.meta = { ...this.meta, ...patch };
    this.scheduleRecovery();
    this.emit();
  }

  setNotes(notes: string): void {
    this.notes = notes;
    this.scheduleRecovery();
    this.emit();
  }
}

export const projectManager = new ProjectManager();
