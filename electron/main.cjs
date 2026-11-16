// THE UNBOX APP - Electron desktop wrapper.
// Serves the built web app (../dist) plus the /api routes (AI + D:\vsr library) from
// api-server.cjs (built by `npm run build:api`). Without that bundle it falls back to a
// static-only server.
const { app, BrowserWindow, dialog, session, shell, powerSaveBlocker } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { listenOnFixedPort } = require('./listenOnFixedPort.cjs');
const { startProfileOrigin } = require('./profileOrigin.cjs');
const { resolveStaticPath } = require('./staticPath.cjs');
const { recordStartupFailure } = require('./startupDiagnostics.cjs');
const { verifyVst3DelayFixture } = require('./vst3ClipFixture.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.m4a': 'audio/mp4', '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};

// These candidates are only used when creating a Chromium profile's first
// address. Existing storage stays bound to the port it was created on.
const PORTS = [47821, 47822, 47823, 47824, 47825, 0];

function startServer(root, ports) {
  const srv = http.createServer((req, res) => {
    const request = resolveStaticPath(root, req.url);
    if (request.status === 400) { res.writeHead(400); return res.end(); }
    if (request.pathname && request.pathname.startsWith('/api/')) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'AI features are not included in the desktop build.' }));
    }
    if (request.status === 403) { res.writeHead(403); return res.end(); }
    const file = request.filePath;
    fs.readFile(file, (err, data) => {
      if (err) {
        return fs.readFile(path.join(root, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return listenOnFixedPort(srv, ports);
}

async function startAppServer(root, ports) {
  try {
    const { startDesktopServer } = require('./api-server.cjs');
    const projectDir = path.join(__dirname, '..');
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
    return await startDesktopServer({
      distDir: root,
      baseDir: app.isPackaged ? app.getPath('userData') : projectDir,
      envFiles: [path.join(projectDir, '.env'), path.join(exeDir, '.env'), path.join(app.getPath('userData'), '.env')],
      manifestPath: app.isPackaged ? path.join(app.getPath('userData'), 'vsr-manifest.json') : undefined,
      bundleDir: app.isPackaged ? path.join(app.getPath('userData'), 'library') : path.join(projectDir, 'public', 'library'),
    }, ports);
  } catch (e) {
    if (e?.syscall === 'listen') throw e;
    console.warn('API server unavailable; serving the app without AI / plugin library:', e && e.message);
    return startServer(root, ports);
  }
}

async function chooseLegacyOrigin(ports, assignedPort) {
  if (desktopSmokeUrlFile) throw new Error(`Choose a project storage address interactively for this legacy profile (${ports.join(', ')}).`);
  const assignedIndex = ports.indexOf(assignedPort);
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Unbox Studio project storage',
    message: 'Choose the project storage address for this profile.',
    detail: 'Projects and recordings from earlier launches may be stored at different addresses. This profile will reopen the address you select. Start Unbox Studio with --select-project-storage to choose another address later.',
    buttons: [...ports.map((port) => `127.0.0.1:${port}`), 'Cancel'],
    defaultId: assignedIndex < 0 ? ports.length : assignedIndex,
    cancelId: ports.length,
    noLink: true,
  });
  return ports[response] ?? null;
}

let mainWindow = null;
let appServerPort = null;
// Test-only handshake: a smoke run uses an isolated user-data directory and writes the
// actual fallback/fixed app URL only after the hidden window has loaded it. Normal desktop
// launches never set this variable and keep the ordinary visible-window behavior.
const desktopSmokeUrlFile = process.env.UNBOX_DESKTOP_SMOKE_URL_FILE || '';
const desktopSmokeRendererFile = process.env.UNBOX_DESKTOP_SMOKE_RENDERER_FILE || '';

async function writeDesktopSmokeRendererStatus(win) {
  if (!desktopSmokeRendererFile) return;
  try {
    // `loadURL()` confirms document navigation, but not that React has mounted its UI yet.
    // Two frames give the synchronous React mount and first paint a deterministic chance to
    // complete without adding any test code to the renderer bundle.
    const status = await win.webContents.executeJavaScript(`
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const root = document.getElementById('root');
        resolve({
          readyState: document.readyState,
          hasRoot: Boolean(root),
          rootChildren: root ? root.childElementCount : 0,
          hasTitleBar: Boolean(document.querySelector('[data-testid="title-bar"]')),
        });
      })));
    `, true);
    fs.writeFileSync(desktopSmokeRendererFile, JSON.stringify(status), 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(desktopSmokeRendererFile, JSON.stringify({ error: detail }), 'utf8');
  }
}

function failStartup(stage, error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  let logPath = null;
  try {
    logPath = recordStartupFailure(app.getPath('userData'), stage, error);
  } catch {
    // The app may fail before Electron exposes a writable user-data directory.
  }
  console.error(`Unbox Studio failed during ${stage}: ${detail}${logPath ? ` (details: ${logPath})` : ''}`);
  if (error?.code === 'UNBOX_PROFILE_ORIGIN' && !desktopSmokeUrlFile) {
    dialog.showErrorBox('Unbox Studio could not open project storage', error.message);
  }
  app.exit(1);
}

// Before the window exists the app cannot run, so an error ends it. Afterwards one failed request or
// timer must not close the DAW: the error is logged and the session keeps running.
let startupComplete = false;
function reportProcessError(stage, error) {
  if (!startupComplete) return failStartup(stage, error);
  recordStartupFailure(app.getPath('userData'), `runtime-${stage}`, error);
  console.error(`Unbox Studio kept running after an error (${stage}): ${error instanceof Error ? error.message : String(error)}`);
}

function getDelayFixtureBuild() {
  if (app.isPackaged || process.platform !== 'win32' || process.arch !== 'x64' ||
      !app.commandLine.hasSwitch('vst3-test-delay')) return undefined;
  const directory = path.join(__dirname, '..', 'third_party', 'unbox-vst3-host-smoke-build');
  try {
    verifyVst3DelayFixture(directory);
    return directory;
  } catch (error) {
    console.warn('Unbox Test Delay unavailable. Run scripts/vst3/smoke.ps1 first.', error.message);
    return undefined;
  }
}

function registerDelayClipHandler(contents, appUrl, fixtureDirectory) {
  const { renderVst3Clip } = require('./vst3ClipProcess.cjs');
  let activeRender;
  contents.ipc.handle('unbox:vst3-test-delay', async (event, request) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame || event.senderFrame?.url !== appUrl) {
      throw new Error('Unbox Test Delay is only available to the DAW’s main window.');
    }
    if (activeRender) throw new Error('An Unbox Test Delay render is already running.');
    const controller = new AbortController();
    activeRender = controller;
    try {
      const fixture = verifyVst3DelayFixture(fixtureDirectory);
      const result = await renderVst3Clip(request, { ...fixture, signal: controller.signal });
      return result.channels;
    } finally {
      activeRender = undefined;
    }
  });
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) activeRender?.abort();
  });
  contents.once('destroyed', () => activeRender?.abort());
}
process.on('uncaughtException', (error) => reportProcessError('uncaught-exception', error));
process.on('unhandledRejection', (error) => reportProcessError('unhandled-rejection', error));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  const root = path.normalize(path.join(__dirname, '..', 'dist'));
  appServerPort ??= startProfileOrigin({
    profileDirectory: app.getPath('sessionData'),
    defaultPorts: PORTS,
    startServer: (ports) => startAppServer(root, ports),
    chooseLegacyOrigin,
    selectLegacyOrigin: app.commandLine.hasSwitch('select-project-storage'),
  });
  const port = await appServerPort;
  if (port === null) {
    app.quit();
    return false;
  }
  const delayFixtureBuild = getDelayFixtureBuild();
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#100e0b',
    title: 'Unbox Studio',
    show: !desktopSmokeUrlFile,
    autoHideMenuBar: true,
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required', // audio can start without a first click
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep the sequencer timing steady when the window is in the background
      ...(delayFixtureBuild ? { preload: path.join(__dirname, 'vst3ClipPreload.cjs'), sandbox: true } : {}),
    },
  });
  mainWindow = win;
  try {
    if (powerSaveBlocker && typeof powerSaveBlocker.start === 'function') {
      powerSaveBlocker.start('prevent-app-suspension');
    }
  } catch {
    // Non-fatal if powerSaveBlocker is unavailable in test harness
  }
  win.on('closed', () => { mainWindow = null; });
  win.webContents.on('render-process-gone', (_event, details) => {
    recordStartupFailure(app.getPath('userData'), 'renderer-process-gone', new Error(`${details.reason}: exit code ${details.exitCode}`));
  });
  // The window shows only the app. Links that try to open another window go to the system browser.
  const appUrl = `http://127.0.0.1:${port}/`;
  if (delayFixtureBuild) registerDelayClipHandler(win.webContents, appUrl, delayFixtureBuild);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrl)) event.preventDefault();
  });
  await win.loadURL(appUrl);
  if (desktopSmokeUrlFile) {
    try {
      fs.writeFileSync(desktopSmokeUrlFile, appUrl, 'utf8');
    } catch (error) {
      console.warn('Desktop smoke URL could not be recorded:', error && error.message);
    }
  }
  await writeDesktopSmokeRendererStatus(win);
  return true;
}

app.whenReady().then(async () => {
  const allowed = ['midi', 'midiSysex', 'media', 'audioCapture'];
  // Microphone access is needed for recording. Camera (video) access is never used, so a video request is refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    const wantsVideo = permission === 'media' && (details.mediaTypes ?? []).includes('video');
    cb(allowed.includes(permission) && !wantsVideo);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    const wantsVideo = permission === 'media' && details.mediaType === 'video';
    return allowed.includes(permission) && !wantsVideo;
  });
  if (!(await createWindow())) return;
  startupComplete = true;
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch((error) => failStartup('activate', error));
  });
}).catch((error) => {
  failStartup('application-startup', error);
});

app.on('window-all-closed', () => app.quit());
