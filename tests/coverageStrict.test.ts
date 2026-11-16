/**
 * Proves the strict-coverage switch itself: the failure message names every gap, and the gate really
 * exits non-zero (and only then) when a tool is missing. The exit-code check runs a tiny fixture with a
 * synthetic gap rather than the real coverage suite, so it costs a second instead of half a minute.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { coverageFailure } from './helpers/coverageGate.ts';
import { announceSkip } from './helpers/skip.ts';
import { STRICT_COVERAGE_ENV } from './helpers/strict.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const fixture = 'tests/fixtures/coverage-gate.ts';
const gaps = [
  { subject: 'the fake browser probe', reason: 'no fake Chrome today' },
  { subject: 'a fake local model', reason: 'no fake Ollama today' },
];

test('a strict run fails with one message that names every missing tool', () => {
  assert.equal(coverageFailure([], true), null, 'complete coverage must not fail');
  assert.equal(coverageFailure(gaps, false), null, 'without the flag a gap only skips');
  const failure = coverageFailure(gaps, true);
  assert.ok(failure, 'strict mode must fail when a tool is missing');
  assert.match(failure, /^2 environment-gated check\(s\) cannot run/);
  assert.ok(failure.includes(STRICT_COVERAGE_ENV), 'the message must name the flag');
  for (const gap of gaps) assert.ok(failure.includes(gap.subject), `the message must name ${gap.subject}`);
  assert.equal(failure.split('; ').length, gaps.length, 'one clause per gap');
});

test('the gate exits non-zero only for a strict run with a missing tool', { timeout: 120_000 }, (t) => {
  if (!existsSync(tsxCli)) {
    announceSkip(t, 'the strict coverage exit code', 'tsx is not installed in node_modules');
    return;
  }
  const run = (strict: boolean) => {
    const env = { ...process.env };
    // Inherited from this test file's own runner, NODE_TEST_CONTEXT makes the child skip running files
    // ("node:test run() is being called recursively") and exit 0 without testing anything.
    delete env.NODE_TEST_CONTEXT;
    if (strict) env[STRICT_COVERAGE_ENV] = '1';
    else delete env[STRICT_COVERAGE_ENV];
    const result = spawnSync(process.execPath, [tsxCli, '--test', fixture], {
      cwd: root,
      encoding: 'utf8',
      env,
      timeout: 110_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
  };

  const strict = run(true);
  assert.equal(strict.status, 1, `a strict run with a missing tool must exit 1\n${strict.output}`);
  assert.match(strict.output, /1 environment-gated check\(s\) cannot run/, `the strict failure must count the gap\n${strict.output}`);
  assert.match(strict.output, /the fake browser probe/, `the strict failure must name the missing tool\n${strict.output}`);

  const normal = run(false);
  assert.equal(normal.status, 0, `without the flag the same run must pass\n${normal.output}`);
});
