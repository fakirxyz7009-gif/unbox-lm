import { BaseDevice } from '../BaseDevice.ts';
import { ShrutiMicrotonalEngine } from '../ShrutiMicrotonalEngine.ts';

export class BansuriDevice extends BaseDevice {
  public breathPressure: number = 0.85;
  public vibratoDepth: number = 0.15;
  public meendBending: number = 0.0;
  public ragaScale: string = 'Bilawal (Major)';
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeOscs: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Bansuri Bamboo Flute') {
    super(ctx, id, name, 'bansuri', 2);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.92;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.92,
      pan: 0,
      breathPressure: 0.85,
      vibratoDepth: 0.15,
      meendBending: 0.0,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Meend CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_pitch', {
      setter: (val: number) => {
        this.meendBending = Math.max(-0.25, Math.min(0.25, val * 0.2));
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    this.noteOff(note, now);

    const rawFreq = ShrutiMicrotonalEngine.midiToShrutiFrequency(note, 261.63, this.ragaScale) * (1 + this.meendBending);
    const freq = Math.max(55, Math.min(8000, rawFreq));

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq * 0.97, now); // Subtle bamboo meend glide-in
    osc1.frequency.exponentialRampToValueAtTime(freq, now + 0.045);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.0, now);

    const h2Gain = this.ctx.createGain();
    h2Gain.gain.value = 0.28;
    osc2.connect(h2Gain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(14000, freq * 3.8), now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = this.ctx.createGain();
    const peak = Math.max(0.1, velocity) * 0.85 * Math.max(0.3, this.breathPressure);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(peak * 0.78, now + 0.35);

    osc1.connect(filter);
    h2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2.8);
    osc2.stop(now + 2.8);
    this.activeOscs.set(note, { oscs: [osc1, osc2], gain, filter });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const active = this.activeOscs.get(note);
    if (!active) return;
    this.activeOscs.delete(note);
    const relTime = Math.max(this.ctx.currentTime, time || this.ctx.currentTime);
    try {
      active.gain.gain.cancelScheduledValues(relTime);
      active.gain.gain.setValueAtTime(Math.max(0.001, active.gain.gain.value || 0.25), relTime);
      active.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.16);
      active.oscs.forEach((o) => {
        try {
          o.stop(relTime + 0.18);
        } catch (e) {}
      });
    } catch (e) {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'breathPressure' && !isNaN(num)) this.breathPressure = Math.max(0.2, Math.min(1.2, num));
    if (param === 'vibratoDepth' && !isNaN(num)) this.vibratoDepth = num;
    if (param === 'meendBending' && !isNaN(num)) this.meendBending = num;
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
