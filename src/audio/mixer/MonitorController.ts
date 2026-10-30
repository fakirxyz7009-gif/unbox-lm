/**
 * Monitor section after the master (what reaches the speakers / headphones only — exports and
 * bounces tap the master before it): reference A/B, dim, mono, mute, L/R swap, speaker
 * calibration EQ and the output device.
 *
 *   master ─┐                 ┌→ dim → mute → mono/swap matrix → cal low → cal mid → cal high → trim → destination
 *   reference ┘ (A/B gains) ──┘
 */

export interface MonitorState {
  dim: boolean;
  /** Dim amount in dB (negative). */
  dimDb: number;
  mono: boolean;
  mute: boolean;
  swap: boolean;
  /** 'mix' or 'reference' (reference player output). */
  source: 'mix' | 'reference';
  calEnabled: boolean;
  calLowDb: number;
  calLowHz: number;
  calMidDb: number;
  calMidHz: number;
  calMidQ: number;
  calHighDb: number;
  calHighHz: number;
  /** Output trim in dB (speaker level matching). */
  trimDb: number;
}

export const DEFAULT_MONITOR: MonitorState = {
  dim: false, dimDb: -20, mono: false, mute: false, swap: false, source: 'mix',
  calEnabled: false, calLowDb: 0, calLowHz: 120, calMidDb: 0, calMidHz: 1000, calMidQ: 1, calHighDb: 0, calHighHz: 8000, trimDb: 0,
};

const dbToGain = (db: number) => Math.pow(10, db / 20);

type SinkCapable = AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };

export class MonitorController {
  /** The master feeds this. */
  readonly input: GainNode;
  /** Reference tracks / audition feed this (bypasses the master chain). */
  readonly referenceInput: GainNode;
  /** Metronome / count-in clicks (heard with either A/B source, never exported). */
  readonly clickInput: GainNode;
  readonly state: MonitorState = { ...DEFAULT_MONITOR };
  private mixGain: GainNode;
  private refGain: GainNode;
  private dimGain: GainNode;
  private muteGain: GainNode;
  private ll: GainNode;
  private lr: GainNode;
  private rl: GainNode;
  private rr: GainNode;
  private calLow: BiquadFilterNode;
  private calMid: BiquadFilterNode;
  private calHigh: BiquadFilterNode;
  private trim: GainNode;
  outputDeviceId = '';

  constructor(private ctx: AudioContext) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.input = g();
    this.referenceInput = g();
    this.clickInput = g();
    this.mixGain = g();
    this.refGain = g(0);
    this.dimGain = g();
    this.muteGain = g();
    this.input.connect(this.mixGain).connect(this.dimGain);
    this.referenceInput.connect(this.refGain).connect(this.dimGain);
    this.clickInput.connect(this.dimGain);
    this.dimGain.connect(this.muteGain);
    // 2x2 matrix: stereo / mono / swapped
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    this.ll = g();
    this.lr = g(0);
    this.rl = g(0);
    this.rr = g();
    this.muteGain.connect(split);
    split.connect(this.ll, 0).connect(merge, 0, 0);
    split.connect(this.rl, 1).connect(merge, 0, 0);
    split.connect(this.rr, 1).connect(merge, 0, 1);
    split.connect(this.lr, 0).connect(merge, 0, 1);
    this.calLow = ctx.createBiquadFilter();
    this.calLow.type = 'lowshelf';
    this.calMid = ctx.createBiquadFilter();
    this.calMid.type = 'peaking';
    this.calHigh = ctx.createBiquadFilter();
    this.calHigh.type = 'highshelf';
    this.trim = g();
    merge.connect(this.calLow).connect(this.calMid).connect(this.calHigh).connect(this.trim).connect(ctx.destination);
    this.apply();
  }

  set(patch: Partial<MonitorState>): void {
    Object.assign(this.state, patch);
    this.apply();
  }

  private apply(): void {
    const s = this.state;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.012);
    set(this.mixGain.gain, s.source === 'mix' ? 1 : 0);
    set(this.refGain.gain, s.source === 'reference' ? 1 : 0);
    set(this.dimGain.gain, s.dim ? dbToGain(Math.min(0, s.dimDb)) : 1);
    set(this.muteGain.gain, s.mute ? 0 : 1);
    if (s.mono) {
      [this.ll, this.lr, this.rl, this.rr].forEach((n) => set(n.gain, 0.5));
    } else {
      set(this.ll.gain, s.swap ? 0 : 1);
      set(this.rr.gain, s.swap ? 0 : 1);
      set(this.lr.gain, s.swap ? 1 : 0);
      set(this.rl.gain, s.swap ? 1 : 0);
    }
    const on = s.calEnabled;
    set(this.calLow.gain, on ? s.calLowDb : 0);
    set(this.calLow.frequency, s.calLowHz);
    set(this.calMid.gain, on ? s.calMidDb : 0);
    set(this.calMid.frequency, s.calMidHz);
    set(this.calMid.Q, Math.max(0.1, s.calMidQ));
    set(this.calHigh.gain, on ? s.calHighDb : 0);
    set(this.calHigh.frequency, s.calHighHz);
    // The monitor trim only cuts: a boost after the mix could clip the speakers at full scale.
    set(this.trim.gain, dbToGain(Math.max(-24, Math.min(0, s.trimDb))));
  }

  /** True when the browser can switch the output device of an AudioContext. */
  get canChooseOutput(): boolean {
    return typeof (this.ctx as SinkCapable).setSinkId === 'function';
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    const ctx = this.ctx as SinkCapable;
    if (!ctx.setSinkId) throw new Error('This browser cannot choose the audio output device.');
    await ctx.setSinkId(deviceId);
    this.outputDeviceId = deviceId;
  }
}
