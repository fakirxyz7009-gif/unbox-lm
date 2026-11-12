/**
 * Removes background noise from a clip with RNNoise: BSD-3-Clause, shipped through the MIT package
 * @sapphi-red/web-noise-suppressor. The clip plays through the RNNoise worklet in an OfflineAudioContext, so the audio
 * thread does the work and the page stays responsive. RNNoise is built for speech and room noise at 48 kHz. On music
 * it can thin out quiet detail, so the result needs a listen.
 */
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { dropLead } from '../../../shared/audio/trim.ts';

const RATE = 48000;
/** Where the render pauses (seconds into the clip), and how long it stays paused for the worklet to start (ms). */
const SETUP_PAUSE_TIME = 0.001;
const SETUP_PAUSE_MS = 300;
/**
 * RNNoise's processing delay in samples at 48 kHz (992, about 21 ms). Measured by correlating the output of a
 * 300 Hz to 3 kHz chirp with the chirp itself: the peak sits at this lag across the whole clip.
 */
export const RNNOISE_LEAD = 992;

/** The clip with its noise removed, at 48 kHz. `lead` is RNNoise's delay; pass 0 to see the raw, delayed output. */
export async function denoiseBuffer(input: AudioBuffer, lead = RNNOISE_LEAD): Promise<AudioBuffer> {
  const channels = input.numberOfChannels;
  const length = Math.round(input.duration * RATE);
  const ctx = new OfflineAudioContext(channels, length + lead, RATE);
  await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
  const wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdUrl });
  // The node is typed for an AudioContext. It only uses the worklet API, which an offline context has too.
  const node = new RnnoiseWorkletNode(ctx as unknown as AudioContext, { maxChannels: channels, wasmBinary });
  const source = ctx.createBufferSource();
  source.buffer = input;
  source.connect(node).connect(ctx.destination);
  source.start();
  // The worklet compiles its WASM asynchronously, and a render never yields to it. Pause the render at its start so
  // the worklet can finish, then resume; without the pause the first part of the clip comes out silent.
  void ctx.suspend(SETUP_PAUSE_TIME).then(() => new Promise((done) => setTimeout(done, SETUP_PAUSE_MS))).then(() => ctx.resume());
  const rendered = await ctx.startRendering();
  node.destroy();
  const data = Array.from({ length: channels }, (_, ch) => rendered.getChannelData(ch));
  const cleaned = dropLead(data, lead, length);
  const out = new AudioBuffer({ numberOfChannels: channels, length, sampleRate: RATE });
  cleaned.forEach((samples, ch) => out.copyToChannel(samples, ch));
  return out;
}
