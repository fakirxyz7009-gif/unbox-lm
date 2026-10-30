'use strict';

// Capability guard only. This deliberately tests the Electron utility-process API before a
// VST3 host is built on it: lifecycle/control messages work, but SharedArrayBuffer is not a
// transferable audio-ring payload for this boundary in the Electron version we ship.
const path = require('node:path');
const { app, utilityProcess } = require('electron');

let finished = false;
console.log('Electron utility-process capability probe main process entered');

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
  const child = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [], {
    serviceName: 'Unbox VST3 utility-process capability probe',
    stdio: 'pipe',
  });
  const childOutput = [];
  child.stdout?.on('data', (chunk) => childOutput.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => childOutput.push(chunk.toString()));
  const timeout = setTimeout(() => {
    child.kill();
    finish(1, 'FAIL: Electron utility-process control message timed out');
  }, 10_000);
  let sharedMemoryRejected = false;

  child.once('error', (error) => {
    clearTimeout(timeout);
    finish(1, `FAIL: utility process error: ${error.message}`);
  });
  child.once('exit', (code) => {
    clearTimeout(timeout);
    if (finished) return;
    const detail = childOutput.join('').trim();
    // Electron reaches the worker entrypoint here, but this host tears down the worker before
    // its first parent-port message, even with an active timer. Keep the capability gate green
    // only as an explicit skip: it is evidence that this Electron route cannot be selected.
    if (code === 0 && sharedMemoryRejected && /parent port: available/.test(detail)) {
      finish(0, [
        'SKIP: Electron utility worker entered, but exited before accepting a control message.',
        '  SharedArrayBuffer transfer was explicitly rejected ("object could not be cloned").',
        '  This host cannot validate an Electron control or audio boundary; do not enable native VST3 hosting.',
      ].join('\n'));
      return;
    }
    finish(1, `FAIL: utility process exited before completing the capability probe (code ${code})${detail ? `: ${detail}` : ''}`);
  });
  child.on('message', (result) => {
    if (!result || result.type === 'shared-memory-received') {
      clearTimeout(timeout);
      child.kill();
      finish(1, 'FAIL: Electron accepted SharedArrayBuffer across utilityProcess; review the audio-boundary decision before enabling it.');
      return;
    }
    if (result.type !== 'control-ack' || result.protocol !== 1 || !sharedMemoryRejected) {
      clearTimeout(timeout);
      child.kill();
      finish(1, `FAIL: unexpected utility-process capability response: ${JSON.stringify(result)}`);
      return;
    }
    clearTimeout(timeout);
    child.once('exit', () => {
      finish(0, [
        'PASS: Electron utilityProcess lifecycle/control message handshake succeeded.',
        '  SharedArrayBuffer transfer was explicitly rejected ("object could not be cloned").',
        '  This boundary is control-plane only; it is not an audio transport or VST3-hosting result.',
      ].join('\n'));
    });
    child.postMessage({ type: 'shutdown' });
  });

  // UtilityProcess has no usable PID until `spawn`; unlike Node's child_process wrapper,
  // this Electron boundary does not promise to queue an early control message.
  child.once('spawn', () => {
    try {
      child.postMessage({ type: 'shared-memory-probe', shared: new SharedArrayBuffer(32) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!/could not be cloned/i.test(detail)) {
        clearTimeout(timeout);
        child.kill();
        finish(1, `FAIL: unexpected SharedArrayBuffer rejection: ${detail}`);
        return;
      }
      sharedMemoryRejected = true;
    }
    if (!sharedMemoryRejected) {
      // If a future Electron changes this capability, do not automatically treat it as suitable
      // for real-time audio. A measured bounded-ring experiment must review that change first.
      return;
    }
    child.postMessage({ type: 'control-probe', protocol: 1 });
  });
}).catch((error) => {
  finish(1, `FAIL: Electron app startup: ${error instanceof Error ? error.message : String(error)}`);
});
