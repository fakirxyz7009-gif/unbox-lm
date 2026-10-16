import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class HarmoniumDevice extends BaseDevice {
  public reedBank: 'single' | 'double' | 'triple' = 'double';
  public airReservoir: number = 0.85;
  public droneCoupling: number = 0.4;
  private masterOutput: GainNode;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Classical Harmonium') {
    super(ctx, id, name, 'harmonium', 2);

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

    const freq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 130.81);
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.6 * this.airReservoir, now + 0.05);

    const oscs: OscillatorNode[] = [];
    const ratios = this.reedBank === 'single' ? [1] : this.reedBank === 'double' ? [1, 2] : [0.5, 1, 2];

    ratios.forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * ratio, now);
      osc.connect(gain);
      osc.start(now);
      oscs.push(osc);
    });

    gain.connect(this.masterOutput);
    this.activeVoices.set(note, { oscs, gain });
  }

  public noteOff(note: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    const now = this.ctx.currentTime;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    setTimeout(() => {
      voice.oscs.forEach((o) => {
        try { o.stop(); o.disconnect(); } catch (e) {}
      });
    }, 150);
    this.activeVoices.delete(note);
  }

  public setParam(param: string, val: number): void {
    if (param === 'airReservoir') this.airReservoir = val;
    if (param === 'droneCoupling') this.droneCoupling = val;
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
