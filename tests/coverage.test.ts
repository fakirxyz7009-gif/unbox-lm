/**
 * Reports every environment-gated check that cannot run on this machine in one place, so a run with
 * UNBOX_REQUIRE_FULL_COVERAGE set fails once with the whole list instead of once per affected test.
 * Without the variable it still prints the list: a green suite should not quietly mean "half-tested".
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { missingCoverage } from './helpers/coverage.ts';
import { coverageFailure } from './helpers/coverageGate.ts';
import { strictCoverage } from './helpers/strict.ts';

test('the environment-gated checks have their tools', { timeout: 60_000 }, async (t) => {
  const missing = await missingCoverage();
  if (!missing.length) {
    t.diagnostic('every environment-gated check can run here');
    return;
  }
  console.error(
    `\n!! MISSING COVERAGE — these environment-gated checks will skip in this run:` +
      `${missing.map((entry) => `\n!!   ${entry.subject}: ${entry.reason}`).join('')}\n`,
  );
  for (const entry of missing) t.diagnostic(`missing: ${entry.subject} — ${entry.reason}`);
  const failure = coverageFailure(missing, strictCoverage());
  if (failure) assert.fail(failure);
});
