import { BaseDevice } from '../BaseDevice.ts';

interface WyvernVoice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  subOsc: OscillatorNode;
  fmOsc: OscillatorNode;
  fmGain: GainNode;
  filter: BiquadFilterNode;
  combFilter: BiquadFilterNode;
  shaper: WaveShaperNode;
  gain: GainNode;
}

export class WyvernDevice extends BaseDevice {
  private masterOutput: GainNode;
  private activeVoices: Map<number, WyvernVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'wyvern_1', name: string = 'Wyvern Synthesizer Module') {
    super(ctx, id, name, 'wyvern', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      wavetableA: 'sawtooth',
      wavetableB: 'square',
      morph: 0.45,          // 0.0 to 1.0 crossfade between Osc A & B + FM index
      fmDepth: 140,         // Hz FM modulation depth
      unisonDetune: 16,     // cents spread
      subHarmonic: 0.5,     // -1 octave sub-oscillator level
      dragonDrive: 0.35,    // waveshaper saturation drive
      combFreq: 920,        // metallic comb/peaking resonance frequency
      cutoff: 3200,
      resonance: 5.2,
      attack: 0.015,
      decay: 0.35,
      sustain: 0.65,
      release: 0.45,
      volume: 0.85,
      // Modulation Container Slots
      modSlot1Source: 'LFO 1 (Sine)',
      modSlot1Target: 'Morph',
      modSlot1Depth: 0.42,
      modSlot2Source: 'Env Follower',
      modSlot2Target: 'Cutoff',
      modSlot2Depth: 0.55,
      // Macro Control Knobs (0.0 to 1.0)
      macroRoar: 0.45,
      macroScale: 0.6,
      macroBreath: 0.35,
      macroSpace: 0.5,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in', description: 'Modulates Wyvern filter frequency' },
      { id: 'cv_morph', name: 'Morph CV In', type: 'cv_in', description: 'Modulates Wavetable Morph & FM' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in', description: '1V/Oct Pitch modulation' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(18000, Math.max(40, this.resolveCutoffHz(this.params.cutoff) * mod));
        this.activeVoices.forEach((v) => {
          v.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_morph', {
      setter: (amount: number) => {
        const nextMorph = Math.max(0, Math.min(1, this.params.morph + amount * 0.5));
        this.params.morph = nextMorph;
      },
    });
  }

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 3200;
    if (n <= 1.5) {
      return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    }
    return Math.max(40, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 5.2;
    if (n <= 1.0) {
      return 0.7 + Math.max(0, Math.min(1, n)) * 14.0;
    }
    return Math.max(0.5, Math.min(20, n));
  }

  private makeDragonCurve(drive: number): Float32Array {
    const k = Math.max(1, drive * 80);
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
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
    } else if (key === 'macroRoar') {
      const v = Math.max(0, Math.min(1, Number(value)));
      this.params.macroRoar = v;
      this.params.dragonDrive = Number((0.15 + v * 0.75).toFixed(2));
      this.params.fmDepth = Math.round(40 + v * 360);
    } else if (key === 'macroScale') {
      const v = Math.max(0, Math.min(1, Number(value)));
      this.params.macroScale = v;
      this.setParam('cutoff', Math.round(180 + v * 12000));
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (midiNote - 69) / 12)));

    const oscA = this.ctx.createOscillator();
    oscA.type = this.params.wavetableA || 'sawtooth';
    oscA.frequency.setValueAtTime(freq, startTime);
    oscA.detune.setValueAtTime(-this.params.unisonDetune, startTime);

    const oscB = this.ctx.createOscillator();
    oscB.type = this.params.wavetableB || 'square';
    oscB.frequency.setValueAtTime(freq, startTime);
    oscB.detune.setValueAtTime(this.params.unisonDetune, startTime);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(Math.max(20, freq * 0.5), startTime);

    // FM Operator modulating Osc A & B
    const fmOsc = this.ctx.createOscillator();
    fmOsc.type = 'sine';
    fmOsc.frequency.setValueAtTime(freq * 2, startTime);
    const fmGain = this.ctx.createGain();
    fmGain.gain.setValueAtTime((this.params.fmDepth || 140) * (0.4 + this.params.morph), startTime);
    fmOsc.connect(fmGain);
    fmGain.connect(oscA.frequency);
    fmGain.connect(oscB.frequency);

    const gainA = this.ctx.createGain();
    gainA.gain.setValueAtTime(1 - this.params.morph * 0.5, startTime);
    const gainB = this.ctx.createGain();
    gainB.gain.setValueAtTime(0.35 + this.params.morph * 0.65, startTime);
    const gainSub = this.ctx.createGain();
    gainSub.gain.setValueAtTime(this.params.subHarmonic ?? 0.5, startTime);

    oscA.connect(gainA);
    oscB.connect(gainB);
    subOsc.connect(gainSub);

    // Comb peaking resonator
    const combFilter = this.ctx.createBiquadFilter();
    combFilter.type = 'peaking';
    combFilter.frequency.setValueAtTime(this.params.combFreq || 920, startTime);
    combFilter.Q.setValueAtTime(6.0, startTime);
    combFilter.gain.setValueAtTime(6 + this.params.morph * 8, startTime);

    // Main resonant lowpass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCutoff = this.resolveCutoffHz(this.params.cutoff);
    filter.frequency.setValueAtTime(baseCutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.min(18000, baseCutoff * 2.6),
      startTime + Math.max(0.01, this.params.attack)
    );
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, baseCutoff),
      startTime + this.params.attack + this.params.decay
    );
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.makeDragonCurve(this.params.dragonDrive ?? 0.35) as any;

    const voiceGain = this.ctx.createGain();
    const peakGain = Math.max(0.05, Math.min(1.0, velocity * 0.52));
    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(peakGain, startTime + Math.max(0.005, this.params.attack));
    voiceGain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peakGain * this.params.sustain),
      startTime + this.params.attack + this.params.decay
    );

    gainA.connect(combFilter);
    gainB.connect(combFilter);
    gainSub.connect(combFilter);
    combFilter.connect(filter);
    filter.connect(shaper);
    shaper.connect(voiceGain);
    voiceGain.connect(this.masterOutput);

    oscA.start(startTime);
    oscB.start(startTime);
    subOsc.start(startTime);
    fmOsc.start(startTime);

    this.activeVoices.set(midiNote, {
      oscA,
      oscB,
      subOsc,
      fmOsc,
      fmGain,
      filter,
      combFilter,
      shaper,
      gain: voiceGain,
    });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    const releaseTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.03, this.params.release || 0.35);

    try {
      if (releaseTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(releaseTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.35), releaseTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime + rel);

      const stopAt = releaseTime + rel + 0.03;
      voice.oscA.stop(stopAt);
      voice.oscB.stop(stopAt);
      voice.subOsc.stop(stopAt);
      voice.fmOsc.stop(stopAt);
    } catch (e) {}
  }

  public dispose(): void {
    this.activeVoices.forEach((_, note) => this.noteOff(note));
    this.masterOutput.disconnect();
  }
}
