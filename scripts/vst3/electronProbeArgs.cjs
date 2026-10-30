'use strict';

/**
 * Electron 45 on the Windows desktop host treats a separated `--user-data-dir`
 * value as a positional app path for these fixture invocations. Keep the Chromium
 * switch in its documented `--key=value` form, with the probe CJS entry last.
 */
function makeElectronProbeArgs(userData, probeEntry) {
  return [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${userData}`,
    probeEntry,
  ];
}

module.exports = { makeElectronProbeArgs };
