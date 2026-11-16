/**
 * Plays pads of a recorded kit without adding anything to the project: the device is built outside
 * the rack (`createDeviceOnContext`) and routed straight into the monitor's click / audition input,
 * so the master chain, exports and undo history are untouched.
 */
import { audioEngine } from './AudioEngine.ts';
import type { BaseDevice } from './BaseDevice.ts';
import { installLevelTrim } from './levelTrim.ts';
import type { DeviceType } from './types.ts';

/** Audition level into the monitor; the pad's own level trim is applied on the device. */
const AUDITION_GAIN = 0.32;

export class KitAudition {
  private device: BaseDevice | null = null;
  private gain: GainNode | null = null;
  private type: DeviceType | null = null;
  /** Bumped per load so a pack that finishes late cannot connect over a newer kit. */
  private token = 0;

  /** The kit whose samples are ready, if any. */
  public get readyType(): DeviceType | null {
    return this.device ? this.type : null;
  }

  public async load(type: DeviceType): Promise<void> {
    if (this.device && this.type === type) return;
    this.dispose();
    const token = ++this.token;
    await audioEngine.resumeContext();
    if (token !== this.token) return;

    const ctx = audioEngine.ctx;
    const device = audioEngine.createDeviceOnContext(ctx, type, `audition_${type}_${token}`, 'Kit audition');
    device.isPowered = true;
    installLevelTrim(device);
    const gain = ctx.createGain();
    gain.gain.value = AUDITION_GAIN;
    gain.connect(audioEngine.monitor.clickInput);
    for (const id of ['out_l', 'out_r']) device.audioOutputs.get(id)?.connect(gain);
    this.device = device;
    this.gain = gain;
    this.type = type;

    await device.ready?.();
    if (token !== this.token) return;
  }

  /** Triggers one pad at `time` (default: just after now). The kits are one-shots, so no note-off. */
  public tap(note: number, velocity = 0.9, time?: number): void {
    this.device?.noteOn(note, velocity, time ?? audioEngine.ctx.currentTime + 0.005);
  }

  public dispose(): void {
    this.token += 1;
    const device = this.device;
    const gain = this.gain;
    this.device = null;
    this.gain = null;
    this.type = null;
    for (const id of ['out_l', 'out_r']) {
      try {
        device?.audioOutputs.get(id)?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    try {
      gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      device?.dispose();
    } catch {
      /* already disposed */
    }
  }
}
