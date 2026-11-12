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
  /** The faceplate control kind when this is a spec device. */
  control?: 'knob' | 'fader' | 'toggle' | 'select' | 'buttons';
  /** Explicit eligibility for a Rack macro's continuous interpolation. */
  macroMappable?: boolean;
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pretty = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const LOG_KEYS = /cutoff|freq|attack|decay|release|time|rate/i;

/**
 * Rack macros interpolate a 0..1 control value into a target range. Do not infer eligibility
 * from a numeric range: a mode selector can also be encoded as numbers. Parameter producers
 * must opt in, which makes missing/new metadata safe by default for macro authoring and imports.
 */
export function isMacroMappableDeviceParam(param: Pick<DeviceParam, 'macroMappable'>): boolean {
  return param.macroMappable === true;
}

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
      control: p.control,
      macroMappable: !p.options && p.control !== 'toggle' && p.control !== 'select' && p.control !== 'buttons',
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
    control: r.control ?? 'knob',
    macroMappable: r.macroMappable === true,
  }));
}
