import { BaseDevice } from '../BaseDevice.ts';

export class PulsarDevice extends BaseDevice {
  /** AudioContext origin keeps live and OfflineAudioContext CV phase coherent. */
  private readonly lfoOriginTime: number;

  constructor(ctx: AudioContext, id: string = 'pulsar_1', name: string = 'Twin LFO Modulator') {
    super(ctx, id, name, 'pulsar', 1);
    this.lfoOriginTime = ctx.currentTime;

    this.params = {
      rate1: 1.5,
      depth1: 0.8,
      shape1: 'sine', // sine, triangle, saw, square, random
      rate2: 3.2,
      depth2: 0.6,
      shape2: 'triangle',
    };

    this.ports = [
      { id: 'lfo1_out', name: 'LFO 1 CV Out', type: 'cv_out', description: 'Outputs LFO 1 modulation voltage' },
      { id: 'lfo2_out', name: 'LFO 2 CV Out', type: 'cv_out', description: 'Outputs LFO 2 modulation voltage' },
    ];

    this.cvOutputs.set('lfo1_out', { getter: (time) => this.valueAt(1, time) });
    this.cvOutputs.set('lfo2_out', { getter: (time) => this.valueAt(2, time) });
  }

  /** Current values remain public for the faceplate/visualizer. */
  public get lfo1Val(): number {
    return this.valueAt(1);
  }

  public get lfo2Val(): number {
    return this.valueAt(2);
  }

  private valueAt(lfoNum: 1 | 2, audioTime = this.ctx.currentTime): number {
    if (!this.isPowered || this.isBypassed) return 0;
    const rate = Math.max(0.01, Number(this.params[`rate${lfoNum}`]) || 0.01);
    const depth = Math.max(0, Math.min(1, Number(this.params[`depth${lfoNum}`]) || 0));
    const shape = String(this.params[`shape${lfoNum}`] ?? 'sine');
    const elapsed = Math.max(0, audioTime - this.lfoOriginTime);
    const cycles = elapsed * rate;
    const phase = cycles - Math.floor(cycles);
    let raw = 0;

    switch (shape) {
      case 'sine':
        raw = Math.sin(phase * 2 * Math.PI);
        break;
      case 'triangle':
        raw = 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
        break;
      case 'saw':
        raw = 2 * (phase - Math.floor(phase + 0.5));
        break;
      case 'square':
        raw = phase < 0.5 ? 1 : -1;
        break;
      case 'random': {
        // Deterministic sample-and-hold: a given AudioContext time always has
        // the same value, including in OfflineAudioContext renders.
        const step = Math.floor(cycles);
        const seed = Math.sin((step + lfoNum * 101) * 12.9898) * 43758.5453;
        raw = (seed - Math.floor(seed)) * 2 - 1;
        break;
      }
      default:
        raw = Math.sin(phase * 2 * Math.PI);
    }

    return raw * depth;
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
  }
}
