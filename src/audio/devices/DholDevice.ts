import { BaseDevice } from '../BaseDevice.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

/**
 * DholDevice — Multi-Sampled SoundFont (.SF2) Dual-Headed Punjabi Folk Dhol Drum (Bass Dugga & High Tilli)
 * Supports full Piano Roll pitch-tracking, scheduled lookahead timing, velocity layering,
 * and full Mixer/Sequencer synchronization.
 */
export class DholDevice extends BaseDevice {
  public punchTension: number = 0.88;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;

  constructor(ctx: AudioContext, id: string, name: string = 'Dhol Folk Drum') {
    super(ctx, id, name, 'dhol', 2);

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 12000;
    this.filterNode.Q.value = 1.2;

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.95;

    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.filterNode.connect(this.panner);
      this.panner.connect(this.masterOutput);
    } else {
      this.filterNode.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.95,
      pan: 0,
      punchTension: 0.88,
      cutoff: 12000,
      resonance: 1.2,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_gate', name: 'Dhol Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.95, this.ctx.currentTime);
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.95, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const tension = Math.max(0.5, Math.min(1.5, this.punchTension || 0.88));

    soundFontEngine.triggerSampleVoice(this.ctx, 'dhol', note, vel, this.filterNode, now, {
      tensionMultiplier: 0.85 + (tension - 0.88) * 0.4,
      sustainSec: 0.52,
    });
  }

  public triggerPad(padIndex: number, velocity: number = 0.95, time: number = this.ctx.currentTime): void {
    const notes = [48, 52, 55, 60, 64, 67, 72, 76];
    this.noteOn(notes[((padIndex % notes.length) + notes.length) % notes.length], velocity, time);
  }

  public noteOff(_note: number, _time?: number): void {}

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'punchTension' && !isNaN(num)) {
      this.punchTension = Math.max(0.4, Math.min(1.6, num));
    } else if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'cutoff' && !isNaN(num)) {
      const hz = num <= 1.5 ? 200 * Math.pow(50, Math.max(0.05, num)) : Math.max(200, Math.min(18000, num));
      this.filterNode.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
    }
  }
}
