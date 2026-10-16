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

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(midiNote, time);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const osc = this.ctx.createOscillator();
    osc.type = this.params.waveform;
    osc.frequency.setValueAtTime(freq, time);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 0.5, time);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subLevel, time);
    sub.connect(subGain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(this.params.resonance, time);

    const peakCutoff = Math.min(14000, this.params.cutoff + this.params.envAmount * 5000);
    filter.frequency.setValueAtTime(peakCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, this.params.cutoff), time + this.params.decay);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(velocity * 0.9, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + this.params.decay * 1.5);

    osc.connect(filter);
    subGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc.start(time);
    sub.start(time);

    this.currentVoice = { osc, sub, filter, amp };
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    if (!this.currentVoice) return;
    try {
      this.currentVoice.amp.gain.setTargetAtTime(0.0001, time, 0.02);
      const v = this.currentVoice;
      setTimeout(() => {
        try {
          v.osc.stop();
          v.sub.stop();
          v.osc.disconnect();
          v.sub.disconnect();
          v.filter.disconnect();
          v.amp.disconnect();
        } catch (e) {}
      }, 50);
      this.currentVoice = null;
    } catch (e) {}
  }
}
