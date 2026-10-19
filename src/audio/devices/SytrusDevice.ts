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

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 3500;
    if (n <= 1.5) return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(50, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2.5;
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
    const carFreq = Math.max(20, Math.min(18000, baseFreq * this.params.carrierRatio));
    const modFreq = Math.max(20, Math.min(18000, baseFreq * this.params.modRatio));

    // Carrier
    const carrier = this.ctx.createOscillator();
    carrier.type = this.params.carrierShape;
    carrier.frequency.setValueAtTime(carFreq, startTime);

    // Modulator
    const modulator = this.ctx.createOscillator();
    modulator.type = this.params.modShape;
    modulator.frequency.setValueAtTime(modFreq, startTime);

    // Modulator depth
    const modGain = this.ctx.createGain();
    const effectiveFm = this.params.fmDepth * Math.max(0.1, velocity);
    modGain.gain.setValueAtTime(effectiveFm, startTime);

    // Connect modulator to carrier frequency (FM synthesis)
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);
    carrier.connect(filter);

    const voiceGain = this.ctx.createGain();
    const peak = Math.max(0.05, velocity) * this.params.volume * 0.45;
    const att = Math.max(0.005, this.params.attack);
    const dec = Math.max(0.02, this.params.decay);
    const sus = Math.max(0.001, peak * this.params.sustain);

    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(peak, startTime + att);
    voiceGain.gain.exponentialRampToValueAtTime(sus, startTime + att + dec);

    filter.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    modulator.start(startTime);
    carrier.start(startTime);

    this.activeVoices.set(note, { carrier, modulator, modGain, filter, voiceGain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(note);
    if (!v) return;
    this.activeVoices.delete(note);

    const relTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.03, Math.min(2.5, this.params.release));
    try {
      v.voiceGain.gain.cancelScheduledValues(relTime);
      v.voiceGain.gain.setValueAtTime(Math.max(0.001, v.voiceGain.gain.value || 0.25), relTime);
      v.voiceGain.gain.exponentialRampToValueAtTime(0.0001, relTime + rel);
      const stopAt = relTime + rel + 0.02;
      v.carrier.stop(stopAt);
      v.modulator.stop(stopAt);
    } catch (e) {}

    setTimeout(() => {
      try {
        v.carrier.disconnect();
        v.modulator.disconnect();
        v.modGain.disconnect();
        v.filter.disconnect();
        v.voiceGain.disconnect();
      } catch (e) {}
    }, Math.max(60, (relTime - this.ctx.currentTime + rel) * 1000 + 80));
  }
}
