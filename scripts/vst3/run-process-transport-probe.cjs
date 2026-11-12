'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');

const FRAMES = 128;
const CHANNELS = 2;
const BLOCK_COUNT = 2400;
const MAX_IN_FLIGHT = 4;
const SAMPLE_RATE = 48_000;
const PERIOD_MS = FRAMES / SAMPLE_RATE * 1000;
const PLUGIN_LATENCY_FRAMES = SAMPLE_RATE;
const DELAYED_BLOCKS = PLUGIN_LATENCY_FRAMES / FRAMES;
const READY_SEQUENCE = 0xffff_ffff;

function makeInput(sequence) {
  const samples = new Float32Array(FRAMES * CHANNELS);
  for (let frame = 0; frame < FRAMES; frame++) {
    const globalFrame = sequence * FRAMES + frame;
    const left = ((globalFrame % 97) - 48) / 64;
    samples[frame * 2] = left;
    samples[frame * 2 + 1] = -left / 2;
  }
  return samples;
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function main() {
  const hostPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
  const pluginPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
  const paced = process.argv[4] === '--paced';
  if (!hostPath || !pluginPath || !fs.existsSync(hostPath) || !fs.existsSync(pluginPath)) {
    throw new Error('Usage: node run-process-transport-probe.cjs <project-owned-host.exe> <project-owned-plugin.vst3>');
  }

  const child = spawn(hostPath, [pluginPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let input = Buffer.alloc(0);
  let fatalError = null;
  let ending = false;
  let completed = false;
  const responses = [];
  const waiters = [];
  const pending = new Map();
  const roundTripMs = [];
  let maxInFlight = 0;
  let backpressureEvents = 0;
  let checksum = 0;
  let acknowledgements = 0;
  let expectedSequence = 0;
  let deadlineMisses = 0;
  let lateScheduleBlocks = 0;
  let maxScheduleLatenessMs = 0;

  const fail = (error) => {
    if (fatalError) return;
    fatalError = error instanceof Error ? error : new Error(String(error));
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(fatalError);
    }
  };
  const enqueue = (message) => {
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      responses.push(message);
    }
  };
  const takeResponse = (timeoutMs = 10_000) => {
    if (fatalError) return Promise.reject(fatalError);
    if (responses.length) return Promise.resolve(responses.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`Native process response timed out; ${pending.size} blocks remain outstanding.`));
      }, timeoutMs);
      waiters.push(waiter);
    });
  };
  const acceptResponse = async () => {
    const message = await takeResponse();
    if (!message || message.sequence !== expectedSequence || message.frames !== FRAMES || !message.samples) {
      throw new Error(`Malformed or out-of-order response: expected block ${expectedSequence}, received ${JSON.stringify({ sequence: message?.sequence, frames: message?.frames })}.`);
    }
    const original = pending.get(message.sequence);
    if (!original) throw new Error(`Native host returned unknown or duplicate block ${message.sequence}.`);
    const sourceSequence = message.sequence - DELAYED_BLOCKS;
    const expected = sourceSequence >= 0 ? makeInput(sourceSequence) : null;
    for (let index = 0; index < message.samples.length; index++) {
      const wanted = expected?.[index] ?? 0;
      const actual = message.samples[index];
      if (Math.abs(actual - wanted) > 1e-6) {
        throw new Error(`VST3 delayed-sample mismatch at output block ${message.sequence}, sample ${index}: expected ${wanted}, got ${actual}.`);
      }
      checksum += Math.abs(actual);
    }
    const latency = performance.now() - original.sentAt;
    roundTripMs.push(latency);
    if (paced && latency > 2 * PERIOD_MS) deadlineMisses++;
    pending.delete(message.sequence);
    expectedSequence++;
    acknowledgements++;
  };

  let stdoutClosed = false;
  child.stdout.on('data', (chunk) => {
    input = input.length ? Buffer.concat([input, chunk]) : chunk;
    while (input.length >= 8) {
      const sequence = input.readUInt32LE(0);
      const frames = input.readUInt32LE(4);
      if (frames > FRAMES) {
        fail(new Error(`Native host emitted an invalid frame count: ${frames}.`));
        return;
      }
      const byteLength = 8 + frames * CHANNELS * Float32Array.BYTES_PER_ELEMENT;
      if (input.length < byteLength) return;
      if (sequence === READY_SEQUENCE && frames === 0) {
        enqueue({ type: 'ready', sequence, frames: 0 });
      } else {
        if (frames !== FRAMES) {
          fail(new Error(`Native host returned ${frames}-frame block ${sequence}; expected ${FRAMES}.`));
          return;
        }
        const samples = new Float32Array(frames * CHANNELS);
        for (let index = 0; index < samples.length; index++) samples[index] = input.readFloatLE(8 + index * 4);
        enqueue({ sequence, frames, samples });
      }
      input = input.subarray(byteLength);
    }
  });
  child.stdout.on('close', () => { stdoutClosed = true; });
  child.stderr.on('data', (chunk) => process.stderr.write(`[native-vst3-host] ${chunk}`));
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    if (!ending || code !== 0) fail(new Error(`Native VST3 host exited unexpectedly (code=${code}, signal=${signal}).`));
  });

  try {
    const ready = await takeResponse(10_000);
    if (ready?.type !== 'ready') throw new Error('Native VST3 host did not send its ready handshake.');

    const startedAt = performance.now() + (paced ? PERIOD_MS : 0);
    for (let sequence = 0; sequence < BLOCK_COUNT; sequence++) {
      if (pending.size >= MAX_IN_FLIGHT) {
        backpressureEvents++;
        await acceptResponse();
      }
      if (paced) {
        const dueAt = startedAt + sequence * PERIOD_MS;
        await waitUntil(dueAt);
        const lateByMs = Math.max(0, performance.now() - dueAt);
        maxScheduleLatenessMs = Math.max(maxScheduleLatenessMs, lateByMs);
        if (lateByMs > 1) lateScheduleBlocks++;
      }
      const samples = makeInput(sequence);
      const packet = Buffer.allocUnsafe(8 + samples.length * Float32Array.BYTES_PER_ELEMENT);
      packet.writeUInt32LE(sequence, 0);
      packet.writeUInt32LE(FRAMES, 4);
      for (let index = 0; index < samples.length; index++) packet.writeFloatLE(samples[index], 8 + index * 4);
      pending.set(sequence, { sentAt: performance.now() });
      maxInFlight = Math.max(maxInFlight, pending.size);
      if (!child.stdin.write(packet)) await once(child.stdin, 'drain');
    }
    while (pending.size) await acceptResponse();
    const elapsedMs = performance.now() - startedAt;
    ending = true;
    child.stdin.end();
    const [exitCode, exitSignal] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Native VST3 host did not exit after the input stream closed.')), 10_000)),
    ]);
    if (exitCode !== 0 || exitSignal) throw new Error(`Native VST3 host teardown failed (code=${exitCode}, signal=${exitSignal}).`);

    const sorted = [...roundTripMs].sort((a, b) => a - b);
    const throughput = BLOCK_COUNT / (elapsedMs / 1000);
    if (acknowledgements !== BLOCK_COUNT || maxInFlight > MAX_IN_FLIGHT || pending.size !== 0 || !stdoutClosed) {
      throw new Error('Native VST3 process-stream count, queue, or teardown assertion failed.');
    }
    if ((!paced && backpressureEvents === 0) || !Number.isFinite(checksum) || checksum <= 0) {
      throw new Error('Probe did not exercise bounded backpressure or returned an empty/invalid render.');
    }

    console.log(`PASS: ${paced ? 'wall-clock-paced' : 'offline-burst'} isolated project-owned VST3 process-stream probe`);
    console.log(`  plugin=Unbox Test Delay; blocks=${BLOCK_COUNT}; format=${SAMPLE_RATE} Hz / ${FRAMES} frames / stereo`);
    console.log(`  declared-plugin-latency=${PLUGIN_LATENCY_FRAMES} frames (${(PLUGIN_LATENCY_FRAMES / SAMPLE_RATE).toFixed(3)} s); queue=${maxInFlight}/${MAX_IN_FLIGHT}; backpressure-events=${backpressureEvents}`);
    console.log(`  process round-trip ms p50=${percentile(sorted, 0.50).toFixed(3)} p95=${percentile(sorted, 0.95).toFixed(3)} p99=${percentile(sorted, 0.99).toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`);
    console.log(`  ${paced ? 'paced-throughput' : 'offline-throughput'}=${throughput.toFixed(0)} blocks/s (${(throughput / (1000 / PERIOD_MS)).toFixed(2)}× nominal block rate); output-checksum=${checksum.toFixed(6)}`);
    if (paced) console.log(`  2-block-response-deadline-misses=${deadlineMisses}; producer-late-over-1ms=${lateScheduleBlocks}/${BLOCK_COUNT}; max-schedule-lateness=${maxScheduleLatenessMs.toFixed(3)} ms`);
    console.log(`  scope=real VST3 DSP in a separate native child process with bounded stdio messages; ${paced ? 'wall-clock paced without an audio device or callback' : 'offline burst'}; not Electron utilityProcess or DAW integration`);
  } finally {
    if (child.exitCode === null) {
      child.kill();
    }
  }
}

async function waitUntil(targetTime) {
  let remaining = targetTime - performance.now();
  while (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
    remaining = targetTime - performance.now();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
