import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { renderSong } from '../../src/audio/render/renderSong.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';
import type { MatrixDevice } from '../../src/audio/devices/MatrixDevice.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function run(): Promise<void> {
  const engine = audioEngine;
  await projectManager.create('empty', 'Browser Project Round Trip');
  const guitar = engine.createDevice('rec_shinyguitar_acoustic', 'Round Trip Archtop');
  const track = engine.tracks.find((candidate) => candidate.deviceId === guitar.id);
  if (!track) throw new Error('Shinyguitar did not create an instrument track');
  guitar.setParam('release', 0.55);

  const noteTrack = track as SequencerTrack;
  noteTrack.arrangementClips = [{
    id: 'roundtrip_clip',
    kind: 'notes',
    startBar: 0,
    lengthBars: 1,
    name: 'Saved Piano Roll Notes',
    notes: [{ step: 0, note: 60, velocity: 0.73, length: 4, chordNotes: [64, 67] }],
  }];

  const echo = engine.createDevice('echo', 'Round Trip Delay');
  const sequencer = engine.createDevice('matrix', 'Round Trip Matrix') as MatrixDevice;
  sequencer.setStepNote(3, 7);
  sequencer.toggleStepGate(5);
  engine.cvEngine.addMatrixEntry({
    sourceDeviceId: sequencer.id, sourcePortId: 'note_cv', targetDeviceId: echo.id, targetParam: 'time', amount: 0.6, offset: 0.2, inverted: true,
  });
  for (const connection of engine.audioConnections.filter((c) => c.sourceDeviceId === guitar.id && c.targetDeviceId === 'master')) {
    engine.disconnectAudio(connection.id);
  }
  const cables = [
    engine.connectAudio(guitar.id, 'out_l', echo.id, 'in_l', '#123456'),
    engine.connectAudio(guitar.id, 'out_r', echo.id, 'in_r'),
    engine.connectAudio(echo.id, 'out_l', 'master', 'master_l'),
    engine.connectAudio(echo.id, 'out_r', 'master', 'master_r'),
  ];
  if (cables.some((id) => !id)) throw new Error('Could not connect the saved rack graph');

  engine.setBpm(137);
  engine.setPlaybackMode('song_arrangement');
  projectManager.setMeta({ artist: 'Project smoke', genre: 'Test' });
  projectManager.setNotes('IndexedDB save, reload, and audio playback verification.');
  engine.commitEdit();
  await projectManager.save();
  const projectId = projectManager.currentId;
  if (!projectId || projectManager.dirty) throw new Error('Project did not finish saving to IndexedDB');

  engine.newProject(true);
  const reopened = await projectManager.open(projectId);
  if (!reopened) throw new Error('ProjectManager could not reopen the saved project');
  if (engine.bpm !== 137) throw new Error(`BPM changed after reopen: ${engine.bpm}`);
  if (projectManager.meta.artist !== 'Project smoke' || projectManager.notes !== 'IndexedDB save, reload, and audio playback verification.') {
    throw new Error('Project metadata or notes did not survive reopen');
  }

  const loadedGuitar = [...engine.devices.values()].find((device) => device.type === 'rec_shinyguitar_acoustic' && device.name === 'Round Trip Archtop');
  const loadedEcho = [...engine.devices.values()].find((device) => device.type === 'echo' && device.name === 'Round Trip Delay');
  if (!loadedGuitar || !loadedEcho) throw new Error('Rack devices did not survive project reopen');
  if (Math.abs(Number(loadedGuitar.params.release) - 0.55) > 1e-6) throw new Error('Instrument parameter did not survive reopen');
  if (!engine.audioConnections.some((c) => c.sourceDeviceId === loadedGuitar.id && c.targetDeviceId === loadedEcho.id && c.sourcePortId === 'out_l')) {
    throw new Error('Instrument-to-effect cable did not survive reopen');
  }
  if (!engine.audioConnections.some((c) => c.sourceDeviceId === loadedEcho.id && c.targetDeviceId === 'master' && c.targetPortId === 'master_l')) {
    throw new Error('Effect-to-master cable did not survive reopen');
  }
  const loadedTrack = engine.tracks.find((candidate) => candidate.deviceId === loadedGuitar.id);
  const clip = loadedTrack?.arrangementClips?.find((candidate) => candidate.id === 'roundtrip_clip');
  const note = clip?.kind === 'notes' ? clip.notes?.[0] : undefined;
  if (!note || note.note !== 60 || note.velocity !== 0.73 || note.length !== 4 || note.chordNotes?.join(',') !== '64,67') {
    throw new Error(`Piano-roll note data did not survive reopen: ${JSON.stringify(note ?? null)}`);
  }

  const loadedSequencer = [...engine.devices.values()].find((device) => device.type === 'matrix' && device.name === 'Round Trip Matrix') as MatrixDevice | undefined;
  if (!loadedSequencer || loadedSequencer.patterns[0].notes[3] !== 7 || loadedSequencer.patterns[0].gates[5] !== true) {
    throw new Error('Matrix step patterns did not survive reopen');
  }
  const loadedRoutes = engine.cvEngine.matrixEntries.filter((m) => m.sourceDeviceId === loadedSequencer.id && m.targetDeviceId === loadedEcho.id);
  if (loadedRoutes.length !== 1 || loadedRoutes[0].amount !== 0.6 || loadedRoutes[0].offset !== 0.2 || loadedRoutes[0].inverted !== true) {
    throw new Error(`CV matrix route did not survive reopen: ${JSON.stringify(loadedRoutes)}`);
  }
  if (engine.audioConnections.find((c) => c.sourceDeviceId === loadedGuitar.id && c.targetDeviceId === loadedEcho.id && c.sourcePortId === 'out_l')?.color !== '#123456') {
    throw new Error('Cable colour did not survive reopen');
  }

  await loadedGuitar.ready?.();
  await engine.resumeContext();
  await engine.startTransport();
  let peak = 0;
  for (let i = 0; i < 20; i++) {
    await pause(25);
    const levels = engine.masterLevels();
    peak = Math.max(peak, levels.peakL, levels.peakR);
  }
  engine.stopTransport();
  if (peak <= 1e-4) throw new Error(`Reopened sequencer note produced no master output (peak ${peak.toExponential(2)})`);

  const offline = await renderSong(engine, {
    startPos: 0,
    endPos: 16,
    sampleRate: engine.ctx.sampleRate,
    tailSec: 0.25,
    masterProcessing: false,
  });
  let offlinePeak = 0;
  for (let channel = 0; channel < offline.numberOfChannels; channel++) {
    for (const sample of offline.getChannelData(channel)) offlinePeak = Math.max(offlinePeak, Math.abs(sample));
  }
  if (offlinePeak <= 1e-4) throw new Error(`Offline render of the reopened song was silent (peak ${offlinePeak.toExponential(2)})`);

  result!.dataset.status = 'passed';
  result!.textContent = `PASS · IndexedDB save/reopen preserved ${engine.devices.size} devices, parameter state, coloured stereo cables, metadata, a piano-roll chord, matrix steps and a CV-matrix route; live peak ${peak.toExponential(2)}, offline peak ${offlinePeak.toExponential(2)}.`;
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
