import { BaseDevice } from './BaseDevice.ts';
import { CVMatrixEntry } from './types.ts';

export class CVEngine {
  private devices: Map<string, BaseDevice> = new Map();
  public matrixEntries: CVMatrixEntry[] = [];
  private loopId: number = 0;
  public liveMeterValues: Map<string, number> = new Map();

  constructor() {
    this.startLoop();
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
  }

  public updateMatrixEntry(id: string, updates: Partial<CVMatrixEntry>): void {
    const entry = this.matrixEntries.find((m) => m.id === id);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  private startLoop(): void {
    const tick = () => {
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

        const finalVal = rawVal * entry.amount + entry.offset;
        this.liveMeterValues.set(entry.id, finalVal);

        // Apply to target device CV input setter
        const cvIn = targetDev.cvInputs.get(entry.targetParam);
        if (cvIn && cvIn.setter) {
          cvIn.setter(finalVal);
        }
      }

      this.loopId = requestAnimationFrame(tick);
    };

    this.loopId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    cancelAnimationFrame(this.loopId);
  }
}
