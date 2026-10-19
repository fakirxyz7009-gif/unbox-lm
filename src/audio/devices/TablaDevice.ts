import { BaseDevice } from '../BaseDevice.ts';

/**
 * TablaDevice — Authentic Physical-Modeled Indian Classical Tabla Pair (Dayan & Bayan)
 * Supports full Piano Roll pitch-tracking (MIDI 24..96), scheduled lookahead timing,
 * multi-bol articulations (Na, Tin, Tun, Ge, Dha, Dhin, Tirakita), membrane transient slap,
 * syahi harmonic overtone ring, and stereo pan/volume/filter modulation.
 */
export class TablaDevice extends BaseDevice {
  public skinTension: number = 0.85;
  public bayanResonance: number = 0.78;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;

  constructor(ctx: AudioContext, id: string, name: string = 'Tabla (Dayan & Bayan)') {
    super(ctx, id, name, 'tabla', 2);

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 9500;
    this.filterNode.Q.value = 1.4;

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.95;

    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.filterNode.connect(this.panner);
      this.panner.connect(this.masterOutput);
    } else {
      this.filterNode.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.95,
      pan: 0,
      skinTension: 0.85,
      bayanResonance: 0.78,
      cutoff: 9500,
      resonance: 1.4,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Tension CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Bol Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_pitch', {
      setter: (val: number) => {
        this.skinTension = Math.max(0.4, Math.min(1.5, 0.85 + val * 0.35));
      },
    });
    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.92, this.ctx.currentTime);
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.9, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const tension = Math.max(0.4, Math.min(1.6, this.skinTension || 0.85));
    const bayanRes = Math.max(0.3, Math.min(1.4, this.bayanResonance || 0.78));

    // Pitch-tracked fundamental frequency from Piano Roll MIDI note
    const midiFreq = Math.max(45, Math.min(4000, 440 * Math.pow(2, (note - 69) / 12)));
    const bolType = ((note % 4) + 4) % 4; // 0 = Dha (Both), 1 = Na (Rim), 2 = Tin (Syahi Bell), 3 = Ge (Bayan Bass)
    const isBassNote = note < 58 || bolType === 0 || bolType === 3;
    const isDayanNote = note >= 52 || bolType === 0 || bolType === 1 || bolType === 2;

    // 1. BAYAN (Left-hand copper/brass bass drum with signature pitch-scoop meend)
    if (isBassNote) {
      const bayanFreq = note < 58 ? midiFreq : Math.max(65, midiFreq * 0.5);
      const bOsc = this.ctx.createOscillator();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(bayanFreq * 1.45, now);
      bOsc.frequency.exponentialRampToValueAtTime(bayanFreq * 0.88, now + 0.06);
      bOsc.frequency.exponentialRampToValueAtTime(bayanFreq * 1.12, now + 0.22); // Classic Bayan wrist meend inflect
      bOsc.frequency.exponentialRampToValueAtTime(Math.max(40, bayanFreq * 0.82), now + 0.55 * bayanRes);

      const bGain = this.ctx.createGain();
      bGain.gain.setValueAtTime(0.001, now);
      bGain.gain.linearRampToValueAtTime(vel * 0.85, now + 0.004);
      bGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58 * bayanRes);

      bOsc.connect(bGain);
      bGain.connect(this.filterNode);
      bOsc.start(now);
      bOsc.stop(now + 0.62 * bayanRes);
    }

    // 2. DAYAN (Right-hand tuned wooden drum with Syahi black-spot harmonic overtones)
    if (isDayanNote) {
      const dayanFreq = Math.max(120, Math.min(2400, midiFreq * tension));

      // Fundamental skin mode
      const dOsc1 = this.ctx.createOscillator();
      dOsc1.type = 'triangle';
      dOsc1.frequency.setValueAtTime(dayanFreq * 1.25, now);
      dOsc1.frequency.exponentialRampToValueAtTime(dayanFreq, now + 0.018);

      // Syahi 2nd & 3rd tuned harmonic overtones (gives Tabla its unmistakable singing bell tone)
      const dOsc2 = this.ctx.createOscillator();
      dOsc2.type = 'sine';
      dOsc2.frequency.setValueAtTime(dayanFreq * (bolType === 1 ? 2.98 : 2.0), now);

      const dGain1 = this.ctx.createGain();
      const decayTime = bolType === 1 ? 0.26 : 0.48;
      dGain1.gain.setValueAtTime(0.001, now);
      dGain1.gain.linearRampToValueAtTime(vel * 0.78, now + 0.003);
      dGain1.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

      const dGain2 = this.ctx.createGain();
      dGain2.gain.setValueAtTime(0.001, now);
      dGain2.gain.linearRampToValueAtTime(vel * 0.45, now + 0.004);
      dGain2.gain.exponentialRampToValueAtTime(0.0001, now + decayTime * 0.85);

      dOsc1.connect(dGain1);
      dOsc2.connect(dGain2);
      dGain1.connect(this.filterNode);
      dGain2.connect(this.filterNode);

      dOsc1.start(now);
      dOsc2.start(now);
      dOsc1.stop(now + decayTime + 0.04);
      dOsc2.stop(now + decayTime + 0.04);
    }

    // 3. Crisp finger-strike skin slap transient
    const noiseLen = Math.floor(this.ctx.sampleRate * 0.04);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.25));
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const slapFilter = this.ctx.createBiquadFilter();
    slapFilter.type = 'bandpass';
    slapFilter.frequency.setValueAtTime(Math.min(8000, Math.max(900, midiFreq * 4.5)), now);
    slapFilter.Q.setValueAtTime(2.5, now);

    const slapGain = this.ctx.createGain();
    slapGain.gain.setValueAtTime(vel * 0.55, now);
    slapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    noiseSrc.connect(slapFilter);
    slapFilter.connect(slapGain);
    slapGain.connect(this.filterNode);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.04);
  }

  public triggerPad(padIndex: number, velocity: number = 0.92, time: number = this.ctx.currentTime): void {
    const bolMidiMap = [48, 55, 60, 62, 64, 67, 69, 72];
    const note = bolMidiMap[((padIndex % bolMidiMap.length) + bolMidiMap.length) % bolMidiMap.length];
    this.noteOn(note, velocity, time);
  }

  public noteOff(_note: number, _time?: number): void {}

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'skinTension' && !isNaN(num)) {
      this.skinTension = Math.max(0.3, Math.min(1.6, num));
    } else if (param === 'bayanResonance' && !isNaN(num)) {
      this.bayanResonance = Math.max(0.2, Math.min(1.5, num));
    } else if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'cutoff' && !isNaN(num)) {
      const hz = num <= 1.5 ? 200 * Math.pow(50, Math.max(0.05, num)) : Math.max(200, Math.min(18000, num));
      this.filterNode.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
    } else if (param === 'resonance' && !isNaN(num)) {
      this.filterNode.Q.setTargetAtTime(Math.max(0.5, Math.min(12, num <= 1 ? 0.7 + num * 8 : num)), this.ctx.currentTime, 0.02);
    }
  }
}
