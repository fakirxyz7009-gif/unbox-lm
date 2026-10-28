import React, { useState } from 'react';
import '../../src/index.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import { createRoot } from 'react-dom/client';
import { audioEngine as engine } from '../../src/audio/AudioEngine.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { deviceSample, installSampleVoice, setPadSample, type PadSample } from '../../src/audio/deviceSamples.ts';
import { renderDeviceNote, audioPeak } from '../../src/audio/render/renderDeviceNote.ts';
import { applyTrackAudioAction } from '../../src/audio/render/trackAudioActions.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import { LcdAudioClipBox } from '../../src/workstation/LcdAudioClipBox.tsx';
import type { SequencerTrack } from '../../src/audio/types.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function expect(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 300; i++) { if (test()) return; await wait(20); }
  throw new Error(message);
}
function rms(buffer: AudioBuffer, start: number, end: number): number {
  const data = buffer.getChannelData(0);
  const first = Math.round(start * buffer.sampleRate);
  const last = Math.min(data.length, Math.round(end * buffer.sampleRate));
  let sum = 0;
  for (let i = first; i < last; i++) sum += data[i] ** 2;
  return Math.sqrt(sum / Math.max(1, last - first));
}
function frequency(buffer: AudioBuffer, expected: number): number {
  const data = buffer.getChannelData(0);
  let bestLag = 0;
  let bestError = Infinity;
  for (let lag = Math.floor(buffer.sampleRate / (expected * 1.12)); lag <= Math.ceil(buffer.sampleRate / (expected * 0.88)); lag++) {
    let error = 0;
    let power = 0;
    for (let i = Math.round(buffer.sampleRate * 0.15); i < Math.round(buffer.sampleRate * 0.4); i++) {
      error += (data[i] - data[i + lag]) ** 2;
      power += data[i] ** 2 + data[i + lag] ** 2;
    }
    if (error / Math.max(1e-12, power) < bestError) { bestError = error / Math.max(1e-12, power); bestLag = lag; }
  }
  return buffer.sampleRate / bestLag;
}
function mount(track: SequencerTrack): void {
  function Editor() {
    const [, redraw] = useState(0);
    return <LcdAudioClipBox track={track} onForce={() => redraw((value) => value + 1)} />;
  }
  root.render(<Editor />);
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Note Audio Regression');
  const marimba = engine.createDevice('rec_vcsl_marimba', 'Captured Marimba');
  const track = engine.tracks.find((candidate) => candidate.deviceId === marimba.id)!;
  expect(track, 'The recorded marimba did not create a track');
  await marimba.ready?.();
  mount(track);
  await until(() => !!editor.querySelector('select'), 'Note editor did not mount');
  const select = editor.querySelector('select')!;
  select.value = '53';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(150);
  expect(!deviceSample(marimba.id)?.pads, 'Opening/selecting the editor silently replaced instrument samples');
  expect(!editor.querySelector('[aria-label="Arm live pattern note writing"]')?.matches(':disabled'), 'Pattern note writing depends on capturing a sample first');
  const capture = editor.querySelector<HTMLButtonElement>('[aria-label="Capture selected instrument note"]')!;
  capture.click();
  await until(() => !!deviceSample(marimba.id)?.pads?.[53], 'Explicit note capture did not finish');
  const captured = deviceSample(marimba.id)!.pads![53];
  const capturedBuffer = audioStore.get(captured.audioId)!.buffer;
  const measuredHz = frequency(capturedBuffer, 174.614);
  expect(Math.abs(1200 * Math.log2(measuredHz / 174.614)) < 40, `Captured MIDI 53 is not marimba F3 (${measuredHz} Hz)`);
  const requests = performance.getEntriesByType('resource').map((entry) => entry.name);
  expect(!requests.some((url) => /big.?rusty|Playable_Patches|chamkila/i.test(url)), 'Note capture fetched an unrelated drum or private recording');
  await until(() => !!editor.querySelector('button[title^="Audition"]'), 'Capture controls did not return');
  await engine.resumeContext();
  editor.querySelector<HTMLButtonElement>('button[title^="Audition"]')!.click();
  await until(() => !!editor.querySelector('button[title="Stop Audition"]'), 'Audition did not start');
  editor.querySelector<HTMLButtonElement>('button[title="Stop Audition"]')!.click();
  await until(() => !!editor.querySelector('button[title^="Audition"]'), 'Audition did not stop');

  const settings: PadSample = {
    ...captured, level: 0.72, offset: 0.12, duration: 0.38, pitch: 7, tune: -23,
    reverse: true, loop: true, attack: 0.018, decay: 0.13, sustain: 0.64, release: 0.11,
  };
  setPadSample(marimba.id, 53, settings);
  engine.changed();
  await projectManager.save();
  const savedId = projectManager.currentId;
  expect(savedId, 'Edited sample project was not saved');
  engine.newProject(true);
  expect(await projectManager.open(savedId), 'Edited sample project did not reopen');
  const restored = [...engine.devices.values()].find((device) => device.name === 'Captured Marimba')!;
  expect(restored && JSON.stringify(deviceSample(restored.id)?.pads?.[53]) === JSON.stringify(settings), 'Saved trim, pitch, reverse, loop or envelope settings changed after reopen');

  // A test-only constant fixture makes the trim duration and loop lifetime unambiguous.
  const fixture = engine.ctx.createBuffer(1, engine.ctx.sampleRate, engine.ctx.sampleRate);
  fixture.getChannelData(0).fill(0.25);
  const fixtureAsset = audioStore.add('Regression fixture only', fixture);
  const assignment: PadSample = { audioId: fixtureAsset.id, level: 1, offset: 0.1, duration: 0.4, pitch: 12, attack: 0.002, release: 0.01 };
  setPadSample(restored.id, 53, assignment);
  const pitched = await renderDeviceNote(engine, restored, 53);
  expect(rms(pitched, 0.05, 0.14) > 0.01 && rms(pitched, 0.23, 0.35) < 1e-6, 'A +12-semitone sample did not end after half its source duration');
  setPadSample(restored.id, 53, { ...assignment, loop: true, sustain: 1 });
  const looped = await renderDeviceNote(engine, restored, 53);
  expect(rms(looped, 0.5, 0.8) > 0.01 && rms(looped, 2.2, 2.4) < 1e-6, 'Trimmed loop stopped after one pass or ignored key-up');

  await projectManager.create('empty', 'Track Audio Regression');
  const instrument = engine.createDevice('rec_vcsl_marimba', 'Source Marimba');
  let source = engine.tracks.find((candidate) => candidate.deviceId === instrument.id)!;
  engine.setPlaybackMode('song_arrangement');
  const beforeTracks = engine.tracks.length;
  const beforeAssets = audioStore.all().length;
  let rejected = false;
  try { await applyTrackAudioAction(engine, source.id, 'chopToKeys'); } catch (error) { rejected = /no audible/.test(String(error)); }
  expect(rejected && engine.tracks.length === beforeTracks && audioStore.all().length === beforeAssets, 'Empty-track slicing invented audio, notes, assets or tracks');
  source.arrangementClips = [{
    id: 'source-notes', kind: 'notes', name: 'Actual chords', startBar: 0, lengthBars: 1,
    notes: [{ step: 0, note: 60, velocity: 0.8, length: 4, chordNotes: [64, 67] }, { step: 8, note: 72, velocity: 0.6, length: 2 }],
  }];
  const originalNotes = JSON.stringify(source.arrangementClips);
  engine.commitEdit();
  const split = await applyTrackAudioAction(engine, source.id, 'split');
  const audioTrack = engine.tracks.find((candidate) => candidate.id === split.trackId)!;
  expect(audioTrack.kind === 'audio' && audioTrack.id !== source.id && audioTrack.arrangementClips?.length === 2, 'Split failed to target the newly created audio track');
  expect(JSON.stringify(source.arrangementClips) === originalNotes, 'Rendering audio changed the source MIDI');
  expect(engine.undo(), 'Rendered split did not enter undo history');
  expect(engine.tracks.length === beforeTracks, 'One undo did not remove the entire rendered split');
  source = engine.tracks.find((candidate) => candidate.name === 'Source Marimba')!;
  const slices = await applyTrackAudioAction(engine, source.id, 'chopToKeys');
  expect(slices.samplerDeviceId, 'To Keys did not return a real sampler');
  const pads = deviceSample(slices.samplerDeviceId)?.pads;
  expect(pads && Object.keys(pads).length === 16, 'To Keys did not create 16 sample assignments');
  const sliceAudio = audioStore.get(pads[60].audioId)!.buffer;
  expect(audioPeak(sliceAudio) > 0.01, 'Normalized MIDI velocities were lost while rendering sample slices');
  for (let i = 0; i < 16; i++) {
    const pad = pads[60 + i];
    expect(pad?.audioId === pads[60].audioId && Math.abs(pad.offset! - i * sliceAudio.duration / 16) < 1e-6 && Math.abs(pad.duration! - sliceAudio.duration / 16) < 1e-6, `Slice ${i} has incorrect source audio or boundaries`);
  }
  expect(JSON.stringify(source.arrangementClips) === originalNotes, 'To Keys rewrote the original MIDI');
  const sampler = engine.devices.get(slices.samplerDeviceId)!;
  installSampleVoice(sampler);
  const firstSlice = await renderDeviceNote(engine, sampler, 60);
  expect(audioPeak(firstSlice) > 0.001, 'The new sampler cannot play its first audio slice');
  expect(engine.undo() && ![...engine.devices.values()].some((device) => device.name === 'Source Marimba Audio Slices'), 'To Keys did not undo as one action');
  expect(engine.redo(), 'To Keys did not redo');
  const redoneSampler = [...engine.devices.values()].find((device) => device.name === 'Source Marimba Audio Slices')!;
  expect(redoneSampler && Object.keys(deviceSample(redoneSampler.id)?.pads ?? {}).length === 16, 'Redo lost slice assignments');
  mount(engine.tracks.find((candidate) => candidate.deviceId === redoneSampler.id)!);
  await until(() => !!editor.querySelector('select'), 'Slice editor did not mount');
  const sliceSelect = editor.querySelector('select')!;
  sliceSelect.value = '60';
  sliceSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !editor.querySelector<HTMLFieldSetElement>('fieldset')?.disabled, 'The slice audio controls remained disabled');
  result.dataset.status = 'passed';
  result.textContent = `PASS · Explicit marimba MIDI 53 capture ${measuredHz.toFixed(2)} Hz; opening the editor preserves layers; audition starts/stops; sample edits survive IndexedDB reopen; pitch duration and trimmed-loop release measured; empty-track rejection, actual track split, 16 playable slices and single-action undo/redo passed.`;
}

void run().catch((error: unknown) => {
  engine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
