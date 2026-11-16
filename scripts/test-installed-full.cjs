'use strict';

/**
 * Install the full local installer into a temporary per-user directory, launch the installed app
 * with a disposable Electron profile, verify its full catalog plus local library/stems, then
 * uninstall and remove the test artifacts.
 *
 * Usage: npm run test:full-installed -- [path-to-local-setup.exe]
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
if (process.platform !== 'win32') throw new Error('Installed full acceptance currently requires Windows.');
const installer = path.resolve(root, process.argv[2] || path.join('release', 'Unbox-Studio-Setup-1.0.0.exe'));
const scratch = path.join(root, '.tmp', 'full-install-acceptance');
const installRoot = path.join(scratch, 'app');
const installExe = path.join(installRoot, 'Unbox Studio.exe');
const profile = path.join(scratch, 'profile');
const urlFile = path.join(scratch, 'app-url.txt');
const rendererFile = path.join(scratch, 'renderer-status.json');
const privateIds = ['tumbi-folk', 'dholak-folk', 'chamkila-harmonium', 'chamkila-vocal'];
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

function archiveEntries() {
  const archive = path.join(installRoot, 'resources', 'app.asar');
  assert(fs.existsSync(archive), `Installed app archive is missing: ${archive}`);
  return {
    archive,
    entries: listPackage(archive, { isPack: false }).map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, '')),
  };
}

function packagedPacks() {
  const { archive } = archiveEntries();
  const raw = JSON.parse(extractFile(archive, path.join('dist', 'instruments', 'index.json')).toString('utf8'));
  assert(Array.isArray(raw.packs), 'Installed archive has no instrument pack list');
  assert(raw.packs.length > 0, 'Installed archive contains no packs');
  return raw.packs;
}

function assertFullArchive() {
  const { entries } = archiveEntries();
  for (const id of privateIds) {
    assert(entries.some((entry) => entry.startsWith(`dist/instruments/${id}/`)), `Full archive is missing private pack files for ${id}`);
  }
  assert(entries.some((entry) => entry.startsWith('dist/library/')), 'Full archive is missing the local library');
  assert(entries.some((entry) => entry.startsWith('dist/stems/')), 'Full archive is missing song stems');
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
  assert(fs.existsSync(installer), `Full installer is missing: ${installer}`);
  assert(/^Unbox-Studio-Setup-.*\.exe$/i.test(path.basename(installer)), 'Pass the full installer, not the share installer.');
  if (fs.existsSync(scratch)) fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const shortcutSnapshot = snapshotShortcuts();
  let child = null;
  let appPort = null;
  const debugPort = await freePort();
  assert(!(await portOpen(debugPort)), `Debug port ${debugPort} is unavailable.`);
  const output = [];
  try {
    const install = spawnSync(installer, ['/S', '/currentuser', `/D=${installRoot}`], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(install.status, 0, `Silent full install failed (${install.status}): ${install.stderr || install.stdout || ''}`);
    assert(fs.existsSync(installExe), `Silent install did not produce ${installExe}`);

    const expected = packagedPacks();
    assertFullArchive();

    child = spawn(installExe, [
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
    assert(Array.isArray(catalog.packs), 'Installed app returned an invalid instrument catalog');
    assert.equal(catalog.packs.length, expected.length, `Installed app served ${catalog.packs.length} packs; expected ${expected.length}`);
    assert.deepEqual(catalog.packs.map((pack) => pack.id).sort(), expected.map((pack) => pack.id).sort(), 'Installed pack set differs from the archive catalog');

    const stems = await get(new URL('/api/stems/library', url));
    assert.equal(stems.status, 200, `Installed full API did not expose stems (${stems.status})`);
    assert.doesNotThrow(() => JSON.parse(stems.body), 'Installed stems library response is not valid JSON');
    const library = await get(new URL('/library/library.json', url));
    assert.equal(library.status, 200, `Installed full app did not expose its local library (${library.status})`);
    assert.doesNotThrow(() => JSON.parse(library.body), 'Installed full library manifest is not valid JSON');

    await waitForRendererStatus();
    console.log(`PASS · full installed app served ${catalog.packs.length} packs, kept its four private packs, exposed its local library and stems, and mounted its renderer at ${url}.`);
  } catch (error) {
    const detail = output.join('').trim();
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `\nInstalled app output:\n${detail}` : ''}`);
  } finally {
    if (child) await stop(child);
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
