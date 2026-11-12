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
const READY_SEQUENCE = 0xffff_ffff;
const REQUEST_HEADER_BYTES = 12;
const MIDI_EVENT_BYTES = 24;
const RESPONSE_HEADER_BYTES = 8;
const RESPONSE_BYTES = RESPONSE_HEADER_BYTES + FRAMES * CHANNELS * Float32Array.BYTES_PER_ELEMENT;
const TOLERANCE = 1e-5;

function eventsFor(sequence) {
  const pitch = 36 + (sequence % 48);
  const velocity = 0.4 + (sequence % 61) / 100;
  const noteOnOffset = 3 + (sequence % 7);
  const noteOffOffset = 80 + (sequence % 19);
  const noteId = sequence + 1;
  return { pitch, velocity, noteOnOffset, noteOffOffset, noteId };
}

function makePacket(sequence) {
  const events = eventsFor(sequence);
  const packet = Buffer.alloc(REQUEST_HEADER_BYTES + 2 * MIDI_EVENT_BYTES);
  packet.writeUInt32LE(sequence, 0);
  packet.writeUInt32LE(FRAMES, 4);
  packet.writeUInt32LE(2, 8);
  writeMidiEvent(packet, 12, events.noteOnOffset, 0, events.pitch, events.noteId, events.velocity, 0);
  writeMidiEvent(packet, 12 + MIDI_EVENT_BYTES, events.noteOffOffset, 1, events.pitch, events.noteId, 0, 0);
  return packet;
}

function writeMidiEvent(buffer, offset, sampleOffset, type, pitch, noteId, velocity, tuning) {
  buffer.writeUInt32LE(sampleOffset, offset);
  buffer.writeUInt32LE(type, offset + 4);
  buffer.writeInt32LE(pitch, offset + 8);
  buffer.writeInt32LE(noteId, offset + 12);
  buffer.writeFloatLE(velocity, offset + 16);
  buffer.writeFloatLE(tuning, offset + 20);
}

function expectedSample(sequence, frame) {
  const event = eventsFor(sequence);
  if (frame < event.noteOnOffset || frame >= event.noteOffOffset) return 0;
  const frequency = 440 * 2 ** ((event.pitch - 69) / 12);
  return Math.cos(2 * Math.PI * frequency * (frame - event.noteOnOffset) / SAMPLE_RATE) * event.velocity;
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function main() {
  const hostPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
  const pluginPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
  if (!hostPath || !pluginPath || !fs.existsSync(hostPath) || !fs.existsSync(pluginPath)) {
    throw new Error('Usage: node run-midi-process-transport-probe.cjs <project-owned-host.exe> <project-owned-synth.vst3>');
  }

  const child = spawn(hostPath, [pluginPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let input = Buffer.alloc(0);
  let fatalError = null;
  let ending = false;
  let stdoutClosed = false;
  const responses = [];
  const waiters = [];
  const pending = new Map();
  const roundTripMs = [];
  let maxInFlight = 0;
  let backpressureEvents = 0;
  let checksum = 0;
  let acknowledgements = 0;
  let expectedSequence = 0;
  let midiEventsChecked = 0;

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
        reject(new Error(`Native synth response timed out; ${pending.size} blocks remain outstanding.`));
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
    if (!original) throw new Error(`Native synth returned unknown or duplicate block ${message.sequence}.`);
    for (let frame = 0; frame < FRAMES; frame++) {
      const wanted = expectedSample(message.sequence, frame);
      for (let channel = 0; channel < CHANNELS; channel++) {
        const actual = message.samples[frame * CHANNELS + channel];
        if (Math.abs(actual - wanted) > TOLERANCE) {
          throw new Error(`MIDI render mismatch at block ${message.sequence}, frame ${frame}, channel ${channel}: expected ${wanted}, got ${actual}.`);
        }
        checksum += Math.abs(actual);
      }
    }
    midiEventsChecked += 2;
    roundTripMs.push(performance.now() - original.sentAt);
    pending.delete(message.sequence);
    expectedSequence++;
    acknowledgements++;
  };

  child.stdout.on('data', (chunk) => {
    input = input.length ? Buffer.concat([input, chunk]) : chunk;
    while (input.length >= RESPONSE_HEADER_BYTES) {
      const sequence = input.readUInt32LE(0);
      const frames = input.readUInt32LE(4);
      if (frames !== 0 && frames !== FRAMES) {
        fail(new Error(`Native synth emitted an invalid frame count: ${frames}.`));
        return;
      }
      const byteLength = frames === 0 ? RESPONSE_HEADER_BYTES : RESPONSE_BYTES;
      if (input.length < byteLength) return;
      if (sequence === READY_SEQUENCE && frames === 0) {
        enqueue({ type: 'ready', sequence, frames });
      } else {
        if (frames !== FRAMES) {
          fail(new Error(`Native synth returned ${frames}-frame block ${sequence}; expected ${FRAMES}.`));
          return;
        }
        const samples = new Float32Array(frames * CHANNELS);
        for (let index = 0; index < samples.length; index++) {
          samples[index] = input.readFloatLE(RESPONSE_HEADER_BYTES + index * 4);
        }
        enqueue({ sequence, frames, samples });
      }
      input = input.subarray(byteLength);
    }
  });
  child.stdout.on('close', () => { stdoutClosed = true; });
  child.stderr.on('data', (chunk) => process.stderr.write(`[native-vst3-midi-host] ${chunk}`));
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    if (!ending || code !== 0) fail(new Error(`Native MIDI VST3 host exited unexpectedly (code=${code}, signal=${signal}).`));
  });

  try {
    const ready = await takeResponse(10_000);
    if (ready?.type !== 'ready') throw new Error('Native MIDI VST3 host did not send its ready handshake.');

    const startedAt = performance.now();
    for (let sequence = 0; sequence < BLOCK_COUNT; sequence++) {
      if (pending.size >= MAX_IN_FLIGHT) {
        backpressureEvents++;
        await acceptResponse();
      }
      pending.set(sequence, { sentAt: performance.now() });
      maxInFlight = Math.max(maxInFlight, pending.size);
      if (!child.stdin.write(makePacket(sequence))) await once(child.stdin, 'drain');
    }
    while (pending.size) await acceptResponse();
    const elapsedMs = performance.now() - startedAt;
    ending = true;
    child.stdin.end();
    const [exitCode, exitSignal] = await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Native MIDI VST3 host did not exit after input closed.')), 10_000)),
    ]);
    if (exitCode !== 0 || exitSignal) throw new Error(`Native MIDI host teardown failed (code=${exitCode}, signal=${exitSignal}).`);

    const sorted = [...roundTripMs].sort((a, b) => a - b);
    if (acknowledgements !== BLOCK_COUNT || midiEventsChecked !== BLOCK_COUNT * 2 ||
        maxInFlight > MAX_IN_FLIGHT || pending.size !== 0 || !stdoutClosed ||
        backpressureEvents === 0 || !Number.isFinite(checksum) || checksum <= 0) {
      throw new Error('MIDI process-stream count, queue, output, or teardown assertion failed.');
    }

    const throughput = BLOCK_COUNT / (elapsedMs / 1000);
    console.log('PASS: offline isolated project-owned VST3 MIDI process-stream probe');
    console.log(`  plugin=Unbox Test MIDI Synth; blocks=${BLOCK_COUNT}; MIDI events=${midiEventsChecked}; format=${SAMPLE_RATE} Hz / ${FRAMES} frames / stereo`);
    console.log(`  ordered responses; event offsets, pitches, velocities, note-offs, and stereo samples checked; queue=${maxInFlight}/${MAX_IN_FLIGHT}; backpressure-events=${backpressureEvents}`);
    console.log(`  process round-trip ms p50=${percentile(sorted, 0.50).toFixed(3)} p95=${percentile(sorted, 0.95).toFixed(3)} p99=${percentile(sorted, 0.99).toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`);
    console.log(`  offline-throughput=${throughput.toFixed(0)} blocks/s; output-checksum=${checksum.toFixed(6)}`);
    console.log('  scope=deterministic test synth MIDI and audio across bounded native stdio; no audio device, live callback, or DAW integration');
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
