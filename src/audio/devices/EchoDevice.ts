import { BaseDevice } from '../BaseDevice.ts';

/**
 * The Echo: stereo delay with damping. Left and right stay separate (dry and wet).
 * Ping-pong feeds the mono sum into the left line only and crosses the feedback, so echoes
 * bounce left → right → left; otherwise each side delays itself.
 */
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
  /** Input routing into the delay lines: L→L, R→L (ping-pong sum), R→R. */
  private sendLL: GainNode;
  private sendRL: GainNode;
  private sendRR: GainNode;

  private dampFilterL: BiquadFilterNode;
  private dampFilterR: BiquadFilterNode;

  private dryL: GainNode;
  private dryR: GainNode;
  private wetL: GainNode;
  private wetR: GainNode;

  constructor(ctx: AudioContext, id: string = 'echo_1', name: string = 'Repeater Stereo Delay') {
    super(ctx, id, name, 'echo', 1);
    const gain = () => ctx.createGain();

    this.inputL = gain();
    this.inputR = gain();
    this.outputL = gain();
    this.outputR = gain();
    this.dryL = gain();
    this.dryR = gain();
    this.wetL = gain();
    this.wetR = gain();
    this.sendLL = gain();
    this.sendRL = gain();
    this.sendRR = gain();

    this.delayL = ctx.createDelay(3.0);
    this.delayR = ctx.createDelay(3.0);
    this.feedbackL = gain();
    this.feedbackR = gain();
    this.crossFeedbackL = gain();
    this.crossFeedbackR = gain();

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
      time: 0.35, // seconds
      feedback: 0.45, // 0 to 0.95
      damp: 6500, // 500 to 18000
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

    // Dry: each side to its own output
    this.inputL.connect(this.dryL).connect(this.outputL);
    this.inputR.connect(this.dryR).connect(this.outputR);

    // Into the delay lines
    this.inputL.connect(this.sendLL).connect(this.delayL);
    this.inputR.connect(this.sendRL).connect(this.delayL);
    this.inputR.connect(this.sendRR).connect(this.delayR);

    this.delayL.connect(this.dampFilterL);
    this.delayR.connect(this.dampFilterR);

    // Feedback loops (straight or crossed for ping-pong)
    this.dampFilterL.connect(this.feedbackL).connect(this.delayL);
    this.dampFilterR.connect(this.feedbackR).connect(this.delayR);
    this.dampFilterL.connect(this.crossFeedbackL).connect(this.delayR);
    this.dampFilterR.connect(this.crossFeedbackR).connect(this.delayL);

    // Wet: left line → left out, right line → right out
    this.dampFilterL.connect(this.wetL).connect(this.outputL);
    this.dampFilterR.connect(this.wetR).connect(this.outputR);

    this.updateDelayParams();

    this.cvInputs.set('cv_time', {
      setter: (amount: number) => {
        const t = Math.max(0.02, Math.min(2.5, this.params.time + amount * 0.5));
        this.delayL.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05);
        this.delayR.delayTime.setTargetAtTime(this.params.pingPong ? t : t * 1.05, this.ctx.currentTime, 0.05);
      },
    });

    this.cvInputs.set('cv_feedback', {
      setter: (amount: number) => {
        const fb = Math.max(0, Math.min(0.95, this.params.feedback + amount * 0.4));
        const target = this.params.pingPong ? [this.crossFeedbackL, this.crossFeedbackR] : [this.feedbackL, this.feedbackR];
        target.forEach((g) => g.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.05));
      },
    });
  }

  private updateDelayParams(): void {
    const now = this.ctx.currentTime;
    const time = Math.max(0.01, Math.min(2.5, this.params.time));
    this.delayL.delayTime.setTargetAtTime(time, now, 0.02);
    this.delayR.delayTime.setTargetAtTime(time, now, 0.02);

    const fb = Math.max(0, Math.min(0.92, this.params.feedback));
    const pp = !!this.params.pingPong;
    this.feedbackL.gain.setTargetAtTime(pp ? 0 : fb, now, 0.02);
    this.feedbackR.gain.setTargetAtTime(pp ? 0 : fb, now, 0.02);
    // ping-pong: each repeat jumps to the other side, one feedback step quieter
    this.crossFeedbackL.gain.setTargetAtTime(pp ? fb : 0, now, 0.02);
    this.crossFeedbackR.gain.setTargetAtTime(pp ? fb : 0, now, 0.02);
    this.sendLL.gain.setTargetAtTime(pp ? 0.5 : 1, now, 0.02);
    this.sendRL.gain.setTargetAtTime(pp ? 0.5 : 0, now, 0.02);
    this.sendRR.gain.setTargetAtTime(pp ? 0 : 1, now, 0.02);

    const damp = Math.max(300, Math.min(18000, this.params.damp));
    this.dampFilterL.frequency.setTargetAtTime(damp, now, 0.02);
    this.dampFilterR.frequency.setTargetAtTime(damp, now, 0.02);

    const mix = Math.max(0, Math.min(1, this.params.mix));
    [this.wetL, this.wetR].forEach((g) => g.gain.setTargetAtTime(mix, now, 0.02));
    [this.dryL, this.dryR].forEach((g) => g.gain.setTargetAtTime(1 - mix, now, 0.02));
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    this.updateDelayParams();
  }
}
