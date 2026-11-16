/**
 * Announces an environment-gated test that did not run. A green suite must never read as "this was
 * checked", so a skip prints a banner and a diagnostic naming the missing coverage, not just a count.
 * Call it (and return) instead of a bare `t.skip()`.
 *
 * With UNBOX_REQUIRE_FULL_COVERAGE set the gaps are reported once, as a single failure, by
 * `tests/coverage.test.ts` (which lists every missing tool up front); the individual checks still skip
 * so the rest of the suite runs and the one failure carries the whole picture.
 */
import type { TestContext } from 'node:test';
import { STRICT_COVERAGE_ENV, strictCoverage } from './strict.ts';

export function announceSkip(t: TestContext, subject: string, reason: string): void {
  const strict = strictCoverage();
  console.error(
    `\n!! SKIPPED — not tested in this run: ${subject}\n!! reason: ${reason}` +
      `${strict ? `\n!! ${STRICT_COVERAGE_ENV} is set: the coverage check lists every missing tool\n` : '\n'}`,
  );
  t.diagnostic(`skipped coverage: ${subject} — ${reason}`);
  t.skip(reason);
}
