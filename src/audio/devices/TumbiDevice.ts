import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class TumbiDevice extends BaseDevice {
  public stringTension: number = 0.9;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Tumbi Folk Resonator') {
    super(ctx, id, name, 'tumbi', 1);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.92;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.92,
      pan: 0,
      stringTension: 0.9,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Tension CV In', type: 'cv_in' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.88, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    this.noteOff(note, now);

    const freq = Math.max(80, Math.min(5000, ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 220.0) * Math.max(0.5, this.stringTension)));

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq * 1.03, now);
    osc1.frequency.exponentialRampToValueAtTime(freq, now + 0.015);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.min(9000, freq * 2.4), now);
    filter.Q.setValueAtTime(2.6, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.15, velocity) * 0.9, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.7);
    osc2.stop(now + 0.7);
    this.activeVoices.set(note, { oscs: [osc1, osc2], gain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    const relTime = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(relTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.25), relTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.12);
      voice.oscs.forEach((o) => {
        try {
          o.stop(relTime + 0.14);
        } catch (e) {}
      });
    } catch (e) {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'stringTension' && !isNaN(num)) this.stringTension = Math.max(0.5, Math.min(1.5, num));
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
