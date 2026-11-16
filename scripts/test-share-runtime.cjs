/** Runs the compiled share web/API bundle in local Chrome; does not launch Electron or plugins. */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWelcomeProject } = require('./electron-welcome-fixture.cjs');

// Mirror shared/instruments/catalogTypes.ts `isRedistributable`; this CommonJS probe cannot import TS directly.
const CLEARED_LICENSE = /^(CC0-1\.0|CC-BY-(1\.0|2\.0|2\.5|3\.0|4\.0))$/i;
function clearedPacks(root) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/instruments/index.json'), 'utf8'));
  if (!raw || !Array.isArray(raw.packs)) throw new Error('Public instrument index has no packs array');
  return raw.packs.filter((pack) => typeof pack?.spdx === 'string' && CLEARED_LICENSE.test(pack.spdx.trim()));
}

function run(root, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Share runtime fixture build failed: node ${args.join(' ')}`);
}

/**
 * A normal `npm run build` deliberately writes the full local catalog to dist/.  Build the
 * distributable fixture in .tmp first so this test cannot accidentally certify that normal
 * build (or overwrite it while someone is running the desktop app).
 */
function prepareShareFixture(root) {
  const scratch = path.join(root, '.tmp', 'share-runtime');
  const dist = path.join(scratch, 'dist');
  const api = path.join(scratch, 'api-server.cjs');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(api, { force: true });
  run(root, ['scripts/local-temp.mjs', 'vite', 'build', '--mode', 'share', '--outDir', dist]);
  run(root, ['scripts/local-temp.mjs', 'tsx', 'scripts/prune-share-build.ts', dist]);
  run(root, ['scripts/local-temp.mjs', 'tsx', 'scripts/build-api.ts', '--share', '--out', api]);
  return { dist, api };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  // Explicit paths remain useful when validating an already-packaged share artifact. The default
  // command must be hermetic, since dist/ commonly contains a full local build.
  const prepared = process.argv.length <= 2 ? prepareShareFixture(root) : null;
  const dist = path.resolve(prepared?.dist ?? process.argv[2] ?? 'dist');
  const api = path.resolve(prepared?.api ?? process.argv[3] ?? 'electron/api-server.cjs');
  assert(fs.existsSync(path.join(dist, 'index.html')), 'Build the share web app first');
  assert(fs.existsSync(api), 'Build the share API first');
  const { chromium } = require(require.resolve('playwright-core', { paths: [root, path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')] }));
  const { startDesktopServer } = require(api);
  const scratch = path.join(root, '.tmp', 'share-runtime');
  fs.mkdirSync(scratch, { recursive: true });
  const port = await startDesktopServer({ distDir: dist, baseDir: root, envFiles: [], bundleDir: path.join(scratch, 'empty-library'), manifestPath: path.join(scratch, 'absent-manifest.json') });
  const origin = `http://127.0.0.1:${port}`;
  const privateRoute = await fetch(`${origin}/api/stems/list`);
  assert.equal(privateRoute.status, 404, 'Share API exposed the private stems route');
  const index = await (await fetch(`${origin}/instruments/index.json`)).json();
  const expected = clearedPacks(root);
  assert(Array.isArray(index.packs), 'Share runtime returned an invalid instrument index');
  assert.equal(index.packs.length, expected.length, `Share runtime served ${index.packs.length} packs; expected ${expected.length} cleared packs`);
  assert.deepEqual(index.packs.map((pack) => pack.id).sort(), expected.map((pack) => pack.id).sort(), 'Share runtime pack set differs from the cleared catalog');
  assert(index.packs.every((pack) => CLEARED_LICENSE.test(pack.spdx.trim())), 'Share runtime served private packs');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
    const errors = [];
    const forbiddenRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/chamkila|tumbi-folk|dholak-folk|\/stems\//i.test(request.url())) forbiddenRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: 'load', timeout: 60_000 });
    await createWelcomeProject(page);
    await page.getByTestId('tab-rack').click();
    const browserPanel = page.getByTestId('browser');
    if (!(await browserPanel.count())) await page.getByRole('button', { name: 'Browser', exact: true }).click();
    await browserPanel.waitFor({ state: 'visible' });
    // Browser's old labels/classes changed with the unified browser. These test IDs express the
    // stable user flow: open the rack browser, choose Instruments, search, and mount the result.
    await browserPanel.getByTestId('bw-tab-instruments').click();
    const search = browserPanel.getByTestId('bw-search');
    await search.fill('Chamkila');
    assert.equal(await browserPanel.getByTestId('bw-row').count(), 0, 'Private catalog rows appear in the share app');
    await search.fill('VCSL Marimba');
    const row = browserPanel.getByTestId('bw-row').filter({ hasText: 'VCSL Marimba' }).first();
    await row.waitFor({ state: 'visible' });
    const before = await page.locator('[data-unit-id]').count();
    await row.getByTestId('bw-main-action').click();
    await page.waitForFunction((count) => document.querySelectorAll('[data-unit-id]').length > count, before);
    await page.locator('[data-unit-id]').filter({ hasText: 'VCSL Marimba' }).first().waitFor({ state: 'visible' });
    const peak = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\/assets\/app-audio-engine-[^/]+\.js$/.test(new URL(name).pathname));
      if (!url) throw new Error('The compiled audio-engine module was not loaded');
      const module = await import(url);
      const engine = Object.values(module).find((value) => value && typeof value === 'object' && value.devices instanceof Map && typeof value.masterLevels === 'function');
      if (!engine) throw new Error('The compiled app did not expose its existing engine instance');
      const instrument = [...engine.devices.values()].find((device) => device.type === 'rec_vcsl_marimba');
      if (!instrument) throw new Error('The compiled app did not mount the recorded marimba');
      await instrument.ready?.();
      await engine.resumeContext();
      const time = engine.ctx.currentTime + 0.01;
      instrument.noteOn(60, 0.85, time);
      instrument.noteOff(60, time + 0.4);
      let measured = 0;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        const levels = engine.masterLevels();
        measured = Math.max(measured, levels.peakL, levels.peakR);
      }
      return measured;
    });
    assert(peak > 1e-5, `Compiled marimba produced no master output (${peak})`);
    assert.deepEqual(errors, [], 'Compiled share app raised JavaScript errors');
    assert.deepEqual(forbiddenRequests, [], 'Compiled share app requested private audio');
    await page.screenshot({ path: path.join(scratch, 'compiled-share-rack.png'), fullPage: true });
    console.log(`PASS · Compiled share app boots, serves ${expected.length} cleared packs, hides private catalog rows, plays recorded marimba at ${peak.toFixed(5)} master peak, requests no private audio, and returns 404 for the private stems API.`);
  } finally { await browser.close(); }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
