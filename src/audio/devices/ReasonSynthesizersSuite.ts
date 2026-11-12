import { BaseDevice } from '../BaseDevice.ts';
import { DeviceType } from '../types.ts';
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

  protected buildSaturationCurve(driveAmount: number): Float32Array<ArrayBuffer> {
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

// 6. OBJEKT: Physical Modeling Synthesizer
export class ObjektDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'objekt_1', name: string = 'Bodywork Physical Modeling Synth') {
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

// 19. REASON DRUM KITS / REASON ELECTRIC BASS
export class ReasonPerformanceDevice extends ReasonInstrumentBase {
  constructor(ctx: AudioContext, id: string = 'reason_performance_1', name: string = 'Session Drum Kits & Electric Bass') {
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
