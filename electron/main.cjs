// THE UNBOX APP - Electron desktop wrapper.
// Serves the built web app (../dist) plus the /api routes (AI + D:\vsr library) from
// api-server.cjs (built by `npm run build:api`). Without that bundle it falls back to a
// static-only server.
const { app, BrowserWindow, session } = require('electron');
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

process.on('uncaughtException', (error) => failStartup('uncaught-exception', error));
process.on('unhandledRejection', (error) => failStartup('unhandled-rejection', error));

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
    autoHideMenuBar: true,
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required', // audio can start without a first click
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep the sequencer timing steady when the window is in the background
    },
  });
  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });
  win.webContents.on('render-process-gone', (_event, details) => {
    recordStartupFailure(app.getPath('userData'), 'renderer-process-gone', new Error(`${details.reason}: exit code ${details.exitCode}`));
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  const allowed = ['midi', 'midiSysex', 'media', 'audioCapture'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.includes(permission));
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch((error) => failStartup('activate', error));
  });
}).catch((error) => {
  failStartup('application-startup', error);
});

app.on('window-all-closed', () => app.quit());
