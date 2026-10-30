'use strict';

// Launches the real Electron main entry with an isolated profile. The window stays hidden,
// and the test owns (and terminates) only its own process tree. This is a source-desktop
// smoke, not a packaged-EXE or audio-device acceptance test.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electronExe = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
const probeDir = path.join(root, '.tmp', 'electron-desktop-smoke');
const userData = path.join(probeDir, 'userdata');
const urlFile = path.join(probeDir, 'app-url.txt');
const rendererFile = path.join(probeDir, 'renderer-status.json');
const entry = path.join(root, 'electron', 'main.cjs');

fs.mkdirSync(userData, { recursive: true });
if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile);
if (fs.existsSync(rendererFile)) fs.unlinkSync(rendererFile);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(urlFile)) {
      const value = fs.readFileSync(urlFile, 'utf8').trim();
      if (/^http:\/\/127\.0\.0\.1:\d+\/$/.test(value)) return value;
    }
    await wait(100);
  }
  throw new Error('Electron main did not load its real app URL within 15 seconds.');
}

async function waitForRendererStatus(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(rendererFile)) {
      try {
        const status = JSON.parse(fs.readFileSync(rendererFile, 'utf8'));
        if (status && typeof status === 'object') return status;
      } catch {
        // The main process writes this small file synchronously. Keep waiting if an
        // interrupted write was observed rather than reporting a misleading parse error.
      }
    }
    await wait(100);
  }
  throw new Error('Electron did not report the renderer mount state within 15 seconds.');
}

function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 5_000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('timeout', () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.once('error', reject);
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5_000).then(() => false),
  ]);
  if (exited !== false || !child.pid) return;
  // Last-resort cleanup applies only to the PID this smoke test created, including its
  // Chromium children. It never searches for or terminates another Electron instance.
  spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
}

async function main() {
  const output = [];
  const child = spawn(electronExe, [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${userData}`,
    entry,
  ], {
    cwd: root,
    env: {
      ...process.env,
      UNBOX_DESKTOP_SMOKE_URL_FILE: urlFile,
      UNBOX_DESKTOP_SMOKE_RENDERER_FILE: rendererFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  try {
    const url = await waitForUrl(15_000);
    const response = await get(url);
    if (response.status !== 200 || !/<!doctype html>/i.test(response.body)) {
      throw new Error(`Electron served an unexpected app response (${response.status}): ${response.body.slice(0, 160)}`);
    }
    const renderer = await waitForRendererStatus(15_000);
    if (renderer.error || renderer.readyState !== 'complete' || !renderer.hasRoot || renderer.rootChildren < 1 || !renderer.hasTitleBar) {
      throw new Error(`Electron renderer did not mount the Unbox shell: ${JSON.stringify(renderer)}`);
    }
    console.log(`PASS: real Electron main loaded ${url} in a hidden isolated window, served index.html, and mounted the Unbox renderer shell.`);
  } catch (error) {
    const detail = output.join('').trim();
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `\nElectron output:\n${detail}` : ''}`);
  } finally {
    await stop(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
