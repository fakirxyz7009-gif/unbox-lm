import { BaseDevice } from '../BaseDevice.ts';
import { DrumVoice } from '../types.ts';

export class RedrumDevice extends BaseDevice {
  private masterOutput: GainNode;
  public voices: DrumVoice[] = [];
  public currentStep: number = 0;

  constructor(ctx: AudioContext, id: string = 'redrum_1', name: string = 'Redrum Drum Computer') {
    super(ctx, id, name, 'redrum', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.9;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    // Initial 8 drum channels
    this.voices = [
      { id: 'bd', name: 'Bass Drum 1', pitch: 55, decay: 0.35, tone: 0.8, level: 0.9, pan: 0, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'sd', name: 'Snare Drum', pitch: 180, decay: 0.22, tone: 0.7, level: 0.85, pan: 0.1, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'ch', name: 'Closed HiHat', pitch: 6500, decay: 0.08, tone: 0.9, level: 0.7, pan: -0.25, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'oh', name: 'Open HiHat', pitch: 6500, decay: 0.45, tone: 0.85, level: 0.7, pan: -0.3, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'cp', name: 'Hand Clap', pitch: 1200, decay: 0.28, tone: 0.6, level: 0.8, pan: 0.2, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'lt', name: 'Low Tom', pitch: 110, decay: 0.3, tone: 0.5, level: 0.75, pan: -0.4, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'ht', name: 'High Tom', pitch: 220, decay: 0.25, tone: 0.6, level: 0.75, pan: 0.4, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
      { id: 'cr', name: 'Crash / Rim', pitch: 4500, decay: 0.8, tone: 0.8, level: 0.7, pan: 0.35, mute: false, solo: false, pattern: Array(16).fill(false), accentPattern: Array(16).fill(false) },
    ];

    // Seed classic default groovy beat
    // Kick on 1, 7, 11
    this.voices[0].pattern[0] = true;
    this.voices[0].pattern[6] = true;
    this.voices[0].pattern[10] = true;
    this.voices[0].accentPattern[0] = true;

    // Snare on 4, 12
    this.voices[1].pattern[4] = true;
    this.voices[1].pattern[12] = true;
    this.voices[1].accentPattern[4] = true;

    // Hi-hats 16th notes with accents on off-beats
    for (let i = 0; i < 16; i += 2) {
      this.voices[2].pattern[i] = true;
    }
    this.voices[3].pattern[14] = true; // open hat scoop

    // Clap on 12
    this.voices[4].pattern[12] = true;

    this.params = {
      volume: 0.9,
      shuffle: 0.15,
      accentLevel: 1.3,
    };

    this.ports = [
      { id: 'out_l', name: 'Master Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Master Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_gate_bd', name: 'Gate In Kick', type: 'cv_in' },
      { id: 'cv_gate_sd', name: 'Gate In Snare', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_gate_bd', {
      setter: (gate: number) => {
        if (gate > 0.5) this.triggerPad(0, 1.0);
      },
    });
    this.cvInputs.set('cv_gate_sd', {
      setter: (gate: number) => {
        if (gate > 0.5) this.triggerPad(1, 1.0);
      },
    });
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    }
  }

  public toggleStep(voiceIndex: number, stepIndex: number): void {
    if (this.voices[voiceIndex]) {
      this.voices[voiceIndex].pattern[stepIndex] = !this.voices[voiceIndex].pattern[stepIndex];
    }
  }

  public toggleAccent(voiceIndex: number, stepIndex: number): void {
    if (this.voices[voiceIndex]) {
      this.voices[voiceIndex].accentPattern[stepIndex] = !this.voices[voiceIndex].accentPattern[stepIndex];
    }
  }

  public triggerPad(voiceIndex: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const v = this.voices[voiceIndex];
    if (!v || v.mute) return;

    // Solo check
    const anySolo = this.voices.some((x) => x.solo);
    if (anySolo && !v.solo) return;

    const gain = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panNode) {
      panNode.pan.setValueAtTime(v.pan, time);
      gain.connect(panNode);
      panNode.connect(this.masterOutput);
    } else {
      gain.connect(this.masterOutput);
    }

    const vel = velocity * v.level;

    switch (voiceIndex) {
      case 0: // Bass Drum
        this.synthKick(gain, v, vel, time);
        break;
      case 1: // Snare
        this.synthSnare(gain, v, vel, time);
        break;
      case 2: // Closed HH
        this.synthHiHat(gain, v, vel, false, time);
        break;
      case 3: // Open HH
        this.synthHiHat(gain, v, vel, true, time);
        break;
      case 4: // Clap
        this.synthClap(gain, v, vel, time);
        break;
      case 5: // Low Tom
      case 6: // High Tom
        this.synthTom(gain, v, vel, time);
        break;
      case 7: // Crash / Rim
        this.synthCrash(gain, v, vel, time);
        break;
    }
  }

  private synthKick(gain: GainNode, v: DrumVoice, vel: number, time: number) {
    const osc = this.ctx.createOscillator();
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();

    osc.frequency.setValueAtTime(v.pitch * 3.5, time);
    osc.frequency.exponentialRampToValueAtTime(v.pitch * 0.8, time + 0.08);
    osc.frequency.exponentialRampToValueAtTime(35, time + v.decay);

    click.frequency.setValueAtTime(800, time);
    clickGain.gain.setValueAtTime(vel * 0.6, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
    click.connect(clickGain);
    clickGain.connect(gain);

    gain.gain.setValueAtTime(vel * 1.1, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + v.decay);

    osc.connect(gain);
    osc.start(time);
    click.start(time);
    osc.stop(time + v.decay);
    click.stop(time + 0.02);
  }

  private synthSnare(gain: GainNode, v: DrumVoice, vel: number, time: number) {
    // Body tone
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(v.pitch, time);
    osc.frequency.exponentialRampToValueAtTime(v.pitch * 0.5, time + 0.1);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(vel * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    osc.connect(toneGain);
    toneGain.connect(gain);

    // Noise burst
    const noise = this.createNoiseNode();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vel * 0.9, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + v.decay);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(gain);

    osc.start(time);
    osc.stop(time + 0.15);
    noise.start(time);
    noise.stop(time + v.decay);
  }

  private synthHiHat(gain: GainNode, v: DrumVoice, vel: number, isOpen: boolean, time: number) {
    const noise = this.createNoiseNode();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(v.pitch, time);
    filter.Q.setValueAtTime(4.0, time);

    const dur = isOpen ? v.decay * 1.5 : v.decay * 0.6;
    gain.gain.setValueAtTime(vel * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    noise.start(time);
    noise.stop(time + dur);
  }

  private synthClap(gain: GainNode, v: DrumVoice, vel: number, time: number) {
    // Multi-pulse clap attack
    [0, 0.012, 0.025].forEach((offset) => {
      const pulseNoise = this.createNoiseNode();
      const pFilter = this.ctx.createBiquadFilter();
      pFilter.type = 'bandpass';
      pFilter.frequency.setValueAtTime(1400, time + offset);
      pFilter.Q.setValueAtTime(2.0, time + offset);

      const pGain = this.ctx.createGain();
      pGain.gain.setValueAtTime(vel * 0.6, time + offset);
      pGain.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.02);

      pulseNoise.connect(pFilter);
      pFilter.connect(pGain);
      pGain.connect(gain);

      pulseNoise.start(time + offset);
      pulseNoise.stop(time + offset + 0.025);
    });

    // Main tail
    const mainNoise = this.createNoiseNode();
    const mFilter = this.ctx.createBiquadFilter();
    mFilter.type = 'bandpass';
    mFilter.frequency.setValueAtTime(1200, time + 0.03);

    const mGain = this.ctx.createGain();
    mGain.gain.setValueAtTime(vel * 0.85, time + 0.03);
    mGain.gain.exponentialRampToValueAtTime(0.0001, time + v.decay);

    mainNoise.connect(mFilter);
    mFilter.connect(mGain);
    mGain.connect(gain);

    mainNoise.start(time + 0.03);
    mainNoise.stop(time + v.decay);
  }

  private synthTom(gain: GainNode, v: DrumVoice, vel: number, time: number) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(v.pitch * 2, time);
    osc.frequency.exponentialRampToValueAtTime(v.pitch, time + 0.07);

    gain.gain.setValueAtTime(vel * 0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + v.decay);

    osc.connect(gain);
    osc.start(time);
    osc.stop(time + v.decay);
  }

  private synthCrash(gain: GainNode, v: DrumVoice, vel: number, time: number) {
    const noise = this.createNoiseNode();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(v.pitch, time);

    gain.gain.setValueAtTime(vel * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + v.decay);

    noise.connect(filter);
    filter.connect(gain);
    noise.start(time);
    noise.stop(time + v.decay);
  }

  private createNoiseNode(): AudioBufferSourceNode {
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    return whiteNoise;
  }

  public noteOn(midiNote: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    const voiceIndex = (((midiNote - 60) % this.voices.length) + this.voices.length) % this.voices.length;
    this.triggerPad(voiceIndex, velocity, Math.max(this.ctx.currentTime, time || this.ctx.currentTime));
  }

  public noteOff(_midiNote: number, _time?: number): void {
    // One-shot drum synthesis handles its own decay envelope
  }

  public onStepTick(step: number, _time: number = this.ctx.currentTime): void {
    // Rack step visual counter only — main pattern & song playback is driven exclusively by the Sequencer
    this.currentStep = step % 16;
  }
}
