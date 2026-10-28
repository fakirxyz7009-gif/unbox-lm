'use strict';

// Diagnostic only: this probe exercises Electron's utility-process boundary without
// starting the DAW renderer. --no-sandbox is used only by the local test command because
// this Windows sandbox prevents a normal Electron app from reaching app.whenReady().
const path = require('node:path');
const { app, utilityProcess } = require('electron');

const FRAMES_PER_BLOCK = 128;
const CHANNELS = 2;
const SAMPLE_RATE = 48_000;
const RING_SLOTS = 32;
const BLOCKS = 2_400;
const GAIN = 0.75;
const SAMPLE_VALUE = 0.25;
const HEADER_BYTES = 32;
const HEADER_WORDS = HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT;

let finished = false;
console.log('Electron boundary probe main process entered');
const bootTimeout = setTimeout(() => {
  finish(1, 'FAIL: Electron app did not become ready within 8 seconds');
}, 8_000);

function finish(code, message) {
  if (finished) return;
  finished = true;
  clearTimeout(bootTimeout);
  if (message) console.log(message);
  app.exit(code);
}

app.whenReady().then(() => {
  clearTimeout(bootTimeout);
  const samplesPerBlock = FRAMES_PER_BLOCK * CHANNELS;
  const shared = new SharedArrayBuffer(
    HEADER_BYTES + RING_SLOTS * samplesPerBlock * Float32Array.BYTES_PER_ELEMENT,
  );
  const header = new Int32Array(shared, 0, HEADER_WORDS);
  const samples = new Float32Array(shared, HEADER_BYTES);
  const child = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [], {
    serviceName: 'Unbox VST3 boundary probe',
    stdio: 'ignore',
  });
  const timeout = setTimeout(() => {
    child.kill();
    finish(1, 'FAIL: utility-process probe timed out');
  }, 20_000);
  let blocksWritten = 0;
  let maxQueue = 0;
  let receivedResult = false;
  const periodMs = (FRAMES_PER_BLOCK / SAMPLE_RATE) * 1_000;
  let deadline = performance.now();

  child.once('error', (error) => {
    clearTimeout(timeout);
    finish(1, `FAIL: utility process error: ${error.message}`);
  });
  child.once('exit', (code) => {
    clearTimeout(timeout);
    if (!receivedResult && !finished) finish(1, `FAIL: utility process exited before returning results (code ${code})`);
  });
  child.on('message', (result) => {
    receivedResult = true;
    const expected = BLOCKS * samplesPerBlock * SAMPLE_VALUE * GAIN;
    const processed = Atomics.load(header, 2);
    const overflow = Atomics.load(header, 4);
    const checksumError = Math.abs(result.checksum - expected);
    if (result.type !== 'complete' || processed !== BLOCKS || overflow !== 0 || checksumError > 0.01) {
      child.kill();
      finish(1, `FAIL: blocks=${processed}/${BLOCKS}, overflow=${overflow}, checksum error=${checksumError}`);
      return;
    }
    child.once('exit', () => {
      const scheduledSeconds = (BLOCKS * FRAMES_PER_BLOCK) / SAMPLE_RATE;
      finish(0, [
        'PASS: Electron utilityProcess shared-memory audio-block prototype',
        `  ${BLOCKS} blocks × ${FRAMES_PER_BLOCK} stereo frames @ ${SAMPLE_RATE} Hz (${scheduledSeconds.toFixed(2)} s scheduled)`,
        `  ring=${RING_SLOTS} blocks, maximum occupancy=${maxQueue}, overflow=${overflow}`,
        `  cross-process gain/checksum verified; this is a transport probe, not live DAW audio or a VST3 plugin test`,
      ].join('\n'));
    });
  });

  child.postMessage({
    type: 'start',
    shared,
    blocks: BLOCKS,
    framesPerBlock: FRAMES_PER_BLOCK,
    channels: CHANNELS,
    ringSlots: RING_SLOTS,
    gain: GAIN,
  });

  function produceBlock() {
    if (blocksWritten >= BLOCKS) {
      Atomics.store(header, 3, 1);
      Atomics.notify(header, 0);
      return;
    }

    const write = Atomics.load(header, 0);
    const read = Atomics.load(header, 1);
    const queued = write - read;
    if (queued >= RING_SLOTS) {
      Atomics.add(header, 4, 1);
    } else {
      const offset = (write % RING_SLOTS) * samplesPerBlock;
      samples.fill(SAMPLE_VALUE, offset, offset + samplesPerBlock);
      Atomics.store(header, 0, write + 1);
      Atomics.notify(header, 0);
      maxQueue = Math.max(maxQueue, queued + 1);
    }
    blocksWritten += 1;
    deadline += periodMs;
    setTimeout(produceBlock, Math.max(0, deadline - performance.now()));
  }

  setTimeout(produceBlock, periodMs);
}).catch((error) => {
  finish(1, `FAIL: Electron app startup: ${error instanceof Error ? error.message : String(error)}`);
});
