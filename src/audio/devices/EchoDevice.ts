import { BaseDevice } from '../BaseDevice.ts';

export class EchoDevice extends BaseDevice {
  private inputL: GainNode;
  private inputR: GainNode;
  private outputL: GainNode;
  private outputR: GainNode;

  private delayL: DelayNode;
  private delayR: DelayNode;
  private feedbackL: GainNode;
  private feedbackR: GainNode;
  private crossFeedbackL: GainNode;
  private crossFeedbackR: GainNode;

  private dampFilterL: BiquadFilterNode;
  private dampFilterR: BiquadFilterNode;

  private dryGain: GainNode;
  private wetGain: GainNode;

  constructor(ctx: AudioContext, id: string = 'echo_1', name: string = 'The Echo Stereo Delay') {
    super(ctx, id, name, 'echo', 1);

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.outputL = ctx.createGain();
    this.outputR = ctx.createGain();

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.delayL = ctx.createDelay(3.0);
    this.delayR = ctx.createDelay(3.0);
    this.feedbackL = ctx.createGain();
    this.feedbackR = ctx.createGain();
    this.crossFeedbackL = ctx.createGain();
    this.crossFeedbackR = ctx.createGain();

    this.dampFilterL = ctx.createBiquadFilter();
    this.dampFilterR = ctx.createBiquadFilter();
    this.dampFilterL.type = 'lowpass';
    this.dampFilterR.type = 'lowpass';

    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);
    this.audioOutputs.set('out_l', this.outputL);
    this.audioOutputs.set('out_r', this.outputR);
    this.outputL.connect(this.analyser);

    this.params = {
      time: 0.35,       // seconds
      feedback: 0.45,   // 0 to 0.95
      damp: 6500,       // 500 to 18000
      pingPong: true,
      mix: 0.4,
    };

    this.ports = [
      { id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_time', name: 'Delay Time CV In', type: 'cv_in' },
      { id: 'cv_feedback', name: 'Feedback CV In', type: 'cv_in' },
    ];

    // Dry pass
    this.inputL.connect(this.dryGain);
    this.inputR.connect(this.dryGain);
    this.dryGain.connect(this.outputL);
    this.dryGain.connect(this.outputR);

    // Wet connections
    this.inputL.connect(this.delayL);
    this.inputR.connect(this.delayR);

    this.delayL.connect(this.dampFilterL);
    this.delayR.connect(this.dampFilterR);

    // Feedback loops
    this.dampFilterL.connect(this.feedbackL);
    this.dampFilterR.connect(this.feedbackR);
    this.dampFilterL.connect(this.crossFeedbackL);
    this.dampFilterR.connect(this.crossFeedbackR);

    this.feedbackL.connect(this.delayL);
    this.feedbackR.connect(this.delayR);
    this.crossFeedbackL.connect(this.delayR);
    this.crossFeedbackR.connect(this.delayL);

    this.dampFilterL.connect(this.wetGain);
    this.dampFilterR.connect(this.wetGain);

    this.wetGain.connect(this.outputL);
    this.wetGain.connect(this.outputR);

    this.updateDelayParams();

    this.cvInputs.set('cv_time', {
      setter: (amount: number) => {
        const t = Math.max(0.02, Math.min(2.5, this.params.time + amount * 0.5));
        this.delayL.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05);
        this.delayR.delayTime.setTargetAtTime(t * 1.05, this.ctx.currentTime, 0.05);
      },
    });

    this.cvInputs.set('cv_feedback', {
      setter: (amount: number) => {
        const fb = Math.max(0, Math.min(0.95, this.params.feedback + amount * 0.4));
        this.feedbackL.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.05);
        this.feedbackR.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.05);
      },
    });
  }

  private updateDelayParams(): void {
    const time = Math.max(0.01, Math.min(2.5, this.params.time));
    this.delayL.delayTime.setValueAtTime(time, this.ctx.currentTime);
    this.delayR.delayTime.setValueAtTime(this.params.pingPong ? time * 1.33 : time, this.ctx.currentTime);

    const fb = Math.max(0, Math.min(0.92, this.params.feedback));
    if (this.params.pingPong) {
      this.feedbackL.gain.setValueAtTime(0, this.ctx.currentTime);
      this.feedbackR.gain.setValueAtTime(0, this.ctx.currentTime);
      this.crossFeedbackL.gain.setValueAtTime(fb, this.ctx.currentTime);
      this.crossFeedbackR.gain.setValueAtTime(fb, this.ctx.currentTime);
    } else {
      this.feedbackL.gain.setValueAtTime(fb, this.ctx.currentTime);
      this.feedbackR.gain.setValueAtTime(fb, this.ctx.currentTime);
      this.crossFeedbackL.gain.setValueAtTime(0, this.ctx.currentTime);
      this.crossFeedbackR.gain.setValueAtTime(0, this.ctx.currentTime);
    }

    const damp = Math.max(300, Math.min(18000, this.params.damp));
    this.dampFilterL.frequency.setValueAtTime(damp, this.ctx.currentTime);
    this.dampFilterR.frequency.setValueAtTime(damp, this.ctx.currentTime);

    const mix = Math.max(0, Math.min(1, this.params.mix));
    this.wetGain.gain.setValueAtTime(mix, this.ctx.currentTime);
    this.dryGain.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    this.updateDelayParams();
  }
}
