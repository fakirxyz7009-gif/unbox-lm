import { BaseDevice } from '../BaseDevice.ts';

interface ActiveVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  subOsc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class SubtractorDevice extends BaseDevice {
  private masterOutput: GainNode;
  private activeVoices: Map<number, ActiveVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'subtractor_1', name: string = 'Subtractor Analog Synth') {
    super(ctx, id, name, 'subtractor', 2);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.8;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      osc1Type: 'sawtooth',
      osc1Octave: 0,
      osc2Type: 'square',
      osc2Octave: -1,
      osc2Detune: 8, // cents
      subOscLevel: 0.35,
      cutoff: 1400,
      resonance: 4.5,
      filterType: 'lowpass',
      attack: 0.02,
      decay: 0.3,
      sustain: 0.6,
      release: 0.4,
      volume: 0.8,
      glide: 0.03,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in', description: 'Modulates filter frequency' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in', description: 'Modulates 1V/Oct pitch' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in', description: 'Triggers envelope attack' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        // Modulate current cutoff
        const mod = Math.pow(2, amount * 3);
        const base = this.params.cutoff;
        const target = Math.min(20000, Math.max(40, base * mod));
        this.activeVoices.forEach((v) => {
          v.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_pitch', {
      setter: (semitones: number) => {
        this.activeVoices.forEach((v) => {
          v.osc1.detune.setValueAtTime(semitones * 100, this.ctx.currentTime);
          v.osc2.detune.setValueAtTime(semitones * 100 + this.params.osc2Detune, this.ctx.currentTime);
        });
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) {
          this.noteOn(60, 0.9);
        } else {
          this.noteOff(60);
        }
      },
    });
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    } else if (key === 'cutoff') {
      this.activeVoices.forEach((v) => {
        v.filter.frequency.setTargetAtTime(Number(value), this.ctx.currentTime, 0.02);
      });
    } else if (key === 'resonance') {
      this.activeVoices.forEach((v) => {
        v.filter.Q.setTargetAtTime(Number(value), this.ctx.currentTime, 0.02);
      });
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.8, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(midiNote, time);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const osc1Freq = freq * Math.pow(2, this.params.osc1Octave);
    const osc2Freq = freq * Math.pow(2, this.params.osc2Octave);
    const subFreq = freq * 0.5;

    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    osc1.frequency.setValueAtTime(osc1Freq, time);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    osc2.frequency.setValueAtTime(osc2Freq, time);
    osc2.detune.setValueAtTime(this.params.osc2Detune, time);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(subFreq, time);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subOscLevel, time);
    subOsc.connect(subGain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = this.params.filterType;
    filter.frequency.setValueAtTime(Math.max(40, this.params.cutoff), time);
    filter.Q.setValueAtTime(this.params.resonance, time);

    // Filter envelope sweep
    const attack = Math.max(0.005, this.params.attack);
    const decay = Math.max(0.01, this.params.decay);
    const sustain = Math.max(0.05, Math.min(1, this.params.sustain));

    filter.frequency.cancelScheduledValues(time);
    filter.frequency.setValueAtTime(Math.max(40, this.params.cutoff * 0.5), time);
    filter.frequency.linearRampToValueAtTime(Math.min(18000, this.params.cutoff * 2.5), time + attack);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, this.params.cutoff * sustain), time + attack + decay);

    const vca = this.ctx.createGain();
    vca.gain.cancelScheduledValues(time);
    vca.gain.setValueAtTime(0.0001, time);
    vca.gain.linearRampToValueAtTime(velocity * 0.8, time + attack);
    vca.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * 0.8 * sustain), time + attack + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    subGain.connect(filter);

    filter.connect(vca);
    vca.connect(this.masterOutput);

    osc1.start(time);
    osc2.start(time);
    subOsc.start(time);

    this.activeVoices.set(midiNote, { osc1, osc2, subOsc, gain: vca, filter });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    const release = Math.max(0.02, this.params.release);
    const currentGain = Math.max(0.0001, voice.gain.gain.value);

    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(currentGain, time);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + release);

    setTimeout(() => {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.subOsc.stop();
        voice.osc1.disconnect();
        voice.osc2.disconnect();
        voice.subOsc.disconnect();
        voice.filter.disconnect();
        voice.gain.disconnect();
      } catch (e) {}
    }, release * 1000 + 100);

    this.activeVoices.delete(midiNote);
  }
}
