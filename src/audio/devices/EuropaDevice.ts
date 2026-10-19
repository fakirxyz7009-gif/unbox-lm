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

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2200;
    if (n <= 1.5) return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(50, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 4.0;
    if (n <= 1.0) return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    return Math.max(0.5, Math.min(20, n));
  }

  public setParam(key: string, value: any): void {
    if (key === 'volume') {
      const v = Math.max(0, Math.min(1.5, Number(value)));
      this.params.volume = v;
      this.masterOutput.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
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
    } else if (key === 'formantFreq') {
      const hz = Math.max(120, Math.min(8000, Number(value)));
      this.params.formantFreq = hz;
      this.activeVoices.forEach((v) => {
        v.formantFilter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
      });
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (midiNote - 69) / 12)));

    // Multi-detuned wavetable oscillators for huge lush sound
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.wavetableShape;
    osc1.frequency.setValueAtTime(freq, startTime);
    osc1.detune.setValueAtTime(-this.params.unison * 15, startTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.wavetableShape === 'sawtooth' ? 'triangle' : 'sawtooth';
    osc2.frequency.setValueAtTime(freq, startTime);
    osc2.detune.setValueAtTime(this.params.unison * 15, startTime);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(Math.max(20, freq * 0.5), startTime);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subLevel, startTime);
    subOsc.connect(subGain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const formantFilter = this.ctx.createBiquadFilter();
    formantFilter.type = 'peaking';
    formantFilter.frequency.setValueAtTime(Math.max(120, Math.min(8000, this.params.formantFreq)), startTime);
    formantFilter.Q.setValueAtTime(3.0, startTime);
    formantFilter.gain.setValueAtTime(5.5, startTime);

    const amp = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    const attack = Math.max(0.008, this.params.attack);
    const decay = Math.max(0.02, this.params.decay);
    const sustain = Math.max(0.08, Math.min(1, this.params.sustain));
    const peakGain = Math.max(0.05, velocity) * 0.78;

    amp.gain.cancelScheduledValues(startTime);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * sustain), startTime + attack + decay);

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

    osc1.start(startTime);
    osc2.start(startTime);
    subOsc.start(startTime);

    this.activeVoices.set(midiNote, { osc1, osc2, subOsc, filter, formantFilter, amp, pan: pan as any });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    const relTime = Math.max(this.ctx.currentTime, time);
    const release = Math.max(0.03, Math.min(2.5, this.params.release));
    const cur = Math.max(0.001, voice.amp.gain.value || 0.25);

    try {
      voice.amp.gain.cancelScheduledValues(relTime);
      voice.amp.gain.setValueAtTime(cur, relTime);
      voice.amp.gain.exponentialRampToValueAtTime(0.0001, relTime + release);
      const stopAt = relTime + release + 0.02;
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
      voice.subOsc.stop(stopAt);
    } catch (e) {}

    setTimeout(() => {
      try {
        voice.osc1.disconnect();
        voice.osc2.disconnect();
        voice.subOsc.disconnect();
        voice.filter.disconnect();
        voice.formantFilter.disconnect();
        voice.amp.disconnect();
      } catch (e) {}
    }, Math.max(60, (relTime - this.ctx.currentTime + release) * 1000 + 80));
  }
}
