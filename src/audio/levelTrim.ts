/**
 * Output level calibration for instruments, so every instrument plays a chord at roughly the same
 * level instead of some clipping the master and others being barely audible. Trims come from
 * measuring each type with a 3-note chord at velocity 0.85 (≈ −3 dBFS); HEADROOM then leaves
 * 6 dB so a full arrangement sums below 0 dBFS instead of riding the master limiter.
 */
import type { BaseDevice } from './BaseDevice.ts';

const TYPE_TRIM: Partial<Record<string, number>> = {
  subtractor: 0.33, thor: 0.26, tanpura: 0.35, monotone: 0.37, europa: 0.47, dhol: 0.52, tabla: 0.55, three_osc: 0.59, flex: 0.65,
  world_instrument: 0.5, percussion_electronic: 0.55, nnxt: 0.75, nn19: 0.73, layers_id8: 0.76,
  bansuri: 2.2, harmonium: 1.7, mimic: 1.5, grain: 2.0, matrixbrute: 1.8, make_noise_shared: 1.8, moog_grandmother: 1.6, dr_octo_rex: 1.4, polytone: 1.3,
};

const HEADROOM = 0.5;

const trims = new WeakMap<BaseDevice, GainNode[]>();

/**
 * Wraps out_l / out_r in trim gains (before any cable is patched). Returns the trim (linear).
 * `value` (offline copies) is the live unit's trim, headroom included.
 */
export function installLevelTrim(dev: BaseDevice, value?: number): number {
  const v = value ?? (TYPE_TRIM[dev.type] ?? 1) * HEADROOM;
  const outs = ['out_l', 'out_r'].map((p) => dev.audioOutputs.get(p));
  if (outs.some((o) => !o)) return 1;
  const gains = outs.map((o, i) => {
    const g = dev.ctx.createGain();
    g.gain.value = v;
    o!.connect(g);
    dev.audioOutputs.set(i === 0 ? 'out_l' : 'out_r', g);
    return g;
  });
  trims.set(dev, gains);
  return v;
}

export function levelTrimOf(dev: BaseDevice): number | undefined {
  return trims.get(dev)?.[0].gain.value;
}
