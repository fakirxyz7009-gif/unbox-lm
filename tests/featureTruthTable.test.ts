import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('feature truth table does not promote simulated MIDI to physical-controller acceptance', async () => {
  const table = await readFile(resolve(process.cwd(), 'docs/UNBOX_FEATURE_TRUTH_TABLE.md'), 'utf8');

  assert.match(table, /Physical hardware acceptance is intentionally not claimed/);
  assert.match(table, /visible named\/identified input port, a captured press and release/i);
  assert.doesNotMatch(table, /User-approved headed Chrome runs verified both physical paths/);
  assert.doesNotMatch(table, /Earlier successful user-approved physical runs remain valid/);
});
