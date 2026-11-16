'use strict';

// Launches source, unpacked, or portable Electron with an isolated profile. The test owns
// and terminates only the process tree it launched.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { prepareRecordingCrash, verifyRecordingRecovery } = require('./electron-recording-recovery.cjs');
const { prepareMidiRecordingCrash, verifyMidiRecordingRecovery } = require('./electron-midi-recording-recovery.cjs');
const { createWelcomeProject } = require('./electron-welcome-fixture.cjs');
const { inspectPortableChild, terminatePortableChild } = require('./electron-portable-fixture.cjs');

const root = path.resolve(__dirname, '..');
// With no argument this is the source-Electron smoke. Passing a packaged executable keeps the
// same URL/renderer handshake while exercising app.isPackaged, asar resolution and the bundled API.
const argSet = new Set(process.argv.slice(2));
const persistenceMode = argSet.has('--indexeddb-write') ? 'write' : argSet.has('--indexeddb-read') ? 'read' : null;
if (argSet.has('--indexeddb-write') && argSet.has('--indexeddb-read')) throw new Error('Choose one IndexedDB persistence mode.');
const recoveryModes = [
  ['--project-recovery-write', 'write'],
  ['--project-recovery-restore', 'restore'],
  ['--project-recovery-verify', 'verify'],
  ['--project-recovery-crash-write', 'crash-write'],
  ['--project-recovery-crash-restore', 'crash-restore'],
  ['--project-recovery-crash-verify', 'crash-verify'],
  ['--recording-recovery-crash-write', 'recording-crash-write'],
  ['--recording-recovery-crash-restore', 'recording-crash-restore'],
  ['--recording-recovery-crash-verify', 'recording-crash-verify'],
];
const supportedFlags = new Set(['--indexeddb-write', '--indexeddb-read', '--master-capture',
  '--midi-capture-song', '--midi-capture-pattern', '--reuse-portable', ...recoveryModes.map(([flag]) => flag)]);
const positionalArgs = [...argSet].filter((arg) => !arg.startsWith('--'));
const unknownFlag = [...argSet].find((arg) => arg.startsWith('--') && !supportedFlags.has(arg));
if (unknownFlag) throw new Error(`Unrecognized desktop smoke flag: ${unknownFlag}`);
if (positionalArgs.length > 1) throw new Error('Pass at most one packaged executable path.');
const recoveryFlags = recoveryModes.filter(([flag]) => argSet.has(flag));
if (recoveryFlags.length > 1) throw new Error('Choose one packaged project-recovery mode.');
const recoveryMode = recoveryFlags[0]?.[1] ?? null;
if (persistenceMode && recoveryMode) throw new Error('Choose either IndexedDB-sentinel or project-recovery coverage.');
const packagedExeArg = positionalArgs[0];
const isPackaged = !!packagedExeArg;
const electronExe = isPackaged
  ? path.resolve(root, packagedExeArg)
  : path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
if (!fs.existsSync(electronExe)) throw new Error(`Electron executable was not found: ${electronExe}`);
const packagedKind = isPackaged
  ? electronExe.toLowerCase().includes(`${path.sep}win-unpacked${path.sep}`) ? 'unpacked' : 'portable'
  : 'source';
const isPortable = packagedKind === 'portable';
const webBuild = path.join(root, 'dist', 'index.html');
const reusePortable = argSet.has('--reuse-portable');
if (reusePortable && (!isPortable || path.relative(root, electronExe) !== path.join('.tmp', 'desktop-portable', 'Unbox-Studio-Portable-Smoke.exe'))) {
  throw new Error('--reuse-portable requires the dedicated portable smoke artifact.');
}
if (isPortable && !reusePortable && fs.statSync(electronExe).mtimeMs < fs.statSync(webBuild).mtimeMs) {
  throw new Error('The portable executable predates the current web build. Package it again before testing it.');
}
if (recoveryMode && !isPackaged) throw new Error('Packaged project-recovery coverage requires a packaged executable.');
const crashRecoveryMode = recoveryMode?.startsWith('crash-') ?? false;
const recordingCrashMode = recoveryMode?.startsWith('recording-crash-') ?? false;
const masterCapture = argSet.has('--master-capture');
const midiSong = argSet.has('--midi-capture-song');
const midiPattern = argSet.has('--midi-capture-pattern');
const midiCapture = midiSong ? 'song_arrangement' : midiPattern ? 'pattern_loop' : null;
const captureModeCount = [masterCapture, midiSong, midiPattern].filter(Boolean).length;
if (captureModeCount > 1 || (captureModeCount && !recordingCrashMode)) throw new Error('Choose at most one capture type for a recording-recovery phase.');
const captureScope = midiCapture ? `midi-${midiSong ? 'song' : 'pattern'}-` : masterCapture ? 'master-' : '';
const probeScope = recordingCrashMode ? `${captureScope}recording-recovery-crash`
  : crashRecoveryMode ? 'project-recovery-crash' : recoveryMode ? 'project-recovery' : 'desktop';
const probeDir = path.join(root, '.tmp', `electron-${packagedKind}-${probeScope}-smoke`);
const startupTimeoutMs = packagedKind === 'portable' ? 180_000 : 15_000;
const debugPort = persistenceMode || recoveryMode || packagedKind === 'portable' ? 9229 : null;
const userData = path.join(probeDir, 'userdata');
const urlFile = path.join(probeDir, 'app-url.txt');
const sequenceOriginFile = path.join(probeDir, 'sequence-origin.txt');
const rendererFile = path.join(probeDir, 'renderer-status.json');
const recoveryFile = path.join(probeDir, 'project-recovery-target.json');
const entry = path.join(root, 'electron', 'main.cjs');
let appUrl = null;

// The write phase starts a complete recovery sequence. Its dedicated disposable profile must not
// inherit a prior interrupted run's projects, recovery banner or Chromium cache.
const startsRecoveryRun = recoveryMode === 'write' || recoveryMode === 'crash-write' || recoveryMode === 'recording-crash-write';
function prepareProfile() {
  if (startsRecoveryRun && fs.existsSync(probeDir)) {
    const expectedPath = path.join(fs.realpathSync(root), '.tmp', path.basename(probeDir));
    if (path.relative(expectedPath, fs.realpathSync(probeDir))) throw new Error('The disposable recovery profile resolves outside its expected path.');
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userData, { recursive: true });
  if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile);
  if (fs.existsSync(rendererFile)) fs.unlinkSync(rendererFile);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The executable exited before serving the app (exit code ${child.exitCode}, signal ${child.signalCode}).`);
    }
    if (fs.existsSync(urlFile)) {
      const value = fs.readFileSync(urlFile, 'utf8').trim();
      if (/^http:\/\/127\.0\.0\.1:\d+\/$/.test(value)) return value;
    }
    await wait(100);
  }
  throw new Error(`Electron main did not load its real app URL within ${Math.round(timeoutMs / 1_000)} seconds.`);
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

async function waitForPortClosed(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portOpen(port))) return;
    await wait(100);
  }
  throw new Error(`Electron smoke left its loopback listener on port ${port}.`);
}

function loadChromium() {
  return require(require.resolve('playwright-core', {
    paths: [root, path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules')],
  })).chromium;
}

/** Runs a narrowly scoped assertion in the packaged renderer through a test-only debug port. */
async function withRendererDebugger(label, task, { retryTask = true } = {}) {
  if (!debugPort) return undefined;
  const chromium = loadChromium();
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    let browser = null;
    let taskStarted = false;
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
      const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url() === appUrl);
      if (!page) throw new Error('The Electron renderer was not exposed through the test debugger.');
      taskStarted = true;
      const value = await task(page, browser);
      await browser.close();
      return value;
    } catch (error) {
      lastError = error;
      if (browser) await browser.close().catch(() => undefined);
      if (taskStarted && !retryTask) throw error;
      await wait(200);
    }
  }
  throw new Error(`Packaged ${label} check did not complete: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function verifyIndexedDbPersistence(mode) {
  if (!debugPort) return;
  await withRendererDebugger(`IndexedDB ${mode}`, async (page) => {
    const value = await page.evaluate(async ({ mode: requestedMode }) => {
        const key = 'packaged-persistence-smoke';
        const sentinel = 'unbox-indexeddb-persistence-v1';
        return new Promise((resolve, reject) => {
          const open = indexedDB.open('unbox-studio');
          open.onerror = () => reject(open.error ?? new Error('Could not open the studio database.'));
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('settings', requestedMode === 'write' ? 'readwrite' : 'readonly');
            const store = tx.objectStore('settings');
            let readValue = null;
            if (requestedMode === 'write') store.put({ key, value: sentinel });
            else {
              const read = store.get(key);
              read.onsuccess = () => { readValue = read.result?.value ?? null; };
              read.onerror = () => reject(read.error ?? new Error('Could not read the persistence sentinel.'));
            }
            tx.oncomplete = () => { db.close(); resolve(requestedMode === 'write' ? sentinel : readValue); };
            tx.onerror = () => { db.close(); reject(tx.error ?? new Error('The persistence transaction failed.')); };
            tx.onabort = () => { db.close(); reject(tx.error ?? new Error('The persistence transaction was aborted.')); };
          };
        });
    }, { mode });
    if (value !== 'unbox-indexeddb-persistence-v1') throw new Error(`Unexpected packaged IndexedDB sentinel: ${String(value)}`);
  });
}

function readRecoveryTarget() {
  if (!fs.existsSync(recoveryFile)) throw new Error('Packaged project-recovery target was not staged by the prior test run.');
  const target = JSON.parse(fs.readFileSync(recoveryFile, 'utf8'));
  if (!target || typeof target.projectId !== 'string' || !Number.isFinite(target.bpm)) {
    throw new Error('Packaged project-recovery target is malformed.');
  }
  return target;
}

async function inspectPackagedProject(page, projectId) {
  return page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('unbox-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the studio database.'));
    });
    const get = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Could not read ${store}.`));
    });
    try {
      const [project, lastProject, recovery] = await Promise.all([
        get('projects', id),
        get('settings', 'lastProjectId'),
        get('settings', 'recovery'),
      ]);
      const parsed = typeof project?.json === 'string' ? JSON.parse(project.json) : null;
      return {
        projectId: project?.id ?? null,
        bpm: project?.bpm ?? null,
        jsonBpm: typeof parsed?.bpm === 'number' ? parsed.bpm : null,
        lastProjectId: lastProject?.value ?? null,
        hasRecovery: !!recovery?.value,
        tempo: document.querySelector('input[aria-label="Tempo (BPM)"]')?.value ?? null,
        hasRestoreButton: Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Restore'),
      };
    } finally {
      db.close();
    }
  }, projectId);
}

async function inspectRendererRecovery(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('unbox-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the studio database.'));
    });
    const get = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Could not read ${store}.`));
    });
    try {
      const lastProject = await get('settings', 'lastProjectId');
      const project = lastProject?.value ? await get('projects', lastProject.value) : null;
      const recovery = await get('settings', 'recovery');
      let parsedRecovery = null;
      if (typeof recovery?.value === 'string') {
        try { parsedRecovery = JSON.parse(recovery.value); } catch { /* reported below as null */ }
      }
      let parsedRecoveryJson = null;
      if (typeof parsedRecovery?.json === 'string') {
        try { parsedRecoveryJson = JSON.parse(parsedRecovery.json); } catch { /* reported below as null */ }
      }
      return {
        projectId: project?.id ?? null,
        savedBpm: project?.bpm ?? null,
        recoveryProjectId: parsedRecovery?.projectId ?? null,
        recoveryBpm: parsedRecoveryJson?.bpm ?? null,
      };
    } finally {
      db.close();
    }
  });
}

function assertRecoveredProject(state, target, phase) {
  const expectedTempo = String(target.bpm);
  if (state.projectId !== target.projectId || state.bpm !== target.bpm || state.jsonBpm !== target.bpm ||
      state.lastProjectId !== target.projectId || state.hasRecovery || state.tempo !== expectedTempo || state.hasRestoreButton) {
    throw new Error(`Packaged project recovery ${phase} state was not durable: ${JSON.stringify(state)}`);
  }
}

/**
 * Exercises the real packaged RecoveryBanner rather than writing and reading an arbitrary IndexedDB value:
 * stage a valid recovery record, restart, click Restore in the actual renderer, then restart once more.
 */
async function verifyPackagedProjectRecovery(mode) {
  if (!mode) return;
  const recoveryBpm = 137;
  if (mode === 'write') {
    const target = await withRendererDebugger('project-recovery setup', async (page) => {
      await createWelcomeProject(page);
      return page.evaluate(async ({ bpm }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('unbox-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the studio database.'));
      });
      const get = (store, key) => new Promise((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(`Could not read ${store}.`));
      });
      const put = (store, value) => new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Could not write ${store}.`));
        tx.onabort = () => reject(tx.error ?? new Error(`Could not write ${store}.`));
      });
      try {
        const lastProject = await get('settings', 'lastProjectId');
        const project = lastProject?.value ? await get('projects', lastProject.value) : null;
        if (!project?.id || typeof project.json !== 'string') throw new Error('No saved project is available for the packaged recovery smoke.');
        const json = JSON.parse(project.json);
        if (!json || typeof json !== 'object') throw new Error('The saved project JSON is malformed.');
        json.bpm = bpm;
        const recoveryJson = JSON.stringify(json);
        if (recoveryJson === project.json) throw new Error('The staged recovery record did not differ from its saved project.');
        await put('settings', {
          key: 'recovery',
          value: JSON.stringify({ json: recoveryJson, at: Date.now(), name: project.name, projectId: project.id }),
        });
        return { projectId: project.id, bpm, name: project.name };
      } finally {
        db.close();
      }
      }, { bpm: recoveryBpm });
    }, { retryTask: false });
    fs.writeFileSync(recoveryFile, JSON.stringify(target), 'utf8');
    return;
  }

  const target = readRecoveryTarget();
  await withRendererDebugger(`project-recovery ${mode}`, async (page) => {
    if (mode === 'restore') {
      const restore = page.getByRole('button', { name: 'Restore', exact: true });
      await restore.waitFor({ state: 'visible', timeout: 10_000 });
      await restore.click();
      await page.waitForFunction((bpm) => {
        const tempo = document.querySelector('input[aria-label="Tempo (BPM)"]')?.value;
        const hasRestore = Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Restore');
        return tempo === String(bpm) && !hasRestore;
      }, target.bpm, { timeout: 10_000 });
    } else {
      await page.waitForFunction((bpm) => document.querySelector('input[aria-label="Tempo (BPM)"]')?.value === String(bpm), target.bpm, { timeout: 10_000 });
      await wait(300);
    }
    const state = await inspectPackagedProject(page, target.projectId);
    assertRecoveredProject(state, target, mode);
  });
}

/**
 * Uses the real renderer Tempo control, waits for the app's own prompt recovery
 * write, then leaves the caller to terminate the exact smoke process tree. This
 * deliberately avoids staging an IndexedDB record from the test harness.
 */
async function prepareAbruptProjectRecovery() {
  const recoveryBpm = 139;
  const target = await withRendererDebugger('abrupt project-recovery setup', async (page) => {
    await createWelcomeProject(page);
    // Keep normal autosave enabled, with time for the portable ownership check
    // between the prompt snapshot and the forced stop.
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Projects…', exact: true }).click();
    await page.locator('label').filter({ hasText: 'Autosave every' }).locator('select').selectOption('60');
    await page.getByTestId('tab-workstation').click();
    const tempo = page.getByLabel('Tempo (BPM)', { exact: true });
    await tempo.fill(String(recoveryBpm));
    await tempo.press('Enter');
    await page.waitForFunction((bpm) => document.querySelector('input[aria-label="Tempo (BPM)"]')?.value === String(bpm), recoveryBpm, { timeout: 10_000 });

    let state = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      state = await inspectRendererRecovery(page);
      if (state.projectId && state.savedBpm !== recoveryBpm &&
          state.recoveryProjectId === state.projectId && state.recoveryBpm === recoveryBpm) {
        return { projectId: state.projectId, bpm: recoveryBpm };
      }
      await wait(100);
    }
    throw new Error(`The renderer did not persist an unsaved recovery before the full autosave: ${JSON.stringify(state)}`);
  }, { retryTask: false });
  fs.writeFileSync(recoveryFile, JSON.stringify(target), 'utf8');
}

async function verifyAbruptProjectRecovery(mode) {
  const target = readRecoveryTarget();
  await withRendererDebugger(`abrupt project-recovery ${mode}`, async (page) => {
    if (mode === 'crash-restore') {
      const restore = page.getByRole('button', { name: 'Restore', exact: true });
      try {
        await restore.waitFor({ state: 'visible', timeout: 15_000 });
      } catch (error) {
        const state = await inspectRendererRecovery(page);
        throw new Error(`The abrupt project recovery banner did not appear: ${JSON.stringify(state)}`, { cause: error });
      }
      await restore.click();
      await page.waitForFunction((bpm) => {
        const tempo = document.querySelector('input[aria-label="Tempo (BPM)"]')?.value;
        const hasRestore = Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Restore');
        return tempo === String(bpm) && !hasRestore;
      }, target.bpm, { timeout: 10_000 });
    } else {
      await page.waitForFunction((bpm) => document.querySelector('input[aria-label="Tempo (BPM)"]')?.value === String(bpm), target.bpm, { timeout: 10_000 });
      await wait(300);
    }
    const state = await inspectPackagedProject(page, target.projectId);
    assertRecoveredProject(state, target, mode);
  }, { retryTask: false });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
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

async function waitForPortableWrapper(wrapper) {
  if (wrapper.exitCode !== null || wrapper.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      wrapper.off('exit', onExit);
      reject(new Error('The portable wrapper did not exit after the extracted app stopped.'));
    }, 15_000);
    function onExit() {
      clearTimeout(timer);
      resolve();
    }
    wrapper.once('exit', onExit);
  });
}


/** Force-kills only the Electron process tree this smoke script started. */
async function crash(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
    throw new Error('The packaged app exited before the forced-stop test could terminate it.');
  }
  const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not force-stop abrupt-recovery smoke process ${child.pid}.`);
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5_000).then(() => false),
  ]);
  if (exited === false) throw new Error('Abrupt-recovery smoke process did not exit after taskkill.');
}

async function main() {
  const output = [];
  let appPort = null;
  if (debugPort !== null && await portOpen(debugPort)) throw new Error(`Packaged renderer smoke needs debug port ${debugPort}, but it is already in use.`);
  prepareProfile();
  // The source test needs --no-sandbox on this restricted Windows harness. A packaged executable
  // must use its normal production sandbox; otherwise this would only be a diagnostic launch.
  const launchArgs = [
    ...(isPackaged ? [] : ['--no-sandbox']),
    '--disable-gpu',
    `--user-data-dir=${userData}`,
    ...(debugPort !== null ? [`--remote-debugging-port=${debugPort}`] : []),
    ...(isPortable ? ['--enable-automation'] : []),
    ...(isPackaged ? [] : [entry]),
  ];
  const child = spawn(electronExe, [
    ...launchArgs,
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
  let portableIdentity = null;
  let portableStopped = false;
  const verifyPortableShutdown = async (browser) => {
    const verified = await inspectPortableChild(browser, userData, debugPort, child);
    if (verified.pid !== portableIdentity?.pid || verified.executablePath !== portableIdentity?.executablePath) {
      throw new Error('The extracted app identity changed before shutdown.');
    }
    return verified;
  };
  const forceStop = async () => {
    if (!isPortable) return crash(child);
    const verified = await withRendererDebugger('portable shutdown ownership', (_page, browser) =>
      verifyPortableShutdown(browser), { retryTask: false });
    terminatePortableChild(verified.pid);
    portableStopped = true;
    await waitForPortableWrapper(child);
  };
  const closePortable = async () => {
    await withRendererDebugger('portable shutdown ownership', async (page, browser) => {
      await verifyPortableShutdown(browser);
      // The write phase already simulated the crash. Later restarts model a
      // normal close after restoring, including the browser storage shutdown.
      await page.close({ runBeforeUnload: true });
    }, { retryTask: false });
    await waitForPortableWrapper(child);
    portableStopped = true;
  };
  try {
    const url = await waitForUrl(child, startupTimeoutMs);
    appUrl = url;
    appPort = Number(new URL(url).port);
    const response = await get(url);
    if (response.status !== 200 || !/<!doctype html>/i.test(response.body)) {
      throw new Error(`Electron served an unexpected app response (${response.status}): ${response.body.slice(0, 160)}`);
    }
    // A static-only fallback can serve index.html too. Require an API-only route so the packaged
    // smoke proves electron/api-server.cjs started instead of merely loading the static assets.
    const apiResponse = await get(new URL('/api/vst/status', url).toString());
    if (apiResponse.status !== 200) throw new Error(`Electron API bundle did not answer /api/vst/status (${apiResponse.status}): ${apiResponse.body.slice(0, 160)}`);
    let apiStatus;
    try {
      apiStatus = JSON.parse(apiResponse.body);
    } catch {
      throw new Error('Electron API bundle returned non-JSON VST status.');
    }
    if (!apiStatus || typeof apiStatus.scanning !== 'boolean' || typeof apiStatus.rootsAvailable !== 'boolean') {
      throw new Error(`Electron API bundle returned an invalid VST status: ${apiResponse.body.slice(0, 160)}`);
    }
    if (!isPortable) {
      const renderer = await waitForRendererStatus(15_000);
      if (renderer.error || renderer.readyState !== 'complete' || !renderer.hasRoot || renderer.rootChildren < 1 || !renderer.hasTitleBar) {
        throw new Error(`Electron renderer did not mount the Unbox shell: ${JSON.stringify(renderer)}`);
      }
    } else {
      await withRendererDebugger('portable renderer ready', async (page, browser) => {
        portableIdentity = await inspectPortableChild(browser, userData, debugPort, child);
        await page.getByTestId('title-bar').waitFor({ state: 'attached', timeout: 15_000 });
      }, { retryTask: false });
    }
    if (persistenceMode === 'write' || startsRecoveryRun) {
      fs.writeFileSync(sequenceOriginFile, url, 'utf8');
    } else if (persistenceMode || recoveryMode) {
      const expected = fs.readFileSync(sequenceOriginFile, 'utf8');
      if (url !== expected) throw new Error(`The packaged app started at ${url} instead of ${expected}. IndexedDB is scoped to the original address. Restart the complete test with stable ports.`);
    }
    if (persistenceMode) await verifyIndexedDbPersistence(persistenceMode);
    if (recordingCrashMode) {
      if (midiCapture) {
        if (recoveryMode === 'recording-crash-write') {
          const target = await withRendererDebugger('active MIDI recording', (page) => prepareMidiRecordingCrash(page, midiCapture), { retryTask: false });
          fs.writeFileSync(recoveryFile, JSON.stringify(target), 'utf8');
          await forceStop();
          console.log(`PASS: force-stopped the test-owned Electron process during ${midiCapture} with two durable MIDI notes.`);
        } else {
          const target = JSON.parse(fs.readFileSync(recoveryFile, 'utf8'));
          if (target.mode !== midiCapture) throw new Error('The saved MIDI fixture was created for a different capture mode.');
          const restore = recoveryMode === 'recording-crash-restore';
          await withRendererDebugger('MIDI recording recovery', (page) => verifyMidiRecordingRecovery(page, target, restore), { retryTask: false });
          console.log(`PASS: ${restore ? 'recovered and saved' : 'reopened'} two ${midiCapture} MIDI notes with the original project material intact.`);
        }
        return;
      }
      const captureLabel = masterCapture ? 'master output' : 'armed audio track';
      if (recoveryMode === 'recording-crash-write') {
        const target = await withRendererDebugger('active audio recording', (page) => prepareRecordingCrash(page, masterCapture), { retryTask: false });
        fs.writeFileSync(recoveryFile, JSON.stringify(target), 'utf8');
        await forceStop();
        console.log(`PASS: force-stopped the test-owned Electron process tree during ${captureLabel} recording with ${target.verifiedFrames} committed stereo frames.`);
      } else {
        const target = JSON.parse(fs.readFileSync(recoveryFile, 'utf8'));
        if (target.master !== masterCapture) throw new Error('The saved recording fixture was created for a different capture path.');
        const restore = recoveryMode === 'recording-crash-restore';
        const audio = await withRendererDebugger('recording recovery', (page) => verifyRecordingRecovery(page, target, restore), { retryTask: false });
        if (restore) fs.writeFileSync(recoveryFile, JSON.stringify({ ...target, assetFingerprint: audio.assetFingerprint }), 'utf8');
        console.log(`PASS: ${restore ? 'recovered and saved' : 'reopened'} ${audio.frames} frames of the captured stereo take in project ${target.projectId}.`);
      }
      return;
    }
    if (recoveryMode === 'crash-write') {
      await prepareAbruptProjectRecovery();
      await forceStop();
      console.log('PASS: packaged renderer persisted a live recovery snapshot before the test-owned Electron process tree was force-stopped.');
      return;
    }
    if (crashRecoveryMode) await verifyAbruptProjectRecovery(recoveryMode);
    else await verifyPackagedProjectRecovery(recoveryMode);
    const label = packagedKind === 'portable' ? 'portable Electron app' : isPackaged ? 'unpacked Electron app' : 'real Electron main';
    const verification = 'served index.html and /api/vst/status, and mounted the Unbox renderer shell';
    const coverage = persistenceMode
      ? ` and ${persistenceMode === 'write' ? 'wrote' : 'read'} the packaged IndexedDB sentinel`
      : recoveryMode
        ? ` and ${recoveryMode === 'write' ? 'staged a valid project recovery record' : recoveryMode === 'restore' ? 'restored a project through the live Recovery banner' : recoveryMode === 'crash-restore' ? 'restored an app-written recovery through the live Recovery banner after a forced exit' : 'reopened the restored project without a recovery banner'}`
        : '';
    console.log(`PASS: ${label} loaded ${url} with an isolated test profile and ${verification}${coverage}.`);
  } catch (error) {
    const detail = output.join('').trim();
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `\nElectron output:\n${detail}` : ''}`);
  } finally {
    if (!portableStopped && isPortable && portableIdentity && await portOpen(debugPort)) {
      try {
        await closePortable();
      } catch (error) {
        if (await portOpen(debugPort)) await forceStop();
        throw new Error('The portable fixture could not close cleanly.', { cause: error });
      }
    } else if (!portableStopped && isPortable && child.exitCode === null && child.signalCode === null) {
      // Startup may fail before verification. The spawned wrapper PID is still ours. Do not
      // use the port alone to identify or kill a process.
      await crash(child);
    } else if (!isPortable) await stop(child);
    if (appPort !== null) await waitForPortClosed(appPort);
    if (debugPort !== null) await waitForPortClosed(debugPort);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
