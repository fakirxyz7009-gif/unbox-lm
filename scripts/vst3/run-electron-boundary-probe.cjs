'use strict';

// The app's normal Electron sandbox must remain enabled in production. This local-only
// capability guard disables Chromium's sandbox because the current CI-like Windows desktop
// environment aborts sandboxed Electron before app JavaScript starts.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeElectronProbeArgs } = require('./electronProbeArgs.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronExe = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
const probeApp = path.join(__dirname, 'electron-probe');
// See the startup probe: Electron 45 on this host resolves this focused fixture
// only when its CJS entry is passed explicitly.
const probeEntry = path.join(probeApp, 'main.cjs');
const userData = path.join(repoRoot, '.tmp', 'vst3-electron-probe-userdata');
fs.mkdirSync(userData, { recursive: true });

const result = spawnSync(electronExe, makeElectronProbeArgs(userData, probeEntry), {
  cwd: repoRoot,
  // Electron's Chromium child processes can retain inherited stdio pipes after the main
  // process exits; inherit the probe console so spawnSync waits on process exit only.
  stdio: 'inherit',
  // Allow Electron startup plus the probe's own 20-second worker timeout to finish.
  timeout: 35_000,
  maxBuffer: 1024 * 1024,
});

if (result.error?.code === 'ETIMEDOUT') {
  console.error('FAIL: Electron did not exit within 35 seconds; the host startup or worker process did not terminate.');
  process.exitCode = 1;
} else if (result.error || result.signal || result.status !== 0) {
  console.error(`FAIL: Electron boundary probe exited with status ${result.status ?? result.signal ?? result.error?.message}`);
  process.exitCode = 1;
}
