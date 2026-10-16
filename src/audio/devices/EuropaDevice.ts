import { BaseDevice } from '../BaseDevice.ts';

interface EuropaVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  subOsc: OscillatorNode;
  filter: BiquadFilterNode;
  formantFilter: BiquadFilterNode;
  amp: GainNode;
  pan: StereoPannerNode;
}

export class EuropaDevice extends BaseDevice {
  private masterOutput: GainNode;
  private activeVoices: Map<number, EuropaVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'europa_1', name: string = 'Europa Wavetable Synth') {
    super(ctx, id, name, 'europa', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.8;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      wavetableShape: 'sawtooth', // sawtooth, triangle, square
      morph: 0.6,
      harmonics: 1.5,
      subLevel: 0.4,
      unison: 0.7,
      cutoff: 2200,
      resonance: 4.0,
      formantFreq: 1100,
      drive: 2.0,
      attack: 0.08,
      decay: 0.8,
      sustain: 0.7,
      release: 1.2,
      volume: 0.85,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in' },
      { id: 'cv_morph', name: 'Wavetable Morph CV In', type: 'cv_in' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(20000, Math.max(50, this.params.cutoff * mod));
        this.activeVoices.forEach((v) => {
          v.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_morph', {
      setter: (amount: number) => {
        this.setParam('morph', Math.min(1, Math.max(0, this.params.morph + amount * 0.5)));
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.9);
        else this.noteOff(60);
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
    } else if (key === 'formantFreq') {
      this.activeVoices.forEach((v) => {
        v.formantFilter.frequency.setTargetAtTime(Number(value), this.ctx.currentTime, 0.02);
      });
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.8, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(midiNote, time);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    // Multi-detuned wavetable oscillators for huge lush sound
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.wavetableShape;
    osc1.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-this.params.unison * 15, time);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.wavetableShape === 'sawtooth' ? 'triangle' : 'sawtooth';
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(this.params.unison * 15, time);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 0.5, time);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subLevel, time);
    subOsc.connect(subGain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.params.cutoff, time);
    filter.Q.setValueAtTime(this.params.resonance, time);

    const formantFilter = this.ctx.createBiquadFilter();
    formantFilter.type = 'peaking';
    formantFilter.frequency.setValueAtTime(this.params.formantFreq, time);
    formantFilter.Q.setValueAtTime(3.0, time);
    formantFilter.gain.setValueAtTime(6.0, time);

    const amp = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    const attack = Math.max(0.01, this.params.attack);
    const decay = Math.max(0.02, this.params.decay);
    const sustain = Math.max(0.05, Math.min(1, this.params.sustain));

    amp.gain.cancelScheduledValues(time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(velocity * 0.8, time + attack);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * 0.8 * sustain), time + attack + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    subGain.connect(filter);
    filter.connect(formantFilter);
    formantFilter.connect(amp);

    if (pan) {
      amp.connect(pan);
      pan.connect(this.masterOutput);
    } else {
      amp.connect(this.masterOutput);
    }

    osc1.start(time);
    osc2.start(time);
    subOsc.start(time);

    this.activeVoices.set(midiNote, { osc1, osc2, subOsc, filter, formantFilter, amp, pan: pan as any });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    const release = Math.max(0.02, this.params.release);
    const cur = Math.max(0.0001, voice.amp.gain.value);

    voice.amp.gain.cancelScheduledValues(time);
    voice.amp.gain.setValueAtTime(cur, time);
    voice.amp.gain.exponentialRampToValueAtTime(0.0001, time + release);

    setTimeout(() => {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.subOsc.stop();
        voice.osc1.disconnect();
        voice.osc2.disconnect();
        voice.subOsc.disconnect();
        voice.filter.disconnect();
        voice.formantFilter.disconnect();
        voice.amp.disconnect();
      } catch (e) {}
    }, release * 1000 + 100);

    this.activeVoices.delete(midiNote);
  }
}
