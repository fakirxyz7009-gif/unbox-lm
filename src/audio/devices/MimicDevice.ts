import { BaseDevice } from '../BaseDevice.ts';

export interface SamplerPad {
  id: number;
  name: string;
  volume: number;
  pan: number;
  pitchSemi: number;
  buffer: AudioBuffer | null;
  synthPreset: string;
}

export class MimicDevice extends BaseDevice {
  private masterOutput: GainNode;
  public pads: SamplerPad[] = [];

  constructor(ctx: AudioContext, id: string = 'mimic_1', name: string = 'Mimic Creative Sampler') {
    super(ctx, id, name, 'mimic', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.85;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    const padNames = [
      'Concert Grand',
      'Vintage Rhodes',
      'Sub 808 Bass',
      'Slap Funk Bass',
      'Studio Snare',
      'Punch 909 Kick',
      'Vinyl Soul Stab',
      'Analog Strings',
    ];

    this.pads = padNames.map((name, idx) => ({
      id: idx,
      name,
      volume: 0.85,
      pan: 0,
      pitchSemi: 0,
      buffer: null,
      synthPreset: name,
    }));

    this.params = {
      volume: 0.85,
      pitchGlobal: 0,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_gate_pad1', name: 'Pad 1 Gate In', type: 'cv_in' },
      { id: 'cv_gate_pad2', name: 'Pad 2 Gate In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_gate_pad1', {
      setter: (gate: number) => {
        if (gate > 0.5) this.triggerPad(0, 1.0);
      },
    });
    this.cvInputs.set('cv_gate_pad2', {
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

  public async loadSampleFile(padIndex: number, file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    if (this.pads[padIndex]) {
      this.pads[padIndex].buffer = audioBuffer;
      this.pads[padIndex].name = file.name.replace(/\.[^/.]+$/, '').slice(0, 16);
    }
  }

  public triggerPad(padIndex: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const pad = this.pads[padIndex];
    if (!pad) return;

    if (pad.buffer) {
      // Play user custom audio sample
      const src = this.ctx.createBufferSource();
      src.buffer = pad.buffer;
      const rate = Math.pow(2, (pad.pitchSemi + this.params.pitchGlobal) / 12);
      src.playbackRate.setValueAtTime(rate, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(velocity * pad.volume, time);
      src.connect(gain);
      gain.connect(this.masterOutput);
      src.start(time);
      return;
    }

    // High fidelity modeled acoustic / electric instrument synthesis
    this.playModeledInstrument(padIndex, velocity, time);
  }

  private playModeledInstrument(padIndex: number, vel: number, time: number) {
    const pad = this.pads[padIndex];
    const gain = this.ctx.createGain();
    const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    if (panNode) {
      panNode.pan.setValueAtTime(pad.pan, time);
      gain.connect(panNode);
      panNode.connect(this.masterOutput);
    } else {
      gain.connect(this.masterOutput);
    }

    const freqMultiplier = Math.pow(2, (pad.pitchSemi + this.params.pitchGlobal) / 12);

    switch (padIndex) {
      case 0: { // Concert Grand Piano
        const root = 261.63 * freqMultiplier; // C4
        [1, 2, 3, 4].forEach((harmonic, idx) => {
          const osc = this.ctx.createOscillator();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(root * harmonic + (idx * 0.4), time);
          const hGain = this.ctx.createGain();
          const amp = vel * (1 / (idx + 1)) * 0.4;
          hGain.gain.setValueAtTime(amp, time);
          hGain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2 / (idx + 1));
          osc.connect(hGain);
          hGain.connect(gain);
          osc.start(time);
          osc.stop(time + 2.4);
        });
        break;
      }
      case 1: { // Rhodes Bell
        const root = 329.63 * freqMultiplier; // E4
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(root, time);
        const tines = this.ctx.createOscillator();
        tines.type = 'sine';
        tines.frequency.setValueAtTime(root * 5.2, time);
        const tGain = this.ctx.createGain();
        tGain.gain.setValueAtTime(vel * 0.35, time);
        tGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
        tines.connect(tGain);
        tGain.connect(gain);

        gain.gain.setValueAtTime(vel * 0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
        osc.connect(gain);
        osc.start(time);
        tines.start(time);
        osc.stop(time + 2.0);
        tines.stop(time + 0.3);
        break;
      }
      case 2: { // 808 Sub
        const root = 43.65 * freqMultiplier; // F1
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(root * 1.8, time);
        osc.frequency.exponentialRampToValueAtTime(root, time + 0.06);

        gain.gain.setValueAtTime(vel * 0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.5);
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + 1.6);
        break;
      }
      case 3: { // Slap Funk Bass
        const root = 82.41 * freqMultiplier; // E2
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(root, time);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3800, time);
        filter.frequency.exponentialRampToValueAtTime(450, time + 0.2);
        filter.Q.setValueAtTime(6.0, time);

        gain.gain.setValueAtTime(vel * 0.85, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        osc.start(time);
        osc.stop(time + 0.5);
        break;
      }
      case 4: { // Studio Snare
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(195 * freqMultiplier, time);
        osc.frequency.exponentialRampToValueAtTime(90, time + 0.08);
        gain.gain.setValueAtTime(vel * 0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + 0.26);
        break;
      }
      case 5: { // Punch 909 Kick
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(160 * freqMultiplier, time);
        osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
        gain.gain.setValueAtTime(vel * 1.0, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + 0.4);
        break;
      }
      case 6: { // Vinyl Soul Stab
        [220, 261.63, 329.63, 392].forEach((chordFreq) => {
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(chordFreq * freqMultiplier, time);
          const cGain = this.ctx.createGain();
          cGain.gain.setValueAtTime(vel * 0.25, time);
          cGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.65);
          osc.connect(cGain);
          cGain.connect(gain);
          osc.start(time);
          osc.stop(time + 0.7);
        });
        break;
      }
      case 7: { // Analog Strings Pad
        [174.61, 220, 261.63].forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f * freqMultiplier, time);
          osc.detune.setValueAtTime((idx - 1) * 14, time);
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, time);

          const sGain = this.ctx.createGain();
          sGain.gain.setValueAtTime(0.001, time);
          sGain.gain.linearRampToValueAtTime(vel * 0.3, time + 0.2);
          sGain.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);

          osc.connect(filter);
          filter.connect(sGain);
          sGain.connect(gain);

          osc.start(time);
          osc.stop(time + 2.0);
        });
        break;
      }
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.8, time: number = this.ctx.currentTime): void {
    const padIndex = (midiNote - 60 + 8) % 8;
    this.triggerPad(padIndex, velocity, time);
  }
}
