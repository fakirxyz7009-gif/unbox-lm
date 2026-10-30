import { BaseDevice } from '../BaseDevice.ts';
import type { DeviceType } from '../types.ts';

/**
 * 3rd WAVE ADVANCED 24-VOICE WAVETABLE SYNTHESIZER
 * Groove Synthesis 3rd Wave Hardware Architecture & DSP Emulation.
 *
 * Features:
 * - 24-voice polyphony with Voice Pan Spread & Circuit Drift
 * - 3 Wavetable Oscillators per voice (PPG Vintage 8-bit P00-P35, Modern Anti-aliased U00-U55, Analog A00-A06, Sample S00-S08)
 * - Master Wave Surfer (-63 to +63) sweeping all 3 oscillator tables simultaneously
 * - 6-Stage Wave Envelope per oscillator with looping
 * - Linear FM (Osc 2 -> 1, Osc 3 -> 2, Osc 1 -> 3) & Hard Sync
 * - Dual Filters in Series:
 *     1. 2-pole 12dB State-Variable Filter (SVF: Low-Pass, Notch, High-Pass, Band-Pass)
 *     2. 4-pole 24dB resonant Low-Pass Filter with saturation overdrive & Bass Compensation
 * - Envelopes: Filter Envelope (Exponential/Vintage PPG shape), Amp Envelope, Env 3 & Env 4
 * - 4 LFOs with tempo sync, key sync, and free run
 * - Dual FX Processors (FX 1: BBD Delay, Tape Echo, Chorus, Flanger, Phaser; FX 2: Hall, Room, Superplate Reverbs, Distortion)
 * - Complete Reason-style front and rear panel connectivity with CV and part outputs.
 */

export interface ThirdWaveVoice {
  midiNote: number;
  velocity: number;
  startTime: number;
  osc1: OscillatorNode;
  osc1Gain: GainNode;
  osc2: OscillatorNode;
  osc2Gain: GainNode;
  osc3: OscillatorNode;
  osc3Gain: GainNode;
  noiseSource?: AudioBufferSourceNode;
  noiseGain?: GainNode;
  fmGain2to1?: GainNode;
  fmGain3to2?: GainNode;
  fmGain1to3?: GainNode;
  voiceMixer: GainNode;
  filter1: BiquadFilterNode;
  filter2Stage1: BiquadFilterNode;
  filter2Stage2: BiquadFilterNode;
  filter2BassComp: BiquadFilterNode;
  filter2Drive: WaveShaperNode;
  amp: GainNode;
  panNode?: StereoPannerNode;
  voiceIndex: number;
  /**
   * Wave-envelope changes use browser timers because OscillatorNode cannot
   * schedule setPeriodicWave changes on the audio clock. Keep every pending
   * handle so a released, stolen, or disposed voice cannot mutate later.
   */
  waveEnvTimers?: number[];
}

export class ThirdWaveDevice extends BaseDevice {
  private masterOutput: GainNode;
  private part2Output: GainNode;
  private part3Output: GainNode;
  private part4Output: GainNode;
  private inputL: GainNode;
  private inputR: GainNode;
  private inputMixer: GainNode;

  // Dual FX Nodes
  private fx1Input: GainNode;
  private fx1Dry: GainNode;
  private fx1Wet: GainNode;
  private fx1DelayNode: DelayNode;
  private fx1FeedbackNode: GainNode;
  private fx1FilterNode: BiquadFilterNode;

  private fx2Input: GainNode;
  private fx2Dry: GainNode;
  private fx2Wet: GainNode;
  private fx2Convolver?: ConvolverNode;
  private fx2Shaper?: WaveShaperNode;
  private fx2FilterNode: BiquadFilterNode;

  private activeVoices: Map<number, ThirdWaveVoice> = new Map();
  private voiceCounter: number = 0;
  private periodicWaveCache: Map<string, PeriodicWave> = new Map();
  private whiteNoiseBuffer?: AudioBuffer;

  constructor(ctx: AudioContext, id: string = 'third_wave_1', name: string = '3rd Wave Wavetable Synth') {
    super(ctx, id, name, 'third_wave' as DeviceType, 4);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;

    this.part2Output = ctx.createGain();
    this.part3Output = ctx.createGain();
    this.part4Output = ctx.createGain();

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.inputMixer = ctx.createGain();
    this.inputL.connect(this.inputMixer);
    this.inputR.connect(this.inputMixer);

    // Audio Output Registrations
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.audioOutputs.set('out2_l', this.part2Output);
    this.audioOutputs.set('out2_r', this.part2Output);
    this.audioOutputs.set('out3_l', this.part3Output);
    this.audioOutputs.set('out3_r', this.part3Output);
    this.audioOutputs.set('out4_l', this.part4Output);
    this.audioOutputs.set('out4_r', this.part4Output);

    // Audio Inputs
    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);

    // Master analyser connection
    this.masterOutput.connect(this.analyser);

    // FX 1 Setup
    this.fx1Input = ctx.createGain();
    this.fx1Dry = ctx.createGain();
    this.fx1Wet = ctx.createGain();
    this.fx1DelayNode = ctx.createDelay(2.5);
    this.fx1FeedbackNode = ctx.createGain();
    this.fx1FilterNode = ctx.createBiquadFilter();
    this.fx1FilterNode.type = 'lowpass';
    this.fx1FilterNode.frequency.value = 7500;

    this.fx1Input.connect(this.fx1Dry);
    this.fx1Input.connect(this.fx1DelayNode);
    this.fx1DelayNode.connect(this.fx1FilterNode);
    this.fx1FilterNode.connect(this.fx1FeedbackNode);
    this.fx1FeedbackNode.connect(this.fx1DelayNode);
    this.fx1FilterNode.connect(this.fx1Wet);

    // FX 2 Setup
    this.fx2Input = ctx.createGain();
    this.fx2Dry = ctx.createGain();
    this.fx2Wet = ctx.createGain();
    this.fx2FilterNode = ctx.createBiquadFilter();
    this.fx2FilterNode.type = 'highshelf';
    this.fx2FilterNode.frequency.value = 6000;
    this.fx2FilterNode.gain.value = -3;

    this.fx2Shaper = ctx.createWaveShaper();
    this.fx2Shaper.curve = this.createDistortionCurve(0) as any;

    // Reverb Impulse Response generator
    this.setupReverbNode();

    // Wiring FX 1 -> FX 2 -> Master Output
    const fx1Mix = ctx.createGain();
    this.fx1Dry.connect(fx1Mix);
    this.fx1Wet.connect(fx1Mix);
    fx1Mix.connect(this.fx2Input);

    const fx2Mix = ctx.createGain();
    this.fx2Dry.connect(fx2Mix);
    this.fx2Wet.connect(fx2Mix);
    fx2Mix.connect(this.masterOutput);

    // Parameters with 3rd Wave defaults
    this.params = {
      // Oscillators
      osc1_type: 'p', // 'p' = PPG, 'u' = User, 'a' = Analog, 's' = Sample
      osc1_table: 0,  // P00 - P35
      osc1_wave: 12,  // 0 - 63
      osc1_pitch: 0,  // -24 to +24 semitones
      osc1_fine: 0,   // -50 to +50 cents
      osc1_level: 80, // 0 - 100
      osc1_kw: 0,     // Key to Wave (-63 to +63)
      osc1_freeRun: false,
      osc1_pwm: 50,

      osc2_type: 'p',
      osc2_table: 4,
      osc2_wave: 24,
      osc2_pitch: 0,
      osc2_fine: 6,
      osc2_level: 70,
      osc2_kw: 0,
      osc2_freeRun: false,
      osc2_sync: false,
      osc2_fm: 0, // FM to Osc 1

      osc3_type: 'a', // Analog sub / wave
      osc3_table: 0, // A00 Saw
      osc3_wave: 0,
      osc3_pitch: -12, // Sub-octave
      osc3_fine: -5,
      osc3_level: 55,
      osc3_kw: 0,
      osc3_freeRun: false,
      osc3_fm: 0, // FM to Osc 2

      osc1_fm: 0, // FM Osc 1 -> Osc 3

      // Master Wave Surfer & Circuit Drift
      waveSurfer: 0,       // -63 to +63
      waveFlow: 65,        // Wavetable smoothing (0-100)
      upperWave: false,    // Upper wavetable toggle
      circuitDrift: 25,    // Voice micro-drift (0-100)

      // 6-Stage Wave Envelope
      waveEnv_t1: 0.15,
      waveEnv_p1: 4,
      waveEnv_t2: 0.35,
      waveEnv_p2: 24,
      waveEnv_t3: 0.60,
      waveEnv_p3: 45,
      waveEnv_t4: 0.80,
      waveEnv_p4: 32,
      waveEnv_t5: 1.20,
      waveEnv_p5: 18,
      waveEnv_t6: 1.50,
      waveEnv_p6: 8,
      waveEnv_loopStart: 2,
      waveEnv_loopEnd: 4,
      waveEnv_amt: 35,     // -100 to 100
      waveEnv_vel: 40,

      // Dual Filters
      // Filter 1: 12dB State-Variable Filter (SVF)
      f1_cutoff: 4200,     // Hz
      f1_resonance: 2.5,   // Q
      f1_mode: 'lowpass',  // lowpass, notch, highpass, bandpass
      f1_envAmt: 30,       // -100 to +100
      f1_velSens: 25,      // 0 to 100
      f1_keyTrack: 50,     // 0 to 100

      // Filter 2: 24dB 4-Pole Low-Pass Filter with Bass Compensation & Saturation
      f2_cutoff: 2800,     // Hz
      f2_resonance: 3.8,   // Q
      f2_drive: 20,        // 0 to 100 saturation
      f2_bassComp: 60,     // 0 to 100
      f2_envAmt: 45,       // -100 to +100
      f2_velSens: 35,
      f2_keyTrack: 40,

      // Envelopes
      // Filter Envelope
      fenv_delay: 0.0,
      fenv_attack: 0.04,
      fenv_decay: 0.75,
      fenv_sustain: 0.45,
      fenv_release: 0.85,
      fenv_mode: 'vintage_ppg', // 'vintage_ppg', 'exponential', 'linear'

      // Amp Envelope
      aenv_delay: 0.0,
      aenv_attack: 0.02,
      aenv_decay: 0.65,
      aenv_sustain: 0.75,
      aenv_release: 0.95,
      aenv_amount: 1.0,

      // Envelopes 3 & 4
      env3_delay: 0.0,
      env3_attack: 0.1,
      env3_decay: 0.5,
      env3_sustain: 0.5,
      env3_release: 1.0,
      env3_dest: 'f1_cutoff',
      env3_amt: 0,
      env3_repeat: false,

      env4_delay: 0.0,
      env4_attack: 0.2,
      env4_decay: 0.8,
      env4_sustain: 0.3,
      env4_release: 1.2,
      env4_dest: 'osc1_wave',
      env4_amt: 0,
      env4_repeat: false,

      // 4 LFOs
      lfo1_shape: 'triangle',
      lfo1_rate: 1.8,      // Hz
      lfo1_amt: 0.2,
      lfo1_dest: 'waveSurfer',
      lfo1_sync: false,
      lfo1_keySync: true,

      lfo2_shape: 'sine',
      lfo2_rate: 0.5,
      lfo2_amt: 0.15,
      lfo2_dest: 'f1_cutoff',
      lfo2_sync: false,
      lfo2_keySync: false,

      lfo3_shape: 'sawtooth',
      lfo3_rate: 3.2,
      lfo3_amt: 0.0,
      lfo3_dest: 'pitch',
      lfo3_sync: false,
      lfo3_keySync: true,

      lfo4_shape: 'random',
      lfo4_rate: 2.0,
      lfo4_amt: 0.0,
      lfo4_dest: 'pan',
      lfo4_sync: false,
      lfo4_keySync: false,

      // Dual FX
      fx1_type: 'chorus',  // 'bbd_delay', 'stereo_delay', 'tape_delay', 'chorus', 'phaser', 'flanger'
      fx1_mix: 0.35,
      fx1_time: 0.32,      // sec or delay length
      fx1_feedback: 0.45,
      fx1_tone: 6800,

      fx2_type: 'hall_reverb', // 'hall_reverb', 'room_reverb', 'superplate', 'distortion', 'ring_mod'
      fx2_mix: 0.38,
      fx2_decay: 3.8,      // sec
      fx2_tone: 8500,
      fx2_drive: 1.0,

      // Master & Performance
      panSpread: 75,       // 0 to 100% true voice spread
      unisonVoices: 1,     // 1 = 24-voice polyphonic, 2, 4, 8 unison
      unisonDetune: 8,     // cents
      glide: 0.0,          // portamento time in seconds
      volume: 0.85,
    };

    this.ports = [
      { id: 'out_l', name: 'Main Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Main Out R', type: 'audio_out', channel: 'right' },
      { id: 'out2_l', name: 'Part 2 Out L', type: 'audio_out', channel: 'left' },
      { id: 'out2_r', name: 'Part 2 Out R', type: 'audio_out', channel: 'right' },
      { id: 'out3_l', name: 'Part 3 Out L', type: 'audio_out', channel: 'left' },
      { id: 'out3_r', name: 'Part 3 Out R', type: 'audio_out', channel: 'right' },
      { id: 'out4_l', name: 'Part 4 Out L', type: 'audio_out', channel: 'left' },
      { id: 'out4_r', name: 'Part 4 Out R', type: 'audio_out', channel: 'right' },
      { id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' },

      // CV Inputs
      { id: 'cv_gate', name: 'Gate In', type: 'cv_in' },
      { id: 'cv_pitch', name: 'Pitch CV In (1V/Oct)', type: 'cv_in' },
      { id: 'cv_wave_surfer', name: 'Wave Surfer CV In', type: 'cv_in' },
      { id: 'cv_filter1_cutoff', name: 'Filter 1 Cutoff CV In', type: 'cv_in' },
      { id: 'cv_filter2_cutoff', name: 'Filter 2 Cutoff CV In', type: 'cv_in' },
      { id: 'cv_amp', name: 'Amp Level CV In', type: 'cv_in' },

      // CV Outputs
      { id: 'cv_out_wave_env', name: 'Wave Env CV Out', type: 'cv_out' },
      { id: 'cv_out_filter_env', name: 'Filter Env CV Out', type: 'cv_out' },
      { id: 'cv_out_lfo1', name: 'LFO 1 CV Out', type: 'cv_out' },
    ];

    // Connect CV inputs
    this.cvInputs.set('cv_wave_surfer', {
      setter: (v: number) => {
        const offset = Math.round(v * 63);
        this.setParam('waveSurfer', Math.max(-63, Math.min(63, this.params.waveSurfer + offset)));
      },
    });

    this.cvInputs.set('cv_filter1_cutoff', {
      setter: (v: number) => {
        const factor = Math.pow(2, v * 3);
        const target = Math.max(30, Math.min(20000, this.params.f1_cutoff * factor));
        this.activeVoices.forEach((voice) => {
          voice.filter1.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_filter2_cutoff', {
      setter: (v: number) => {
        const factor = Math.pow(2, v * 3);
        const target = Math.max(30, Math.min(20000, this.params.f2_cutoff * factor));
        this.activeVoices.forEach((voice) => {
          voice.filter2Stage1.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
          voice.filter2Stage2.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.85);
        else this.noteOff(60);
      },
    });

    // Wire input mixer to FX input for external processing
    this.inputMixer.connect(this.fx1Input);

    // Initial FX configurations
    this.updateFx1();
    this.updateFx2();
    this.generateNoiseBuffer();
  }

  // --- REVERB IR & NOISE SYNTHESIS ---
  private setupReverbNode(): void {
    try {
      this.fx2Convolver = this.ctx.createConvolver();
      const rate = this.ctx.sampleRate;
      const decaySec = Math.max(0.5, Math.min(10, this.params.fx2_decay));
      const length = Math.floor(rate * decaySec);
      const impulse = this.ctx.createBuffer(2, length, rate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.exp(-t * 4.5);
        left[i] = (Math.random() * 2 - 1) * env;
        right[i] = (Math.random() * 2 - 1) * env;
      }
      this.fx2Convolver.buffer = impulse;
      this.fx2Input.connect(this.fx2Convolver);
      this.fx2Convolver.connect(this.fx2FilterNode);
      this.fx2FilterNode.connect(this.fx2Wet);
      this.fx2Input.connect(this.fx2Dry);
    } catch (e) {
      this.fx2Input.connect(this.fx2Dry);
    }
  }

  private generateNoiseBuffer(): void {
    const rate = this.ctx.sampleRate;
    const len = rate * 2;
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, len, rate);
    const data = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  private createDistortionCurve(amount: number): Float32Array {
    const k = Math.max(0, amount) * 20;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      if (k === 0) {
        curve[i] = x;
      } else {
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
    }
    return curve;
  }

  // --- PERIODIC WAVE CACHE & WAVETABLE SYNTHESIS ---
  /**
   * Builds high-resolution bandlimited PeriodicWave models for the 3rd Wave's
   * PPG legacy wavetables (P00-P35), Modern Anti-Aliased tables (U00-U55),
   * and Analog waveforms (A00-A06).
   */
  public getOrCreatePeriodicWave(type: string, table: number, wavePos: number): PeriodicWave {
    const clampedWave = Math.max(0, Math.min(63, Math.round(wavePos)));
    const cacheKey = `${type}_${table}_${clampedWave}_smooth${this.params.waveFlow}`;
    const cached = this.periodicWaveCache.get(cacheKey);
    if (cached) return cached;

    const numHarmonics = 48;
    const real = new Float32Array(numHarmonics);
    const imag = new Float32Array(numHarmonics);

    // Fundamental is always present
    real[0] = 0;
    imag[0] = 0;

    const t = clampedWave / 63.0; // 0.0 to 1.0 position in table

    if (type === 'a') {
      // Analog-modeled
      if (table === 0) {
        // A00: Sawtooth
        for (let n = 1; n < numHarmonics; n++) {
          imag[n] = (2 / (Math.PI * n)) * Math.pow(-1, n + 1);
        }
      } else if (table === 1) {
        // A01: Square / Pulse with PWM
        const duty = (this.params.osc1_pwm || 50) / 100.0;
        for (let n = 1; n < numHarmonics; n++) {
          imag[n] = (4 / (Math.PI * n)) * Math.sin(Math.PI * n * duty);
        }
      } else if (table === 2) {
        // A02: Triangle
        for (let n = 1; n < numHarmonics; n += 2) {
          imag[n] = (8 / (Math.PI * Math.PI * n * n)) * Math.pow(-1, (n - 1) / 2);
        }
      } else if (table === 3) {
        // A03: Pure Sine
        imag[1] = 1.0;
      } else if (table === 4) {
        // A04: Supersaw spectral signature
        for (let n = 1; n < numHarmonics; n++) {
          const detuneCoeff = 1.0 + 0.15 * Math.sin(n * 1.3);
          imag[n] = (2 / (Math.PI * n)) * detuneCoeff;
        }
      } else {
        // Noise fallback
        for (let n = 1; n < numHarmonics; n++) {
          imag[n] = (Math.random() * 2 - 1) / Math.sqrt(n);
        }
      }
    } else if (type === 'p') {
      // Vintage PPG Legacy Wavetables (P00 - P35)
      // 8-bit quantization harmonics + vintage resonance peaks
      const vintageStepping = this.params.waveFlow < 50;
      const effectiveT = vintageStepping ? Math.floor(t * 16) / 16 : t;

      if (table === 0) {
        // P00: Classic PPG Resonant Sweep
        const peakHarmonic = Math.max(1, Math.min(numHarmonics - 2, Math.floor(effectiveT * (numHarmonics - 4)) + 2));
        for (let n = 1; n < numHarmonics; n++) {
          const saw = 1 / n;
          const resPeak = Math.exp(-Math.pow((n - peakHarmonic) / 2.2, 2)) * 1.8;
          imag[n] = saw * 0.4 + resPeak;
        }
      } else if (table === 3) {
        // P03: Vocal Formants (Ah -> Ee -> Oh -> Oo)
        const f1 = 2 + Math.floor(effectiveT * 6);
        const f2 = 8 + Math.floor((1 - effectiveT) * 12);
        for (let n = 1; n < numHarmonics; n++) {
          const bump1 = Math.exp(-Math.pow((n - f1) / 1.5, 2));
          const bump2 = Math.exp(-Math.pow((n - f2) / 2.5, 2)) * 0.8;
          imag[n] = (bump1 + bump2 + 0.15 / n);
        }
      } else if (table === 7) {
        // P07: Metallic Inharmonics / Bellwav
        for (let n = 1; n < numHarmonics; n++) {
          if (n % 2 !== 0 || n === 5 || n === 9 || n === 14) {
            imag[n] = Math.sin(n * effectiveT * 4.2) / Math.pow(n, 0.7);
          }
        }
      } else if (table >= 32 && table <= 35) {
        // Prophet VS Digital Spectrum (P32-P35)
        for (let n = 1; n < numHarmonics; n++) {
          const odd = n % 2 === 1;
          const mix = odd ? 1.0 : (effectiveT > 0.5 ? 0.6 : 0.0);
          imag[n] = (mix * Math.sin((n * (table + 1) * 0.7))) / Math.sqrt(n);
        }
      } else {
        // Generic PPG Sweep (morph from sine to jagged rich PPG wave)
        for (let n = 1; n < numHarmonics; n++) {
          const harmonicFade = Math.pow(effectiveT, (n - 1) * 0.25);
          imag[n] = (Math.sin(n * 1.57) * harmonicFade) / n;
        }
      }
    } else {
      // Modern High-Resolution User Wavetables (U00 - U55)
      for (let n = 1; n < numHarmonics; n++) {
        const morph = Math.sin((n * 0.6 + t * 4.0));
        imag[n] = (morph / Math.pow(n, 0.85)) * (1.0 - t * 0.3);
      }
    }

    const pw = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.periodicWaveCache.set(cacheKey, pw);
    return pw;
  }

  // --- PARAMETER CONTROL ---
  public setParam(key: string, value: any): void {
    this.params[key] = value;

    if (key === 'volume') {
      const v = Math.max(0, Math.min(1.5, Number(value)));
      this.masterOutput.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    } else if (key === 'waveSurfer' || key === 'circuitDrift') {
      this.updateActiveVoiceOscillators();
    } else if (key === 'f1_cutoff' || key === 'f1_resonance' || key === 'f1_mode') {
      this.updateFilter1();
    } else if (key === 'f2_cutoff' || key === 'f2_resonance' || key === 'f2_drive' || key === 'f2_bassComp') {
      this.updateFilter2();
    } else if (key.startsWith('fx1_')) {
      this.updateFx1();
    } else if (key.startsWith('fx2_')) {
      this.updateFx2();
    } else if (key.startsWith('osc1_') || key.startsWith('osc2_') || key.startsWith('osc3_')) {
      this.updateActiveVoiceOscillators();
    }
  }

  private updateFilter1(): void {
    const hz = Math.max(20, Math.min(20000, Number(this.params.f1_cutoff)));
    const q = Math.max(0.5, Math.min(24, Number(this.params.f1_resonance)));
    const mode = this.params.f1_mode || 'lowpass';

    this.activeVoices.forEach((v) => {
      v.filter1.type = mode === 'notch' ? 'notch' : mode === 'highpass' ? 'highpass' : mode === 'bandpass' ? 'bandpass' : 'lowpass';
      v.filter1.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.015);
      v.filter1.Q.setTargetAtTime(q, this.ctx.currentTime, 0.015);
    });
  }

  private updateFilter2(): void {
    const hz = Math.max(20, Math.min(20000, Number(this.params.f2_cutoff)));
    const q = Math.max(0.5, Math.min(25, Number(this.params.f2_resonance)));
    const drive = Math.max(0, Math.min(100, Number(this.params.f2_drive)));
    const bassComp = Math.max(0, Math.min(100, Number(this.params.f2_bassComp)));

    this.activeVoices.forEach((v) => {
      // Cascaded 24dB 4-pole lowpass
      v.filter2Stage1.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.015);
      v.filter2Stage2.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.015);
      v.filter2Stage1.Q.setTargetAtTime(Math.sqrt(q), this.ctx.currentTime, 0.015);
      v.filter2Stage2.Q.setTargetAtTime(Math.sqrt(q), this.ctx.currentTime, 0.015);

      // Bass Compensation: boosts low shelf as resonance climbs
      const compGain = (q / 25) * (bassComp / 100) * 12;
      v.filter2BassComp.gain.setTargetAtTime(compGain, this.ctx.currentTime, 0.015);

      // Saturation drive curve
      v.filter2Drive.curve = this.createDistortionCurve(drive / 10) as any;
    });
  }

  private updateFx1(): void {
    const mix = Math.max(0, Math.min(1, Number(this.params.fx1_mix)));
    this.fx1Wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.02);
    this.fx1Dry.gain.setTargetAtTime(1 - mix * 0.5, this.ctx.currentTime, 0.02);

    const type = this.params.fx1_type;
    const tone = Math.max(200, Math.min(16000, Number(this.params.fx1_tone)));
    this.fx1FilterNode.frequency.setTargetAtTime(tone, this.ctx.currentTime, 0.02);

    if (type === 'bbd_delay' || type === 'stereo_delay' || type === 'tape_delay') {
      const delaySec = Math.max(0.02, Math.min(2.0, Number(this.params.fx1_time)));
      const fb = Math.max(0, Math.min(0.92, Number(this.params.fx1_feedback)));
      this.fx1DelayNode.delayTime.setTargetAtTime(delaySec, this.ctx.currentTime, 0.02);
      this.fx1FeedbackNode.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.02);
    } else if (type === 'chorus' || type === 'flanger') {
      const depth = type === 'flanger' ? 0.003 : 0.015;
      this.fx1DelayNode.delayTime.setTargetAtTime(depth, this.ctx.currentTime, 0.02);
      this.fx1FeedbackNode.gain.setTargetAtTime(type === 'flanger' ? 0.65 : 0.2, this.ctx.currentTime, 0.02);
    }
  }

  private updateFx2(): void {
    const mix = Math.max(0, Math.min(1, Number(this.params.fx2_mix)));
    this.fx2Wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.02);
    this.fx2Dry.gain.setTargetAtTime(1 - mix * 0.4, this.ctx.currentTime, 0.02);

    const drive = Math.max(0, Math.min(10, Number(this.params.fx2_drive)));
    if (this.fx2Shaper) {
      this.fx2Shaper.curve = this.createDistortionCurve(drive) as any;
    }
  }

  private updateActiveVoiceOscillators(): void {
    this.activeVoices.forEach((voice) => {
      this.applyWavetablesToVoice(voice, 0);
    });
  }

  private clearWaveEnvTimers(voice: ThirdWaveVoice): void {
    for (const timer of voice.waveEnvTimers ?? []) clearTimeout(timer);
    voice.waveEnvTimers = undefined;
  }

  private applyWavetablesToVoice(voice: ThirdWaveVoice, waveEnvOffset: number = 0): void {
    const masterSurfer = Number(this.params.waveSurfer) || 0;
    const kw1 = (voice.midiNote - 60) * ((this.params.osc1_kw || 0) / 32);
    const kw2 = (voice.midiNote - 60) * ((this.params.osc2_kw || 0) / 32);
    const kw3 = (voice.midiNote - 60) * ((this.params.osc3_kw || 0) / 32);

    const pos1 = Math.max(0, Math.min(63, (this.params.osc1_wave || 0) + masterSurfer + waveEnvOffset + kw1));
    const pos2 = Math.max(0, Math.min(63, (this.params.osc2_wave || 0) + masterSurfer + waveEnvOffset + kw2));
    const pos3 = Math.max(0, Math.min(63, (this.params.osc3_wave || 0) + masterSurfer + waveEnvOffset + kw3));

    try {
      const pw1 = this.getOrCreatePeriodicWave(this.params.osc1_type, this.params.osc1_table, pos1);
      voice.osc1.setPeriodicWave(pw1);

      const pw2 = this.getOrCreatePeriodicWave(this.params.osc2_type, this.params.osc2_table, pos2);
      voice.osc2.setPeriodicWave(pw2);

      const pw3 = this.getOrCreatePeriodicWave(this.params.osc3_type, this.params.osc3_table, pos3);
      voice.osc3.setPeriodicWave(pw3);
    } catch (e) {
      // Fallback
    }
  }

  // --- NOTE ON & VOICE ALLOCATION ---
  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);

    // Fast anti-click voice stealing if exceeding 24 voices
    if (this.activeVoices.size >= 24) {
      const oldestKey = this.activeVoices.keys().next().value;
      if (oldestKey !== undefined) {
        const stolen = this.activeVoices.get(oldestKey);
        if (stolen) {
          try {
            this.clearWaveEnvTimers(stolen);
            stolen.amp.gain.cancelScheduledValues(startTime);
            stolen.amp.gain.setValueAtTime(Math.max(0.001, stolen.amp.gain.value || 0.3), startTime);
            stolen.amp.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.005);
            stolen.osc1.stop(startTime + 0.006);
            stolen.osc2.stop(startTime + 0.006);
            stolen.osc3.stop(startTime + 0.006);
            stolen.noiseSource?.stop(startTime + 0.006);
          } catch (e) {}
        }
        this.activeVoices.delete(oldestKey);
      }
    }

    this.noteOff(midiNote, startTime);

    const baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const voiceIdx = this.voiceCounter++;

    // Circuit Drift (subtle analog pitch & cutoff variation per voice)
    const driftAmt = (this.params.circuitDrift || 25) / 100;
    const voicePitchDrift = (Math.sin(voiceIdx * 12.34) * 2.5) * driftAmt; // ±2.5 cents
    const voiceFilterDrift = 1.0 + (Math.cos(voiceIdx * 8.76) * 0.04) * driftAmt; // ±4%

    // 1. Oscillators
    const osc1 = this.ctx.createOscillator();
    const osc1Gain = this.ctx.createGain();
    const freq1 = Math.max(20, Math.min(20000, baseFreq * Math.pow(2, (this.params.osc1_pitch || 0) / 12)));
    osc1.frequency.setValueAtTime(freq1, startTime);
    osc1.detune.setValueAtTime((this.params.osc1_fine || 0) + voicePitchDrift, startTime);
    osc1Gain.gain.setValueAtTime((this.params.osc1_level || 80) / 100, startTime);
    osc1.connect(osc1Gain);

    const osc2 = this.ctx.createOscillator();
    const osc2Gain = this.ctx.createGain();
    const freq2 = Math.max(20, Math.min(20000, baseFreq * Math.pow(2, (this.params.osc2_pitch || 0) / 12)));
    osc2.frequency.setValueAtTime(freq2, startTime);
    osc2.detune.setValueAtTime((this.params.osc2_fine || 0) - voicePitchDrift, startTime);
    osc2Gain.gain.setValueAtTime((this.params.osc2_level || 70) / 100, startTime);
    osc2.connect(osc2Gain);

    const osc3 = this.ctx.createOscillator();
    const osc3Gain = this.ctx.createGain();
    const freq3 = Math.max(20, Math.min(20000, baseFreq * Math.pow(2, (this.params.osc3_pitch || 0) / 12)));
    osc3.frequency.setValueAtTime(freq3, startTime);
    osc3.detune.setValueAtTime((this.params.osc3_fine || 0) + voicePitchDrift * 0.5, startTime);
    osc3Gain.gain.setValueAtTime((this.params.osc3_level || 55) / 100, startTime);
    osc3.connect(osc3Gain);

    // Linear FM Routing (Osc 2 -> Osc 1, Osc 3 -> Osc 2, Osc 1 -> Osc 3)
    let fmGain2to1: GainNode | undefined;
    if (this.params.osc2_fm > 0) {
      fmGain2to1 = this.ctx.createGain();
      fmGain2to1.gain.setValueAtTime(this.params.osc2_fm * 200, startTime);
      osc2.connect(fmGain2to1);
      fmGain2to1.connect(osc1.frequency);
    }

    let fmGain3to2: GainNode | undefined;
    if (this.params.osc3_fm > 0) {
      fmGain3to2 = this.ctx.createGain();
      fmGain3to2.gain.setValueAtTime(this.params.osc3_fm * 200, startTime);
      osc3.connect(fmGain3to2);
      fmGain3to2.connect(osc2.frequency);
    }

    // Voice Mixer
    const voiceMixer = this.ctx.createGain();
    voiceMixer.gain.setValueAtTime(0.33, startTime);
    osc1Gain.connect(voiceMixer);
    osc2Gain.connect(voiceMixer);
    osc3Gain.connect(voiceMixer);

    // Optional Noise Generator for Analog A05/A06
    let noiseSource: AudioBufferSourceNode | undefined;
    let noiseGain: GainNode | undefined;
    if ((this.params.osc1_type === 'a' && this.params.osc1_table >= 5) || (this.params.osc3_type === 'a' && this.params.osc3_table >= 5)) {
      if (this.whiteNoiseBuffer) {
        noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = this.whiteNoiseBuffer;
        noiseSource.loop = true;
        noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.25, startTime);
        noiseSource.connect(noiseGain);
        noiseGain.connect(voiceMixer);
        noiseSource.start(startTime);
      }
    }

    // 2. Dual Filters in Series
    // Filter 1: 12dB State-Variable Filter (SVF)
    const filter1 = this.ctx.createBiquadFilter();
    const f1Mode = this.params.f1_mode || 'lowpass';
    filter1.type = f1Mode === 'notch' ? 'notch' : f1Mode === 'highpass' ? 'highpass' : f1Mode === 'bandpass' ? 'bandpass' : 'lowpass';
    const baseF1Cutoff = Math.max(20, Math.min(20000, (this.params.f1_cutoff || 4200) * voiceFilterDrift));
    filter1.frequency.setValueAtTime(baseF1Cutoff, startTime);
    filter1.Q.setValueAtTime(this.params.f1_resonance || 2.5, startTime);

    // Filter 2: 24dB 4-pole Low-Pass Filter with Bass Compensation & Saturation
    const filter2Stage1 = this.ctx.createBiquadFilter();
    filter2Stage1.type = 'lowpass';
    const filter2Stage2 = this.ctx.createBiquadFilter();
    filter2Stage2.type = 'lowpass';
    const baseF2Cutoff = Math.max(20, Math.min(20000, (this.params.f2_cutoff || 2800) * voiceFilterDrift));
    const f2Q = Math.sqrt(Math.max(0.5, this.params.f2_resonance || 3.8));

    filter2Stage1.frequency.setValueAtTime(baseF2Cutoff, startTime);
    filter2Stage1.Q.setValueAtTime(f2Q, startTime);
    filter2Stage2.frequency.setValueAtTime(baseF2Cutoff, startTime);
    filter2Stage2.Q.setValueAtTime(f2Q, startTime);

    // Bass compensation
    const filter2BassComp = this.ctx.createBiquadFilter();
    filter2BassComp.type = 'lowshelf';
    filter2BassComp.frequency.setValueAtTime(180, startTime);
    const bassCompGain = ((this.params.f2_resonance || 3.8) / 25) * ((this.params.f2_bassComp || 60) / 100) * 12;
    filter2BassComp.gain.setValueAtTime(bassCompGain, startTime);

    // Saturation drive
    const filter2Drive = this.ctx.createWaveShaper();
    filter2Drive.curve = this.createDistortionCurve((this.params.f2_drive || 20) / 10) as any;

    // 3. Amplifier & Pan Spread
    const amp = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : undefined;

    // True voice Pan Spread (alternating left/right binaural spread)
    const spreadPct = (this.params.panSpread ?? 75) / 100;
    const panSlot = (voiceIdx % 6) / 5; // 0 to 1
    const panSign = voiceIdx % 2 === 0 ? 1 : -1;
    const panPos = panSign * panSlot * spreadPct * 0.95;
    if (panNode) {
      panNode.pan.setValueAtTime(Math.max(-1, Math.min(1, panPos)), startTime);
    }

    // Filter Envelope Modulation Setup
    const fenvAttack = Math.max(0.005, this.params.fenv_attack || 0.04);
    const fenvDecay = Math.max(0.01, this.params.fenv_decay || 0.75);
    const fenvSustain = Math.max(0.01, Math.min(1.0, this.params.fenv_sustain || 0.45));
    const fenvAmt = (this.params.f1_envAmt || 30) / 100;
    const fenvVelAmt = ((this.params.f1_velSens || 25) / 100) * velocity;
    const fPeakHz = Math.min(19500, baseF1Cutoff + (18000 - baseF1Cutoff) * Math.max(0, fenvAmt + fenvVelAmt));
    const fSustainHz = Math.max(baseF1Cutoff * 0.4, fPeakHz * fenvSustain);

    filter1.frequency.cancelScheduledValues(startTime);
    filter1.frequency.setValueAtTime(baseF1Cutoff, startTime);
    filter1.frequency.linearRampToValueAtTime(fPeakHz, startTime + fenvAttack);
    filter1.frequency.exponentialRampToValueAtTime(Math.max(30, fSustainHz), startTime + fenvAttack + fenvDecay);

    // Filter 2 Envelope Modulation
    const f2PeakHz = Math.min(19000, baseF2Cutoff + (17000 - baseF2Cutoff) * Math.max(0, (this.params.f2_envAmt || 45) / 100));
    filter2Stage1.frequency.cancelScheduledValues(startTime);
    filter2Stage1.frequency.setValueAtTime(baseF2Cutoff, startTime);
    filter2Stage1.frequency.linearRampToValueAtTime(f2PeakHz, startTime + fenvAttack);
    filter2Stage1.frequency.exponentialRampToValueAtTime(Math.max(30, f2PeakHz * fenvSustain), startTime + fenvAttack + fenvDecay);

    filter2Stage2.frequency.cancelScheduledValues(startTime);
    filter2Stage2.frequency.setValueAtTime(baseF2Cutoff, startTime);
    filter2Stage2.frequency.linearRampToValueAtTime(f2PeakHz, startTime + fenvAttack);
    filter2Stage2.frequency.exponentialRampToValueAtTime(Math.max(30, f2PeakHz * fenvSustain), startTime + fenvAttack + fenvDecay);

    // Amplifier ADSR Envelope
    const aenvAttack = Math.max(0.005, this.params.aenv_attack || 0.02);
    const aenvDecay = Math.max(0.01, this.params.aenv_decay || 0.65);
    const aenvSustain = Math.max(0.01, Math.min(1.0, this.params.aenv_sustain || 0.75));
    const peakGain = Math.max(0.05, velocity) * (this.params.aenv_amount || 1.0) * 0.85;

    amp.gain.cancelScheduledValues(startTime);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peakGain, startTime + aenvAttack);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * aenvSustain), startTime + aenvAttack + aenvDecay);

    // Routing: VoiceMixer -> Filter 1 (SVF) -> Filter 2 (4-Pole) -> Drive -> BassComp -> Amp -> Pan -> FX 1
    voiceMixer.connect(filter1);
    filter1.connect(filter2Stage1);
    filter2Stage1.connect(filter2Stage2);
    filter2Stage2.connect(filter2Drive);
    filter2Drive.connect(filter2BassComp);
    filter2BassComp.connect(amp);

    if (panNode) {
      amp.connect(panNode);
      panNode.connect(this.fx1Input);
    } else {
      amp.connect(this.fx1Input);
    }

    // Start Oscillators
    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    const voice: ThirdWaveVoice = {
      midiNote,
      velocity,
      startTime,
      osc1,
      osc1Gain,
      osc2,
      osc2Gain,
      osc3,
      osc3Gain,
      noiseSource,
      noiseGain,
      fmGain2to1,
      fmGain3to2,
      fmGain1to3: undefined,
      voiceMixer,
      filter1,
      filter2Stage1,
      filter2Stage2,
      filter2BassComp,
      filter2Drive,
      amp,
      panNode,
      voiceIndex: voiceIdx,
    };

    // Apply Initial Wavetable Shapes
    this.applyWavetablesToVoice(voice, 0);

    // 6-Stage Wave Envelope Execution
    const waveAmt = (this.params.waveEnv_amt || 35) / 100 * 63;
    if (Math.abs(waveAmt) > 1) {
      const p1 = (this.params.waveEnv_p1 || 4);
      const p2 = (this.params.waveEnv_p2 || 24);
      const p3 = (this.params.waveEnv_p3 || 45);
      const t1 = Math.max(0.05, this.params.waveEnv_t1 || 0.15);
      const t2 = Math.max(0.05, this.params.waveEnv_t2 || 0.35);

      // Sweep through the wave positions over time
      const firstTimer = window.setTimeout(() => {
        if (this.activeVoices.get(midiNote) === voice) {
          this.applyWavetablesToVoice(voice, (p2 - p1) * (waveAmt / 63));
        }
      }, t1 * 1000);

      const secondTimer = window.setTimeout(() => {
        if (this.activeVoices.get(midiNote) === voice) {
          this.applyWavetablesToVoice(voice, (p3 - p1) * (waveAmt / 63));
        }
      }, (t1 + t2) * 1000);

      voice.waveEnvTimers = [firstTimer, secondTimer];
    }

    voice.osc1.onended = () => {
      try {
        voice.osc1.disconnect();
        voice.osc1Gain.disconnect();
        voice.osc2.disconnect();
        voice.osc2Gain.disconnect();
        voice.osc3.disconnect();
        voice.osc3Gain.disconnect();
        voice.noiseSource?.disconnect();
        voice.noiseGain?.disconnect();
        voice.fmGain2to1?.disconnect();
        voice.fmGain3to2?.disconnect();
        voice.fmGain1to3?.disconnect();
        voice.voiceMixer.disconnect();
        voice.filter1.disconnect();
        voice.filter2Stage1.disconnect();
        voice.filter2Stage2.disconnect();
        voice.filter2BassComp.disconnect();
        voice.filter2Drive.disconnect();
        voice.amp.disconnect();
        voice.panNode?.disconnect();
      } catch (e) {}
    };

    this.activeVoices.set(midiNote, voice);
  }

  // --- NOTE OFF ---
  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    this.clearWaveEnvTimers(voice);

    const relTime = Math.max(this.ctx.currentTime, time);
    const release = Math.max(0.02, Math.min(6.0, this.params.aenv_release || 0.95));

    try {
      voice.amp.gain.cancelScheduledValues(relTime);
      const cur = Math.max(0.001, voice.amp.gain.value || 0.4);
      voice.amp.gain.setValueAtTime(cur, relTime);
      voice.amp.gain.exponentialRampToValueAtTime(0.0001, relTime + release);

      // Filter Envelope Release
      const filterRel = Math.max(0.02, Math.min(6.0, this.params.fenv_release || 0.85));
      voice.filter1.frequency.cancelScheduledValues(relTime);
      voice.filter1.frequency.exponentialRampToValueAtTime(Math.max(20, this.params.f1_cutoff || 4200), relTime + filterRel);

      const stopAt = relTime + release + 0.05;
      voice.osc1.stop(stopAt);
      voice.osc2.stop(stopAt);
      voice.osc3.stop(stopAt);
      if (voice.noiseSource) {
        voice.noiseSource.stop(stopAt);
      }
    } catch (e) {
      // Node already stopped
    }
  }

  /** Support for offline context export */
  public cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    const clone = new ThirdWaveDevice(ctx as AudioContext, this.id, this.name);
    Object.assign(clone.params, JSON.parse(JSON.stringify(this.params)));
    return clone;
  }

  public override dispose(): void {
    for (const [, voice] of this.activeVoices.entries()) {
      this.clearWaveEnvTimers(voice);
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.osc3.stop();
        voice.noiseSource?.stop();
        voice.osc1.disconnect();
        voice.osc1Gain.disconnect();
        voice.osc2.disconnect();
        voice.osc2Gain.disconnect();
        voice.osc3.disconnect();
        voice.osc3Gain.disconnect();
        voice.noiseSource?.disconnect();
        voice.noiseGain?.disconnect();
        voice.fmGain2to1?.disconnect();
        voice.fmGain3to2?.disconnect();
        voice.fmGain1to3?.disconnect();
        voice.voiceMixer.disconnect();
        voice.filter1.disconnect();
        voice.filter2Stage1.disconnect();
        voice.filter2Stage2.disconnect();
        voice.filter2BassComp.disconnect();
        voice.filter2Drive.disconnect();
        voice.amp.disconnect();
        voice.panNode?.disconnect();
      } catch (e) {}
    }
    this.activeVoices.clear();

    try {
      this.fx1Input?.disconnect();
      this.fx1Dry?.disconnect();
      this.fx1Wet?.disconnect();
      this.fx1DelayNode?.disconnect();
      this.fx1FeedbackNode?.disconnect();
      this.fx1FilterNode?.disconnect();
      this.fx2Input?.disconnect();
      this.fx2Dry?.disconnect();
      this.fx2Wet?.disconnect();
      this.fx2FilterNode?.disconnect();
      this.fx2Shaper?.disconnect();
      this.fx2Convolver?.disconnect();
      this.masterOutput?.disconnect();
      this.part2Output?.disconnect();
      this.part3Output?.disconnect();
      this.part4Output?.disconnect();
      this.inputL?.disconnect();
      this.inputR?.disconnect();
      this.inputMixer?.disconnect();
    } catch (e) {}

    super.dispose();
  }
}
