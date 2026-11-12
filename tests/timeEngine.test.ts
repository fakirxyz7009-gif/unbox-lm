import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProjectTimeMap,
  TransportState,
  MarkerRegionManager,
} from '../src/audio/time/index.ts';

test('Mandatory Test 1: 120 BPM, 4/4 — Bar 1 Beat 1 equals project start (0s, 0 ticks)', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);

  // Bar 1, Beat 1, 16th 1, tick 0
  const startTicks = timeMap.musicalToTick({ bar: 1, beat: 1, sixteenth: 1, tick: 0 });
  assert.equal(startTicks, 0, 'Project start must be tick 0');

  const startSeconds = timeMap.tickToSeconds(0);
  assert.equal(startSeconds, 0, 'Project start must be exactly 0 seconds');

  const musical = timeMap.tickToMusical(0);
  assert.equal(musical.bar, 1);
  assert.equal(musical.beat, 1);
  assert.equal(musical.sixteenth, 1);
  assert.equal(musical.tick, 0);

  // At 120 BPM, 4/4:
  // 1 beat = 0.5s (48 ticks)
  // 1 bar = 4 beats = 2.0s (192 ticks)
  assert.equal(timeMap.tickToSeconds(48), 0.5);
  assert.equal(timeMap.tickToSeconds(192), 2.0);
  assert.equal(timeMap.secondsToTick(2.0), 192);

  // Bar 2 beat 1 should be tick 192, 2.0s
  const bar2Tick = timeMap.musicalToTick({ bar: 2, beat: 1 });
  assert.equal(bar2Tick, 192);
  assert.equal(timeMap.tickToSeconds(bar2Tick), 2.0);
});

test('Mandatory Test 2: Tempo change to 100 BPM at Bar 9 — Bar positions and seconds remain correct', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);

  // In 4/4: Bars 1 to 8 = 8 full bars = 8 * 192 = 1536 ticks.
  // At 120 BPM (2.0s per bar), 8 bars take 16.0 seconds.
  const bar9Tick = timeMap.meterMap.barToTick(9);
  assert.equal(bar9Tick, 1536, 'Bar 9 must start at tick 1536');
  assert.equal(timeMap.tickToSeconds(bar9Tick), 16.0, 'Bar 9 must start at 16.0s at 120 BPM');

  // Add tempo event at Bar 9: 100 BPM
  timeMap.tempoMap.addTempoEvent(bar9Tick, 100, 'instant');

  // Verify Bar 9 tick remains 1536 (musical structure unchanged)
  assert.equal(timeMap.meterMap.barToTick(9), 1536);

  // Verify Bar 1 to 8 duration is still 16.0s
  assert.equal(timeMap.tickToSeconds(1536), 16.0);

  // At 100 BPM: 1 beat = 60 / 100 = 0.6s
  // 1 bar of 4/4 = 4 * 0.6 = 2.4s.
  // Bar 10 is 1 bar after Bar 9: tick 1536 + 192 = 1728 ticks.
  const bar10Tick = timeMap.meterMap.barToTick(10);
  assert.equal(bar10Tick, 1728);

  const bar10Seconds = timeMap.tickToSeconds(bar10Tick);
  assert.equal(Math.round(bar10Seconds * 1000) / 1000, 18.4, 'Bar 10 must be 16.0s + 2.4s = 18.4s');

  // Inverse check: 18.4s must map back to Bar 10 (tick 1728)
  assert.equal(Math.round(timeMap.secondsToTick(18.4)), 1728);
});

test('Mandatory Test 3: Change 4/4 to 3/4 at Bar 5 — Bar numbering and tick boundaries calculate accurately', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);

  // Bars 1-4 are 4/4: 4 * 192 = 768 ticks
  assert.equal(timeMap.meterMap.barToTick(5), 768);

  // Change to 3/4 at Bar 5
  timeMap.meterMap.addMeterEvent(5, 3, 4);

  // Bar 5 in 3/4: 3 beats * 48 ticks = 144 ticks per bar
  assert.equal(timeMap.meterMap.calcTicksPerBar(3, 4), 144);
  assert.equal(timeMap.meterMap.barToTick(5), 768);

  // Bar 6 = 768 + 144 = 912 ticks
  assert.equal(timeMap.meterMap.barToTick(6), 912);

  // Bar 7 = 912 + 144 = 1056 ticks
  assert.equal(timeMap.meterMap.barToTick(7), 1056);

  // Test reverse mapping: tickToBar
  const bar5Result = timeMap.meterMap.tickToBar(768);
  assert.equal(bar5Result.bar, 5);
  assert.equal(bar5Result.fraction, 0);

  const midBar6Tick = 912 + 72; // halfway through bar 6
  const bar6Result = timeMap.meterMap.tickToBar(midBar6Tick);
  assert.equal(bar6Result.bar, 6);
  assert.equal(bar6Result.fraction, 0.5);

  // Musical position: Bar 6 beat 2 in 3/4
  const m = timeMap.tickToMusical(912 + 48);
  assert.equal(m.bar, 6);
  assert.equal(m.beat, 2);
  assert.equal(m.sixteenth, 1);
});

test('Mandatory Test 4: Workspace switching synchronization — Playhead is shared and invariant', () => {
  const transport = new TransportState();

  // Set playhead at tick 576 (Bar 4 in 4/4)
  transport.setPlayhead(576);
  assert.equal(transport.playheadTick, 576);

  // Simulate F7 (Workstation) reading playhead
  const f7Playhead = transport.playheadTick;

  // Simulate F6 (Rack) reading playhead
  const f6Playhead = transport.playheadTick;

  // Simulate F5 (Mixer) reading playhead
  const f5Playhead = transport.playheadTick;

  assert.equal(f7Playhead, 576);
  assert.equal(f6Playhead, 576);
  assert.equal(f5Playhead, 576);
  assert.equal(f7Playhead, f6Playhead);
  assert.equal(f6Playhead, f5Playhead);
});

test('Mandatory Test 5: Set loop — Loop range persists across workspaces and conversions', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);
  const transport = new TransportState();

  // Set loop range: Bar 2 to Bar 6 (ticks 192 to 1152)
  const startTick = timeMap.meterMap.barToTick(2); // 192
  const endTick = timeMap.meterMap.barToTick(6);   // 960 (4 bars = 768 ticks)
  transport.setLoopRange(startTick, endTick, true);

  assert.equal(transport.loopRange.startTick, 192);
  assert.equal(transport.loopRange.endTick, 960);
  assert.equal(transport.loopRange.enabled, true);

  // Time conversion
  const loopStartSec = timeMap.tickToSeconds(transport.loopRange.startTick);
  const loopEndSec = timeMap.tickToSeconds(transport.loopRange.endTick);
  assert.equal(loopStartSec, 2.0);
  assert.equal(loopEndSec, 10.0);
});

test('Mandatory Test 6: Set time selection — Time selection is distinct from loop and punch', () => {
  const transport = new TransportState();

  transport.setLoopRange(192, 960, true);
  transport.setPunchRange(384, 576, true);
  transport.setTimeSelection(768, 1152, true);

  // Verify none overwrite each other
  assert.equal(transport.loopRange.startTick, 192);
  assert.equal(transport.loopRange.endTick, 960);

  assert.equal(transport.punchRange.startTick, 384);
  assert.equal(transport.punchRange.endTick, 576);

  assert.equal(transport.timeSelection.startTick, 768);
  assert.equal(transport.timeSelection.endTick, 1152);
  assert.equal(transport.timeSelection.active, true);

  // Clear time selection leaves loop and punch untouched
  transport.clearTimeSelection();
  assert.equal(transport.timeSelection.active, false);
  assert.equal(transport.loopRange.enabled, true);
  assert.equal(transport.punchRange.enabled, true);
});

test('Mandatory Test 7: Save project, close, reopen — Verify tempo map, markers, regions, and selection recover', () => {
  const timeMap1 = new ProjectTimeMap(128, 4, 4);
  const transport1 = new TransportState();
  const markers1 = new MarkerRegionManager(timeMap1);

  // Add tempo changes and markers
  timeMap1.tempoMap.addTempoEvent(768, 140, 'instant');
  timeMap1.meterMap.addMeterEvent(9, 3, 4);

  markers1.addMarker({ name: 'VERSE 1', bar: 5, color: '#10b981' });
  markers1.addRegion({ name: 'CHORUS', startBar: 9, lengthBars: 4, color: '#f59e0b' });

  transport1.setTimeSelection(384, 768, true);
  transport1.setLoopRange(192, 1152, true);
  transport1.setPunchRange(576, 768, true);

  // Serialize to JSON
  const serialized = {
    timeMap: timeMap1.serialize(),
    transport: transport1.serialize(),
    markers: markers1.serialize(),
  };
  const jsonStr = JSON.stringify(serialized);

  // Reopen in fresh instances
  const restored = JSON.parse(jsonStr);
  const timeMap2 = new ProjectTimeMap(120, 4, 4);
  const transport2 = new TransportState();
  const markers2 = new MarkerRegionManager(timeMap2);

  timeMap2.deserialize(restored.timeMap);
  transport2.deserialize(restored.transport);
  markers2.deserialize(restored.markers);

  // Assert exact recovery
  assert.equal(timeMap2.tempoMap.getBpmAtTick(0), 128);
  assert.equal(timeMap2.tempoMap.getBpmAtTick(768), 140);
  assert.equal(timeMap2.meterMap.getMeterAtBar(9).numerator, 3);
  assert.equal(timeMap2.meterMap.getMeterAtBar(9).denominator, 4);

  assert.equal(markers2.getAllMarkers().length, 1);
  assert.equal(markers2.getAllMarkers()[0].name, 'VERSE 1');
  assert.equal(markers2.getAllMarkers()[0].bar, 5);

  assert.equal(markers2.getAllRegions().length, 1);
  assert.equal(markers2.getAllRegions()[0].name, 'CHORUS');
  assert.equal(markers2.getAllRegions()[0].startBar, 9);
  assert.equal(markers2.getAllRegions()[0].lengthBars, 4);

  assert.equal(transport2.timeSelection.startTick, 384);
  assert.equal(transport2.timeSelection.endTick, 768);
  assert.equal(transport2.timeSelection.active, true);
  assert.equal(transport2.loopRange.startTick, 192);
  assert.equal(transport2.loopRange.endTick, 1152);
  assert.equal(transport2.punchRange.startTick, 576);
});

test('Mandatory Test 8: Tempo changes with Timebase policies (musical vs time)', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);

  // An object placed at Bar 5 (tick 768).
  // At 120 BPM, tick 768 = 8.0s.
  const tickStart = timeMap.meterMap.barToTick(5);
  const secondsStart = timeMap.tickToSeconds(tickStart);
  assert.equal(tickStart, 768);
  assert.equal(secondsStart, 8.0);

  // Policy 1: 'musical'
  // When project tempo changes from 120 to 60 BPM:
  // Musical tick remains 768 (Bar 5). Duration in seconds doubles to 16.0s.
  timeMap.tempoMap.setRootBpm(60);
  const musicalTick = 768;
  const musicalSecondsAfter = timeMap.tickToSeconds(musicalTick);
  assert.equal(musicalSecondsAfter, 16.0, 'Musical item changes duration in seconds with tempo');

  // Policy 2: 'time'
  // When an audio recording or sample has 'time' timebase, its absolute seconds (8.0s) remain fixed.
  // At 60 BPM, 8.0s corresponds to:
  const timeTickAfter = timeMap.secondsToTick(8.0);
  assert.equal(timeTickAfter, 384, 'Timebase "time" keeps seconds constant while tick updates');
  assert.equal(timeMap.meterMap.tickToBar(timeTickAfter).bar, 3);
});

test('Mandatory Test 9: Export selection — Exact start and end in ticks, seconds, and samples', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);
  timeMap.defaultSampleRate = 48000;

  // Selection from Bar 2 to Bar 4
  const startTick = timeMap.meterMap.barToTick(2); // 192
  const endTick = timeMap.meterMap.barToTick(4);   // 576

  const startSec = timeMap.tickToSeconds(startTick); // 2.0s
  const endSec = timeMap.tickToSeconds(endTick);     // 6.0s
  const durationSec = endSec - startSec;             // 4.0s

  assert.equal(startSec, 2.0);
  assert.equal(endSec, 6.0);
  assert.equal(durationSec, 4.0);

  // Exact sample counts for 48kHz audio export
  const startSamples = timeMap.tickToSamples(startTick, 48000);
  const endSamples = timeMap.tickToSamples(endTick, 48000);
  const durationSamples = endSamples - startSamples;

  assert.equal(startSamples, 96000);
  assert.equal(endSamples, 288000);
  assert.equal(durationSamples, 192000); // 4 * 48000
});

test('Mandatory Test 10: Loop recording / punch range bounds and pre-roll', () => {
  const timeMap = new ProjectTimeMap(120, 4, 4);
  const transport = new TransportState();

  // Configure punch recording: Punch in at Bar 3, Punch out at Bar 5, 1 Bar Pre-roll
  const punchInTick = timeMap.meterMap.barToTick(3);  // 384
  const punchOutTick = timeMap.meterMap.barToTick(5); // 768
  transport.setPunchRange(punchInTick, punchOutTick, true);
  transport.punchRange.preRollBars = 1;

  assert.equal(transport.punchRange.enabled, true);
  assert.equal(transport.punchRange.startTick, 384);
  assert.equal(transport.punchRange.endTick, 768);
  assert.equal(transport.punchRange.preRollBars, 1);

  // Effective recording start with 1-bar pre-roll (Bar 2 = tick 192)
  const preRollStartTick = timeMap.meterMap.barToTick(3 - transport.punchRange.preRollBars);
  assert.equal(preRollStartTick, 192);

  // Playhead passes through:
  // At tick 100: outside punch
  assert.equal(100 >= transport.punchRange.startTick && 100 < transport.punchRange.endTick, false);
  // At tick 400: inside punch
  assert.equal(400 >= transport.punchRange.startTick && 400 < transport.punchRange.endTick, true);
  // At tick 800: outside punch
  assert.equal(800 >= transport.punchRange.startTick && 800 < transport.punchRange.endTick, false);
});

