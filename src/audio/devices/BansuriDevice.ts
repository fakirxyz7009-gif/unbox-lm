import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class BansuriDevice extends BaseDevice {
  public breathPressure: number = 0.75;
  public vibratoDepth: number = 0.15;
  public meendBending: number = 0.0;
  public ragaScale: string = 'Bilawal (Major)';
  private masterOutput: GainNode;
  private activeOscs: Map<number, { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Bansuri Bamboo Flute') {
    super(ctx, id, name, 'bansuri', 2);

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

  public noteOn(note: number, velocity: number = 0.8): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note);

    const freq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 261.63, this.ragaScale) * (1 + this.meendBending);
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 2, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(velocity * 0.7 * this.breathPressure, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterOutput);

    osc.start(now);
    this.activeOscs.set(note, { osc, gain, filter });
  }

  public noteOff(note: number, _time?: number): void {
    const active = this.activeOscs.get(note);
    if (!active) return;
    const now = this.ctx.currentTime;
    active.gain.gain.setValueAtTime(active.gain.gain.value, now);
    active.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    setTimeout(() => {
      try {
        active.osc.stop();
        active.osc.disconnect();
      } catch (e) {}
    }, 250);
    this.activeOscs.delete(note);
  }

  public setParam(param: string, val: number): void {
    if (param === 'breathPressure') this.breathPressure = val;
    if (param === 'vibratoDepth') this.vibratoDepth = val;
    if (param === 'meendBending') this.meendBending = val;
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
