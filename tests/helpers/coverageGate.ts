/** The pure half of the coverage gate: what (if anything) a strict run must fail with. */
import { STRICT_COVERAGE_ENV } from './strict.ts';

export type MissingCoverage = { subject: string; reason: string };

/**
 * The one failure message a strict run produces, or null when coverage is complete or not strict.
 * Kept free of the tool probes so tests and fixtures can exercise the decision without spawning Chrome,
 * importing the server routes or waiting on demucs.
 */
export function coverageFailure(missing: MissingCoverage[], strict: boolean): string | null {
  if (!missing.length || !strict) return null;
  return (
    `${missing.length} environment-gated check(s) cannot run (${STRICT_COVERAGE_ENV} is set): ` +
    missing.map((entry) => `${entry.subject} — ${entry.reason}`).join('; ')
  );
}
