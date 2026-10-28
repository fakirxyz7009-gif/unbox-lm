/**
 * Voice bookkeeping shared by the instrument engines: polyphony limit with stealing,
 * release tracking, and a held-note stack for mono / legato modes.
 */

export interface VoiceBase {
  note: number;
  startTime: number;
  /** Time the release started (null while held). */
  releaseTime: number | null;
  /** When the voice is silent and can be dropped. */
  endTime: number;
  release(t: number): void;
  /** Fast fade (stealing / panic). */
  kill(t: number): void;
}

export class VoicePool<V extends VoiceBase> {
  public list: V[] = [];

  constructor(public max: number) {}

  /** Drops finished voices. */
  gc(now: number): void {
    if (this.list.length) this.list = this.list.filter((v) => v.endTime > now);
  }

  /** Frees a slot (oldest released voice first, else the oldest held one). */
  makeRoom(t: number, now: number): void {
    this.gc(now);
    while (this.list.length >= Math.max(1, this.max)) {
      let idx = this.list.findIndex((v) => v.releaseTime !== null);
      if (idx < 0) idx = 0;
      const [v] = this.list.splice(idx, 1);
      v.kill(t);
    }
  }

  add(v: V): void {
    this.list.push(v);
  }

  /** Releases the earliest still-held voice playing `note` that started by time t. */
  releaseNote(note: number, t: number): V | null {
    let best: V | null = null;
    for (const v of this.list) {
      if (v.note !== note || v.releaseTime !== null || v.startTime > t + 1e-6) continue;
      if (!best || v.startTime < best.startTime) best = v;
    }
    best?.release(t);
    return best;
  }

  releaseAll(t: number): void {
    for (const v of this.list) if (v.releaseTime === null) v.release(t);
  }

  killAll(t: number): void {
    for (const v of this.list) v.kill(t);
    this.list = [];
  }

  /** Held (not released) voices. */
  held(): V[] {
    return this.list.filter((v) => v.releaseTime === null);
  }
}

/** Last-note-priority stack for mono synths. */
export class NoteStack {
  private notes: number[] = [];

  push(n: number): void {
    this.notes = this.notes.filter((x) => x !== n);
    this.notes.push(n);
  }

  remove(n: number): number | null {
    this.notes = this.notes.filter((x) => x !== n);
    return this.notes.length ? this.notes[this.notes.length - 1] : null;
  }

  top(): number | null {
    return this.notes.length ? this.notes[this.notes.length - 1] : null;
  }

  clear(): void {
    this.notes = [];
  }

  get size(): number {
    return this.notes.length;
  }
}

/** Voice-mode helpers for the 'voiceMode' select (Poly / Mono / Legato / Unison). */
export function voiceModeOf(label: string): { mono: boolean; legato: boolean; unison: boolean } {
  return { mono: label === 'Mono' || label === 'Legato', legato: label === 'Legato', unison: label === 'Unison' };
}
