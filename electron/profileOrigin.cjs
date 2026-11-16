'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const markerName = 'loopback-origin-port';
const indexedDbOrigin = /^http_127\.0\.0\.1_(\d+)\.indexeddb\.leveldb$/;

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

function originError(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: 'UNBOX_PROFILE_ORIGIN' });
}

function readAssignedPort(profileDirectory) {
  const marker = path.join(profileDirectory, markerName);
  try {
    const value = fs.readFileSync(marker, 'utf8').trim();
    const port = Number(value);
    if (!/^\d+$/.test(value) || !validPort(port)) {
      throw originError(`The saved project storage address in ${marker} is invalid. Restore the profile address file from backup before opening this profile.`);
    }
    return port;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function legacyPorts(profileDirectory) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(profileDirectory, 'IndexedDB'), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const match = entry.isDirectory() && indexedDbOrigin.exec(entry.name);
    const port = match && Number(match[1]);
    return validPort(port) ? [port] : [];
  }).sort((a, b) => a - b);
}

function storeAssignedPort(profileDirectory, port) {
  const marker = path.join(profileDirectory, markerName);
  const temp = `${marker}.${randomUUID()}.tmp`;
  try {
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.writeFileSync(temp, `${port}\n`, { encoding: 'utf8', flag: 'wx', flush: true });
    fs.renameSync(temp, marker);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* The failed write may not have created a file. */ }
    throw originError('Could not save the project storage address. Check that the Unbox Studio profile is writable, then reopen the app.', error);
  }
}

/**
 * Start a loopback server for this Chromium profile before opening its renderer.
 * A chosen address is the sole candidate so an occupied port cannot hide the
 * profile's IndexedDB data. `null` means the user cancelled legacy selection.
 */
async function startProfileOrigin({ profileDirectory, defaultPorts, startServer, chooseLegacyOrigin, selectLegacyOrigin = false }) {
  const assignedPort = readAssignedPort(profileDirectory);
  let preferredPort = assignedPort;
  if (assignedPort === undefined || selectLegacyOrigin) {
    const candidates = new Set(legacyPorts(profileDirectory));
    if (assignedPort !== undefined) candidates.add(assignedPort);
    const ports = [...candidates].sort((a, b) => a - b);
    if (ports.length > 1) {
      preferredPort = await chooseLegacyOrigin(ports, assignedPort);
      if (preferredPort === null) return null;
      if (!candidates.has(preferredPort)) throw originError('The selected project storage address is unavailable.');
    } else {
      preferredPort = ports[0];
    }
  }

  let boundPort;
  try {
    boundPort = await startServer(preferredPort === undefined ? defaultPorts : [preferredPort]);
  } catch (error) {
    if (preferredPort !== undefined && error.code === 'EADDRINUSE') {
      throw originError(`The saved project storage address 127.0.0.1:${preferredPort} is in use. Close the other application or Unbox Studio copy using that address, then reopen this profile.`, error);
    }
    throw error;
  }
  if (!validPort(boundPort) || (preferredPort !== undefined && boundPort !== preferredPort)) {
    throw originError(`Could not open the saved project storage address 127.0.0.1:${preferredPort ?? boundPort}. Rebuild the desktop API bundle and reopen Unbox Studio.`);
  }
  if (boundPort !== assignedPort) storeAssignedPort(profileDirectory, boundPort);
  return boundPort;
}

module.exports = { startProfileOrigin };
