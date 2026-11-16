'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { prepareSevenZip } = require('./packaging-preflight.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
// npm scripts use this mode first so a bad/missing 7-Zip fails before the expensive build steps.
const preflightOnly = args.includes('--preflight-only');

try {
  prepareSevenZip({ strict: true });
} catch (error) {
  console.error(`Packaging preflight failed: ${error.message}`);
  process.exit(1);
}
if (preflightOnly) process.exit(0);

let electronBuilderCli;
try {
  electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js');
} catch (error) {
  console.error(`Unable to resolve electron-builder: ${error.message}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [electronBuilderCli, ...args], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(`Failed to start electron-builder: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`electron-builder terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
