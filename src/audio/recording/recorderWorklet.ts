/**
 * 'unbox-recorder' AudioWorklet: capture only (outputs silence). While armed it posts blocks of
 * input samples to the main thread with the context frame of their first sample, so recordings
 * can be placed exactly on the song timeline. Loaded through a Blob URL like the dynamics worklet.
 */

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, ctor: unknown): void;
declare const currentFrame: number;

function recorderProcessorSource(): void {
  class Recorder extends AudioWorkletProcessor {
    private on = false;
    private chans = 2;
    private size = 4096;
    private buf: Float32Array[] = [];
    private fill = 0;
    private startFrame = 0;
    constructor() {
      super();
      this.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { cmd: string; channels?: number };
        if (d.cmd === 'start') {
          this.chans = Math.max(1, Math.min(2, d.channels ?? 2));
          this.buf = Array.from({ length: this.chans }, () => new Float32Array(this.size));
          this.fill = 0;
          this.on = true;
        } else if (d.cmd === 'stop') {
          this.flush();
          this.on = false;
          this.port.postMessage({ type: 'stopped' });
        }
      };
    }
    private flush(): void {
      if (!this.fill) return;
      const out = this.buf.map((b) => b.slice(0, this.fill));
      this.port.postMessage({ type: 'data', frame: this.startFrame, channels: out }, out.map((b) => b.buffer));
      this.buf = Array.from({ length: this.chans }, () => new Float32Array(this.size));
      this.fill = 0;
    }
    process(inputs: Float32Array[][]): boolean {
      if (!this.on) return true;
      const input = inputs[0];
      const n = input && input[0] ? input[0].length : 128;
      if (this.fill === 0) this.startFrame = currentFrame;
      for (let c = 0; c < this.chans; c++) {
        const src = input && (input[c] ?? input[0]);
        if (src) this.buf[c].set(src, this.fill);
        else this.buf[c].fill(0, this.fill, this.fill + n);
      }
      this.fill += n;
      if (this.fill + 128 > this.size) this.flush();
      return true;
    }
  }
  registerProcessor('unbox-recorder', Recorder);
}

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

export function ensureRecorderWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
    if (!worklet) p = Promise.resolve(false);
    else {
      const url = URL.createObjectURL(new Blob([`(${recorderProcessorSource.toString()})();`], { type: 'application/javascript' }));
      p = worklet
        .addModule(url)
        .then(() => true)
        .catch(() => false)
        .finally(() => URL.revokeObjectURL(url));
    }
    loaded.set(ctx, p);
  }
  return p;
}

export interface CapturedAudio {
  /** Context frame of the first captured sample. */
  frame: number;
  channels: Float32Array[];
}

/** One capture session on a source node; resolves with all samples when stopped. */
export class WorkletCapture {
  private node: AudioWorkletNode;
  private sink: GainNode;
  private chunks: { frame: number; channels: Float32Array[] }[] = [];
  private stopped: Promise<void> | null = null;

  constructor(ctx: AudioContext, source: AudioNode, private channels = 2) {
    this.node = new AudioWorkletNode(ctx, 'unbox-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: channels, channelCountMode: 'explicit' });
    this.node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: string; frame?: number; channels?: Float32Array[] };
      if (d.type === 'data' && d.channels) this.chunks.push({ frame: d.frame ?? 0, channels: d.channels });
    };
    source.connect(this.node);
    // keep the processor running (pulls input) without making sound
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.node.connect(this.sink).connect(ctx.destination);
  }

  start(): void {
    this.node.port.postMessage({ cmd: 'start', channels: this.channels });
  }

  /** Stops and returns the samples captured (gaps between chunks are filled with silence). */
  async stop(): Promise<CapturedAudio> {
    if (!this.stopped) {
      this.stopped = new Promise((resolve) => {
        const prev = this.node.port.onmessage;
        this.node.port.onmessage = (e: MessageEvent) => {
          prev?.call(this.node.port, e);
          if ((e.data as { type: string }).type === 'stopped') resolve();
        };
        this.node.port.postMessage({ cmd: 'stop' });
        setTimeout(resolve, 1500);
      });
    }
    await this.stopped;
    this.node.disconnect();
    try {
      this.sink.disconnect();
    } catch {}
    if (!this.chunks.length) return { frame: 0, channels: Array.from({ length: this.channels }, () => new Float32Array(0)) };
    const first = this.chunks[0].frame;
    const last = this.chunks[this.chunks.length - 1];
    const total = last.frame - first + last.channels[0].length;
    const out = Array.from({ length: this.channels }, () => new Float32Array(total));
    for (const ch of this.chunks) ch.channels.forEach((d, c) => out[c].set(d, ch.frame - first));
    return { frame: first, channels: out };
  }
}
