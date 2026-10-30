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
  /**
   * A software CV source may evaluate at the scheduled AudioContext time.
   * The argument is optional so static CV sources can continue to use a
   * zero-argument getter.
   */
  public cvOutputs: Map<string, { node?: AudioNode; getter?: (audioTime?: number) => number }> = new Map();

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

  public static readonly NON_INSTRUMENT_TYPES: Set<DeviceType> = new Set([
    'scream4',
    'rv7000',
    'echo',
    'mclass_master',
    'spider_audio',
    'spider_cv',
    'pulsar',
    'matrix',
    'rv9',
    'ripley',
    'osmium',
    'pulveriser',
    'alligator',
    'bvx_vocoder',
    'neptune',
    'pitch_correct',
    'quartet',
    'sweeper',
    'audiomatic',
    'rotor',
    'softube_amp',
    'rpg8',
    'midi_out',
    'line_mixer',
    'automation_clip',
    'vst_effect',
    'mix_bus',
    'audio_track',
  ]);

  public isPlayableInstrument(): boolean {
    return !BaseDevice.NON_INSTRUMENT_TYPES.has(this.type);
  }

  /**
   * Default noteOn is a no-op so FX processors, mixers, and CV utilities
   * never synthesize unwanted sawtooth melodies. Playable instrument subclasses override this.
   */
  public noteOn(_note: number, _velocity: number = 0.85, _time: number = this.ctx.currentTime): void {}

  public noteOff(_note: number, _time?: number): void {}
  public triggerPad?(padIndex: number, velocity?: number, time?: number): void;
  public onStepTick?(step: number, time?: number): void;
  /** Devices with state beyond numeric params (samples, library snapshots) rebuild themselves for offline export. */
  public cloneForOfflineContext?(ctx: BaseAudioContext): BaseDevice;
  /** Resolves when async resources (worklets, rendered samples) are ready — awaited before offline export. */
  public ready?(): Promise<void>;

  public dispose(): void {
    this.audioInputs.forEach((node) => {
      try { node.disconnect(); } catch (e) {}
    });
    this.audioInputs.clear();

    this.audioOutputs.forEach((node) => {
      try { node.disconnect(); } catch (e) {}
    });
    this.audioOutputs.clear();

    this.cvInputs.forEach((entry) => {
      if (entry.node) {
        try { entry.node.disconnect(); } catch (e) {}
      }
    });
    this.cvInputs.clear();

    this.cvOutputs.forEach((entry) => {
      if (entry.node) {
        try { entry.node.disconnect(); } catch (e) {}
      }
    });
    this.cvOutputs.clear();

    try {
      this.analyser?.disconnect();
    } catch (e) {}
  }

  public speakName(): void {
    const utterance = new SpeechSynthesisUtterance(this.name);
    window.speechSynthesis.speak(utterance);
  }
}
