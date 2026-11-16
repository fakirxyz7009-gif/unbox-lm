'use strict';

// electron-builder 26.18.1 downloads 7zip@1.0.0, whose Windows "x64" toolset is actually a
// 32-bit 7za.exe (7-Zip reports x86 and is capped at ~1.75 GB). Large app archives can fail
// inside that helper with STATUS_DLL_INIT_FAILED. Prefer a real x64 7-Zip when one is installed.
const fs = require('node:fs');
const path = require('node:path');

function isFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

// Electron-builder only needs a runnable path, so verify the PE machine type instead of trusting
// the filename. 0x8664 is AMD64; a 32-bit 7z.exe is 0x014c and would reintroduce the memory cap.
function isX64Executable(file) {
  if (!isFile(file)) return false;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(64 * 1024);
    const bytes = fs.readSync(fd, header, 0, header.length, 0);
    if (bytes < 64 || header.toString('ascii', 0, 2) !== 'MZ') return false;
    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset + 6 > bytes || header.readUInt32LE(peOffset) !== 0x00004550) return false;
    return header.readUInt16LE(peOffset + 4) === 0x8664;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function prepareSevenZip({ strict = false } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') return null;

  const explicit = process.env.ELECTRON_BUILDER_7ZIP_PATH;
  if (explicit) {
    if (isX64Executable(explicit)) {
      console.log(`Using x64 7-Zip from ELECTRON_BUILDER_7ZIP_PATH: ${explicit}`);
      return explicit;
    }
    const message = isFile(explicit)
      ? `ELECTRON_BUILDER_7ZIP_PATH is not an x64 executable: ${explicit}`
      : `ELECTRON_BUILDER_7ZIP_PATH does not exist: ${explicit}`;
    if (strict) throw new Error(message);
    console.warn(`WARNING: ${message}. Looking for a system x64 7-Zip instead.`);
    delete process.env.ELECTRON_BUILDER_7ZIP_PATH;
  }

  const candidates = [...new Set([process.env.ProgramW6432, process.env.ProgramFiles]
    .filter(Boolean)
    .map(base => path.join(base, '7-Zip', '7z.exe')))];
  const candidate = candidates.find(isX64Executable);
  if (candidate) {
    process.env.ELECTRON_BUILDER_7ZIP_PATH = candidate;
    console.log(`Using x64 system 7-Zip for packaging: ${candidate}`);
    return candidate;
  }

  const present = candidates.find(isFile);
  const message = present
    ? `The system 7-Zip is not an x64 executable: ${present}`
    : 'No x64 system 7-Zip was found';
  const advice = 'electron-builder will use its bundled 32-bit 7za.exe, which can exhaust its memory limit on large portable archives. Install 7-Zip x64 or set ELECTRON_BUILDER_7ZIP_PATH to an x64 7z.exe.';
  if (strict) throw new Error(`${message}. ${advice}`);
  console.warn(`WARNING: ${message}. ${advice}`);
  return null;
}

module.exports = { isX64Executable, prepareSevenZip };
