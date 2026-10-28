import { BaseDevice } from '../BaseDevice.ts';

export class RV7000Device extends BaseDevice {
  private inputL: GainNode;
  private inputR: GainNode;
  private outputL: GainNode;
  private outputR: GainNode;

  private convolver: ConvolverNode;
  private preDelayNode: DelayNode;
  private dampingFilter: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  constructor(ctx: AudioContext, id: string = 'rv7000_1', name: string = 'Cathedral Flagship Reverb') {
    super(ctx, id, name, 'rv7000', 2);

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.outputL = ctx.createGain();
    this.outputR = ctx.createGain();

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.preDelayNode = ctx.createDelay(1.0);
    this.convolver = ctx.createConvolver();
    this.dampingFilter = ctx.createBiquadFilter();
    this.dampingFilter.type = 'lowpass';

    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);
    this.audioOutputs.set('out_l', this.outputL);
    this.audioOutputs.set('out_r', this.outputR);
    this.outputL.connect(this.analyser);

    this.params = {
      preset: 'Hall',   // Hall, Plate, Room, Spring, Space
      decay: 3.2,       // seconds (0.2 to 12)
      size: 0.75,       // 0.1 to 1.0
      preDelay: 0.025,  // seconds (0 to 0.2)
      damping: 6500,    // Hz (500 to 18000)
      mix: 0.45,
    };

    this.ports = [
      { id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_decay', name: 'Decay CV In', type: 'cv_in' },
      { id: 'cv_mix', name: 'Mix CV In', type: 'cv_in' },
    ];

    // Stereo all the way: merge L/R, true-stereo convolution (2-channel IR), split back.
    const merge = ctx.createChannelMerger(2);
    this.inputL.connect(merge, 0, 0);
    this.inputR.connect(merge, 0, 1);
    const split = ctx.createChannelSplitter(2);
    merge.connect(this.dryGain).connect(split);
    // reverb input is the mono sum; the 2-channel impulse spreads it into a decorrelated stereo tail
    const monoSum = ctx.createGain();
    monoSum.channelCount = 1;
    monoSum.channelCountMode = 'explicit';
    merge.connect(monoSum).connect(this.preDelayNode);
    this.preDelayNode.connect(this.convolver);
    this.convolver.connect(this.dampingFilter);
    this.dampingFilter.connect(this.wetGain).connect(split);
    split.connect(this.outputL, 0);
    split.connect(this.outputR, 1);

    this.updateImpulse();
    this.applyParams();

    this.cvInputs.set('cv_decay', {
      setter: (amount: number) => {
        this.params.decay = Math.max(0.2, Math.min(10, this.params.decay + amount * 2));
        this.updateImpulse();
      },
    });

    this.cvInputs.set('cv_mix', {
      setter: (amount: number) => {
        this.setParam('mix', Math.max(0, Math.min(1, this.params.mix + amount * 0.4)));
      },
    });
  }

  private updateImpulse(): void {
    const rate = this.ctx.sampleRate;
    const size = Math.max(0.1, Math.min(1, Number(this.params.size) || 0.1));
    // Keep the default size neutral while scaling the room response shorter or longer.
    const decayTime = Math.max(0.2, Math.min(12, this.params.decay * (0.4 + size * 0.8)));
    const length = Math.max(1, Math.floor(rate * decayTime));
    const impulse = this.ctx.createBuffer(2, length, rate);

    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const preset = this.params.preset;

    const density = preset === 'Plate' ? 1.4 : preset === 'Spring' ? 0.6 : 1.0;

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const env = Math.pow(1 - i / length, density) * Math.exp(-t * (3.5 / decayTime));
      // Subtle stereo decorrelation
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env * 0.95;
    }

    this.convolver.buffer = impulse;
  }

  /** Keep offline mix and stem renders on the same impulse response as the live device. */
  public override cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    const copy = new RV7000Device(ctx as AudioContext, this.id, this.name);
    copy.params = { ...this.params };
    copy.convolver.buffer = this.convolver.buffer;
    copy.applyParams();
    return copy;
  }

  private applyParams(): void {
    this.preDelayNode.delayTime.setValueAtTime(Math.max(0, Math.min(0.5, this.params.preDelay)), this.ctx.currentTime);
    this.dampingFilter.frequency.setValueAtTime(Math.max(300, Math.min(18000, this.params.damping)), this.ctx.currentTime);

    const mix = Math.max(0, Math.min(1, this.params.mix));
    this.wetGain.gain.setValueAtTime(mix, this.ctx.currentTime);
    this.dryGain.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'decay' || key === 'preset' || key === 'size') {
      this.updateImpulse();
    } else {
      this.applyParams();
    }
  }

  public override dispose(): void {
    this.convolver.buffer = null;
    [this.inputL, this.inputR, this.outputL, this.outputR, this.dryGain, this.wetGain,
      this.preDelayNode, this.convolver, this.dampingFilter].forEach((node) => {
      try { node.disconnect(); } catch {}
    });
    super.dispose();
  }
}
