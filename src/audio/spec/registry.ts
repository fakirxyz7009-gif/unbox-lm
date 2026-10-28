/**
 * Spec device factory: DeviceType → SpecDevice with the right DSP engine.
 */
import { SPEC_BY_TYPE, type DeviceSpec, type EngineId } from '../../../shared/rack/devices/index.ts';
import { SpecDevice, type EngineFactory } from './SpecDevice.ts';
import { polyEngine } from './engines/poly.ts';
import { wavetableEngine } from './engines/wavetable.ts';
import { fmEngine } from './engines/fm.ts';
import { westcoastEngine } from './engines/westcoast.ts';
import { modalEngine } from './engines/modal.ts';
import { bowedEngine, formantEngine } from './engines/sustained.ts';
import { granularEngine, loopsEngine, samplerEngine } from './engines/sampler.ts';
import { drumsEngine } from './engines/drums.ts';
import { multisampleEngine } from './engines/multisample.ts';
import { grooveEngine } from './engines/groove.ts';
import { dynamicsEngine } from './engines/dynamics.ts';
import { eqEngine } from './engines/eq.ts';
import { distortionEngine } from './engines/distortion.ts';
import { modulationEngine } from './engines/modulation.ts';
import { delayEngine, reverbEngine, timedEngine } from './engines/timefx.ts';
import { filterEngine } from './engines/filters.ts';
import { pitchEngine, vocoderEngine } from './engines/vocal.ts';
import { pitchCorrectionEngine } from './engines/pitchCorrector.ts';
import { diEngine, mixerEngine, patchbayEngine, stereoEngine } from './engines/routing.ts';
import { playerEngine } from './engines/players.ts';

const ENGINES: Record<EngineId, EngineFactory> = {
  poly: polyEngine,
  wavetable: wavetableEngine,
  fm: fmEngine,
  westcoast: westcoastEngine,
  modal: modalEngine,
  formant: formantEngine,
  bowed: bowedEngine,
  sampler: samplerEngine,
  multisample: multisampleEngine,
  granular: granularEngine,
  loops: loopsEngine,
  drums: drumsEngine,
  groove: grooveEngine,
  dynamics: dynamicsEngine,
  eq: eqEngine,
  distortion: distortionEngine,
  modulation: modulationEngine,
  delay: delayEngine,
  reverb: reverbEngine,
  filter: filterEngine,
  vocoder: vocoderEngine,
  pitch: pitchEngine,
  pitchCorrect: pitchCorrectionEngine,
  timed: timedEngine,
  stereo: stereoEngine,
  mixer: mixerEngine,
  di: diEngine,
  patchbay: patchbayEngine,
  player: playerEngine,
};

export function specFor(type: string): DeviceSpec | undefined {
  return SPEC_BY_TYPE.get(type);
}

/** Builds a spec device, or returns null when `type` isn't spec-driven. */
export function createSpecDevice(ctx: BaseAudioContext, type: string, id: string, name?: string): SpecDevice | null {
  const spec = SPEC_BY_TYPE.get(type);
  if (!spec) return null;
  return new SpecDevice(ctx as AudioContext, id, name || spec.name, spec, ENGINES[spec.engine]);
}
