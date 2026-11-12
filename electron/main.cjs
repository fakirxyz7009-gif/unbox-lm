// THE UNBOX APP - Electron desktop wrapper.
// Serves the built web app (../dist) plus the /api routes (AI + D:\vsr library) from
// api-server.cjs (built by `npm run build:api`). Without that bundle it falls back to a
// static-only server.
const { app, BrowserWindow, session, shell, powerSaveBlocker } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { listenOnFixedPort } = require('./listenOnFixedPort.cjs');
const { resolveStaticPath } = require('./staticPath.cjs');
const { recordStartupFailure } = require('./startupDiagnostics.cjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.m4a': 'audio/mp4', '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};

// Fixed loopback ports: the page origin must stay the same between launches, otherwise saved
// projects, samples and settings (IndexedDB / localStorage are per origin) would disappear.
const PORTS = [47821, 47822, 47823, 47824, 47825];

function startServer(root) {
  return new Promise((resolve) => {
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
    listenOnFixedPort(srv, PORTS).then(resolve, () => srv.listen(0, '127.0.0.1', () => resolve(srv.address().port)));
  });
}

async function startAppServer(root) {
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
    }, PORTS);
  } catch (e) {
    console.warn('API server unavailable; serving the app without AI / plugin library:', e && e.message);
    return startServer(root);
  }
}

let mainWindow = null;
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
  const port = await startAppServer(root);
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
  await createWindow();
  startupComplete = true;
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch((error) => failStartup('activate', error));
  });
}).catch((error) => {
  failStartup('application-startup', error);
});

app.on('window-all-closed', () => app.quit());
