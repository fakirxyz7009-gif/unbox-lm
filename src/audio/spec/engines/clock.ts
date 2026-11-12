/**
 * 16th-note clock for tempo-synced effects (Alligator, Synchronous). While the song plays the
 * sequencer drives it (device onStepTick); when stopped, a small look-ahead timer keeps it
 * running at the current tempo so the effect still moves on live audio.
 */
import type { SpecHost } from '../SpecDevice.ts';

export class StepClock {
  private removeRealtime: (() => void) | null = null;
  private nextTime = 0;
  private pos = 0;

  constructor(private readonly host: SpecHost, private readonly onTick: (pos: number, time: number) => void) {
    this.removeRealtime = host.clock.requestRealtime?.((now, until) => this.run(now, until)) ?? null;
  }

  /** Called from the device's onStepTick while the transport plays. */
  fromTransport(pos: number, time: number): void {
    this.pos = pos + 1;
    this.nextTime = time + 60 / this.host.clock.bpm() / 4;
    this.onTick(pos, time);
  }

  private run(now: number, until: number): boolean {
    if (this.host.clock.isPlaying()) return true;
    const step = 60 / Math.max(20, this.host.clock.bpm()) / 4;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    while (this.nextTime < until) {
      this.onTick(this.pos, this.nextTime);
      this.pos++;
      this.nextTime += step;
    }
    return true;
  }

  stop(): void {
    this.removeRealtime?.();
    this.removeRealtime = null;
  }
}
