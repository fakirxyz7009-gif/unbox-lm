import { BaseDevice } from '../BaseDevice.ts';

interface FlexVoice {
  nodes: AudioNode[];
  gain: GainNode;
}

export class FlexDevice extends BaseDevice {
  private masterGain: GainNode;
  private activeVoices: Map<number, FlexVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'flex_1', name: string = 'FLEX Advanced Rompler') {
    super(ctx, id, name, 'flex', 2);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterGain);
    this.audioOutputs.set('out_r', this.masterGain);
    this.masterGain.connect(this.analyser);

    this.params = {
      preset: 'Future Bass Saw',
      macro1: 0.65, // Brightness
      macro2: 0.45, // Space / Reverb
      macro3: 0.50, // Chorus width
      macro4: 0.70, // Dynamics / punch
      attack: 0.01,
      decay: 0.4,
      sustain: 0.65,
      release: 0.5,
      volume: 0.85,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_macro1', name: 'Brightness CV', type: 'cv_in' },
    ];
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note, time);

    const baseFreq = 440 * Math.pow(2, (note - 69) / 12);
    const nodes: AudioNode[] = [];

    // Distinct preset algorithms
    const preset = this.params.preset;
    let mainNode: AudioNode;

    if (preset === 'Acoustic Pluck') {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, time);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(3000 * this.params.macro1, time);
      flt.frequency.exponentialRampToValueAtTime(300, time + 0.2);
      osc.connect(flt);
      mainNode = flt;
      nodes.push(osc, flt);
      osc.start(time);
    } else if (preset === 'Vintage EP') {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq, time);
      osc2.frequency.setValueAtTime(baseFreq * 2, time);
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.35;
      osc2.connect(g2);
      const sum = this.ctx.createGain();
      osc1.connect(sum);
      g2.connect(sum);
      mainNode = sum;
      nodes.push(osc1, osc2, g2, sum);
      osc1.start(time);
      osc2.start(time);
    } else if (preset === 'Dark Cinematic Sub') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 0.5, time);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(180, time);
      osc.connect(flt);
      mainNode = flt;
      nodes.push(osc, flt);
      osc.start(time);
    } else {
      // Future Bass Saw (default)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(baseFreq, time);
      osc2.frequency.setValueAtTime(baseFreq * 1.004, time);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(Math.min(18000, 4500 * this.params.macro1), time);
      flt.Q.setValueAtTime(3, time);
      osc1.connect(flt);
      osc2.connect(flt);
      mainNode = flt;
      nodes.push(osc1, osc2, flt);
      osc1.start(time);
      osc2.start(time);
    }

    const voiceGain = this.ctx.createGain();
    const peak = velocity * this.params.volume * 0.45;
    const att = Math.max(0.005, this.params.attack);
    const dec = Math.max(0.02, this.params.decay);
    const sus = peak * this.params.sustain;

    voiceGain.gain.setValueAtTime(0.0001, time);
    voiceGain.gain.exponentialRampToValueAtTime(peak, time + att);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), time + att + dec);

    mainNode.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    this.activeVoices.set(note, { nodes, gain: voiceGain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(note);
    if (!v) return;
    this.activeVoices.delete(note);

    const relTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.02, this.params.release);
    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        v.gain.gain.cancelScheduledValues(relTime);
        v.gain.gain.setValueAtTime(Math.max(0.001, v.gain.gain.value || 0.35), relTime);
      }
      v.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + rel);
      const stopAt = relTime + rel + 0.02;
      v.nodes.forEach((n) => {
        try {
          if ((n as any).stop) (n as any).stop(stopAt);
        } catch (e) {}
      });
    } catch (e) {}
  }
}
