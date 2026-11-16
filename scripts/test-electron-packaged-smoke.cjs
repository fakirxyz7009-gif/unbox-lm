'use strict';

// Builds a Windows app beneath .tmp and exercises the actual executable. `--portable` additionally
// checks the self-extracting wrapper; its test has a longer bounded start budget for extraction.
// `--require-x64-7zip` turns the packaging preflight into an error instead of a warning.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { prepareSevenZip } = require('./packaging-preflight.cjs');

const root = path.resolve(__dirname, '..');
const persistence = process.argv.includes('--persistence');
const recovery = process.argv.includes('--recovery');
const crashRecovery = process.argv.includes('--crash-recovery');
const recordingCrashRecovery = process.argv.includes('--recording-crash-recovery');
const masterRecordingCrashRecovery = process.argv.includes('--master-recording-crash-recovery');
const midiRecordingCrashRecovery = process.argv.includes('--midi-recording-crash-recovery');
const recordingMatrix = process.argv.includes('--recording-crash-matrix');
const reusePortable = process.argv.includes('--reuse-portable');
const requireX64SevenZip = process.argv.includes('--require-x64-7zip') && !reusePortable;
const target = process.argv.includes('--portable') ? 'portable' : 'dir';
const coverageModes = [persistence, recovery, crashRecovery, recordingCrashRecovery, masterRecordingCrashRecovery, midiRecordingCrashRecovery, recordingMatrix];
if (coverageModes.filter(Boolean).length > 1) throw new Error('Choose one packaged persistence or recovery coverage mode.');
if (reusePortable && target !== 'portable') throw new Error('--reuse-portable requires --portable.');
const output = target === 'portable' ? '.tmp/desktop-portable' : '.tmp/desktop-package';
const exe = target === 'portable' ? path.join(output, 'Unbox-Studio-Portable-Smoke.exe') : path.join(output, 'win-unpacked', 'Unbox Studio.exe');

prepareSevenZip({ strict: requireX64SevenZip });

function run(command, args, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status === 0) return;
    if (attempt < attempts) {
      console.warn(`Packaging command failed (exit ${result.status ?? result.signal}); retrying ${attempt + 1}/${attempts}.`);
      continue;
    }
    throw new Error(`Packaged desktop smoke failed: ${command} ${args.join(' ')}`);
  }
}

const artifactPath = path.join(root, exe);
if (reusePortable) {
  if (!fs.statSync(artifactPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`No portable smoke artifact exists at ${exe}. Build it before reusing it.`);
  console.log(`Reusing portable smoke artifact ${exe}`);
} else {
  const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js');
  const priorArtifact = fs.statSync(artifactPath, { throwIfNoEntry: false });
  run(process.execPath, [electronBuilderCli, '--win', target, `--config.directories.output=${output}`,
    ...(target === 'portable' ? [`--config.portable.artifactName=${path.basename(exe)}`] : []),
  ], 2);
  const artifact = fs.statSync(artifactPath, { throwIfNoEntry: false });
  if (!artifact?.isFile() || (priorArtifact && artifact.mtimeMs <= priorArtifact.mtimeMs)) {
    throw new Error(`The build did not refresh its expected executable: ${exe}`);
  }
}

const artifact = fs.statSync(artifactPath);
function testDesktop(...coverageArgs) {
  const current = fs.statSync(artifactPath);
  if (current.size !== artifact.size || current.mtimeMs !== artifact.mtimeMs) throw new Error(`The smoke executable changed during the test: ${exe}`);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, ...coverageArgs, ...(reusePortable ? ['--reuse-portable'] : [])]);
}

function testRecordingRecovery(label, ...captureArgs) {
  console.log(`Checking ${label} across a forced exit and two restarts.`);
  for (const phase of ['write', 'restore', 'verify']) {
    testDesktop(`--recording-recovery-crash-${phase}`, ...captureArgs);
  }
  console.log(`PASS: ${label} recovered through the real renderer and reopened cleanly.`);
}
if (persistence) {
  testDesktop('--indexeddb-write');
  testDesktop('--indexeddb-read');
  console.log('PASS: packaged IndexedDB sentinel persisted across a full executable restart.');
} else if (recovery) {
  testDesktop('--project-recovery-write');
  testDesktop('--project-recovery-restore');
  testDesktop('--project-recovery-verify');
  console.log('PASS: packaged project recovery restored through the real renderer and survived a second executable restart.');
} else if (crashRecovery) {
  testDesktop('--project-recovery-crash-write');
  testDesktop('--project-recovery-crash-restore');
  testDesktop('--project-recovery-crash-verify');
  console.log('PASS: an app-written recovery snapshot survived a forced packaged-app exit, restored through the real renderer, and reopened cleanly.');
} else if (midiRecordingCrashRecovery || recordingCrashRecovery || masterRecordingCrashRecovery || recordingMatrix) {
  if (midiRecordingCrashRecovery || recordingMatrix) {
    testRecordingRecovery('Song MIDI', '--midi-capture-song');
    testRecordingRecovery('Pattern MIDI', '--midi-capture-pattern');
  }
  if (recordingCrashRecovery || recordingMatrix) testRecordingRecovery('Armed audio');
  if (masterRecordingCrashRecovery || recordingMatrix) testRecordingRecovery('Master output', '--master-capture');
} else {
  testDesktop();
}
