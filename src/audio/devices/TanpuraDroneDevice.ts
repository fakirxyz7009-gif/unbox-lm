import { BaseDevice } from '../BaseDevice.ts';

export class TanpuraDroneDevice extends BaseDevice {
  public droneRoot: number = 110.0;
  public stringPluckRate: number = 0.8;
  private masterOutput: GainNode;
  public isRunning: boolean = false;
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];

  constructor(ctx: AudioContext, id: string, name: string = 'Tanpura & Drone Generator') {
    super(ctx, id, name, 'tanpura', 1);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.9;
    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      droneRoot: 110.0,
      stringPluckRate: 0.8,
      volume: 0.9,
      droneActive: false,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
    ];
  }

  public startDrone(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.params.droneActive = true;
    const now = this.ctx.currentTime;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.32, now);

    const root = this.droneRoot || 110.0;
    [root, root * 1.5, root * 2, root * 3].forEach((freq) => {
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
    this.params.droneActive = false;
    this.droneOscs.forEach((o) => {
      try {
        o.stop();
        o.disconnect();
      } catch (e) {}
    });
    this.droneOscs = [];
  }

  public toggleDrone(): boolean {
    if (this.isRunning) {
      this.stopDrone();
    } else {
      this.startDrone();
    }
    return this.isRunning;
  }

  public setParam(param: string, val: any): void {
    this.params[param] = val;
    if (param === 'droneRoot') {
      const num = Number(val) || 110;
      this.droneRoot = num;
      const freqs = [num, num * 1.5, num * 2, num * 3];
      this.droneOscs.forEach((osc, idx) => {
        if (freqs[idx]) osc.frequency.setTargetAtTime(freqs[idx], this.ctx.currentTime, 0.02);
      });
    } else if (param === 'droneActive') {
      if (val && !this.isRunning) this.startDrone();
      if (!val && this.isRunning) this.stopDrone();
    } else if (param === 'volume') {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, Number(val))), this.ctx.currentTime, 0.015);
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.8, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time);
    const freq = 440.0 * Math.pow(2.0, (midiNote - 69.0) / 12.0);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.42, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(velocity * 0.28, now + 1.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.2, now);
    filter.Q.setValueAtTime(2.8, now); // Jawari bridge shimmer

    [1, 1.5, 2, 3].forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * ratio, now);
      osc.detune.setValueAtTime((idx - 1.5) * 5, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 4.6);
    });

    filter.connect(gain);
    gain.connect(this.masterOutput);
  }

  public noteOff(_midiNote: number, _time?: number): void {}
}
