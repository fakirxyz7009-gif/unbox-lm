/**
 * Instrument output calibration: how far each device is turned down before its output reaches a
 * cable, so a part does not vanish or slam the master depending on which instrument was loaded.
 *
 * The per-type numbers live in ./levelCalibrationTable.ts, which is GENERATED — regenerate them
 * with `npm run calibrate:levels` (scripts/calibrate-levels.mjs). That script renders every
 * playable built-in type offline in Chrome and rewrites the table.
 *
 * Method (identical for every type, so the numbers are comparable):
 *   - instantiate the type on an OfflineAudioContext at 48 kHz
 *   - gate a three-note chord (MIDI 60 / 64 / 67) at velocity 0.85
 *   - measure the peak of the rendered stereo output, averaged over three takes (several engines
 *     have detuned / randomised / noise components and do not render an identical peak twice)
 *   - trim = CALIBRATION_TARGET_PEAK / peak
 * Measuring the chord rather than its notes one at a time matters: summing single-note peaks
 * overestimates what a chord reaches, and the trims came out ~3.5 dB too conservative.
 * The target is what the previous hand-written table aimed at: a ≈ −3 dBFS chord with about 6 dB
 * left for everything that sums on the master. Measuring replaced guessing because the old table
 * had drifted from the DSP — `monotone` sat 13 dB below `subtractor` although its number was higher.
 *
 * Recorded packs are measured individually too — they differ by up to ~10 dB from each other (kits
 * sum three pads at once, and each pack has its own velocity curve and sample set), so a single
 * family value left them a few dB apart. The sweep gates notes the pack actually samples: pack key
 * maps are thinned and can have gaps exactly where a 60/64/67 chord would fall.
 *
 * The family trim below is only a FALLBACK, used by a pack that is missing from the table — which is
 * what a pack built after the table was written hits until `npm run calibrate:levels` runs again.
 * scripts/instruments/pack.ts normalises every pack's loudest hit to −1 dBFS, which is what makes a
 * family value a sane fallback rather than a wild guess.
 */
import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';
import { MEASURED_TYPE_TRIM } from './levelCalibrationTable.ts';

export { MEASURED_TYPE_TRIM };

/** Peak a three-note chord at velocity 0.85 should reach, in linear amplitude (−9 dBFS). */
export const CALIBRATION_TARGET_PEAK = 0.35;

/** Below this a type is treated as silent/unmeasurable rather than dividing by ~0. */
export const MIN_MEASURABLE_PEAK = 0.001;

/**
 * Upper bound on a trim. Quiet recordings legitimately need a boost well above 1 — the tuba pack
 * measures a 0.0725 peak and needs 4.83 — so the cap is only a guard against a near-silent
 * measurement turning into an absurd gain. It used to be 1.5, which silently flattened seven quiet
 * packs by 1.5-10 dB (the generator capped them at the same number).
 */
export const MAX_TYPE_TRIM = 10;

/** Linear gain for a measured peak (used by the generator and the tests). */
export function trimForPeak(peak: number): number {
  const safe = Math.max(MIN_MEASURABLE_PEAK, peak);
  return Math.max(0.01, Math.min(MAX_TYPE_TRIM, Number((CALIBRATION_TARGET_PEAK / safe).toFixed(4))));
}

/** Fallback for a melodic pack that is not in the table yet (samples normalised to −1 dBFS). */
export const RECORDED_MELODIC_TRIM = 0.3294;

/** Fallback for a kit that is not in the table yet: a chord gate fires three pads at once. */
export const RECORDED_KIT_TRIM = 0.1467;

/** Family fallback for an unmeasured recorded pack. */
export function recordedFamilyTrim(hasPads: boolean): number {
  return hasPads ? RECORDED_KIT_TRIM : RECORDED_MELODIC_TRIM;
}

/**
 * Types with no measurement (effects, utilities, a device added without re-running the generator).
 * 0.5 is the old `1 × HEADROOM` fallback, kept so non-instrument units do not change level.
 */
export const DEFAULT_TYPE_TRIM = 0.5;

const RECORDED_PREFIX = 'rec_';

/**
 * Trim for a device type. Measured instruments win; recorded packs get their family value (so new
 * packs are calibrated automatically); anything else keeps the previous default.
 */
export function levelTrimFor(type: string): number {
  const measured = MEASURED_TYPE_TRIM[type];
  if (measured !== undefined) return measured;
  if (type.startsWith(RECORDED_PREFIX)) {
    const pads = SPEC_BY_TYPE.get(type)?.pads?.length ?? 0;
    return recordedFamilyTrim(pads > 0);
  }
  return DEFAULT_TYPE_TRIM;
}
