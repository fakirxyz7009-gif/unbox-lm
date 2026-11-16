'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const VST3_CLIP_SAMPLE_RATE = 48_000;
const VST3_CLIP_MAX_FRAMES = 30 * VST3_CLIP_SAMPLE_RATE;
const VST3_CLIP_DELAY_FRAMES = VST3_CLIP_SAMPLE_RATE;
const BLOCK_FRAMES = 128;
const HEADER_BYTES = 8;
const BLOCK_BYTES = 2 * BLOCK_FRAMES * Float32Array.BYTES_PER_ELEMENT;
const READY_SEQUENCE = 0xffff_ffff;
const MAX_IN_FLIGHT = 4;
const MAX_TIMEOUT_MS = 30_000;
const MAX_DIAGNOSTIC_CHARS = 2_048;

function validSource(request) {
  if (request?.sampleRate !== VST3_CLIP_SAMPLE_RATE) throw new Error('The VST3 delay requires a 48 kHz source.');
  const channels = request.channels;
  if (!Array.isArray(channels) || channels.length !== 2 || !(channels[0] instanceof Float32Array) || !(channels[1] instanceof Float32Array)) {
    throw new Error('The VST3 delay requires two Float32 audio channels.');
  }
  const [left, right] = channels;
  if (left.length !== right.length || left.length === 0 || left.length > VST3_CLIP_MAX_FRAMES) {
    throw new Error('The VST3 delay requires equal, nonempty channels with at most 30 seconds of audio.');
  }
  for (let frame = 0; frame < left.length; frame++) {
    if (!Number.isFinite(left[frame]) || !Number.isFinite(right[frame])) throw new Error('The VST3 input contains a non-finite sample.');
  }
  return channels;
}

function readOutput(stream) {
  const chunks = stream[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  return {
    async read(length) {
      while (pending.length < length) {
        const next = await chunks.next();
        if (next.done) throw new Error('The native VST3 host closed its output before the render was complete.');
        pending = pending.length ? Buffer.concat([pending, next.value]) : next.value;
      }
      const data = pending.subarray(0, length);
      pending = pending.subarray(length);
      return data;
    },
    async expectEnd() {
      if (pending.length || !(await chunks.next()).done) throw new Error('The native VST3 host returned unexpected trailing data.');
    },
  };
}

async function expectBlock(reader, sequence, frames) {
  const header = await reader.read(HEADER_BYTES);
  if (header.readUInt32LE(0) !== sequence || header.readUInt32LE(4) !== frames) {
    throw new Error(`Invalid response from the native VST3 host. Expected block ${sequence} with ${frames} frames.`);
  }
}

function inputBlock(channels, sequence) {
  const packet = Buffer.alloc(HEADER_BYTES + BLOCK_BYTES);
  packet.writeUInt32LE(sequence, 0);
  packet.writeUInt32LE(BLOCK_FRAMES, 4);
  const startFrame = sequence * BLOCK_FRAMES;
  const sourceFrames = Math.max(0, Math.min(BLOCK_FRAMES, channels[0].length - startFrame));
  for (let channel = 0; channel < 2; channel++) {
    const planeOffset = HEADER_BYTES + channel * BLOCK_BYTES / 2;
    for (let frame = 0; frame < sourceFrames; frame++) {
      packet.writeFloatLE(channels[channel][startFrame + frame], planeOffset + frame * Float32Array.BYTES_PER_ELEMENT);
    }
  }
  return packet;
}

function copyOutputBlock(packet, channels, sequence) {
  const startFrame = sequence * BLOCK_FRAMES;
  const frames = Math.min(BLOCK_FRAMES, channels[0].length - startFrame);
  for (let channel = 0; channel < 2; channel++) {
    const planeOffset = channel * BLOCK_BYTES / 2;
    for (let frame = 0; frame < BLOCK_FRAMES; frame++) {
      const sample = packet.readFloatLE(planeOffset + frame * Float32Array.BYTES_PER_ELEMENT);
      if (!Number.isFinite(sample)) throw new Error('The native VST3 host returned a non-finite sample.');
      if (frame < frames) channels[channel][startFrame + frame] = sample;
    }
  }
}

/**
 * Offline fixture processing. Electron main supplies absolute paths resolved from
 * its own fixture configuration. The renderer request supplies audio only.
 * @param {unknown} request
 * @param {{ hostPath: string, pluginPath: string, signal?: AbortSignal, timeoutMs?: number }} options
 */
async function renderVst3Clip(request, { hostPath, pluginPath, signal, timeoutMs = MAX_TIMEOUT_MS }) {
  const channels = validSource(request);
  if (!path.isAbsolute(hostPath) || !path.isAbsolute(pluginPath)) throw new Error('The VST3 fixture requires absolute host and plugin paths.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw new Error('Invalid native VST3 render deadline.');
  signal?.throwIfAborted();

  const length = channels[0].length + VST3_CLIP_DELAY_FRAMES;
  const output = [new Float32Array(length), new Float32Array(length)];
  const blockCount = Math.ceil(length / BLOCK_FRAMES);
  const child = spawn(hostPath, [pluginPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let failure;
  let diagnostics = '';
  let closed = false;
  const finished = new Promise((resolve) => child.once('close', (code) => {
    closed = true;
    resolve(code);
  }));
  const stop = (error) => {
    if (failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    child.stdin.destroy(failure);
    child.stdout.destroy(failure);
    child.stderr.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill();
  };
  child.on('error', stop);
  child.stdin.on('error', stop);
  child.stdout.on('error', stop);
  child.stderr.on('error', stop);
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    diagnostics += chunk.slice(0, MAX_DIAGNOSTIC_CHARS - diagnostics.length);
  });
  const deadline = setTimeout(() => stop(new Error('The native VST3 render timed out.')), timeoutMs);
  const cancel = () => stop(new Error('The native VST3 render was cancelled.', { cause: signal?.reason }));
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();

  try {
    const reader = readOutput(child.stdout);
    await expectBlock(reader, READY_SEQUENCE, 0);
    let sent = 0;
    for (let received = 0; received < blockCount; received++) {
      while (sent < blockCount && sent - received < MAX_IN_FLIGHT) {
        child.stdin.write(inputBlock(channels, sent));
        sent++;
      }
      await expectBlock(reader, received, BLOCK_FRAMES);
      copyOutputBlock(await reader.read(BLOCK_BYTES), output, received);
    }
    child.stdin.end();
    await reader.expectEnd();
    const exitCode = await finished;
    if (failure) throw failure;
    if (exitCode !== 0) throw new Error(`The native VST3 host exited with status ${exitCode}.`);
    return { sampleRate: VST3_CLIP_SAMPLE_RATE, channels: output };
  } catch (error) {
    if (!failure) {
      const message = error instanceof Error ? error.message : String(error);
      const detail = diagnostics.trim();
      stop(new Error(detail ? `${message} ${detail}` : message, { cause: error }));
    }
    throw failure;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
    if (!closed) stop(new Error('The native VST3 host did not close after the render.'));
    await finished;
  }
}

module.exports = { renderVst3Clip, VST3_CLIP_SAMPLE_RATE, VST3_CLIP_MAX_FRAMES, VST3_CLIP_DELAY_FRAMES };
