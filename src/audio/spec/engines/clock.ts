/**
 * 16th-note clock for tempo-synced effects (Alligator, Synchronous). While the song plays the
 * sequencer drives it (device onStepTick); when stopped, a small look-ahead timer keeps it
 * running at the current tempo so the effect still moves on live audio.
 */
import type { SpecHost } from '../SpecDevice.ts';

export class StepClock {
  private timer: number | null = null;
  private nextTime = 0;
  private pos = 0;

  constructor(private readonly host: SpecHost, private readonly onTick: (pos: number, time: number) => void) {
    const ctx = host.ctx;
    if (typeof window === 'undefined' || !(ctx instanceof AudioContext)) return;
    this.timer = window.setInterval(() => this.run(), 25);
  }

  /** Called from the device's onStepTick while the transport plays. */
  fromTransport(pos: number, time: number): void {
    this.pos = pos + 1;
    this.nextTime = time + 60 / this.host.clock.bpm() / 4;
    this.onTick(pos, time);
  }

  private run(): void {
    if (this.host.clock.isPlaying()) return;
    const ctx = this.host.ctx;
    const step = 60 / Math.max(20, this.host.clock.bpm()) / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.onTick(this.pos, this.nextTime);
      this.pos++;
      this.nextTime += step;
    }
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
