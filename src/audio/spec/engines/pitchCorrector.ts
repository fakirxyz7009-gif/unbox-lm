import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { ensurePitchCorrectionWorklet } from '../pitchCorrectionWorklet.ts';

/** Monophonic audio pitch correction; the original signal passes through if worklets are unavailable. */
export function pitchCorrectionEngine(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const input = host.ins[0];
  const output = host.outs[0];
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1;
  wet.gain.value = 0;
  // A direct dry edge keeps correction-off exact while the pitch-synchronous delay keeps running.
  input.connect(dry).connect(output);
  wet.connect(output);
  let node: AudioWorkletNode | null = null;
  let detectedNote = -1;
  let correctionCents = 0;
  let confidence = 0;

  const sync = () => {
    const enabled = host.p('correct', 0) >= 0.5 ? 1 : 0;
    const dryTarget = node ? 1 - enabled : 1;
    const wetTarget = node ? enabled : 0;
    dry.gain.setTargetAtTime(dryTarget, ctx.currentTime, 0.01);
    wet.gain.setTargetAtTime(wetTarget, ctx.currentTime, 0.01);
    if (!node) return;
    const values: Record<string, number> = {
      key: host.p('key', 0),
      scale: host.p('scale', 0),
      amount: host.p('amount', 1),
      retune: host.p('retune', 35),
      sensitivity: host.p('sensitivity', 0.5),
    };
    for (const [key, value] of Object.entries(values)) {
      const param = node.parameters.get(key);
      if (param && Number.isFinite(value)) param.setTargetAtTime(value, ctx.currentTime, 0.015);
    }
  };

  const ready = ensurePitchCorrectionWorklet(ctx).then((available) => {
    if (!available) return;
    node = new AudioWorkletNode(ctx, 'unbox-pitch-correction', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return;
      const status = event.data as Record<string, unknown>;
      if (typeof status.note === 'number' && Number.isFinite(status.note)) detectedNote = status.note;
      if (typeof status.cents === 'number' && Number.isFinite(status.cents)) correctionCents = status.cents;
      if (typeof status.confidence === 'number' && Number.isFinite(status.confidence)) confidence = status.confidence;
    };
    sync();
    input.connect(node);
    node.connect(wet);
  });

  return {
    onParam: sync,
    ready: () => ready,
    meter: () => ({ note: detectedNote, cents: correctionCents, confidence, worklet: node ? 1 : 0 }),
    dispose() {
      node?.disconnect();
      node?.port.close();
      dry.disconnect();
      wet.disconnect();
    },
  };
}
