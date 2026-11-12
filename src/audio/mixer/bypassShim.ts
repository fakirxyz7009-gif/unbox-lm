/**
 * Generic bypass / power switch for built-in effect devices that don't implement one themselves.
 * Installed before any cable is patched: the device's out_l / out_r are wrapped so that
 *   bypassed → input passes straight through (dry), powered off → silence.
 * Spec devices and library units have their own switching and never get a shim.
 */
import type { BaseDevice } from '../BaseDevice.ts';

export function installBypassShim(dev: BaseDevice): boolean {
  const inL = dev.audioInputs.get('in_l');
  const inR = dev.audioInputs.get('in_r');
  const outL = dev.audioOutputs.get('out_l');
  const outR = dev.audioOutputs.get('out_r');
  if (!inL || !inR || !outL || !outR) return false;
  const ctx = dev.ctx;
  const make = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const wetL = make(1);
  const wetR = make(1);
  const dryL = make(0);
  const dryR = make(0);
  const shimL = make(1);
  const shimR = make(1);
  outL.connect(wetL).connect(shimL);
  outR.connect(wetR).connect(shimR);
  inL.connect(dryL).connect(shimL);
  inR.connect(dryR).connect(shimR);
  dev.audioOutputs.set('out_l', shimL);
  dev.audioOutputs.set('out_r', shimR);

  let powered = dev.isPowered;
  let bypassed = dev.isBypassed;
  const sync = () => {
    const t = ctx.currentTime;
    const wet = powered && !bypassed ? 1 : 0;
    const dry = powered && bypassed ? 1 : 0;
    [wetL, wetR].forEach((g) => g.gain.setTargetAtTime(wet, t, 0.01));
    [dryL, dryR].forEach((g) => g.gain.setTargetAtTime(dry, t, 0.01));
  };
  Object.defineProperty(dev, 'isPowered', {
    configurable: true,
    get: () => powered,
    set: (v: boolean) => {
      powered = !!v;
      sync();
    },
  });
  Object.defineProperty(dev, 'isBypassed', {
    configurable: true,
    get: () => bypassed,
    set: (v: boolean) => {
      bypassed = !!v;
      sync();
    },
  });
  sync();
  return true;
}
