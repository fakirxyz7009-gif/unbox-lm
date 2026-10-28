'use strict';

const parentPort = process.parentPort;
if (!parentPort) process.exit(2);

parentPort.once('message', (event) => {
  const config = event.data;
  if (!config || config.type !== 'start' || !(config.shared instanceof SharedArrayBuffer)) {
    parentPort.postMessage({ type: 'error', message: 'shared audio ring was not received' });
    process.exit(2);
  }

  const header = new Int32Array(config.shared, 0, 8);
  const samples = new Float32Array(config.shared, 32);
  const samplesPerBlock = config.framesPerBlock * config.channels;
  let checksum = 0;

  function processAvailableBlocks() {
    let read = Atomics.load(header, 1);
    const write = Atomics.load(header, 0);
    while (read < write) {
      const offset = (read % config.ringSlots) * samplesPerBlock;
      const end = offset + samplesPerBlock;
      for (let i = offset; i < end; i += 1) {
        samples[i] *= config.gain;
        checksum += samples[i];
      }
      read += 1;
      Atomics.store(header, 1, read);
      Atomics.add(header, 2, 1);
    }

    if (Atomics.load(header, 3) === 1 && read >= Atomics.load(header, 0)) {
      parentPort.postMessage({ type: 'complete', checksum });
      setTimeout(() => process.exit(0), 20);
      return;
    }
    setTimeout(processAvailableBlocks, 0);
  }

  processAvailableBlocks();
});
