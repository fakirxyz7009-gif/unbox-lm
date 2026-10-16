import { BaseDevice } from '../BaseDevice.ts';

export class MClassMasterSuite extends BaseDevice {
  private inputL: GainNode;
  private inputR: GainNode;
  private outputL: GainNode;
  private outputR: GainNode;

  // 4-band EQ
  private eqLow: BiquadFilterNode;
  private eqLowMid: BiquadFilterNode;
  private eqHighMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;

  // Compressor
  public compressor: DynamicsCompressorNode;
  private makeupGain: GainNode;

  // Limiter / Maximizer
  private limiterShaper: WaveShaperNode;
  private masterTrim: GainNode;

  constructor(ctx: AudioContext, id: string = 'mclass_master_1', name: string = 'MClass Mastering Suite') {
    super(ctx, id, name, 'mclass_master', 3);

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.outputL = ctx.createGain();
    this.outputR = ctx.createGain();

    // 4-Band EQ Nodes
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 90;

    this.eqLowMid = ctx.createBiquadFilter();
    this.eqLowMid.type = 'peaking';
    this.eqLowMid.frequency.value = 350;
    this.eqLowMid.Q.value = 1.2;

    this.eqHighMid = ctx.createBiquadFilter();
    this.eqHighMid.type = 'peaking';
    this.eqHighMid.frequency.value = 3800;
    this.eqHighMid.Q.value = 1.4;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 10000;

    // Dynamics Compressor
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.ratio.value = 3.0;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.2;
    this.compressor.knee.value = 6;

    this.makeupGain = ctx.createGain();
    this.makeupGain.gain.value = 1.25;

    // Maximizer soft clip stage
    this.limiterShaper = ctx.createWaveShaper();
    this.limiterShaper.oversample = '4x';
    this.updateLimiterCurve(1.2);

    this.masterTrim = ctx.createGain();
    this.masterTrim.gain.value = 0.95;

    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);
    this.audioOutputs.set('out_l', this.outputL);
    this.audioOutputs.set('out_r', this.outputR);
    this.outputL.connect(this.analyser);

    this.params = {
      eqLowGain: 1.5,       // dB
      eqLowMidGain: -1.0,   // dB
      eqHighMidGain: 1.2,   // dB
      eqHighGain: 1.8,      // dB
      compThreshold: -18,   // dB
      compRatio: 3.0,
      compAttack: 0.02,     // s
      compRelease: 0.2,     // s
      makeupGain: 1.25,
      stereoWidth: 1.2,     // 0 = mono, 1 = normal, 2 = wide
      limiterCeiling: -0.2, // dB
      warmthDrive: 1.5,
    };

    this.ports = [
      { id: 'in_l', name: 'Master In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Master In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Master Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Master Out R', type: 'audio_out', channel: 'right' },
    ];

    // Connect audio signal chain:
    // inL/inR -> eqLow -> eqLowMid -> eqHighMid -> eqHigh -> compressor -> makeup -> limiter -> trim -> out
    this.inputL.connect(this.eqLow);
    this.inputR.connect(this.eqLow);

    this.eqLow.connect(this.eqLowMid);
    this.eqLowMid.connect(this.eqHighMid);
    this.eqHighMid.connect(this.eqHigh);
    this.eqHigh.connect(this.compressor);

    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.limiterShaper);
    this.limiterShaper.connect(this.masterTrim);

    this.masterTrim.connect(this.outputL);
    this.masterTrim.connect(this.outputR);

    this.applyAllParams();
  }

  private updateLimiterCurve(drive: number): void {
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Soft saturation limit
      curve[i] = Math.tanh(x * drive);
    }
    this.limiterShaper.curve = curve;
  }

  public getGainReduction(): number {
    return Math.abs(this.compressor.reduction);
  }

  public applyAllParams(): void {
    this.eqLow.gain.setValueAtTime(this.params.eqLowGain, this.ctx.currentTime);
    this.eqLowMid.gain.setValueAtTime(this.params.eqLowMidGain, this.ctx.currentTime);
    this.eqHighMid.gain.setValueAtTime(this.params.eqHighMidGain, this.ctx.currentTime);
    this.eqHigh.gain.setValueAtTime(this.params.eqHighGain, this.ctx.currentTime);

    this.compressor.threshold.setValueAtTime(this.params.compThreshold, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(this.params.compRatio, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(this.params.compAttack, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(this.params.compRelease, this.ctx.currentTime);

    this.makeupGain.gain.setValueAtTime(this.params.makeupGain, this.ctx.currentTime);

    const ceilingLinear = Math.pow(10, this.params.limiterCeiling / 20);
    this.masterTrim.gain.setValueAtTime(ceilingLinear, this.ctx.currentTime);

    this.updateLimiterCurve(this.params.warmthDrive);
  }

  public setParam(key: string, value: any): void {
    this.params[key] = Number(value);
    this.applyAllParams();
  }
}
