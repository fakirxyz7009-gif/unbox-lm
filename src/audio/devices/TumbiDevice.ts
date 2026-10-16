import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class TumbiDevice extends BaseDevice {
  public stringTension: number = 0.9;
  private masterOutput: GainNode;
  private activeVoices: Map<number, { osc: OscillatorNode; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Tumbi Folk Resonator') {
    super(ctx, id, name, 'tumbi', 1);

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

  public noteOn(note: number, velocity: number = 0.85): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note);

    const freq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 329.63); // E4 high tumbi string
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(300, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.8, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterOutput);

    osc.start(now);
    this.activeVoices.set(note, { osc, gain });
  }

  public noteOff(note: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    const now = this.ctx.currentTime;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    setTimeout(() => {
      try { voice.osc.stop(); voice.osc.disconnect(); } catch (e) {}
    }, 120);
    this.activeVoices.delete(note);
  }

  public setParam(param: string, val: number): void {
    if (param === 'stringTension') this.stringTension = val;
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
