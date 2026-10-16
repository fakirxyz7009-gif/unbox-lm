import { BaseDevice } from '../BaseDevice.ts';

export class TanpuraDroneDevice extends BaseDevice {
  public droneRoot: number = 110.0;
  public stringPluckRate: number = 0.8;
  private masterOutput: GainNode;
  private isRunning: boolean = false;
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];

  constructor(ctx: AudioContext, id: string, name: string = 'Tanpura & Drone Generator') {
    super(ctx, id, name, 'tanpura', 1);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.9;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
    ];
  }

  public startDrone(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const now = this.ctx.currentTime;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.4, now);

    [110.0, 165.0, 220.0, 330.0].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);

      osc.connect(filter);
      filter.connect(this.droneGain!);
      osc.start(now);
      this.droneOscs.push(osc);
    });

    this.droneGain.connect(this.masterOutput);
  }

  public stopDrone(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.droneOscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
    this.droneOscs = [];
  }

  public setParam(param: string, val: number): void {
    if (param === 'droneRoot') {
      this.droneRoot = val;
      const freqs = [val, val * 1.5, val * 2, val * 3];
      this.droneOscs.forEach((osc, idx) => {
        if (freqs[idx]) osc.frequency.setValueAtTime(freqs[idx], this.ctx.currentTime);
      });
    }
    if (param === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime);
    }
  }
}
