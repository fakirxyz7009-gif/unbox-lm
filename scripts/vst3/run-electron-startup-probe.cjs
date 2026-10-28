'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronExe = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
const probeApp = path.join(__dirname, 'electron-startup-probe');
const probeDir = path.join(repoRoot, '.tmp', 'electron-startup-probe');
const userData = path.join(probeDir, 'userdata');
const marker = path.join(probeDir, 'startup.log');
const stdoutPath = path.join(probeDir, 'stdout.log');
const stderrPath = path.join(probeDir, 'stderr.log');
fs.mkdirSync(userData, { recursive: true });
for (const file of [marker, stdoutPath, stderrPath]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
const stdoutFd = fs.openSync(stdoutPath, 'w');
const stderrFd = fs.openSync(stderrPath, 'w');

let result;
try {
  result = spawnSync(electronExe, [
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir', userData,
    probeApp,
  ], {
    cwd: repoRoot,
    env: { ...process.env, UNBOX_ELECTRON_STARTUP_MARKER: marker },
    stdio: ['ignore', stdoutFd, stderrFd],
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
} finally {
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);
}

const stages = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim().split(/\r?\n/) : [];
const stdout = fs.readFileSync(stdoutPath, 'utf8').trim();
const stderr = fs.readFileSync(stderrPath, 'utf8').trim();
const output = [stdout && `stdout: ${stdout}`, stderr && `stderr: ${stderr}`]
  .filter(Boolean)
  .join('\n');
if (result.error?.code === 'ETIMEDOUT') {
  throw new Error(`Electron app startup probe exceeded 30 seconds; observed stages: ${stages.join(', ') || '(none)'}${output ? `\n${output}` : ''}`);
}
if (result.error || result.signal || result.status !== 0) {
  throw new Error(`Electron app startup probe failed (status=${result.status ?? 'null'}, signal=${result.signal ?? 'none'}); observed stages: ${stages.join(', ') || '(none)'}${output ? `\n${output}` : ''}`);
}
if (stages.join(',') !== 'main-loaded,app-ready') {
  throw new Error(`Electron exited without completing app readiness; observed stages: ${stages.join(', ') || '(none)'}${output ? `\n${output}` : ''}`);
}

console.log('PASS: Electron main entry loaded and app.whenReady() resolved.');
