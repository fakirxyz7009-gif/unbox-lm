import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

export class BansuriDevice extends BaseDevice {
  public breathPressure: number = 0.85;
  public vibratoDepth: number = 0.15;
  public meendBending: number = 0.0;
  public ragaScale: string = 'Bilawal (Major)';
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { stop: (rel?: number) => void }> = new Map();
  private lastMidiNote: number = 60;

  constructor(ctx: AudioContext, id: string, name: string = 'Bansuri Bamboo Flute') {
    super(ctx, id, name, 'bansuri', 2);

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
      breathPressure: 0.85,
      vibratoDepth: 0.15,
      meendBending: 0.0,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Meend CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_pitch', {
      setter: (val: number) => {
        this.meendBending = Math.max(-0.25, Math.min(0.25, val * 0.2));
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    this.noteOff(note, now);

    // Compute exact Shruti microtonal deviation in cents relative to 12-TET + user Meend offset
    const shrutiFreq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 261.63, this.ragaScale);
    const stdFreq = 440 * Math.pow(2, (note - 69) / 12);
    const shrutiCents = 1200 * Math.log2(Math.max(20, shrutiFreq) / Math.max(20, stdFreq));
    const meendCents = this.meendBending * 200;

    const effVel = Math.max(0.15, Math.min(1.0, velocity * Math.max(0.35, this.breathPressure)));
    const glideDur = Math.max(0.055, Math.min(0.24, 0.075 + Math.abs(this.meendBending) * 0.35));

    const voice = soundFontEngine.triggerSampleVoice(
      this.ctx,
      'bansuri',
      note,
      effVel,
      this.panner || this.masterOutput,
      now,
      {
        glideFromMidi: this.lastMidiNote,
        glideDurationSec: glideDur,
        finePitchCents: shrutiCents + meendCents,
        sustainSec: 2.6,
      }
    );

    this.lastMidiNote = note;
    if (voice) {
      this.activeVoices.set(note, voice);
    }
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const active = this.activeVoices.get(note);
    if (!active) return;
    this.activeVoices.delete(note);
    active.stop(time);
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'breathPressure' && !isNaN(num)) this.breathPressure = Math.max(0.2, Math.min(1.2, num));
    if (param === 'vibratoDepth' && !isNaN(num)) this.vibratoDepth = num;
    if (param === 'meendBending' && !isNaN(num)) this.meendBending = num;
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
