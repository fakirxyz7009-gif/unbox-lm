import { BaseDevice } from '../BaseDevice.ts';

export class Scream4Device extends BaseDevice {
  private inputL: GainNode;
  private inputR: GainNode;
  private outputL: GainNode;
  private outputR: GainNode;
  private waveShaperL: WaveShaperNode;
  private waveShaperR: WaveShaperNode;
  private toneFilterL: BiquadFilterNode;
  private toneFilterR: BiquadFilterNode;
  private dryGainL: GainNode;
  private dryGainR: GainNode;
  private wetGainL: GainNode;
  private wetGainR: GainNode;

  constructor(ctx: AudioContext, id: string = 'scream4_1', name: string = 'Scream 4 Distortion & Tape Warmer') {
    super(ctx, id, name, 'scream4', 1);

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.outputL = ctx.createGain();
    this.outputR = ctx.createGain();

    this.dryGainL = ctx.createGain();
    this.dryGainR = ctx.createGain();
    this.wetGainL = ctx.createGain();
    this.wetGainR = ctx.createGain();

    this.waveShaperL = ctx.createWaveShaper();
    this.waveShaperR = ctx.createWaveShaper();
    this.waveShaperL.oversample = '4x';
    this.waveShaperR.oversample = '4x';

    this.toneFilterL = ctx.createBiquadFilter();
    this.toneFilterR = ctx.createBiquadFilter();
    this.toneFilterL.type = 'lowpass';
    this.toneFilterR.type = 'lowpass';

    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);
    this.audioOutputs.set('out_l', this.outputL);
    this.audioOutputs.set('out_r', this.outputR);
    this.outputL.connect(this.analyser);

    this.params = {
      drive: 5.0,     // 1 to 20
      warmth: 0.7,   // 0 to 1
      bias: 0.1,     // -0.5 to 0.5
      tone: 5500,    // 500 to 18000
      mix: 0.85,     // 0 to 1
    };

    this.ports = [
      { id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_drive', name: 'Drive CV In', type: 'cv_in' },
      { id: 'cv_tone', name: 'Tone CV In', type: 'cv_in' },
    ];

    // Dry routing
    this.inputL.connect(this.dryGainL).connect(this.outputL);
    this.inputR.connect(this.dryGainR).connect(this.outputR);

    // Wet routing
    this.inputL.connect(this.waveShaperL).connect(this.toneFilterL).connect(this.wetGainL).connect(this.outputL);
    this.inputR.connect(this.waveShaperR).connect(this.toneFilterR).connect(this.wetGainR).connect(this.outputR);

    this.updateCurve();
    this.applyMix();
    this.applyTone();

    this.cvInputs.set('cv_drive', {
      setter: (amount: number) => {
        const newDrive = Math.max(1, Math.min(20, this.params.drive + amount * 8));
        this.setParam('drive', newDrive);
      },
    });

    this.cvInputs.set('cv_tone', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 2);
        this.toneFilterL.frequency.setTargetAtTime(Math.min(18000, Math.max(400, this.params.tone * mod)), this.ctx.currentTime, 0.02);
        this.toneFilterR.frequency.setTargetAtTime(Math.min(18000, Math.max(400, this.params.tone * mod)), this.ctx.currentTime, 0.02);
      },
    });
  }

  private updateCurve(): void {
    const samples = 2048;
    const curve = new Float32Array(samples);
    const k = this.params.drive * 2.5;
    const bias = this.params.bias;
    const warmth = this.params.warmth;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const biasedX = x + bias * (1 - x * x);
      // Soft saturation with tanh and even harmonics for warm tube character
      const saturated = Math.tanh(k * biasedX);
      const tubeEvenHarmonics = warmth * 0.25 * (biasedX * biasedX - 0.5);
      curve[i] = Math.max(-1, Math.min(1, saturated + tubeEvenHarmonics));
    }

    this.waveShaperL.curve = curve;
    this.waveShaperR.curve = curve;
  }

  private applyMix(): void {
    const mix = Math.max(0, Math.min(1, this.params.mix));
    this.wetGainL.gain.setValueAtTime(mix, this.ctx.currentTime);
    this.wetGainR.gain.setValueAtTime(mix, this.ctx.currentTime);
    this.dryGainL.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
    this.dryGainR.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
  }

  private applyTone(): void {
    const tone = Math.max(300, Math.min(18000, this.params.tone));
    this.toneFilterL.frequency.setValueAtTime(tone, this.ctx.currentTime);
    this.toneFilterR.frequency.setValueAtTime(tone, this.ctx.currentTime);
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'drive' || key === 'warmth' || key === 'bias') {
      this.updateCurve();
    } else if (key === 'mix') {
      this.applyMix();
    } else if (key === 'tone') {
      this.applyTone();
    }
  }
}
