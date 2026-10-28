'use strict';

const { fork } = require('node:child_process');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const FRAMES = 128;
const CHANNELS = 2;
const BLOCK_COUNT = 2400;
const MAX_IN_FLIGHT = 4;
const SAMPLE_RATE = 48_000;
const GAIN = 0.5;
const workerPath = path.join(__dirname, 'ipc-transport-worker.cjs');

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function makeBlock(sequence) {
  const samples = new Float32Array(FRAMES * CHANNELS);
  for (let frame = 0; frame < FRAMES; frame++) {
    const phase = (sequence * FRAMES + frame) * (2 * Math.PI * 440 / SAMPLE_RATE);
    samples[frame * 2] = Math.sin(phase) * 0.25;
    samples[frame * 2 + 1] = Math.sin(phase) * 0.125;
  }
  return samples;
}

async function main() {
  const child = fork(workerPath, [], {
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout?.on('data', (chunk) => process.stdout.write(`[worker] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[worker] ${chunk}`));

  const messages = [];
  const pending = new Map();
  const latenciesMs = [];
  let wake;
  let workerExit;
  let maxInFlight = 0;
  let queueSaturations = 0;
  let checksum = 0;
  let expectedAck = 0;
  let failure = null;

  child.on('message', (message) => {
    if (message?.type === 'error') {
      failure = new Error(`Worker rejected block ${message.seq}: ${message.error}`);
    } else if (message?.type === 'processed') {
      messages.push(message);
    }
    wake?.();
    wake = undefined;
  });
  child.on('error', (error) => {
    failure = error;
    wake?.();
    wake = undefined;
  });
  workerExit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));

  const waitMessage = async (timeoutMs) => {
    const deadline = performance.now() + timeoutMs;
    while (!messages.length && !failure) {
      if (child.exitCode !== null || child.signalCode !== null) {
        const result = await workerExit;
        throw new Error(`Worker exited before acknowledging the block stream (code=${result.code}, signal=${result.signal}).`);
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error(`Worker response timed out with ${pending.size} blocks outstanding.`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          wake = undefined;
          reject(new Error('Worker response timed out.'));
        }, remaining);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    if (failure) throw failure;
    const message = messages.shift();
    if (!message || message.seq !== expectedAck) {
      throw new Error(`Out-of-order worker response: expected ${expectedAck}, got ${message?.seq ?? 'none'}.`);
    }
    const original = pending.get(message.seq);
    if (!original) throw new Error(`Worker returned unknown or duplicate block ${message.seq}.`);
    if (!(message.samples instanceof Float32Array) || message.samples.length !== FRAMES * CHANNELS) {
      throw new Error(`Worker returned a malformed audio payload for block ${message.seq}.`);
    }
    for (let index = 0; index < original.samples.length; index++) {
      const expected = Math.fround(original.samples[index] * GAIN);
      const actual = message.samples[index];
      if (Math.abs(expected - actual) > 1e-7) {
        throw new Error(`Audio sample mismatch at block ${message.seq}, sample ${index}: expected ${expected}, got ${actual}.`);
      }
      checksum += Math.abs(actual);
    }
    latenciesMs.push(performance.now() - original.sentAt);
    pending.delete(message.seq);
    expectedAck++;
  };

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker did not send its startup handshake.')), 5000);
      const onReady = (message) => {
        if (message?.type !== 'ready') return;
        clearTimeout(timer);
        child.off('message', onReady);
        if (message.frames !== FRAMES || message.channels !== CHANNELS) reject(new Error('Worker negotiated an unexpected audio-block format.'));
        else resolve();
      };
      child.on('message', onReady);
      if (child.exitCode !== null) reject(new Error(`Worker exited during startup with code ${child.exitCode}.`));
    });

    const startedAt = performance.now();
    for (let sequence = 0; sequence < BLOCK_COUNT; sequence++) {
      if (pending.size >= MAX_IN_FLIGHT) {
        queueSaturations++;
        await waitMessage(5000);
      }
      const samples = makeBlock(sequence);
      const sentAt = performance.now();
      pending.set(sequence, { samples, sentAt });
      maxInFlight = Math.max(maxInFlight, pending.size);
      child.send({ type: 'process', seq: sequence, sentAt, samples }, (error) => {
        if (error) {
          failure = error;
          wake?.();
          wake = undefined;
        }
      });
    }
    while (pending.size) await waitMessage(5000);
    const elapsedMs = performance.now() - startedAt;
    const periodMs = FRAMES / SAMPLE_RATE * 1000;
    const blockThroughput = BLOCK_COUNT / (elapsedMs / 1000);
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    if (expectedAck !== BLOCK_COUNT || latenciesMs.length !== BLOCK_COUNT) {
      throw new Error(`Incomplete block stream: ${expectedAck}/${BLOCK_COUNT} acknowledged.`);
    }
    if (maxInFlight > MAX_IN_FLIGHT || pending.size !== 0 || !Number.isFinite(checksum)) {
      throw new Error('Bounded queue or output-integrity assertion failed.');
    }
    if (queueSaturations === 0) throw new Error('Probe never exercised its bounded-queue backpressure.');

    console.log('PASS: bounded Node child-process stereo audio-message transport probe');
    console.log(`  blocks=${BLOCK_COUNT}, format=${SAMPLE_RATE} Hz / ${FRAMES} frames / ${CHANNELS} channels`);
    console.log(`  block-period=${periodMs.toFixed(3)} ms, max-in-flight=${maxInFlight}/${MAX_IN_FLIGHT}, backpressure-events=${queueSaturations}`);
    console.log(`  round-trip-ms p50=${percentile(sorted, 0.50).toFixed(3)} p95=${percentile(sorted, 0.95).toFixed(3)} p99=${percentile(sorted, 0.99).toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`);
    console.log(`  offline-throughput=${blockThroughput.toFixed(0)} blocks/s (${(blockThroughput / (1000 / periodMs)).toFixed(2)}× real-time), output-checksum=${checksum.toFixed(6)}`);
    console.log('  scope=asynchronous Node IPC baseline only; not Electron utilityProcess, live audio, VST3 DSP, or real-time dropout evidence');
  } finally {
    if (child.connected) child.send({ type: 'close' });
    if (child.exitCode === null && child.signalCode === null) {
      const exited = await Promise.race([workerExit, new Promise((resolve) => setTimeout(() => resolve(null), 1000))]);
      if (!exited) child.kill();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
