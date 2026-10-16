/**
 * @file StepSequencer.ts
 * @brief Precise lookahead step sequencer scheduler for Web Audio API.
 * 
 * Logic:
 * - The scheduler runs a loop every `lookaheadMs` (default 25ms).
 * - It checks if the next event falls within the `scheduleAheadTime` window (0.1s).
 * - This allows the browser to schedule Web Audio events slightly in the future,
 *   bypassing main-thread latency jitters.
 */

export type StepCallback = (step: number, time: number) => void;

export class StepSequencer {
  private ctx: AudioContext;
  private bpmProvider: () => number;
  private onStepCallback: StepCallback;

  private isPlaying = false;
  private timerId: number | null = null;
  
  private currentStep = 0;
  private nextNoteTime = 0;
  
  // Lookahead settings
  private lookaheadMs = 25;        // Check every 25ms
  private scheduleAheadTime = 0.1; // Schedule 100ms in advance
  
  private patternLength = 16;

  constructor(
    ctx: AudioContext,
    bpmProvider: () => number,
    onStepCallback: StepCallback
  ) {
    this.ctx = ctx;
    this.bpmProvider = bpmProvider;
    this.onStepCallback = onStepCallback;
  }

  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    // Start slightly in the future to allow context to stabilize
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.currentStep = 0;
    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduler() {
    // Keep scheduling ahead while the next event is within the horizon
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.onStepCallback(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }

    // Schedule the next check loop
    this.timerId = window.setTimeout(() => this.scheduler(), this.lookaheadMs);
  }

  private advanceStep() {
    const bpm = this.bpmProvider();
    const secondsPerBeat = 60.0 / bpm;
    // Assuming 16th note resolution (0.25 beats)
    const stepDuration = 0.25 * secondsPerBeat;

    this.nextNoteTime += stepDuration;
    this.currentStep = (this.currentStep + 1) % this.patternLength;
  }

  public setPatternLength(len: number) {
    this.patternLength = len;
  }
}
