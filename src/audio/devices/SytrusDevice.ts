import { BaseDevice } from '../BaseDevice.ts';

interface SytrusVoice {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode;
  filter: BiquadFilterNode;
  voiceGain: GainNode;
}

export class SytrusDevice extends BaseDevice {
  private masterGain: GainNode;
  private activeVoices: Map<number, SytrusVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'sytrus_1', name: string = 'Sytrus FM Synth') {
    super(ctx, id, name, 'sytrus', 2);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterGain);
    this.audioOutputs.set('out_r', this.masterGain);
    this.masterGain.connect(this.analyser);

    this.params = {
      carrierRatio: 1, // 1x root
      modRatio: 2,     // 2x octave harmonic
      fmDepth: 350,    // FM modulation index Hz
      modShape: 'sine',
      carrierShape: 'sine',
      feedback: 0.15,
      cutoff: 3500,
      resonance: 2.5,
      attack: 0.015,
      decay: 0.35,
      sustain: 0.6,
      release: 0.45,
      volume: 0.85,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Cutoff CV', type: 'cv_in' },
      { id: 'cv_fm', name: 'FM Depth CV', type: 'cv_in' },
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
    }
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note, time);

    const baseFreq = 440 * Math.pow(2, (note - 69) / 12);
    const carFreq = baseFreq * this.params.carrierRatio;
    const modFreq = baseFreq * this.params.modRatio;

    // Carrier
    const carrier = this.ctx.createOscillator();
    carrier.type = this.params.carrierShape;
    carrier.frequency.setValueAtTime(carFreq, time);

    // Modulator
    const modulator = this.ctx.createOscillator();
    modulator.type = this.params.modShape;
    modulator.frequency.setValueAtTime(modFreq, time);

    // Modulator depth
    const modGain = this.ctx.createGain();
    const effectiveFm = this.params.fmDepth * velocity;
    modGain.gain.setValueAtTime(effectiveFm, time);

    // Connect modulator to carrier frequency (FM synthesis)
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.params.cutoff, time);
    filter.Q.setValueAtTime(this.params.resonance, time);
    carrier.connect(filter);

    const voiceGain = this.ctx.createGain();
    const peak = velocity * this.params.volume * 0.45;
    const att = Math.max(0.005, this.params.attack);
    const dec = Math.max(0.02, this.params.decay);
    const sus = peak * this.params.sustain;

    voiceGain.gain.setValueAtTime(0.0001, time);
    voiceGain.gain.exponentialRampToValueAtTime(peak, time + att);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), time + att + dec);

    filter.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    modulator.start(time);
    carrier.start(time);

    this.activeVoices.set(note, { carrier, modulator, modGain, filter, voiceGain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(note);
    if (!v) return;

    const rel = Math.max(0.02, this.params.release);
    try {
      v.voiceGain.gain.cancelScheduledValues(time);
      v.voiceGain.gain.setValueAtTime(v.voiceGain.gain.value, time);
      v.voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + rel);

      setTimeout(() => {
        try {
          v.carrier.stop();
          v.modulator.stop();
          v.carrier.disconnect();
          v.modulator.disconnect();
          v.modGain.disconnect();
          v.filter.disconnect();
          v.voiceGain.disconnect();
        } catch (e) {}
      }, rel * 1000 + 50);
    } catch (e) {}

    this.activeVoices.delete(note);
  }
}
