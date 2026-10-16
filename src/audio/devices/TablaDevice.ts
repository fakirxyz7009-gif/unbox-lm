import { BaseDevice } from '../BaseDevice.ts';

export class TablaDevice extends BaseDevice {
  public skinTension: number = 0.8;
  public bayanResonance: number = 0.7;
  private masterOutput: GainNode;

  constructor(ctx: AudioContext, id: string, name: string = 'Tabla (Dayan & Bayan)') {
    super(ctx, id, name, 'tabla', 2);

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

  public noteOn(note: number, velocity: number = 0.9): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = note < 60 ? 'sine' : 'triangle';
    const baseFreq = note < 60 ? 110 * this.bayanResonance : 293.66 * this.skinTension;
    
    osc.frequency.setValueAtTime(baseFreq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.04);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (note < 60 ? 0.6 : 0.3));

    osc.connect(gain);
    gain.connect(this.masterOutput);

    osc.start(now);
    osc.stop(now + 0.7);
  }

  public noteOff(note: number): void {}

  public setParam(param: string, val: number): void {
    if (param === 'skinTension') this.skinTension = val;
    if (param === 'bayanResonance') this.bayanResonance = val;
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
