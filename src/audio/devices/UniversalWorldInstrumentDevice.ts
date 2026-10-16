import { BaseDevice } from '../BaseDevice.ts';

export class UniversalWorldInstrumentDevice extends BaseDevice {
  public instrumentName: string;
  public family: 'string' | 'wind';
  public resonance: number = 0.8;
  public toneColor: number = 0.5;
  private masterOutput: GainNode;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Acoustic Instrument', family: 'string' | 'wind' = 'string') {
    super(ctx, id, name, 'world_instrument', 2);
    this.instrumentName = name;
    this.family = family;

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.8): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(note);

    const freq = 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
    const now = this.ctx.currentTime;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);

    const filter = this.ctx.createBiquadFilter();
    const oscs: OscillatorNode[] = [];

    if (this.family === 'string') {
      // Plucked / Bowed String harmonics (e.g. guitar, violin, sitar, harp, cello)
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(20000, freq * (2 + this.toneColor * 8)), now);
      filter.Q.setValueAtTime(2.0 + this.resonance * 4.0, now);

      gain.gain.linearRampToValueAtTime(velocity * 0.75, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2.001, now);
      osc2.connect(filter);
      osc2.start(now);
      oscs.push(osc2);
    } else {
      // Aerophone / Wind harmonics (e.g. flute, bagpipe, trumpet, clarinet, accordion)
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * (1.5 + this.toneColor), now);
      filter.Q.setValueAtTime(4.0, now);

      gain.gain.linearRampToValueAtTime(velocity * 0.7, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 3.0, now);
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.2;
      osc2.connect(subGain);
      subGain.connect(filter);
      osc2.start(now);
      oscs.push(osc2);
    }

    filter.connect(gain);
    gain.connect(this.masterOutput);

    this.activeVoices.set(note, { oscs, gain, filter });
  }

  public noteOff(note: number, _time?: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    const now = this.ctx.currentTime;
    try {
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      setTimeout(() => {
        voice.oscs.forEach((o) => {
          try { o.stop(); o.disconnect(); } catch (e) {}
        });
      }, 200);
    } catch (e) {}
    this.activeVoices.delete(note);
  }

  public setParam(key: string, value: any): void {
    if (key === 'resonance') this.resonance = Number(value);
    if (key === 'toneColor') this.toneColor = Number(value);
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    }
  }
}
