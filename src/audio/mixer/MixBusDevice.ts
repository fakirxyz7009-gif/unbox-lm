/**
 * Mixer bus / return channel as a rack unit. Tracks reach it through their channel output or sends
 * (`input`), and rack cables can patch into in_l / in_r too. Its out_l / out_r run through any
 * insert effects cabled in the rack and end on its own mixer strip (like an instrument track).
 */
import { BaseDevice } from '../BaseDevice.ts';
import type { ChannelSettings } from '../types.ts';

export type BusKind = 'bus' | 'return';

export class MixBusDevice extends BaseDevice {
  /** Stereo summing input for channel outputs and sends. */
  public readonly input: GainNode;
  public busKind: BusKind;
  public channel: ChannelSettings;

  constructor(ctx: BaseAudioContext, id: string, name: string, kind: BusKind = 'bus', color = '#64748b') {
    super(ctx as AudioContext, id, name, 'mix_bus', 1);
    this.busKind = kind;
    this.channel = { name, color, mute: false, solo: false, volume: 1, pan: 0, output: 'master', soloSafe: kind === 'return' };
    this.input = ctx.createGain();
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    const split = ctx.createChannelSplitter(2);
    const inL = ctx.createGain();
    const inR = ctx.createGain();
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    this.input.connect(split);
    split.connect(inL, 0);
    split.connect(inR, 1);
    inL.connect(outL);
    inR.connect(outR);
    outL.connect(this.analyser);
    this.audioInputs.set('in_l', inL);
    this.audioInputs.set('in_r', inR);
    this.audioOutputs.set('out_l', outL);
    this.audioOutputs.set('out_r', outR);
    this.ports = [
      { id: 'in_l', name: 'In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'To inserts / mixer L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'To inserts / mixer R', type: 'audio_out', channel: 'right' },
    ];
    this.params = { kind };
  }

  setParam(key: string, value: unknown): void {
    if (key === 'kind' && (value === 'bus' || value === 'return')) {
      this.busKind = value;
      this.params.kind = value;
    }
  }

  isPlayableInstrument(): boolean {
    return false;
  }

  cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    const copy = new MixBusDevice(ctx, this.id, this.name, this.busKind, this.channel.color);
    copy.channel = { ...this.channel, sends: this.channel.sends?.map((s) => ({ ...s })) };
    return copy;
  }

  dispose(): void {
    super.dispose();
    this.input.disconnect();
  }
}
