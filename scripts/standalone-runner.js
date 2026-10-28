#!/usr/bin/env node
/**
 * UNBOX STUDIOS STANDALONE DESKTOP RUNNER (Zero Electron)
 * Launches the full DAW in a standalone, dedicated native hardware-accelerated
 * application window using the host PC's native GPU, Audio driver, and multi-core CPU.
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 3000;
const URL = `http://127.0.0.1:${PORT}`;

// Isolated user data directory for standalone session data, cache & hardware profile
let userDataDir = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  'UnboxStudiosStandalone'
);
try {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
} catch {
  userDataDir = path.join(os.tmpdir(), 'UnboxStudiosStandalone');
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
  } catch {}
}

// Locate native Chromium hardware host engine
function findNativeHostBrowser() {
  const candidates = [
    // Google Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),

    // Microsoft Edge
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),

    // Brave Browser
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Check PATH
  try {
    const whichChrome = execSync('where chrome.exe', { stdio: 'pipe' }).toString().trim().split('\r\n')[0];
    if (whichChrome && fs.existsSync(whichChrome)) return whichChrome;
  } catch {}

  try {
    const whichEdge = execSync('where msedge.exe', { stdio: 'pipe' }).toString().trim().split('\r\n')[0];
    if (whichEdge && fs.existsSync(whichEdge)) return whichEdge;
  } catch {}

  return null;
}

// Check if server is answering requests
function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let resolved = false;
    const check = () => {
      if (resolved) return;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolved = true;
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(5000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (resolved) return;
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server failed to start within ${timeoutMs}ms`));
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
}

async function main() {
  console.log('\n=============================================================');
  console.log('  UNBOX STUDIOS — STANDALONE HARDWARE WORKSTATION (NO ELECTRON)');
  console.log('=============================================================\n');

  // 1. Start Server Process
  console.log(`[1/3] Booting Unbox Audio & Project Server on port ${PORT}...`);
  const isWindows = process.platform === 'win32';
  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverBinary = fs.existsSync(tsxCli) ? process.execPath : (isWindows ? 'npx.cmd' : 'npx');
  const serverArgs = fs.existsSync(tsxCli) ? [tsxCli, 'server.ts'] : ['tsx', 'server.ts'];

  const serverProcess = spawn(serverBinary, serverArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: !fs.existsSync(tsxCli),
    env: { ...process.env, PORT: String(PORT) },
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to spawn server process:', err);
    process.exit(1);
  });

  // 2. Wait for server readiness
  console.log('[2/3] Waiting for audio engine & API endpoints to come online...');
  try {
    await waitForServer(URL);
    console.log(`✓ Audio & API server live at ${URL}`);
  } catch (err) {
    console.error('Timeout waiting for server:', err);
    serverProcess.kill();
    process.exit(1);
  }

  // 3. Launch Standalone Native Host Window with Maximum GPU / Audio Acceleration
  const browserBin = findNativeHostBrowser();
  if (!browserBin) {
    console.warn('No native Chromium browser found. Opening default desktop browser...');
    const startCmd = isWindows ? `start "" "${URL}"` : `open "${URL}"`;
    execSync(startCmd);
    return;
  }

  console.log(`[3/3] Launching Standalone Hardware Window via: ${path.basename(browserBin)}`);
  console.log('      DirectX/OpenGL Hardware Acceleration + Low-Latency Audio active.');

  const browserFlags = [
    // Dedicated Standalone App window (no URL bar, no tabs, no address bar, dedicated taskbar identity)
    `--app=${URL}`,
    '--window-size=1640,980',
    '--window-position=50,30',
    `--user-data-dir=${userDataDir}`,

    // Performance & Hardware Acceleration
    '--enable-features=AudioServiceOutOfProcess,CanvasOopRasterization,VaapiVideoDecoder,WebAssemblySimd',
    '--enable-gpu-rasterization',
    '--force-gpu-rasterization',
    '--enable-zero-copy',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-web-midi',
    '--enable-high-resolution-time',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  const appWindow = spawn(browserBin, browserFlags, {
    stdio: 'ignore',
    detached: false,
  });

  // When app window is closed by the user, terminate server cleanly
  appWindow.on('exit', (code) => {
    console.log('\nStandalone application closed. Shutting down audio engine server...');
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      process.exit(code || 0);
    }, 400);
  });

  // Handle Ctrl+C or kill signals
  process.on('SIGINT', () => {
    try {
      appWindow.kill();
    } catch {}
    try {
      serverProcess.kill();
    } catch {}
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Error starting standalone app:', e);
  process.exit(1);
});

