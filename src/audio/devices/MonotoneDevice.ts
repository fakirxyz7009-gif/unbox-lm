import { BaseDevice } from '../BaseDevice.ts';

export class MonotoneDevice extends BaseDevice {
  private masterOutput: GainNode;
  private currentVoice: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; amp: GainNode } | null = null;

  constructor(ctx: AudioContext, id: string = 'monotone_1', name: string = 'Monotone Bass Synth') {
    super(ctx, id, name, 'monotone', 1);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.9;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      waveform: 'sawtooth', // sawtooth, square
      cutoff: 480,
      resonance: 6.0,
      envAmount: 0.8,
      decay: 0.28,
      drive: 3.5,
      subLevel: 0.5,
      glide: 0.04,
      volume: 0.9,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(18000, Math.max(30, this.params.cutoff * mod));
        if (this.currentVoice) {
          this.currentVoice.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        }
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(36, 1.0);
        else this.noteOff(36);
      },
    });
  }

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 480;
    if (n <= 1.5) return Math.round(55 * Math.pow(220, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(35, Math.min(16000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 6.0;
    if (n <= 1.0) return 1.0 + Math.max(0, Math.min(1, n)) * 14.0;
    return Math.max(0.5, Math.min(20, n));
  }

  public setParam(key: string, value: any): void {
    if (key === 'volume') {
      const v = Math.max(0, Math.min(1.5, Number(value)));
      this.params.volume = v;
      this.masterOutput.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    } else if (key === 'cutoff') {
      this.params.cutoff = this.resolveCutoffHz(value);
      if (this.currentVoice) {
        this.currentVoice.filter.frequency.setTargetAtTime(this.params.cutoff, this.ctx.currentTime, 0.02);
      }
    } else if (key === 'resonance') {
      this.params.resonance = this.resolveResonanceQ(value);
      if (this.currentVoice) {
        this.currentVoice.filter.Q.setTargetAtTime(this.params.resonance, this.ctx.currentTime, 0.02);
      }
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(16000, 440 * Math.pow(2, (midiNote - 69) / 12)));

    const osc = this.ctx.createOscillator();
    osc.type = this.params.waveform;
    osc.frequency.setValueAtTime(freq, startTime);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(Math.max(20, freq * 0.5), startTime);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subLevel, startTime);
    sub.connect(subGain);

    const baseCutoff = this.resolveCutoffHz(this.params.cutoff);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const decay = Math.max(0.05, this.params.decay);
    const peakCutoff = Math.min(15000, baseCutoff + this.params.envAmount * 4500);
    filter.frequency.setValueAtTime(peakCutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, baseCutoff), startTime + decay);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(Math.max(0.05, velocity) * 0.88, startTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + decay * 1.6);

    osc.connect(filter);
    subGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc.start(startTime);
    sub.start(startTime);

    this.currentVoice = { osc, sub, filter, amp };
  }

  public noteOff(_midiNote: number, time: number = this.ctx.currentTime): void {
    if (!this.currentVoice) return;
    const v = this.currentVoice;
    this.currentVoice = null;
    const relTime = Math.max(this.ctx.currentTime, time);
    try {
      v.amp.gain.cancelScheduledValues(relTime);
      v.amp.gain.setTargetAtTime(0.0001, relTime, 0.02);
      v.osc.stop(relTime + 0.08);
      v.sub.stop(relTime + 0.08);
      setTimeout(() => {
        try {
          v.osc.disconnect();
          v.sub.disconnect();
          v.filter.disconnect();
          v.amp.disconnect();
        } catch (e) {}
      }, Math.max(60, (relTime - this.ctx.currentTime) * 1000 + 100));
    } catch (e) {}
  }
}
