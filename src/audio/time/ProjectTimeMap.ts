import { TempoMap } from './TempoMap.ts';
import { MeterMap } from './MeterMap.ts';
import { TICKS_PER_16TH, type MusicalPosition, type SnapGridDivision } from './types.ts';

export class ProjectTimeMap {
  public readonly tempoMap: TempoMap;
  public readonly meterMap: MeterMap;
  public defaultSampleRate: number = 48000;

  constructor(defaultBpm: number = 120, defaultNumerator: number = 4, defaultDenominator: number = 4) {
    this.tempoMap = new TempoMap(defaultBpm);
    this.meterMap = new MeterMap(defaultNumerator, defaultDenominator);
  }

  // ---- Fundamental Conversions ----

  public tickToSeconds(tick: number): number {
    return this.tempoMap.tickToSeconds(tick);
  }

  public secondsToTick(seconds: number): number {
    return this.tempoMap.secondsToTick(seconds);
  }

  public tickToSamples(tick: number, sampleRate: number = this.defaultSampleRate): number {
    const sec = this.tickToSeconds(tick);
    return Math.round(sec * sampleRate);
  }

  public samplesToTick(samples: number, sampleRate: number = this.defaultSampleRate): number {
    const sec = samples / Math.max(1, sampleRate);
    return this.secondsToTick(sec);
  }

  public sixteenthToSeconds(sixteenth: number): number {
    return this.tickToSeconds(sixteenth * TICKS_PER_16TH);
  }

  public secondsToSixteenth(seconds: number): number {
    return this.secondsToTick(seconds) / TICKS_PER_16TH;
  }

  // ---- Musical Position Conversions ----

  public tickToMusical(totalTicks: number): MusicalPosition {
    const cleanTicks = Math.max(0, Math.round(Number(totalTicks) || 0));
    const { bar } = this.meterMap.tickToBar(cleanTicks);
    const meter = this.meterMap.getMeterAtBar(bar);

    const ticksPerBeat = (192) / meter.denominator;
    const ticksPer16th = TICKS_PER_16TH;

    // Ticks into this bar
    const barStartTick = this.meterMap.barToTick(bar);
    const ticksInBar = Math.max(0, cleanTicks - barStartTick);

    const beatIdx = Math.floor(ticksInBar / ticksPerBeat);
    const ticksInBeat = ticksInBar % ticksPerBeat;

    const sixteenthIdx = Math.floor(ticksInBeat / ticksPer16th);
    const subTick = Math.round(ticksInBeat % ticksPer16th);

    return {
      bar,
      beat: beatIdx + 1,
      sixteenth: sixteenthIdx + 1,
      tick: subTick,
      totalTicks: cleanTicks,
      totalSixteenths: cleanTicks / TICKS_PER_16TH,
    };
  }

  public musicalToTick(pos: Partial<MusicalPosition>): number {
    const bar = Math.max(1, Math.floor(Number(pos.bar) || 1));
    const meter = this.meterMap.getMeterAtBar(bar);
    const barStartTick = this.meterMap.barToTick(bar);

    const ticksPerBeat = 192 / meter.denominator;
    const ticksPer16th = TICKS_PER_16TH;

    const beat = Math.max(1, Math.floor(Number(pos.beat) || 1));
    const sixteenth = Math.max(1, Math.floor(Number(pos.sixteenth) || 1));
    const subTick = Math.max(0, Math.round(Number(pos.tick) || 0));

    const beatTicks = (beat - 1) * ticksPerBeat;
    const sixteenthTicks = (sixteenth - 1) * ticksPer16th;

    return barStartTick + beatTicks + sixteenthTicks + subTick;
  }

  public barBeatTickToSeconds(bar: number, beat: number = 1, tick: number = 0): number {
    const totalTicks = this.musicalToTick({ bar, beat, sixteenth: 1, tick });
    return this.tickToSeconds(totalTicks);
  }

  public secondsToBarBeatTick(seconds: number): { bar: number; beat: number; sixteenth: number; tick: number } {
    const totalTicks = this.secondsToTick(seconds);
    const m = this.tickToMusical(totalTicks);
    return { bar: m.bar, beat: m.beat, sixteenth: m.sixteenth, tick: m.tick };
  }

  // ---- String Formatting ----

  public formatMusical(tick: number): string {
    const m = this.tickToMusical(tick);
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return `${m.bar}.${m.beat}.${m.sixteenth}.${pad(m.tick, 2)}`;
  }

  public formatTime(seconds: number, format: 'mm:ss:ms' | 'hh:mm:ss:ms' = 'mm:ss:ms'): string {
    const totalMs = Math.max(0, Math.floor((Number(seconds) || 0) * 1000));
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const s = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const m = totalMin % 60;
    const h = Math.floor(totalMin / 60);

    const pad = (n: number, len = 2) => String(n).padStart(len, '0');

    if (format === 'hh:mm:ss:ms') {
      return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
    }
    return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
  }

  // ---- Snap Grid Math ----

  public snapTick(tick: number, snap: SnapGridDivision): number {
    const t = Math.max(0, Number(tick) || 0);
    if (snap === 'off') return t;

    const m = this.tickToMusical(t);
    const meter = this.meterMap.getMeterAtBar(m.bar);
    const ticksPerBeat = 192 / meter.denominator;

    let gridTicks = TICKS_PER_16TH; // 1/16 default

    switch (snap) {
      case 'bar':
        gridTicks = this.meterMap.calcTicksPerBar(meter.numerator, meter.denominator);
        break;
      case '1/2':
        gridTicks = ticksPerBeat * 2;
        break;
      case '1/4':
        gridTicks = ticksPerBeat;
        break;
      case '1/8':
        gridTicks = ticksPerBeat / 2;
        break;
      case '1/16':
        gridTicks = ticksPerBeat / 4;
        break;
      case '1/32':
        gridTicks = ticksPerBeat / 8;
        break;
      case '1/64':
        gridTicks = ticksPerBeat / 16;
        break;
      case 'triplet_8':
        gridTicks = (ticksPerBeat * 2) / 3;
        break;
      case 'triplet_16':
        gridTicks = ticksPerBeat / 3;
        break;
      default:
        gridTicks = TICKS_PER_16TH;
    }

    gridTicks = Math.max(1, Math.round(gridTicks));
    const barStartTick = this.meterMap.barToTick(m.bar);
    const offsetInBar = t - barStartTick;
    const snappedOffset = Math.round(offsetInBar / gridTicks) * gridTicks;
    return Math.max(0, barStartTick + snappedOffset);
  }

  public getGridSubdivisions(
    startBar: number,
    endBar: number,
    snap: SnapGridDivision = '1/16'
  ): { bar: number; tick: number; isMajor: boolean; label?: string }[] {
    const sBar = Math.max(1, Math.floor(startBar));
    const eBar = Math.max(sBar, Math.ceil(endBar));
    const out: { bar: number; tick: number; isMajor: boolean; label?: string }[] = [];

    for (let b = sBar; b <= eBar; b++) {
      const bStart = this.meterMap.barToTick(b);
      const meter = this.meterMap.getMeterAtBar(b);
      const ticksInBar = this.meterMap.calcTicksPerBar(meter.numerator, meter.denominator);
      const ticksPerBeat = 192 / meter.denominator;

      // Major bar division
      out.push({ bar: b, tick: bStart, isMajor: true, label: `${b}` });

      if (snap === 'bar') continue;

      let stepTicks = TICKS_PER_16TH;
      if (snap === '1/4') stepTicks = ticksPerBeat;
      else if (snap === '1/8') stepTicks = ticksPerBeat / 2;
      else if (snap === '1/2') stepTicks = ticksPerBeat * 2;

      stepTicks = Math.max(1, Math.round(stepTicks));

      for (let tk = stepTicks; tk < ticksInBar; tk += stepTicks) {
        const beatNum = Math.floor(tk / ticksPerBeat) + 1;
        const isBeat = tk % ticksPerBeat === 0;
        out.push({
          bar: b,
          tick: bStart + tk,
          isMajor: isBeat,
          label: isBeat ? `${b}.${beatNum}` : undefined,
        });
      }
    }
    return out;
  }

  // ---- Serialization ----

  public serialize(): unknown {
    return {
      tempoMap: this.tempoMap.serialize(),
      meterMap: this.meterMap.serialize(),
      defaultSampleRate: this.defaultSampleRate,
    };
  }

  public deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const obj = data as { tempoMap?: unknown; meterMap?: unknown; defaultSampleRate?: number };
    if (obj.tempoMap) this.tempoMap.deserialize(obj.tempoMap);
    if (obj.meterMap) this.meterMap.deserialize(obj.meterMap);
    if (typeof obj.defaultSampleRate === 'number') this.defaultSampleRate = obj.defaultSampleRate;
  }
}

