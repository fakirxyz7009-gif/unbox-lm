import { BaseDevice } from '../BaseDevice.ts';

interface EmberVoice {
  oscMain: OscillatorNode;
  oscWarm: OscillatorNode;
  oscSpark: OscillatorNode;
  formantFilter: BiquadFilterNode;
  ladderFilter: BiquadFilterNode;
  shaper: WaveShaperNode;
  gain: GainNode;
}

export class EmberDevice extends BaseDevice {
  private masterOutput: GainNode;
  private activeVoices: Map<number, EmberVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'ember_1', name: string = 'Ember Synthesizer Module') {
    super(ctx, id, name, 'ember', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      oscWave: 'sawtooth',
      warmWave: 'triangle',
      thermalDrift: 12,     // analog pitch drift / warmth detune in cents
      emberHarmonics: 0.55, // upper octave harmonic shimmer level
      formantFreq: 1150,    // vocal/wooden formant peak frequency
      warmthDrive: 0.4,     // analog tube saturation
      cutoff: 2600,
      resonance: 4.2,
      attack: 0.025,
      decay: 0.42,
      sustain: 0.7,
      release: 0.55,
      volume: 0.85,
      // Modulation Container Slots
      modSlot1Source: 'LFO 2 (Triangle)',
      modSlot1Target: 'Thermal Drift',
      modSlot1Depth: 0.38,
      modSlot2Source: 'Macro Envelope',
      modSlot2Target: 'Formant Shift',
      modSlot2Depth: 0.62,
      // Macro Control Knobs
      macroGlow: 0.55,
      macroHeat: 0.4,
      macroAir: 0.5,
      macroBloom: 0.45,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in', description: 'Modulates Ember ladder filter' },
      { id: 'cv_formant', name: 'Formant CV In', type: 'cv_in', description: 'Modulates Ember formant resonator' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in', description: '1V/Oct Pitch modulation' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(18000, Math.max(40, this.resolveCutoffHz(this.params.cutoff) * mod));
        this.activeVoices.forEach((v) => {
          v.ladderFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_formant', {
      setter: (amount: number) => {
        const target = Math.min(6000, Math.max(250, (this.params.formantFreq || 1150) * Math.pow(2, amount * 2)));
        this.activeVoices.forEach((v) => {
          v.formantFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });
  }

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2600;
    if (n <= 1.5) {
      return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    }
    return Math.max(40, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 4.2;
    if (n <= 1.0) {
      return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    }
    return Math.max(0.5, Math.min(18, n));
  }

  private makeTubeWarmthCurve(drive: number): Float32Array {
    const k = Math.max(0.5, drive * 45);
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * (1 + k * 0.12));
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
        v.ladderFilter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
      });
    } else if (key === 'resonance') {
      const q = this.resolveResonanceQ(value);
      this.params.resonance = q;
      this.activeVoices.forEach((v) => {
        v.ladderFilter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.02);
      });
    } else if (key === 'macroGlow') {
      const v = Math.max(0, Math.min(1, Number(value)));
      this.params.macroGlow = v;
      this.params.emberHarmonics = Number((0.15 + v * 0.8).toFixed(2));
      this.setParam('cutoff', Math.round(240 + v * 10500));
    } else if (key === 'macroHeat') {
      const v = Math.max(0, Math.min(1, Number(value)));
      this.params.macroHeat = v;
      this.params.warmthDrive = Number((0.1 + v * 0.85).toFixed(2));
      this.params.thermalDrift = Math.round(4 + v * 28);
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (midiNote - 69) / 12)));
    const drift = (Math.random() - 0.5) * (this.params.thermalDrift || 12);

    const oscMain = this.ctx.createOscillator();
    oscMain.type = this.params.oscWave || 'sawtooth';
    oscMain.frequency.setValueAtTime(freq, startTime);
    oscMain.detune.setValueAtTime(drift, startTime);

    const oscWarm = this.ctx.createOscillator();
    oscWarm.type = this.params.warmWave || 'triangle';
    oscWarm.frequency.setValueAtTime(freq * 0.5, startTime);
    oscWarm.detune.setValueAtTime(-drift * 0.7, startTime);

    const oscSpark = this.ctx.createOscillator();
    oscSpark.type = 'sine';
    oscSpark.frequency.setValueAtTime(Math.min(18000, freq * 2), startTime);
    oscSpark.detune.setValueAtTime(8 + drift, startTime);

    const sparkGain = this.ctx.createGain();
    sparkGain.gain.setValueAtTime((this.params.emberHarmonics ?? 0.55) * 0.45, startTime);
    oscSpark.connect(sparkGain);

    // Formant Bandpass/Peaking Filter for organic warmth
    const formantFilter = this.ctx.createBiquadFilter();
    formantFilter.type = 'peaking';
    formantFilter.frequency.setValueAtTime(this.params.formantFreq || 1150, startTime);
    formantFilter.Q.setValueAtTime(3.8, startTime);
    formantFilter.gain.setValueAtTime(7.5, startTime);

    // 24dB-style Warm Ladder Filter
    const ladderFilter = this.ctx.createBiquadFilter();
    ladderFilter.type = 'lowpass';
    const baseCutoff = this.resolveCutoffHz(this.params.cutoff);
    ladderFilter.frequency.setValueAtTime(baseCutoff, startTime);
    ladderFilter.frequency.exponentialRampToValueAtTime(
      Math.min(18000, baseCutoff * 2.2),
      startTime + Math.max(0.015, this.params.attack)
    );
    ladderFilter.frequency.exponentialRampToValueAtTime(
      Math.max(80, baseCutoff),
      startTime + this.params.attack + this.params.decay
    );
    ladderFilter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.makeTubeWarmthCurve(this.params.warmthDrive ?? 0.4) as any;

    const voiceGain = this.ctx.createGain();
    const peakGain = Math.max(0.05, Math.min(1.0, velocity * 0.54));
    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(peakGain, startTime + Math.max(0.008, this.params.attack));
    voiceGain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, peakGain * this.params.sustain),
      startTime + this.params.attack + this.params.decay
    );

    oscMain.connect(formantFilter);
    oscWarm.connect(formantFilter);
    sparkGain.connect(formantFilter);
    formantFilter.connect(ladderFilter);
    ladderFilter.connect(shaper);
    shaper.connect(voiceGain);
    voiceGain.connect(this.masterOutput);

    oscMain.start(startTime);
    oscWarm.start(startTime);
    oscSpark.start(startTime);

    this.activeVoices.set(midiNote, {
      oscMain,
      oscWarm,
      oscSpark,
      formantFilter,
      ladderFilter,
      shaper,
      gain: voiceGain,
    });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    const releaseTime = Math.max(this.ctx.currentTime, time);
    const rel = Math.max(0.04, this.params.release || 0.45);

    try {
      if (releaseTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(releaseTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.35), releaseTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime + rel);

      const stopAt = releaseTime + rel + 0.03;
      voice.oscMain.stop(stopAt);
      voice.oscWarm.stop(stopAt);
      voice.oscSpark.stop(stopAt);
    } catch (e) {}
  }

  public dispose(): void {
    this.activeVoices.forEach((_, note) => this.noteOff(note));
    this.masterOutput.disconnect();
  }
}
