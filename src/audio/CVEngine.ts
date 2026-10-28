import { BaseDevice } from './BaseDevice.ts';
import { CVMatrixEntry } from './types.ts';

export class CVEngine {
  private devices: Map<string, BaseDevice> = new Map();
  public matrixEntries: CVMatrixEntry[] = [];
  private timerId: number | null = null;
  public liveMeterValues: Map<string, number> = new Map();
  private smoothedValues: Map<string, number> = new Map();

  constructor() {
    this.startBackgroundSafeLoop();
  }

  public registerDevice(device: BaseDevice): void {
    this.devices.set(device.id, device);
  }

  public unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    this.matrixEntries = this.matrixEntries.filter(
      (m) => m.sourceDeviceId !== deviceId && m.targetDeviceId !== deviceId
    );
  }

  public addMatrixEntry(entry: Omit<CVMatrixEntry, 'id'>): string {
    const id = `cv_entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newEntry: CVMatrixEntry = { ...entry, id };
    this.matrixEntries.push(newEntry);
    return id;
  }

  public removeMatrixEntry(id: string): void {
    this.matrixEntries = this.matrixEntries.filter((m) => m.id !== id);
    this.liveMeterValues.delete(id);
    this.smoothedValues.delete(id);
  }

  public updateMatrixEntry(id: string, updates: Partial<CVMatrixEntry>): void {
    const entry = this.matrixEntries.find((m) => m.id === id);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  /**
   * Called both from the AudioEngine lookahead scheduler and a background-safe timer
   * with exponential smoothing + AudioParam.setTargetAtTime to eliminate 60Hz zipper noise.
   */
  public tickCV(audioTime?: number): void {
    for (const entry of this.matrixEntries) {
      const sourceDev = this.devices.get(entry.sourceDeviceId);
      const targetDev = this.devices.get(entry.targetDeviceId);

      if (!sourceDev || !targetDev || !sourceDev.isPowered || !targetDev.isPowered) {
        continue;
      }

      const cvOut = sourceDev.cvOutputs.get(entry.sourcePortId);
      if (!cvOut || !cvOut.getter) continue;

      let rawVal = cvOut.getter();
      if (entry.inverted) {
        rawVal = -rawVal;
      }

      const targetVal = rawVal * entry.amount + entry.offset;
      const prevSmoothed = this.smoothedValues.get(entry.id) ?? targetVal;
      // Anti-zipper one-pole smoothing filter
      const smoothed = prevSmoothed + (targetVal - prevSmoothed) * 0.35;
      this.smoothedValues.set(entry.id, smoothed);
      this.liveMeterValues.set(entry.id, smoothed);

      const cvIn = targetDev.cvInputs.get(entry.targetParam);
      if (cvIn) {
        const now = audioTime ?? targetDev.ctx.currentTime;
        if (cvIn.param) {
          cvIn.param.setTargetAtTime(smoothed, now, 0.01);
        }
        if (cvIn.setter) {
          cvIn.setter(smoothed);
        }
      }
    }
  }

  private startBackgroundSafeLoop(): void {
    if (this.timerId !== null) clearInterval(this.timerId);
    this.timerId = window.setInterval(() => {
      this.tickCV();
    }, 20);
  }

  public dispose(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
