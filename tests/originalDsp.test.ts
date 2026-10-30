import test from 'node:test';
import assert from 'node:assert/strict';

import { ladderProcessorSource } from '../src/audio/spec/ladderWorklet.ts';
import { driveCurve } from '../src/audio/spec/engines/drive.ts';
import { loopGainFor, ringSeconds } from '../src/audio/spec/engines/karplus.ts';
import { tapeSettings } from '../src/audio/spec/engines/tapeEcho.ts';
import { phaseFrame } from '../src/audio/spec/engines/wavetable.ts';
import { stringProcessorSource } from '../src/audio/spec/stringWorklet.ts';

const SAMPLE_RATE = 48_000;

test('karplus loop gain runs from a short ring to a long one and is clamped', () => {
  assert.ok(Math.abs(loopGainFor(0) - 0.985) < 1e-12);
  assert.ok(Math.abs(loopGainFor(1) - 0.9995) < 1e-12);
  assert.equal(loopGainFor(2), loopGainFor(1));
});

test('karplus ring time is the number of passes the loop gain allows, over the pitch', () => {
  const g = loopGainFor(0.6);
  const passes = -6.9 / Math.log(g);
  assert.ok(Math.abs(ringSeconds(220, g) - passes / 220) < 1e-9);
  assert.equal(ringSeconds(220, 1), 20, 'a lossless loop is capped');
});

test('drive voicings stay within full scale and never fold back', () => {
  const voicings = ['Overdrive', 'Mid Push', 'Hard Clip', 'Fuzz'];
  for (let v = 0; v < voicings.length; v++) {
    for (const drive of [0, 0.5, 1]) {
      const curve = driveCurve(v, drive);
      assert.equal(curve.length, 1024);
      let prev = -Infinity;
      for (const y of curve) {
        assert.ok(Math.abs(y) <= 1 + 1e-6, `${voicings[v]} at drive ${drive} stays within full scale`);
        assert.ok(y >= prev - 1e-6, `${voicings[v]} at drive ${drive} is non-decreasing`);
        prev = y;
      }
    }
  }
});

test('overdrive is symmetric and fuzz is not', () => {
  const od = driveCurve(0, 0.6);
  const n = od.length;
  for (let i = 0; i < n; i++) assert.ok(Math.abs(od[i] + od[n - 1 - i]) < 1e-5);
  const fuzz = driveCurve(3, 0);
  assert.ok(Math.abs(fuzz[0]) < fuzz[n - 1] - 0.01, 'the negative half clips less than the positive half');
});

test('hard clip is linear up to its knee and rounds off past it', () => {
  const curve = driveCurve(2, 0.5);
  const at = (x: number) => curve[Math.round(((x + 1) / 2) * 1023)];
  assert.ok(Math.abs(at(0.25) - 0.25) < 2e-3);
  assert.ok(at(0.9) < 0.9, 'the tail is compressed');
});

test('bucket brigade has no wow and a darker loop than tape', () => {
  const tape = tapeSettings(false, 1, 9000);
  const bbd = tapeSettings(true, 1, 9000);
  assert.ok(tape.wowSeconds > 0);
  assert.equal(bbd.wowSeconds, 0);
  assert.ok(bbd.flutterSeconds < tape.flutterSeconds);
  assert.ok(bbd.toneHz <= 3200);
  assert.equal(tape.toneHz, 9000);
  assert.equal(tapeSettings(false, 0, 9000).wowSeconds, 0, 'Amount 0 is no wobble');
});

test('phase-distortion frames rebuild the warped cycle: frame 0 is a sine, later frames bend it', () => {
  const sine = phaseFrame(0);
  assert.ok(Math.abs(sine.amps[1] - 1) < 1e-3);
  for (let k = 2; k < sine.amps.length; k++) assert.ok(sine.amps[k] < 1e-3, `harmonic ${k} of a sine`);

  for (const [frame, tolerance] of [
    [0, 1e-3],
    [3, 0.02],
    [7, 0.3],
  ] as const) {
    const { amps, phases } = phaseFrame(frame);
    const p = 1 + (frame / 7) * 5;
    const N = 256;
    let mean = 0;
    for (let n = 0; n < N; n++) mean += Math.cos(2 * Math.PI * Math.pow(n / N, p)) / N;
    let worst = 0;
    for (let n = 0; n < N; n += 4) {
      const phi = n / N;
      let rebuilt = 0;
      for (let k = 1; k < amps.length; k++) rebuilt += amps[k] * Math.sin(2 * Math.PI * k * phi + phases[k]);
      worst = Math.max(worst, Math.abs(rebuilt - (Math.cos(2 * Math.PI * Math.pow(phi, p)) - mean)));
    }
    assert.ok(worst <= tolerance, `frame ${frame} error ${worst.toFixed(4)} above ${tolerance}`);
  }
});

// ---------------------------------------------------------------- ladder worklet

type LadderProcessor = { process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean };
type LadderCtor = new () => LadderProcessor;

/** Runs the worklet source in Node with the AudioWorklet globals stubbed out. */
function loadLadder(): LadderCtor {
  const registered = new Map<string, LadderCtor>();
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletProcessor = class {
    port = null;
  };
  g.registerProcessor = (name: string, ctor: LadderCtor) => registered.set(name, ctor);
  g.sampleRate = SAMPLE_RATE;
  ladderProcessorSource();
  const ctor = registered.get('unbox-ladder');
  assert.ok(ctor, 'the processor registers itself under unbox-ladder');
  return ctor;
}

/** Pushes samples through the processor in 128-frame blocks at a fixed cutoff and resonance. */
function runLadder(samples: Float32Array, cutoff: number, resonance: number): Float32Array {
  const proc = new (loadLadder())();
  const out = new Float32Array(samples.length);
  for (let start = 0; start < samples.length; start += 128) {
    const block = samples.subarray(start, start + 128);
    const y = new Float32Array(block.length);
    proc.process([[block]], [[y]], {
      cutoff: Float32Array.from([cutoff]),
      resonance: Float32Array.from([resonance]),
      drive: Float32Array.from([0]),
    });
    out.set(y, start);
  }
  return out;
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const sine = (hz: number, n: number, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE));

test('ladder passes tones below its cutoff and cuts tones well above it', () => {
  const n = 8192;
  const low = sine(100, n);
  const high = sine(8000, n);
  assert.ok(rms(runLadder(low, 500, 0).subarray(4096)) / rms(low.subarray(4096)) > 0.7);
  assert.ok(rms(runLadder(high, 500, 0).subarray(4096)) / rms(high.subarray(4096)) < 0.02);
});

test('ladder self-oscillates at full resonance and dies out without it', () => {
  const impulse = new Float32Array(8192);
  impulse[0] = 0.5;
  assert.ok(rms(runLadder(impulse, 1000, 1.15).subarray(6144)) > 0.05, 'the loop keeps ringing');
  assert.ok(rms(runLadder(impulse, 1000, 0).subarray(6144)) < 1e-6, 'with no resonance the tail is gone');
});

// ---------------------------------------------------------------- plucked string worklet

type StringProcessor = { process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean };
type StringCtor = new () => StringProcessor;

function loadString(): StringCtor {
  const registered = new Map<string, StringCtor>();
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletProcessor = class {
    port = null;
  };
  g.registerProcessor = (name: string, ctor: StringCtor) => registered.set(name, ctor);
  g.sampleRate = SAMPLE_RATE;
  stringProcessorSource();
  const ctor = registered.get('unbox-string');
  assert.ok(ctor, 'the processor registers itself under unbox-string');
  return ctor;
}

/** One plucked note held open: the gate is high from the first block, the parameters are fixed. */
function playString(hz: number, loop: number, average: number, samples: number): Float32Array {
  const proc = new (loadString())();
  const out = new Float32Array(samples);
  for (let start = 0; start < samples; start += 128) {
    const y = new Float32Array(Math.min(128, samples - start));
    proc.process([], [[y]], {
      frequency: Float32Array.from([hz]),
      loop: Float32Array.from([loop]),
      average: Float32Array.from([average]),
      level: Float32Array.from([1]),
      velocity: Float32Array.from([1]),
      gate: Float32Array.from([1]),
    });
    out.set(y, start);
  }
  return out;
}

const peak = (x: Float32Array, from = 0) => {
  let m = 0;
  for (let i = from; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
};

/** Frequency of the strongest partial between lo and hi Hz (Goertzel, 0.5 Hz steps, one second of signal). */
function strongestHz(x: Float32Array, lo: number, hi: number): number {
  let best = lo;
  let bestPower = -Infinity;
  for (let f = lo; f <= hi; f += 0.5) {
    const c = 2 * Math.cos((2 * Math.PI * f) / SAMPLE_RATE);
    let s1 = 0;
    let s2 = 0;
    for (let i = 4096; i < 4096 + SAMPLE_RATE; i++) {
      const s = x[i] + c * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    const power = s1 * s1 + s2 * s2 - c * s1 * s2;
    if (power > bestPower) {
      bestPower = power;
      best = f;
    }
  }
  return best;
}

test('plucked string rings at the pitch of each note, well above the old delay-line floor', () => {
  for (const hz of [110, 440, 880]) {
    const x = playString(hz, 0.999, 1, 4096 + SAMPLE_RATE + 128);
    // The band holds only the fundamental: the next partial is an octave up.
    const measured = strongestHz(x, hz * 0.85, hz * 1.15);
    assert.ok(Math.abs(measured - hz) / hz < 0.01, `${hz} Hz measured as ${measured} Hz`);
  }
});

test('plucked string rings longer at a higher loop gain and stays bounded', () => {
  const short = playString(220, 0.9, 0.75, 96_000);
  const long = playString(220, 0.999, 0.75, 96_000);
  assert.ok(peak(short, short.length - 4800) < 1e-3, 'a loop gain of 0.9 is silent after 2 s');
  assert.ok(peak(long, long.length - 4800) > 0.01, 'a loop gain of 0.999 is still audible after 2 s');
  assert.ok(peak(long) < 2, 'the loop stays bounded');
});
