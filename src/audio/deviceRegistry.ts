import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';

// Types whose implementations are legacy BaseDevice classes rather than DeviceSpecs.
export const LEGACY_DEVICE_TYPES: ReadonlySet<string> = new Set([
  'subtractor', 'thor', 'third_wave', 'europa', 'monotone', 'redrum', 'mimic', 'matrix', 'pulsar',
  'scream4', 'echo', 'rv7000', 'mclass_master', 'spider_audio', 'spider_cv', 'three_osc', 'sytrus',
  'flex', 'bansuri', 'harmonium', 'tabla', 'tanpura', 'dhol', 'tumbi', 'world_instrument',
  'percussion_electronic', 'wyvern', 'ember', 'objekt', 'reason_performance', 'rv9', 'osmium',
  'rotor', 'combinator', 'midi_out', 'automation_clip', 'mix_bus', 'audio_track',
]);

/** Whether the current app has a factory for a saved non-VST device type. */
export function supportsDeviceType(type: string): boolean {
  return SPEC_BY_TYPE.has(type) || LEGACY_DEVICE_TYPES.has(type);
}
