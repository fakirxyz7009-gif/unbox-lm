import { BaseDevice } from '../BaseDevice.ts';

export class UniversalWorldInstrumentDevice extends BaseDevice {
  public instrumentName: string;
  public family: 'string' | 'wind';
  public resonance: number = 0.8;
  public toneColor: number = 0.55;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Acoustic Instrument', family: 'string' | 'wind' = 'string') {
    super(ctx, id, name, 'world_instrument', 2);
    this.instrumentName = name;
    this.family = family;

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.92;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.92,
      pan: 0,
      resonance: 0.8,
      toneColor: 0.55,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Pitch/Timbre CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.85, time?: number): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    this.noteOff(note, now);

    const freq = Math.max(40, Math.min(10000, 440.0 * Math.pow(2.0, (note - 69.0) / 12.0)));
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const lowerName = this.instrumentName.toLowerCase();

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);

    const filter = this.ctx.createBiquadFilter();
    const oscs: OscillatorNode[] = [];

    if (this.family === 'string') {
      const isBowed =
        lowerName.includes('violin') ||
        lowerName.includes('cello') ||
        lowerName.includes('viola') ||
        lowerName.includes('contrabass') ||
        lowerName.includes('erhu') ||
        lowerName.includes('sarangi') ||
        lowerName.includes('fiddle');
      const isSitarResonant =
        lowerName.includes('sitar') ||
        lowerName.includes('sarod') ||
        lowerName.includes('veena') ||
        lowerName.includes('tanpura') ||
        lowerName.includes('oud') ||
        lowerName.includes('bouzouki');

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        Math.min(18000, freq * (isSitarResonant ? 4.5 + this.toneColor * 6 : 3.2 + this.toneColor * 6)),
        now
      );
      filter.Q.setValueAtTime(isSitarResonant ? 3.5 + this.resonance * 4.0 : 1.5 + this.resonance * 2.5, now);

      const attack = isBowed ? 0.08 : 0.01;
      const decay = isBowed ? 2.4 : 1.8;
      gain.gain.linearRampToValueAtTime(vel * 0.85, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      osc1.stop(now + decay + 0.1);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = isSitarResonant ? 'sawtooth' : 'triangle';
      osc2.frequency.setValueAtTime(freq * (isSitarResonant ? 1.5 : 2.001), now);
      osc2.detune.setValueAtTime(isBowed ? 8 : 3, now);
      const subGain = this.ctx.createGain();
      subGain.gain.value = isSitarResonant ? 0.4 : 0.48;
      osc2.connect(subGain);
      subGain.connect(filter);
      osc2.start(now);
      osc2.stop(now + decay + 0.1);
      oscs.push(osc2);
    } else {
      const isBrass =
        lowerName.includes('trumpet') ||
        lowerName.includes('trombone') ||
        lowerName.includes('horn') ||
        lowerName.includes('tuba') ||
        lowerName.includes('bugle') ||
        lowerName.includes('cornet');
      const isReed =
        lowerName.includes('sax') ||
        lowerName.includes('clarinet') ||
        lowerName.includes('oboe') ||
        lowerName.includes('bassoon') ||
        lowerName.includes('bagpipe') ||
        lowerName.includes('accordion') ||
        lowerName.includes('harmonica') ||
        lowerName.includes('duduk') ||
        lowerName.includes('shehnai');

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(16000, freq * (isBrass ? 4.0 + this.toneColor * 5 : 3.0 + this.toneColor * 4)), now);
      filter.Q.setValueAtTime(isReed ? 2.5 : 1.8, now);

      gain.gain.linearRampToValueAtTime(vel * 0.85, now + (isBrass ? 0.03 : 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);

      const osc1 = this.ctx.createOscillator();
      osc1.type = isBrass ? 'sawtooth' : isReed ? 'square' : 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      osc1.stop(now + 2.0);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = isReed ? 'sawtooth' : 'sine';
      osc2.frequency.setValueAtTime(freq * 2.0, now);
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.35;
      osc2.connect(subGain);
      subGain.connect(filter);
      osc2.start(now);
      osc2.stop(now + 2.0);
      oscs.push(osc2);
    }

    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);

    this.activeVoices.set(note, { oscs, gain, filter });
  }

  public noteOff(note: number, time?: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    const relTime = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(relTime);
      voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.25), relTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.14);
      voice.oscs.forEach((o) => {
        try {
          o.stop(relTime + 0.16);
        } catch (e) {}
      });
    } catch (e) {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'resonance' && !isNaN(num)) this.resonance = Math.max(0.1, Math.min(1.0, num));
    if (param === 'toneColor' && !isNaN(num)) this.toneColor = Math.max(0.1, Math.min(1.0, num));
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
