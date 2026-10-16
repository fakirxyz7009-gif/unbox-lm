/**
 * Master Control Engine, SMPTE Sync, Hardware Protocols (MCU/EuCON), Pan Laws & DSP Threading
 */
export type PanLawMode = '0dB' | '-3dB' | '-4.5dB' | '-6dB';
export type SmpteFps = '23.976' | '24' | '25' | '29.97' | '30' | '60';

export class MasterControlEngine {
  public bpm: number = 124.00;
  public ppqn: number = 960;
  public preRollBars: number = 0; // 0, 1, 2, 4
  public smpteFps: SmpteFps = '30';
  public panLaw: PanLawMode = '-3dB';
  public dspThreads: number = 8; // up to 64
  public pluginSleepActive: boolean = true;
  public mcuEnabled: boolean = false;
  public euconEnabled: boolean = false;

  constructor() {}

  public setBpm(val: number): void {
    this.bpm = Math.max(1.00, Math.min(999.99, Number(val.toFixed(2))));
  }

  public calculatePanCoefficients(pan: number): { leftGain: number; rightGain: number } {
    // pan ranges from -1.0 (left) to +1.0 (right)
    const angle = ((pan + 1) / 2) * (Math.PI / 2);
    let l = Math.cos(angle);
    let r = Math.sin(angle);

    if (this.panLaw === '-3dB') {
      l *= 0.7079;
      r *= 0.7079;
    } else if (this.panLaw === '-4.5dB') {
      l *= 0.5956;
      r *= 0.5956;
    } else if (this.panLaw === '-6dB') {
      l *= 0.5;
      r *= 0.5;
    }
    return { leftGain: l, rightGain: r };
  }
}
