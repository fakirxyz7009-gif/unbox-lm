/**
 * Projects inside the app (IndexedDB): new / open / save / save as, autosave, version history,
 * user templates, notes and metadata, `.unbox` archives (project + all its audio) and missing
 * media detection / relinking. `projectManager` is the singleton the UI uses.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import { encodeWav, safeFileName } from '../audio/export/wav.ts';
import { toast } from '../shell/toast.ts';
import { dbAll, dbByIndex, dbDelete, dbGet, dbPut, requestPersistence } from './db.ts';
import { parseImportableProject } from './projectFormat.ts';
import { GENRE_TEMPLATES, applyTemplate } from './templates.ts';
import { readZip, writeZip } from './zip.ts';
import { projectAudioIds } from '../../shared/project/audioAssets.ts';

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
  /** Unsaved work recovered from IndexedDB after a crash / closed tab. */
  recovery: RecoveryRecord | null = null;
  private lastSavedJson = '';
  private lastVersionAt = 0;
  private lastRecoveryJson = '';
  private timer: number | null = null;
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

  constructor() {
    audioEngine.registerProjectSection('project', {
      save: () => ({ meta: this.meta, notes: this.notes }),
      load: (data) => {
        const d = (data ?? {}) as { meta?: Partial<ProjectMeta>; notes?: string };
        this.meta = { ...EMPTY_META, ...(d.meta ?? {}), tags: Array.isArray(d.meta?.tags) ? d.meta!.tags : [] };
        this.notes = typeof d.notes === 'string' ? d.notes : '';
      },
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

  get dirty(): boolean {
    return audioEngine.exportProjectJSON() !== this.lastSavedJson;
  }

  /** Opens the last project (or creates a new one) and starts autosave. */
  async init(): Promise<void> {
    void requestPersistence();
    try {
      const last = await dbGet<{ key: string; value: string }>('settings', 'lastProjectId');
      const previous = last?.value ? await dbGet<ProjectRecord>('projects', last.value) : undefined;
      // A project that cannot be opened stays as it is; this session gets a project of its own so its work is saved.
      if (!previous || !(await this.open(previous.id))) await this.saveAs('Untitled');
      await this.checkRecovery();
    } catch (e) {
      this.emit(`Projects unavailable: ${(e as Error).message}`);
    }
    this.startAutosave();
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
      if (!this.autosave || !this.dirty) return;
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
    if (!this.autosave || this.pendingWrites > 0 || audioEngine.isRecording) return;
    const json = audioEngine.exportProjectJSON();
    // Nothing changed since the last save: drop any stale recovery copy.
    if (json === this.lastSavedJson) {
      const persistedRecoveryIsCurrentSave = this.recovery?.projectId === this.currentId && this.recovery.json === json;
      const sessionRecoveryIsStale = !this.recovery && !!this.lastRecoveryJson;
      if (persistedRecoveryIsCurrentSave || sessionRecoveryIsStale) await this.clearRecovery();
      return;
    }
    await this.writeRecovery(json);
    if (!this.currentId) return;
    await this.write(json, Date.now() - this.lastVersionAt > this.versionMin * 60000 ? 'Autosave' : undefined, true);
  }

  /** Storage writes run one after another, so an older autosave can never land after a newer one. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private writeRecovery(json: string): Promise<void> {
    return this.enqueue(async () => {
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
    const rec = this.recovery;
    if (!rec) return false;
    const target = typeof rec.projectId === 'string' && rec.projectId
      ? await dbGet<ProjectRecord>('projects', rec.projectId)
      : undefined;
    this.missing = await audioStore.ensure(projectAudioIds(rec.json));
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
    this.pendingWrites += 1;
    return this.enqueue(() => this.writeNow(json, versionLabel, auto)).finally(() => {
      this.pendingWrites -= 1;
    });
  }

  private async writeNow(json: string, versionLabel: string | undefined, auto: boolean): Promise<boolean> {
    if (!this.currentId) return false;
    if (this.currentId === this.protectedId) {
      return this.saveFailed(`saving is paused for "${this.currentName}" because some of its parts could not be loaded. Use Save as… to keep a copy.`, auto);
    }
    try {
      const prev = await dbGet<ProjectRecord>('projects', this.currentId);
      await dbPut('projects', this.record(json, this.currentId, this.currentName, prev));
      this.lastSavedJson = json;
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
      if (versionLabel) await this.addVersion(json, versionLabel, auto);
      this.emit(auto ? 'Autosaved' : 'Saved');
      return true;
    } catch (e) {
      return this.saveFailed((e as Error).message, auto);
    }
  }

  /** Saves the open project now (Ctrl+S). */
  async save(versionLabel?: string): Promise<boolean> {
    if (!this.currentId) return this.saveAs(this.currentName);
    return this.write(audioEngine.exportProjectJSON(), versionLabel);
  }

  /** Saves the current state as a new project and switches to it. */
  async saveAs(name: string): Promise<boolean> {
    this.currentId = uid('prj');
    this.currentName = name.trim() || 'Untitled';
    const saved = await this.write(audioEngine.exportProjectJSON(), 'Created');
    if (!saved) return false;
    try {
      await dbPut('settings', { key: 'lastProjectId', value: this.currentId });
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
    const rec = await dbGet<ProjectRecord>('projects', id);
    if (!rec) return this.openFailed('that project no longer exists.');
    // Re-opening the project that is already open reloads its stored copy; the project list does not offer that while it is open.
    if (id !== this.currentId && !(await this.keepUnsaved(`open ${rec.name}`))) return false;
    this.missing = await audioStore.ensure(projectAudioIds(rec.json));
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
    this.lastVersionAt = Date.now();
    if (dropped) toast(`${dropped} part(s) of "${rec.name}" could not be loaded. Saving over this project is paused; use Save as… to keep a copy.`, 'error');
    if (rec.template) await this.saveAs(this.currentName);
    else await dbPut('settings', { key: 'lastProjectId', value: rec.id });
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
    return window.confirm(`"${this.currentName}" has unsaved changes. Discard them and ${next}?`);
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
  async create(source: string, name?: string): Promise<void> {
    if (!(await this.keepUnsaved('start a new project'))) return;
    const genre = GENRE_TEMPLATES.find((t) => t.id === source);
    if (genre) {
      audioEngine.resetProject();
      audioEngine.createDefaultReturns();
      applyTemplate(audioEngine, genre);
      this.meta = { ...EMPTY_META, genre: genre.genre };
      this.notes = '';
    } else if (source === 'empty' || source === 'default') {
      audioEngine.newProject(source === 'empty');
      this.meta = { ...EMPTY_META };
      this.notes = '';
    } else {
      const rec = await dbGet<ProjectRecord>('projects', source);
      if (!rec) {
        this.openFailed('that project no longer exists.');
        return;
      }
      await audioStore.ensure(rec.audioIds);
      if (!this.loadJson(rec.json)) {
        this.openFailed(`"${rec.name}" is damaged or from an unsupported version.`);
        return;
      }
      const dropped = this.droppedParts(rec.json);
      if (dropped) toast(`${dropped} part(s) of "${rec.name}" could not be loaded into the new project.`, 'error');
    }
    audioEngine.commitEdit();
    await this.saveAs(name ?? (genre ? `${genre.name} idea` : 'Untitled'));
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
    const rec = await dbGet<ProjectRecord>('projects', id);
    const versions = await this.versions(id);
    // Audio that this project and its history used may go, once nothing else still needs it.
    const candidates = [...(rec?.audioIds ?? []), ...versions.flatMap((v) => projectAudioIds(v.json))];
    await dbDelete('projects', id);
    for (const v of versions) await dbDelete('versions', v.id);
    if (id === this.currentId) {
      this.currentId = null;
      await this.saveAs(this.currentName);
    }
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
    const json = audioEngine.exportProjectJSON();
    await dbPut('projects', { ...this.record(json, uid('tpl'), name), template: true });
    this.emit('Template saved');
  }

  /* ------------------------------------------------------------ versions */

  async versions(projectId = this.currentId ?? ''): Promise<VersionRecord[]> {
    return (await dbByIndex<VersionRecord>('versions', 'projectId', projectId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  private async addVersion(json: string, label: string, auto: boolean): Promise<void> {
    if (!this.currentId) return;
    await dbPut('versions', { id: uid('ver'), projectId: this.currentId, label, createdAt: Date.now(), json, auto } satisfies VersionRecord);
    this.lastVersionAt = Date.now();
    const autos = (await this.versions()).filter((v) => v.auto);
    for (const v of autos.slice(AUTO_VERSIONS_KEPT)) await dbDelete('versions', v.id);
  }

  async saveVersion(label: string): Promise<void> {
    await this.save(label.trim() || new Date().toLocaleString());
  }

  async restoreVersion(versionId: string): Promise<boolean> {
    const v = await dbGet<VersionRecord>('versions', versionId);
    if (!v) return false;
    if (!(await this.save('Before restore'))) return false;
    this.missing = await audioStore.ensure(projectAudioIds(v.json));
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
    if (id === this.currentId && !(await this.save())) throw new Error('the project could not be saved first.');
    const rec = await dbGet<ProjectRecord>('projects', id);
    if (!rec) throw new Error('that project no longer exists.');
    await audioStore.ensure(rec.audioIds);
    const entries: { name: string; data: Uint8Array | string; compress?: boolean }[] = [
      { name: 'project.json', data: rec.json, compress: true },
      { name: 'info.json', data: JSON.stringify({ format: 'unbox-archive', version: 1, name: rec.name, savedAt: new Date().toISOString(), audio: rec.audioIds.map((a) => ({ id: a, name: audioStore.get(a)?.name ?? a })) }), compress: true },
    ];
    let absent = 0;
    for (const aid of rec.audioIds) {
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
    let json: string;
    let name = fallbackName;
    // Audio is decoded here but reaches the store only once the project has proven usable, so a bad file leaves nothing behind.
    const audio: { id: string; buffer: AudioBuffer }[] = [];
    let assetNames: { id: string; name: string }[] = [];
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) {
      const files = await readZip(file);
      const pj = files.get('project.json');
      if (!pj) throw new Error('This archive has no project.json');
      json = new TextDecoder().decode(pj);
      const info = files.get('info.json');
      const meta = info ? (JSON.parse(new TextDecoder().decode(info)) as { name?: string; audio?: { id: string; name: string }[] }) : undefined;
      name = meta?.name ?? name;
      assetNames = meta?.audio ?? [];
      for (const [path, data] of files) {
        const m = /^audio\/(.+)\.wav$/.exec(path);
        if (!m || audioStore.get(m[1])) continue;
        audio.push({ id: m[1], buffer: await audioEngine.ctx.decodeAudioData(data.slice().buffer) });
      }
    } else {
      json = await file.text();
    }
    if (!parseImportableProject(json)) throw new Error('This file is not a valid Unbox Studio project.');
    if (!(await this.keepUnsaved('import this file'))) return false;

    const added = audio.map((a) => a.id);
    audio.forEach(({ id, buffer }) => audioStore.add(id, buffer, { id }));
    // keep the original asset names
    assetNames.forEach((x) => audioStore.update(x.id, { name: x.name }));
    this.missing = await audioStore.ensure(projectAudioIds(json));
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
    audioStore.add(file.name.replace(/\.[^.]+$/, ''), buf, { id: audioId });
    this.missing = this.missing.filter((m) => m !== audioId);
    audioEngine.changed();
    this.emit(this.missing.length ? `${this.missing.length} audio file(s) missing` : 'All audio found');
  }

  setMeta(patch: Partial<ProjectMeta>): void {
    this.meta = { ...this.meta, ...patch };
    this.emit();
  }

  setNotes(notes: string): void {
    this.notes = notes;
    this.emit();
  }
}

export const projectManager = new ProjectManager();
