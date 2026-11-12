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
    /** Absolute AudioContext frame at which capture ends, if it was clock-scheduled. */
    private stopFrame: number | null = null;
    private chans = 2;
    private size = 4096;
    private buf: Float32Array[] = [];
    private fill = 0;
    private startFrame = 0;
    private announcedStart = false;
    constructor() {
      super();
      this.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { cmd: string; channels?: number; frame?: number };
        if (d.cmd === 'start') {
          this.chans = Math.max(1, Math.min(2, d.channels ?? 2));
          this.buf = Array.from({ length: this.chans }, () => new Float32Array(this.size));
          this.fill = 0;
          this.stopFrame = null;
          this.on = true;
          this.announcedStart = false;
        } else if (d.cmd === 'stop') {
          this.finish();
        } else if (d.cmd === 'stop-at') {
          // The message is ordered behind `start`. The processor, rather than the UI
          // thread, cuts the final render quantum so punch-out has an exact frame edge.
          this.stopFrame = Math.max(currentFrame, Math.floor(d.frame ?? currentFrame));
        }
      };
    }
    private finish(): void {
      if (!this.on) return;
      this.flush();
      this.on = false;
      this.stopFrame = null;
      this.port.postMessage({ type: 'stopped' });
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
      // A command-port acknowledgement alone would only prove the worklet
      // received `start`; this acknowledgement is emitted from `process`, so
      // callers know an actual audio render quantum can be captured before
      // they schedule an exact stop frame.
      if (!this.announcedStart) {
        this.announcedStart = true;
        this.port.postMessage({ type: 'started', frame: currentFrame });
      }
      const input = inputs[0];
      const n = input && input[0] ? input[0].length : 128;
      const stop = this.stopFrame;
      const take = stop === null ? n : Math.max(0, Math.min(n, stop - currentFrame));
      if (take > 0) {
        // Start a new block if the context skipped frames. Concatenating across that gap
        // would assign the next samples the wrong timestamps in both the clip and its journal.
        if (this.fill && currentFrame !== this.startFrame + this.fill) this.flush();
        if (this.fill === 0) this.startFrame = currentFrame;
        for (let c = 0; c < this.chans; c++) {
          const src = input && (input[c] ?? input[0]);
          if (src) this.buf[c].set(src.subarray(0, take), this.fill);
          else this.buf[c].fill(0, this.fill, this.fill + take);
        }
        this.fill += take;
        if (this.fill + 128 > this.size) this.flush();
      }
      if (stop !== null && currentFrame + n >= stop) this.finish();
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

export interface WorkletCaptureOptions {
  /**
   * Observes completed worklet blocks on the main thread. Implementations must return promptly;
   * this is used to queue durable recording-journal writes, never to do I/O in the processor.
   */
  onChunk?: (chunk: CapturedAudio) => void;
}

/** One capture session on a source node; resolves with all samples when stopped. */
export class WorkletCapture {
  private node: AudioWorkletNode;
  private sink: GainNode;
  private chunks: { frame: number; channels: Float32Array[] }[] = [];
  private started: Promise<number> | null = null;
  private resolveStarted: ((frame: number) => void) | null = null;
  private stopped: Promise<void> | null = null;
  private resolveStopped: (() => void) | null = null;
  private finished = false;

  constructor(private ctx: AudioContext, private source: AudioNode, private channels = 2, private options: WorkletCaptureOptions = {}) {
    this.node = new AudioWorkletNode(ctx, 'unbox-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: channels, channelCountMode: 'explicit' });
    this.node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type: string; frame?: number; channels?: Float32Array[] };
      if (d.type === 'started') {
        this.resolveStarted?.(d.frame ?? 0);
        this.resolveStarted = null;
      }
      if (d.type === 'data' && d.channels) {
        const chunk = { frame: d.frame ?? 0, channels: d.channels };
        this.chunks.push(chunk);
        try { this.options.onChunk?.(chunk); } catch { /* a journal observer must never interrupt capture */ }
      }
      if (d.type === 'stopped') {
        this.finished = true;
        this.resolveStopped?.();
        this.resolveStopped = null;
      }
    };
    source.connect(this.node);
    // keep the processor running (pulls input) without making sound
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.node.connect(this.sink).connect(ctx.destination);
  }

  /** Resolves with the first rendered capture frame, acknowledged by the audio worklet. */
  start(): Promise<number> {
    if (!this.started) {
      this.started = new Promise((resolve) => { this.resolveStarted = resolve; });
      this.node.port.postMessage({ cmd: 'start', channels: this.channels });
    }
    return this.started;
  }

  /**
   * End capture at an AudioContext time. The worklet performs the actual cut at the
   * corresponding render frame; this promise only reports that the cut has happened.
   */
  stopAt(time: number): Promise<void> {
    const frame = Math.max(0, Math.round(time * this.ctx.sampleRate));
    this.node.port.postMessage({ cmd: 'stop-at', frame });
    return this.whenStopped();
  }

  private whenStopped(): Promise<void> {
    if (this.finished) return Promise.resolve();
    if (!this.stopped) this.stopped = new Promise((resolve) => { this.resolveStopped = resolve; });
    return this.stopped;
  }

  /** Stops and returns the samples captured (gaps between chunks are filled with silence). */
  async stop(): Promise<CapturedAudio> {
    const stopped = this.whenStopped();
    if (!this.finished) this.node.port.postMessage({ cmd: 'stop' });
    await stopped;
    try { this.source.disconnect(this.node); } catch { /* the source was already disconnected */ }
    this.node.disconnect();
    this.node.port.close();
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
