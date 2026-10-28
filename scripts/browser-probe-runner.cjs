const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { createServer } = require('vite');
const { chromium } = require('playwright-core');

const probes = new Set(['multisample-engine', 'midi-recording', 'midi-bootstrap', 'midi-ui-recording', 'physical-midi-ui-recording', 'physical-midi-recording', 'recorded-pack', 'ocarina-pack', 'button-accordion-pack', 'electric-pianos-pack', 'freepats-clarinet-pack', 'freepats-harp-pack', 'freepats-bass-pack', 'freepats-recorder-pack', 'freepats-bagpipe-pack', 'shinyguitar-pack', 'ganjo-pack', 'vcsl-pipe-organ-pack', 'vcsl-marimba-pack', 'note-audio-editing', 'undo-chain', 'vsco-cello-articulations-pack', 'live-offline-audio-parity', 'mod-wheel-layer', 'lfo-wave-switch', 'vocoder-attack', 'pitch-correction', 'sf2-import', 'device-audio-smoke', 'effect-bypass', 'effect-response', 'dynamics-sidechain', 'device-soak', 'project-roundtrip', 'project-recovery', 'export-roundtrip', 'export-page-ui', 'rack-ui-workflow']);
const probe = process.argv[2] ?? 'multisample-engine';
if (!probes.has(probe)) throw new Error(`Unknown browser probe: ${probe}`);

const root = path.resolve(__dirname, '..');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const headed = process.argv.includes('--headed');

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a browser-probe port.'));
      listener.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function makeSf2Fixture(sampleMode = 3, exclusiveClass = 4, scaleTuning = 50) {
  const name = (value, length) => {
    const out = Buffer.alloc(length);
    out.write(value.slice(0, length), 'ascii');
    return out;
  };
  const word = (value) => {
    const out = Buffer.alloc(2);
    out.writeUInt16LE(value & 0xffff);
    return out;
  };
  const dword = (value) => {
    const out = Buffer.alloc(4);
    out.writeUInt32LE(value >>> 0);
    return out;
  };
  const chunk = (id, data) => Buffer.concat([Buffer.from(id, 'ascii'), dword(data.length), data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  const list = (type, parts) => chunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), ...parts]));
  const bag = (gen) => Buffer.concat([word(gen), word(0)]);
  const generator = (op, amount) => Buffer.concat([word(op), word(amount)]);
  const rangeGenerator = (op, low, high) => generator(op, low | high << 8);
  const presetHeader = (label, program, bank, bagIndex) => Buffer.concat([
    name(label, 20), word(program), word(bank), word(bagIndex), dword(0), dword(0), dword(0),
  ]);
  const instrumentHeader = (label, bagIndex) => Buffer.concat([name(label, 20), word(bagIndex)]);
  const sampleHeader = (label, start, end, loopStart, loopEnd, rate, root, correction, link, type) => {
    const out = Buffer.alloc(46);
    name(label, 20).copy(out, 0);
    [start, end, loopStart, loopEnd, rate].forEach((value, index) => out.writeUInt32LE(value, 20 + index * 4));
    out.writeUInt8(root, 40);
    out.writeInt8(correction, 41);
    out.writeUInt16LE(link, 42);
    out.writeUInt16LE(type, 44);
    return out;
  };

  const frames = 4096;
  const pcm = Buffer.alloc(frames * 2 * 2);
  for (let i = 0; i < frames; i++) {
    const left = Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 15_000);
    const right = Math.round(Math.sin((2 * Math.PI * 660 * i) / 44100) * 15_000);
    pcm.writeInt16LE(left, i * 2);
    pcm.writeInt16LE(right, (frames + i) * 2);
  }
  const pdta = [
    chunk('phdr', Buffer.concat([presetHeader('Test Piano', 7, 2, 0), presetHeader('EOP', 0, 0, 1)])),
    chunk('pbag', Buffer.concat([bag(0), bag(1)])),
    chunk('pmod', Buffer.alloc(10)),
    chunk('pgen', Buffer.concat([generator(41, 0), generator(60, 0)])),
    chunk('inst', Buffer.concat([instrumentHeader('Piano Instrument', 0), instrumentHeader('EOI', 1)])),
    chunk('ibag', Buffer.concat([bag(0), bag(19)])),
    chunk('imod', Buffer.alloc(10)),
    chunk('igen', Buffer.concat([
      rangeGenerator(43, 48, 72), rangeGenerator(44, 10, 100), generator(8, 12000), generator(54, sampleMode),
      generator(58, 62), generator(51, 1), generator(52, 5), generator(33, -12000),
      generator(34, -12000), generator(35, -12000), generator(36, 0), generator(37, 200),
      generator(38, -2400), generator(39, 100), generator(40, -50), generator(48, 60), generator(56, scaleTuning), generator(57, exclusiveClass), generator(53, 0), generator(60, 0),
    ])),
    chunk('shdr', Buffer.concat([
      sampleHeader('Piano C4 L', 0, frames, 128, 512, 44100, 60, -4, 1, 4),
      sampleHeader('Piano C4 R', frames, frames * 2, frames + 128, frames + 512, 44100, 60, -4, 0, 2),
      sampleHeader('EOS', frames * 2, frames * 2, frames * 2, frames * 2, 0, 0, 0, 0, 0),
    ])),
  ];
  const body = Buffer.concat([Buffer.from('sfbk', 'ascii'), list('sdta', [chunk('smpl', pcm)]), list('pdta', pdta)]);
  return chunk('RIFF', body);
}

async function main() {
  const physicalMidiProbe = probe === 'physical-midi-recording' || probe === 'physical-midi-ui-recording';
  const configuredMidiPort = Number(process.env.UNBOX_MIDI_PROBE_PORT ?? 47771);
  if (physicalMidiProbe && (!Number.isInteger(configuredMidiPort) || configuredMidiPort < 1024 || configuredMidiPort > 65535)) {
    throw new Error('UNBOX_MIDI_PROBE_PORT must be an available TCP port between 1024 and 65535.');
  }
  // Chrome scopes MIDI permission to an origin; a stable port avoids a new prompt on every run.
  const port = physicalMidiProbe ? configuredMidiPort : await availablePort();
  const artifacts = new Map();
  const server = await createServer({
    configFile: false,
    plugins: probe === 'note-audio-editing' ? [(await import('@tailwindcss/vite')).default()] : [],
    root,
    appType: 'mpa',
    resolve: { alias: { '@': path.join(root, 'src') } },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] },
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
  });
  if (probe === 'export-roundtrip') {
    const artifactMiddleware = (req, res, next) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (!url.pathname.startsWith('/__probe-artifacts/')) return next();
      const name = url.pathname.slice('/__probe-artifacts/'.length);
      if (req.method !== 'POST' || !/^[a-z0-9-]{1,64}$/i.test(name)) {
        res.writeHead(400).end('Invalid export artifact request');
        return;
      }
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) {
          res.writeHead(413).end('Export artifact exceeds 32 MiB');
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        artifacts.set(name, Buffer.concat(chunks));
        res.writeHead(204).end();
      });
      return undefined;
    };
    const fallbackIndex = server.middlewares.stack.findIndex((layer) => layer.handle.name === 'viteHtmlFallbackMiddleware');
    if (fallbackIndex < 0) throw new Error('Could not locate Vite fallback to install the isolated artifact receiver');
    server.middlewares.stack.splice(fallbackIndex, 0, { route: '', handle: artifactMiddleware });
  }
  let browser;
  let context;
  try {
    await server.listen();
    const launchOptions = {
      headless: !headed,
      executablePath: chrome,
      args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(headed ? ['--start-maximized'] : [])],
    };
    if (physicalMidiProbe && headed) {
      const userDataDir = path.join(os.tmpdir(), 'unbox-studio-physical-midi-chrome-profile');
      fs.mkdirSync(userDataDir, { recursive: true });
      context = await chromium.launchPersistentContext(userDataDir, launchOptions);
      browser = context.browser();
    } else {
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext();
    }
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error' && message.text().startsWith('PHYSICAL_MIDI_')) {
        console.log(message.text());
      }
      if (message.type() === 'error' && !message.text().includes('404 (Not Found)')) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const url = new URL(response.url());
      if (probe === 'rack-ui-workflow' && response.status() === 404 && url.pathname === '/api/vst/status') return;
      if (url.pathname !== '/favicon.ico') errors.push(`HTTP ${response.status()} ${url.pathname}`);
    });
    page.on('requestfailed', (request) => {
      const failure = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown failure'}`;
      failedRequests.push(failure);
      if (probe === 'physical-midi-recording') console.log(`PHYSICAL_MIDI_REQUEST_FAILED ${failure}`);
    });
    const query = probe === 'physical-midi-ui-recording'
      ? '?physical=1'
      : probe === 'device-soak'
      ? `?seconds=${Number(process.argv[3]) || 600}`
      : probe === 'effect-bypass' && process.argv[3]
        ? `?type=${encodeURIComponent(process.argv[3])}`
        : probe === 'device-audio-smoke'
          ? (() => {
              const args = process.argv.slice(3);
              const type = args.find((arg) => !arg.startsWith('--'));
              const query = new URLSearchParams();
              if (type) query.set('type', type);
              if (args.includes('--warm-before-device')) query.set('warmBefore', '1');
              if (args.includes('--effects-first')) query.set('order', 'effects-first');
              const value = query.toString();
              return value ? `?${value}` : '';
            })()
        : '';
    const origin = `http://127.0.0.1:${port}`;
    // Chrome 155 reports MIDI permission as granted through CDP but still rejects
    // requestMIDIAccess() in headed hardware runs. Let the user grant the real prompt
    // there; headless regressions continue to use the browser context permission.
    if (probe === 'physical-midi-recording' && !headed) {
      await page.context().grantPermissions(['midi'], { origin });
    }
    const pageProbe = probe === 'physical-midi-ui-recording' ? 'midi-ui-recording' : probe;
    await page.goto(probe === 'export-page-ui' || probe === 'rack-ui-workflow' ? origin : `${origin}/tests/browser/${pageProbe}.html${query}`, { waitUntil: 'load', timeout: probe === 'note-audio-editing' ? 60_000 : 30_000 });
    if (probe === 'physical-midi-ui-recording' && headed) {
      await page.evaluate((title) => { document.title = title; }, `Unbox Impulse MIDI Probe ${port}`);
    }
    if (headed) await page.bringToFront();
    if (probe === 'sf2-import') {
      const assert = require('node:assert/strict');
      await page.getByRole('button', { name: 'SoundFont', exact: true }).click();
      const input = page.locator('[data-testid="patch-soundfont"] input[type="file"]');
      await input.setInputFiles({ name: 'Test-Piano.sf2', mimeType: 'application/octet-stream', buffer: makeSf2Fixture() });
      const preset = page.getByTestId('soundfont-preset');
      await preset.waitFor({ state: 'visible', timeout: 15_000 });
      assert.match(await preset.innerText(), /Test Piano[\s\S]*Bank 2 · Program 7 · 1 sample zones/);
      await preset.click();
      await page.waitForFunction(() => !!window.__sf2Probe?.chosenId, null, { timeout: 15_000 });
      const values = await page.evaluate(() => window.__sf2Probe?.exercise());
      if (!values) throw new Error('The SF2 LOAD page did not expose its live audio check');
      const report = await values;
      assert.equal(report.sampleZoneCount, 1);
      assert.equal(report.sampleLoaded, true);
      assert.equal(report.sampleWasPlayed, true);
      assert.equal(report.loop, true);
      assert.equal(report.loopUntilRelease, true);
      assert.equal(report.scaleTuning, 50);
      assert(Math.abs(report.playbackRate - report.expectedPlaybackRate) < 1e-6);
      assert(Math.abs(report.filterCutoffHz - report.expectedFilterCutoffHz) < 0.01);
      assert(Math.abs(report.offlineFilterCutoffHz - report.expectedFilterCutoffHz) < 0.01);
      assert(Math.abs(report.velocityPeakGain - report.expectedVelocityPeakGain) < 1e-6);
      assert(Math.abs(report.offlineVelocityPeakGain - report.expectedVelocityPeakGain) < 1e-6);
      assert.equal(report.roundTripVelocityAttenuation, true);
      assert.equal(report.exclusiveClass, 4);
      assert(Math.abs(report.exclusiveChokeFade - 0.04) < 0.005);
      assert(Math.abs(report.exclusiveTailChokeFade - 0.04) < 0.005);
      assert(Math.abs(report.offlineChokeFade - 0.04) < 0.005);
      assert(Math.abs(report.offlineTailChokeFade - 0.04) < 0.005);
      assert(report.releaseTailOffset >= 128 / 44100);
      assert(report.sustainRms > 0.002);
      assert(report.releaseRms < report.sustainRms * 0.2);
      assert(report.offlineSustainRms > 0.002);
      assert(report.offlineReleaseRms < report.offlineSustainRms * 0.2);
      assert(report.offlineTailRms > 0.002);
        assert(report.offlineLateRms < report.offlineEarlyRms * 0.9);
        assert(report.highKeyEnvelopeRms > report.lowKeyEnvelopeRms * 1.1);
        assert.equal(report.archiveSampleCount, report.sampleZoneCount);
        assert.equal(report.roundTripZoneCount, report.sampleZoneCount);
        assert(report.roundTripRms > 0.002);
      await page.locator('#result').evaluate((element, value) => {
        element.dataset.status = 'passed';
          element.textContent = `PASS · ${value.deviceName}; SF2 class ${value.exclusiveClass} held/tail choke ${value.exclusiveChokeFade.toFixed(3)} / ${value.exclusiveTailChokeFade.toFixed(3)} s live and ${value.offlineChokeFade.toFixed(3)} / ${value.offlineTailChokeFade.toFixed(3)} s offline; loop-release tail offset ${value.releaseTailOffset.toFixed(3)} s / RMS ${value.offlineTailRms.toFixed(4)}; live RMS ${value.sustainRms.toFixed(4)} → ${value.releaseRms.toFixed(4)}, offline RMS ${value.offlineSustainRms.toFixed(4)} → ${value.offlineReleaseRms.toFixed(4)}, envelope RMS ${value.offlineEarlyRms.toFixed(4)} → ${value.offlineLateRms.toFixed(4)}, key 48/72 RMS ${value.lowKeyEnvelopeRms.toFixed(4)} / ${value.highKeyEnvelopeRms.toFixed(4)}, .unbox round-trip RMS ${value.roundTripRms.toFixed(4)}.`;
      }, report);
        console.log(`PASS · LOAD imported ${report.deviceName}; SF2 class ${report.exclusiveClass} held/tail choke ${report.exclusiveChokeFade.toFixed(3)} / ${report.exclusiveTailChokeFade.toFixed(3)} s live and ${report.offlineChokeFade.toFixed(3)} / ${report.offlineTailChokeFade.toFixed(3)} s offline; loop-release tail at ${report.releaseTailOffset.toFixed(3)} s (offline RMS ${report.offlineTailRms.toFixed(4)}); live RMS ${report.sustainRms.toFixed(4)} → ${report.releaseRms.toFixed(4)}, offline RMS ${report.offlineSustainRms.toFixed(4)} → ${report.offlineReleaseRms.toFixed(4)}, envelope RMS ${report.offlineEarlyRms.toFixed(4)} → ${report.offlineLateRms.toFixed(4)}, key 48/72 RMS ${report.lowKeyEnvelopeRms.toFixed(4)} / ${report.highKeyEnvelopeRms.toFixed(4)}, .unbox round-trip RMS ${report.roundTripRms.toFixed(4)}.`);
      console.log(`SF2 scale tuning: ${report.scaleTuning} cents/key; actual rate ${report.playbackRate.toFixed(6)} (expected ${report.expectedPlaybackRate.toFixed(6)}), preserved in .unbox.`);
      console.log(`SF2 velocity-to-filter: ${report.filterCutoffHz.toFixed(2)} Hz live and ${report.offlineFilterCutoffHz.toFixed(2)} Hz offline (expected ${report.expectedFilterCutoffHz.toFixed(2)} Hz).`);
      console.log(`SF2 velocity-to-attenuation: gain ${report.velocityPeakGain.toFixed(6)} live and ${report.offlineVelocityPeakGain.toFixed(6)} offline (expected ${report.expectedVelocityPeakGain.toFixed(6)}), preserved in .unbox.`);
    }
    if (probe === 'export-page-ui') {
      const assert = require('node:assert/strict');
      await page.waitForSelector('[data-testid="main-menu"]', { timeout: 60_000 });
      await page.keyboard.press('Control+Shift+E');
      const exportPage = page.locator('[data-testid="export-page"]');
      await exportPage.waitFor({ state: 'visible', timeout: 10_000 });

      const aac = page.getByRole('button', { name: 'AAC (ADTS)' });
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'AAC (ADTS)');
        return button && !button.disabled;
      }, null, { timeout: 15_000 });
      await aac.click();
      const labeledSelect = (label) => page.locator('label').filter({ hasText: label }).locator('select');
      const sampleRateSelect = labeledSelect('Sample rate');
      const bitrateSelect = labeledSelect('Bitrate');
      assert.equal(await sampleRateSelect.count(), 1, 'AAC sample-rate control is missing or duplicated');
      assert.equal(await bitrateSelect.count(), 1, 'AAC bitrate control is missing or duplicated');

      const readValues = (select) => select.locator('option').evaluateAll((options) => options.map((option) => option.value));
      const expectedRates = [];
      for (const sampleRate of [44100, 48000]) {
        const supported = await page.evaluate(async (rate) => {
          const values = [];
          for (const kbps of [96, 128, 160, 192, 256, 320]) {
            try {
              const result = await AudioEncoder.isConfigSupported({
                codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: 2,
                bitrate: kbps * 1000, aac: { format: 'adts' },
              });
              if (result.supported) values.push(String(kbps));
            } catch { /* The unsupported configuration should not appear in the UI. */ }
          }
          return values;
        }, sampleRate);
        if (!supported.length) {
          assert(!(await readValues(sampleRateSelect)).includes(String(sampleRate)), `Unsupported AAC sample rate ${sampleRate} Hz is visible`);
          continue;
        }
        expectedRates.push(String(sampleRate));
        await sampleRateSelect.selectOption(String(sampleRate));
        assert.deepEqual(await readValues(bitrateSelect), supported, `AAC ${sampleRate} Hz bitrate options do not match WebCodecs`);
        assert(supported.includes(await bitrateSelect.inputValue()), `AAC ${sampleRate} Hz selected an unsupported bitrate`);
      }
      assert.deepEqual(await readValues(sampleRateSelect), expectedRates, 'AAC sample-rate options do not match WebCodecs support');

      await page.getByRole('button', { name: 'WAV (PCM / float)' }).click();
      const bitDepthSelect = labeledSelect('Bit depth');
      assert.deepEqual(await readValues(bitDepthSelect), ['16', '24', '32'], 'WAV bit-depth options are incomplete');
      await page.getByRole('button', { name: 'Stems', exact: true }).click();
      await page.getByRole('button', { name: 'All', exact: true }).click();
      const stemModeSelect = labeledSelect('Stem type');
      assert.equal(await stemModeSelect.count(), 1, 'Stem type control is missing');
      await stemModeSelect.selectOption('dry');
      assert.equal(await stemModeSelect.inputValue(), 'dry', 'Dry stem mode did not apply');

      await page.getByRole('button', { name: 'MIDI file', exact: true }).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export MIDI' }).click();
      const download = await downloadPromise;
      assert(download.suggestedFilename().endsWith('.mid'), 'Export page did not download a MIDI file');
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).subarray(0, 4).toString('ascii'), 'MThd', 'Downloaded MIDI file has no Standard MIDI header');
      await page.getByText(/^Saved .*\.mid$/).waitFor({ state: 'visible', timeout: 10_000 });
      console.log(`PASS · Export page opened with Ctrl+Shift+E; AAC rates/bitrates matched WebCodecs (${expectedRates.join(', ')} Hz); WAV bit depths and dry-stem control applied; UI exported a valid MIDI file (${download.suggestedFilename()}).`);
    }
    if (probe === 'rack-ui-workflow') {
      const assert = require('node:assert/strict');
      const attachEngineProbe = async (includeProjects = true) => {
        const urls = await page.evaluate(() => {
          const modules = performance.getEntriesByType('resource').map((entry) => entry.name);
          const find = (suffix) => modules.find((url) => new URL(url).pathname === suffix);
          return {
            engine: find('/src/audio/AudioEngine.ts'),
            projects: find('/src/project/ProjectManager.ts'),
          };
        });
        if (!urls.engine || (includeProjects && !urls.projects)) throw new Error(`Could not find live app modules for the rack probe: ${JSON.stringify(urls)}`);
        await page.evaluate(async (entries) => {
          const engineModule = await import(entries.engine);
          const projectModule = entries.projects ? await import(entries.projects) : null;
          window.__unboxRackProbe = { engine: engineModule.audioEngine, projects: projectModule?.projectManager ?? null };
        }, urls);
      };
      const state = async () => page.evaluate(() => {
        const probe = window.__unboxRackProbe;
        if (!probe) return null;
        const engine = probe.engine;
        return {
          projectId: probe.projects?.currentId ?? null,
          dirty: probe.projects?.dirty ?? null,
          devices: [...engine.devices.values()].map((device) => ({ id: device.id, type: device.type, name: device.name })),
          cables: engine.audioConnections.map((connection) => ({
            source: engine.devices.get(connection.sourceDeviceId)?.name ?? connection.sourceDeviceId,
            sourcePort: connection.sourcePortId,
            target: engine.devices.get(connection.targetDeviceId)?.name ?? connection.targetDeviceId,
            targetPort: connection.targetPortId,
          })),
        };
      });
      const hasSeriesRoute = (value) => {
        if (!value) return false;
        const guitar = value.devices.find((device) => device.name === 'Acoustic Guitar');
        const effect = value.devices.find((device) => device.name === 'Repeater Stereo Delay');
        if (!guitar || !effect) return false;
        const cable = (source, sourcePort, target, targetPort) => value.cables.some((connection) =>
          connection.source === source && connection.sourcePort === sourcePort && connection.target === target && connection.targetPort === targetPort
        );
        return cable(guitar.name, 'out_l', effect.name, 'in_l') && cable(guitar.name, 'out_r', effect.name, 'in_r') &&
          cable(effect.name, 'out_l', 'master', 'master_l') && cable(effect.name, 'out_r', 'master', 'master_r');
      };
      const waitForSeriesRoute = (timeout = 15_000) => page.waitForFunction(() => {
        const engine = window.__unboxRackProbe?.engine;
        if (!engine) return false;
        const guitar = [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        const effect = [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        if (!guitar || !effect) return false;
        const cable = (source, sourcePort, target, targetPort) => engine.audioConnections.some((connection) =>
          connection.sourceDeviceId === source.id && connection.sourcePortId === sourcePort &&
          connection.targetDeviceId === target && connection.targetPortId === targetPort
        );
        return cable(guitar, 'out_l', effect.id, 'in_l') && cable(guitar, 'out_r', effect.id, 'in_r') &&
          cable(effect, 'out_l', 'master', 'master_l') && cable(effect, 'out_r', 'master', 'master_r');
      }, null, { timeout });

      await page.waitForSelector('[data-testid="tab-rack"]', { timeout: 60_000 });
      await attachEngineProbe();
      await page.waitForFunction(() => !!window.__unboxRackProbe?.projects.currentId, null, { timeout: 30_000 });
      await page.getByTestId('tab-rack').click();
      await page.locator('[data-testid="rack-scroller"]').waitFor({ state: 'visible', timeout: 10_000 });
      if (!(await page.getByRole('button', { name: 'Built-in devices', exact: true }).count())) {
        await page.getByRole('button', { name: 'Library', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Built-in devices', exact: true }).click();
      const search = page.getByRole('textbox', { name: 'Search' });
      await search.fill('Acoustic Guitar');
      const guitarRow = page.locator('.lib-row').filter({ hasText: 'Recorded steel-string acoustic guitar' });
      await guitarRow.first().getByRole('button', { name: 'Add' }).first().click();
      await page.waitForFunction(() => [...window.__unboxRackProbe.engine.devices.values()].some((device) => device.name === 'Acoustic Guitar'), null, { timeout: 15_000 });

      await search.fill('Repeater Stereo Delay');
      const effectRow = page.locator('.lib-row').filter({ hasText: 'Repeater Stereo Delay' });
      await effectRow.getByRole('button', { name: 'Add' }).click();
      await page.waitForFunction(() => [...window.__unboxRackProbe.engine.devices.values()].some((device) => device.name === 'Repeater Stereo Delay'), null, { timeout: 15_000 });
      await waitForSeriesRoute();
      let current = await state();
      assert(hasSeriesRoute(current), 'Rack library Add did not insert and patch the delay into the recorded guitar signal path');
      assert.equal(current.devices.find((device) => device.name === 'Acoustic Guitar')?.type, 'rec_meta_steel_guitar', 'Rack UI selected a different guitar device than the recorded CC0 pack');
      const recordedPeak = await page.evaluate(async () => {
        const engine = window.__unboxRackProbe.engine;
        const guitar = [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        if (!guitar) throw new Error('The recorded acoustic guitar is missing');
        await guitar.ready?.();
        await engine.resumeContext();
        guitar.noteOn(60, 0.85, engine.ctx.currentTime + 0.02);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        const levels = engine.masterLevels();
        guitar.noteOff(60, engine.ctx.currentTime);
        return Math.max(levels.peakL, levels.peakR);
      });
      assert(recordedPeak > 1e-4, `The recorded guitar produced no measured output through its inserted delay (peak ${recordedPeak})`);

      assert.equal(await page.evaluate(() => window.__unboxRackProbe.engine.canUndo()), true, 'Adding the effect should create an undo entry');
      await page.getByTestId('main-menu').click();
      await page.getByRole('menuitem', { name: /^Undo/ }).click();
      await page.waitForFunction(() => ![...window.__unboxRackProbe.engine.devices.values()].some((device) => device.name === 'Repeater Stereo Delay'), null, { timeout: 15_000 });
      assert((await state()).devices.some((device) => device.name === 'Acoustic Guitar'), 'Undoing the effect addition also removed the instrument');
      await page.getByTestId('main-menu').click();
      await page.getByRole('menuitem', { name: /^Redo/ }).click();
      await waitForSeriesRoute();

      await page.getByTestId('main-menu').click();
      await page.getByRole('menuitem', { name: /^Save\s/ }).click();
      await page.waitForFunction(() => !!window.__unboxRackProbe?.projects.currentId && !window.__unboxRackProbe.projects.dirty, null, { timeout: 30_000 });
      assert((await state()).projectId, 'File menu Save did not retain an active project ID');
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('[data-testid="tab-rack"]', { timeout: 60_000 });
      await attachEngineProbe(false);
      await page.getByTestId('tab-rack').click();
      await waitForSeriesRoute(30_000);
      current = await state();
      assert(hasSeriesRoute(current), 'Saved/reopened project lost the guitar-to-delay-to-master cable graph');
      if (current.dirty !== null) assert.equal(current.dirty, false, 'Reopened project should match the saved project state');
      console.log(`PASS · Real Rack UI added a CC0 recorded acoustic guitar and stereo delay, measured routed guitar output at ${recordedPeak.toFixed(4)} peak, exercised Ctrl+Z/Ctrl+Shift+Z, saved from the File menu, and preserved both devices and cables through reload.`);
    }
    if (probe === 'physical-midi-recording' || probe === 'physical-midi-ui-recording') {
      const permission = await page.evaluate(async () => {
        try {
          return (await navigator.permissions.query({ name: 'midi' })).state;
        } catch (error) {
          return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        }
      });
      console.log(`PHYSICAL_MIDI_PERMISSION ${permission}`);
      await page.waitForFunction(() => {
        const status = document.querySelector('#result')?.getAttribute('data-status');
        return status === 'ready' || status === 'failed';
      }, null, { timeout: 180_000 });
      const moduleStatus = await page.locator('#result').getAttribute('data-status');
      if (moduleStatus !== 'ready') throw new Error(`${probe} module failed to load: ${await page.locator('#result').innerText()}`);
      if (probe === 'physical-midi-recording') await page.locator('#connect').click();
      else await page.locator('button[aria-label="Record armed tracks"]').click();
    }
    let result = '';
    if (probe !== 'export-page-ui' && probe !== 'rack-ui-workflow') {
      try {
        await page.waitForFunction(() => {
          const status = document.querySelector('#result')?.getAttribute('data-status');
          return status === 'passed' || status === 'failed';
        }, null, { timeout: probe === 'device-soak' ? 720_000 : probe === 'physical-midi-recording' ? 160_000 : 300_000 });
      } catch (error) {
        if (probe !== 'physical-midi-recording' && probe !== 'physical-midi-ui-recording') throw error;
        const pageState = await page.evaluate(() => ({
          url: location.href,
          readyState: document.readyState,
          status: document.querySelector('#result')?.getAttribute('data-status') ?? null,
          message: document.querySelector('#result')?.textContent ?? null,
          resourceUrls: performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => url.startsWith(location.origin)),
        }));
        throw new Error(`${error.message}; browser state=${JSON.stringify(pageState)}; failed requests=${JSON.stringify(failedRequests)}`);
      }
      const status = await page.locator('#result').getAttribute('data-status');
      result = await page.locator('#result').innerText();
      if (status !== 'passed') throw new Error(`${probe} reported: ${result}`);
    }
    if (errors.length) throw new Error(`${probe} had browser errors: ${errors.join(' | ')}`);
    if (result) console.log(result);
    if (probe === 'note-audio-editing') {
      const screenshot = path.join(root, '.tmp', 'note-audio-editing.png');
      fs.mkdirSync(path.dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(`UI screenshot: ${screenshot}`);
    }
    if (probe === 'export-roundtrip') {
      if (!artifacts.size) throw new Error('The browser did not submit export files to FFmpeg validation');
      const expectedExtensions = { wav: 'wav', aiff: 'aiff', flac: 'flac', mp3: 'mp3', ogg: 'ogg', aac: 'aac' };
      const checked = [];
      for (const [name, bytes] of artifacts) {
        const match = name.match(/(wav|aiff|flac|mp3|ogg|aac)-(\d+)-(\d+)/i);
        if (!match) throw new Error(`Invalid FFmpeg artifact key: ${name}`);
        const [, format, bitDepthText, sampleRateText] = match;
        const expectedFormat = expectedExtensions[format.toLowerCase()];
        const expectedBitDepth = Number(bitDepthText);
        const expectedSampleRate = Number(sampleRateText);
        const probeResult = spawnSync('ffprobe', [
          '-v', 'error', '-show_entries', 'format=format_name,duration:format_tags=title,artist:stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample',
          '-of', 'json', '-i', 'pipe:0',
        ], { input: bytes, encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
        if (probeResult.status !== 0) throw new Error(`ffprobe rejected ${name}: ${probeResult.error?.message ?? probeResult.stderr}`);
        let report;
        try {
          report = JSON.parse(probeResult.stdout);
        } catch (error) {
          throw new Error(`ffprobe returned invalid JSON for ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const stream = report.streams?.[0];
        const container = report.format?.format_name ?? '';
        if (!stream || !container.split(',').includes(expectedFormat)) throw new Error(`${name} container was ${container || 'unknown'}, expected ${expectedFormat}`);
        if (Number(stream.channels) !== 2 || Number(stream.sample_rate) !== expectedSampleRate) throw new Error(`${name} stream is ${stream.channels}ch at ${stream.sample_rate} Hz`);
        if (expectedBitDepth <= 24 && !['mp3', 'ogg', 'aac'].includes(format.toLowerCase())) {
          const bits = Number(stream.bits_per_raw_sample || stream.bits_per_sample);
          if (bits !== expectedBitDepth) throw new Error(`${name} decoded as ${bits}-bit, expected ${expectedBitDepth}-bit`);
        }
        const decodeResult = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'null', '-'], {
          input: bytes, encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
        });
        if (decodeResult.status !== 0) throw new Error(`FFmpeg could not fully decode ${name}: ${decodeResult.error?.message ?? decodeResult.stderr}`);
        let duration = Number(report.format.duration ?? stream.duration);
        if (!Number.isFinite(duration) && format.toLowerCase() === 'wav' && bytes.length >= 44) {
          const wavView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          duration = wavView.getUint32(40, true) / wavView.getUint32(28, true);
        } else if (!Number.isFinite(duration) && format.toLowerCase() === 'aiff' && bytes.length >= 54) {
          const aiffView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          duration = aiffView.getUint32(22, false) / expectedSampleRate;
        }
        if (Number.isFinite(duration) && Math.abs(duration - 2.25) > (['mp3', 'ogg', 'aac'].includes(format.toLowerCase()) ? 0.15 : 1 / expectedSampleRate)) {
          throw new Error(`${name} duration is ${duration}, expected about 2.25 seconds`);
        }
        const durationLabel = Number.isFinite(duration) ? `${duration.toFixed(3)} s` : 'duration checked by browser decode / PCM header';
        checked.push(`${name} (${stream.codec_name}, ${durationLabel})`);
      }
      console.log(`FFMPEG_EXPORT_VALIDATION ${checked.join('; ')}`);
    }
  } finally {
    if (browser) await browser.close();
    else if (context) await context.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
