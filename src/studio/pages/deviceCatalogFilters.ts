import type { DeviceType } from '../../audio/types.ts';
import type { InstrumentCategory } from '../../audio/instrumentCatalog.ts';
import { SPEC_BY_TYPE } from '../../../shared/rack/devices/index.ts';

const LEGACY_SAMPLERS = new Set<DeviceType>(['mimic', 'nnxt', 'nn19', 'dr_octo_rex', 'grain', 'flex']);
const SAMPLER_ENGINES = new Set(['sampler', 'multisample', 'granular', 'loops', 'groove']);

export function isSamplerDevice(type: DeviceType): boolean {
  const spec = SPEC_BY_TYPE.get(type);
  return LEGACY_SAMPLERS.has(type) || SAMPLER_ENGINES.has(spec?.engine ?? '') || spec?.family === 'studio';
}

export function isRecordedInstrument(type: DeviceType): boolean {
  return SPEC_BY_TYPE.get(type)?.family === 'studio';
}

export function filterRecordedInstrumentCategories(
  categories: readonly InstrumentCategory[],
  recordedOnly: boolean,
): InstrumentCategory[] {
  if (!recordedOnly) return [...categories];
  return categories
    .map((category) => ({ ...category, items: category.items.filter((item) => isRecordedInstrument(item.type)) }))
    .filter((category) => category.items.length > 0);
}
