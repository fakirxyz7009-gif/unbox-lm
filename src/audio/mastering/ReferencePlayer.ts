/**
 * Reference tracks (`audioEngine.reference`): commercial / earlier mixes stored inside the app,
 * played into the monitor section (never into the mix or exports). A/B switches the speakers
 * between your mix and the reference; level matching uses each file's integrated loudness so
 * you compare sound, not volume.
 */
import { measureLoudness } from '../analysis/loudness.ts';
import type { MonitorController } from '../mixer/MonitorController.ts';
import type { MeterHub } from '../analysis/MeterHub.ts';
import { dbAll, dbDelete, dbPut } from '../../project/db.ts';

export interface ReferenceTrack {
  id: string;
  name: string;
  lufs: number;
  truePeakDb: number;
  duration: number;
  /** Folder / playlist label. */
  group: string;
}

interface StoredReference extends ReferenceTrack {
  kind: 'reference';
  bytes: ArrayBuffer;
  createdAt: number;
}

export interface ReferenceHost {
  ctx: AudioContext;
  monitor: MonitorController;
  meters: MeterHub;
  readonly isPlaying: boolean;
  /** Seconds of the song at the audible playhead. */
  songSeconds(): number;
}

export class ReferencePlayer {
  refs: ReferenceTrack[] = [];
  activeId: string | null = null;
  levelMatch = true;
  /** Play the reference from the song's position when you switch to it. */
  sync = true;
  loop = true;
  private buffers = new Map<string, AudioBuffer>();
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private startedAt = 0;
  private offset = 0;
  private listeners = new Set<() => void>();
  loaded = false;

  constructor(private host: ReferenceHost) {
    this.gain = host.ctx.createGain();
    this.gain.connect(host.monitor.referenceInput);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb());
  }

  async load(): Promise<void> {
    const all = (await dbAll<StoredReference>('media')).filter((m) => m.kind === 'reference');
    this.refs = all.sort((a, b) => a.createdAt - b.createdAt).map(({ id, name, lufs, truePeakDb, duration, group }) => ({ id, name, lufs, truePeakDb, duration, group: group || 'References' }));
    this.loaded = true;
    this.emit();
    // decode lazily on first play
    for (const r of all) if (!this.buffers.has(r.id)) void this.host.ctx.decodeAudioData(r.bytes.slice(0)).then((b) => this.buffers.set(r.id, b));
  }

  async add(file: File, group = 'References'): Promise<ReferenceTrack> {
    const bytes = await file.arrayBuffer();
    const buf = await this.host.ctx.decodeAudioData(bytes.slice(0));
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const l = measureLoudness(chans, buf.sampleRate);
    const rec: StoredReference = {
      kind: 'reference', id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: file.name.replace(/\.[^.]+$/, ''),
      lufs: l.integrated, truePeakDb: l.truePeakDb, duration: buf.duration, group, bytes, createdAt: Date.now(),
    };
    await dbPut('media', rec);
    this.buffers.set(rec.id, buf);
    const t: ReferenceTrack = { id: rec.id, name: rec.name, lufs: rec.lufs, truePeakDb: rec.truePeakDb, duration: rec.duration, group };
    this.refs.push(t);
    if (!this.activeId) this.activeId = t.id;
    this.emit();
    return t;
  }

  async remove(id: string): Promise<void> {
    if (this.activeId === id) {
      this.stop();
      this.activeId = null;
    }
    await dbDelete('media', id);
    this.refs = this.refs.filter((r) => r.id !== id);
    this.buffers.delete(id);
    this.emit();
  }

  /** Gain (linear) that puts the reference at the mix's loudness. */
  matchGain(id = this.activeId): number {
    const r = this.refs.find((x) => x.id === id);
    if (!r || !this.levelMatch || !Number.isFinite(r.lufs)) return 1;
    const mix = this.host.meters.reading.integrated;
    const target = Number.isFinite(mix) && mix > -60 ? mix : -14;
    return Math.pow(10, Math.max(-24, Math.min(12, target - r.lufs)) / 20);
  }

  get playing(): boolean {
    return !!this.src;
  }

  /** Current playback position (seconds). */
  position(): number {
    const b = this.activeId ? this.buffers.get(this.activeId) : undefined;
    if (!this.src || !b) return this.offset;
    const p = this.offset + (this.host.ctx.currentTime - this.startedAt);
    return this.loop ? p % b.duration : Math.min(p, b.duration);
  }

  play(at?: number): void {
    const id = this.activeId;
    const b = id ? this.buffers.get(id) : undefined;
    if (!b) return;
    this.stop(false);
    const src = this.host.ctx.createBufferSource();
    src.buffer = b;
    src.loop = this.loop;
    src.connect(this.gain);
    this.offset = Math.max(0, (at ?? (this.sync ? this.host.songSeconds() : this.offset)) % b.duration);
    this.gain.gain.setTargetAtTime(this.matchGain(id), this.host.ctx.currentTime, 0.01);
    src.start(this.host.ctx.currentTime + 0.01, this.offset);
    this.startedAt = this.host.ctx.currentTime + 0.01;
    src.onended = () => {
      if (this.src === src) {
        this.src = null;
        this.emit();
      }
    };
    this.src = src;
    this.emit();
  }

  stop(keepPosition = true): void {
    if (keepPosition) this.offset = this.position();
    try {
      this.src?.stop();
    } catch {
      // already stopped
    }
    this.src = null;
    this.emit();
  }

  select(id: string): void {
    const was = this.playing;
    this.stop();
    this.activeId = id;
    this.offset = 0;
    if (was) this.play();
    this.emit();
  }

  /** A/B: B starts the reference (from the song position when synced) and switches the speakers to it. */
  ab(toReference: boolean): void {
    this.host.monitor.set({ source: toReference ? 'reference' : 'mix' });
    if (toReference && !this.playing) this.play();
    this.emit();
  }

  refreshGain(): void {
    this.gain.gain.setTargetAtTime(this.matchGain(), this.host.ctx.currentTime, 0.05);
  }
}
