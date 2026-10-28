import { type TempoEvent } from './types.ts';

const TICKS_PER_BEAT = 48; // 4 * 12
const SECONDS_PER_TICK_FACTOR = 60 / TICKS_PER_BEAT; // 1.25

export class TempoMap {
  private events: TempoEvent[] = [];
  /** Cached accumulated seconds at the start of each event */
  private eventStartSeconds: number[] = [];

  constructor(initialBpm: number = 120) {
    this.clear(initialBpm);
  }

  public clear(defaultBpm: number = 120): void {
    const clamped = Math.max(20, Math.min(999, defaultBpm));
    this.events = [
      {
        id: 'tempo_root',
        tick: 0,
        bpm: clamped,
        curve: 'instant',
      },
    ];
    this.rebuildCache();
  }

  public get defaultBpm(): number {
    return this.events[0]?.bpm ?? 120;
  }

  public getAllEvents(): readonly TempoEvent[] {
    return this.events;
  }

  public setRootBpm(bpm: number): void {
    const clamped = Math.max(20, Math.min(999, Number(bpm) || 120));
    if (this.events.length > 0) {
      this.events[0].bpm = clamped;
      this.rebuildCache();
    }
  }

  public addTempoEvent(tick: number, bpm: number, curve: 'instant' | 'linear' = 'instant', id?: string): TempoEvent {
    const cleanTick = Math.max(0, Math.round(Number(tick) || 0));
    const cleanBpm = Math.max(20, Math.min(999, Number(bpm) || 120));
    const eventId = id || `tempo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // If setting tick 0, update root event
    if (cleanTick === 0) {
      this.events[0].bpm = cleanBpm;
      this.events[0].curve = curve;
      this.rebuildCache();
      return this.events[0];
    }

    // Replace if exists at exact same tick
    const existingIdx = this.events.findIndex((e) => e.tick === cleanTick);
    if (existingIdx > 0) {
      this.events[existingIdx].bpm = cleanBpm;
      this.events[existingIdx].curve = curve;
      this.rebuildCache();
      return this.events[existingIdx];
    }

    const newEvent: TempoEvent = {
      id: eventId,
      tick: cleanTick,
      bpm: cleanBpm,
      curve,
    };

    this.events.push(newEvent);
    this.events.sort((a, b) => a.tick - b.tick);
    this.rebuildCache();
    return newEvent;
  }

  public removeTempoEvent(id: string): boolean {
    if (id === 'tempo_root' || this.events.length <= 1) return false;
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx <= 0) return false; // cannot delete root event
    this.events.splice(idx, 1);
    this.rebuildCache();
    return true;
  }

  private rebuildCache(): void {
    this.eventStartSeconds = new Array(this.events.length);
    this.eventStartSeconds[0] = 0;

    for (let i = 0; i < this.events.length - 1; i++) {
      const e0 = this.events[i];
      const e1 = this.events[i + 1];
      const dt = e1.tick - e0.tick;
      let segSec = 0;

      if (e0.curve === 'linear' && e0.bpm !== e1.bpm) {
        const k = (e1.bpm - e0.bpm) / dt;
        segSec = (SECONDS_PER_TICK_FACTOR / k) * Math.log(e1.bpm / e0.bpm);
      } else {
        segSec = (dt * SECONDS_PER_TICK_FACTOR) / e0.bpm;
      }

      this.eventStartSeconds[i + 1] = this.eventStartSeconds[i] + segSec;
    }
  }

  public getBpmAtTick(tick: number): number {
    const t = Math.max(0, Number(tick) || 0);
    if (this.events.length === 1 || t <= 0) return this.events[0].bpm;

    let idx = this.findEventIndexForTick(t);
    const e0 = this.events[idx];
    if (idx === this.events.length - 1 || e0.curve !== 'linear') {
      return e0.bpm;
    }

    const e1 = this.events[idx + 1];
    const frac = (t - e0.tick) / (e1.tick - e0.tick);
    return e0.bpm + frac * (e1.bpm - e0.bpm);
  }

  public getBpmAtSeconds(seconds: number): number {
    const tick = this.secondsToTick(seconds);
    return this.getBpmAtTick(tick);
  }

  public tickToSeconds(tick: number): number {
    const t = Math.max(0, Number(tick) || 0);
    if (t === 0) return 0;
    if (this.events.length === 1) {
      return (t * SECONDS_PER_TICK_FACTOR) / this.events[0].bpm;
    }

    const idx = this.findEventIndexForTick(t);
    const e0 = this.events[idx];
    const s0 = this.eventStartSeconds[idx];
    const dt = t - e0.tick;

    if (idx === this.events.length - 1 || e0.curve !== 'linear' || e0.bpm === this.events[idx + 1].bpm) {
      return s0 + (dt * SECONDS_PER_TICK_FACTOR) / e0.bpm;
    }

    const e1 = this.events[idx + 1];
    const k = (e1.bpm - e0.bpm) / (e1.tick - e0.tick);
    const bpmAtT = e0.bpm + k * dt;
    const segSec = (SECONDS_PER_TICK_FACTOR / k) * Math.log(bpmAtT / e0.bpm);
    return s0 + segSec;
  }

  public secondsToTick(seconds: number): number {
    const s = Math.max(0, Number(seconds) || 0);
    if (s === 0) return 0;
    if (this.events.length === 1) {
      return (s * this.events[0].bpm) / SECONDS_PER_TICK_FACTOR;
    }

    // Binary search for event segment
    let low = 0;
    let high = this.eventStartSeconds.length - 1;
    let idx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.eventStartSeconds[mid] <= s) {
        idx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const e0 = this.events[idx];
    const s0 = this.eventStartSeconds[idx];
    const ds = s - s0;

    if (idx === this.events.length - 1 || e0.curve !== 'linear' || e0.bpm === this.events[idx + 1].bpm) {
      return e0.tick + (ds * e0.bpm) / SECONDS_PER_TICK_FACTOR;
    }

    const e1 = this.events[idx + 1];
    const dt = e1.tick - e0.tick;
    const k = (e1.bpm - e0.bpm) / dt;
    const bpmAtS = e0.bpm * Math.exp((k * ds) / SECONDS_PER_TICK_FACTOR);
    const dtFrac = (bpmAtS - e0.bpm) / k;
    return e0.tick + dtFrac;
  }

  private findEventIndexForTick(tick: number): number {
    let low = 0;
    let high = this.events.length - 1;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.events[mid].tick <= tick) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  public serialize(): unknown {
    return {
      events: this.events.map((e) => ({ ...e })),
    };
  }

  public deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const obj = data as { events?: TempoEvent[] };
    if (Array.isArray(obj.events) && obj.events.length > 0) {
      this.events = obj.events
        .filter((e) => Number.isFinite(e.tick) && Number.isFinite(e.bpm) && e.bpm > 0)
        .map((e, i) => ({
          id: e.id || (i === 0 ? 'tempo_root' : `tempo_${i}`),
          tick: Math.max(0, Math.round(e.tick)),
          bpm: Math.max(20, Math.min(999, e.bpm)),
          curve: e.curve === 'linear' ? 'linear' : 'instant',
        }));

      if (this.events.length === 0 || this.events[0].tick !== 0) {
        this.events.unshift({ id: 'tempo_root', tick: 0, bpm: 120, curve: 'instant' });
      }
      this.events.sort((a, b) => a.tick - b.tick);
      this.rebuildCache();
    }
  }
}

