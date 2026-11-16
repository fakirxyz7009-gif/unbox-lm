import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { renderVst3Clip, VST3_CLIP_DELAY_FRAMES, VST3_CLIP_MAX_FRAMES, VST3_CLIP_SAMPLE_RATE } from '../electron/vst3ClipProcess.cjs';
import { verifyVst3DelayFixture } from '../electron/vst3ClipFixture.cjs';

const sampleRate = VST3_CLIP_SAMPLE_RATE;
const source = () => ({ sampleRate, channels: [new Float32Array(1), new Float32Array(1)] });

function nodeFixture(t: TestContext, script: string) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'unbox-vst3-fixture-'));
  const pluginPath = path.join(directory, 'fixture.cjs');
  const pidPath = path.join(directory, 'fixture.pid');
  writeFileSync(pluginPath, script);
  t.after(() => {
    if (existsSync(pidPath)) unlinkSync(pidPath);
    unlinkSync(pluginPath);
    rmdirSync(directory);
  });
  return { hostPath: process.execPath, pluginPath, pidPath };
}

test('offline VST3 request validates the source before starting the child', async () => {
  const paths = { hostPath: '', pluginPath: '' };
  await assert.rejects(renderVst3Clip(null, paths), /48 kHz/);
  await assert.rejects(renderVst3Clip({ ...source(), sampleRate: 44_100 }, paths), /48 kHz/);
  await assert.rejects(renderVst3Clip({ sampleRate, channels: [new Float32Array(1)] }, paths), /two Float32/);
  await assert.rejects(renderVst3Clip({ sampleRate, channels: [[0], [0]] }, paths), /two Float32/);
  await assert.rejects(renderVst3Clip({ sampleRate, channels: [new Float32Array(1), new Float32Array(2)] }, paths), /equal, nonempty/);
  const oversized = new Float32Array(VST3_CLIP_MAX_FRAMES + 1);
  await assert.rejects(renderVst3Clip({ sampleRate, channels: [oversized, oversized] }, paths), /at most 30 seconds/);
  await assert.rejects(renderVst3Clip({ sampleRate, channels: [Float32Array.of(NaN), Float32Array.of(0)] }, paths), /non-finite sample/);
  await assert.rejects(renderVst3Clip(source(), paths), /absolute host and plugin paths/);
});

test('offline VST3 rejects invalid native response framing', async (t) => {
  const paths = nodeFixture(t, `
    process.stdout.write(Buffer.alloc(8));
    setInterval(() => {}, 1_000);
  `);
  await assert.rejects(renderVst3Clip(source(), paths), /Invalid response .* block 4294967295 with 0 frames/);
});

test('offline VST3 aborts a host that misses its deadline', async (t) => {
  const paths = nodeFixture(t, `setInterval(() => {}, 1_000);`);
  await assert.rejects(renderVst3Clip(source(), { ...paths, timeoutMs: 100 }), /timed out/);
});

test('offline VST3 cancellation closes the owned process before returning', async (t) => {
  const paths = nodeFixture(t, `
    const path = require('node:path');
    require('node:fs').writeFileSync(path.join(__dirname, 'fixture.pid'), String(process.pid));
    setInterval(() => {}, 1_000);
  `);
  const controller = new AbortController();
  const cancelled = assert.rejects(renderVst3Clip(source(), { ...paths, signal: controller.signal }), /was cancelled/);
  try {
    const deadline = Date.now() + 10_000;
    while (!existsSync(paths.pidPath) && Date.now() < deadline) await wait(20);
    assert.ok(existsSync(paths.pidPath), 'The test host did not start.');
  } finally {
    controller.abort();
    await cancelled;
  }
  const pid = Number(readFileSync(paths.pidPath, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

const buildRoot = path.resolve(import.meta.dirname, '../third_party/unbox-vst3-host-smoke-build');
const hostPath = path.join(buildRoot, 'unbox-vst3-process-stream-host.exe');
const pluginPath = path.join(buildRoot, 'VST3', 'Release', 'unbox-test-delay.vst3');
const pluginBinary = path.join(pluginPath, 'Contents', 'x86_64-win', 'unbox-test-delay.vst3');
const manifest = path.join(buildRoot, 'unbox-test-delay-artifacts.json');
const realFixtureAvailable = process.platform === 'win32' && process.arch === 'x64' &&
  [hostPath, pluginBinary, manifest].every(existsSync);

test('project-owned native VST3 delays each stereo channel by exactly 48,000 frames', {
  skip: realFixtureAvailable ? false : 'Build the Windows x64 project-owned host and delay with scripts/vst3/smoke.ps1.',
}, async () => {
  const fixture = verifyVst3DelayFixture(buildRoot);
  const left = new Float32Array(131);
  const right = new Float32Array(131);
  left[0] = 0.75;
  left[127] = 0.125;
  right[6] = -0.5;
  right[130] = 0.25;
  const rendered = await renderVst3Clip({ sampleRate, channels: [left, right] }, fixture);
  assert.equal(rendered.sampleRate, sampleRate);
  for (const [channel, input] of [left, right].entries()) {
    const output = rendered.channels[channel];
    assert.equal(output.length, input.length + VST3_CLIP_DELAY_FRAMES);
    assert.equal(output.subarray(0, VST3_CLIP_DELAY_FRAMES).some((value) => value !== 0), false);
    assert.deepEqual(output.subarray(VST3_CLIP_DELAY_FRAMES), input);
  }
});
