import { BaseDevice } from '../BaseDevice.ts';
import { realMultiSampler } from '../realSampler/RealMultiSampler.ts';
import { soundFontEngine } from '../SoundFontEngine.ts';

export class UniversalWorldInstrumentDevice extends BaseDevice {
  public instrumentName: string;
  public family: 'string' | 'wind';
  public activeSubVoice?: string;
  public resonance: number = 0.8;
  public toneColor: number = 0.55;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private filterNode: BiquadFilterNode;
  private activeVoices: Map<number, { stop: (rel?: number) => void }> = new Map();
  private lastMidiNote: number = 60;

  constructor(
    ctx: AudioContext,
    id: string,
    name: string = 'Acoustic Instrument',
    family: 'string' | 'wind' = 'string',
    subVoiceId?: string
  ) {
    super(ctx, id, name, 'world_instrument', 2);
    this.instrumentName = name;
    this.family = family;
    this.activeSubVoice = subVoiceId;

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
      subVoice: subVoiceId || '',
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Pitch/Timbre CV In', type: 'cv_in' },
      { id: 'cv_gate', name: 'Gate CV In', type: 'cv_in' },
    ];
    soundFontEngine.warmUp(ctx, () => this.presetId());
    void realMultiSampler.loadDeviceSubVoice(this.id, this.instrumentName, this.activeSubVoice, this.ctx);
  }

  public setSubVoice(voiceId: string): void {
    this.activeSubVoice = voiceId;
    this.params['subVoice'] = voiceId;
    void realMultiSampler.loadDeviceSubVoice(this.id, this.instrumentName, voiceId, this.ctx);
  }

  private presetId(): string {
    const lowerName = this.instrumentName.toLowerCase();
    if (['guitar', 'banjo', 'mandolin', 'ukulele', 'harp'].some((w) => lowerName.includes(w))) return 'acoustic_guitar';
    if (['piano', 'santoor', 'dulcimer'].some((w) => lowerName.includes(w))) return 'acoustic_grand_piano';
    if (this.family === 'wind' || lowerName.includes('flute') || lowerName.includes('shehnai')) return 'bansuri';
    if (lowerName.includes('harmonium') || lowerName.includes('accordion')) return 'harmonium';
    return 'sitar';
  }

  public noteOn(note: number, velocity: number = 0.85, time?: number): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    this.noteOff(note, now);

    const vel = Math.max(0.15, Math.min(1.2, velocity));

    // 1. Prefer a provenance-admitted recorded cache when one is available.
    const playedReal = realMultiSampler.playNote(
      this.id,
      this.instrumentName,
      note,
      vel,
      now,
      this.filterNode,
      {
        gain: (this.params.volume as number) ?? 0.92,
        attack: 0.003,
        release: 0.4 + this.resonance * 0.8,
      }
    );
    if (playedReal) return;

    const presetId = this.presetId();

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
    realMultiSampler.stopNote(this.id, note, time);
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    voice.stop(time);
  }

  public override dispose(): void {
    super.dispose();
    realMultiSampler.releaseDevice(this.id);
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    if (param === 'subVoice' && typeof val === 'string') {
      this.setSubVoice(val);
      return;
    }
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
