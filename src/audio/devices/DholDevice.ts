import { BaseDevice } from '../BaseDevice.ts';

/**
 * DholDevice — Authentic Dual-Headed Punjabi Folk Dhol Drum (Bass Dugga & High Tilli)
 * Supports full Piano Roll pitch-tracking, scheduled lookahead timing, stick transient snap,
 * and full Mixer/Sequencer synchronization.
 */
export class DholDevice extends BaseDevice {
  public punchTension: number = 0.88;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;

  constructor(ctx: AudioContext, id: string, name: string = 'Dhol Folk Drum') {
    super(ctx, id, name, 'dhol', 2);

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 10000;
    this.filterNode.Q.value = 1.2;

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
      punchTension: 0.88,
      cutoff: 10000,
      resonance: 1.2,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_gate', name: 'Dhol Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.95, this.ctx.currentTime);
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.95, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const tension = Math.max(0.4, Math.min(1.6, this.punchTension || 0.88));
    const midiFreq = Math.max(40, Math.min(3500, 440 * Math.pow(2, (note - 69) / 12)));

    // 1. Dugga (Deep Bass Goat-Skin Head)
    const bassFreq = Math.max(48, Math.min(260, midiFreq * 0.45 * tension));
    const bassOsc = this.ctx.createOscillator();
    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(bassFreq * 2.4, now);
    bassOsc.frequency.exponentialRampToValueAtTime(bassFreq, now + 0.065);
    bassOsc.frequency.exponentialRampToValueAtTime(Math.max(38, bassFreq * 0.72), now + 0.38);

    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(0.001, now);
    bassGain.gain.linearRampToValueAtTime(vel * 0.95, now + 0.004);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    bassOsc.connect(bassGain);
    bassGain.connect(this.filterNode);
    bassOsc.start(now);
    bassOsc.stop(now + 0.45);

    // 2. Tilli (High-Tension Treble Stick Head)
    const tilliFreq = Math.max(180, Math.min(2800, midiFreq * 1.35 * tension));
    const tilliOsc = this.ctx.createOscillator();
    tilliOsc.type = 'sawtooth';
    tilliOsc.frequency.setValueAtTime(tilliFreq * 1.5, now);
    tilliOsc.frequency.exponentialRampToValueAtTime(tilliFreq, now + 0.02);

    const tilliFilter = this.ctx.createBiquadFilter();
    tilliFilter.type = 'bandpass';
    tilliFilter.frequency.setValueAtTime(tilliFreq * 1.8, now);
    tilliFilter.Q.setValueAtTime(3.2, now);

    const tilliGain = this.ctx.createGain();
    tilliGain.gain.setValueAtTime(0.001, now);
    tilliGain.gain.linearRampToValueAtTime(vel * 0.65, now + 0.002);
    tilliGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    tilliOsc.connect(tilliFilter);
    tilliFilter.connect(tilliGain);
    tilliGain.connect(this.filterNode);
    tilliOsc.start(now);
    tilliOsc.stop(now + 0.22);

    // 3. Dagga & Tilli wooden stick transient crack
    const noiseLen = Math.floor(this.ctx.sampleRate * 0.045);
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(vel * 0.6, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    noise.connect(nGain);
    nGain.connect(this.filterNode);
    noise.start(now);
    noise.stop(now + 0.045);
  }

  public triggerPad(padIndex: number, velocity: number = 0.95, time: number = this.ctx.currentTime): void {
    const notes = [48, 52, 55, 60, 64, 67, 72, 76];
    this.noteOn(notes[((padIndex % notes.length) + notes.length) % notes.length], velocity, time);
  }

  public noteOff(_note: number, _time?: number): void {}

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'punchTension' && !isNaN(num)) {
      this.punchTension = Math.max(0.4, Math.min(1.6, num));
    } else if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    } else if (param === 'cutoff' && !isNaN(num)) {
      const hz = num <= 1.5 ? 200 * Math.pow(50, Math.max(0.05, num)) : Math.max(200, Math.min(18000, num));
      this.filterNode.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
    }
  }
}
