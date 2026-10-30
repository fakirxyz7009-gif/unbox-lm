import type { BaseDevice } from './BaseDevice.ts';

export interface AuditionNote {
  note: number;
  velocity?: number;
}

export interface ScheduledAudition {
  startTime: number;
  stopTime: number;
}

/**
 * Schedules a short UI audition entirely against a device's AudioContext clock.
 * UI code must not use a JavaScript timer to release a musical note: a busy main
 * thread makes that release late, whereas device envelopes can schedule exactly.
 */
export function scheduleAudition(
  device: Pick<BaseDevice, 'ctx' | 'noteOn' | 'noteOff'>,
  notes: readonly AuditionNote[],
  durationMs: number,
  leadTime = 0.005,
): ScheduledAudition {
  const now = device.ctx.currentTime;
  const safeLead = Number.isFinite(leadTime) ? Math.max(0, leadTime) : 0;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(1, durationMs) / 1000 : 0.001;
  const startTime = now + safeLead;
  const stopTime = startTime + safeDuration;

  for (const { note, velocity = 0.9 } of notes) {
    device.noteOn(note, velocity, startTime);
    device.noteOff(note, stopTime);
  }
  return { startTime, stopTime };
}
