import { BaseDevice } from '../BaseDevice.ts';
import { DeviceType } from '../types.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

interface PolyVoice {
  oscs: OscillatorNode[];
  gains: GainNode[];
  filters: BiquadFilterNode[];
  shaper?: WaveShaperNode;
  noise?: AudioBufferSourceNode;
  amp: GainNode;
}

/**
 * Shared polyphonic voice helper for Reason Rack Instruments & Synthesizers
 * Guarantees zero clicks, real-time parameter updates, and authentic harmonic timbres per device.
 */
export class ReasonInstrumentBase extends BaseDevice {
  protected masterOutput: GainNode;
  protected activeVoices: Map<number, PolyVoice> = new Map();

  constructor(
    ctx: AudioContext,
    id: string,
    name: string,
    type: DeviceType,
    heightUnits: number = 3,
    defaultParams: Record<string, any> = {}
  ) {
    super(ctx, id, name, type, heightUnits);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      cutoff: 3400,
      resonance: 3.2,
      attack: 0.015,
      decay: 0.45,
      sustain: 0.65,
      release: 0.35,
      drive: 0.25,
      morph: 0.5,
      detune: 12,
      volume: 0.85,
      ...defaultParams,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
      { id: 'cv_cutoff', name: 'Filter Cutoff CV In', type: 'cv_in' },
      { id: 'cv_mod', name: 'Modulation CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(18000, Math.max(60, this.resolveCutoffHz(this.params.cutoff) * mod));
        this.activeVoices.forEach((v) => {
          v.filters.forEach((f) => f.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02));
        });
      },
    });

    this.cvInputs.set('cv_mod', {
      setter: (amount: number) => {
        this.params.morph = Math.max(0, Math.min(1, (this.params.morph ?? 0.5) + amount * 0.35));
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.9);
        else this.noteOff(60);
      },
    });
  }

  protected resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 3200;
    if (n <= 1.5) return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(50, Math.min(18000, n));
  }

  protected resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2.5;
    if (n <= 1.0) return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    return Math.max(0.5, Math.min(20, n));
  }

  protected buildSaturationCurve(driveAmount: number): Float32Array {
    const samples = 256;
    const curve = new Float32Array(samples);
    const k = Math.max(0.1, driveAmount) * 35;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  protected createNoiseBuffer(durationSec: number = 0.25): AudioBuffer {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * durationSec));
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.35));
    }
    return buf;
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
        v.filters.forEach((f) => f.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02));
      });
    } else if (key === 'resonance') {
      const q = this.resolveResonanceQ(value);
      this.params.resonance = q;
      this.activeVoices.forEach((v) => {
        v.filters.forEach((f) => f.Q.setTargetAtTime(q, this.ctx.currentTime, 0.02));
      });
    } else {
      this.params[key] = value;
    }
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    const stopTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.02, Math.min(4.0, Number(this.params.release) || 0.25));
    try {
      if (stopTime <= this.ctx.currentTime + 0.005) {
        voice.amp.gain.cancelScheduledValues(stopTime);
        voice.amp.gain.setValueAtTime(Math.max(0.001, voice.amp.gain.value || 0.35), stopTime);
      }
      voice.amp.gain.exponentialRampToValueAtTime(0.0001, stopTime + rel);
      voice.oscs.forEach((o) => {
        try {
          o.stop(stopTime + rel + 0.02);
        } catch (e) {}
      });
      if (voice.noise) {
        try {
          voice.noise.stop(stopTime + rel + 0.02);
        } catch (e) {}
      }
    } catch (e) {}
    this.activeVoices.delete(midiNote);
  }
}

// 1. MALSTRÖM: Graintable Synthesizer
export class MalstromDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'malstrom_1', name: string = 'Malström Graintable Synth') {
    super(ctx, id, name, 'malstrom', 3, {
      graintableA: 'Ghost Choir',
      graintableB: 'Metal Saw',
      motion: 0.62,
      index: 0.45,
      shift: 4, // semitones
      shaperMode: 'Saturate', // Saturate, Sine, Clip, Quant, Noise
      drive: 0.45,
      spread: 0.7,
      cutoff: 3800,
      resonance: 4.5,
      attack: 0.03,
      decay: 0.65,
      sustain: 0.7,
      release: 0.45,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const shiftRatio = Math.pow(2, (Number(this.params.shift) || 0) / 12);

    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, startTime);

    const oscB = this.ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.setValueAtTime(freq * shiftRatio, startTime);
    oscB.detune.setValueAtTime((Number(this.params.motion) || 0.5) * 24, startTime);

    const grainMod = this.ctx.createOscillator();
    grainMod.type = 'triangle';
    grainMod.frequency.setValueAtTime(freq * (1.5 + (Number(this.params.index) || 0.4)), startTime);
    const grainGain = this.ctx.createGain();
    grainGain.gain.setValueAtTime(freq * 0.35 * (Number(this.params.motion) || 0.5), startTime);
    grainMod.connect(grainGain);
    grainGain.connect(oscA.frequency);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.buildSaturationCurve(Number(this.params.drive) || 0.45) as any;

    const filterA = this.ctx.createBiquadFilter();
    filterA.type = 'lowpass';
    filterA.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filterA.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const filterB = this.ctx.createBiquadFilter();
    filterB.type = 'bandpass';
    filterB.frequency.setValueAtTime(Math.min(12000, freq * 2.5), startTime);
    filterB.Q.setValueAtTime(2.2, startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.65));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.005, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.02, this.params.decay)
    );

    oscA.connect(shaper);
    oscB.connect(filterB);
    shaper.connect(filterA);
    filterB.connect(filterA);
    filterA.connect(amp);
    amp.connect(this.masterOutput);

    oscA.start(startTime);
    oscB.start(startTime);
    grainMod.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [oscA, oscB, grainMod],
      gains: [grainGain],
      filters: [filterA, filterB],
      shaper,
      amp,
    });
  }
}

// 2. ALGORITM: 9-Slot FM Synthesizer
export class AlgoritmDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'algoritm_1', name: string = 'Algoritm 9-Slot FM Synth') {
    super(ctx, id, name, 'algoritm', 3, {
      algorithm: 'ALG-4 Bell Matrix',
      op1Ratio: 1.0,
      op2Ratio: 2.0,
      op3Ratio: 3.5,
      fmIndex: 240,
      feedback: 0.35,
      cutoff: 6400,
      resonance: 2.2,
      attack: 0.006,
      decay: 0.55,
      sustain: 0.5,
      release: 0.4,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq * (Number(this.params.op1Ratio) || 1), startTime);

    const mod1 = this.ctx.createOscillator();
    mod1.type = 'sine';
    mod1.frequency.setValueAtTime(freq * (Number(this.params.op2Ratio) || 2), startTime);

    const mod2 = this.ctx.createOscillator();
    mod2.type = 'triangle';
    mod2.frequency.setValueAtTime(freq * (Number(this.params.op3Ratio) || 3.5), startTime);

    const mod1Gain = this.ctx.createGain();
    mod1Gain.gain.setValueAtTime(Number(this.params.fmIndex) || 240, startTime);
    mod1Gain.gain.exponentialRampToValueAtTime(25, startTime + Math.max(0.08, this.params.decay));

    const mod2Gain = this.ctx.createGain();
    mod2Gain.gain.setValueAtTime((Number(this.params.fmIndex) || 240) * 0.65, startTime);

    mod2.connect(mod2Gain);
    mod2Gain.connect(mod1.frequency);
    mod1.connect(mod1Gain);
    mod1Gain.connect(carrier.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.72));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.004, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.03, this.params.decay)
    );

    carrier.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    carrier.start(startTime);
    mod1.start(startTime);
    mod2.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [carrier, mod1, mod2],
      gains: [mod1Gain, mod2Gain],
      filters: [filter],
      amp,
    });
  }
}

// 3. COMPLEX-1: Modular West-Coast Synthesizer
export class Complex1Device extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'complex1_1', name: string = 'Complex-1 Modular Synth') {
    super(ctx, id, name, 'complex1', 3, {
      wavefold: 0.68,
      timbreMod: 0.52,
      lpgResponse: 0.75,
      combPitch: 0.4,
      noiseLevel: 0.15,
      cutoff: 2900,
      resonance: 5.4,
      attack: 0.008,
      decay: 0.38,
      sustain: 0.45,
      release: 0.28,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const complexOsc = this.ctx.createOscillator();
    complexOsc.type = 'triangle';
    complexOsc.frequency.setValueAtTime(freq, startTime);

    const modOsc = this.ctx.createOscillator();
    modOsc.type = 'sawtooth';
    modOsc.frequency.setValueAtTime(freq * 1.5, startTime);
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * (Number(this.params.timbreMod) || 0.5), startTime);
    modOsc.connect(modGain);
    modGain.connect(complexOsc.frequency);

    // West-Coast Wavefolder curve
    const shaper = this.ctx.createWaveShaper();
    const foldAmt = 1 + (Number(this.params.wavefold) || 0.6) * 5;
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = Math.sin(x * foldAmt * Math.PI);
    }
    shaper.curve = curve;

    // Lowpass Gate (LPG)
    const lpgFilter = this.ctx.createBiquadFilter();
    lpgFilter.type = 'lowpass';
    const baseCut = this.resolveCutoffHz(this.params.cutoff);
    lpgFilter.frequency.setValueAtTime(Math.min(16000, baseCut * 2.2), startTime);
    lpgFilter.frequency.exponentialRampToValueAtTime(Math.max(120, baseCut * 0.35), startTime + Math.max(0.06, this.params.decay));
    lpgFilter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.72));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.004, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.03, this.params.decay)
    );

    complexOsc.connect(shaper);
    shaper.connect(lpgFilter);
    lpgFilter.connect(amp);
    amp.connect(this.masterOutput);

    complexOsc.start(startTime);
    modOsc.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [complexOsc, modOsc],
      gains: [modGain],
      filters: [lpgFilter],
      shaper,
      amp,
    });
  }
}

// 4. PARSEC 2: Spectral Additive Synthesizer
export class Parsec2Device extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'parsec2_1', name: string = 'Parsec 2 Spectral Synth') {
    super(ctx, id, name, 'parsec2', 3, {
      mod1Type: 'Formant Filter',
      mod2Type: 'Harmonic Stretch',
      spectralSlope: 0.65,
      ensembleMix: 0.55,
      abBalance: 0.5,
      cutoff: 5200,
      resonance: 3.0,
      attack: 0.04,
      decay: 0.75,
      sustain: 0.75,
      release: 0.6,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    // Additive harmonic partials stack
    const ratios = [1, 2, 3, 4.02, 6.01];
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const slope = Number(this.params.spectralSlope) || 0.65;
    ratios.forEach((r, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx % 2 === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(Math.min(18000, freq * r), startTime);
      o.detune.setValueAtTime((idx - 2) * (Number(this.params.ensembleMix) || 0.5) * 9, startTime);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime((1 / Math.pow(idx + 1, 1.4 - slope * 0.7)) * 0.35, startTime);
      o.connect(g);
      g.connect(filter);
      o.start(startTime);
      oscs.push(o);
      gains.push(g);
    });

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.75));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.01, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.04, this.params.decay)
    );

    filter.connect(amp);
    amp.connect(this.masterOutput);

    this.activeVoices.set(midiNote, { oscs, gains, filters: [filter], amp });
  }
}

// 5. POLYTONE: Dual-Layer Vintage Analog Synthesizer
export class PolytoneDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'polytone_1', name: string = 'Polytone Dual-Layer Synth') {
    super(ctx, id, name, 'polytone', 2, {
      layerMorph: 0.5, // Layer A <-> Layer B
      ageDrift: 0.42,
      spreadWidth: 0.65,
      chorusMix: 0.5,
      cutoff: 3100,
      resonance: 3.4,
      attack: 0.02,
      decay: 0.5,
      sustain: 0.7,
      release: 0.45,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const drift = (Math.random() * 2 - 1) * (Number(this.params.ageDrift) || 0.4) * 18;

    const layerAOsc = this.ctx.createOscillator();
    layerAOsc.type = 'sawtooth';
    layerAOsc.frequency.setValueAtTime(freq, startTime);
    layerAOsc.detune.setValueAtTime(-10 + drift, startTime);

    const layerBOsc = this.ctx.createOscillator();
    layerBOsc.type = 'square';
    layerBOsc.frequency.setValueAtTime(freq * 0.5, startTime);
    layerBOsc.detune.setValueAtTime(10 - drift, startTime);

    const morph = Number(this.params.layerMorph) ?? 0.5;
    const gainA = this.ctx.createGain();
    gainA.gain.setValueAtTime((1 - morph * 0.5) * 0.55, startTime);
    const gainB = this.ctx.createGain();
    gainB.gain.setValueAtTime((0.3 + morph * 0.7) * 0.55, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.75));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.008, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.04, this.params.decay)
    );

    layerAOsc.connect(gainA);
    layerBOsc.connect(gainB);
    gainA.connect(filter);
    gainB.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    layerAOsc.start(startTime);
    layerBOsc.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [layerAOsc, layerBOsc],
      gains: [gainA, gainB],
      filters: [filter],
      amp,
    });
  }
}

// 6. OBJEKT: Physical Modeling Synthesizer
export class ObjektDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'objekt_1', name: string = 'Objekt Physical Modeling Synth') {
    super(ctx, id, name, 'objekt', 3, {
      exciterType: 'Mallet Impact',
      modalObject: 'Hollow Steel Plate',
      damping: 0.55,
      inharmonicity: 0.28,
      bodyResonance: 0.7,
      cutoff: 5800,
      resonance: 6.5,
      attack: 0.003,
      decay: 0.85,
      sustain: 0.25,
      release: 0.65,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const inharm = Number(this.params.inharmonicity) || 0.28;

    // 3 Modal Resonator partials + Exciter impulse
    const m1 = this.ctx.createOscillator();
    m1.type = 'sine';
    m1.frequency.setValueAtTime(freq, startTime);

    const m2 = this.ctx.createOscillator();
    m2.type = 'triangle';
    m2.frequency.setValueAtTime(freq * (2.0 + inharm * 0.76), startTime);

    const m3 = this.ctx.createOscillator();
    m3.type = 'sine';
    m3.frequency.setValueAtTime(freq * (3.0 + inharm * 1.82), startTime);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.05);

    const modalFilter = this.ctx.createBiquadFilter();
    modalFilter.type = 'bandpass';
    modalFilter.frequency.setValueAtTime(Math.min(14000, freq * 2), startTime);
    modalFilter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.8));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + 0.003);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.0005, peak * this.params.sustain),
      startTime + Math.max(0.08, this.params.decay)
    );

    m1.connect(amp);
    m2.connect(modalFilter);
    m3.connect(modalFilter);
    noise.connect(modalFilter);
    modalFilter.connect(amp);
    amp.connect(this.masterOutput);

    m1.start(startTime);
    m2.start(startTime);
    m3.start(startTime);
    noise.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [m1, m2, m3],
      gains: [],
      filters: [modalFilter],
      noise,
      amp,
    });
  }
}

// 7. GRAIN: Sample Manipulator / Granular Synth
export class GrainDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'grain_1', name: string = 'Grain Sample Manipulator') {
    super(ctx, id, name, 'grain', 3, {
      algorithm: 'Spectral Grains', // Spectral Grains, Long Grains, Tape, Osc
      position: 0.35,
      grainSize: 0.48,
      density: 0.72,
      jitter: 0.3,
      panSpread: 0.8,
      cutoff: 4400,
      resonance: 2.8,
      attack: 0.06,
      decay: 0.8,
      sustain: 0.75,
      release: 0.7,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const jitter = (Number(this.params.jitter) || 0.3) * 25;

    // 4-Grain cloud cluster
    const oscs: OscillatorNode[] = [];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    [-1, -0.35, 0.35, 1].forEach((offset, idx) => {
      const o = this.ctx.createOscillator();
      o.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(freq * (idx === 3 ? 2 : 1), startTime);
      o.detune.setValueAtTime(offset * jitter, startTime);
      o.connect(filter);
      o.start(startTime);
      oscs.push(o);
    });

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.55));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.015, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.05, this.params.decay)
    );

    filter.connect(amp);
    amp.connect(this.masterOutput);

    this.activeVoices.set(midiNote, { oscs, gains: [], filters: [filter], amp });
  }
}

// 8. NN-XT: Advanced Multi-Zone Sampler
export class NNXTDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'nnxt_1', name: string = 'NN-XT Advanced Sampler') {
    super(ctx, id, name, 'nnxt', 3, {
      patchZone: 'Orchestral Grand + Strings',
      velCrossfade: 0.65,
      altGroup: 'ON',
      sampleStart: 0.0,
      svfMode: 'LP 24dB',
      cutoff: 4800,
      resonance: 2.1,
      attack: 0.01,
      decay: 0.7,
      sustain: 0.75,
      release: 0.5,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const z1 = this.ctx.createOscillator();
    z1.type = 'triangle';
    z1.frequency.setValueAtTime(freq, startTime);

    const z2 = this.ctx.createOscillator();
    z2.type = 'sawtooth';
    z2.frequency.setValueAtTime(freq, startTime);
    z2.detune.setValueAtTime(7, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff) * (0.6 + velocity * 0.6), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.7));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.005, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.04, this.params.decay)
    );

    z1.connect(filter);
    z2.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    z1.start(startTime);
    z2.start(startTime);

    this.activeVoices.set(midiNote, { oscs: [z1, z2], gains: [], filters: [filter], amp });
  }
}

// 9. NN-19: Classic Digital Sampler
export class NN19Device extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'nn19_1', name: string = 'NN-19 Digital Sampler') {
    super(ctx, id, name, 'nn19', 2, {
      sampleBank: '90s Rave Piano & Brass',
      sampleStart: 0.05,
      loopMode: 'FWD-LOOP',
      bitCrush: 0.25,
      cutoff: 3900,
      resonance: 3.5,
      attack: 0.005,
      decay: 0.45,
      sustain: 0.6,
      release: 0.3,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(freq, startTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.72));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + 0.004);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + Math.max(0.04, this.params.decay)
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc1.start(startTime);
    osc2.start(startTime);

    this.activeVoices.set(midiNote, { oscs: [osc1, osc2], gains: [], filters: [filter], amp });
  }
}

// 10. KONG: 16-Pad Drum Designer
export class KongDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'kong_1', name: string = 'Kong Drum Designer') {
    super(ctx, id, name, 'kong', 3, {
      kitName: 'Cyber Arena Kit',
      activePad: 0,
      drumModule: 'Physical Bass Drum',
      fxSlot1: 'Transient Shaper',
      fxSlot2: 'Rattler & RingMod',
      punch: 0.78,
      decay: 0.38,
      pitch: 0,
      tone: 0.65,
    });
  }

  public triggerPad(padIndex: number, velocity: number = 0.95, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    const pad = ((padIndex % 16) + 16) % 16;
    const pitchFactor = Math.pow(2, (Number(this.params.pitch) || 0) / 12);

    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const baseFreqs = [58, 185, 320, 420, 95, 130, 165, 240, 520, 680, 820, 1050, 75, 145, 290, 480];
    const f0 = baseFreqs[pad] * pitchFactor;

    osc.type = pad % 4 === 0 ? 'sine' : pad % 2 === 1 ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(f0 * 2.2, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(32, f0 * 0.55), startTime + 0.08);

    const dur = Math.max(0.08, Math.min(1.2, (Number(this.params.decay) || 0.35) * (pad % 4 === 0 ? 1.1 : 0.65)));
    amp.gain.setValueAtTime(Math.max(0.05, velocity * 0.9), startTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    // Add noise snap for snare/hats/claps
    if (pad % 4 !== 0) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(dur * 0.75);
      const nf = this.ctx.createBiquadFilter();
      nf.type = pad >= 8 ? 'highpass' : 'bandpass';
      nf.frequency.setValueAtTime(pad >= 8 ? 5500 : 1800, startTime);
      noise.connect(nf);
      nf.connect(amp);
      noise.start(startTime);
    }

    osc.connect(amp);
    amp.connect(this.masterOutput);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }

  public noteOn(midiNote: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    this.triggerPad(Math.abs(midiNote - 36) % 16, velocity, time);
  }
}

// 11. DR. OCTO REX: 8-Slot REX Loop Player with Custom Audio Sample Import & Slice Triggering
export class DrOctoRexDevice extends ReasonInstrumentBase {
  public customSlots: Map<number, { name: string; buffer: AudioBuffer }> = new Map();

  constructor(ctx: AudioContext, id: string = 'dr_octo_rex_1', name: string = 'Dr. Octo Rex Loop Player') {
    super(ctx, id, name, 'dr_octo_rex', 3, {
      activeLoopSlot: 1, // 1..8
      loopBank: 'Breakbeat Jungle 170.rx2',
      sliceReverse: false,
      slicePitch: 0,
      filterEnv: 0.65,
      cutoff: 4600,
      resonance: 3.8,
      decay: 0.28,
    });
  }

  public async loadSampleFile(slotIndex: number, file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 22);
    const slot = Math.max(1, Math.min(8, slotIndex));
    this.customSlots.set(slot, { name: cleanName, buffer: audioBuffer });
    this.params.activeLoopSlot = slot;
    this.params.loopBank = `${cleanName}.rx2`;
  }

  public noteOn(midiNote: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    const sliceIdx = Math.abs(midiNote) % 16;
    const activeSlot = Number(this.params.activeLoopSlot) || 1;
    const custom = this.customSlots.get(activeSlot);

    if (custom && custom.buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = custom.buffer;
      const rate = Math.pow(2, (Number(this.params.slicePitch) || 0) / 12);
      src.playbackRate.setValueAtTime(rate, startTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
      filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

      const amp = this.ctx.createGain();
      const sliceDur = Math.max(0.08, custom.buffer.duration / 16);
      const offsetSec = (sliceIdx / 16) * Math.max(0, custom.buffer.duration - sliceDur);
      amp.gain.setValueAtTime(velocity * 0.9, startTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(1.5, sliceDur * 1.4));

      src.connect(filter);
      filter.connect(amp);
      amp.connect(this.masterOutput);
      src.start(startTime, offsetSec, Math.min(1.6, sliceDur * 1.5));
      return;
    }

    const slotOffset = (activeSlot - 1) * 18;
    const baseFreq = 65 + ((sliceIdx * 37 + slotOffset) % 340);

    const osc = this.ctx.createOscillator();
    osc.type = sliceIdx % 3 === 0 ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 1.8, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, baseFreq * 0.6), startTime + 0.09);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.14);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(velocity * 0.85, startTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);

    osc.connect(filter);
    noise.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc.start(startTime);
    noise.start(startTime);
    osc.stop(startTime + 0.2);
  }
}

// 12. UMPF CLUB DRUMS / UMPF RETRO BEATS
export class UmpfDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'umpf_1', name: string = 'Umpf Club & Retro Beats') {
    super(ctx, id, name, 'umpf', 3, {
      editionMode: 'Club Drums', // 'Club Drums' | 'Retro Beats'
      kitPreset: 'Berlin Warehouse 909',
      chopAmount: 0.45,
      tapeDrive: 0.55,
      gatedReverb: 0.35,
      pitch: 0,
      decay: 0.32,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.92, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    const pad = Math.abs(midiNote) % 8;
    const isRetro = this.params.editionMode === 'Retro Beats';

    const osc = this.ctx.createOscillator();
    osc.type = isRetro ? 'triangle' : 'sine';
    const startF = pad === 0 ? 150 : pad === 1 ? 240 : 120 + pad * 85;
    osc.frequency.setValueAtTime(startF, startTime);
    osc.frequency.exponentialRampToValueAtTime(pad === 0 ? 44 : startF * 0.45, startTime + 0.08);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.buildSaturationCurve(Number(this.params.tapeDrive) || 0.5) as any;

    const amp = this.ctx.createGain();
    const dur = pad === 0 ? 0.28 : 0.18;
    amp.gain.setValueAtTime(velocity * 0.9, startTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    osc.connect(shaper);
    shaper.connect(amp);
    amp.connect(this.masterOutput);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }
}

// 13. FRIKTION: Modeled Strings
export class FriktionDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'friktion_1', name: string = 'Friktion Modeled Strings') {
    super(ctx, id, name, 'friktion', 3, {
      instrumentModel: 'Solo Violin', // Solo Violin, Viola, Cello, Double Bass, Chamber Ensemble
      articulation: 'Sustain Arc', // Sustain Arc, Staccato, Pizzicato, Tremolo
      bowPressure: 0.68,
      bowPosition: 0.42,
      vibratoRate: 5.8,
      vibratoDepth: 14,
      bodyResonance: 0.75,
      cutoff: 4900,
      resonance: 2.4,
      attack: 0.09,
      decay: 0.6,
      sustain: 0.85,
      release: 0.45,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const isPizz = this.params.articulation === 'Pizzicato';

    const bowOsc1 = this.ctx.createOscillator();
    bowOsc1.type = 'sawtooth';
    bowOsc1.frequency.setValueAtTime(freq, startTime);

    const bowOsc2 = this.ctx.createOscillator();
    bowOsc2.type = 'sawtooth';
    bowOsc2.frequency.setValueAtTime(freq, startTime);
    bowOsc2.detune.setValueAtTime(8, startTime);

    // Vibrato LFO
    const vibLfo = this.ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.setValueAtTime(Number(this.params.vibratoRate) || 5.8, startTime);
    const vibGain = this.ctx.createGain();
    vibGain.gain.setValueAtTime(Number(this.params.vibratoDepth) || 14, startTime);
    vibLfo.connect(vibGain);
    vibGain.connect(bowOsc1.detune);
    vibGain.connect(bowOsc2.detune);

    // Wooden body formant filter
    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    bodyFilter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.7));
    const atk = isPizz ? 0.004 : Math.max(0.04, Number(this.params.attack) || 0.09);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + atk);
    amp.gain.exponentialRampToValueAtTime(
      isPizz ? 0.001 : Math.max(0.01, peak * this.params.sustain),
      startTime + atk + (isPizz ? 0.22 : 0.6)
    );

    bowOsc1.connect(bodyFilter);
    bowOsc2.connect(bodyFilter);
    bodyFilter.connect(amp);
    amp.connect(this.masterOutput);

    bowOsc1.start(startTime);
    bowOsc2.start(startTime);
    vibLfo.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [bowOsc1, bowOsc2, vibLfo],
      gains: [vibGain],
      filters: [bodyFilter],
      amp,
    });
  }
}

// 14. SCENIC: Cinematic Hybrid Instrument
export class ScenicDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'scenic_1', name: string = 'Scenic Hybrid Instrument') {
    super(ctx, id, name, 'scenic', 3, {
      engineA: 'Bowed Glass Halo',
      engineB: 'Sub-Analog Drone',
      abBlend: 0.5,
      atmosphereBlur: 0.72,
      shimmerMix: 0.58,
      cutoff: 3600,
      resonance: 2.8,
      attack: 0.14,
      decay: 1.1,
      sustain: 0.85,
      release: 0.95,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, startTime);
    oscA.detune.setValueAtTime(-12, startTime);

    const oscB = this.ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(freq * 0.5, startTime);

    const shimmerOsc = this.ctx.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(freq * 2.0, startTime);
    shimmerOsc.detune.setValueAtTime(14, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.68));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.04, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + Math.max(0.1, this.params.decay)
    );

    oscA.connect(filter);
    oscB.connect(filter);
    shimmerOsc.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    oscA.start(startTime);
    oscB.start(startTime);
    shimmerOsc.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [oscA, oscB, shimmerOsc],
      gains: [],
      filters: [filter],
      amp,
    });
  }
}

// 15. HUMANA: Vocal Ensemble Instrument
export class HumanaDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'humana_1', name: string = 'Humana Vocal Ensemble') {
    super(ctx, id, name, 'humana', 2, {
      choirSection: 'Cathedral Mixed Choir',
      vowelFormant: 'AA - OH Morph',
      breathAir: 0.35,
      ensembleSpread: 0.78,
      cutoff: 4200,
      resonance: 4.5,
      attack: 0.1,
      decay: 0.7,
      sustain: 0.85,
      release: 0.65,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const v1 = this.ctx.createOscillator();
    v1.type = 'sawtooth';
    v1.frequency.setValueAtTime(freq, startTime);
    v1.detune.setValueAtTime(-9, startTime);

    const v2 = this.ctx.createOscillator();
    v2.type = 'sawtooth';
    v2.frequency.setValueAtTime(freq, startTime);
    v2.detune.setValueAtTime(9, startTime);

    // Dual Vocal Formant Bandpass Filters
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(800, startTime);
    f1.Q.setValueAtTime(4.5, startTime);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1250, startTime);
    f2.Q.setValueAtTime(5.2, startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.85));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.03, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + this.params.attack + 0.5
    );

    v1.connect(f1);
    v2.connect(f1);
    v1.connect(f2);
    v2.connect(f2);
    f1.connect(amp);
    f2.connect(amp);
    amp.connect(this.masterOutput);

    v1.start(startTime);
    v2.start(startTime);

    this.activeVoices.set(midiNote, { oscs: [v1, v2], gains: [], filters: [f1, f2], amp });
  }
}

// 16. PANGEA: World Instrument
export class PangeaDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'pangea_1', name: string = 'Pangea World Instrument') {
    super(ctx, id, name, 'pangea', 2, {
      worldPatch: 'Anatolian Electric Saz', // Anatolian Electric Saz, Andean Charango, Armenian Duduk, Arabic Oud
      pluckAttack: 0.72,
      tremoloSpeed: 0.35,
      roomAmbience: 0.5,
      cutoff: 5100,
      resonance: 3.1,
      attack: 0.006,
      decay: 0.55,
      sustain: 0.35,
      release: 0.4,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const s1 = this.ctx.createOscillator();
    s1.type = 'sawtooth';
    s1.frequency.setValueAtTime(freq, startTime);

    const s2 = this.ctx.createOscillator();
    s2.type = 'triangle';
    s2.frequency.setValueAtTime(freq * 2, startTime);
    s2.detune.setValueAtTime(6, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.78));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + 0.005);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + Math.max(0.06, this.params.decay)
    );

    s1.connect(filter);
    s2.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    s1.start(startTime);
    s2.start(startTime);

    this.activeVoices.set(midiNote, { oscs: [s1, s2], gains: [], filters: [filter], amp });
  }
}

// 17. KLANG: Tuned Percussion
export class KlangDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'klang_1', name: string = 'Klang Tuned Percussion') {
    super(ctx, id, name, 'klang', 2, {
      percussionModel: 'Orchestral Glockenspiel', // Orchestral Glockenspiel, Thumb Kalimba, Vintage Music Box, Singing Wine Glass
      malletHardness: 0.75,
      metallicOvertones: 0.6,
      shimmerDecay: 0.7,
      cutoff: 7800,
      resonance: 2.5,
      attack: 0.003,
      decay: 0.85,
      sustain: 0.15,
      release: 0.65,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const fund = this.ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, startTime);

    const bellOvertone = this.ctx.createOscillator();
    bellOvertone.type = 'sine';
    bellOvertone.frequency.setValueAtTime(freq * 2.756, startTime);

    const overtoneGain = this.ctx.createGain();
    overtoneGain.gain.setValueAtTime((Number(this.params.metallicOvertones) || 0.6) * 0.4, startTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);
    bellOvertone.connect(overtoneGain);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.8));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0005, startTime + Math.max(0.15, this.params.decay));

    fund.connect(amp);
    overtoneGain.connect(amp);
    amp.connect(this.masterOutput);

    fund.start(startTime);
    bellOvertone.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [fund, bellOvertone],
      gains: [overtoneGain],
      filters: [],
      amp,
    });
  }
}

// 18. RADICAL PIANO / RADICAL KEYS: Acoustic & Electric Pianos
export class RadicalPianoDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'radical_piano_1', name: string = 'Radical Piano & Keys') {
    super(ctx, id, name, 'radical_piano', 3, {
      pianoModel: 'Concert Grand + Rhodes MkI', // Concert Grand, Upright Intimate, Rhodes MkI, Wurlitzer 200A
      character: 0.55, // Subdued <-> Bright
      micBlend: 0.45, // Close Jazz <-> Vintage Room
      hammerNoise: 0.35,
      sympatheticRes: 0.6,
      tremoloDepth: 0.25,
      cutoff: 6200,
      resonance: 1.8,
      attack: 0.004,
      decay: 0.9,
      sustain: 0.45,
      release: 0.45,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    soundFontEngine.triggerSampleVoice(
      this.ctx,
      'acoustic_grand_piano',
      midiNote,
      Math.max(0.15, Math.min(1.0, velocity)),
      this.masterOutput,
      startTime,
      { sustainSec: Math.max(0.4, Number(this.params.decay) || 1.2) }
    );
  }
}

// 19. REASON DRUM KITS / REASON ELECTRIC BASS
export class ReasonPerformanceDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'reason_performance_1', name: string = 'Reason Drum Kits & Electric Bass') {
    super(ctx, id, name, 'reason_performance', 2, {
      performanceMode: 'Reason Electric Bass (Fender Precision)', // 'Reason Electric Bass (Fender Precision)' | 'Reason Drum Kits (Abbey Studio)'
      articulationStyle: 'Picked Punch',
      overheadMicMix: 0.55,
      ampCabinetDrive: 0.4,
      cutoff: 2800,
      resonance: 2.6,
      attack: 0.005,
      decay: 0.42,
      sustain: 0.55,
      release: 0.22,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.88, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(freq, startTime);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 0.5, startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseCut = this.resolveCutoffHz(this.params.cutoff);
    filter.frequency.setValueAtTime(baseCut * 2.2, startTime);
    filter.frequency.exponentialRampToValueAtTime(baseCut * 0.5, startTime + 0.14);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.85));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + 0.004);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + Math.max(0.08, this.params.decay)
    );

    bassOsc.connect(filter);
    subOsc.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    bassOsc.start(startTime);
    subOsc.start(startTime);

    this.activeVoices.set(midiNote, {
      oscs: [bassOsc, subOsc],
      gains: [],
      filters: [filter],
      amp,
    });
  }
}

// 20. LAYERS / ID8: Sample Players & Songwriter Toolboxes
export class LayersID8Device extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'layers_id8_1', name: string = 'Layers & ID8 Songwriter Toolbox') {
    super(ctx, id, name, 'layers_id8', 2, {
      toolboxPreset: 'Layers Quad-Synth Stack', // Layers Quad-Synth Stack, ID8 Acoustic Grand, ID8 Vintage Strings, ID8 Synth Brass
      layer1Active: true,
      layer2Active: true,
      layer3Active: true,
      layer4Active: true,
      spreadDetune: 0.55,
      cutoff: 4500,
      resonance: 2.5,
      attack: 0.012,
      decay: 0.55,
      sustain: 0.72,
      release: 0.4,
    });
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.resolveCutoffHz(this.params.cutoff), startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const oscs: OscillatorNode[] = [];
    const shapes: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine'];
    shapes.forEach((sh, idx) => {
      const o = this.ctx.createOscillator();
      o.type = sh;
      o.frequency.setValueAtTime(freq * (idx === 3 ? 0.5 : 1), startTime);
      o.detune.setValueAtTime((idx - 1.5) * 9, startTime);
      o.connect(filter);
      o.start(startTime);
      oscs.push(o);
    });

    const amp = this.ctx.createGain();
    const peak = Math.max(0.05, Math.min(1.0, velocity * 0.65));
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peak, startTime + Math.max(0.008, this.params.attack));
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peak * this.params.sustain),
      startTime + Math.max(0.06, this.params.decay)
    );

    filter.connect(amp);
    amp.connect(this.masterOutput);

    this.activeVoices.set(midiNote, { oscs, gains: [], filters: [filter], amp });
  }
}
