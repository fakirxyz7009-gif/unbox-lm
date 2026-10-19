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

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 1400;
    if (n <= 1.5) {
      // Normalized 0..1 from Sequencer / LFO -> Logarithmic 60Hz..15600Hz
      return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    }
    return Math.max(40, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 4.5;
    if (n <= 1.0) {
      return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    }
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
    } else {
      this.params[key] = value;
    }
  }

  private lastFreq: number = 0;

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (midiNote - 69) / 12)));
    const prevFreq = this.lastFreq > 0 ? this.lastFreq : freq;
    const glideTime = Math.max(0.005, Math.min(0.35, Number(this.params.glide) || 0.03));
    this.lastFreq = freq;

    const osc1Freq = Math.max(20, Math.min(18000, freq * Math.pow(2, this.params.osc1Octave)));
    const osc2Freq = Math.max(20, Math.min(18000, freq * Math.pow(2, this.params.osc2Octave)));
    const subFreq = Math.max(20, freq * 0.5);

    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    osc1.frequency.setValueAtTime(Math.max(20, prevFreq * Math.pow(2, this.params.osc1Octave)), startTime);
    if (prevFreq !== freq) osc1.frequency.exponentialRampToValueAtTime(osc1Freq, startTime + glideTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    osc2.frequency.setValueAtTime(Math.max(20, prevFreq * Math.pow(2, this.params.osc2Octave)), startTime);
    if (prevFreq !== freq) osc2.frequency.exponentialRampToValueAtTime(osc2Freq, startTime + glideTime);
    osc2.detune.setValueAtTime(this.params.osc2Detune, startTime);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(Math.max(20, prevFreq * 0.5), startTime);
    if (prevFreq !== freq) subOsc.frequency.exponentialRampToValueAtTime(subFreq, startTime + glideTime);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(this.params.subOscLevel, startTime);
    subOsc.connect(subGain);

    const baseCutoff = this.resolveCutoffHz(this.params.cutoff);
    const filter = this.ctx.createBiquadFilter();
    filter.type = this.params.filterType;
    filter.frequency.setValueAtTime(baseCutoff, startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    // Filter envelope sweep for punchy techno analog bite
    const attack = Math.max(0.004, this.params.attack);
    const decay = Math.max(0.02, this.params.decay);
    const sustain = Math.max(0.08, Math.min(1, this.params.sustain));

    filter.frequency.cancelScheduledValues(startTime);
    filter.frequency.setValueAtTime(Math.max(60, baseCutoff * 0.65), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.min(18000, baseCutoff * 2.6), startTime + attack);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, baseCutoff * Math.max(0.35, sustain)), startTime + attack + decay);

    const vca = this.ctx.createGain();
    const peakGain = Math.max(0.05, Math.min(1.0, velocity)) * 0.75;
    vca.gain.cancelScheduledValues(startTime);
    vca.gain.setValueAtTime(0.0001, startTime);
    vca.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    vca.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * sustain), startTime + attack + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    subGain.connect(filter);

    filter.connect(vca);
    vca.connect(this.masterOutput);

    osc1.start(startTime);
    osc2.start(startTime);
    subOsc.start(startTime);

    this.activeVoices.set(midiNote, { osc1, osc2, subOsc, gain: vca, filter });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    const relTime = Math.max(this.ctx.currentTime, time);
    const release = Math.max(0.03, Math.min(2.5, this.params.release));

    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(relTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.35), relTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + release);
      const stopAt = relTime + release + 0.02;
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
      voice.subOsc.stop(stopAt);
    } catch (e) {}
  }
}
