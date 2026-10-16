import { BaseDevice } from '../BaseDevice.ts';

export class DholDevice extends BaseDevice {
  public punchTension: number = 0.85;
  private masterOutput: GainNode;

  constructor(ctx: AudioContext, id: string, name: string = 'Dhol Folk Drum') {
    super(ctx, id, name, 'dhol', 2);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.9;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.95): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140 * this.punchTension, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterOutput);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  public noteOff(note: number): void {}

  public setParam(param: string, val: number): void {
    if (param === 'punchTension') this.punchTension = val;
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
