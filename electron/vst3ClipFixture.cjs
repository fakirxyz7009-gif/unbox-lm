'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const hostFile = 'unbox-vst3-process-stream-host.exe';
const pluginBundle = path.join('VST3', 'Release', 'unbox-test-delay.vst3');
const pluginFile = path.join(pluginBundle, 'Contents', 'x86_64-win', 'unbox-test-delay.vst3');
const manifestFile = 'unbox-test-delay-artifacts.json';

function fixtureFile(root, relative, maxBytes) {
  const resolved = fs.realpathSync.native(path.join(root, relative));
  const inside = path.relative(root, resolved);
  if (!inside || path.isAbsolute(inside) || inside === '..' || inside.startsWith(`..${path.sep}`)) {
    throw new Error('The VST3 test fixture resolved outside its build directory.');
  }
  const info = fs.statSync(resolved);
  if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new Error(`Invalid VST3 test fixture file: ${relative}`);
  return resolved;
}

/** Only the source-built Windows fixture and its verified native host may be launched. */
function verifyVst3DelayFixture(buildDirectory) {
  const declaredRoot = path.resolve(buildDirectory);
  const root = fs.realpathSync.native(declaredRoot);
  if (path.relative(declaredRoot, root)) throw new Error('The VST3 test fixture build directory must not redirect elsewhere.');
  const manifest = JSON.parse(fs.readFileSync(fixtureFile(root, manifestFile, 1024), 'utf8'));
  if (manifest?.version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.hostSha256) || !/^[a-f0-9]{64}$/.test(manifest.pluginSha256)) {
    throw new Error('The VST3 test fixture manifest is invalid. Rebuild it with scripts/vst3/smoke.ps1.');
  }
  const hostPath = fixtureFile(root, hostFile, 16 * 1024 * 1024);
  const pluginBinary = fixtureFile(root, pluginFile, 16 * 1024 * 1024);
  const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (sha256(hostPath) !== manifest.hostSha256 || sha256(pluginBinary) !== manifest.pluginSha256) {
    throw new Error('The VST3 test fixture does not match its validated build. Rebuild it with scripts/vst3/smoke.ps1.');
  }
  return { hostPath, pluginPath: path.join(root, pluginBundle) };
}

module.exports = { verifyVst3DelayFixture };
