import { BaseDevice } from '../BaseDevice.ts';

interface ThorVoice {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  ampGain: GainNode;
}

export class ThorDevice extends BaseDevice {
  private masterOutput: GainNode;
  private chorusDelayL: DelayNode;
  private chorusDelayR: DelayNode;
  private chorusMix: GainNode;
  private activeVoices: Map<number, ThorVoice> = new Map();

  constructor(ctx: AudioContext, id: string = 'thor_1', name: string = 'Thor Polysonic Synth') {
    super(ctx, id, name, 'thor', 3);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.8;

    // Built-in stereo chorus stage
    this.chorusDelayL = ctx.createDelay();
    this.chorusDelayR = ctx.createDelay();
    this.chorusDelayL.delayTime.value = 0.015;
    this.chorusDelayR.delayTime.value = 0.022;
    this.chorusMix = ctx.createGain();
    this.chorusMix.gain.value = 0.35;

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      osc1Type: 'sawtooth',
      osc1Octave: 0,
      osc2Type: 'square',
      osc2Octave: 0,
      osc2Detune: 12,
      osc3Type: 'triangle',
      osc3Octave: -1,
      cutoff: 1800,
      resonance: 5.5,
      drive: 2.5,
      attack: 0.04,
      decay: 0.45,
      sustain: 0.5,
      release: 0.6,
      chorusAmount: 0.4,
      volume: 0.85,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_cutoff', name: 'Filter CV In', type: 'cv_in' },
      { id: 'cv_pitch', name: 'Pitch CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_cutoff', {
      setter: (amount: number) => {
        const mod = Math.pow(2, amount * 3);
        const target = Math.min(20000, Math.max(40, this.params.cutoff * mod));
        this.activeVoices.forEach((v) => {
          v.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.02);
        });
      },
    });

    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.9);
        else this.noteOff(60);
      },
    });
  }

  public setParam(key: string, value: any): void {
    this.params[key] = value;
    if (key === 'volume') {
      this.masterOutput.gain.setValueAtTime(Math.max(0, Math.min(1.5, Number(value))), this.ctx.currentTime);
    } else if (key === 'cutoff') {
      this.activeVoices.forEach((v) => {
        v.filter.frequency.setTargetAtTime(Number(value), this.ctx.currentTime, 0.02);
      });
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.8, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    this.noteOff(midiNote, time);

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    osc1.frequency.setValueAtTime(freq * Math.pow(2, this.params.osc1Octave), time);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    osc2.frequency.setValueAtTime(freq * Math.pow(2, this.params.osc2Octave), time);
    osc2.detune.setValueAtTime(this.params.osc2Detune, time);

    const osc3 = this.ctx.createOscillator();
    osc3.type = this.params.osc3Type;
    osc3.frequency.setValueAtTime(freq * Math.pow(2, this.params.osc3Octave), time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(40, this.params.cutoff), time);
    filter.Q.setValueAtTime(this.params.resonance, time);

    const amp = this.ctx.createGain();
    const attack = Math.max(0.005, this.params.attack);
    const decay = Math.max(0.01, this.params.decay);
    const sustain = Math.max(0.05, Math.min(1, this.params.sustain));

    amp.gain.cancelScheduledValues(time);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(velocity * 0.75, time + attack);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * 0.75 * sustain), time + attack + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc1.start(time);
    osc2.start(time);
    osc3.start(time);

    this.activeVoices.set(midiNote, { oscs: [osc1, osc2, osc3], filter, ampGain: amp });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    const release = Math.max(0.02, this.params.release);
    const cur = Math.max(0.0001, voice.ampGain.gain.value);

    voice.ampGain.gain.cancelScheduledValues(time);
    voice.ampGain.gain.setValueAtTime(cur, time);
    voice.ampGain.gain.exponentialRampToValueAtTime(0.0001, time + release);

    setTimeout(() => {
      try {
        voice.oscs.forEach((o) => { o.stop(); o.disconnect(); });
        voice.filter.disconnect();
        voice.ampGain.disconnect();
      } catch (e) {}
    }, release * 1000 + 100);

    this.activeVoices.delete(midiNote);
  }
}
