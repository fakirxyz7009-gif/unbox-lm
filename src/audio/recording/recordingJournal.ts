/**
 * Durable, best-effort journal for an audio take that has not reached the project yet.
 *
 * The AudioWorklet only posts fixed-size Float32 chunks. This module copies and batches those
 * chunks on the main thread into IndexedDB; it never performs I/O from an audio callback. A
 * sudden process loss can therefore recover every batch that committed, while the newest small
 * batch remains explicitly best-effort rather than being misrepresented as sample-exact safety.
 */
import { dbAll, dbByIndex, dbDeleteMany, dbKeysByIndex, dbPut, dbPutMany } from '../../project/db.ts';
import type { PlaybackMode } from '../sequencer/model.ts';
import type { ClipNote } from '../types.ts';

export interface RecordingJournalTrack {
  trackId: string;
  name: string;
  physical: boolean;
  /** A captured master mix starts muted to avoid doubling the original mix on playback. */
  muteOnRecovery?: boolean;
  /**
   * Signed capture compensation used for this physical input, measured at arm time.
   * It is saved in frames (rather than remeasured after a restart), so recovery can crop
   * raw worklet data at the same edge as ordinary take placement.
   */
  latencyCompensationFrames?: number;
}

export interface RecordingJournalManifest {
  id: string;
  sessionId: string;
  kind: 'manifest';
  projectId: string | null;
  projectName: string;
  createdAt: number;
  updatedAt: number;
  sampleRate: number;
  /** Target sixteenth position, not a wall-clock timestamp. */
  startPos: number;
  /** AudioContext frame corresponding to `startPos` after count-in / pre-roll. */
  startFrame: number | null;
  /**
   * The transport has scheduled a concrete record edge. A journal without this confirmation
   * only represents interrupted arm/pre-roll and must not be presented as a recoverable take.
   */
  recordEdgeConfirmed: boolean;
  bpm: number;
  stepsPerBar: number;
  tracks: RecordingJournalTrack[];
  /** Highest source frame whose chunk batch reached IndexedDB. */
  durableThroughFrame?: number;
  endPos?: number;
  /** Exact AudioContext frame requested for the normal take's end edge. */
  endFrame?: number;
  /** Assets placed by the normal finalization path, before the containing project was saved. */
  placedAudioIds?: string[];
  /** Present for a MIDI journal. Mixed recordings use independent audio and MIDI journals. */
  midiMode?: PlaybackMode;
  hasMidiNotes?: boolean;
  placedMidiTrackIds?: string[];
  finalizingAt?: number;
  /** Present only after normal placement; retained until a project save clears it. */
  completedAt?: number;
  error?: string;
}

export interface RecordingJournalChunk {
  id: string;
  sessionId: string;
  kind: 'chunk';
  trackId: string;
  sequence: number;
  frame: number;
  channels: ArrayBuffer[];
}

export interface RecordingJournalMidiNote {
  kind: 'midi';
  id: string;
  sessionId: string;
  trackId: string;
  patternId: string | null;
  /** Absolute sixteenth position and a duration through release or the last held-key checkpoint. */
  note: ClipNote;
}

type JournalBlock = RecordingJournalChunk | RecordingJournalMidiNote;
type JournalEntry = RecordingJournalManifest | JournalBlock;

export interface RecordingJournalStart {
  projectId: string | null;
  projectName: string;
  sampleRate: number;
  startPos: number;
  bpm: number;
  stepsPerBar: number;
  tracks: RecordingJournalTrack[];
  midiMode?: PlaybackMode;
}

export interface LoadedRecordingJournal {
  manifest: RecordingJournalManifest;
  chunks: RecordingJournalChunk[];
  midiNotes: RecordingJournalMidiNote[];
}

const BATCH_CHUNKS = 4;
const BATCH_MS = 350;

const sessionId = () => `take_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const manifestId = (id: string) => `manifest:${id}`;
const chunkId = (id: string, trackId: string, sequence: number) => `chunk:${id}:${trackId}:${sequence}`;

function asManifest(value: unknown): RecordingJournalManifest | null {
  const item = value as Partial<RecordingJournalManifest> | null;
  if (!item || item.kind !== 'manifest' || typeof item.id !== 'string' || typeof item.sessionId !== 'string' ||
      typeof item.sampleRate !== 'number' || !Array.isArray(item.tracks)) return null;
  return item as RecordingJournalManifest;
}

function asChunk(value: unknown): RecordingJournalChunk | null {
  const item = value as Partial<RecordingJournalChunk> | null;
  if (!item || item.kind !== 'chunk' || typeof item.id !== 'string' || typeof item.sessionId !== 'string' ||
      typeof item.trackId !== 'string' || typeof item.sequence !== 'number' || typeof item.frame !== 'number' ||
      !Array.isArray(item.channels)) return null;
  return item as RecordingJournalChunk;
}

/** Owns a single in-progress take journal. Calls from `append` never await IndexedDB. */
export class ActiveRecordingJournal {
  readonly sessionId: string;
  private manifest: RecordingJournalManifest;
  private sequenceByTrack = new Map<string, number>();
  private pending = new Map<string, JournalBlock>();
  private writeQueue: Promise<void> = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private closed = false;

  constructor(start: RecordingJournalStart) {
    this.sessionId = sessionId();
    const now = Date.now();
    this.manifest = {
      id: manifestId(this.sessionId),
      sessionId: this.sessionId,
      kind: 'manifest',
      projectId: start.projectId,
      projectName: start.projectName || 'Untitled',
      createdAt: now,
      updatedAt: now,
      sampleRate: start.sampleRate,
      startPos: start.startPos,
      startFrame: null,
      recordEdgeConfirmed: false,
      bpm: start.bpm,
      stepsPerBar: start.stepsPerBar,
      tracks: start.tracks.map((track) => ({ ...track })),
      midiMode: start.midiMode,
    };
  }

  get snapshot(): RecordingJournalManifest {
    return { ...this.manifest, tracks: this.manifest.tracks.map((track) => ({ ...track })) };
  }

  /** Commit the manifest before capture begins, so a crash can at least identify the take. */
  async start(): Promise<void> {
    await dbPut('recordingJournal', this.snapshot);
    this.started = true;
  }

  /** Update musical placement once the transport has actually scheduled the record edge. */
  updateStart(startPos: number, startFrame: number): void {
    if (!this.started || this.closed) return;
    this.manifest.startPos = Math.max(0, Number.isFinite(startPos) ? startPos : 0);
    this.manifest.startFrame = Math.max(0, Math.round(Number.isFinite(startFrame) ? startFrame : 0));
    this.manifest.recordEdgeConfirmed = true;
    this.manifest.updatedAt = Date.now();
    void this.queueManifest();
  }

  /** Copies a worklet-owned chunk, then schedules non-realtime persistence. */
  append(trackId: string, frame: number, channels: Float32Array[]): void {
    if (!this.started || this.closed || !channels.length || !channels[0]?.length) return;
    const sequence = this.sequenceByTrack.get(trackId) ?? 0;
    this.sequenceByTrack.set(trackId, sequence + 1);
    const copied = channels.map((channel) => channel.slice().buffer);
    this.enqueueBlock({
      id: chunkId(this.sessionId, trackId, sequence),
      sessionId: this.sessionId,
      kind: 'chunk',
      trackId,
      sequence,
      frame: Math.max(0, Math.round(frame)),
      channels: copied,
    });
  }

  checkpointMidi(sequence: number, trackId: string, patternId: string | null, note: ClipNote): void {
    if (!this.started || this.closed || !this.manifest.midiMode) return;
    this.enqueueBlock({
      id: `midi:${this.sessionId}:${String(sequence).padStart(10, '0')}`,
      kind: 'midi', sessionId: this.sessionId, trackId, patternId, note: { ...note },
    });
  }

  private enqueueBlock(block: JournalBlock): void {
    this.pending.set(block.id, block);
    if (this.pending.size >= BATCH_CHUNKS) {
      void this.flush();
    } else if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, block.kind === 'midi' ? 100 : BATCH_MS);
    }
  }

  private queue(task: () => Promise<void>): Promise<void> {
    const run = this.writeQueue.then(task, task);
    // Persistence errors must not create an unhandled rejection on a live recording path. The
    // manifest records the failure when possible, and normal capture continues in RAM.
    this.writeQueue = run.catch(async (error) => {
      this.manifest.error = error instanceof Error ? error.message : String(error);
      this.manifest.updatedAt = Date.now();
      try { await dbPut('recordingJournal', this.snapshot); } catch { /* storage is unavailable */ }
    });
    return this.writeQueue;
  }

  private queueManifest(): Promise<void> {
    return this.queue(async () => {
      await dbPut('recordingJournal', this.snapshot);
    });
  }

  /** Flushes the currently buffered chunks in one IndexedDB transaction. */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const batch = [...this.pending.values()];
    this.pending.clear();
    if (!batch.length) return this.writeQueue;
    const latest = batch.reduce((max, chunk) => chunk.kind === 'chunk'
      ? Math.max(max, chunk.frame + (chunk.channels[0]?.byteLength ?? 0) / Float32Array.BYTES_PER_ELEMENT) : max, 0);
    await this.queue(async () => {
      // Build this snapshot in the serialized write, after earlier batches have committed.
      // Do not advance the in-memory durable edge until this transaction actually completes:
      // a fallback manifest after quota/IndexedDB failure must never claim missing chunks exist.
      const durableThroughFrame = Math.max(this.manifest.durableThroughFrame ?? 0, latest);
      const updatedAt = Date.now();
      const snapshot: RecordingJournalManifest = {
        ...this.snapshot,
        durableThroughFrame,
        hasMidiNotes: this.manifest.hasMidiNotes || batch.some((row) => row.kind === 'midi'),
        updatedAt,
      };
      await dbPutMany<JournalEntry>('recordingJournal', [...batch, snapshot]);
      this.manifest.durableThroughFrame = durableThroughFrame;
      this.manifest.hasMidiNotes = snapshot.hasMidiNotes;
      this.manifest.updatedAt = Math.max(this.manifest.updatedAt, updatedAt);
    });
  }

  /** Stops further appends and waits for every received chunk to reach persistent storage. */
  async finish(endPos: number, endFrame?: number): Promise<void> {
    this.closed = true;
    this.manifest.endPos = Math.max(0, Number.isFinite(endPos) ? endPos : this.manifest.startPos);
    if (Number.isFinite(endFrame)) this.manifest.endFrame = Math.max(0, Math.round(endFrame!));
    this.manifest.finalizingAt = Date.now();
    await this.flush();
    await this.queueManifest();
  }

  /** The take has been placed in the project; retain it until that project gets a durable save. */
  async markCompleted(placedAudioIds: string[] = []): Promise<void> {
    this.manifest.completedAt = Date.now();
    this.manifest.updatedAt = this.manifest.completedAt;
    this.manifest.placedAudioIds = [...new Set(placedAudioIds.filter((id) => typeof id === 'string' && !!id))];
    await this.queueManifest();
  }

  async markMidiCompleted(trackIds: string[]): Promise<void> {
    this.manifest.completedAt = Date.now();
    this.manifest.updatedAt = this.manifest.completedAt;
    this.manifest.placedMidiTrackIds = [...new Set(trackIds)];
    await this.queueManifest();
  }

  /** Used only for cancelled arming: no recording ever reached the project. */
  async discard(): Promise<void> {
    this.closed = true;
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending.clear();
    await this.writeQueue;
    await deleteRecordingJournal(this.sessionId);
  }
}

export async function listRecordingJournals(): Promise<RecordingJournalManifest[]> {
  // Manifest primary keys share this prefix. Listing takes during a save or startup must not
  // deserialize the potentially very large PCM chunks stored alongside them.
  const range = IDBKeyRange.bound('manifest:', 'manifest;', false, true);
  const rows = await dbAll<RecordingJournalManifest>('recordingJournal', range);
  return rows.map(asManifest).filter((item): item is RecordingJournalManifest => !!item)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function loadRecordingJournal(id: string): Promise<LoadedRecordingJournal | null> {
  const rows = await dbByIndex<JournalEntry>('recordingJournal', 'sessionId', id);
  const manifest = rows.map(asManifest).find((item): item is RecordingJournalManifest => !!item);
  if (!manifest) return null;
  const chunks = rows.map(asChunk).filter((item): item is RecordingJournalChunk => !!item)
    .sort((a, b) => a.trackId.localeCompare(b.trackId) || a.sequence - b.sequence);
  const midiNotes = rows.filter((row): row is RecordingJournalMidiNote => row.kind === 'midi')
    .sort((a, b) => a.id.localeCompare(b.id));
  return { manifest, chunks, midiNotes };
}

export async function deleteRecordingJournal(id: string): Promise<void> {
  const keys = await dbKeysByIndex('recordingJournal', 'sessionId', id);
  await dbDeleteMany('recordingJournal', keys);
}

/**
 * Once a project record has committed *with the placed take's assets*, the corresponding
 * completed journal is redundant.  The asset check is intentional: an older queued save can
 * finish after a newer take and must not erase the only crash-recovery copy for that take.
 */
export async function discardCompletedRecordingJournals(
  projectId: string | null, savedAudioIds: Iterable<string>,
  savedMidiTakes: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Promise<void> {
  if (!projectId) return;
  const saved = new Set(savedAudioIds);
  const completed = (await listRecordingJournals()).filter((journal) =>
    journal.projectId === projectId &&
    !!journal.completedAt &&
    (journal.midiMode
      ? !!journal.placedMidiTrackIds?.length && journal.placedMidiTrackIds.every((id) => savedMidiTakes.get(id)?.has(journal.sessionId))
      : Array.isArray(journal.placedAudioIds) && journal.placedAudioIds.every((id) => saved.has(id))),
  );
  await Promise.all(completed.map((journal) => deleteRecordingJournal(journal.sessionId)));
}
