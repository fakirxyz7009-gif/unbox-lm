'use strict';

const { activateRecoveryButton, findAudioRuntime } = require('./electron-recording-recovery.cjs');
const { createWelcomeProject } = require('./electron-welcome-fixture.cjs');

const inputName = 'Packaged MIDI fixture (simulated)';
const trackName = 'Packaged MIDI recovery instrument';
const clipId = 'packaged_midi_baseline';
const startStep = 32;

async function inspectMidiTake(page, target) {
  return page.evaluate(async ({ projectId, trackId, sessionId, mode, clipId }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('unbox-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (name, action) => new Promise((resolve, reject) => {
      const request = action(db.transaction(name).objectStore(name));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const { engine } = window.recordingSmokeRuntime;
    const takeId = sessionId ? `recovered_midi_${sessionId}:${trackId}` : null;
    const describeTrack = (track) => track && {
      baseline: track.arrangementClips?.find((clip) => clip.id === clipId),
      clips: track.arrangementClips?.length ?? 0,
      patterns: track.patternList?.length ?? 0,
      active: track.patternList?.find((pattern) => pattern.id === track.activePatternId),
      recovered: mode === 'pattern_loop'
        ? track.patternList?.find((pattern) => pattern.id === takeId)
        : track.arrangementClips?.find((clip) => clip.id === takeId),
    };
    try {
      if (!db.objectStoreNames.contains('recordingJournal')) return {};
      const lastProject = await read('settings', (store) => store.get('lastProjectId'));
      const project = lastProject?.value && await read('projects', (store) => store.get(projectId ?? lastProject.value));
      const tracks = project ? JSON.parse(project.json).tracks ?? [] : [];
      const journal = sessionId
        ? await read('recordingJournal', (store) => store.get(`manifest:${sessionId}`))
        : trackId && (await read('recordingJournal', (store) => store.getAll(IDBKeyRange.bound('manifest:', 'manifest;', false, true))))
          .find((manifest) => manifest.midiMode === mode && manifest.tracks.some((track) => track.trackId === trackId));
      const rows = journal ? await read('recordingJournal', (store) => store.index('sessionId').getAll(journal.sessionId)) : [];
      const notes = rows.filter((row) => row.kind === 'midi' && row.trackId === trackId).map((row) => row.note);
      return {
        projectId: project?.id,
        lastProjectId: lastProject?.value,
        saved: describeTrack(tracks.find((track) => track.id === trackId)),
        live: describeTrack(engine.tracks.find((track) => track.id === trackId)),
        recording: engine.recorder.state === 'recording',
        message: engine.recorder.message,
        keyHeld: engine.midi.held.has(67),
        journal: journal && {
          sessionId: journal.sessionId, projectId: journal.projectId, mode: journal.midiMode,
          startPos: journal.startPos, confirmed: journal.recordEdgeConfirmed === true,
          finalizing: !!journal.finalizingAt || !!journal.completedAt,
        },
        notes,
      };
    } finally {
      db.close();
    }
  }, { ...target, clipId });
}

async function waitForMidiTake(page, target, predicate, description) {
  const deadline = Date.now() + 12_000;
  let state;
  do {
    state = await inspectMidiTake(page, target);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 75));
  } while (Date.now() < deadline);
  throw new Error(`${description}: ${JSON.stringify(state)}`);
}

function expectedNotesMatch(notes, offset) {
  const released = notes?.find((note) => note.note === 64);
  const held = notes?.find((note) => note.note === 67);
  return notes?.length === 2 && released?.step === offset + 1 && released.length === 2 &&
    Math.abs(released.velocity - 96 / 127) < 1e-6 && held?.step === offset + 4 && held.length === 2 &&
    Math.abs(held.velocity - 110 / 127) < 1e-6;
}

async function prepareMidiRecordingCrash(page, mode) {
  // Electron connects Web MIDI on startup. Install the simulated input before the app mounts
  // again so its real adapter binds the port instead of caching an empty hardware collection.
  await page.addInitScript((inputName) => {
    const port = Object.assign(new EventTarget(), {
      id: 'packaged-recovery-midi', name: inputName, state: 'connected', connection: 'open',
    });
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async () => ({ inputs: new Map([[port.id, port]]), outputs: new Map(), onstatechange: null }),
    });
    window.dispatchRecoveryMidi = (data) => {
      port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array(data) }));
    };
  }, inputName);
  await page.reload({ waitUntil: 'load', timeout: 15_000 });
  await findAudioRuntime(page);
  await page.waitForFunction((name) => window.recordingSmokeRuntime.engine.midi.ports.some((port) => port.name === name),
    inputName, { timeout: 10_000 });
  await createWelcomeProject(page);
  const { projectId } = await waitForMidiTake(page, {}, (state) => !!state.projectId, 'The app did not save its initial project');
  const fixture = await page.evaluate(({ mode, trackName, clipId, startStep }) => {
    const { engine } = window.recordingSmokeRuntime;
    engine.setPlaybackMode(mode);
    const device = engine.createDevice('subtractor', trackName);
    const track = engine.tracks.find((entry) => entry.deviceId === device.id);
    const pattern = track?.patternList?.find((entry) => entry.id === track.activePatternId);
    if (!track || !pattern) throw new Error('The MIDI fixture instrument did not expose a track and pattern.');
    const startBar = startStep / engine.stepsPerBar;
    track.arrangementClips = [{
      id: clipId, name: 'Existing take', kind: 'notes', startBar, lengthBars: 1,
      notes: [{ step: 0, note: 55, length: 1, velocity: 0.5 }],
    }];
    pattern.division = '1/8';
    pattern.steps[0] = { note: 50, velocity: 0.7, length: 1 };
    for (const entry of engine.tracks) engine.setTrackArmed(entry.id, entry.id === track.id);
    engine.commitEdit();
    return { trackId: track.id, startBar };
  }, { mode, trackName, clipId, startStep });
  const criteria = { projectId, trackId: fixture.trackId, mode };
  await page.keyboard.press('Control+s');
  const baseline = await waitForMidiTake(page, criteria,
    (state) => state.saved?.baseline?.id === clipId && state.saved.active?.steps[0]?.note === 50,
    'The baseline fixture did not save through the real app');

  await page.evaluate((position) => {
    const { engine } = window.recordingSmokeRuntime;
    engine.seekToSongPosition(position);
    // Make note timestamps independent of desktop scheduling jitter. The actual transport,
    // input adapter, recorder, journal, and Record button all continue running normally.
    window.recoveryMidiPosition = position;
    engine.positionAtTime = () => window.recoveryMidiPosition;
    engine.recorder.settings.mode = 'replace';
  }, startStep);
  await page.getByRole('button', { name: 'Record armed tracks', exact: true }).click({ timeout: 10_000 });
  await page.waitForFunction(() => window.recordingSmokeRuntime.engine.recorder.state === 'recording', undefined, { timeout: 10_000 });
  await page.evaluate(({ trackId, startStep }) => {
    const { engine } = window.recordingSmokeRuntime;
    engine.midiTargetDeviceId = engine.tracks.find((track) => track.id === trackId).deviceId;
    const send = (position, data) => {
      window.recoveryMidiPosition = position;
      window.dispatchRecoveryMidi(data);
    };
    send(startStep + 1, [0x91, 64, 96]);
    send(startStep + 3, [0x81, 64, 0]);
    send(startStep + 4, [0x92, 67, 110]);
    window.recoveryMidiPosition = startStep + 6;
  }, { trackId: fixture.trackId, startStep });
  const captured = await waitForMidiTake(page, criteria, (state) =>
    state.recording && state.keyHeld && state.journal?.projectId === projectId && state.journal.confirmed &&
    !state.journal.finalizing && state.journal.startPos === startStep && expectedNotesMatch(state.notes, startStep),
  'The recorder did not persist the released and held MIDI notes');
  return { ...criteria, sessionId: captured.journal.sessionId, startBar: fixture.startBar, baseline: baseline.saved };
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function verifiedTrack(track, target) {
  if (!track || !equalJson(track.baseline, target.baseline.baseline) || !equalJson(track.active, target.baseline.active)) return false;
  const recovered = track.recovered;
  if (!recovered) return false;
  if (target.mode === 'song_arrangement') {
    return track.clips === target.baseline.clips + 1 && track.patterns === target.baseline.patterns &&
      recovered.kind === 'notes' && recovered.muted === true && recovered.startBar === target.startBar && expectedNotesMatch(recovered.notes, 0);
  }
  if (track.clips !== target.baseline.clips || track.patterns !== target.baseline.patterns + 1 ||
      recovered.division !== '1/8' || recovered.length !== track.active.length) return false;
  const index = (step) => Math.round((startStep + step) / 2) % recovered.length;
  const first = recovered.steps[index(1)];
  const second = recovered.steps[index(4)];
  return recovered.steps.filter(Boolean).length === 2 &&
    first?.note === 64 && first.length === 1 && Math.abs(first.velocity - 96 / 127) < 1e-6 &&
    second?.note === 67 && second.length === 1 && Math.abs(second.velocity - 110 / 127) < 1e-6;
}

async function verifyMidiRecordingRecovery(page, target, restore) {
  if (!target?.projectId || !target.trackId || !target.sessionId || !target.baseline?.active) throw new Error('The staged MIDI fixture is malformed.');
  await findAudioRuntime(page);
  const button = page.getByRole('button', { name: 'Recover MIDI', exact: true });
  if (restore) {
    await button.waitFor({ state: 'visible', timeout: 10_000 });
    const before = await inspectMidiTake(page, target);
    if (!before.journal?.confirmed || before.journal.finalizing || !expectedNotesMatch(before.notes, startStep) ||
        !equalJson(before.saved, target.baseline)) {
      throw new Error(`The active MIDI journal or original project material did not survive the forced exit: ${JSON.stringify(before)}`);
    }
    await activateRecoveryButton(button);
  }
  await waitForMidiTake(page, target, (state) => !state.journal && state.lastProjectId === target.projectId &&
    verifiedTrack(state.saved, target) && verifiedTrack(state.live, target), 'The MIDI recovery did not preserve the saved and live tracks');
  await button.waitFor({ state: 'hidden', timeout: 10_000 });
}

module.exports = { prepareMidiRecordingCrash, verifyMidiRecordingRecovery };
