'use strict';

/**
 * Loads a third-party VST3 module through the generic out-of-process host and proves the DSP ran.
 *
 * The shipping host (process_stream_host.cpp) only accepts the project-owned Unbox Test Delay fixture,
 * so that path is untouched by this probe. Here we load whatever module the caller names, print what
 * its factory advertises, push a click through it, and measure where the click lands in the output.
 *
 * Usage: node run-third-party-host-probe.cjs <host.exe> <plugin.vst3> [--class NAME] [--param ID=VALUE]
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FRAMES = 128;
const CHANNELS = 2;
const SAMPLE_RATE = 48_000;
const BLOCK_COUNT = 750; // 2 s at 128 frames
const MAX_IN_FLIGHT = 4;
const READY_SEQUENCE = 0xffff_ffff;

function parseArgs(argv) {
  const [hostArg, pluginArg, ...rest] = argv;
  if (!hostArg || !pluginArg) {
    throw new Error('Usage: node run-third-party-host-probe.cjs <host.exe> <plugin.vst3> [--class NAME] [--param ID=VALUE]');
  }
  const hostPath = path.resolve(hostArg);
  const pluginPath = path.resolve(pluginArg);
  let wantedClass = '';
  const parameters = [];
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (token === '--class') wantedClass = rest[++index] ?? '';
    else if (token === '--param') parameters.push(rest[++index] ?? '');
    else throw new Error(`Unknown argument: ${token}`);
  }
  return { hostPath, pluginPath, wantedClass, parameters };
}

function requireFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} does not exist: ${file}`);
}

/** Runs the host with `--list` and returns every advertised class plus the module path. */
function listClasses(hostPath, pluginPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(hostPath, [pluginPath, '--list'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`--list exited ${code}: ${stderr.trim()}`));
        return;
      }
      const classes = [];
      let module = '';
      for (const line of stderr.split(/\r?\n/)) {
        if (line.startsWith('module ')) module = JSON.parse(line.slice(7)).path;
        if (line.startsWith('class ')) classes.push(JSON.parse(line.slice(6)));
      }
      resolve({ module, classes });
    });
  });
}

/** Streams a single click followed by silence through the plugin and returns the stereo output. */
function renderClick({ hostPath, pluginPath, wantedClass, parameters }) {
  return new Promise((resolve, reject) => {
    const args = [pluginPath];
    if (wantedClass) args.push('--class', wantedClass);
    for (const parameter of parameters) args.push('--param', parameter);
    const child = spawn(hostPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const output = [new Float32Array(BLOCK_COUNT * FRAMES), new Float32Array(BLOCK_COUNT * FRAMES)];
    let pending = Buffer.alloc(0);
    let expected = 0;
    let plugin = null;
    let ready = null;
    let stderr = '';
    let failure = null;
    let writable = true;

    const stop = (error) => {
      if (failure) return;
      failure = error instanceof Error ? error : new Error(String(error));
      child.stdin.destroy();
      child.stdout.destroy();
      if (child.exitCode === null && child.signalCode === null) child.kill();
    };

    // stderr arrives in pipe-sized chunks, so a metadata line can be split anywhere; buffer and only
    // parse complete lines, otherwise the JSON is truncated mid-string.
    let lineBuffer = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
      lineBuffer += chunk;
      let newline;
      while ((newline = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, newline).replace(/\r$/, '');
        lineBuffer = lineBuffer.slice(newline + 1);
        if (line.startsWith('plugin ')) plugin = JSON.parse(line.slice(7));
        else if (line.startsWith('ready ')) ready = JSON.parse(line.slice(6));
      }
    });
    child.on('error', stop);
    child.stdin.on('error', stop);

    child.stdout.on('data', (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= 8) {
        const sequence = pending.readUInt32LE(0);
        const frames = pending.readUInt32LE(4);
        const bytes = 8 + frames * CHANNELS * Float32Array.BYTES_PER_ELEMENT;
        if (pending.length < bytes) return;
        if (sequence === READY_SEQUENCE && frames === 0) {
          pending = pending.subarray(bytes);
          continue;
        }
        const start = sequence * FRAMES;
        for (let channel = 0; channel < CHANNELS; channel++) {
          const plane = 8 + channel * frames * Float32Array.BYTES_PER_ELEMENT;
          for (let frame = 0; frame < frames; frame++) {
            const value = pending.readFloatLE(plane + frame * Float32Array.BYTES_PER_ELEMENT);
            if (!Number.isFinite(value)) {
              stop(new Error(`non-finite sample at block ${sequence}, frame ${frame}`));
              return;
            }
            output[channel][start + frame] = value;
          }
        }
        pending = pending.subarray(bytes);
        expected++;
      }
    });

    child.once('close', (code) => {
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0) {
        reject(new Error(`host exited ${code}: ${stderr.trim()}`));
        return;
      }
      if (!plugin || !ready) {
        reject(new Error(`host did not report plugin metadata: ${stderr.trim()}`));
        return;
      }
      if (expected !== BLOCK_COUNT) {
        reject(new Error(`expected ${BLOCK_COUNT} processed blocks, received ${expected}`));
        return;
      }
      resolve({ plugin, ready, output });
    });

    // One click on the left channel, then silence: the peak of the response is the plugin's delay.
    const writeBlock = (sequence) => {
      const packet = Buffer.alloc(8 + FRAMES * CHANNELS * Float32Array.BYTES_PER_ELEMENT);
      packet.writeUInt32LE(sequence, 0);
      packet.writeUInt32LE(FRAMES, 4);
      if (sequence === 0) {
        for (const channel of [0, 1]) {
          const plane = 8 + channel * FRAMES * Float32Array.BYTES_PER_ELEMENT;
          packet.writeFloatLE(channel === 0 ? 0.9 : 0.5, plane);
        }
      }
      return packet;
    };

    let sent = 0;
    const pump = () => {
      while (writable && sent < BLOCK_COUNT && sent - expected < MAX_IN_FLIGHT) {
        writable = child.stdin.write(writeBlock(sent++));
      }
      if (sent === BLOCK_COUNT && expected === BLOCK_COUNT) child.stdin.end();
    };
    child.stdin.on('drain', () => { writable = true; pump(); });
    child.stdout.on('data', pump);
    pump();
  });
}

function rms(samples) {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

function peak(samples) {
  let index = -1;
  let value = 0;
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > value) {
      value = magnitude;
      index = i;
    }
  }
  return { index, value, atMs: (index / SAMPLE_RATE) * 1000 };
}

function differingSamples(left, right) {
  let count = 0;
  for (let i = 0; i < left.length; i++) if (Math.abs(left[i] - right[i]) > 1e-6) count++;
  return count;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  requireFile(options.hostPath, 'host');
  requireFile(options.pluginPath, 'plugin');
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('The third-party VST3 probe runs on Windows x64 only.');
  }

  const { module, classes } = await listClasses(options.hostPath, options.pluginPath);
  const effects = classes.filter((entry) => entry.category === 'Audio Module Class');
  if (!module || !classes.length) throw new Error('The factory advertised no classes.');
  if (!effects.length) throw new Error('The module advertises no audio-effect class.');

  const rendered = await renderClick(options);
  const [left, right] = rendered.output;
  const outputLevel = rms(left);
  const response = peak(left);
  const changed = differingSamples(left, new Float32Array(left.length));

  // The click must come out somewhere, and it must come out of the plugin rather than through a
  // passthrough: silence or a click that never moved would both fail here.
  if (!(outputLevel > 1e-3)) throw new Error(`the plugin returned silence (rms=${outputLevel.toFixed(6)})`);
  if (response.value < 0.01) throw new Error(`the plugin returned no audible click (peak=${response.value.toFixed(6)})`);
  if (response.index === 0) {
    throw new Error('the click landed at sample 0; the plugin applied no latency or processing');
  }

  console.log('PASS · third-party VST3 module hosted out of process, DSP measured');
  console.log(`  module=${path.basename(options.pluginPath)}; classes=${classes.length}; effects=${effects.length}`);
  console.log(`  plugin="${rendered.plugin.name}" vendor="${rendered.plugin.vendor}" version="${rendered.plugin.version}"`);
  console.log(`  declared-latency=${rendered.ready.latencyFrames} frames; tail=${rendered.ready.tailFrames} frames`);
  console.log(`  click-in=0.900 at 0.000 ms -> click-out=${response.value.toFixed(3)} at ${response.atMs.toFixed(2)} ms (sample ${response.index})`);
  console.log(`  output-rms=${outputLevel.toFixed(6)} (left), ${rms(right).toFixed(6)} (right); blocks=${BLOCK_COUNT} @ ${SAMPLE_RATE} Hz / ${FRAMES} frames`);
  console.log('  scope=generic loader + stereo offline processing in a child process; no editor, automation or live audio callback');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
