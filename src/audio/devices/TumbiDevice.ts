/** Tumbi pluck: prefers the recorded sample and uses a local Web Audio pluck when it is absent. */
import { BaseDevice } from '../BaseDevice.ts';
import { SHARE_BUILD } from '../../../shared/buildMode.ts';

let cachedTumbiBuffer: AudioBuffer | null = null;
let tumbiLoadPromise: Promise<AudioBuffer | null> | null = null;

async function loadTumbiSample(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (SHARE_BUILD) return null;
  if (cachedTumbiBuffer) return cachedTumbiBuffer;
  if (tumbiLoadPromise) return tumbiLoadPromise;

  tumbiLoadPromise = (async () => {
    const { loadPrivateTumbiBuffer } = await import('../privateAcousticPresets.ts');
    cachedTumbiBuffer = await loadPrivateTumbiBuffer(ctx);
    return cachedTumbiBuffer;
  })().catch(() => null);

  return tumbiLoadPromise;
}

export class TumbiDevice extends BaseDevice {
  public stringTension: number = 0.9;
  private masterOutput: GainNode;
  private panner: StereoPannerNode | null = null;
  private activeVoices: Map<number, { source: AudioScheduledSourceNode; gain: GainNode }> = new Map();

  constructor(ctx: AudioContext, id: string, name: string = 'Tumbi Folk Resonator') {
    super(ctx, id, name, 'tumbi', 1);

    this.masterOutput = ctx.createGain();
    this.masterOutput.gain.value = 0.95;
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.connect(this.masterOutput);
    }

    this.audioOutputs.set('out_l', this.masterOutput);
    this.audioOutputs.set('out_r', this.masterOutput);
    this.masterOutput.connect(this.analyser);

    this.params = {
      volume: 0.95,
      pan: 0,
      stringTension: 0.9,
    };

    this.ports = [
      { id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' },
      { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' },
      { id: 'cv_pitch', name: 'Tension CV In', type: 'cv_in' },
    ];

    void loadTumbiSample(ctx);
  }

  public noteOn(note: number, velocity: number = 0.88, time: number = this.ctx.currentTime): void {
    if (!this.isPowered || this.isBypassed) return;
    const now = Math.max(this.ctx.currentTime, time);
    this.noteOff(note, now);

    if (cachedTumbiBuffer) {
      this.playRealSample(cachedTumbiBuffer, note, velocity, now);
    } else {
      // Never defer a live note until fetch/decode finishes: that would shift it off the
      // sequencer clock and could play it after its note-off. Use a synthesized pluck meanwhile.
      this.playFallback(note, velocity, now);
    }
  }

  public override ready(): Promise<void> {
    return loadTumbiSample(this.ctx).then(() => undefined);
  }

  private playRealSample(buf: AudioBuffer, note: number, velocity: number, now: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    // Keycenter: 60 (Middle C)
    const semitones = note - 60;
    const rate = Math.max(0.2, Math.min(5.0, Math.pow(2, semitones / 12) * Math.max(0.5, this.stringTension)));
    source.playbackRate.setValueAtTime(rate, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(18000, 3200 + velocity * 14000), now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.15, velocity) * 1.05, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);

    source.onended = () => {
      try {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (e) {}
    };

    source.start(now);
    source.stop(now + 1.35);
    this.trackVoice(note, source, gain, filter);
  }

  private playFallback(note: number, velocity: number, now: number): void {
    const source = this.ctx.createOscillator();
    source.type = 'sawtooth';
    const frequency = 261.6256 * Math.pow(2, (note - 60) / 12) * this.stringTension;
    source.frequency.setValueAtTime(frequency, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(18000, 3200 + velocity * 14000), now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.15, velocity) * 0.7, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.panner || this.masterOutput);
    source.start(now);
    source.stop(now + 1.35);
    this.trackVoice(note, source, gain, filter);
  }

  private trackVoice(note: number, source: AudioScheduledSourceNode, gain: GainNode, filter: BiquadFilterNode): void {
    source.onended = () => {
      if (this.activeVoices.get(note)?.source === source) this.activeVoices.delete(note);
      try {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };
    this.activeVoices.set(note, { source, gain });
  }

  public noteOff(note: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    this.activeVoices.delete(note);
    const relTime = Math.max(this.ctx.currentTime, time);
    try {
      if (relTime <= this.ctx.currentTime + 0.005) {
        voice.gain.gain.cancelScheduledValues(relTime);
        voice.gain.gain.setValueAtTime(Math.max(0.001, voice.gain.gain.value || 0.25), relTime);
      }
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, relTime + 0.12);
      voice.source.stop(relTime + 0.14);
    } catch {}
  }

  public setParam(param: string, val: any): void {
    const num = Number(val);
    this.params[param] = val;
    if (param === 'stringTension' && !isNaN(num)) this.stringTension = Math.max(0.5, Math.min(1.5, num));
    if (param === 'volume' && !isNaN(num)) {
      this.masterOutput.gain.setTargetAtTime(Math.max(0, Math.min(1.5, num)), this.ctx.currentTime, 0.015);
    }
    if (param === 'pan' && !isNaN(num) && this.panner) {
      this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, num)), this.ctx.currentTime, 0.015);
    }
  }

  public override dispose(): void {
    for (const [, voice] of this.activeVoices.entries()) {
      try {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch (e) {}
    }
    this.activeVoices.clear();
    try {
      this.panner?.disconnect();
      this.masterOutput?.disconnect();
    } catch (e) {}
    super.dispose();
  }
}
