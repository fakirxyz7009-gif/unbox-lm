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

  public noteOn?(note: number, velocity?: number, time?: number): void;
  public noteOff?(note: number, time?: number): void;
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
