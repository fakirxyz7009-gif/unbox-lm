import { BaseDevice } from '../BaseDevice.ts';

export class UniversalPercussionElectronicDevice extends BaseDevice {
  public instrumentName: string;
  public category: 'percussion' | 'electronic';
  public brilliance: number = 0.7;
  public decay: number = 0.5;
  private masterOutput: GainNode;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Percussion/Electronic Instrument', category: 'percussion' | 'electronic' = 'percussion') {
    super(ctx, id, name, 'percussion_electronic', 2);
    this.instrumentName = name;
    this.category = category;

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

    if (this.category === 'percussion') {
      // Tuned/Untuned Percussion (marimba, xylophone, steelpan, glockenspiel, gong, tabla, etc.)
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq * 1.5, now);
      filter.Q.setValueAtTime(5.0 + this.brilliance * 10.0, now);

      gain.gain.linearRampToValueAtTime(velocity * 0.9, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1 + (this.decay * 1.5));

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2.76, now); // Inharmonic metallic overtone
      const metalGain = this.ctx.createGain();
      metalGain.gain.value = 0.4;
      osc2.connect(metalGain);
      metalGain.connect(filter);
      osc2.start(now);
      oscs.push(osc2);
    } else {
      // Keyboards & Electronic Instruments (Theremin, Mellotron, Clavinet, Synthesizer, EWI, etc.)
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(18000, freq * (3.0 + this.brilliance * 5.0)), now);
      filter.Q.setValueAtTime(3.0, now);

      gain.gain.linearRampToValueAtTime(velocity * 0.8, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

      const osc1 = this.ctx.createOscillator();
      // Theremin uses pure sine/triangle pitch sweep; Mellotron/Clavinet uses sawtooth/square
      osc1.type = this.instrumentName.toLowerCase().includes('theremin') ? 'sine' : 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 1.002, now); // Chorus detune
      const chorusGain = this.ctx.createGain();
      chorusGain.gain.value = 0.3;
      osc2.connect(chorusGain);
      chorusGain.connect(filter);
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
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      setTimeout(() => {
        voice.oscs.forEach((o) => {
          try { o.stop(); o.disconnect(); } catch (e) {}
        });
      }, 150);
    } catch (e) {}
    this.activeVoices.delete(note);
  }

  public setParam(key: string, value: any): void {
    if (key === 'brilliance') this.brilliance = Number(value);
    if (key === 'decay') this.decay = Number(value);
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    }
  }
}
