import { DeviceType, PortDefinition } from './types.ts';

export abstract class BaseDevice {
  public id: string;
  public name: string;
  public type: DeviceType;
  public heightUnits: number;
  public ctx: AudioContext;

  public audioInputs: Map<string, GainNode> = new Map();
  public audioOutputs: Map<string, GainNode> = new Map();
  public cvInputs: Map<string, { param?: AudioParam; setter?: (val: number) => void; node?: GainNode }> = new Map();
  public cvOutputs: Map<string, { node?: AudioNode; getter?: () => number }> = new Map();

  public ports: PortDefinition[] = [];
  public params: Record<string, any> = {};
  public isPowered: boolean = true;
  public isBypassed: boolean = false;
  public analyser: AnalyserNode;

  constructor(ctx: AudioContext, id: string, name: string, type: DeviceType, heightUnits: number = 2) {
    this.ctx = ctx;
    this.id = id;
    this.name = name;
    this.type = type;
    this.heightUnits = heightUnits;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
  }

  abstract setParam(key: string, value: any): void;

  /**
   * Default polyphonic/signal excitation noteOn so every device (including FX/CV/Routing modules)
   * can be sequenced, played on the Piano Roll, and auditioned through its DSP chain.
   * Subclasses override this with specialized instrument synthesis.
   */
  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    const freq = Math.max(30, Math.min(14000, 440 * Math.pow(2, (note - 69) / 12)));

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 4), now);

    const gain = this.ctx.createGain();
    const vol = typeof this.params?.volume === 'number' ? this.params.volume : 0.85;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.1, velocity) * vol * 0.45, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);

    const inL = this.audioInputs.get('in_l');
    const inR = this.audioInputs.get('in_r');
    const outL = this.audioOutputs.get('out_l');
    const outR = this.audioOutputs.get('out_r');

    if (inL) {
      gain.connect(inL);
      if (inR && inR !== inL) gain.connect(inR);
    } else if (outL) {
      gain.connect(outL);
      if (outR && outR !== outL) gain.connect(outR);
    } else {
      gain.connect(this.analyser);
    }

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.42);
    osc2.stop(now + 0.42);
  }

  public noteOff(_note: number, _time?: number): void {}
  public triggerPad?(padIndex: number, velocity?: number, time?: number): void;
  public onStepTick?(step: number, time?: number): void;

  public dispose(): void {
    this.audioInputs.forEach((node) => {
      try { node.disconnect(); } catch (e) {}
    });
    this.audioOutputs.forEach((node) => {
      try { node.disconnect(); } catch (e) {}
    });
  }

  public speakName(): void {
    const utterance = new SpeechSynthesisUtterance(this.name);
    window.speechSynthesis.speak(utterance);
  }
}
