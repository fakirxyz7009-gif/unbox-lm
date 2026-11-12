'use strict';

const armedDestinationName = 'Crash recovery stereo fixture';
const masterDestinationName = 'Master recording';
const signal = [0.125, -0.25];

async function findAudioRuntime(page) {
  await page.evaluate(async () => {
    // Use the already loaded production module. Rollup can rename its exported bindings.
    const preload = document.querySelector('link[rel="modulepreload"][href*="app-audio-engine-"]');
    if (!preload) throw new Error('Could not locate the packaged audio-engine module.');
    const exports = Object.values(await import(preload.href));
    const engine = exports.find((entry) => entry && entry.ctx instanceof AudioContext &&
      typeof entry.createAudioTrack === 'function' && typeof entry.setTrackArmed === 'function');
    const audioStore = exports.find((entry) => entry && typeof entry.get === 'function' &&
      typeof entry.ensurePersisted === 'function');
    if (!engine || !audioStore) throw new Error('The production audio engine or audio store was not exported.');
    window.recordingSmokeRuntime = { engine, audioStore };
  });
}

// This probe only reads IndexedDB. All journal, project and audio writes come from the app.
async function inspectStorage(page, target) {
  return page.evaluate(async ({ projectId, trackId, sessionId, recoveredName, master, signal }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('unbox-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const get = (store, action) => new Promise((resolve, reject) => {
      const request = action(db.transaction(store).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const matchesSignal = (channels, start, length) => channels?.length === signal.length &&
      channels.every((channel, index) => {
        const samples = new Float32Array(channel).subarray(start, start + length);
        return samples.length === length && samples.every((value) => Math.abs(value - signal[index]) < 1e-6);
      });

    try {
      const lastProject = await get('settings', (store) => store.get('lastProjectId'));
      const project = lastProject?.value && await get('projects', (store) => store.get(projectId ?? lastProject.value));
      const tracks = project?.json ? JSON.parse(project.json).tracks ?? [] : [];
      const manifestRows = await get('recordingJournal', (store) => store.getAll(IDBKeyRange.bound('manifest:', 'manifest;', false, true)));
      const journal = manifestRows.find((entry) => entry.sessionId === sessionId ||
        (!sessionId && trackId && entry.tracks?.some((track) => track.trackId === trackId)));
      let verifiedFrames = 0;
      if (trackId && journal?.recordEdgeConfirmed && Number.isFinite(journal.startFrame)) {
        const rows = await get('recordingJournal', (store) => store.index('sessionId').getAll(journal.sessionId));
        const chunks = rows.filter((row) => row.kind === 'chunk' && row.trackId === trackId).sort((a, b) => a.frame - b.frame);
        let nextFrame = journal.startFrame;
        for (const chunk of chunks) {
          const lastFrame = chunk.frame + (chunk.channels[0]?.byteLength ?? 0) / Float32Array.BYTES_PER_ELEMENT;
          if (lastFrame <= nextFrame) continue;
          if (chunk.frame > nextFrame) break;
          const length = lastFrame - nextFrame;
          if (!matchesSignal(chunk.channels, nextFrame - chunk.frame, length)) break;
          nextFrame = lastFrame;
        }
        verifiedFrames = nextFrame - journal.startFrame;
      }

      const recovered = tracks.filter((track) => track.kind === 'audio' && track.name === recoveredName);
      const clips = recovered.flatMap((track) => track.arrangementClips ?? []).filter((clip) => clip.kind === 'audio');
      const assetId = clips[0]?.audioId;
      const asset = assetId ? await get('audio', (store) => store.get(assetId)) : null;
      const recorder = window.recordingSmokeRuntime.engine.recorder;
      return {
        projectId: project?.id ?? null,
        lastProjectId: lastProject?.value ?? null,
        recorderState: recorder.state,
        recorderMessage: recorder.message,
        recording: master ? recorder.recordingMaster : recorder.state === 'recording',
        journal: journal ? {
          sessionId: journal.sessionId,
          projectId: journal.projectId,
          startFrame: journal.startFrame,
          durableThroughFrame: journal.durableThroughFrame,
          finalizing: !!journal.finalizingAt || !!journal.completedAt,
        } : null,
        verifiedFrames,
        recoveredCount: recovered.length,
        clipCount: clips.length,
        assetId: assetId ?? null,
        startBar: clips[0]?.startBar ?? null,
        muted: recovered[0]?.mute === true,
        frames: asset?.length ?? 0,
        hasSavedAsset: project?.audioIds?.includes(assetId) ?? false,
        hasExpectedSignal: !!asset?.length && matchesSignal(asset.channels, 0, asset.length),
      };
    } finally {
      db.close();
    }
  }, { ...target, recoveredName: `Recovered — ${target.master ? masterDestinationName : armedDestinationName}`, signal });
}

async function waitForStorage(page, target, predicate, failureMessage) {
  const deadline = Date.now() + 12_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await inspectStorage(page, target);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${failureMessage}: ${JSON.stringify(state)}`);
}

async function prepareRecordingCrash(page, master = false) {
  await findAudioRuntime(page);
  const { projectId } = await waitForStorage(page, {}, (state) => !!state.projectId, 'The app did not save its initial project');
  const fixture = await page.evaluate(({ destinationName, master, signal }) => {
    const { engine } = window.recordingSmokeRuntime;
    for (const track of engine.tracks) {
      if (track.armed) engine.setTrackArmed(track.id, false);
    }
    engine.rewindToStart();
    // Distinct, exactly representable samples detect silence, gaps and swapped channels.
    const stereo = engine.ctx.createChannelMerger(2);
    let trackId = null;
    const startBar = master ? 2 : 0;
    if (master) {
      // Feed the production pre-monitor tap below the safety clipper's linear threshold.
      engine.seekToSongPosition(startBar * engine.stepsPerBar);
      stereo.connect(engine.masterTap);
    } else {
      const source = engine.createAudioTrack('Crash recovery fixture source');
      const destination = engine.createAudioTrack(destinationName);
      if (!engine.connectAudio(source.deviceId, 'out_l', destination.deviceId, 'in_l') ||
          !engine.connectAudio(source.deviceId, 'out_r', destination.deviceId, 'in_r')) {
        throw new Error('Could not cable the stereo fixture into the armed audio track.');
      }
      stereo.connect(engine.devices.get(source.deviceId).clipInput);
      engine.setTrackArmed(destination.id, true);
      trackId = destination.id;
    }
    signal.forEach((value, index) => {
      const tone = engine.ctx.createConstantSource();
      tone.offset.value = value;
      tone.connect(stereo, 0, index);
      tone.start();
    });
    return { trackId, startBar, signalStartTime: engine.ctx.currentTime };
  }, { destinationName: armedDestinationName, master, signal });

  let trackId = fixture.trackId;
  if (master) {
    await page.getByRole('button', { name: 'Record settings', exact: true }).click({ timeout: 10_000 });
    // Wait in audio time for the oversampled clipper to settle after applying the test signal.
    await page.waitForFunction((start) => window.recordingSmokeRuntime.engine.ctx.currentTime >= start + 0.05,
      fixture.signalStartTime, { timeout: 10_000 });
    await page.getByRole('dialog', { name: 'Record settings', exact: true })
      .getByRole('button', { name: 'Capture master output', exact: true }).click({ timeout: 10_000 });
    await page.waitForFunction(() => window.recordingSmokeRuntime.engine.recorder.recordingMaster, undefined, { timeout: 10_000 });
    trackId = await page.evaluate((name) => window.recordingSmokeRuntime.engine.tracks.find((track) => track.name === name)?.id,
      masterDestinationName);
  } else {
    await page.getByRole('button', { name: 'Record armed tracks', exact: true }).click({ timeout: 10_000 });
  }
  if (!trackId) throw new Error('The fixture recording did not expose its destination track.');

  const captured = await waitForStorage(page, { projectId, trackId, master }, (state) =>
    state.recording && state.journal?.projectId === projectId && !state.journal.finalizing &&
    state.journal.durableThroughFrame >= state.journal.startFrame + state.verifiedFrames && state.verifiedFrames >= 8_192,
  'The active take did not commit the expected stereo signal');
  return { projectId, sessionId: captured.journal.sessionId, verifiedFrames: captured.verifiedFrames, master, startBar: fixture.startBar };
}

async function verifyRecordingRecovery(page, target, restore) {
  if (typeof target?.projectId !== 'string' || typeof target.sessionId !== 'string' || !Number.isInteger(target.verifiedFrames)) {
    throw new Error('The staged recording recovery target is malformed.');
  }
  await findAudioRuntime(page);
  const recover = page.getByRole('button', { name: 'Recover audio', exact: true });
  if (restore) {
    await recover.waitFor({ state: 'visible', timeout: 10_000 });
    const before = await inspectStorage(page, target);
    if (before.journal?.sessionId !== target.sessionId || before.journal.finalizing || before.recoveredCount !== 0) {
      throw new Error(`The interrupted take did not reach the app's recovery UI: ${JSON.stringify(before)}`);
    }
    await recover.click({ timeout: 10_000 });
  }
  const audio = await waitForStorage(page, target, (state) =>
    !state.journal && state.projectId === target.projectId && state.lastProjectId === target.projectId &&
    state.recoveredCount === 1 && state.clipCount === 1 && state.hasSavedAsset &&
    state.frames >= target.verifiedFrames && state.hasExpectedSignal &&
    state.startBar === target.startBar && state.muted === target.master,
  'The recovered project did not retain the expected audio');
  await page.waitForFunction(({ name, assetId, frames, mute, startBar }) => {
    const { engine, audioStore } = window.recordingSmokeRuntime;
    return engine.tracks.some((track) => track.kind === 'audio' && track.name === name && !!track.mute === mute &&
      track.arrangementClips?.some((clip) => clip.kind === 'audio' && clip.audioId === assetId && clip.startBar === startBar)) &&
      audioStore.get(assetId)?.buffer.length === frames;
  }, {
    name: `Recovered — ${target.master ? masterDestinationName : armedDestinationName}`,
    assetId: audio.assetId, frames: audio.frames, mute: target.master, startBar: target.startBar,
  }, { timeout: 10_000 });
  await recover.waitFor({ state: 'hidden', timeout: 10_000 });
  return audio;
}

module.exports = { prepareRecordingCrash, verifyRecordingRecovery };
