'use strict';

const parentPort = process.parentPort;
console.log(`Electron utility worker entered (parent port: ${parentPort ? 'available' : 'missing'})`);
if (!parentPort) process.exit(2);
// Electron's utility-process parent port alone does not retain the worker event loop on this
// Windows build. Keep this tiny control-only fixture alive until the explicit shutdown message.
const keepAlive = setInterval(() => {}, 1_000);

parentPort.on('message', (event) => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') {
    parentPort.postMessage({ type: 'error', message: 'invalid probe message' });
    return;
  }
  if (message.type === 'control-probe') {
    parentPort.postMessage({ type: 'control-ack', protocol: message.protocol });
    return;
  }
  if (message.type === 'shared-memory-probe') {
    parentPort.postMessage({ type: 'shared-memory-received', isShared: message.shared instanceof SharedArrayBuffer });
    return;
  }
  if (message.type === 'shutdown') {
    clearInterval(keepAlive);
    process.exit(0);
  }
});
