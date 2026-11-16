import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyVst3DelayFixture } from '../electron/vst3ClipFixture.cjs';

test('the offline VST3 window admits only the validated project-owned host and delay', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'unbox-vst3-fixture-'));
  const root = realpathSync.native(directory);
  t.after(() => {
    const relative = path.relative(realpathSync.native(tmpdir()), realpathSync.native(root));
    assert.match(relative, /^unbox-vst3-fixture-[a-zA-Z0-9]+$/);
    rmSync(root, { recursive: true, force: true });
  });
  const hostPath = path.join(root, 'unbox-vst3-process-stream-host.exe');
  const pluginPath = path.join(root, 'VST3', 'Release', 'unbox-test-delay.vst3');
  const modulePath = path.join(pluginPath, 'Contents', 'x86_64-win', 'unbox-test-delay.vst3');
  const manifestPath = path.join(root, 'unbox-test-delay-artifacts.json');
  const host = 'host fixture';
  const plugin = 'plugin fixture';
  const hash = (input: string) => createHash('sha256').update(input).digest('hex');

  assert.throws(() => verifyVst3DelayFixture(root), { code: 'ENOENT' });
  mkdirSync(path.dirname(modulePath), { recursive: true });
  writeFileSync(hostPath, host);
  writeFileSync(modulePath, plugin);
  writeFileSync(manifestPath, JSON.stringify({ version: 2, hostSha256: hash(host), pluginSha256: hash(plugin) }));
  assert.throws(() => verifyVst3DelayFixture(root), /manifest is invalid/);

  writeFileSync(manifestPath, JSON.stringify({ version: 1, hostSha256: hash(host), pluginSha256: hash(plugin) }));
  assert.deepEqual(verifyVst3DelayFixture(root), { hostPath, pluginPath });
  writeFileSync(modulePath, `${plugin} changed`);
  assert.throws(() => verifyVst3DelayFixture(root), /does not match its validated build/);
  writeFileSync(modulePath, plugin);
  writeFileSync(hostPath, `${host} changed`);
  assert.throws(() => verifyVst3DelayFixture(root), /does not match its validated build/);
});
