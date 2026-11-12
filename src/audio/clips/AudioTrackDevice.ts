/**
 * Rack unit behind an audio track. Its audio clips play into `clipInput`; recording / monitoring
 * input (microphone or interface) arrives on `liveInput`; anything cabled into in_l / in_r (a rack
 * device, a bus) is monitored and can be recorded too (resampling). out_l / out_r feed the track's
 * mixer strip, through any insert effects cabled in the rack.
 */
import { BaseDevice } from '../BaseDevice.ts';

export class AudioTrackDevice extends BaseDevice {
  /** Stereo input for scheduled clip voices. */
  readonly clipInput: GainNode;
  /** Stereo input for the live (recording) signal; gated by the monitor switch. */
  readonly liveInput: GainNode;
  /** Pre-monitor tap of the live signal + cabled inputs (what gets recorded). */
  readonly recordTap: GainNode;
  private monitorGain: GainNode;

  constructor(ctx: BaseAudioContext, id: string, name: string) {
    super(ctx as AudioContext, id, name, 'audio_track', 1);
    const stereo = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.channelCount = 2;
      g.channelCountMode = 'explicit';
      return g;
    };
    this.clipInput = stereo();
    this.liveInput = stereo();
    this.recordTap = stereo();
    this.monitorGain = stereo(0);
    const inL = ctx.createGain();
    const inR = ctx.createGain();
    const cabled = ctx.createChannelMerger(2);
    inL.connect(cabled, 0, 0);
    inR.connect(cabled, 0, 1);
    cabled.connect(this.recordTap);
    this.liveInput.connect(this.recordTap);
    this.recordTap.connect(this.monitorGain);

    const sum = stereo();
    this.clipInput.connect(sum);
    this.monitorGain.connect(sum);
    const split = ctx.createChannelSplitter(2);
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    sum.connect(split);
    split.connect(outL, 0);
    split.connect(outR, 1);
    outL.connect(this.analyser);

    this.audioInputs.set('in_l', inL);
    this.audioInputs.set('in_r', inR);
    this.audioOutputs.set('out_l', outL);
    this.audioOutputs.set('out_r', outR);
    this.ports = [
      { id: 'in_l', name: 'Record In L', type: 'audio_in', channel: 'left', description: 'Cable a device here to monitor / record it (resampling)' },
      { id: 'in_r', name: 'Record In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Track Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Track Out R', type: 'audio_out', channel: 'right' },
    ];
    this.params = {};
  }

  /** Input monitoring on / off (hear the live input through the track's strip and inserts). */
  setMonitoring(on: boolean): void {
    this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
  }

  setParam(key: string, value: unknown): void {
    this.params[key] = value;
  }

  isPlayableInstrument(): boolean {
    return false;
  }

  cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    return new AudioTrackDevice(ctx, this.id, this.name);
  }

  dispose(): void {
    super.dispose();
    [this.clipInput, this.liveInput, this.recordTap, this.monitorGain].forEach((n) => n.disconnect());
  }
}
