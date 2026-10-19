import { BaseDevice } from '../BaseDevice.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

export class UniversalWorldInstrumentDevice extends BaseDevice {
  public instrumentName: string;
  public family: 'string' | 'wind';
  public resonance: number = 0.8;
  public toneColor: number = 0.55;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;
  private activeVoices: Map<number, { stop: (rel?: number) => void }> = new Map();
  private lastMidiNote: number = 60;

  constructor(ctx: AudioContext, id: string, name: string = 'Acoustic Instrument', family: 'string' | 'wind' = 'string') {
    super(ctx, id, name, 'world_instrument', 2);
    this.instrumentName = name;
    this.family = family;

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 14000;
    this.filterNode.Q.value = 1.6;

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.92;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.filterNode.connect(this.panner);
      this.panner.connect(this.masterOutput);
    } else {
      this.filterNode.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.92,
      pan: 0,
      resonance: 0.8,
      toneColor: 0.55,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Pitch/Timbre CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];
  }

  public noteOn(note: number, velocity: number = 0.85, time?: number): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    this.noteOff(note, now);

    const vel = Math.max(0.15, Math.min(1.2, velocity));
    const lowerName = this.instrumentName.toLowerCase();

    let presetId = 'sitar';
    if (
      lowerName.includes('guitar') ||
      lowerName.includes('banjo') ||
      lowerName.includes('mandolin') ||
      lowerName.includes('ukulele') ||
      lowerName.includes('harp')
    ) {
      presetId = 'acoustic_guitar';
    } else if (lowerName.includes('piano') || lowerName.includes('santoor') || lowerName.includes('dulcimer')) {
      presetId = 'acoustic_grand_piano';
    } else if (this.family === 'wind' || lowerName.includes('flute') || lowerName.includes('shehnai')) {
      presetId = 'bansuri';
    } else if (lowerName.includes('harmonium') || lowerName.includes('accordion')) {
      presetId = 'harmonium';
    }

    const cutHz = Math.min(18000, 2200 + this.toneColor * 14000);
    this.filterNode.frequency.setTargetAtTime(cutHz, now, 0.015);
    this.filterNode.Q.setTargetAtTime(0.8 + this.resonance * 3.2, now, 0.015);

    const voice = soundFontEngine.triggerSampleVoice(
      this.ctx,
      presetId,
      note,
      vel,
      this.filterNode,
      now,
      {
        glideFromMidi: this.lastMidiNote,
        glideDurationSec: presetId === 'sitar' || presetId === 'bansuri' ? 0.065 : 0.018,
        sustainSec: 2.2,
      }
    );

    this.lastMidiNote = note;
    if (voice) {
      this.activeVoices.set(note, voice);
    }
  }

  public noteOff(note: number, time?: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    voice.stop(time);
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'resonance' && !isNaN(num)) this.resonance = Math.max(0.1, Math.min(1.0, num));
    if (param === 'toneColor' && !isNaN(num)) this.toneColor = Math.max(0.1, Math.min(1.0, num));
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }
}
