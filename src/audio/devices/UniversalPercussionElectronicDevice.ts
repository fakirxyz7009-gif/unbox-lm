import { BaseDevice } from '../BaseDevice.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

export class UniversalPercussionElectronicDevice extends BaseDevice {
  public instrumentName: string;
  public category: 'percussion' | 'electronic';
  public brilliance: number = 0.75;
  public decay: number = 0.55;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Percussion/Electronic Instrument', category: 'percussion' | 'electronic' = 'percussion') {
    super(ctx, id, name, 'percussion_electronic', 2);
    this.instrumentName = name;
    this.category = category;

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
      brilliance: 0.75,
      decay: 0.55,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Pitch/Tone CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Trigger Gate CV In', type: 'cv_in' },
    ];

    this.cvInputs.set('cv_pitch', {
      setter: (val: number) => {
        this.brilliance = Math.max(0.1, Math.min(1.0, 0.75 + val * 0.25));
      },
    });
    this.cvInputs.set('cv_gate', {
      setter: (gate: number) => {
        if (gate > 0.5) this.noteOn(60, 0.9, this.ctx.currentTime);
      },
    });
  }

  public noteOn(note: number, velocity: number = 0.88, time?: number): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    this.noteOff(note, now);

    const freq = Math.max(40, Math.min(12000, 440.0 * Math.pow(2.0, (note - 69.0) / 12.0)));
    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const lowerName = this.instrumentName.toLowerCase();

    const isTablaOrHandDrum =
      lowerName.includes('tabla') ||
      lowerName.includes('mridangam') ||
      lowerName.includes('darbuka') ||
      lowerName.includes('doumbek') ||
      lowerName.includes('bata') ||
      lowerName.includes('djembe') ||
      lowerName.includes('conga') ||
      lowerName.includes('bongo');
    const isHeavyDrum =
      lowerName.includes('drum') ||
      lowerName.includes('timpani') ||
      lowerName.includes('taiko') ||
      lowerName.includes('cajon') ||
      lowerName.includes('bodhran') ||
      lowerName.includes('toms') ||
      lowerName.includes('pahu');
    const isPianoOrKeys =
      lowerName.includes('piano') ||
      lowerName.includes('rhodes') ||
      lowerName.includes('wurlitzer') ||
      lowerName.includes('clavinet') ||
      lowerName.includes('harpsichord') ||
      lowerName.includes('celesta');

    if (isTablaOrHandDrum || isHeavyDrum || isPianoOrKeys) {
      const preset = isTablaOrHandDrum ? 'tabla' : isHeavyDrum ? 'dhol' : 'acoustic_grand_piano';
      soundFontEngine.triggerSampleVoice(
        this.ctx,
        preset,
        note,
        vel,
        this.panner || this.masterOutput,
        now,
        { sustainSec: 0.4 + this.decay * 1.1 }
      );
      return;
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);

    const filter = this.ctx.createBiquadFilter();
    const oscs: OscillatorNode[] = [];

    if (this.category === 'percussion') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.min(14000, freq * 2.2), now);
      filter.Q.setValueAtTime(3.5 + this.brilliance * 5.0, now);

      const dur = 0.25 + this.decay * 1.1;
      gain.gain.linearRampToValueAtTime(vel * 0.92, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      osc1.stop(now + dur + 0.05);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2.75, now);
      const metalGain = this.ctx.createGain();
      metalGain.gain.value = 0.4;
      osc2.connect(metalGain);
      metalGain.connect(filter);
      osc2.start(now);
      osc2.stop(now + dur + 0.05);
      oscs.push(osc2);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(18000, freq * (3.5 + this.brilliance * 5.0)), now);
      filter.Q.setValueAtTime(2.8, now);

      gain.gain.linearRampToValueAtTime(vel * 0.88, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      const osc1 = this.ctx.createOscillator();
      osc1.type = lowerName.includes('theremin') ? 'sine' : 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(filter);
      osc1.start(now);
      osc1.stop(now + 1.9);
      oscs.push(osc1);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 1.004, now);
      const chorusGain = this.ctx.createGain();
      chorusGain.gain.value = 0.35;
      osc2.connect(chorusGain);
      chorusGain.connect(filter);
      osc2.start(now);
      osc2.stop(now + 1.9);
      oscs.push(osc2);
    }

    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);

    this.activeVoices.set(note, { oscs, gain, filter });
  }

  public noteOff(note: number, time?: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    const relTime = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(relTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.25), relTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.14);
      voice.oscs.forEach((o) => {
        try {
          o.stop(relTime + 0.16);
        } catch (e) {}
      });
    } catch (e) {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'brilliance' && !isNaN(num)) this.brilliance = Math.max(0.1, Math.min(1.0, num));
    if (param === 'decay' && !isNaN(num)) this.decay = Math.max(0.1, Math.min(2.0, num));
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
