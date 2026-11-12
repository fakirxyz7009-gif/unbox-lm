/**
 * Per-part workstation settings saved with the project: which device parameter each of the six
 * quick-control knobs drives. Unassigned knobs fall back to sensible defaults per device.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { deviceParams, type DeviceParam } from '../audio/deviceParams.ts';

export const QUICK_COUNT = 6;
const quick = new Map<string, (string | null)[]>();

/** Musically useful first: brightness, body, envelope, then character. */
const PREFERRED = ['cutoff', 'tone', 'resonance', 'attack', 'release', 'decay', 'punch', 'drive', 'envAmount', 'morph', 'mix', 'reverb', 'sustain', 'detune', 'glide', 'volume'];

function defaults(dev: BaseDevice, params: DeviceParam[]): string[] {
  const numeric = params.filter((p) => !p.options && !/^p\d+/.test(p.key));
  const out: string[] = [];
  const macro = dev instanceof SpecDevice ? dev.spec.macro?.param : undefined;
  if (macro && numeric.some((p) => p.key === macro)) out.push(macro);
  for (const k of PREFERRED) if (out.length < QUICK_COUNT && !out.includes(k) && numeric.some((p) => p.key === k)) out.push(k);
  for (const p of numeric) if (out.length < QUICK_COUNT && !out.includes(p.key)) out.push(p.key);
  return out;
}

/** The parameters the six knobs control for this device (null = nothing to control). */
export function quickControls(dev: BaseDevice): (DeviceParam | null)[] {
  const params = deviceParams(dev);
  const byKey = new Map(params.map((p) => [p.key, p]));
  const def = defaults(dev, params);
  const set = quick.get(dev.id) ?? [];
  return Array.from({ length: QUICK_COUNT }, (_, i) => byKey.get(set[i] ?? def[i] ?? '') ?? null);
}

export function assignQuick(deviceId: string, slot: number, key: string | null): void {
  const set = [...(quick.get(deviceId) ?? Array(QUICK_COUNT).fill(null))];
  set[slot] = key;
  quick.set(deviceId, set);
  audioEngine.changed();
}

/** Patch swap: assignments don't carry over (different parameters). */
export function forgetPart(deviceId: string): void {
  quick.delete(deviceId);
}

audioEngine.registerProjectSection('workstation', {
  save: () => ({ quick: Object.fromEntries(quick) }),
  load: (data, idMap) => {
    quick.clear();
    const q = (data as { quick?: Record<string, unknown> } | undefined)?.quick;
    if (!q || typeof q !== 'object') return;
    for (const [id, keys] of Object.entries(q)) {
      if (Array.isArray(keys)) quick.set(idMap.get(id) ?? id, keys.map((k) => (typeof k === 'string' ? k : null)));
    }
  },
});
