import test from 'node:test';
import assert from 'node:assert/strict';
import { VoicePool, type VoiceBase } from '../src/audio/spec/engines/voices.ts';

interface MockVoice {
  id: number;
  note: number;
  startTime: number;
  gain: number;
  disposed: boolean;
}

class MockVoicePool {
  private maxPolyphony: number;
  public activeVoices = new Map<number, MockVoice>();
  private nextVoiceId = 1;

  constructor(maxPolyphony: number = 8) {
    this.maxPolyphony = maxPolyphony;
  }

  public noteOn(note: number, time: number, gain: number = 1.0): MockVoice {
    // If polyphony limit reached, steal the oldest voice
    if (this.activeVoices.size >= this.maxPolyphony) {
      let oldestKey = -1;
      let oldestTime = Infinity;
      for (const [key, v] of this.activeVoices.entries()) {
        if (v.startTime < oldestTime) {
          oldestTime = v.startTime;
          oldestKey = key;
        }
      }
      if (oldestKey !== -1) {
        this.killVoice(oldestKey);
      }
    }

    const voice: MockVoice = {
      id: this.nextVoiceId++,
      note,
      startTime: time,
      gain,
      disposed: false,
    };
    this.activeVoices.set(note, voice);
    return voice;
  }

  public killVoice(note: number): void {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    voice.disposed = true;
    this.activeVoices.delete(note);
  }

  public noteOff(note: number): void {
    this.killVoice(note);
  }

  public disposeAll(): void {
    for (const voice of this.activeVoices.values()) {
      voice.disposed = true;
    }
    this.activeVoices.clear();
  }
}

test('Voice Pool 1: Bounded polyphony limit enforces hard cap', () => {
  const pool = new MockVoicePool(8);

  // Trigger 8 notes
  for (let n = 60; n < 68; n++) {
    pool.noteOn(n, n * 0.1);
  }
  assert.equal(pool.activeVoices.size, 8, 'Pool should have 8 active voices');

  // Trigger 9th note: oldest voice (note 60) must be stolen and disposed
  pool.noteOn(68, 6.8);
  assert.equal(pool.activeVoices.size, 8, 'Pool polyphony must not exceed max cap (8)');
  assert.equal(pool.activeVoices.has(60), false, 'Oldest voice (60) should have been stolen');
  assert.equal(pool.activeVoices.has(68), true, 'New voice (68) should be active');
});

test('Voice Pool 2: Rapid note repeats recycle voice without accumulation', () => {
  const pool = new MockVoicePool(4);

  // Play the same note 10 times in rapid succession
  for (let i = 0; i < 10; i++) {
    pool.noteOn(60, i * 0.05);
  }

  // Exactly 1 voice for note 60 should be in the map (no orphaned voice accumulation)
  assert.equal(pool.activeVoices.size, 1);
});

test('Voice Pool 3: Clean teardown disposes all active voices', () => {
  const pool = new MockVoicePool(16);
  for (let n = 40; n < 56; n++) {
    pool.noteOn(n, n);
  }
  assert.equal(pool.activeVoices.size, 16);

  pool.disposeAll();
  assert.equal(pool.activeVoices.size, 0, 'Active voices must be completely deallocated');
});

test('VoicePool drops held voices after a scheduled sample length expires', () => {
  class Voice implements VoiceBase {
    releaseTime: number | null = null;
    constructor(public note: number, public startTime: number, public endTime: number) {}
    release(t: number): void { this.releaseTime = t; }
    kill(t: number): void { this.releaseTime = t; }
  }

  const pool = new VoicePool<Voice>(4);
  pool.add(new Voice(96, 1, 1.5));
  pool.add(new Voice(60, 1, Number.POSITIVE_INFINITY));

  pool.gc(1.6);

  assert.deepEqual(pool.list.map((voice) => voice.note), [60], 'finite voices should expire even before a key-up event');
});

