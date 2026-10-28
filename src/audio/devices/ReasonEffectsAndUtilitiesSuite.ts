import { BaseDevice } from '../BaseDevice.ts';
import { DeviceType } from '../types.ts';

/**
 * Shared Stereo Audio Effect & Utility Processor Base for Reason Rack
 * Supports both insert audio processing (in_l/in_r -> out_l/out_r) and instant self-test auditioning.
 */
export class ReasonEffectBase extends BaseDevice {
  protected inputL: GainNode;
  protected inputR: GainNode;
  protected outputL: GainNode;
  protected outputR: GainNode;
  protected dryGain: GainNode;
  protected wetGain: GainNode;
  protected filterNode: BiquadFilterNode;
  protected shaperNode: WaveShaperNode;
  protected delayNode: DelayNode;
  protected feedbackGain: GainNode;

  constructor(
    ctx: AudioContext,
    id: string,
    name: string,
    type: DeviceType,
    heightUnits: number = 2,
    defaultParams: Record<string, any> = {}
  ) {
    super(ctx, id, name, type, heightUnits);

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.outputL = ctx.createGain();
    this.outputR = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 5400;
    this.filterNode.Q.value = 2.4;

    this.shaperNode = ctx.createWaveShaper();
    this.shaperNode.curve = this.makeDriveCurve(0.35);

    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.22;
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0.3;

    this.audioInputs.set('in_l', this.inputL);
    this.audioInputs.set('in_r', this.inputR);
    this.audioOutputs.set('out_l', this.outputL);
    this.audioOutputs.set('out_r', this.outputR);
    this.outputL.connect(this.analyser);

    // Dry path
    this.inputL.connect(this.dryGain);
    this.inputR.connect(this.dryGain);
    this.dryGain.connect(this.outputL);
    this.dryGain.connect(this.outputR);

    // Wet DSP chain
    this.inputL.connect(this.shaperNode);
    this.inputR.connect(this.shaperNode);
    this.shaperNode.connect(this.filterNode);
    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    this.filterNode.connect(this.wetGain);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.outputL);
    this.wetGain.connect(this.outputR);

    this.params = {
      mix: 0.55,
      drive: 0.35,
      cutoff: 4800,
      resonance: 2.5,
      delayTime: 0.22,
      feedback: 0.32,
      rate: 2.4,
      depth: 0.5,
      ...defaultParams,
    };

    this.ports = [
      { id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' },
      { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' },
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_mod', name: 'Modulation CV In', type: 'cv_in' },
      { id: 'cv_mix', name: 'Dry/Wet CV In', type: 'cv_in' },
      { id: 'cv_out', name: 'Follower / Mod CV Out', type: 'cv_out' },
    ];

    this.applyDspParams();

    this.cvInputs.set('cv_mix', {
      setter: (amount: number) => {
        this.setParam('mix', Math.max(0, Math.min(1, (Number(this.params.mix) || 0.5) + amount * 0.4)));
      },
    });
  }

  protected makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(n);
    const k = Math.max(0.05, amount) * 45;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  protected applyDspParams(): void {
    const now = this.ctx.currentTime;
    const mix = Math.max(0, Math.min(1, Number(this.params.mix) ?? 0.55));
    this.wetGain.gain.setTargetAtTime(mix, now, 0.015);
    this.dryGain.gain.setTargetAtTime(1 - mix * 0.65, now, 0.015);

    const cut = Math.max(60, Math.min(18000, Number(this.params.cutoff) || 4800));
    this.filterNode.frequency.setTargetAtTime(cut, now, 0.02);
    this.filterNode.Q.setTargetAtTime(Math.max(0.5, Math.min(18, Number(this.params.resonance) || 2.5)), now, 0.02);

    this.shaperNode.curve = this.makeDriveCurve(Number(this.params.drive) || 0.35);
    this.delayNode.delayTime.setTargetAtTime(Math.max(0.005, Math.min(1.5, Number(this.params.delayTime) || 0.18)), now, 0.02);
    this.feedbackGain.gain.setTargetAtTime(Math.max(0, Math.min(0.88, Number(this.params.feedback) || 0.3)), now, 0.02);
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    this.applyDspParams();
  }

  // Pure FX and Utility modules are signal processors — noteOn is a no-op so they never emit raw sawtooth tones
  public noteOn(_midiNote: number = 60, _velocity: number = 0.85, _time: number = this.ctx.currentTime): void {}

  public noteOff(_midiNote: number, _time?: number): void {}
}

// 1. RV-9: Flagorous Reverb Station
export class RV9Device extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'rv9_1', name: string = 'Flagstone Reverb Station') {
    super(ctx, id, name, 'rv9', 2, {
      spaceModel: 'Abyssal Shimmer Hall',
      decayTime: 4.8,
      shimmerPitch: 12,
      diffusion: 0.85,
      dampingHz: 6200,
      mix: 0.6,
      delayTime: 0.085,
      feedback: 0.68,
    });
  }
}

// 3. OSMIUM: Distortion Matrix
export class OsmiumDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'osmium_1', name: string = 'Osmium Distortion Matrix') {
    super(ctx, id, name, 'osmium', 2, {
      matrixCellA: 'Tube Triode',
      matrixCellB: 'Wavefold Crush',
      xoverFreq: 850,
      drive: 0.78,
      asymmetry: 0.45,
      cutoff: 5100,
      resonance: 4.2,
      mix: 0.75,
      feedback: 0.1,
    });
  }
}

// 11. ROTOR: Rotary Speaker Emulation
export class RotorDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'rotor_1', name: string = 'Rotor Rotary Speaker') {
    super(ctx, id, name, 'rotor', 2, {
      rotarySpeed: 'FAST (Tremolo)', // 'SLOW (Chorale)' | 'FAST (Tremolo)' | 'BRAKE'
      acceleration: 0.5,
      hornDrumBlend: 0.6,
      drive: 0.42,
      dopplerSpread: 0.85,
      micDistance: 0.35,
      mix: 0.85,
    });
  }
}

// 13. COMBINATOR: Polyphonic Synthesizer & Multi-Device Macro Workstation
export class CombinatorDevice extends ReasonEffectBase {
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string = 'combinator_1', name: string = 'Combiner Macro Container') {
    super(ctx, id, name, 'combinator', 2, {
      combiPatchName: 'Init Patch',
      osc1Wave: 0.65,
      osc2Wave: 0.48,
      filterCutoff: 0.72,
      amrMod: 0.45,
      ampLevel: 0.85,
      lfoRate: 0.4,
      delayMix: 0.32,
      reverbMix: 0.28,
      rotary1Name: 'FILTER',
      rotary1Val: 0.72,
      rotary2Name: 'AMR',
      rotary2Val: 0.45,
      rotary3Name: 'AMP',
      rotary3Val: 0.85,
      rotary4Name: 'LFO',
      rotary4Val: 0.4,
      btn1Name: 'ARP ENABLE',
      btn1Active: true,
      btn2Name: 'CHORD MEMORY',
      btn2Active: false,
      btn3Name: 'TAPE DELAY',
      btn3Active: true,
      btn4Name: 'WIDTH BOOST',
      btn4Active: true,
      runPatternDevices: true,
    });
  }

  public override noteOn(midiNote: number = 60, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, startTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq * 1.003, startTime);

    const vcf = this.ctx.createBiquadFilter();
    vcf.type = 'lowpass';
    const cutNorm = Number(this.params.filterCutoff ?? this.params.rotary1Val ?? 0.72);
    vcf.frequency.setValueAtTime(Math.max(120, Math.min(16000, 180 * Math.pow(65, cutNorm))), startTime);
    vcf.Q.setValueAtTime(2.2, startTime);

    const env = this.ctx.createGain();
    const peak = Math.max(0.08, Math.min(1.0, velocity * 0.65));
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(peak * 0.6, startTime + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);

    osc1.connect(vcf);
    osc2.connect(vcf);
    vcf.connect(env);
    env.connect(this.outputL);
    env.connect(this.outputR);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + 1.45);
    osc2.stop(startTime + 1.45);

    this.activeVoices.set(midiNote, { oscs: [osc1, osc2], gain: env });
  }

  public override noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const v = this.activeVoices.get(midiNote);
    if (!v) return;
    this.activeVoices.delete(midiNote);
    const rel = Math.max(this.ctx.currentTime, time);
    try {
      v.gain.gain.setTargetAtTime(0.0001, rel, 0.04);
      v.oscs.forEach((o) => {
        try {
          o.stop(rel + 0.16);
        } catch (e) {}
      });
    } catch (e) {}
  }
}

// 15. MIDI OUT DEVICE: Hardware & External Plugin Control Module
export class MidiOutDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'midi_out_1', name: string = 'MIDI Out External Hardware Module') {
    super(ctx, id, name, 'midi_out', 2, {
      midiChannel: 1, // 1..16
      bankMsb: 0,
      programNum: 14,
      extPortName: 'WebMIDI Virtual Bus A',
      sendClockSync: true,
      cc1Val: 64,
      cc71Val: 82,
      cc74Val: 96,
      cc91Val: 48,
    });
  }

  /** Set by AudioEngine so mapped front-panel CC controls reach the chosen hardware port. */
  public onControl?: (channel: number, cc: number, value: number) => void;

  public override setParam(key: string, value: any): void {
    super.setParam(key, value);
    const match = /^cc(\d+)Val$/.exec(key);
    if (!match) return;
    const cc = Number(match[1]);
    const channel = Math.max(1, Math.min(16, Math.round(Number(this.params.midiChannel) || 1)));
    const midiValue = Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
    this.onControl?.(channel, cc, midiValue);
  }
}
