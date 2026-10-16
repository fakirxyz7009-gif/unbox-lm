import { BaseDevice } from '../BaseDevice.ts';

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class ThreeOscDevice extends BaseDevice {
  private masterGain: GainNode;
  private activeVoices: Map<number, Voice> = new Map();

  constructor(ctx: AudioContext, id: string = 'three_osc_1', name: string = '3x OSC Synth') {
    super(ctx, id, name, 'three_osc', 2);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterGain);
    this.audioOutputs.set('out_r', this.masterGain);
    this.masterGain.connect(this.analyser);

    this.params = {
      osc1Type: 'sawtooth',
      osc1Coarse: 0,
      osc1Fine: 0,
      osc1Vol: 1.0,

      osc2Type: 'sawtooth',
      osc2Coarse: 0,
      osc2Fine: 7, // slight detune for fat supersaw
      osc2Vol: 0.8,

      osc3Type: 'square',
      osc3Coarse: -12, // sub-octave
      osc3Fine: -5,
      osc3Vol: 0.6,

      cutoff: 2400,
      resonance: 3.5,
      attack: 0.01,
      decay: 0.25,
      sustain: 0.7,
      release: 0.35,
      volume: 0.85,
      pan: 0,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Cutoff CV', type: 'cv_in' },
      { id: 'cv_pitch', name: 'Pitch CV', type: 'cv_in' },
    ];
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    } else if (key === 'cutoff') {
      this.activeVoices.forEach((v) => {
        v.filter.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.02);
      });
    } else if (key === 'resonance') {
      this.activeVoices.forEach((v) => {
        v.filter.Q.setTargetAtTime(value, this.ctx.currentTime, 0.02);
      });
    }
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note, time);

    const baseFreq = 440 * Math.pow(2, (note - 69) / 12);

    // Osc 1
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    const f1 = baseFreq * Math.pow(2, (this.params.osc1Coarse + this.params.osc1Fine / 100) / 12);
    osc1.frequency.setValueAtTime(f1, time);

    // Osc 2
    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    const f2 = baseFreq * Math.pow(2, (this.params.osc2Coarse + this.params.osc2Fine / 100) / 12);
    osc2.frequency.setValueAtTime(f2, time);

    // Osc 3
    const osc3 = this.ctx.createOscillator();
    osc3.type = this.params.osc3Type;
    const f3 = baseFreq * Math.pow(2, (this.params.osc3Coarse + this.params.osc3Fine / 100) / 12);
    osc3.frequency.setValueAtTime(f3, time);

    const v1Gain = this.ctx.createGain();
    v1Gain.gain.value = this.params.osc1Vol;
    osc1.connect(v1Gain);

    const v2Gain = this.ctx.createGain();
    v2Gain.gain.value = this.params.osc2Vol;
    osc2.connect(v2Gain);

    const v3Gain = this.ctx.createGain();
    v3Gain.gain.value = this.params.osc3Vol;
    osc3.connect(v3Gain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(60, this.params.cutoff), time);
    filter.Q.setValueAtTime(this.params.resonance, time);

    v1Gain.connect(filter);
    v2Gain.connect(filter);
    v3Gain.connect(filter);

    const vGain = this.ctx.createGain();
    const peak = velocity * this.params.volume * 0.4;
    const att = Math.max(0.005, this.params.attack);
    const dec = Math.max(0.01, this.params.decay);
    const sus = peak * this.params.sustain;

    vGain.gain.setValueAtTime(0.0001, time);
    vGain.gain.exponentialRampToValueAtTime(peak, time + att);
    vGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), time + att + dec);

    filter.connect(vGain);
    vGain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc3.start(time);

    this.activeVoices.set(note, { osc1, osc2, osc3, filter, gain: vGain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(note);
    if (!v) return;

    const rel = Math.max(0.02, this.params.release);
    try {
      v.gain.gain.cancelScheduledValues(time);
      v.gain.gain.setValueAtTime(v.gain.gain.value, time);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, time + rel);

      setTimeout(() => {
        try {
          v.osc1.stop();
          v.osc2.stop();
          v.osc3.stop();
          v.osc1.disconnect();
          v.osc2.disconnect();
          v.osc3.disconnect();
          v.filter.disconnect();
          v.gain.disconnect();
        } catch (e) {}
      }, rel * 1000 + 50);
    } catch (e) {}

    this.activeVoices.delete(note);
  }
}
