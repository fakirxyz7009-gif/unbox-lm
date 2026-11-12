import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { renderSong } from '../../src/audio/render/renderSong.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import type { SequencerTrack } from '../../src/audio/types.ts';
import type { MatrixDevice } from '../../src/audio/devices/MatrixDevice.ts';
import { RV7000Device } from '../../src/audio/devices/RV7000Device.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { readZip } from '../../src/project/zip.ts';
import { moveUnit, placementOf, setFolded } from '../../src/rack/rackLayout.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const sameSample = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1e-6;

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
  const reverb = engine.createDevice('rv7000', 'Round Trip Custom IR') as RV7000Device;
  const response = engine.ctx.createBuffer(2, 128, engine.ctx.sampleRate);
  response.getChannelData(0)[0] = 0.75;
  response.getChannelData(1)[0] = 0.5;
  response.getChannelData(0)[24] = -0.2;
  const responseProvenance = {
    origin: 'link-import' as const,
    rights: 'cc-by' as const,
    source: 'https://example.org/round-trip-custom-room',
    attribution: 'Example Performer — CC-BY-4.0',
    license: 'CC-BY-4.0',
    declaredAt: '2026-11-11T00:00:00.000Z',
  };
  const responseAsset = audioStore.add('Round Trip Custom Room', response, { provenance: responseProvenance });
  reverb.setCustomImpulse(responseAsset.id, responseAsset.buffer);
  // A bare add is the legacy/direct-import fallback: it must not silently gain a licence merely
  // because it is used in a project. Attach it to a second RV7000 so project/archive discovery
  // exercises its real persistence path as well.
  const unknownResponse = engine.ctx.createBuffer(1, 32, engine.ctx.sampleRate);
  unknownResponse.getChannelData(0)[0] = 0.25;
  const unknownResponseAsset = audioStore.add('Round Trip Unverified Local Audio', unknownResponse);
  if (unknownResponseAsset.provenance?.origin !== 'unknown' || unknownResponseAsset.provenance.rights !== 'unknown') {
    throw new Error(`Bare project audio was not explicitly marked unknown: ${JSON.stringify(unknownResponseAsset.provenance ?? null)}`);
  }
  const unknownReverb = engine.createDevice('rv7000', 'Round Trip Unknown Provenance IR') as RV7000Device;
  unknownReverb.setCustomImpulse(unknownResponseAsset.id, unknownResponseAsset.buffer);
  const aux = engine.mixer.createBus('Round Trip Aux', 'return', '#36c4d8');
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

  // Project state beyond the graph: channel strip, an aux send, automation and
  // 3-column rack placement must all survive the same real IndexedDB reopen.
  engine.mixer.setVolume(guitar.id, 0.72);
  engine.mixer.setPan(guitar.id, -0.26);
  engine.mixer.setWidth(guitar.id, 1.18);
  engine.mixer.setTrim(guitar.id, 1.5);
  engine.mixer.setEq(guitar.id, { highDb: 2.5, highHz: 5600 });
  engine.mixer.setDyn(guitar.id, { compOn: true, threshold: -18, ratio: 3.5 });
  if (!engine.mixer.setSend(guitar.id, aux.id, 0.42, true)) throw new Error('Could not create the saved aux send');
  const automation = engine.automation.addLane({ kind: 'channel', channelId: guitar.id, param: 'pan' }, 'read', noteTrack.id);
  engine.automation.setPoints(automation.id, [
    { pos: 0, value: 0.3, hold: true },
    { pos: 8, value: 0.7, curve: 0.25 },
  ]);
  moveUnit(guitar.id, 2, 7.25);
  setFolded([echo.id], true);

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
  const loadedReverb = [...engine.devices.values()].find((device) => device.type === 'rv7000' && device.name === 'Round Trip Custom IR') as RV7000Device | undefined;
  const loadedUnknownReverb = [...engine.devices.values()].find((device) => device.type === 'rv7000' && device.name === 'Round Trip Unknown Provenance IR') as RV7000Device | undefined;
  const loadedAux = [...engine.devices.values()].find((device) => device.type === 'mix_bus' && device.name === 'Round Trip Aux');
  if (!loadedGuitar || !loadedEcho || !loadedReverb || !loadedUnknownReverb || !loadedAux) throw new Error('Rack devices or aux bus did not survive project reopen');
  if (loadedReverb.params.impulseAssetId !== responseAsset.id) throw new Error('Custom RV7000 impulse asset id did not survive project reopen');
  const loadedConvolver = Reflect.get(loadedReverb, 'convolver') as ConvolverNode;
  if (!loadedConvolver.buffer || !sameSample(loadedConvolver.buffer.getChannelData(0)[0], 0.75) || !sameSample(loadedConvolver.buffer.getChannelData(1)[0], 0.5) || !sameSample(loadedConvolver.buffer.getChannelData(0)[24], -0.2)) {
    throw new Error(`Custom RV7000 impulse response did not survive project reopen (${JSON.stringify({
      id: loadedReverb.params.impulseAssetId,
      frames: loadedConvolver.buffer?.length,
      left0: loadedConvolver.buffer?.getChannelData(0)[0],
      right0: loadedConvolver.buffer?.getChannelData(1)[0],
      left24: loadedConvolver.buffer?.getChannelData(0)[24],
    })})`);
  }
  const offlineReverb = engine.instantiateOffline(new OfflineAudioContext(2, 128, engine.ctx.sampleRate), loadedReverb) as RV7000Device;
  const offlineConvolver = Reflect.get(offlineReverb, 'convolver') as ConvolverNode;
  if (!offlineConvolver.buffer || !sameSample(offlineConvolver.buffer.getChannelData(0)[0], 0.75) || !sameSample(offlineConvolver.buffer.getChannelData(1)[0], 0.5) || !sameSample(offlineConvolver.buffer.getChannelData(0)[24], -0.2)) {
    throw new Error('Custom RV7000 impulse response did not transfer to the offline clone');
  }
  offlineReverb.dispose();
  if (audioStore.get(unknownResponseAsset.id)?.provenance?.origin !== 'unknown' || audioStore.get(unknownResponseAsset.id)?.provenance?.rights !== 'unknown') {
    throw new Error('Unknown local-audio provenance did not survive IndexedDB project reopen');
  }
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
  const channel = engine.mixer.settingsOf(loadedGuitar.id);
  if (!channel || Math.abs((channel.volume ?? 0) - 0.72) > 1e-6 || Math.abs((channel.pan ?? 0) + 0.26) > 1e-6 || Math.abs((channel.width ?? 0) - 1.18) > 1e-6 || Math.abs((channel.trimDb ?? 0) - 1.5) > 1e-6) {
    throw new Error(`Mixer strip state did not survive reopen: ${JSON.stringify(channel ?? null)}`);
  }
  if (channel.eq?.highDb !== 2.5 || channel.eq.highHz !== 5600 || channel.dyn?.compOn !== true || channel.dyn.threshold !== -18 || channel.dyn.ratio !== 3.5) {
    throw new Error(`Mixer EQ/dynamics state did not survive reopen: ${JSON.stringify({ eq: channel.eq, dyn: channel.dyn })}`);
  }
  const send = channel.sends?.find((candidate) => candidate.busId === loadedAux.id);
  if (!send || Math.abs(send.level - 0.42) > 1e-6 || send.pre !== true) {
    throw new Error(`Mixer aux send did not survive reopen: ${JSON.stringify(channel.sends ?? [])}`);
  }
  const loadedAutomation = engine.automation.lanes.find((lane) => lane.target.kind === 'channel' && lane.target.channelId === loadedGuitar.id && lane.target.param === 'pan');
  if (!loadedAutomation || loadedAutomation.mode !== 'read' || loadedAutomation.points.length !== 2 || loadedAutomation.points[0]?.pos !== 0 || loadedAutomation.points[0]?.value !== 0.3 || loadedAutomation.points[0]?.hold !== true || loadedAutomation.points[1]?.pos !== 8 || loadedAutomation.points[1]?.value !== 0.7 || loadedAutomation.points[1]?.curve !== 0.25) {
    throw new Error(`Automation lane did not survive reopen: ${JSON.stringify(loadedAutomation ?? null)}`);
  }
  const guitarPlacement = placementOf(loadedGuitar.id);
  const echoPlacement = placementOf(loadedEcho.id);
  if (guitarPlacement?.col !== 2 || guitarPlacement.order !== 7.25 || echoPlacement?.folded !== true) {
    throw new Error(`Rack placement did not survive reopen: ${JSON.stringify({ guitarPlacement, echoPlacement })}`);
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

  // Archive acceptance must not merely reuse the asset still held in IndexedDB/memory. Export the
  // live project, remove its source response, then require `.unbox` import to restore the buffer.
  const archive = await projectManager.exportArchive(projectId);
  const archiveEntries = await readZip(archive.blob);
  if (!archiveEntries.has(`audio/${responseAsset.id}.wav`)) throw new Error('Project archive omitted the custom RV7000 impulse response');
  const archiveInfo = JSON.parse(new TextDecoder().decode(archiveEntries.get('info.json')!)) as { version?: number; audio?: { id: string; provenance?: unknown }[] };
  const archivedResponse = archiveInfo.audio?.find((item) => item.id === responseAsset.id);
  const archivedUnknown = archiveInfo.audio?.find((item) => item.id === unknownResponseAsset.id);
  if (archiveInfo.version !== 2 || JSON.stringify(archivedResponse?.provenance) !== JSON.stringify(responseProvenance)) {
    throw new Error(`Project archive omitted custom-IR provenance metadata: ${JSON.stringify(archivedResponse ?? null)}`);
  }
  if (archivedUnknown?.provenance === undefined || (archivedUnknown.provenance as { origin?: unknown }).origin !== 'unknown' || (archivedUnknown.provenance as { rights?: unknown }).rights !== 'unknown') {
    throw new Error(`Project archive did not retain explicit unknown provenance: ${JSON.stringify(archivedUnknown ?? null)}`);
  }
  if (!(await audioStore.remove(responseAsset.id)) || audioStore.get(responseAsset.id) || !(await audioStore.remove(unknownResponseAsset.id)) || audioStore.get(unknownResponseAsset.id)) throw new Error('Could not remove source IR audio before archive import');
  if (!(await projectManager.importArchive(archive.blob, 'Round Trip IR Archive'))) throw new Error('ProjectManager could not import the custom-IR archive');
  const archiveReverb = [...engine.devices.values()].find((device) => device.type === 'rv7000' && device.name === 'Round Trip Custom IR') as RV7000Device | undefined;
  const archiveConvolver = archiveReverb && Reflect.get(archiveReverb, 'convolver') as ConvolverNode | undefined;
  if (!archiveReverb || archiveReverb.params.impulseAssetId !== responseAsset.id || !archiveConvolver?.buffer || !sameSample(archiveConvolver.buffer.getChannelData(0)[0], 0.75) || !sameSample(archiveConvolver.buffer.getChannelData(1)[0], 0.5) || !sameSample(archiveConvolver.buffer.getChannelData(0)[24], -0.2)) {
    throw new Error('Custom RV7000 impulse response did not survive .unbox archive import');
  }
  if (JSON.stringify(audioStore.get(responseAsset.id)?.provenance) !== JSON.stringify(responseProvenance)) {
    throw new Error('Custom RV7000 impulse provenance did not survive .unbox archive import');
  }
  if (audioStore.get(unknownResponseAsset.id)?.provenance?.origin !== 'unknown' || audioStore.get(unknownResponseAsset.id)?.provenance?.rights !== 'unknown') {
    throw new Error('Unknown local-audio provenance did not survive .unbox archive import');
  }

  result!.dataset.status = 'passed';
  result!.textContent = `PASS · IndexedDB save/reopen and .unbox archive import preserved ${engine.devices.size} devices, instrument and mixer state, a custom RV7000 impulse response, aux send, automation, coloured stereo cables, rack placement, metadata, a piano-roll chord, matrix steps and a CV-matrix route; live peak ${peak.toExponential(2)}, offline peak ${offlinePeak.toExponential(2)}.`;
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result!.dataset.status = 'failed';
  result!.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
