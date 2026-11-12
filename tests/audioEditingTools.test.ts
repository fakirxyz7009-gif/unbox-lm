import test from 'node:test';
import assert from 'node:assert/strict';

// Mock AudioBuffer if running in Node environment without Web Audio API
if (typeof AudioBuffer === 'undefined') {
  (globalThis as any).AudioBuffer = class MockAudioBuffer {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    private channels: Float32Array[];

    constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
      this.numberOfChannels = opts.numberOfChannels;
      this.length = opts.length;
      this.sampleRate = opts.sampleRate;
      this.channels = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
    }

    getChannelData(channel: number): Float32Array {
      return this.channels[channel];
    }

    get duration(): number {
      return this.length / this.sampleRate;
    }
  };
}

import {
  removeDcOffset,
  findNearestZeroCrossing,
  calculateClipRms,
} from '../src/audio/clips/audioStore.ts';
import { fadeGainAt } from '../src/audio/clips/clipMath.ts';
import { SequencerEditor, type SequencerHost } from '../src/audio/sequencer/editor.ts';
import type { ArrangementClip, SequencerTrack } from '../src/audio/types.ts';

test('Audio Tools 1: Digital DC Offset Removal correctly eliminates constant bias', () => {
  const sr = 44100;
  const len = 4410; // 100 ms
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });

  const dcBiasL = 0.42;
  const dcBiasR = -0.18;
  const dataL = buffer.getChannelData(0);
  const dataR = buffer.getChannelData(1);

  for (let i = 0; i < len; i++) {
    dataL[i] = Math.sin((2 * Math.PI * 440 * i) / sr) + dcBiasL;
    dataR[i] = Math.cos((2 * Math.PI * 440 * i) / sr) + dcBiasR;
  }

  const cleaned = removeDcOffset(buffer);
  assert.equal(cleaned.numberOfChannels, 2);
  assert.equal(cleaned.length, len);

  const cleanL = cleaned.getChannelData(0);
  const cleanR = cleaned.getChannelData(1);

  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < len; i++) {
    sumL += cleanL[i];
    sumR += cleanR[i];
  }

  const meanL = sumL / len;
  const meanR = sumR / len;

  assert.ok(Math.abs(meanL) < 1e-4, `Left channel DC offset was not eliminated: mean is ${meanL}`);
  assert.ok(Math.abs(meanR) < 1e-4, `Right channel DC offset was not eliminated: mean is ${meanR}`);
});

test('Audio Tools 2: Zero-Crossing Detection finds exact waveform sign flips', () => {
  const sr = 44100;
  const len = 44100;
  const buffer = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const data = buffer.getChannelData(0);

  // 100 Hz sine wave: zero crossings happen at t = 0.005, 0.010, 0.015, etc.
  for (let i = 0; i < len; i++) {
    data[i] = Math.sin((2 * Math.PI * 100 * i) / sr);
  }

  // Target 0.0048s — nearest zero crossing is at 0.005s (sample 220 or 221)
  const nearest = findNearestZeroCrossing(buffer, 0.0048, 0.005);
  const sample = Math.round(nearest * sr);

  assert.ok(Math.abs(sample - 220.5) <= 1, `Expected sample near 220/221, got ${sample}`);
  assert.ok(Math.abs(data[sample]) < 0.02, `Waveform amplitude at zero crossing should be ~0, got ${data[sample]}`);
});

test('Audio Tools 3: RMS Loudness Target calculation accurately measures signal energy', () => {
  const sr = 44100;
  const len = 44100;
  const buffer = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const data = buffer.getChannelData(0);

  // Pure sine wave with peak 1.0 has theoretical RMS = 1 / sqrt(2) ≈ 0.7071
  for (let i = 0; i < len; i++) {
    data[i] = Math.sin((2 * Math.PI * 1000 * i) / sr);
  }

  const rms = calculateClipRms(buffer, 0, 1.0);
  assert.ok(Math.abs(rms - 0.7071) < 0.005, `Expected RMS ~0.7071, got ${rms}`);

  // Silence has RMS 0
  const silence = new AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: sr });
  assert.equal(calculateClipRms(silence, 0, 1.0), 0);
});

test('Audio Tools 4: Crossfade and Fade Curve non-linear functions (Equal Power, S-Curve, Polarity Invert)', () => {
  // Test equal power (-3dB constant acoustic power curve)
  const clipEqualPower: ArrangementClip = {
    id: 'c1',
    name: 'EqualPower',
    startBar: 0,
    lengthBars: 4,
    kind: 'audio',
    fadeIn: 2.0,
    fadeCurve: 'equal_power',
  };

  // At midway point of fade-in (1.0 sec into 2.0 sec fade), equal power gain should be sin(pi/4) ≈ 0.7071
  const gainEqMid = fadeGainAt(clipEqualPower, 1.0, 8.0);
  assert.ok(Math.abs(gainEqMid - 0.7071) < 0.01, `Equal power midpoint gain should be ~0.7071, got ${gainEqMid}`);

  // Test S-Curve (cubic Hermite easing)
  const clipSCurve: ArrangementClip = {
    id: 'c2',
    name: 'SCurve',
    startBar: 0,
    lengthBars: 4,
    kind: 'audio',
    fadeIn: 10.0,
    fadeCurve: 's_curve',
  };

  // At t=2 (progress x=0.2), 3x^2 - 2x^3 = 3(0.04) - 2(0.008) = 0.104
  const gainSCurveStart = fadeGainAt(clipSCurve, 2.0, 20.0);
  assert.ok(Math.abs(gainSCurveStart - 0.104) < 0.005, `S-Curve gain at 20% should be ~0.104, got ${gainSCurveStart}`);

  // Test Polarity Inversion (180° phase flip)
  const clipInverted: ArrangementClip = {
    id: 'c3',
    name: 'Inverted',
    startBar: 0,
    lengthBars: 4,
    kind: 'audio',
    invertPhase: true,
  };
  const gainInverted = fadeGainAt(clipInverted, 1.0, 4.0);
  assert.equal(gainInverted, -1.0, `Inverted phase should yield negative gain (-1.0), got ${gainInverted}`);
});

test('Audio Tools 5: Non-Destructive Clip Healing and Splitting', () => {
  const track: SequencerTrack = {
    id: 'track_1',
    deviceId: 'dev_1',
    name: 'Audio Lead',
    kind: 'audio',
    mute: false,
    solo: false,
    steps: [],
    color: '#34d399',
    arrangementClips: [
      {
        id: 'clip_orig',
        kind: 'audio',
        audioId: 'asset_vocals',
        name: 'Lead Vocals',
        startBar: 0,
        lengthBars: 4,
        audioOffset: 0,
        fadeIn: 0.2,
        fadeOut: 0.5,
      },
    ],
  };

  const host: SequencerHost = {
    tracks: [track],
    stepsPerBar: 16,
    bpm: 120,
    activePatternIndex: 0,
    patternLength: 16,
    arrangementMarkers: [],
    commitEdit() {},
  };

  const editor = new SequencerEditor(host);

  // Split clip at bar 2
  const split = editor.splitClip(track.id, 'clip_orig', 2);
  assert.ok(split !== null, 'Split failed');
  const [left, right] = split!;

  assert.equal(track.arrangementClips?.length, 2);
  assert.equal(left.lengthBars, 2);
  assert.equal(right.startBar, 2);
  assert.equal(right.lengthBars, 2);
  assert.equal(left.name, 'Lead Vocals (Part 1)');
  assert.equal(right.name, 'Lead Vocals (Part 2)');

  // Now heal the two slices back together
  const healed = editor.healClips(track.id, left.id, right.id);
  assert.ok(healed !== null, 'Healing failed');
  assert.equal(track.arrangementClips?.length, 1);
  assert.equal(healed!.lengthBars, 4);
  assert.equal(healed!.name, 'Lead Vocals');
  assert.equal(healed!.fadeIn, 0.2);
  assert.equal(healed!.fadeOut, 0.5);
});
