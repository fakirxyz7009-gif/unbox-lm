import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

export class HarmoniumDevice extends BaseDevice {
  public reedBank: 'single' | 'double' | 'triple' = 'double';
  public airReservoir: number = 0.85;
  public droneCoupling: number = 0.4;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { stop: (rel?: number) => void }> = new Map();

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

    const shrutiFreq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 130.81);
    const stdFreq = 440 * Math.pow(2, (note - 69) / 12);
    const shrutiCents = 1200 * Math.log2(Math.max(20, shrutiFreq) / Math.max(20, stdFreq));
    const effVel = Math.max(0.15, Math.min(1.0, velocity * Math.max(0.35, this.airReservoir)));

    const voice = soundFontEngine.triggerSampleVoice(
      this.ctx,
      'harmonium',
      note,
      effVel,
      this.panner || this.masterOutput,
      now,
      {
        finePitchCents: shrutiCents,
        sustainSec: 2.2,
      }
    );

    if (voice) {
      this.activeVoices.set(note, voice);
    }
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    voice.stop(time);
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
