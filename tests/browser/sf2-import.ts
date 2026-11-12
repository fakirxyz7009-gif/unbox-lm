import React from 'react';
import { createRoot } from 'react-dom/client';
import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { audioStore } from '../../src/audio/clips/audioStore.ts';
import { deviceSample, installSampleVoice } from '../../src/audio/deviceSamples.ts';
import { sf2DefaultVelocityAmplitude } from '../../src/audio/soundfont/sf2.ts';
import { projectAudioIds } from '../../shared/project/audioAssets.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';
import { readZip, writeZip, type ZipInput } from '../../src/project/zip.ts';
import { PatchBrowser } from '../../src/workstation/PatchBrowser.tsx';

interface ProbeState {
  chosenId: string;
  exercise: () => Promise<{ deviceName: string; sampleZoneCount: number; sampleLoaded: boolean; sampleWasPlayed: boolean; loop: boolean; loopUntilRelease: boolean; scaleTuning: number; playbackRate: number; expectedPlaybackRate: number; filterCutoffHz: number; expectedFilterCutoffHz: number; offlineFilterCutoffHz: number; velocityPeakGain: number; expectedVelocityPeakGain: number; offlineVelocityPeakGain: number; exclusiveClass: number; exclusiveChokeFade: number; exclusiveTailChokeFade: number; offlineChokeFade: number; offlineTailChokeFade: number; releaseTailOffset: number; sustainRms: number; releaseRms: number; offlineSustainRms: number; offlineReleaseRms: number; offlineTailRms: number; offlineEarlyRms: number; offlineLateRms: number; lowKeyEnvelopeRms: number; highKeyEnvelopeRms: number; archiveSampleCount: number; roundTripZoneCount: number; roundTripVelocityAttenuation: boolean; roundTripRms: number }>;
}

declare global {
  interface Window { __sf2Probe?: ProbeState; }
}

const result = document.querySelector<HTMLPreElement>('#result');
const mount = document.querySelector<HTMLDivElement>('#mount');
if (!result || !mount) throw new Error('SF2 probe page is missing its mount or result element');

const resultNode = result;
const state: ProbeState = {
  chosenId: '',
  async exercise() {
    const device = audioEngine.devices.get(state.chosenId);
    const assigned = deviceSample(state.chosenId)?.multiSample ?? [];
    if (!device || assigned.length !== 1) throw new Error('LOAD did not create one device with the imported SF2 sample zone');
    const asset = audioStore.get(assigned[0].audioId);
    if (!asset) throw new Error('The selected SF2 sample was not stored as an audio asset');
    if (asset.buffer.numberOfChannels !== 2) throw new Error(`The linked stereo SF2 pair imported as ${asset.buffer.numberOfChannels} channel(s)`);
    if (asset.buffer.getChannelData(0)[80] === asset.buffer.getChannelData(1)[80]) throw new Error('The linked SF2 left and right sample data were not kept separate');
    await audioEngine.ctx.resume();

    const sources: AudioBufferSourceNode[] = [];
    const starts = new Map<AudioBufferSourceNode, { time: number; offset: number }>();
    const stopTimes = new Map<AudioBufferSourceNode, number[]>();
    const createSource = audioEngine.ctx.createBufferSource.bind(audioEngine.ctx);
    const liveFilterCutoffs: number[] = [];
    const liveGainTargets: number[] = [];
    const createGain = audioEngine.ctx.createGain.bind(audioEngine.ctx);
    audioEngine.ctx.createGain = () => {
      const gain = createGain();
      const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
      gain.gain.linearRampToValueAtTime = (value: number, at: number): AudioParam => {
        liveGainTargets.push(value);
        return ramp(value, at);
      };
      return gain;
    };
    const createLiveFilter = audioEngine.ctx.createBiquadFilter.bind(audioEngine.ctx);
    audioEngine.ctx.createBiquadFilter = () => {
      const filter = createLiveFilter();
      const setFrequency = filter.frequency.setValueAtTime.bind(filter.frequency);
      filter.frequency.setValueAtTime = (value: number, at: number): AudioParam => {
        liveFilterCutoffs.push(value);
        return setFrequency(value, at);
      };
      return filter;
    };
    audioEngine.ctx.createBufferSource = () => {
      const source = createSource();
      sources.push(source);
      const start = source.start.bind(source);
      source.start = (when = 0, offset = 0, duration?: number): void => {
        starts.set(source, { time: when, offset });
        if (duration === undefined) start(when, offset);
        else start(when, offset, duration);
      };
      const stop = source.stop.bind(source);
      source.stop = (when = 0): void => {
        const times = stopTimes.get(source) ?? [];
        times.push(when);
        stopTimes.set(source, times);
        stop(when);
      };
      return source;
    };
    try {
      if (assigned[0].scaleTuning !== 50) throw new Error(`SF2 scale tuning was not imported (${assigned[0].scaleTuning})`);
      if (!assigned[0].sf2DefaultVelocityAttenuation) throw new Error('SF2 default velocity attenuation was not assigned');
      const liveGainStart = liveGainTargets.length;
      device.noteOn(60, 0.7, audioEngine.ctx.currentTime + 0.02);
      const velocityPeakGain = liveGainTargets[liveGainStart] ?? NaN;
      const expectedVelocityPeakGain = assigned[0].level * sf2DefaultVelocityAmplitude(0.7);
      if (!Number.isFinite(velocityPeakGain) || Math.abs(velocityPeakGain - expectedVelocityPeakGain) > 1e-6) {
        throw new Error(`SF2 velocity attenuation peak was ${velocityPeakGain}; expected ${expectedVelocityPeakGain}`);
      }
      await pause(100);
      const playedSource = sources.find((source) => source.buffer === asset.buffer);
      const sustainRms = masterRms();
      device.noteOff(60, audioEngine.ctx.currentTime);
      await pause(400);
      const releaseRms = masterRms();
      if (!playedSource) throw new Error('The device did not play its selected SF2 sample buffer');
      const releaseTail = sources.find((source) => source !== playedSource && source.buffer === asset.buffer);
      const releaseTailOffset = releaseTail ? starts.get(releaseTail)?.offset ?? -1 : -1;
      const playbackRate = playedSource?.playbackRate.value ?? NaN;
      const expectedPlaybackRate = Math.pow(2, (((60 - assigned[0].root) * 0.5) + assigned[0].tune / 100) / 12);
      if (!Number.isFinite(playbackRate) || Math.abs(playbackRate - expectedPlaybackRate) > 1e-6) {
        throw new Error(`SF2 scale tuning playback rate was ${playbackRate}; expected ${expectedPlaybackRate}`);
      }
      const velocity127 = Math.max(1, Math.min(127, Math.round(0.7 * 127)));
      const expectedFilterCutoffHz = Math.max(20, Math.min(audioEngine.ctx.sampleRate * 0.45,
        8.176 * 2 **(((assigned[0].filterCutoffCents ?? 13500) - 2400 * (1 - velocity127 / 128)) / 1200)));
      const filterCutoffHz = liveFilterCutoffs[0] ?? NaN;
      if (!Number.isFinite(filterCutoffHz) || Math.abs(filterCutoffHz - expectedFilterCutoffHz) > 0.01) {
        throw new Error(`SF2 velocity-to-filter cutoff was ${filterCutoffHz}; expected ${expectedFilterCutoffHz}`);
      }
      if (!assigned[0].loop || Math.abs(playedSource.loopStart - (128 / 44100)) > 1e-5 || Math.abs(playedSource.loopEnd - (512 / 44100)) > 1e-5) {
        throw new Error(`The selected sample loop was not preserved: [${playedSource.loopStart}, ${playedSource.loopEnd}]`);
      }
      if (!assigned[0].loopUntilRelease || !releaseTail || releaseTailOffset < assigned[0].loopStart! || releaseTailOffset >= asset.buffer.duration) {
        throw new Error(`SF2 loop-release did not continue from the sample into its tail (flag ${assigned[0].loopUntilRelease}, sources ${sources.length}, offset ${releaseTailOffset})`);
      }
      if (assigned[0].exclusiveClass !== 4) throw new Error(`The SF2 exclusive class was not imported (class ${assigned[0].exclusiveClass})`);
      if (!(sustainRms > 0.002)) throw new Error(`Live sample output was too quiet (RMS ${sustainRms})`);
      if (!(releaseRms < sustainRms * 0.2)) throw new Error(`SF2 voice did not release: sustain RMS ${sustainRms}, release RMS ${releaseRms}`);

      device.noteOn(60, 0.7, audioEngine.ctx.currentTime + 0.02);
      await pause(80);
      const classVoice = [...sources].reverse().find((source) => source.buffer === asset.buffer && source.loop);
      if (!classVoice) throw new Error('The SF2 looped voice for exclusive-class testing did not start');
      const sourceCountBeforeChoke = sources.length;
      const chokeAt = audioEngine.ctx.currentTime + 0.02;
      device.noteOn(61, 0.7, chokeAt);
      await pause(80);
      const chokeStops = stopTimes.get(classVoice) ?? [];
      const chokeStopTime = chokeStops[chokeStops.length - 1];
      const exclusiveChokeFade = chokeStopTime - chokeAt;
      if (sources.length !== sourceCountBeforeChoke + 1 || !Number.isFinite(exclusiveChokeFade) || exclusiveChokeFade < 0.035 || exclusiveChokeFade > 0.05) {
        throw new Error(`SF2 exclusive class did not rapidly choke its prior looped voice (new sources ${sources.length - sourceCountBeforeChoke}, fade ${exclusiveChokeFade})`);
      }
      const tailReleaseAt = audioEngine.ctx.currentTime + 0.04;
      const sourceCountBeforeTailRelease = sources.length;
      device.noteOff(61, tailReleaseAt);
      if (sources.length !== sourceCountBeforeTailRelease + 1) throw new Error('Key-up did not create the expected SF2 release-tail source');
      const releasedTail = sources[sources.length - 1];
      if (releasedTail.loop || Math.abs((starts.get(releasedTail)?.time ?? -1) - tailReleaseAt) > 1e-6) {
        throw new Error('The SF2 key-up source was not the scheduled one-shot tail');
      }
      const tailChokeAt = tailReleaseAt + 0.02;
      device.noteOn(62, 0.7, tailChokeAt);
      await pause(80);
      const tailStops = stopTimes.get(releasedTail) ?? [];
      const tailChokeStopTime = tailStops[tailStops.length - 1];
      const exclusiveTailChokeFade = tailChokeStopTime - tailChokeAt;
      if (!Number.isFinite(exclusiveTailChokeFade) || Math.abs(exclusiveTailChokeFade - 0.04) > 0.005) {
        throw new Error(`A released SF2 loop tail escaped exclusive-class choking (fade ${exclusiveTailChokeFade})`);
      }
      device.noteOff(62, audioEngine.ctx.currentTime);

      const offlineCtx = new OfflineAudioContext(2, 48_000, 48_000);
      const offlineStarts: { time: number; offset: number; bufferDuration: number }[] = [];
      const createOfflineSource = offlineCtx.createBufferSource.bind(offlineCtx);
      const offlineFilterCutoffs: number[] = [];
      const createOfflineFilter = offlineCtx.createBiquadFilter.bind(offlineCtx);
      offlineCtx.createBiquadFilter = () => {
        const filter = createOfflineFilter();
        const setFrequency = filter.frequency.setValueAtTime.bind(filter.frequency);
        filter.frequency.setValueAtTime = (value: number, at: number): AudioParam => {
          offlineFilterCutoffs.push(value);
          return setFrequency(value, at);
        };
        return filter;
      };
      offlineCtx.createBufferSource = () => {
        const source = createOfflineSource();
        const start = source.start.bind(source);
        source.start = (when = 0, offset = 0, duration?: number): void => {
          offlineStarts.push({ time: when, offset, bufferDuration: source.buffer?.duration ?? 0 });
          if (duration === undefined) start(when, offset);
          else start(when, offset, duration);
        };
        return source;
      };
      const offlineGainTargets: number[] = [];
      const createOfflineGain = offlineCtx.createGain.bind(offlineCtx);
      offlineCtx.createGain = () => {
        const gain = createOfflineGain();
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value: number, at: number): AudioParam => {
          offlineGainTargets.push(value);
          return ramp(value, at);
        };
        return gain;
      };
      const offlineDevice = audioEngine.instantiateOffline(offlineCtx, device);
      installSampleVoice(offlineDevice);
      const merger = offlineCtx.createChannelMerger(2);
      offlineDevice.audioOutputs.get('out_l')?.connect(merger, 0, 0);
      offlineDevice.audioOutputs.get('out_r')?.connect(merger, 0, 1);
      merger.connect(offlineCtx.destination);
      const offlineGainStart = offlineGainTargets.length;
      offlineDevice.noteOn(60, 0.7, 0.05);
      const offlineVelocityPeakGain = offlineGainTargets[offlineGainStart] ?? NaN;
      if (!Number.isFinite(offlineVelocityPeakGain) || Math.abs(offlineVelocityPeakGain - expectedVelocityPeakGain) > 1e-6) {
        throw new Error(`Offline SF2 velocity attenuation peak was ${offlineVelocityPeakGain}; expected ${expectedVelocityPeakGain}`);
      }
      const offlineFilterCutoffHz = offlineFilterCutoffs[0] ?? NaN;
      if (!Number.isFinite(offlineFilterCutoffHz) || Math.abs(offlineFilterCutoffHz - expectedFilterCutoffHz) > 0.01) {
        throw new Error(`Offline SF2 velocity-to-filter cutoff was ${offlineFilterCutoffHz}; expected ${expectedFilterCutoffHz}`);
      }
      offlineDevice.noteOff(60, 0.45);
      const rendered = await offlineCtx.startRendering();
      const offlineSustainRms = bufferRms(rendered, 0.1, 0.35);
      const offlineReleaseRms = bufferRms(rendered, 0.8, 0.95);
      const offlineTailRms = bufferRms(rendered, 0.46, 0.52);
      const offlineEarlyRms = bufferRms(rendered, 0.1, 0.15);
      const offlineLateRms = bufferRms(rendered, 0.32, 0.37);
      offlineDevice.dispose();
      if (!(offlineSustainRms > 0.002)) throw new Error(`Offline SF2 render was too quiet (RMS ${offlineSustainRms})`);
      if (!(offlineReleaseRms < offlineSustainRms * 0.2)) throw new Error(`Offline SF2 render did not release: sustain RMS ${offlineSustainRms}, release RMS ${offlineReleaseRms}`);
      if (!(offlineTailRms > 0.002)) throw new Error(`Offline SF2 mode-3 tail was not audible after key-up (RMS ${offlineTailRms}; starts ${JSON.stringify(offlineStarts)})`);
      if (!(offlineLateRms < offlineEarlyRms * 0.9)) throw new Error(`SF2 decay/sustain generators did not shape audio: early RMS ${offlineEarlyRms}, late RMS ${offlineLateRms}`);

      const offlineChokeCtx = new OfflineAudioContext(2, 24_000, 48_000);
      const offlineChokeSources: AudioBufferSourceNode[] = [];
      const offlineChokeStarts = new Map<AudioBufferSourceNode, number>();
      const offlineChokeStops = new Map<AudioBufferSourceNode, number[]>();
      const createChokeSource = offlineChokeCtx.createBufferSource.bind(offlineChokeCtx);
      offlineChokeCtx.createBufferSource = () => {
        const source = createChokeSource();
        offlineChokeSources.push(source);
        const start = source.start.bind(source);
        source.start = (when = 0, offset = 0, duration?: number): void => {
          offlineChokeStarts.set(source, when);
          if (duration === undefined) start(when, offset);
          else start(when, offset, duration);
        };
        const stop = source.stop.bind(source);
        source.stop = (when = 0): void => {
          const times = offlineChokeStops.get(source) ?? [];
          times.push(when);
          offlineChokeStops.set(source, times);
          stop(when);
        };
        return source;
      };
      const offlineChokeDevice = audioEngine.instantiateOffline(offlineChokeCtx, device);
      installSampleVoice(offlineChokeDevice);
      offlineChokeDevice.audioOutputs.get('out_l')?.connect(offlineChokeCtx.destination);
      offlineChokeDevice.noteOn(60, 0.7, 0.05);
      offlineChokeDevice.noteOn(61, 0.7, 0.25);
      const offlineChokedVoice = offlineChokeSources.find((source) => source.buffer === asset.buffer && source.loop);
      const offlineChokedStops = offlineChokedVoice ? offlineChokeStops.get(offlineChokedVoice) ?? [] : [];
      const offlineChokeStopTime = offlineChokedStops[offlineChokedStops.length - 1];
      const offlineChokeFade = offlineChokeStopTime - 0.25;
      offlineChokeDevice.noteOff(61, 0.4);
      const offlineReleasedTail = offlineChokeSources.find((source) => !source.loop && Math.abs((offlineChokeStarts.get(source) ?? -1) - 0.4) < 1e-6);
      offlineChokeDevice.noteOn(62, 0.7, 0.42);
      const offlineTailStops = offlineReleasedTail ? offlineChokeStops.get(offlineReleasedTail) ?? [] : [];
      const offlineTailChokeStopTime = offlineTailStops[offlineTailStops.length - 1];
      const offlineTailChokeFade = offlineTailChokeStopTime - 0.42;
      offlineChokeDevice.noteOff(62, 0.46);
      const offlineChokeBuffer = await offlineChokeCtx.startRendering();
      offlineChokeDevice.dispose();
      if (!offlineChokedVoice || Math.abs((offlineChokeStarts.get(offlineChokedVoice) ?? -1) - 0.05) > 1e-6 ||
        !Number.isFinite(offlineChokeFade) || Math.abs(offlineChokeFade - 0.04) > 0.005 || !offlineReleasedTail ||
        !Number.isFinite(offlineTailChokeFade) || Math.abs(offlineTailChokeFade - 0.04) > 0.005 || !(bufferRms(offlineChokeBuffer, 0.1, 0.2) > 0.002)) {
        throw new Error(`Offline SF2 exclusive-class choke failed (held ${offlineChokeFade}, tail ${offlineTailChokeFade}, starts ${JSON.stringify([...offlineChokeStarts.values()])})`);
      }

      const renderKeyTrackingWindow = async (note: number): Promise<number> => {
        const context = new OfflineAudioContext(2, 24_000, 48_000);
        const clone = audioEngine.instantiateOffline(context, device);
        installSampleVoice(clone);
        clone.audioOutputs.get('out_l')?.connect(context.destination);
        clone.noteOn(note, 0.7, 0.05);
        clone.noteOff(note, 0.4);
        const output = await context.startRendering();
        const rms = bufferRms(output, 0.15, 0.2);
        clone.dispose();
        return rms;
      };
      const lowKeyEnvelopeRms = await renderKeyTrackingWindow(48);
      const highKeyEnvelopeRms = await renderKeyTrackingWindow(72);
      if (!(highKeyEnvelopeRms > lowKeyEnvelopeRms * 1.1)) {
        throw new Error(`SF2 key-to-decay tracking did not respond to pitch: MIDI 48 RMS ${lowKeyEnvelopeRms}, MIDI 72 RMS ${highKeyEnvelopeRms}`);
      }

      if (!(await projectManager.saveAs('SF2 Archive Round Trip'))) throw new Error('Could not save the imported SF2 project');
      const projectId = projectManager.currentId;
      if (!projectId) throw new Error('SF2 project did not receive an IndexedDB id');
      const archive = await projectManager.exportArchive(projectId);
      if (!archive) throw new Error('ProjectManager did not export the SF2 project archive');
      const entries = await readZip(archive.blob);
      const projectData = entries.get('project.json');
      const infoData = entries.get('info.json');
      if (!projectData || !infoData) throw new Error('The SF2 archive is missing project metadata');
      const savedJson = new TextDecoder().decode(projectData);
      const savedIds = projectAudioIds(savedJson);
      if (assigned.some((zone) => !savedIds.includes(zone.audioId) || !entries.has(`audio/${zone.audioId}.wav`))) {
        throw new Error('The .unbox archive omitted an imported SF2 sample');
      }

      // Remap IDs to model opening this archive when its source assets are not in memory yet.
      const remappedIds = new Map(assigned.map((zone, index) => [zone.audioId, `sf2-archive-copy-${index}-${Date.now()}`]));
      const remappedProject = JSON.parse(savedJson) as {
        sections?: { deviceSamples?: Record<string, { multiSample?: { audioId?: string }[] }> };
      };
      for (const state of Object.values(remappedProject.sections?.deviceSamples ?? {})) {
        for (const zone of state.multiSample ?? []) {
          if (zone.audioId) zone.audioId = remappedIds.get(zone.audioId) ?? zone.audioId;
        }
      }
      const info = JSON.parse(new TextDecoder().decode(infoData)) as { audio?: { id: string; name: string }[] };
      info.audio = info.audio?.map((item) => ({ ...item, id: remappedIds.get(item.id) ?? item.id }));
      const copiedEntries: ZipInput[] = [];
      for (const [name, data] of entries) {
        if (name === 'project.json') copiedEntries.push({ name, data: JSON.stringify(remappedProject), compress: true });
        else if (name === 'info.json') copiedEntries.push({ name, data: JSON.stringify(info), compress: true });
        else {
          const match = /^audio\/(.+)\.wav$/.exec(name);
          const newId = match ? remappedIds.get(match[1]) : undefined;
          copiedEntries.push({ name: newId ? `audio/${newId}.wav` : name, data });
        }
      }
      if (!(await projectManager.importArchive(await writeZip(copiedEntries), 'SF2 Archive Copy'))) {
        throw new Error('ProjectManager could not import the remapped SF2 archive');
      }
      const restored = [...audioEngine.devices.values()].find((candidate) => candidate.name === device.name && candidate.type === device.type);
      if (!restored) throw new Error('The SF2 instrument did not survive .unbox import');
      const restoredZones = deviceSample(restored.id)?.multiSample ?? [];
      if (restoredZones.length !== assigned.length || restoredZones.some((zone) => !audioStore.get(zone.audioId) || zone.exclusiveClass !== assigned[0].exclusiveClass || zone.scaleTuning !== assigned[0].scaleTuning || zone.filterCutoffCents !== assigned[0].filterCutoffCents || zone.sf2DefaultVelocityAttenuation !== true)) {
        throw new Error('The imported .unbox project did not restore its SF2 sample assets');
      }
      const importedRecord = (await projectManager.list()).find((record) => record.id === projectManager.currentId);
      if (!importedRecord || restoredZones.some((zone) => !importedRecord.audioIds.includes(zone.audioId))) {
        throw new Error('The reopened SF2 project did not retain sample IDs in its media manifest');
      }
      const roundTripCtx = new OfflineAudioContext(2, 24_000, 48_000);
      const roundTripDevice = audioEngine.instantiateOffline(roundTripCtx, restored);
      installSampleVoice(roundTripDevice);
      roundTripDevice.audioOutputs.get('out_l')?.connect(roundTripCtx.destination);
      roundTripDevice.noteOn(60, 0.7, 0.05);
      roundTripDevice.noteOff(60, 0.4);
      const roundTripBuffer = await roundTripCtx.startRendering();
      const roundTripRms = bufferRms(roundTripBuffer, 0.1, 0.3);
      roundTripDevice.dispose();
      if (!(roundTripRms > 0.002)) throw new Error(`The imported SF2 archive rendered silently (RMS ${roundTripRms})`);
      return {
        deviceName: device.name,
        sampleZoneCount: assigned.length,
        sampleLoaded: !!asset.buffer.length,
        sampleWasPlayed: true,
        loop: assigned[0].loop,
        loopUntilRelease: assigned[0].loopUntilRelease === true,
        scaleTuning: assigned[0].scaleTuning ?? 100,
        playbackRate,
        expectedPlaybackRate,
        filterCutoffHz,
        expectedFilterCutoffHz,
        offlineFilterCutoffHz,
        velocityPeakGain,
        expectedVelocityPeakGain,
        offlineVelocityPeakGain,
        exclusiveClass: assigned[0].exclusiveClass ?? 0,
        exclusiveChokeFade,
        exclusiveTailChokeFade,
        offlineChokeFade,
        offlineTailChokeFade,
        releaseTailOffset,
        sustainRms,
        releaseRms,
        offlineSustainRms,
        offlineReleaseRms,
        offlineTailRms,
        offlineEarlyRms,
        offlineLateRms,
        lowKeyEnvelopeRms,
        highKeyEnvelopeRms,
        archiveSampleCount: assigned.length,
        roundTripZoneCount: restoredZones.length,
        roundTripVelocityAttenuation: restoredZones[0]?.sf2DefaultVelocityAttenuation === true,
        roundTripRms,
      };
    } finally {
      audioEngine.ctx.createBufferSource = createSource;
      audioEngine.ctx.createBiquadFilter = createLiveFilter;
      audioEngine.ctx.createGain = createGain;
    }
  },
};
window.__sf2Probe = state;

createRoot(mount).render(React.createElement(PatchBrowser, {
  track: null,
  partNo: 1,
  onClose: () => undefined,
  onChosen: (id: string) => { state.chosenId = id; },
}));

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function masterRms(): number {
  const levels = audioEngine.masterLevels();
  return Math.sqrt((levels.rmsL * levels.rmsL + levels.rmsR * levels.rmsR) / 2);
}

function bufferRms(buffer: AudioBuffer, startSec: number, endSec: number): number {
  const start = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.floor(endSec * buffer.sampleRate));
  let sum = 0;
  let count = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let frame = start; frame < end; frame++) {
      sum += data[frame] * data[frame];
      count++;
    }
  }
  return Math.sqrt(sum / Math.max(1, count));
}

void pause(0).then(() => {
  resultNode.textContent = 'Ready for the SF2 fixture upload';
  resultNode.dataset.status = 'ready';
}).catch((error: unknown) => {
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.message : String(error)}`;
  resultNode.dataset.status = 'failed';
});
