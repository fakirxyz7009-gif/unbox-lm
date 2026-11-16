/**
 * Fixture for tests/coverageStrict.test.ts: the strict gate logic used by tests/coverage.test.ts, with
 * one synthetic missing tool so a child run can be checked by exit code in about a second. Deliberately
 * not named `*.test.ts`, so `npm test` never runs it as a suite of its own.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageFailure } from '../helpers/coverageGate.ts';
import { strictCoverage } from '../helpers/strict.ts';

test('fixture: one synthetic tool is missing', () => {
  const failure = coverageFailure([{ subject: 'the fake browser probe', reason: 'no fake Chrome today' }], strictCoverage());
  if (failure) assert.fail(failure);
});
