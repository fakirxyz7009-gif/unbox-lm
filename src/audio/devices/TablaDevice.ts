import { BaseDevice } from '../BaseDevice.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

/**
 * TablaDevice — Multi-Sampled SoundFont (.SF2) & Physical-Modeled Indian Classical Tabla Pair (Dayan & Bayan)
 * Uses velocity-layered AudioBuffer zones (Dayan Na/Tin/Tun + Bayan Ge/Ghe with wrist Meend)
 * and full Piano Roll pitch-tracking (MIDI 24..96) with hardware clock scheduling.
 */
export class TablaDevice extends BaseDevice {
  public skinTension: number = 0.85;
  public bayanResonance: number = 0.78;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;
  private lastMidiNote: number = 60;

  constructor(ctx: AudioContext, id: string, name: string = 'Tabla (Dayan & Bayan)') {
    super(ctx, id, name, 'tabla', 2);

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 12500;
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
      skinTension: 0.85,
      bayanResonance: 0.78,
      cutoff: 12500,
      resonance: 1.2,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Tension CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Bol Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_pitch', {
      setter: (val: number) => {
        this.skinTension = Math.max(0.4, Math.min(1.5, 0.85 + val * 0.35));
      },
    });
    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.92, this.ctx.currentTime);
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const tension = Math.max(0.5, Math.min(1.5, this.skinTension || 0.85));
    const bayanRes = Math.max(0.3, Math.min(1.4, this.bayanResonance || 0.78));

    // Trigger velocity-layered SoundFont multi-sample AudioBuffer zone with skinTension tuning & Bayan Meend
    const tensionRatio = 0.85 + (tension - 0.85) * 0.45;
    soundFontEngine.triggerSampleVoice(this.ctx, 'tabla', note, vel, this.filterNode, now, {
      glideFromMidi: note < 58 ? this.lastMidiNote : undefined,
      glideDurationSec: note < 58 ? 0.09 * bayanRes : 0,
      tensionMultiplier: tensionRatio,
      sustainSec: 0.58 * bayanRes,
    });
    this.lastMidiNote = note;
  }

  public triggerPad(padIndex: number, velocity: number = 0.92, time: number = this.ctx.currentTime): void {
    const bolMidiMap = [48, 55, 60, 62, 64, 67, 69, 72];
    const note = bolMidiMap[((padIndex % bolMidiMap.length) + bolMidiMap.length) % bolMidiMap.length];
    this.noteOn(note, velocity, time);
  }

  public noteOff(_note: number, _time?: number): void {}

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'skinTension' && !isNaN(num)) {
      this.skinTension = Math.max(0.3, Math.min(1.6, num));
    } else if (param === 'bayanResonance' && !isNaN(num)) {
      this.bayanResonance = Math.max(0.2, Math.min(1.5, num));
    } else if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'cutoff' && !isNaN(num)) {
      const hz = num <= 1.5 ? 200 * Math.pow(50, Math.max(0.05, num)) : Math.max(200, Math.min(18000, num));
      this.filterNode.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
    } else if (param === 'resonance' && !isNaN(num)) {
      this.filterNode.Q.setTargetAtTime(Math.max(0.5, Math.min(12, num <= 1 ? 0.7 + num * 8 : num)), this.ctx.currentTime, 0.02);
    }
  }
}
