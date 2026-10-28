/**
 * A device's adjustable parameters with ranges and current values, for generic editors (the
 * workstation LCD, quick controls, the AI preset crafter). Spec devices describe themselves;
 * legacy and library units use the ranges in shared/rack/builtinCatalog.ts.
 */
import type { BaseDevice } from './BaseDevice.ts';
import { SpecDevice } from './spec/SpecDevice.ts';
import { VstPluginDevice } from '../vst/VstPluginDevice.ts';
import { BUILTIN_BY_TYPE, VST_PARAM_RANGES } from '../../shared/rack/builtinCatalog.ts';

export interface DeviceParam {
  key: string;
  label: string;
  min: number;
  max: number;
  value: number;
  defaultValue: number;
  options?: string[];
  section?: string;
  curve?: 'lin' | 'log';
  unit?: string;
  step?: number;
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pretty = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const LOG_KEYS = /cutoff|freq|attack|decay|release|time|rate/i;

export function deviceParams(dev: BaseDevice): DeviceParam[] {
  if (dev instanceof SpecDevice) {
    return dev.spec.params.map((p) => ({
      key: p.key,
      label: p.label,
      min: p.min,
      max: p.max,
      value: num(dev.params[p.key], p.default),
      defaultValue: p.default,
      options: p.options ? [...p.options] : undefined,
      section: p.section,
      curve: p.curve,
      unit: p.unit,
      step: p.step,
    }));
  }
  const ranges = dev instanceof VstPluginDevice ? VST_PARAM_RANGES : BUILTIN_BY_TYPE.get(dev.type)?.params;
  if (!ranges) return [];
  return Object.entries(ranges).map(([key, r]) => ({
    key,
    label: pretty(key),
    min: r.min,
    max: r.max,
    value: num(dev.params[key], r.min),
    defaultValue: num(dev.params[key], r.min),
    curve: r.min > 0 && r.max / r.min >= 50 && LOG_KEYS.test(key) ? 'log' : 'lin',
  }));
}
