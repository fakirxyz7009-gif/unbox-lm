'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { findAudioRuntime } = require('../electron-recording-recovery.cjs');
const { createWelcomeProject } = require('../electron-welcome-fixture.cjs');
const { makeElectronProbeArgs } = require('./electronProbeArgs.cjs');

const root = path.resolve(__dirname, '..', '..');
const sampleRate = 48_000;
const sourceFrames = 12_289;
const sourceName = 'VST3 test stereo impulse';
const renderedName = `${sourceName} (VST3 delay)`;
const startBar = 1;
const impulses = [
  [[0, 0.5], [127, -0.125], [128, 0.25], [sourceFrames - 1, -0.375]],
  [[1, -0.25], [129, 0.0625], [4097, -0.5], [sourceFrames - 2, 0.125]],
];
const sourceProvenance = {
  origin: 'app-render', rights: 'owned', source: 'Project-owned asymmetric stereo test signal',
  attribution: 'Unbox Studio test fixture', license: 'Project-owned fixture', declaredAt: '2025-01-01T00:00:00.000Z',
};

async function findPrivatePorts() {
  const listeners = [];
  try {
    while (listeners.length < 2) {
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      listeners.push(server);
      assert.ok(server.address().port >= 49_152, 'Require an ephemeral high port away from the packaged smoke matrix.');
    }
    return listeners.map((server) => server.address().port);
  } finally {
    await Promise.all(listeners.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

async function until(label, inspect, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await inspect();
    if (result) return result;
    await wait(150);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}.`);
}

async function runStudio({ chromium, electronExe, userdata, marker, origin, debugPort }, enableDelay, check) {
  fs.rmSync(marker, { force: true });
  const entry = path.join(root, 'electron', 'main.cjs');
  const args = makeElectronProbeArgs(userdata, entry);
  args.splice(-1, 0, `--remote-debugging-port=${debugPort}`, ...(enableDelay ? ['--vst3-test-delay'] : []));
  const child = spawn(electronExe, args, {
    cwd: root,
    env: { ...process.env, UNBOX_DESKTOP_SMOKE_URL_FILE: marker, UNBOX_DESKTOP_SMOKE_RENDERER_FILE: '' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  let launchError;
  child.once('error', (error) => { launchError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk).slice(-16_384); });
  let browser;
  let page;
  try {
    await until('Electron’s storage and URL handshake', () => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Electron exited early with status ${child.exitCode}.`);
      if (!fs.existsSync(marker)) return false;
      const actual = fs.readFileSync(marker, 'utf8').trim();
      assert.equal(actual, origin, 'The source app must open the seeded disposable origin.');
      return true;
    }, 45_000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: 10_000 });
    page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url() === origin);
    assert.ok(page, 'The debugger must contain the test-owned origin.');
    await page.getByTestId('title-bar').waitFor({ state: 'visible', timeout: 15_000 });
    return await check(page);
  } catch (error) {
    throw new Error(`${error.message}${logs ? `\nElectron logs:\n${logs}` : ''}`, { cause: error });
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await until('the test Electron process to close', () => child.exitCode !== null || child.signalCode !== null, 6_000).catch(() => {
        // Cleanup is scoped to the source Electron process spawned above.
        spawnSync('taskkill.exe', ['/t', '/f', '/pid', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
      });
    }
  }
}

async function readProject(page, sourceId, renderedId) {
  return page.evaluate(async ({ sourceId, renderedId }) => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('unbox-studio');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const lastProject = await read('settings', 'lastProjectId');
      const project = lastProject?.value && await read('projects', lastProject.value);
      if (!project?.audioIds?.includes(sourceId) || !project?.audioIds?.includes(renderedId)) return null;
      const [source, rendered] = await Promise.all([read('audio', sourceId), read('audio', renderedId)]);
      return source && rendered ? { id: project.id, tracks: JSON.parse(project.json).tracks, source, rendered } : null;
    } finally {
      db.close();
    }
  }, { sourceId, renderedId });
}

async function readLive(page, sourceId, renderedId) {
  return page.evaluate(({ sourceId, renderedId }) => {
    const { engine, audioStore } = window.recordingSmokeRuntime;
    const asset = (id) => {
      const row = audioStore.get(id);
      if (!row) return null;
      const { buffer, provenance, sourceBpm, detectedBpm, key } = row;
      return {
        channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel).slice()),
        sampleRate: buffer.sampleRate, length: buffer.length, provenance, sourceBpm, detectedBpm, key,
      };
    };
    const source = asset(sourceId);
    const rendered = asset(renderedId);
    return source && rendered ? { tracks: engine.tracks.map(({ id, name, mute, arrangementClips }) => ({ id, name, mute, arrangementClips })), source, rendered } : null;
  }, { sourceId, renderedId });
}

function verifyAudio({ source, rendered }) {
  const verifySamples = (asset, delayFrames) => {
    assert.equal(asset.sampleRate, sampleRate);
    assert.equal(asset.length, sourceFrames + delayFrames);
    assert.equal(asset.channels.length, 2);
    for (const [channel, buffer] of asset.channels.entries()) {
      // Playwright serializes a browser ArrayBuffer as an empty object, so reads
      // crossing the page boundary always return Float32Array views.
      const samples = new Float32Array(buffer);
      assert.equal(samples.length, asset.length);
      const expected = new Float32Array(asset.length);
      for (const [frame, value] of impulses[channel]) expected[frame + delayFrames] = value;
      const errorFrame = samples.findIndex((value, frame) => value !== expected[frame]);
      assert.equal(errorFrame, -1, `Channel ${channel}, frame ${errorFrame}: expected ${expected[errorFrame]}, received ${samples[errorFrame]}.`);
    }
  };
  verifySamples(source, 0);
  verifySamples(rendered, sampleRate);
  assert.deepEqual(source.provenance, sourceProvenance);
  assert.equal(rendered.provenance.origin, 'derived');
  assert.equal(rendered.provenance.rights, sourceProvenance.rights);
  assert.equal(rendered.provenance.license, sourceProvenance.license);
  assert.equal(rendered.provenance.attribution, sourceProvenance.attribution);
  assert.ok(rendered.provenance.source.includes(sourceProvenance.source), 'A derivative must retain its original source in the label.');
  assert.match(rendered.provenance.source, /Unbox Test Delay|VST3 delay/i);
  assert.equal(rendered.sourceBpm, source.sourceBpm);
  assert.equal(rendered.detectedBpm, source.detectedBpm);
  assert.equal(rendered.key, source.key);
}

function verifyClips(state, { sourceId, renderedId, sourceTrackId, sourceClipId }) {
  const sourceTrack = state.tracks.find((row) => row.id === sourceTrackId);
  const original = sourceTrack?.arrangementClips?.find((clip) => clip.id === sourceClipId);
  const copyTrack = state.tracks.find((row) => row.id !== sourceTrackId && row.name === renderedName);
  const copy = copyTrack?.arrangementClips?.find((clip) => clip.audioId === renderedId);
  assert.equal(original?.audioId, sourceId, 'The original clip must keep its source asset.');
  assert.equal(original.startBar, startBar);
  assert.ok(copy, 'The rendered clip must exist on its own audio track.');
  assert.equal(copyTrack.mute, true, 'The copied track should not alter the mix until it is unmuted.');
  assert.equal(copy.warp, 'off', 'The fixed fixture delay should retain its rendered timing.');
  assert.equal(copy.startBar, startBar);
  assert.ok(copy.lengthBars > original.lengthBars, 'The copy must have space for the full delayed tail.');
  assert.equal(copy.audioOffset ?? 0, 0);
}

async function renderAndSave(page) {
  assert.equal(await page.evaluate(() => typeof window.unboxVst3Clip?.renderDelay), 'function',
    'The source launch must expose the opt-in fixture bridge. Build the two project-owned VST3 fixtures with scripts/vst3/smoke.ps1 first.');
  await assert.rejects(page.evaluate(() => window.unboxVst3Clip.renderDelay({
    sampleRate: 44_100, channels: [new Float32Array(1), new Float32Array(1)],
  })), /48 kHz/);
  await createWelcomeProject(page);
  await findAudioRuntime(page);
  const source = await page.evaluate(({ sourceName, sourceFrames, sampleRate, impulses, sourceProvenance, startBar }) => {
    const { engine, audioStore } = window.recordingSmokeRuntime;
    const buffer = engine.ctx.createBuffer(2, sourceFrames, sampleRate);
    for (const [channel, points] of impulses.entries()) {
      const samples = buffer.getChannelData(channel);
      for (const [frame, value] of points) samples[frame] = value;
    }
    const asset = audioStore.add(sourceName, buffer, { sourceBpm: 103, detectedBpm: 117, key: 'C major', provenance: sourceProvenance });
    const clip = engine.addAudioClip(asset.id, startBar);
    return { sourceId: asset.id, sourceTrackId: clip.trackId, sourceClipId: clip.clipId };
  }, { sourceName, sourceFrames, sampleRate, impulses, sourceProvenance, startBar });
  const clip = page.getByTestId('arr-clip').filter({ hasText: sourceName });
  await clip.waitFor({ state: 'visible', timeout: 15_000 });
  await clip.dispatchEvent('dblclick', { bubbles: true });
  const action = page.getByTestId('audio-clip-panel').getByTestId('vst3-render-delay').getByRole('button');
  await action.waitFor({ state: 'visible', timeout: 15_000 });
  await action.evaluate((button) => {
    if (button.disabled) throw new Error(button.title || 'The VST3 fixture did not accept the test clip.');
    button.click();
  });
  const renderedId = await until('the rendered clip and its new asset', () => page.evaluate(({ renderedName }) => {
    const { engine } = window.recordingSmokeRuntime;
    return engine.tracks.find((track) => track.name === renderedName)?.arrangementClips?.[0]?.audioId;
  }, { renderedName }), 35_000);
  assert.notEqual(renderedId, source.sourceId);
  const target = { ...source, renderedId };
  const live = await readLive(page, source.sourceId, renderedId);
  assert.ok(live);
  verifyAudio(live);
  verifyClips(live, target);
  await page.getByTestId('save-state').evaluate((button) => button.click());
  const saved = await until('the save to contain both audio assets', () => readProject(page, source.sourceId, renderedId));
  verifyClips(saved, target);
  assert.deepEqual(saved.source.provenance, sourceProvenance);
  assert.deepEqual(saved.rendered.provenance, live.rendered.provenance);
  return { ...target, projectId: saved.id };
}

async function verifyReopen(page, target) {
  assert.equal(await page.evaluate(() => window.unboxVst3Clip), undefined, 'The normal source launch must omit the fixture bridge.');
  await findAudioRuntime(page);
  const live = await until('the reopened project’s decoded original and delay copy', () => readLive(page, target.sourceId, target.renderedId));
  verifyAudio(live);
  verifyClips(live, target);
  const saved = await readProject(page, target.sourceId, target.renderedId);
  assert.equal(saved.id, target.projectId);
  verifyClips(saved, target);
}

async function main() {
  assert.equal(process.platform, 'win32', 'The project-owned process-stream fixture currently targets Windows x64.');
  assert.equal(process.arch, 'x64');
  assert.ok(fs.existsSync(path.join(root, 'dist', 'index.html')), 'Run npm run build and npm run build:api first.');
  const electronExe = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
  assert.ok(fs.existsSync(electronExe), 'Install the project Electron binary with node node_modules/electron/install.js.');
  const { chromium } = require(require.resolve('playwright-core', { paths: [
    root, path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
  ] }));
  const [appPort, debugPort] = await findPrivatePorts();
  const scratch = path.join(root, '.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const profile = fs.mkdtempSync(path.join(scratch, 'electron-vst3-clip-probe-'));
  const userdata = path.join(profile, 'userdata');
  fs.mkdirSync(userdata);
  fs.writeFileSync(path.join(userdata, 'loopback-origin-port'), `${appPort}\n`);
  const config = { chromium, electronExe, userdata, marker: path.join(profile, 'app-url.txt'), origin: `http://127.0.0.1:${appPort}/`, debugPort };
  try {
    const target = await runStudio(config, true, renderAndSave);
    await runStudio(config, false, (page) => verifyReopen(page, target));
    console.log(`PASS: native VST3 delayed all ${sourceFrames} stereo input frames by exactly ${sampleRate} frames. Both clips and provenance survived a full Electron restart with the fixture disabled.`);
  } finally {
    const resolved = fs.realpathSync(profile);
    const relative = path.relative(fs.realpathSync(scratch), resolved);
    assert.match(relative, /^electron-vst3-clip-probe-[a-zA-Z0-9]+$/, 'Remove only the disposable profile allocated by this probe.');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
