import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { makeElectronProbeArgs } = require('../scripts/vst3/electronProbeArgs.cjs') as {
  makeElectronProbeArgs(userData: string, probeEntry: string): string[];
};

test('Electron fixture probes pass the user-data path as one Chromium switch and leave the entry last', () => {
  assert.deepEqual(makeElectronProbeArgs('C:\\probe profile', 'C:\\fixture\\main.cjs'), [
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=C:\\probe profile',
    'C:\\fixture\\main.cjs',
  ]);
});
