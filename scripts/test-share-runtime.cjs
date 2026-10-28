/** Runs the compiled share web/API bundle in local Chrome; does not launch Electron or plugins. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const api = path.resolve(process.argv[3] ?? 'electron/api-server.cjs');
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
  assert.equal(index.packs.length, 42, 'Share runtime did not serve all 42 cleared packs');
  assert(index.packs.every((pack) => pack.spdx !== 'Custom'), 'Share runtime served private packs');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
    const errors = [];
    const forbiddenRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/chamkila|tumbi-folk|dholak-folk|\/stems\//i.test(request.url())) forbiddenRequests.push(request.url()); });
    await page.goto(origin, { waitUntil: 'load', timeout: 60_000 });
    await page.getByTestId('tab-rack').click();
    if (!(await page.getByRole('button', { name: 'Built-in devices', exact: true }).count())) await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Built-in devices', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Search' });
    await search.fill('Chamkila');
    assert.equal(await page.locator('.lib-row').count(), 0, 'Private catalog rows appear in the share app');
    await search.fill('VCSL Marimba');
    const row = page.locator('.lib-row').filter({ hasText: 'VCSL Marimba' }).first();
    await row.waitFor({ state: 'visible' });
    const before = await page.locator('[data-unit-id]').count();
    await row.getByRole('button', { name: 'Add', exact: true }).click();
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
    console.log(`PASS · Compiled share app boots, serves 42 cleared packs, hides private catalog rows, plays recorded marimba at ${peak.toFixed(5)} master peak, requests no private audio, and returns 404 for the private stems API.`);
  } finally { await browser.close(); }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
