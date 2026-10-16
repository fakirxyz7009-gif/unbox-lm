import { BaseDevice } from '../BaseDevice.ts';

export class SpiderAudioDevice extends BaseDevice {
  constructor(ctx: AudioContext, id: string = 'spider_audio_1', name: string = 'Spider Audio Merger & Splitter') {
    super(ctx, id, name, 'spider_audio', 1);

    const splitInL = ctx.createGain();
    const splitInR = ctx.createGain();
    const splitOutL1 = ctx.createGain();
    const splitOutR1 = ctx.createGain();
    const splitOutL2 = ctx.createGain();
    const splitOutR2 = ctx.createGain();

    const mergeInL1 = ctx.createGain();
    const mergeInR1 = ctx.createGain();
    const mergeInL2 = ctx.createGain();
    const mergeInR2 = ctx.createGain();
    const mergeOutL = ctx.createGain();
    const mergeOutR = ctx.createGain();

    // Splitter routing: In -> Out1 & Out2
    splitInL.connect(splitOutL1);
    splitInL.connect(splitOutL2);
    splitInR.connect(splitOutR1);
    splitInR.connect(splitOutR2);

    // Merger routing: In1 & In2 -> Out
    mergeInL1.connect(mergeOutL);
    mergeInL2.connect(mergeOutL);
    mergeInR1.connect(mergeOutR);
    mergeInR2.connect(mergeOutR);

    this.audioInputs.set('split_in_l', splitInL);
    this.audioInputs.set('split_in_r', splitInR);
    this.audioOutputs.set('split_out_l1', splitOutL1);
    this.audioOutputs.set('split_out_r1', splitOutR1);
    this.audioOutputs.set('split_out_l2', splitOutL2);
    this.audioOutputs.set('split_out_r2', splitOutR2);

    this.audioInputs.set('merge_in_l1', mergeInL1);
    this.audioInputs.set('merge_in_r1', mergeInR1);
    this.audioInputs.set('merge_in_l2', mergeInL2);
    this.audioInputs.set('merge_in_r2', mergeInR2);
    this.audioOutputs.set('merge_out_l', mergeOutL);
    this.audioOutputs.set('merge_out_r', mergeOutR);

    // Route audio to analyser for DSP visualizer
    mergeOutL.connect(this.analyser);
    splitInL.connect(this.analyser);

    this.ports = [
      { id: 'split_in_l', name: 'Split In L', type: 'audio_in', channel: 'left' },
      { id: 'split_in_r', name: 'Split In R', type: 'audio_in', channel: 'right' },
      { id: 'split_out_l1', name: 'Split 1 L', type: 'audio_out', channel: 'left' },
      { id: 'split_out_r1', name: 'Split 1 R', type: 'audio_out', channel: 'right' },
      { id: 'split_out_l2', name: 'Split 2 L', type: 'audio_out', channel: 'left' },
      { id: 'split_out_r2', name: 'Split 2 R', type: 'audio_out', channel: 'right' },

      { id: 'merge_in_l1', name: 'Merge 1 In L', type: 'audio_in', channel: 'left' },
      { id: 'merge_in_r1', name: 'Merge 1 In R', type: 'audio_in', channel: 'right' },
      { id: 'merge_in_l2', name: 'Merge 2 In L', type: 'audio_in', channel: 'left' },
      { id: 'merge_in_r2', name: 'Merge 2 In R', type: 'audio_in', channel: 'right' },
      { id: 'merge_out_l', name: 'Merge Out L', type: 'audio_out', channel: 'left' },
      { id: 'merge_out_r', name: 'Merge Out R', type: 'audio_out', channel: 'right' },
    ];
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
  }
}
