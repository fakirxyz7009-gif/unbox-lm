/**
 * Audio input (microphone / interface) for recording and input monitoring. Opens the device with
 * echo cancellation, noise suppression and auto gain off (studio recording), applies input gain,
 * and routes the chosen channel(s) into armed audio tracks.
 */

export interface InputDeviceInfo {
  deviceId: string;
  label: string;
}

export class InputManager {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  /** Input gain (pre-routing). */
  readonly gain: GainNode;
  /** Mono-to-stereo helpers for single-channel recording. */
  private split: ChannelSplitterNode;
  private left: GainNode;
  private right: GainNode;
  private stereoOut: GainNode;
  readonly analyserL: AnalyserNode;
  readonly analyserR: AnalyserNode;
  deviceId = '';
  /** Reported input latency (seconds) of the open device, 0 when unknown. */
  inputLatency = 0;
  channelCount = 0;
  error: string | null = null;

  constructor(private ctx: AudioContext) {
    this.gain = ctx.createGain();
    this.split = ctx.createChannelSplitter(2);
    this.gain.connect(this.split);
    // left / right as dual-mono stereo signals
    const dual = (ch: number) => {
      const merge = ctx.createChannelMerger(2);
      const g = ctx.createGain();
      this.split.connect(merge, ch, 0);
      this.split.connect(merge, ch, 1);
      merge.connect(g);
      return g;
    };
    this.left = dual(0);
    this.right = dual(1);
    this.stereoOut = ctx.createGain();
    this.stereoOut.channelCount = 2;
    this.stereoOut.channelCountMode = 'explicit';
    this.gain.connect(this.stereoOut);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = 2048;
    this.analyserR.fftSize = 2048;
    this.split.connect(this.analyserL, 0);
    this.split.connect(this.analyserR, 1);
  }

  get isOpen(): boolean {
    return !!this.source;
  }

  static async listDevices(): Promise<{ inputs: InputDeviceInfo[]; outputs: InputDeviceInfo[] }> {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const all = await navigator.mediaDevices.enumerateDevices();
    const map = (k: MediaDeviceKind) =>
      all.filter((d) => d.kind === k).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${k === 'audioinput' ? 'Input' : 'Output'} ${i + 1}` }));
    return { inputs: map('audioinput'), outputs: map('audiooutput') };
  }

  /** Opens (or re-opens) an input device. Throws with a readable message on failure. */
  async open(deviceId = this.deviceId): Promise<void> {
    if (this.source && deviceId === this.deviceId) return;
    this.close();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio input.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          sampleRate: this.ctx.sampleRate,
        },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      this.error =
        name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser / system settings.' : name === 'NotFoundError' ? 'No audio input device was found.' : (e as Error).message;
      throw new Error(this.error);
    }
    const track = this.stream.getAudioTracks()[0];
    const settings = (track?.getSettings() ?? {}) as MediaTrackSettings & { latency?: number };
    this.inputLatency = typeof settings.latency === 'number' ? settings.latency : 0;
    this.channelCount = settings.channelCount ?? 1;
    this.deviceId = settings.deviceId ?? deviceId;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.gain);
    this.error = null;
  }

  close(): void {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Signal for a track input: 'stereo', or one channel as dual mono. */
  output(channel: 'stereo' | 'left' | 'right'): AudioNode {
    if (channel === 'left' || this.channelCount === 1) return this.left;
    if (channel === 'right') return this.right;
    return this.stereoOut;
  }

  setGainDb(db: number): void {
    this.gain.gain.setTargetAtTime(Math.pow(10, Math.max(-40, Math.min(24, db)) / 20), this.ctx.currentTime, 0.02);
  }

  levels(): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
    const read = (a: AnalyserNode) => {
      const b = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(b);
      let p = 0;
      let s = 0;
      for (let i = 0; i < b.length; i++) {
        const v = Math.abs(b[i]);
        if (v > p) p = v;
        s += b[i] * b[i];
      }
      return [p, Math.sqrt(s / b.length)];
    };
    const [peakL, rmsL] = read(this.analyserL);
    const [peakR, rmsR] = read(this.analyserR);
    return { peakL, peakR, rmsL, rmsR };
  }
}
