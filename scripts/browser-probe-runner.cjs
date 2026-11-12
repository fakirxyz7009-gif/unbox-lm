const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { createServer } = require('vite');
const { chromium } = require('playwright-core');

const probes = new Set(['multisample-engine', 'midi-recording', 'midi-bootstrap', 'midi-ui-recording', 'physical-midi-ui-recording', 'physical-midi-recording', 'recorded-pack', 'ocarina-pack', 'button-accordion-pack', 'electric-pianos-pack', 'freepats-clarinet-pack', 'freepats-harp-pack', 'freepats-bass-pack', 'freepats-recorder-pack', 'freepats-bagpipe-pack', 'shinyguitar-pack', 'ganjo-pack', 'vcsl-pipe-organ-pack', 'vcsl-marimba-pack', 'note-audio-editing', 'sample-browser-accessibility', 'patch-browser-accessibility', 'shortcut-help-accessibility', 'lcd-editor-adsr', 'subvoice-state', 'granular-live-offline', 'shared-realtime-scheduler', 'cv-shared-realtime-scheduler', 'cv-matrix-ui', 'transport-cold-start', 'realtime-bounce-clock', 'recorder-frame-stop', 'recording-journal-recovery', 'vst-faceplate-preview-ui', 'vst-macro-replay', 'instrument-selection-event', 'instrument-selection-app', 'player-realtime-scheduler', 'third-wave-wave-envelope-cleanup', 'pulsar-audio-clock', 'advanced-synthesis-live-offline', 'undo-chain', 'vsco-cello-articulations-pack', 'live-offline-audio-parity', 'mod-wheel-layer', 'lfo-wave-switch', 'stereo-tremolo-response', 'vocoder-attack', 'pitch-correction', 'sf2-import', 'device-audio-smoke', 'effect-bypass', 'effect-response', 'dynamics-sidechain', 'device-soak', 'project-roundtrip', 'project-recovery', 'export-roundtrip', 'export-page-ui', 'rack-ui-workflow', 'rv7000-impulse-controls', 'link-import-provenance']);
const probe = process.argv[2] ?? 'multisample-engine';
if (!probes.has(probe)) throw new Error(`Unknown browser probe: ${probe}`);

// The real spelling of the folder: a shell can report the drive as "c:", and Vite then serves the
// project's modules at other URLs than the /src/… ones the app probes look up.
const root = fs.realpathSync.native(path.resolve(__dirname, '..'));
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
    // Disposable Chrome/Electron profiles and package artifacts live in .tmp. A user can keep one
    // open while a headless probe starts; do not let Vite's source watcher touch locked Cookies or
    // profile databases there.
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/.tmp/**', '**/release/**'] } },
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
      // The UI probes serve no API: the app's VST, stem-library and local-assistant requests fall back when it is absent.
      if ((probe === 'rack-ui-workflow' || probe === 'midi-ui-recording' || probe === 'export-page-ui' || probe === 'sf2-import' || probe === 'patch-browser-accessibility') && response.status() === 404 && (url.pathname === '/api/vst/status' || url.pathname === '/api/stems/library' || url.pathname === '/api/local-ai/status')) return;
      // The app-level selection probe runs without the local API server; the app falls back when it is absent.
      if (probe === 'instrument-selection-app' && response.status() === 404 && url.pathname.startsWith('/api/')) return;
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
    // A clean Vite dependency cache can legitimately need more than 30 seconds
    // before the first probe page reaches `load` on Windows. This is bootstrap
    // time, not an audio-test timeout; retain the stricter result timeouts below.
    await page.goto(probe === 'export-page-ui' || probe === 'rack-ui-workflow' ? origin : `${origin}/tests/browser/${pageProbe}.html${query}`, { waitUntil: 'load', timeout: 60_000 });
    if (probe === 'physical-midi-ui-recording' && headed) {
      await page.evaluate((title) => { document.title = title; }, `Unbox Impulse MIDI Probe ${port}`);
    }
    if (headed) await page.bringToFront();
    if (probe === 'sf2-import') {
      const assert = require('node:assert/strict');
      // LOAD › "SoundFont…" opens this file input
      const input = page.getByTestId('load-sf2-input');
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
      const rackIds = () => page.evaluate(() => {
        const engine = window.__unboxRackProbe?.engine;
        const guitar = engine && [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        const effect = engine && [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        return guitar && effect ? { guitarId: guitar.id, effectId: effect.id } : null;
      });
      /** Exact cable edges involved in the guitar → delay → master chain. */
      const seriesCables = () => page.evaluate(() => {
        const engine = window.__unboxRackProbe?.engine;
        if (!engine) return [];
        const guitar = [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        const effect = [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        if (!guitar || !effect) return [];
        return engine.audioConnections
          .filter((connection) =>
            (connection.sourceDeviceId === guitar.id && connection.targetDeviceId === effect.id) ||
            (connection.sourceDeviceId === effect.id && connection.targetDeviceId === 'master')
          )
          .map((connection) => `${connection.sourceDeviceId}:${connection.sourcePortId}>${connection.targetDeviceId}:${connection.targetPortId}`)
          .sort();
      });
      // Cable SVG hit paths sit over the rear-panel jacks.  Go through the actual pointer route
      // instead of locator.click(), which would otherwise target the overlay.
      const clickJack = async (key) => {
        const jack = page.locator(`[data-jack-key="${key}"]`);
        await jack.scrollIntoViewIfNeeded();
        const box = await jack.boundingBox();
        assert(box, `Rear-panel jack ${key} is not visible`);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      };

      await page.waitForSelector('[data-testid="tab-rack"]', { timeout: 60_000 });
      await attachEngineProbe();
      await page.waitForFunction(() => !!window.__unboxRackProbe?.projects.currentId, null, { timeout: 30_000 });
      await page.getByTestId('tab-rack').click();
      await page.locator('[data-testid="rack-scroller"]').waitFor({ state: 'visible', timeout: 10_000 });
      // the rack's browser panel (src/browser): sections are tabs, one search over all of them
      if (!(await page.getByTestId('browser').count())) {
        await page.getByRole('button', { name: 'Browser', exact: true }).click();
      }
      const search = page.getByRole('textbox', { name: 'Search the browser' });
      await page.getByTestId('bw-tab-instruments').click();
      await search.fill('Acoustic Guitar');
      const guitarRow = page.locator('.bw-row').filter({ hasText: 'Recorded steel-string acoustic guitar' });
      await guitarRow.first().getByRole('button', { name: 'Add' }).first().click();
      await page.waitForFunction(() => [...window.__unboxRackProbe.engine.devices.values()].some((device) => device.name === 'Acoustic Guitar'), null, { timeout: 15_000 });

      await search.fill('Repeater Stereo Delay');
      await page.getByTestId('bw-tab-effects').click();
      const effectRow = page.locator('.bw-row').filter({ hasText: 'Repeater Stereo Delay' });
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

      // Rear patchbay acceptance: a cancelled cable move must restore its precise old route,
      // while moving onto an occupied input must replace exactly the one cable the UI describes.
      const ids = await rackIds();
      assert(ids, 'Could not identify the rack devices for the rear-panel acceptance test');
      const routeBeforeRearPatching = await seriesCables();
      await page.getByRole('group', { name: 'Rack side' }).getByRole('button', { name: 'Rear' }).click();
      await page.locator(`[data-jack-key="${ids.guitarId}:out_l"]`).waitFor({ state: 'visible', timeout: 10_000 });
      await clickJack(`${ids.effectId}:in_l`);
      await page.keyboard.press('Escape');
      await page.getByRole('status').filter({ hasText: 'Patch cancelled' }).waitFor({ state: 'visible', timeout: 10_000 });
      assert.deepEqual(await seriesCables(), routeBeforeRearPatching, 'Cancelling a rear-panel cable move did not restore the exact prior series route');

      // Grab the left input plug, put it on the occupied right input, then restore the stereo
      // route exclusively through the rear-panel UI.  This exercises the one-cable-per-input
      // replacement rule, not an engine-only disconnect/reconnect shortcut.
      await clickJack(`${ids.effectId}:in_l`);
      await clickJack(`${ids.effectId}:in_r`);
      await page.getByRole('status').filter({ hasText: 'replaced a cable' }).waitFor({ state: 'visible', timeout: 10_000 });
      const replacedRoute = await seriesCables();
      assert(replacedRoute.includes(`${ids.guitarId}:out_l>${ids.effectId}:in_r`), 'Rear-panel move did not put the left guitar output on the occupied right delay input');
      assert(!replacedRoute.includes(`${ids.guitarId}:out_r>${ids.effectId}:in_r`), 'Rear-panel move left the displaced right-input cable in place');
      assert(!replacedRoute.includes(`${ids.guitarId}:out_l>${ids.effectId}:in_l`), 'Rear-panel move left the old left-input cable in place');
      await clickJack(`${ids.effectId}:in_r`);
      await clickJack(`${ids.effectId}:in_l`);
      await clickJack(`${ids.guitarId}:out_r`);
      await clickJack(`${ids.effectId}:in_r`);
      await waitForSeriesRoute();
      assert.deepEqual(await seriesCables(), routeBeforeRearPatching, 'Rear-panel restoration did not return to the original stereo series route');

      // Build a Combiner through the Rack's explicit multi-unit selection flow, then author its
      // mapping through the real front-panel macro editor. This is deliberately a UI path: it
      // proves that a user can make a general instrument + effect frame instead of only editing
      // a fixture made through the engine API.
      await page.getByRole('group', { name: 'Rack side' }).getByRole('button', { name: 'Front' }).click();
      await page.getByRole('button', { name: 'Select rack units to create a Combiner' }).click();
      const combinerSelection = page.getByRole('group', { name: 'New Combiner selection' });
      await combinerSelection.getByRole('textbox', { name: 'New Combiner name' }).fill('Local Macro Acceptance');
      await page.getByRole('button', { name: 'Add Acoustic Guitar to the new Combiner' }).click();
      await page.getByRole('button', { name: 'Add Repeater Stereo Delay to the new Combiner' }).click();
      await combinerSelection.getByRole('button', { name: 'Create' }).click();
      const combiner = page.locator('section[aria-label="Combiner Local Macro Acceptance"]');
      await combiner.waitFor({ state: 'visible', timeout: 10_000 });
      const groupInfo = await page.evaluate(() => {
        const engine = window.__unboxRackProbe?.engine;
        if (!engine) throw new Error('Rack engine unavailable');
        const guitar = [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        const effect = [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        if (!guitar || !effect) throw new Error('Rack fixture devices unavailable');
        effect.setParam('time', 0.07);
        effect.setParam('feedback', 0);
        effect.setParam('pingPong', false);
        effect.setParam('mix', 0);
        const group = engine.rackGroups.find((entry) => entry.name === 'Local Macro Acceptance');
        if (!group || !group.deviceIds.includes(guitar.id) || !group.deviceIds.includes(effect.id)) {
          throw new Error('Rack selection UI did not create the expected Combiner membership');
        }
        return { groupId: group.id, guitarId: guitar.id, effectId: effect.id };
      });
      const measureDelayTail = () => page.evaluate(async () => {
        const engine = window.__unboxRackProbe?.engine;
        const effect = engine && [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        const guitar = engine && [...engine.devices.values()].find((device) => device.name === 'Acoustic Guitar');
        if (!engine || !effect || !guitar) throw new Error('Delay fixture unavailable for macro DSP measurement');
        await engine.resumeContext();
        const output = effect.audioOutputs.get('out_l');
        const input = effect.audioInputs.get('in_l');
        if (!output || !input) throw new Error('Delay fixture has no left audio ports');
        // An analyser's last window can miss a short live delay on a busy browser.  Capture the
        // actual audio-clock interval after the dry pulse instead; the muted sink merely keeps
        // ScriptProcessor pulled and never reaches the listener.
        const capture = engine.ctx.createScriptProcessor(512, 1, 1);
        const silentSink = engine.ctx.createGain();
        silentSink.gain.value = 0;
        const samples = [];
        const oscillator = engine.ctx.createOscillator();
        const gain = engine.ctx.createGain();
        gain.gain.value = 0.22;
        oscillator.frequency.value = 440;
        oscillator.connect(gain).connect(input);
        output.connect(capture);
        capture.connect(silentSink).connect(engine.ctx.destination);
        // Isolate this direct test tone from the earlier recorded-guitar audition.  These are
        // transient Web Audio trim gains, never device parameters or saved project data.
        const guitarOutputs = ['out_l', 'out_r'].map((port) => guitar.audioOutputs.get(port)).filter(Boolean);
        const previousGains = guitarOutputs.map((node) => node.gain.value);
        guitarOutputs.forEach((node) => node.gain.setValueAtTime(0, engine.ctx.currentTime));
        // Existing echo feedback and any recorded-guitar release are already silent before the
        // direct pulse enters.  The interval begins safely after the 40 ms dry pulse.
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        const start = engine.ctx.currentTime + 0.04;
        const tailStart = start + 0.08;
        const tailEnd = start + 0.13;
        capture.onaudioprocess = (event) => {
          const block = event.inputBuffer.getChannelData(0);
          const blockStart = event.playbackTime;
          for (let index = 0; index < block.length; index += 1) {
            const at = blockStart + index / engine.ctx.sampleRate;
            if (at >= tailStart && at <= tailEnd) samples.push(block[index]);
          }
        };
        oscillator.start(start);
        oscillator.stop(start + 0.04);
        try {
          // Let the 70 ms delayed copy pass through the audio-clock capture interval.
          await new Promise((resolve) => window.setTimeout(resolve, 285));
          if (samples.length === 0) throw new Error('Delay macro capture received no post-dry audio frames');
          return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        } finally {
          oscillator.disconnect();
          gain.disconnect();
          capture.onaudioprocess = null;
          capture.disconnect();
          silentSink.disconnect();
          guitarOutputs.forEach((node, index) => node.gain.setValueAtTime(previousGains[index], engine.ctx.currentTime));
        }
      });
      await combiner.getByRole('button', { name: 'Edit macros for Local Macro Acceptance' }).click();
      await combiner.getByTestId('combiner-new-macro-label').fill('Wet Mix');
      await combiner.getByTestId('combiner-new-macro-device').selectOption(groupInfo.effectId);
      await combiner.getByTestId('combiner-new-macro-param').selectOption('mix');
      await combiner.getByTestId('combiner-add-macro').click();
      await page.waitForFunction((fixture) => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        const macro = group?.macros.find((entry) => entry.label === 'Wet Mix');
        return !!macro && macro.targets.length === 1 && macro.targets[0].deviceId === fixture.effectId && macro.targets[0].param === 'mix';
      }, groupInfo, { timeout: 10_000 });
      const wetMix = combiner.getByRole('slider', { name: 'Wet Mix' });
      await wetMix.waitFor({ state: 'visible', timeout: 10_000 });
      // Allow the initial zero-mix AudioParam ramp to settle before measuring its dry-only tail.
      await page.waitForTimeout(80);
      const dryTail = await measureDelayTail();
      await wetMix.focus();
      for (let press = 0; press < 100; press += 1) await page.keyboard.press('ArrowRight');
      const macroState = await page.evaluate((fixture) => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        const effect = engine?.devices.get(fixture.effectId);
        return { macro: group?.macros.find((macro) => macro.label === 'Wet Mix')?.value, mix: effect?.params.mix };
      }, groupInfo);
      assert(Math.abs((macroState.macro ?? -1) - 0.5) < 0.011, `Front-panel Wet Mix did not reach 50% (macro=${macroState.macro})`);
      assert(Math.abs((macroState.mix ?? -1) - 0.5) < 0.011, `Front-panel Wet Mix did not drive the delay mix (mix=${macroState.mix})`);
      await page.waitForTimeout(80);
      const wetTail = await measureDelayTail();
      assert(wetTail > Math.max(1e-4, dryTail * 6), `Combiner macro did not create a measurable delayed tail (dry=${dryTail}, wet=${wetTail})`);

      // Exercise the authoring controls themselves: rename, inverted range, target switches,
      // add/remove a second target, plus add/delete/undo/redo a macro.  End by restoring the
      // normal Wet Mix mapping so the project-recall assertion below remains meaningful.
      const macroEditor = combiner.getByTestId('combiner-macro-editor');
      const macroName = macroEditor.getByRole('textbox', { name: 'Wet Mix macro name' });
      await macroName.fill('Wet Mix Reverse');
      await macroName.press('Enter');
      await page.waitForFunction((fixture) => {
        const group = window.__unboxRackProbe?.engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        return group?.macros.some((macro) => macro.label === 'Wet Mix Reverse');
      }, groupInfo, { timeout: 10_000 });
      const inverseMin = macroEditor.getByRole('spinbutton', { name: 'Wet Mix Reverse target 1 minimum' });
      const inverseMax = macroEditor.getByRole('spinbutton', { name: 'Wet Mix Reverse target 1 maximum' });
      await inverseMin.fill('1');
      await inverseMin.press('Tab');
      await inverseMax.fill('0');
      await inverseMax.press('Tab');
      const reverseMix = combiner.getByRole('slider', { name: 'Wet Mix Reverse' });
      await reverseMix.focus();
      for (let press = 0; press < 100; press += 1) await page.keyboard.press('ArrowLeft');
      const invertedState = await page.evaluate((fixture) => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        const macro = group?.macros.find((entry) => entry.label === 'Wet Mix Reverse');
        const effect = engine?.devices.get(fixture.effectId);
        return { macro: macro?.value, target: macro?.targets[0], mix: effect?.params.mix };
      }, groupInfo);
      assert(Math.abs((invertedState.macro ?? -1)) < 0.011, `Reverse macro did not reach 0% (${invertedState.macro})`);
      assert.equal(invertedState.target?.min, 1, 'Macro editor did not retain the inverted minimum');
      assert.equal(invertedState.target?.max, 0, 'Macro editor did not retain the inverted maximum');
      assert(Math.abs((invertedState.mix ?? -1) - 1) < 0.011, `Inverted macro at 0% did not drive delay mix to 1 (${invertedState.mix})`);

      const targetDevice = macroEditor.getByRole('combobox', { name: 'Wet Mix Reverse target 1 device' });
      await targetDevice.selectOption(groupInfo.guitarId);
      await page.waitForFunction((fixture) => {
        const group = window.__unboxRackProbe?.engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        return group?.macros.find((macro) => macro.label === 'Wet Mix Reverse')?.targets[0]?.deviceId === fixture.guitarId;
      }, groupInfo, { timeout: 10_000 });
      await targetDevice.selectOption(groupInfo.effectId);
      const targetParam = macroEditor.getByRole('combobox', { name: 'Wet Mix Reverse target 1 parameter' });
      await targetParam.selectOption('mix');
      await page.waitForFunction((fixture) => {
        const group = window.__unboxRackProbe?.engine?.rackGroups.find((entry) => entry.id === fixture.groupId);
        const target = group?.macros.find((macro) => macro.label === 'Wet Mix Reverse')?.targets[0];
        return target?.deviceId === fixture.effectId && target.param === 'mix';
      }, groupInfo, { timeout: 10_000 });
      await macroEditor.getByRole('button', { name: 'Add target' }).click();
      await page.waitForFunction((fixture) => window.__unboxRackProbe?.engine?.rackGroups
        .find((entry) => entry.id === fixture.groupId)?.macros.find((macro) => macro.label === 'Wet Mix Reverse')?.targets.length === 2,
      groupInfo, { timeout: 10_000 });
      await macroEditor.getByRole('button', { name: 'Remove Wet Mix Reverse target 2' }).click();
      await page.waitForFunction((fixture) => window.__unboxRackProbe?.engine?.rackGroups
        .find((entry) => entry.id === fixture.groupId)?.macros.find((macro) => macro.label === 'Wet Mix Reverse')?.targets.length === 1,
      groupInfo, { timeout: 10_000 });

      await combiner.getByTestId('combiner-new-macro-label').fill('Throwaway');
      await combiner.getByTestId('combiner-new-macro-device').selectOption(groupInfo.effectId);
      await combiner.getByTestId('combiner-new-macro-param').selectOption('mix');
      await combiner.getByTestId('combiner-add-macro').click();
      await macroEditor.getByRole('button', { name: 'Delete Throwaway macro' }).click();
      await page.waitForFunction((fixture) => !window.__unboxRackProbe?.engine?.rackGroups
        .find((entry) => entry.id === fixture.groupId)?.macros.some((macro) => macro.label === 'Throwaway'),
      groupInfo, { timeout: 10_000 });
      await page.getByTestId('main-menu').click();
      await page.getByRole('menuitem', { name: /^Undo/ }).click();
      await page.waitForFunction(() => window.__unboxRackProbe?.engine?.rackGroups
        .some((group) => group.macros.some((macro) => macro.label === 'Throwaway')), null, { timeout: 15_000 });
      await page.getByTestId('main-menu').click();
      await page.getByRole('menuitem', { name: /^Redo/ }).click();
      await page.waitForFunction(() => !window.__unboxRackProbe?.engine?.rackGroups
        .some((group) => group.macros.some((macro) => macro.label === 'Throwaway')), null, { timeout: 15_000 });

      const restoredMacroName = macroEditor.getByRole('textbox', { name: 'Wet Mix Reverse macro name' });
      await restoredMacroName.fill('Wet Mix');
      await restoredMacroName.press('Enter');
      const normalMin = macroEditor.getByRole('spinbutton', { name: 'Wet Mix target 1 minimum' });
      const normalMax = macroEditor.getByRole('spinbutton', { name: 'Wet Mix target 1 maximum' });
      await normalMin.fill('0');
      await normalMin.press('Tab');
      await normalMax.fill('1');
      await normalMax.press('Tab');
      const normalMix = combiner.getByRole('slider', { name: 'Wet Mix' });
      await normalMix.focus();
      for (let press = 0; press < 100; press += 1) await page.keyboard.press('ArrowRight');
      const restoredAuthoringState = await page.evaluate(() => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.name === 'Local Macro Acceptance');
        const macro = group?.macros.find((entry) => entry.label === 'Wet Mix');
        const effect = engine && [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        return { macro: macro?.value, target: macro?.targets[0], effectId: effect?.id, mix: effect?.params.mix };
      });
      assert(Math.abs((restoredAuthoringState.macro ?? -1) - 0.5) < 0.011, `Restored authoring macro did not reach 50% (${restoredAuthoringState.macro})`);
      assert.equal(restoredAuthoringState.target?.deviceId, restoredAuthoringState.effectId, 'Target-device editor did not restore the delay target');
      assert.equal(restoredAuthoringState.target?.param, 'mix', 'Target-parameter editor did not restore delay mix');
      assert.equal(restoredAuthoringState.target?.min, 0, 'Normal minimum did not restore after inversion');
      assert.equal(restoredAuthoringState.target?.max, 1, 'Normal maximum did not restore after inversion');
      assert(Math.abs((restoredAuthoringState.mix ?? -1) - 0.5) < 0.011, `Restored authoring macro did not drive mix to 50% (${restoredAuthoringState.mix})`);
      if (process.env.UNBOX_CAPTURE_RACK_UI === '1') {
        const screenshot = path.join(root, '.tmp', 'rack-combiner-macro-editor.png');
        fs.mkdirSync(path.dirname(screenshot), { recursive: true });
        await macroEditor.screenshot({ path: screenshot });
        console.log(`UI screenshot: ${screenshot}`);
      }

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
      const restoredGroup = await page.evaluate(() => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.name === 'Local Macro Acceptance');
        const macro = group?.macros.find((entry) => entry.label === 'Wet Mix');
        const effect = engine && [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        return {
          groupId: group?.id,
          macro: macro?.value,
          targetIsDelay: !!macro && macro.targets.length === 1 && macro.targets[0].deviceId === effect?.id && macro.targets[0].param === 'mix',
          mix: effect?.params.mix,
        };
      });
      assert(restoredGroup.groupId, 'Saved/reopened project lost the local Combiner frame');
      assert(Math.abs((restoredGroup.macro ?? -1) - 0.5) < 0.011, `Saved/reopened project lost the Wet Mix macro value (${restoredGroup.macro})`);
      assert.equal(restoredGroup.targetIsDelay, true, 'Saved/reopened project did not remap the Wet Mix target to the restored delay');
      assert(Math.abs((restoredGroup.mix ?? -1) - 0.5) < 0.011, `Saved/reopened project lost the delay mix driven by Wet Mix (${restoredGroup.mix})`);
      const restoredCombiner = page.locator('section[aria-label="Combiner Local Macro Acceptance"]');
      const restoredWetMix = restoredCombiner.getByRole('slider', { name: 'Wet Mix' });
      await restoredWetMix.focus();
      await page.keyboard.press('ArrowRight');
      const replayedMacro = await page.evaluate((groupId) => {
        const engine = window.__unboxRackProbe?.engine;
        const group = engine?.rackGroups.find((entry) => entry.id === groupId);
        const effect = engine && [...engine.devices.values()].find((device) => device.name === 'Repeater Stereo Delay');
        return { macro: group?.macros.find((entry) => entry.label === 'Wet Mix')?.value, mix: effect?.params.mix };
      }, restoredGroup.groupId);
      assert(Math.abs((replayedMacro.macro ?? -1) - 0.505) < 0.011, `Restored Wet Mix did not remain interactive (${replayedMacro.macro})`);
      assert(Math.abs((replayedMacro.mix ?? -1) - 0.505) < 0.011, `Restored Wet Mix did not replay its delay mapping (${replayedMacro.mix})`);
      if (current.dirty !== null) assert.equal(current.dirty, false, 'Reopened project should match the saved project state');
      console.log(`PASS · Real Rack UI added a CC0 recorded acoustic guitar and stereo delay, measured routed guitar output at ${recordedPeak.toFixed(4)} peak, exercised Ctrl+Z/Ctrl+Shift+Z, rear-panel cancel/replacement/restore, a real Wet Mix macro (${dryTail.toExponential(2)} → ${wetTail.toExponential(2)} delayed-tail RMS), then saved and reopened the stereo graph plus mapped Combiner macro.`);
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
      // The catalog sweep now mounts more than a hundred devices, including
      // recorded packs that correctly wait for their middle velocity layer.
      // Keep its assertions intact but give that exhaustive acceptance enough
      // wall time on a cold Windows disk.
      const resultTimeout = probe === 'device-soak' ? 720_000
        : probe === 'physical-midi-recording' ? 160_000
          : probe === 'device-audio-smoke' ? 480_000
            : 300_000;
      try {
        await page.waitForFunction(() => {
          const status = document.querySelector('#result')?.getAttribute('data-status');
          return status === 'passed' || status === 'failed';
        }, null, { timeout: resultTimeout });
      } catch (error) {
        if (probe === 'device-audio-smoke') {
          const state = await page.evaluate(() => ({
            status: document.querySelector('#result')?.getAttribute('data-status') ?? null,
            message: document.querySelector('#result')?.textContent ?? null,
          }));
          throw new Error(`${error.message}; device sweep state=${JSON.stringify(state)}`);
        }
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
