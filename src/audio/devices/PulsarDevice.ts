import { BaseDevice } from '../BaseDevice.ts';

export class PulsarDevice extends BaseDevice {
  public lfo1Val: number = 0;
  public lfo2Val: number = 0;
  private animId: number = 0;
  private lastSampleHold1: number = 0;
  private lastSampleHold2: number = 0;
  private sampleHoldTimer1: number = 0;
  private sampleHoldTimer2: number = 0;

  constructor(ctx: AudioContext, id: string = 'pulsar_1', name: string = 'Pulsar Dual LFO Modulator') {
    super(ctx, id, name, 'pulsar', 1);

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

    this.cvOutputs.set('lfo1_out', { getter: () => this.lfo1Val });
    this.cvOutputs.set('lfo2_out', { getter: () => this.lfo2Val });

    this.startModulationLoop();
  }

  private startModulationLoop(): void {
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (this.isPowered && !this.isBypassed) {
        this.lfo1Val = this.calcLfo(now / 1000, this.params.rate1, this.params.shape1, this.params.depth1, 1, dt);
        this.lfo2Val = this.calcLfo(now / 1000, this.params.rate2, this.params.shape2, this.params.depth2, 2, dt);
      } else {
        this.lfo1Val = 0;
        this.lfo2Val = 0;
      }

      this.animId = requestAnimationFrame(tick);
    };

    this.animId = requestAnimationFrame(tick);
  }

  private calcLfo(t: number, rate: number, shape: string, depth: number, lfoNum: number, dt: number): number {
    const phase = (t * rate) % 1;
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
      case 'random':
        if (lfoNum === 1) {
          this.sampleHoldTimer1 += dt;
          if (this.sampleHoldTimer1 >= 1 / rate) {
            this.sampleHoldTimer1 = 0;
            this.lastSampleHold1 = (Math.random() * 2 - 1);
          }
          raw = this.lastSampleHold1;
        } else {
          this.sampleHoldTimer2 += dt;
          if (this.sampleHoldTimer2 >= 1 / rate) {
            this.sampleHoldTimer2 = 0;
            this.lastSampleHold2 = (Math.random() * 2 - 1);
          }
          raw = this.lastSampleHold2;
        }
        break;
      default:
        raw = Math.sin(phase * 2 * Math.PI);
    }

    return raw * depth;
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
  }

  public dispose(): void {
    super.dispose();
    cancelAnimationFrame(this.animId);
  }
}
