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

  private resolveCutoffHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 1800;
    if (n <= 1.5) return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    return Math.max(40, Math.min(18000, n));
  }

  private resolveResonanceQ(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 5.5;
    if (n <= 1.0) return 0.7 + Math.max(0, Math.min(1, n)) * 12.0;
    return Math.max(0.5, Math.min(20, n));
  }

  public setParam(key: string, value: any): void {
    if (key === 'volume') {
      const v = Math.max(0, Math.min(1.5, Number(value)));
      this.params.volume = v;
      this.masterOutput.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    } else if (key === 'cutoff') {
      const hz = this.resolveCutoffHz(value);
      this.params.cutoff = hz;
      this.activeVoices.forEach((v) => {
        v.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.02);
      });
    } else if (key === 'resonance') {
      const q = this.resolveResonanceQ(value);
      this.params.resonance = q;
      this.activeVoices.forEach((v) => {
        v.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.02);
      });
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midiNote: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const startTime = Math.max(this.ctx.currentTime, time);
    this.noteOff(midiNote, startTime);

    const freq = Math.max(20, Math.min(18000, 440 * Math.pow(2, (midiNote - 69) / 12)));
    const osc1 = this.ctx.createOscillator();
    osc1.type = this.params.osc1Type;
    osc1.frequency.setValueAtTime(Math.max(20, freq * Math.pow(2, this.params.osc1Octave)), startTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = this.params.osc2Type;
    osc2.frequency.setValueAtTime(Math.max(20, freq * Math.pow(2, this.params.osc2Octave)), startTime);
    osc2.detune.setValueAtTime(this.params.osc2Detune, startTime);

    const osc3 = this.ctx.createOscillator();
    osc3.type = this.params.osc3Type;
    osc3.frequency.setValueAtTime(Math.max(20, freq * Math.pow(2, this.params.osc3Octave)), startTime);

    const baseCutoff = this.resolveCutoffHz(this.params.cutoff);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(baseCutoff, startTime);
    filter.Q.setValueAtTime(this.resolveResonanceQ(this.params.resonance), startTime);

    const amp = this.ctx.createGain();
    const attack = Math.max(0.005, this.params.attack);
    const decay = Math.max(0.02, this.params.decay);
    const sustain = Math.max(0.08, Math.min(1, this.params.sustain));
    const peakGain = Math.max(0.05, Math.min(1, velocity)) * 0.75;

    amp.gain.cancelScheduledValues(startTime);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * sustain), startTime + attack + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterOutput);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    this.activeVoices.set(midiNote, { oscs: [osc1, osc2, osc3], filter, ampGain: amp });
  }

  public noteOff(midiNote: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;
    this.activeVoices.delete(midiNote);

    const relTime = Math.max(this.ctx.currentTime, time);
    const release = Math.max(0.03, Math.min(2.5, this.params.release));
    const cur = Math.max(0.001, voice.ampGain.gain.value || 0.25);

    try {
      voice.ampGain.gain.cancelScheduledValues(relTime);
      voice.ampGain.gain.setValueAtTime(cur, relTime);
      voice.ampGain.gain.exponentialRampToValueAtTime(0.0001, relTime + release);
      const stopAt = relTime + release + 0.02;
      voice.oscs.forEach((o) => o.stop(stopAt));
    } catch (e) {}

    setTimeout(() => {
      try {
        voice.oscs.forEach((o) => o.disconnect());
        voice.filter.disconnect();
        voice.ampGain.disconnect();
      } catch (e) {}
    }, Math.max(60, (relTime - this.ctx.currentTime + release) * 1000 + 80));
  }
}
