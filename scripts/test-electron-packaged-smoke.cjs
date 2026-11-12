'use strict';

// Builds a Windows app beneath .tmp and exercises the actual executable. `--portable` additionally
// checks the self-extracting wrapper; its test has a longer bounded start budget for extraction.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const persistence = process.argv.includes('--persistence');
const recovery = process.argv.includes('--recovery');
const crashRecovery = process.argv.includes('--crash-recovery');
const recordingCrashRecovery = process.argv.includes('--recording-crash-recovery');
const masterRecordingCrashRecovery = process.argv.includes('--master-recording-crash-recovery');
const target = process.argv[2] === '--portable' ? 'portable' : 'dir';
const coverageModes = [persistence, recovery, crashRecovery, recordingCrashRecovery, masterRecordingCrashRecovery];
if (coverageModes.filter(Boolean).length > 1) throw new Error('Choose one packaged persistence or recovery coverage mode.');
if (coverageModes.some(Boolean) && target === 'portable') throw new Error('The portable wrapper does not propagate the test debugger. Use unpacked packaged persistence/recovery coverage.');
const output = target === 'portable' ? '.tmp/desktop-portable' : '.tmp/desktop-package';
const exe = target === 'portable' ? path.join(output, 'Unbox-Studio.exe') : path.join(output, 'win-unpacked', 'Unbox Studio.exe');
const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Packaged desktop smoke failed: ${command} ${args.join(' ')}`);
}

run(process.execPath, [electronBuilderCli, '--win', target, `--config.directories.output=${output}`]);
if (persistence) {
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--indexeddb-write']);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--indexeddb-read']);
  console.log('PASS: packaged IndexedDB sentinel persisted across a full executable restart.');
} else if (recovery) {
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-write']);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-restore']);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-verify']);
  console.log('PASS: packaged project recovery restored through the real renderer and survived a second executable restart.');
} else if (crashRecovery) {
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-crash-write']);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-crash-restore']);
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, '--project-recovery-crash-verify']);
  console.log('PASS: an app-written recovery snapshot survived a forced packaged-app exit, restored through the real renderer, and reopened cleanly.');
} else if (recordingCrashRecovery || masterRecordingCrashRecovery) {
  const masterArgs = masterRecordingCrashRecovery ? ['--master-capture'] : [];
  for (const phase of ['write', 'restore', 'verify']) {
    run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe, `--recording-recovery-crash-${phase}`, ...masterArgs]);
  }
  const captureLabel = masterRecordingCrashRecovery ? 'a master-output take' : 'an armed audio take';
  console.log(`PASS: ${captureLabel} survived a forced packaged-app exit, recovered through the real renderer, and reopened cleanly.`);
} else {
  run(process.execPath, ['scripts/test-electron-desktop-smoke.cjs', exe]);
}
