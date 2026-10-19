import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class HarmoniumDevice extends BaseDevice {
  public reedBank: 'single' | 'double' | 'triple' = 'double';
  public airReservoir: number = 0.85;
  public droneCoupling: number = 0.4;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Classical Harmonium') {
    super(ctx, id, name, 'harmonium', 2);

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
      airReservoir: 0.85,
      droneCoupling: 0.4,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_bellows', name: 'Bellows CV In', type: 'cv_in' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    this.noteOff(note, now);

    const freq = Math.max(45, Math.min(6000, ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 130.81)));
    const gain = this.ctx.createGain();
    const peak = Math.max(0.1, velocity) * 0.65 * Math.max(0.3, this.airReservoir);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(peak * 0.8, now + 0.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 5.0), now);

    const oscs: OscillatorNode[] = [];
    const ratios = this.reedBank === 'single' ? [1] : this.reedBank === 'double' ? [1, 2] : [0.5, 1, 2];

    ratios.forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * ratio, now);
      osc.detune.setValueAtTime((idx - 0.5) * 5, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 2.6);
      oscs.push(osc);
    });

    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);
    this.activeVoices.set(note, { oscs, gain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    const relTime = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    try {
      voice.gain.gain.cancelScheduledValues(relTime);
      voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.25), relTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.14);
      voice.oscs.forEach((o) => {
        try {
          o.stop(relTime + 0.16);
        } catch (e) {}
      });
    } catch (e) {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'airReservoir' && !isNaN(num)) this.airReservoir = Math.max(0.2, Math.min(1.2, num));
    if (param === 'droneCoupling' && !isNaN(num)) this.droneCoupling = num;
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
