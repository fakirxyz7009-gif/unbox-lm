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

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2400;
    if (n <= 1.5) return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(40, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 3.5;
    if (n <= 1.0) return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    return Math.max(0.5, Math.min(20, n));
  }

  public setParam(key: string, value: any): void {
    if (key === 'volume') {
      const v = Math.max(0, Math.min(1.5, Number(value)));
      this.params.volume = v;
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    } else if (key === 'cutoff') {
      const hz = this.resolveCutoffHz(value);
      this.params.cutoff = hz;
      this.activeVoices.forEach((v) => {
        v.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
      });
    } else if (key === 'resonance') {
      const q = this.resolveResonanceQ(value);
      this.params.resonance = q;
      this.activeVoices.forEach((v) => {
        v.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.02);
      });
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(note, startTime);

    const baseFreq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (note - 69) / 12)));

    // Osc 1
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    const f1 = Math.max(20, Math.min(18000, baseFreq * Math.pow(2, (this.params.osc1Coarse + this.params.osc1Fine / 100) / 12)));
    osc1.frequency.setValueAtTime(f1, startTime);

    // Osc 2
    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    const f2 = Math.max(20, Math.min(18000, baseFreq * Math.pow(2, (this.params.osc2Coarse + this.params.osc2Fine / 100) / 12)));
    osc2.frequency.setValueAtTime(f2, startTime);

    // Osc 3
    const osc3 = this.ctx.createOscillator();
    osc3.type = this.params.osc3Type;
    const f3 = Math.max(20, Math.min(18000, baseFreq * Math.pow(2, (this.params.osc3Coarse + this.params.osc3Fine / 100) / 12)));
    osc3.frequency.setValueAtTime(f3, startTime);

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
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    v1Gain.connect(filter);
    v2Gain.connect(filter);
    v3Gain.connect(filter);

    const vGain = this.ctx.createGain();
    const peak = Math.max(0.05, velocity) * this.params.volume * 0.45;
    const att = Math.max(0.005, this.params.attack);
    const dec = Math.max(0.015, this.params.decay);
    const sus = Math.max(0.001, peak * this.params.sustain);

    vGain.gain.setValueAtTime(0.0001, startTime);
    vGain.gain.linearRampToValueAtTime(peak, startTime + att);
    vGain.gain.exponentialRampToValueAtTime(sus, startTime + att + dec);

    filter.connect(vGain);
    vGain.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    this.activeVoices.set(note, { osc1, osc2, osc3, filter, gain: vGain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(note);
    if (!v) return;
    this.activeVoices.delete(note);

    const relTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.03, Math.min(2.5, this.params.release));
    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        v.gain.gain.cancelScheduledValues(relTime);
        v.gain.gain.setValueAtTime(Math.max(0.001, v.gain.gain.value || 0.35), relTime);
      }
      v.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + rel);
      const stopAt = relTime + rel + 0.02;
      v.osc1.stop(stopAt);
      v.osc2.stop(stopAt);
      v.osc3.stop(stopAt);
    } catch (e) {}
  }
}
