/**
 * Ladder filter ('filter', model 'ladder'): a four-pole low-pass in an AudioWorklet (see
 * src/audio/spec/ladderWorklet.ts). Resonance feeds the output back to the input, so at the top of
 * its range the filter self-oscillates. Until the worklet loads (or where it cannot load), the
 * signal passes through unchanged.
 */
import type { SpecEngine, SpecHost } from '../SpecDevice.ts';
import { setSmooth } from '../dsp.ts';
import { ensureLadderWorklet } from '../ladderWorklet.ts';

export function ladderFilter(host: SpecHost): SpecEngine {
  const ctx = host.ctx;
  const input = host.ins[0];
  const out = host.outs[0];
  let node: AudioWorkletNode | null = null;
  input.connect(out);

  const sync = () => {
    if (!node) return;
    const cutoff = node.parameters.get('cutoff');
    const resonance = node.parameters.get('resonance');
    const drive = node.parameters.get('drive');
    if (cutoff) setSmooth(cutoff, host.p('freq', 1200), ctx, 0.02);
    if (resonance) setSmooth(resonance, host.p('res', 0.3), ctx, 0.02);
    if (drive) setSmooth(drive, host.p('drive', 0.2), ctx, 0.02);
  };

  const ready = ensureLadderWorklet(ctx).then((ok) => {
    if (!ok) return;
    node = new AudioWorkletNode(ctx, 'unbox-ladder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    input.disconnect(out);
    input.connect(node);
    node.connect(out);
    sync();
  });

  return {
    ready: () => ready,
    onParam: (k) => {
      if (k !== 'mix' && k !== 'output') sync();
    },
    dispose() {
      node?.disconnect();
      node = null;
    },
  };
}
