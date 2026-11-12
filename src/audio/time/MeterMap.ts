import { type MeterEvent } from './types.ts';

export class MeterMap {
  private events: MeterEvent[] = [];

  constructor(initialNumerator: number = 4, initialDenominator: number = 4) {
    this.clear(initialNumerator, initialDenominator);
  }

  public clear(numerator: number = 4, denominator: number = 4): void {
    const num = Math.max(1, Math.min(32, Math.round(Number(numerator) || 4)));
    const den = [1, 2, 4, 8, 16, 32].includes(Number(denominator)) ? Number(denominator) : 4;

    this.events = [
      {
        id: 'meter_root',
        bar: 1,
        numerator: num,
        denominator: den,
        startTick: 0,
      },
    ];
    this.rebuildTicks();
  }

  public getAllEvents(): readonly MeterEvent[] {
    return this.events;
  }

  public get defaultMeter(): MeterEvent {
    return this.events[0];
  }

  public setRootMeter(numerator: number, denominator: number): void {
    const num = Math.max(1, Math.min(32, Math.round(Number(numerator) || 4)));
    const den = [1, 2, 4, 8, 16, 32].includes(Number(denominator)) ? Number(denominator) : 4;
    this.events[0].numerator = num;
    this.events[0].denominator = den;
    this.rebuildTicks();
  }

  public addMeterEvent(bar: number, numerator: number, denominator: number, id?: string): MeterEvent {
    const cleanBar = Math.max(1, Math.round(Number(bar) || 1));
    const cleanNum = Math.max(1, Math.min(32, Math.round(Number(numerator) || 4)));
    const cleanDen = [1, 2, 4, 8, 16, 32].includes(Number(denominator)) ? Number(denominator) : 4;
    const eventId = id || `meter_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    if (cleanBar === 1) {
      this.events[0].numerator = cleanNum;
      this.events[0].denominator = cleanDen;
      this.rebuildTicks();
      return this.events[0];
    }

    const existingIdx = this.events.findIndex((e) => e.bar === cleanBar);
    if (existingIdx > 0) {
      this.events[existingIdx].numerator = cleanNum;
      this.events[existingIdx].denominator = cleanDen;
      this.rebuildTicks();
      return this.events[existingIdx];
    }

    const newEvent: MeterEvent = {
      id: eventId,
      bar: cleanBar,
      numerator: cleanNum,
      denominator: cleanDen,
      startTick: 0, // recalculated below
    };

    this.events.push(newEvent);
    this.events.sort((a, b) => a.bar - b.bar);
    this.rebuildTicks();
    return newEvent;
  }

  public removeMeterEvent(id: string): boolean {
    if (id === 'meter_root' || this.events.length <= 1) return false;
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx <= 0) return false;
    this.events.splice(idx, 1);
    this.rebuildTicks();
    return true;
  }

  private rebuildTicks(): void {
    this.events[0].startTick = 0;
    for (let i = 0; i < this.events.length - 1; i++) {
      const cur = this.events[i];
      const next = this.events[i + 1];
      const barsInSegment = next.bar - cur.bar;
      const ticksPerBar = this.calcTicksPerBar(cur.numerator, cur.denominator);
      next.startTick = cur.startTick + barsInSegment * ticksPerBar;
    }
  }

  public calcTicksPerBar(numerator: number, denominator: number): number {
    // 1 beat of 1/4 = 48 ticks.
    // 1 beat of 1/D = (16 / D) * 12 = 192 / D ticks.
    return Math.round((192 * numerator) / denominator);
  }

  public calcStepsPerBar(numerator: number, denominator: number): number {
    // 16ths per bar
    return Math.max(1, Math.round((16 * numerator) / denominator));
  }

  public calcBeatSteps(denominator: number): number {
    // 16ths per beat
    return Math.max(1, Math.round(16 / denominator));
  }

  public getMeterAtBar(bar: number): MeterEvent {
    const b = Math.max(1, Math.floor(Number(bar) || 1));
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (b >= this.events[i].bar) return this.events[i];
    }
    return this.events[0];
  }

  public getMeterAtTick(tick: number): MeterEvent {
    const t = Math.max(0, Number(tick) || 0);
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (t >= this.events[i].startTick) return this.events[i];
    }
    return this.events[0];
  }

  /** Converts a 1-based bar number (with fractional offset if any) to project ticks */
  public barToTick(bar: number): number {
    const b = Math.max(1, Number(bar) || 1);
    const wholeBar = Math.floor(b);
    const frac = b - wholeBar;

    let segmentIdx = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (wholeBar >= this.events[i].bar) {
        segmentIdx = i;
        break;
      }
    }

    const seg = this.events[segmentIdx];
    const barsFromSegStart = wholeBar - seg.bar;
    const ticksPerBar = this.calcTicksPerBar(seg.numerator, seg.denominator);
    return Math.round(seg.startTick + (barsFromSegStart + frac) * ticksPerBar);
  }

  /** Converts project ticks to 1-based bar number and fraction */
  public tickToBar(tick: number): { bar: number; fraction: number; totalBars: number } {
    const t = Math.max(0, Number(tick) || 0);
    let segmentIdx = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (t >= this.events[i].startTick) {
        segmentIdx = i;
        break;
      }
    }

    const seg = this.events[segmentIdx];
    const ticksFromSegStart = t - seg.startTick;
    const ticksPerBar = this.calcTicksPerBar(seg.numerator, seg.denominator);
    const barsInSeg = ticksFromSegStart / ticksPerBar;
    const wholeBarInSeg = Math.floor(barsInSeg);
    const frac = barsInSeg - wholeBarInSeg;
    const absoluteBar = seg.bar + wholeBarInSeg;

    return {
      bar: absoluteBar,
      fraction: frac,
      totalBars: seg.bar - 1 + barsInSeg,
    };
  }

  public serialize(): unknown {
    return {
      events: this.events.map((e) => ({ ...e })),
    };
  }

  public deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const obj = data as { events?: MeterEvent[] };
    if (Array.isArray(obj.events) && obj.events.length > 0) {
      this.events = obj.events
        .filter((e) => Number.isFinite(e.bar) && e.bar >= 1 && e.numerator > 0 && e.denominator > 0)
        .map((e, i) => ({
          id: e.id || (i === 0 ? 'meter_root' : `meter_${i}`),
          bar: Math.max(1, Math.round(e.bar)),
          numerator: Math.max(1, Math.min(32, e.numerator)),
          denominator: [1, 2, 4, 8, 16, 32].includes(e.denominator) ? e.denominator : 4,
          startTick: 0,
        }));

      if (this.events.length === 0 || this.events[0].bar !== 1) {
        this.events.unshift({ id: 'meter_root', bar: 1, numerator: 4, denominator: 4, startTick: 0 });
      }
      this.events.sort((a, b) => a.bar - b.bar);
      this.rebuildTicks();
    }
  }
}

