import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordStartupFailure } from '../electron/startupDiagnostics.cjs';

test('Electron startup failures append a stage and message to the user-data log', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unbox-electron-startup-'));
  const timestamp = new Date('2026-10-27T12:00:00.000Z');
  try {
    const logPath = recordStartupFailure(root, 'application-startup', new Error('server did not start'), timestamp);
    assert.equal(logPath, join(root, 'logs', 'startup.log'));

    recordStartupFailure(root, 'renderer-process-gone', 'crashed', timestamp);
    const rows = (await readFile(logPath!, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
      timestamp: string;
      stage: string;
      error: string;
    });
    assert.deepEqual(rows, [
      { timestamp: timestamp.toISOString(), stage: 'application-startup', error: 'Error: server did not start' },
      { timestamp: timestamp.toISOString(), stage: 'renderer-process-gone', error: 'crashed' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
