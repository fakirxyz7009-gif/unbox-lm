'use strict';

/**
 * Install a share installer into a temporary per-user directory, launch the installed app with
 * a disposable Electron profile, verify its share-only catalog and private route boundary, then
 * uninstall and remove the test artifacts.
 *
 * Usage: npm run test:share-installed -- [path-to-share-setup.exe]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { extractFile, listPackage } = require('@electron/asar');

const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32') throw new Error('Installed share acceptance currently requires Windows.');
const installer = path.resolve(root, process.argv[2] || path.join('release', 'Unbox-Studio-Share-Setup-1.0.0.exe'));
const scratch = path.join(root, '.tmp', 'share-install-acceptance');
const installRoot = path.join(scratch, 'app');
const installExe = path.join(installRoot, 'Unbox Studio.exe');
const profile = path.join(scratch, 'profile');
const urlFile = path.join(scratch, 'app-url.txt');
const rendererFile = path.join(scratch, 'renderer-status.json');
const privateIds = ['tumbi-folk', 'dholak-folk', 'chamkila-harmonium', 'chamkila-vocal'];
const clearedLicense = /^(CC0-1\.0|CC-BY-(1\.0|2\.0|2\.5|3\.0|4\.0))$/i;
const shortcutPaths = [
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Unbox Studio.lnk'),
  path.join(process.env.USERPROFILE || os.homedir(), 'Desktop', 'Unbox Studio.lnk'),
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForUrl(child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Installed app exited before serving the UI (exit ${child.exitCode}, signal ${child.signalCode}).\n${output.join('')}`);
    }
    if (fs.existsSync(urlFile)) {
      const value = fs.readFileSync(urlFile, 'utf8').trim();
      if (/^http:\/\/127\.0\.0\.1:\d+\/$/.test(value)) return value;
    }
    await wait(100);
  }
  throw new Error(`Installed app did not report its URL within 30 seconds.\n${output.join('')}`);
}

async function waitForRendererStatus(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(rendererFile)) {
      try {
        const status = JSON.parse(fs.readFileSync(rendererFile, 'utf8'));
        assert(!status.error, `Installed renderer failed: ${status.error}`);
        assert.equal(status.readyState, 'complete', 'Installed renderer did not finish loading');
        assert.equal(status.hasRoot, true, 'Installed renderer has no root element');
        assert(status.rootChildren > 0, 'Installed renderer root is empty');
        assert.equal(status.hasTitleBar, true, 'Installed renderer is missing the title bar');
        return;
      } catch (error) {
        if (error instanceof SyntaxError) {
          await wait(100);
          continue;
        }
        throw error;
      }
    }
    await wait(100);
  }
  throw new Error('Installed app did not report a valid renderer state within 15 seconds.');
}

function assertShareArchive() {
  const archive = path.join(installRoot, 'resources', 'app.asar');
  assert(fs.existsSync(archive), `Installed app archive is missing: ${archive}`);
  const entries = listPackage(archive, { isPack: false }).map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, ''));
  assert(!entries.some((entry) => /^dist\/(library|stems|samples)(\/|$)/i.test(entry)), 'Installed archive contains the local library, stems, or samples');
  for (const id of privateIds) {
    assert(!entries.some((entry) => entry.startsWith(`dist/instruments/${id}/`)), `Installed archive contains private pack files for ${id}`);
  }
}

function packagedClearedPacks() {
  const archive = path.join(installRoot, 'resources', 'app.asar');
  assert(fs.existsSync(archive), `Installed app archive is missing: ${archive}`);
  const raw = JSON.parse(extractFile(archive, path.join('dist', 'instruments', 'index.json')).toString('utf8'));
  assert(Array.isArray(raw.packs), 'Installed archive has no instrument pack list');
  const cleared = raw.packs.filter((pack) => typeof pack.spdx === 'string' && clearedLicense.test(pack.spdx.trim()));
  assert(cleared.length === raw.packs.length, 'Installed archive contains private or unsupported licenses');
  assert(cleared.length > 0, 'Installed archive contains no cleared packs');
  assert(cleared.some((pack) => pack.id === 'vcsl-marimba'), 'Installed archive is missing the cleared Marimba pack');
  return cleared;
}

function stopTree(pid) {
  if (!pid) return;
  spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5_000).then(() => false),
  ]);
  if (exited === false) stopTree(child.pid);
}

async function waitForClosed(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portOpen(port))) return;
    await wait(100);
  }
  throw new Error(`Installed app left port ${port} listening.`);
}

function shortcutTarget(shortcut) {
  if (!fs.existsSync(shortcut)) return null;
  const quoted = shortcut.replace(/'/g, "''");
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${quoted}'); $s.TargetPath`,
  ], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function snapshotShortcuts() {
  return shortcutPaths.map((shortcut) => ({
    shortcut,
    contents: fs.existsSync(shortcut) ? fs.readFileSync(shortcut) : null,
  }));
}

function restoreShortcuts(snapshot) {
  for (const { shortcut, contents } of snapshot) {
    if (contents) {
      fs.mkdirSync(path.dirname(shortcut), { recursive: true });
      fs.writeFileSync(shortcut, contents);
      continue;
    }
    const target = shortcutTarget(shortcut);
    if (target && target.toLowerCase().startsWith(installRoot.toLowerCase())) {
      fs.rmSync(shortcut, { force: true });
    }
  }
}

function uninstall() {
  const uninstaller = path.join(installRoot, 'Uninstall Unbox Studio.exe');
  if (fs.existsSync(uninstaller)) {
    spawnSync(uninstaller, ['/S'], { cwd: scratch, stdio: 'ignore', windowsHide: true });
  }
}

async function removeScratch() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) throw error;
      await wait(500);
    }
  }
}

async function main() {
  assert(fs.existsSync(installer), `Share installer is missing: ${installer}`);
  assert(/^Unbox-Studio-Share-Setup-.*\.exe$/i.test(path.basename(installer)), 'Pass the share installer, not the local installer.');
  if (fs.existsSync(scratch)) fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const shortcutSnapshot = snapshotShortcuts();

  const debugPort = await freePort();
  assert(!(await portOpen(debugPort)), `Debug port ${debugPort} is unavailable.`);
  const install = spawnSync(installer, ['/S', '/currentuser', `/D=${installRoot}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(install.status, 0, `Silent share install failed (${install.status}): ${install.stderr || install.stdout || ''}`);
  assert(fs.existsSync(installExe), `Silent install did not produce ${installExe}`);

  const output = [];
  const child = spawn(installExe, [
    '--disable-gpu',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
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
  let appPort = null;
  try {
    const url = await waitForUrl(child, output);
    appPort = Number(new URL(url).port);
    const home = await get(url);
    assert.equal(home.status, 200, `Installed app served ${home.status} for /`);
    assert.match(home.body, /<!doctype html>/i, 'Installed app did not serve its entry page');

    const api = await get(new URL('/api/vst/status', url));
    assert.equal(api.status, 200, `Installed API returned ${api.status} for /api/vst/status`);
    const apiStatus = JSON.parse(api.body);
    assert.equal(typeof apiStatus.scanning, 'boolean', 'Installed API returned invalid VST status');
    assert.equal(typeof apiStatus.rootsAvailable, 'boolean', 'Installed API returned invalid VST roots state');

    const catalog = JSON.parse((await get(new URL('/instruments/index.json', url))).body);
    assertShareArchive();
    const expected = packagedClearedPacks();
    assert(Array.isArray(catalog.packs), 'Installed app returned an invalid instrument catalog');
    assert.equal(catalog.packs.length, expected.length, `Installed share app served ${catalog.packs.length} packs; expected ${expected.length} cleared packs`);
    assert.deepEqual(catalog.packs.map((pack) => pack.id).sort(), expected.map((pack) => pack.id).sort(), 'Installed share pack set differs from the cleared catalog');
    assert(catalog.packs.every((pack) => clearedLicense.test(pack.spdx.trim())), 'Installed share app served a private-license pack');
    const installedIds = new Set(catalog.packs.map((pack) => pack.id));
    for (const id of privateIds) assert(!installedIds.has(id), `Installed share app served private pack ${id}`);

    const stems = await get(new URL('/api/stems/list', url));
    assert.equal(stems.status, 404, `Installed share API exposed private stems (${stems.status})`);
    await waitForRendererStatus();
    console.log(`PASS · installed share app served ${catalog.packs.length} cleared packs, hid private packs, returned 404 for stems, and mounted its renderer at ${url}.`);
  } catch (error) {
    const detail = output.join('').trim();
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `\nInstalled app output:\n${detail}` : ''}`);
  } finally {
    await stop(child);
    if (appPort !== null) await waitForClosed(appPort);
    await waitForClosed(debugPort);
    uninstall();
    restoreShortcuts(shortcutSnapshot);
    await removeScratch();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
