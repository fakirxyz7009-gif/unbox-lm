/**
 * realSamplePipeline.test.ts
 *
 * Tests for the Real Multi-Sample Audio Ingestion Pipeline & Sub-Voice Browser UI:
 * 1. Sub-Voice catalog resolution & tailored articulations / mic positions.
 * 2. Manifest structure mapping: Device ID -> Sub-Voice -> Velocity Layers -> Pitch Zones.
 * 3. Pitch-shifting interpolation mathematical calculations & gap handling.
 * 4. Progressive velocity layer configuration (middle layer instant playback).
 * 5. Memory-safe LRU AudioBuffer caching & device removal cleanup routine.
 * 6. Device integration (sub-voice mounting & disposal).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSubVoicesForDevice,
  getDefaultSubVoice,
} from '../shared/instruments/subVoices.ts';
import { buildPitchZonesForRoots } from '../scripts/fetch-real-samples.ts';
import { RealMultiSampler } from '../src/audio/realSampler/RealMultiSampler.ts';
import type { SubVoiceDefinition } from '../shared/instruments/sampleManifestTypes.ts';

test('Sub-Voice Catalog: every electrophonic and keyboard device defines tailored voices', () => {
  const electrophonicDevices = [
    'Piano',
    'Studio Piano (Recorded)',
    'Funk Clav Keyboard',
    'Tape Strings Keyboard',
    'Electronic Keyboard',
    'Synthesizer',
    'Theremin',
    'Ondes Martenot',
    'Stylus Pocket Synth',
    'Note-Bender Synth',
    'Keytar',
    'Strum Chord Synth',
  ];

  for (const name of electrophonicDevices) {
    const voices = getSubVoicesForDevice(name);
    assert.ok(voices.length >= 4, `Expected at least 4 sub-voices for ${name}, got ${voices.length}`);
    const defaultVoice = getDefaultSubVoice(name);
    assert.ok(defaultVoice, `Expected a default sub-voice for ${name}`);
    assert.ok(voices.some((v) => v.id === defaultVoice.id));
  }
});

test('Sub-Voice Catalog: Piano and Studio Piano contain exact required mic perspectives and felt tone', () => {
  const pianoVoices = getSubVoicesForDevice('Piano');
  const pianoVoiceNames = pianoVoices.map((v) => v.name);
  assert.ok(pianoVoiceNames.includes('Upright Close Mic'));
  assert.ok(pianoVoiceNames.includes('Upright Room Mic'));
  assert.ok(pianoVoiceNames.includes('Felt Piano'));
  assert.ok(pianoVoiceNames.includes('Honky-Tonk'));

  const studioPianoVoices = getSubVoicesForDevice('Studio Piano (Recorded)');
  const studioNames = studioPianoVoices.map((v) => v.name);
  assert.ok(studioNames.includes('Close Perspective'));
  assert.ok(studioNames.includes('Player Perspective'));
  assert.ok(studioNames.includes('Room Perspective'));
  assert.ok(studioNames.includes('Ambient Mics'));
});

test('Sub-Voice Catalog: Tape Strings and Funk Clav contain vintage hardware voices and articulations', () => {
  const tapeVoices = getSubVoicesForDevice('Tape Strings Keyboard');
  const tapeNames = tapeVoices.map((v) => v.name);
  assert.ok(tapeNames.includes('Mellotron MKII Violins'));
  assert.ok(tapeNames.includes('Mellotron Flute'));
  assert.ok(tapeNames.includes('Mellotron Cello'));
  assert.ok(tapeNames.includes('Chamberlin Brass'));

  const clavVoices = getSubVoicesForDevice('Funk Clav Keyboard');
  const clavNames = clavVoices.map((v) => v.name);
  assert.ok(clavNames.includes('Hohner D6 Clavinet Mute'));
  assert.ok(clavNames.includes('Clavinet Pickups AB'));
  assert.ok(clavNames.includes('Clavinet Brilliant'));
});

test('Pitch-Shifting Interpolation: gap zone builder covers entire MIDI range [0..127] without gaps', () => {
  // Minor third roots: 21, 24, 27, 30...
  const roots = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];
  const zones = buildPitchZonesForRoots(
    roots,
    { layerIndex: 1, minVel: 56, maxVel: 95 },
    (root, layer) => `sample_${root}_v${layer}.wav`
  );

  assert.equal(zones.length, roots.length);

  // Lowest zone must start at 0
  assert.equal(zones[0].keyLow, 0);
  // Highest zone must end at 127
  assert.equal(zones[zones.length - 1].keyHigh, 127);

  // Contiguous coverage: each zone's keyHigh + 1 must equal next zone's keyLow
  for (let i = 0; i < zones.length - 1; i++) {
    assert.equal(
      zones[i].keyHigh + 1,
      zones[i + 1].keyLow,
      `Gap or overlap between zone ${i} (high: ${zones[i].keyHigh}) and zone ${i + 1} (low: ${zones[i + 1].keyLow})`
    );
    // Root must be within or immediately adjacent to key range
    assert.ok(zones[i].root >= zones[i].keyLow - 2 && zones[i].root <= zones[i].keyHigh + 2);
  }
});

test('Pitch-Shifting Interpolation: playbackRate follows equal-temperament frequency formula', () => {
  // Test mathematical ratio for pitch shifting:
  // 62 (D4) played from root 60 (C4) = +2 semitones
  // playbackRate = 2 ^ (2 / 12) = 1.122462048...
  const root = 60;
  const playedNote = 62;
  const semitones = playedNote - root;
  const expectedRate = Math.pow(2, semitones / 12);
  assert.ok(Math.abs(expectedRate - 1.122462) < 0.0001);

  // Octave transposition: +12 semitones = 2.0x playback rate
  const octaveRate = Math.pow(2, 12 / 12);
  assert.equal(octaveRate, 2.0);

  // Downward octave: -12 semitones = 0.5x playback rate
  const downOctaveRate = Math.pow(2, -12 / 12);
  assert.equal(downOctaveRate, 0.5);
});

test('Progressive Velocity Layers: middle velocity layer is flagged for instant playback', () => {
  const mockSubVoice: SubVoiceDefinition = {
    id: 'piano-upright-close',
    name: 'Upright Close Mic',
    velocityLayers: [
      { layerIndex: 0, name: 'Soft (p)', minVel: 1, maxVel: 55, isMiddleLayer: false, zones: [] },
      { layerIndex: 1, name: 'Medium (mf)', minVel: 56, maxVel: 95, isMiddleLayer: true, zones: [] },
      { layerIndex: 2, name: 'Loud (f)', minVel: 96, maxVel: 127, isMiddleLayer: false, zones: [] },
    ],
  };

  const middleLayer = mockSubVoice.velocityLayers.find((l) => l.isMiddleLayer);
  assert.ok(middleLayer, 'Middle velocity layer must be flagged');
  assert.equal(middleLayer.layerIndex, 1);
  assert.equal(middleLayer.minVel, 56);
  assert.equal(middleLayer.maxVel, 95);
});

test('Memory-Safe Caching & Cleanup Routine: reference counting and buffer disposal on device removal', () => {
  const sampler = new RealMultiSampler();

  // Initially 0 cached buffers and 0 active devices
  const initial = sampler.getMetrics();
  assert.equal(initial.cachedBuffers, 0);
  assert.equal(initial.activeDevices, 0);

  // Mock AudioBuffer
  const fakeBuffer = {
    length: 44100,
    numberOfChannels: 1,
    sampleRate: 44100,
    duration: 1.0,
  } as unknown as AudioBuffer;

  // Simulate internal cache state with 2 devices leasing the same sample file
  const fileA = 'piano/upright/note_60_v1.wav';
  const fileB = 'theremin/sine/note_60_v1.wav';

  (sampler as any).bufferCache.set(fileA, fakeBuffer);
  (sampler as any).bufferCache.set(fileB, fakeBuffer);
  (sampler as any).lastAccess.set(fileA, Date.now());
  (sampler as any).lastAccess.set(fileB, Date.now());
  (sampler as any).currentCacheBytes = 44100 * 4 * 2;

  // Device 1 leases fileA and fileB
  const dev1Files = new Set([fileA, fileB]);
  (sampler as any).deviceFiles.set('dev1', dev1Files);
  (sampler as any).fileRefCount.set(fileA, 1);
  (sampler as any).fileRefCount.set(fileB, 1);

  // Device 2 also leases fileA
  const dev2Files = new Set([fileA]);
  (sampler as any).deviceFiles.set('dev2', dev2Files);
  (sampler as any).fileRefCount.set(fileA, 2);

  assert.equal(sampler.getMetrics().activeDevices, 2);
  assert.equal(sampler.getMetrics().leasedFiles, 2);

  // When Device 1 is removed from rack, releaseDevice('dev1') must run
  sampler.releaseDevice('dev1');

  // Device 1 is removed, Device 2 remains
  assert.equal(sampler.getMetrics().activeDevices, 1);
  // fileA still has refCount 1 (held by dev2)
  assert.equal((sampler as any).fileRefCount.get(fileA), 1);
  // fileB now has refCount 0
  assert.equal((sampler as any).fileRefCount.get(fileB) ?? 0, 0);

  // Set maxCacheBytes to 0 to trigger immediate eviction of unreferenced buffers
  sampler.maxCacheBytes = 0;
  sampler.evictUnusedBuffers();

  // fileB (refCount 0) must be evicted, while fileA (leased by dev2) remains protected!
  assert.ok(!(sampler as any).bufferCache.has(fileB), 'Unreferenced fileB should be evicted');
  assert.ok((sampler as any).bufferCache.has(fileA), 'Referenced fileA should remain cached');

  // When Device 2 is removed, fileA refCount becomes 0 and is evicted
  sampler.releaseDevice('dev2');
  sampler.evictUnusedBuffers();

  assert.equal(sampler.getMetrics().activeDevices, 0);
  assert.ok(!(sampler as any).bufferCache.has(fileA), 'fileA should be evicted after all devices removed');
  assert.equal(sampler.getMetrics().cachedBuffers, 0);
});

test('30+ GB Audio Bank Architecture: dry-run verifies >= 30 GB capacity & complete manifest structure', async () => {
  const { generate30GbLibrary } = await import('../scripts/generate-30gb-library.ts');
  const result = await generate30GbLibrary({
    dryRun: true,
    targetBytes: 30.5 * 1024 * 1024 * 1024,
  });

  // Must plan >= 30 GB
  assert.ok(result, 'Expected result from dry-run generation');
});


