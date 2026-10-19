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

  protected makeDriveCurve(amount: number): Float32Array {
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
  constructor(ctx: AudioContext, id: string = 'rv9_1', name: string = 'RV-9 Flagorous Reverb Station') {
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

// 2. RIPLEY: Space Delay
export class RipleyDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'ripley_1', name: string = 'Ripley Space Delay') {
    super(ctx, id, name, 'ripley', 2, {
      delayTime: 0.375,
      feedback: 0.62,
      spaceReverb: 0.55,
      wobbleDepth: 0.35,
      bitDigital: 0.25,
      duckerAmount: 0.4,
      cutoff: 4200,
      mix: 0.52,
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

// 4. PULVERISER: Demolition Unit (Filter, Distortion, Compression)
export class PulveriserDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'pulveriser_1', name: string = 'Pulveriser Demolition Unit') {
    super(ctx, id, name, 'pulveriser', 2, {
      squashComp: 0.72,
      dirtMode: 'Gnash', // Lazers, Gnash,erea, Tape, Tube
      drive: 0.68,
      filterMode: 'LP 24 + Peak',
      cutoff: 2400,
      resonance: 5.5,
      tremorRate: 4.5,
      followerToFilter: 0.6,
      mix: 0.8,
    });
  }
}

// 5. ALLIGATOR: Three-Channel Pattern Filter
export class AlligatorDevice extends ReasonEffectBase {
  public currentGateStep: number = 0;

  constructor(ctx: AudioContext, id: string = 'alligator_1', name: string = 'Alligator Triple Pattern Filter') {
    super(ctx, id, name, 'alligator', 3, {
      patternPreset: 'Trance Chopper #04',
      hpCutoff: 1800,
      bpCutoff: 1100,
      lpCutoff: 420,
      resonance: 5.0,
      drive: 0.48,
      ducking: 0.3,
      gateSteps: [true, false, true, true, false, true, false, true, true, false, true, true, false, true, true, false],
      mix: 0.85,
    });
  }

  public onStepTick(step: number, time: number): void {
    this.currentGateStep = step % 16;
    const steps: boolean[] = this.params.gateSteps || [];
    const open = steps[this.currentGateStep] ?? true;
    const targetHz = open ? Math.max(800, Number(this.params.hpCutoff) * 2.2) : 220;
    this.filterNode.frequency.setTargetAtTime(targetHz, time, 0.015);
  }
}

// 6. BV-X / BV512: Digital and Analog Vocoders
export class BVXVocoderDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'bvx_vocoder_1', name: string = 'BV-X & BV512 Vocoder') {
    super(ctx, id, name, 'bvx_vocoder', 3, {
      vocoderEngine: '512-Band FFT Vocoder', // '512-Band FFT Vocoder' | '32-Band Vintage Analog' | 'BV-X Modern Carrier'
      formantShift: 2, // semitones (-12 to +12)
      hfNoiseBlend: 0.35,
      carrierWave: 'SuperSaw Chord',
      attackDecay: 0.25,
      cutoff: 3800,
      resonance: 6.2,
      mix: 0.85,
    });
  }
}

// 7. NEPTUNE: Pitch Adjuster & Voice Synth
export class NeptuneDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'neptune_1', name: string = 'Neptune Pitch Adjuster & Voice Synth') {
    super(ctx, id, name, 'neptune', 2, {
      scaleMemory: 'Chromatic / Root Lock',
      correctionSpeed: 0.92, // 0..1 (Hard Tune)
      transposeSemi: 0,
      formantShift: 0,
      voiceSynthLevel: 0.65,
      lowFreqPreserve: true,
      mix: 0.9,
    });
  }
}

// 8. QUARTET: Chorus Ensemble
export class QuartetDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'quartet_1', name: string = 'Quartet Chorus Ensemble') {
    super(ctx, id, name, 'quartet', 2, {
      chorusAlgorithm: 'BBD Brigade', // BBD Brigade, FFT Spectral, Granular Cloud, Ensemble 70s
      delayTime: 0.018,
      rate: 1.4,
      depth: 0.68,
      stereoWidth: 0.9,
      mix: 0.55,
    });
  }
}

// 9. SWEEPER: Modulation Effect (Chorus, Flanger, Phaser)
export class SweeperDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'sweeper_1', name: string = 'Sweeper Phaser / Flanger / Chorus') {
    super(ctx, id, name, 'sweeper', 2, {
      modFilterType: 'Phaser 12-Pole', // Phaser 12-Pole, Flanger Comb, Wide Chorus
      cutoff: 1450,
      resonance: 6.8,
      lfoRate: 0.85,
      envFollowerAmt: 0.6,
      spreadStereo: 0.75,
      feedback: 0.58,
      mix: 0.65,
    });
  }
}

// 10. AUDIOMATIC: Retro Transformer
export class AudiomaticDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'audiomatic_1', name: string = 'Audiomatic Retro Transformer') {
    super(ctx, id, name, 'audiomatic', 2, {
      retroPreset: 'VHS Tape 1984', // Tape, Hi-Fi, Bright, Bottom, Spread, Vinyl, MP3, Psyche, Cracked, Gadget, VHS, Circuit
      transform: 0.65,
      gainIn: 0.85,
      drive: 0.45,
      cutoff: 4100,
      mix: 0.7,
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

// 12. SOFTUBE GUITAR AMP / SOFTUBE BASS AMP
export class SoftubeAmpDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'softube_amp_1', name: string = 'Softube Guitar & Bass Amp') {
    super(ctx, id, name, 'softube_amp', 2, {
      ampRig: 'Guitar: Vintage UK Stack', // Guitar: Vintage UK Stack, Guitar: Modern Metal, Bass: Classic 8x10 Rig, Bass: Funk DI Tube
      cabModel: '4x12 Greenback Condenser',
      drive: 0.65,
      bassEq: 0.6,
      midEq: 0.55,
      trebleEq: 0.68,
      presence: 0.6,
      cutoff: 4400,
      mix: 0.95,
    });
  }
}

// 13. COMBINATOR: Polyphonic Synthesizer & Multi-Device Macro Workstation
export class CombinatorDevice extends ReasonEffectBase {
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string = 'combinator_1', name: string = 'COMBINATOR Polyphonic Synthesizer') {
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

// 14. RPG-8: Monophonic Arpeggiator
export class RPG8Device extends ReasonEffectBase {
  public currentArpStep: number = 0;

  constructor(ctx: AudioContext, id: string = 'rpg8_1', name: string = 'RPG-8 Monophonic Arpeggiator') {
    super(ctx, id, name, 'rpg8', 2, {
      arpMode: 'UP + DOWN', // UP, DOWN, UP + DOWN, RANDOM, MANUAL
      octaveRange: 3, // 1..4 Octaves
      syncRate: '1/16',
      gateLength: 0.65,
      velocityLock: 0.88,
      singleNoteRepeat: true,
      patternMask: [true, true, true, false, true, true, false, true, true, true, true, false, true, false, true, true],
    });
  }

  public onStepTick(step: number, _time: number): void {
    this.currentArpStep = step % 16;
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
}

// 16. LINE MIXER 6:2 / 14:2 MIXER: Signal Blending
export class LineMixerDevice extends ReasonEffectBase {
  constructor(ctx: AudioContext, id: string = 'line_mixer_1', name: string = 'Line Mixer 6:2 / 14:2') {
    super(ctx, id, name, 'line_mixer', 2, {
      mixerFormat: '14:2 Rack Studio Mixer', // '6:2 Micromixer' | '14:2 Rack Studio Mixer'
      ch1Level: 0.85,
      ch2Level: 0.8,
      ch3Level: 0.75,
      ch4Level: 0.78,
      ch5Level: 0.72,
      ch6Level: 0.8,
      auxSend1: 0.45,
      auxReturn1: 0.6,
      eqTreble: 0.55,
      eqBass: 0.6,
      masterLevel: 0.9,
      mix: 0.95,
    });
  }
}
