'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeElectronProbeArgs } = require('./electronProbeArgs.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronExe = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
const probeApp = path.join(__dirname, 'electron-startup-probe');
// Electron 45 on this Windows host exits successfully without opening a tiny
// package-directory probe, while it loads the exact same package's CJS entry.
// Use the entry explicitly so this checks app readiness rather than directory resolution.
const probeEntry = path.join(probeApp, 'main.cjs');
const probeDir = path.join(repoRoot, '.tmp', 'electron-startup-probe');
const userData = path.join(probeDir, 'userdata');
const marker = path.join(probeDir, 'startup.log');
fs.mkdirSync(userData, { recursive: true });
for (const file of [marker]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

let result;
// Chromium children can retain redirected file descriptors after the main process exits.
// Inherit the diagnostic console, matching the boundary probe, so spawnSync observes the
// Electron main-process exit instead of waiting on retained log handles.
result = spawnSync(electronExe, makeElectronProbeArgs(userData, probeEntry), {
  cwd: repoRoot,
  env: { ...process.env, UNBOX_ELECTRON_STARTUP_MARKER: marker },
  stdio: 'inherit',
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const stages = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim().split(/\r?\n/) : [];
if (result.error?.code === 'ETIMEDOUT') {
  throw new Error(`Electron app startup probe exceeded 30 seconds; observed stages: ${stages.join(', ') || '(none)'}`);
}
if (result.error || result.signal || result.status !== 0) {
  throw new Error(`Electron app startup probe failed (status=${result.status ?? 'null'}, signal=${result.signal ?? 'none'}); observed stages: ${stages.join(', ') || '(none)'}`);
}
if (stages.join(',') !== 'main-loaded,app-ready') {
  throw new Error(`Electron exited without completing app readiness; observed stages: ${stages.join(', ') || '(none)'}`);
}

console.log('PASS: Electron main entry loaded and app.whenReady() resolved.');
