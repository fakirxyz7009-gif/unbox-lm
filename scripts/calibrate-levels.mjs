/**
 * Regenerates src/audio/levelCalibrationTable.ts by measuring every playable instrument — built-in
 * types and each recorded pack — through its own device output.
 *
 * Each type is instantiated on an OfflineAudioContext at 48 kHz, a three-note chord (MIDI 60/64/67)
 * is gated at velocity 0.85, and the rendered stereo peak becomes `target / peak`, averaged over
 * three takes because detuned / randomised engines do not render an identical peak twice. The
 * method is documented in src/audio/levelCalibration.ts — change it in both places.
 *
 *   npm run calibrate:levels                       # everything (synths + all recorded packs)
 *   npm run calibrate:levels -- rec_osiris_piano   # measure specific types, print only
 *   npm run calibrate:levels -- --synths           # skip the (slow) pack sweep
 *
 * Recorded packs are measured individually so each lands on the target instead of within a few dB
 * of it. The family fallback in levelCalibration.ts still covers a pack that is missing here — which
 * is what a pack built after this table was written will hit until the sweep is re-run.
 *
 * Chrome is driven over the DevTools Protocol with Node's built-in WebSocket, so this needs no
 * browser-automation package. Set CHROME_PATH if Chrome is not in the default location.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = fs.realpathSync.native(path.resolve(import.meta.dirname, '..'));
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(root, 'src', 'audio', 'levelCalibrationTable.ts');
const TARGET = 0.35;
/** A very quiet pack legitimately needs a boost well above 1; the cap only stops a near-silent
 *  measurement from producing an absurd gain. It used to be 1.5, which silently flattened seven
 *  quiet packs (tuba needs 4.8, frame drum 2.7) and left them 3-10 dB under target. Mirrors
 *  MAX_TYPE_TRIM in src/audio/levelCalibration.ts — keep the two equal. */
const MAX_TRIM = 10;

const SYNTH_BATCH = 8;
/** Packs hold decoded sample buffers until their engine is disposed, so the page is recycled.
 *  Keep both small: a batch of 4 with a reload every 12 packs silently lost ~1 in 7 packs to
 *  memory pressure (they measured fine when retried on their own). */
const PACK_BATCH = 2;
const PACK_RELOAD_EVERY = 6;

/** Legacy class devices (not DeviceSpecs) that produce audio. CV / step units are probed too and
 *  dropped automatically when they expose no audio outputs. */
const LEGACY_TYPES = [
  'subtractor', 'thor', 'third_wave', 'europa', 'monotone', 'redrum', 'mimic', 'matrix', 'pulsar',
  'flex', 'three_osc', 'world_instrument', 'percussion_electronic', 'bansuri', 'harmonium', 'tabla',
  'dhol', 'tanpura', 'tumbi', 'ember', 'wyvern', 'sytrus',
];

const args = process.argv.slice(2);
const synthsOnly = args.includes('--synths');
/** With explicit types: merge into the existing table instead of printing only. */
const merge = args.includes('--merge');
const requested = args.filter((arg) => !arg.startsWith('-'));
const log = (message) => process.stdout.write(`${message}\n`);

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a port.'));
      listener.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

/** Minimal CDP client over Node's built-in WebSocket. */
class Cdp {
  #ws;
  #next = 1;
  #pending = new Map();

  static async connect(wsUrl) {
    const client = new Cdp();
    client.#ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      client.#ws.addEventListener('open', resolve, { once: true });
      client.#ws.addEventListener('error', () => reject(new Error('Could not open the DevTools socket.')), { once: true });
    });
    client.#ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        log(`  page exception: ${details?.exception?.description ?? details?.text ?? 'unknown'}`);
        return;
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const text = (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
        if (text) log(`  page console error: ${text.slice(0, 400)}`);
        return;
      }
      const entry = client.#pending.get(message.id);
      if (!entry) return;
      client.#pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
    return client;
  }

  send(method, params = {}, sessionId) {
    const id = this.#next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify(payload));
    });
  }

  close() {
    this.#ws.close();
  }
}

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result?.value;
}

const measureScript = (types) => `(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /AudioEngine\\.ts/.test(n));
  if (!url) {
    // The app imports its engine lazily, so a freshly reloaded page can be showing its tabs
    // before AudioEngine is in the resource list. Wait for it, then fall back to the module path.
    for (let wait = 0; wait < 100 && !url; wait++) {
      await new Promise((r) => setTimeout(r, 200));
      url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('AudioEngine.ts'));
    }
  }
  if (!url) url = '/src/audio/AudioEngine.ts';
  const { audioEngine } = await import(url);
  const { SPEC_BY_TYPE } = await import('/shared/rack/devices/index.ts');
  const out = [];
  // The chord is what plays, so the chord is what is measured — three takes, because detuned /
  // randomised engines add or cancel by phase chance and move a single render by a dB or two.
  for (const type of ${JSON.stringify(types)}) {
    try {
      const spec = SPEC_BY_TYPE.get(type);
      // Kits do not answer on 60/64/67 — gate their own pads instead.
      const pads = spec?.pads ?? [];
      let notes = pads.length ? pads.slice(0, 3).map((pad) => pad.note) : [60, 64, 67];
      // Recorded packs thin their samples: the key map can have gaps right where 60/64/67 fall
      // (a flute sampled at 67-70 / 79-82 / 91-94 answers on none of them). Gate notes the pack
      // actually samples at this velocity instead.
      const packId = spec?.engineConfig?.pack;
      if (!pads.length && packId) {
        try {
          const manifest = await fetch('/instruments/' + packId + '/instrument.json').then((r) => r.json());
          const roots = [...new Set((manifest.zones ?? [])
            .filter((zone) => zone.file && zone.lovel <= 108 && zone.hivel >= 108 && zone.trigger !== 'release')
            .map((zone) => zone.root ?? zone.lokey))].sort((a, b) => a - b);
          if (roots.length) {
            const picks = new Set([roots[0], roots[Math.floor(roots.length / 2)], roots[roots.length - 1]]);
            notes = [...picks];
          }
        } catch (error) { /* keep the default chord */ }
      }
      let total = 0;
      let rendered = 0;
      for (let take = 0; take < 3; take++) {
        const ctx = new OfflineAudioContext(2, 48000 * 1.5, 48000);
        const dev = audioEngine.instantiateDeviceOnContext(ctx, type, 'cal_' + type + '_' + take, 'cal');
        if (!dev) break;
        dev.isPowered = true;
        const left = dev.audioOutputs?.get('out_l');
        const right = dev.audioOutputs?.get('out_r');
        if (!left || !right) break;
        left.connect(ctx.destination);
        right.connect(ctx.destination);
        await dev.ready?.();
        for (const note of notes) dev.noteOn(note, 0.85, 0);
        const buffer = await ctx.startRendering();
        let peak = 0;
        for (const channel of [buffer.getChannelData(0), buffer.getChannelData(1)]) {
          for (let i = 0; i < channel.length; i++) {
            const value = Math.abs(channel[i]);
            if (value > peak) peak = value;
          }
        }
        total += peak;
        rendered++;
      }
      if (rendered) out.push({ type, peak: total / rendered });
    } catch (error) {
      out.push({ type, error: String((error && error.message) || error) });
    }
  }
  return out;
})()`;

const instrumentScript = (legacy) => `(async () => {
  const { DEVICE_SPECS } = await import('/shared/rack/devices/index.ts');
  const instruments = DEVICE_SPECS.filter((s) => s.kind === 'instrument');
  return {
    synths: [...new Set([...instruments.filter((s) => !s.type.startsWith('rec_')).map((s) => s.type), ...${JSON.stringify(legacy)}])],
    packs: instruments.filter((s) => s.type.startsWith('rec_')).map((s) => s.type),
  };
})()`;

const port = await freePort();
const debugPort = await freePort();
// Outside the project: the dev server watches the root, and Chrome locks its own profile files
// (EBUSY), which kills the server. Same reason scripts/local-temp.mjs exists.
const profile = path.join(os.tmpdir(), `unbox-calibrate-${process.pid}`);
fs.mkdirSync(profile, { recursive: true });

// The project's own Vite config, in-process: the app has to boot exactly as it does in `npm run dev`
// (the probe shim does not prebundle react-dom, so the app cannot mount there).
const { createServer } = await import('vite');
const server = await createServer({
  root,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
});
await server.listen();

const browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp;
try {
  let wsUrl = null;
  for (let attempt = 0; attempt < 100 && !wsUrl; attempt++) {
    try {
      const info = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
      wsUrl = info.webSocketDebuggerUrl ?? null;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!wsUrl) throw new Error('Chrome did not expose a DevTools endpoint.');

  cdp = await Cdp.connect(wsUrl);
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: `http://127.0.0.1:${port}/` });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);

  const waitForApp = async (timeoutMs = 90_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ready = await evaluate(cdp, sessionId, `document.querySelectorAll('[role=tab]').length > 0`).catch(() => false);
      if (ready) return;
      if (Date.now() > deadline) {
        const state = await evaluate(cdp, sessionId, `location.href + ' | title=' + document.title + ' | scripts=' + document.scripts.length`).catch(() => 'unknown');
        throw new Error(`The app did not finish booting inside Chrome (${state}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  };

  await waitForApp();

  const catalog = requested.length ? null : await evaluate(cdp, sessionId, instrumentScript(LEGACY_TYPES));

  /** Measures a list in batches, recycling the page so decoded pack buffers are released. */
  const runMeasure = async (list, batchSize, reloadEvery) => {
    const results = [];
    let sinceReload = 0;
    for (let i = 0; i < list.length; i += batchSize) {
      if (reloadEvery && sinceReload >= reloadEvery) {
        await cdp.send('Page.reload', {}, sessionId);
        await waitForApp();
        sinceReload = 0;
      }
      const batch = list.slice(i, i + batchSize);
      const done = await evaluate(cdp, sessionId, measureScript(batch)).catch((error) => {
        log(`  batch failed (${error.message}) — continuing`);
        return [];
      });
      for (const entry of done ?? []) {
        if (entry.error) log(`  ${entry.type}: skipped (${entry.error})`);
        else results.push(entry);
      }
      sinceReload += batch.length;
      log(`  measured ${Math.min(i + batch.length, list.length)}/${list.length}`);
    }
    return results;
  };

  let measured = [];
  if (requested.length) {
    measured = merge
      ? await runMeasure(requested, 2, 4)
      : await runMeasure(requested, SYNTH_BATCH, 0);
  } else {
    measured = await runMeasure(catalog.synths, SYNTH_BATCH, 0);
    if (!synthsOnly) {
      log(`Measuring ${catalog.packs.length} recorded packs (this is the slow part)…`);
      // Sample playback is deterministic, so a pack needs one take; only the synth engines drift.
      const packs = await runMeasure(catalog.packs, PACK_BATCH, PACK_RELOAD_EVERY);
      measured = [...measured, ...packs];
    }
  }

  if (!measured.length) throw new Error('No device produced audio — nothing to calibrate.');

  if (requested.length && !merge) {
    for (const { type, peak } of measured) {
      const trim = peak > 0.001 ? (TARGET / peak).toFixed(4) : 'silent — not written';
      log(`${type}: peak ${peak.toFixed(4)} -> trim ${trim}`);
    }
  } else if (requested.length) {
    // Merge: keep every existing measurement and override only the types measured now.
    const existing = new Map();
    if (fs.existsSync(OUT)) {
      for (const match of fs.readFileSync(OUT, 'utf8').matchAll(/^ {2}([a-z0-9_]+): ([0-9.]+),$/gm)) existing.set(match[1], Number(match[2]));
    }
    let updated = 0;
    for (const { type, peak } of measured.filter((entry) => entry.peak > 0.001)) {
      const before = existing.get(type);
      const raw = TARGET / peak;
      const trim = Math.max(0.01, Math.min(MAX_TRIM, Number(raw.toFixed(4))));
      if (raw > MAX_TRIM) log(`  ${type}: peak ${peak.toFixed(4)} would need ${raw.toFixed(2)} — capped at ${MAX_TRIM}`);
      existing.set(type, trim);
      const shift = before ? (20 * Math.log10(trim / before)).toFixed(2) : 'new';
      log(`  ${type}: peak ${peak.toFixed(4)} -> trim ${trim} (was ${before ?? '—'}, ${shift} dB)`);
      updated++;
    }
    const rows = [...existing.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const body = rows.map(([type, trim]) => `  ${type}: ${trim},`).join('\n');
    fs.writeFileSync(
      OUT,
      `/**\n * GENERATED by scripts/calibrate-levels.mjs — do not edit by hand.\n` +
        ` * \`npm run calibrate:levels\` re-measures every playable instrument in Chrome — built-in types\n` +
        ` * and each recorded pack — and rewrites this file. The method and the target are documented in\n` +
        ` * ./levelCalibration.ts.\n */\n` +
        `export const MEASURED_TYPE_TRIM: Readonly<Record<string, number>> = {\n${body}\n};\n`,
      'utf8',
    );
    log(`Merged ${updated} measurement(s); ${rows.length} types in the table`);
  } else {
    const rows = measured
      .filter(({ peak }) => peak > 0.001)
      .map(({ type, peak }) => [type, Math.max(0.01, Math.min(MAX_TRIM, Number((TARGET / peak).toFixed(4))))])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const body = rows.map(([type, trim]) => `  ${type}: ${trim},`).join('\n');
    fs.writeFileSync(
      OUT,
      `/**\n * GENERATED by scripts/calibrate-levels.mjs — do not edit by hand.\n` +
        ` * \`npm run calibrate:levels\` re-measures every playable instrument in Chrome — built-in types\n` +
        ` * and each recorded pack — and rewrites this file. The method and the target are documented in\n` +
        ` * ./levelCalibration.ts.\n */\n` +
        `export const MEASURED_TYPE_TRIM: Readonly<Record<string, number>> = {\n${body}\n};\n`,
      'utf8',
    );
    const packs = rows.filter(([type]) => type.startsWith('rec_')).length;
    log(`Wrote ${rows.length} measured types (${packs} recorded packs) to ${path.relative(root, OUT)}`);
  }
} finally {
  cdp?.close();
  browser.kill();
  await server.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.rmSync(profile, { recursive: true, force: true });
}
