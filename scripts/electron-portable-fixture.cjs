'use strict';

const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function positiveInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}.`);
  return value;
}

function normalPath(value) {
  return path.win32.resolve(value).toLowerCase();
}

function liveWrapperPid(wrapperChild) {
  if (wrapperChild.exitCode !== null || wrapperChild.signalCode !== null) {
    throw new Error('The portable wrapper exited before it could be verified as the owner.');
  }
  return positiveInt(wrapperChild.pid, 'portable wrapper PID');
}

/** Read the process chain in one OS query. Returns null when CIM is unavailable. */
function processAncestry(pid) {
  positiveInt(pid, 'portable child PID');
  const command = [
    '$ErrorActionPreference = "Stop"',
    `$next = ${pid}`,
    '$chain = @(for ($depth = 0; $next -gt 0 -and $depth -lt 32; $depth++) {',
    '  $row = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $next)',
    '  if (!$row) { break }',
    '  @{ pid = $row.ProcessId; parentPid = $row.ParentProcessId; executablePath = $row.ExecutablePath }',
    '  $next = $row.ParentProcessId',
    '})',
    'ConvertTo-Json -Compress -InputObject $chain',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', timeout: 12_000, windowsHide: true,
  });
  if (result.status !== 0) return null;
  try {
    const rows = JSON.parse(result.stdout.trim());
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function requireAncestry(rows, pid, wrapperChild) {
  const wrapperPid = liveWrapperPid(wrapperChild);
  const ownerIndex = rows.findIndex((row) => row.pid === wrapperPid);
  const ownerPath = rows[ownerIndex]?.executablePath;
  if (rows[0]?.pid !== pid || ownerIndex < 1 || !ownerPath ||
      normalPath(ownerPath) !== normalPath(wrapperChild.spawnfile)) {
    throw new Error(`Process ${pid} is not a verified descendant of portable wrapper ${wrapperPid}.`);
  }
}

/** Verify the launched Electron browser through the profile and flags passed to this fixture only. */
async function inspectPortableChild(browser, userData, debugPort, wrapperChild) {
  const wrapperPid = liveWrapperPid(wrapperChild);
  positiveInt(debugPort, 'portable debugger port');
  const session = await browser.newBrowserCDPSession();
  try {
    const { arguments: args } = await session.send('Browser.getBrowserCommandLine');
    const executablePath = args[0];
    const relative = path.win32.relative(normalPath(os.tmpdir()), normalPath(executablePath));
    if (!relative || relative.startsWith('..') || path.win32.isAbsolute(relative) ||
        path.win32.basename(executablePath).toLowerCase() !== 'unbox studio.exe') {
      throw new Error('The debugger is not attached to the extracted portable executable in the temporary directory.');
    }
    const profile = '--user-data-dir=';
    if (!args.some((arg) => arg.startsWith(profile) && normalPath(arg.slice(profile.length)) === normalPath(userData)) ||
        !args.includes(`--remote-debugging-port=${debugPort}`)) {
      throw new Error('The portable app debugger did not report the expected disposable profile and port.');
    }
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const browsers = processInfo.filter((entry) => entry.type === 'browser');
    if (browsers.length !== 1) throw new Error('The portable app debugger did not identify one Electron main process.');
    const pid = positiveInt(browsers[0].id, 'portable Electron PID');
    if (pid === wrapperPid) throw new Error('The portable app debugger identified the NSIS wrapper as its Electron process.');
    const parents = processAncestry(pid);
    if (parents) requireAncestry(parents, pid, wrapperChild);
    return { pid, executablePath };
  } finally {
    await session.detach().catch(() => {});
  }
}

/** Call only with a PID verified by the debugger and profile inspection above. */
function terminatePortableChild(pid) {
  positiveInt(pid, 'verified portable Electron PID');
  const result = spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
    stdio: 'ignore', timeout: 12_000, windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not stop verified portable Electron process ${pid}.`);
}

module.exports = { inspectPortableChild, terminatePortableChild };
