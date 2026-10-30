import { BaseDevice } from './BaseDevice.ts';
import { CVMatrixEntry } from './types.ts';

export type CvRealtimeRequester = (callback: (now: number, until: number) => boolean) => () => void;

export class CVEngine {
  private devices: Map<string, BaseDevice> = new Map();
  public matrixEntries: CVMatrixEntry[] = [];
  private realtimeStop: (() => void) | null = null;
  public liveMeterValues: Map<string, number> = new Map();
  private smoothedValues: Map<string, number> = new Map();
  private matrixRevision = 0;
  private readonly matrixSubscribers = new Set<() => void>();

  constructor(private readonly requestRealtime?: CvRealtimeRequester) {}

  /** Structural matrix notifications only — never emitted from the real-time CV tick. */
  public subscribeMatrix(callback: () => void): () => void {
    this.matrixSubscribers.add(callback);
    return () => this.matrixSubscribers.delete(callback);
  }

  public matrixVersion(): number {
    return this.matrixRevision;
  }

  private matrixChanged(): void {
    this.matrixRevision++;
    for (const callback of this.matrixSubscribers) callback();
  }

  public registerDevice(device: BaseDevice): void {
    this.devices.set(device.id, device);
    this.matrixChanged();
  }

  public unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    const removed = this.matrixEntries.filter((m) => m.sourceDeviceId === deviceId || m.targetDeviceId === deviceId);
    this.matrixEntries = this.matrixEntries.filter((m) => !removed.includes(m));
    for (const entry of removed) {
      this.liveMeterValues.delete(entry.id);
      this.smoothedValues.delete(entry.id);
    }
    this.refreshRealtimeService();
    this.matrixChanged();
  }

  public addMatrixEntry(entry: Omit<CVMatrixEntry, 'id'>): string {
    const id = `cv_entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newEntry: CVMatrixEntry = { ...entry, id };
    this.matrixEntries.push(newEntry);
    this.refreshRealtimeService();
    this.matrixChanged();
    return id;
  }

  public removeMatrixEntry(id: string): void {
    this.matrixEntries = this.matrixEntries.filter((m) => m.id !== id);
    this.liveMeterValues.delete(id);
    this.smoothedValues.delete(id);
    this.refreshRealtimeService();
    this.matrixChanged();
  }

  public updateMatrixEntry(id: string, updates: Partial<CVMatrixEntry>): void {
    const entry = this.matrixEntries.find((m) => m.id === id);
    if (entry) {
      Object.assign(entry, updates);
      this.matrixChanged();
    }
  }

  /**
   * Called by the shared AudioEngine look-ahead service (and at song-step
   * boundaries) with exponential smoothing to eliminate zipper noise.
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

      const now = audioTime ?? targetDev.ctx.currentTime;
      let rawVal = cvOut.getter(now);
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
        if (cvIn.param) {
          cvIn.param.setTargetAtTime(smoothed, now, 0.01);
        }
        if (cvIn.setter) {
          cvIn.setter(smoothed);
        }
      }
    }
  }

  /** Starts only while the rack actually contains a CV cable. */
  private refreshRealtimeService(): void {
    if (!this.requestRealtime) return;
    if (this.matrixEntries.length === 0) {
      this.realtimeStop?.();
      this.realtimeStop = null;
      return;
    }
    if (this.realtimeStop) return;
    this.realtimeStop = this.requestRealtime((now) => {
      if (this.matrixEntries.length === 0) {
        this.realtimeStop = null;
        return false;
      }
      this.tickCV(now);
      return true;
    });
  }

  public dispose(): void {
    this.matrixEntries = [];
    this.liveMeterValues.clear();
    this.smoothedValues.clear();
    this.refreshRealtimeService();
    this.devices.clear();
    this.matrixChanged();
  }
}
