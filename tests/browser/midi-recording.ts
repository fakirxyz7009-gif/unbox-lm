import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;

type FakePort = EventTarget & {
  id: string;
  name: string;
  state: 'connected';
  connection: 'open';
};

async function run(): Promise<void> {
  resultNode.textContent = 'Preparing simulated Impulse MIDI input…';
  const port = Object.assign(new EventTarget(), {
    id: 'simulated-impulse-25',
    name: 'Novation Impulse 25 (simulated)',
    state: 'connected' as const,
    connection: 'open' as const,
  }) as FakePort;
  const access = {
    inputs: new Map<string, MIDIInput>([[port.id, port as unknown as MIDIInput]]),
    outputs: new Map<string, MIDIOutput>(),
    onstatechange: null,
  } as unknown as MIDIAccess;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'requestMIDIAccess');
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: async (): Promise<MIDIAccess> => access,
  });

  const device = audioEngine.createDevice('subtractor', 'MIDI Record Integration Probe');
  const track = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id);
  if (!track) throw new Error('Creating the probe instrument did not create a sequencer track');
  resultNode.textContent = 'Instrument and recording track ready…';

  let position16 = 0;
  const originalStartTransport = audioEngine.startTransport.bind(audioEngine);
  const originalGetPlayheadPosition = audioEngine.getPlayheadPosition.bind(audioEngine);
  const originalPositionAtTime = audioEngine.positionAtTime.bind(audioEngine);
  const originalTimeOfSongPosition = audioEngine.timeOfSongPosition.bind(audioEngine);
  const originalSeekToSongPosition = audioEngine.seekToSongPosition.bind(audioEngine);
  audioEngine.startTransport = async () => {
    audioEngine.isPlaying = true;
  };
  audioEngine.getPlayheadPosition = () => position16;
  audioEngine.positionAtTime = () => position16;
  audioEngine.timeOfSongPosition = () => audioEngine.ctx.currentTime;
  audioEngine.seekToSongPosition = (position) => {
    position16 = position;
    audioEngine.songPosition = position;
  };

  try {
    audioEngine.midiTargetDeviceId = device.id;
    audioEngine.setTrackArmed(track.id, true);
    audioEngine.recorder.settings.countInBars = 0;
    resultNode.textContent = 'Opening MIDI input…';
    const midiReady = await audioEngine.enableMidiInput();
    if (!midiReady) throw new Error('The MIDI input adapter did not become ready');
    if (!audioEngine.midi.ports.some((candidate) => candidate.id === port.id)) {
      throw new Error('The simulated controller was not bound as a MIDI input');
    }
    if (!(await audioEngine.recorder.start())) {
      throw new Error(`The armed MIDI recording did not start: ${audioEngine.recorder.message ?? 'unknown reason'}`);
    }
    resultNode.textContent = 'Recording first MIDI take…';

    position16 = 1;
    port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x91, 64, 96]) }));
    if (!audioEngine.midi.held.has(64)) throw new Error('MIDI note-on did not reach the live input state');

    position16 = 3;
    port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x81, 64, 0]) }));
    if (audioEngine.midi.held.has(64)) throw new Error('MIDI note-off did not clear the live input state');

    position16 = 4;
    await audioEngine.recorder.stop();
    const clip = track.arrangementClips?.find((candidate) => candidate.kind === 'notes');
    const note = clip?.kind === 'notes' ? clip.notes?.[0] : undefined;
    if (!note || note.note !== 64 || Math.abs(note.velocity - 96 / 127) > 1e-6 || note.length !== 2) {
      throw new Error(`MIDI did not produce the expected piano-roll note: ${JSON.stringify(note ?? null)}`);
    }

    // Recording MIDI must still work when the instrument is bypassed; bypass only silences audio.
    device.isBypassed = true;
    position16 = 17;
    if (!(await audioEngine.recorder.start())) {
      throw new Error(`The bypassed-instrument MIDI recording did not start: ${audioEngine.recorder.message ?? 'unknown reason'}`);
    }
    resultNode.textContent = 'Recording bypassed-instrument MIDI take…';
    position16 = 18;
    port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x90, 67, 100]) }));
    position16 = 20;
    port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x80, 67, 0]) }));
    position16 = 21;
    await audioEngine.recorder.stop();
    const bypassedNote = track.arrangementClips
      ?.filter((candidate) => candidate.kind === 'notes')
      .flatMap((candidate) => candidate.kind === 'notes' ? candidate.notes ?? [] : [])
      .find((candidate) => candidate.note === 67);
    if (!bypassedNote || bypassedNote.length !== 2) {
      throw new Error(`MIDI recording stopped with the instrument bypassed: ${JSON.stringify(bypassedNote ?? null)}`);
    }

    await projectManager.save();
    const projectId = projectManager.currentId;
    if (!projectId || projectManager.dirty) throw new Error('The MIDI takes did not finish saving to IndexedDB');
    audioEngine.newProject(true);
    if (!(await projectManager.open(projectId))) throw new Error('The saved MIDI recording project did not reopen');
    const reopenedDevice = [...audioEngine.devices.values()].find((candidate) => candidate.type === 'subtractor' && candidate.name === 'MIDI Record Integration Probe');
    const reopenedTrack = reopenedDevice && audioEngine.tracks.find((candidate) => candidate.deviceId === reopenedDevice.id);
    const reopenedNotes = reopenedTrack?.arrangementClips
      ?.filter((candidate) => candidate.kind === 'notes')
      .flatMap((candidate) => candidate.kind === 'notes' ? candidate.notes ?? [] : []) ?? [];
    const normalNote = reopenedNotes.find((candidate) => candidate.note === 64);
    const bypassedReopenedNote = reopenedNotes.find((candidate) => candidate.note === 67);
    if (!normalNote || Math.abs(normalNote.velocity - 96 / 127) > 1e-6 || normalNote.length !== 2) {
      throw new Error(`The normal MIDI take did not survive IndexedDB reopen: ${JSON.stringify(normalNote ?? null)}`);
    }
    if (!bypassedReopenedNote || Math.abs(bypassedReopenedNote.velocity - 100 / 127) > 1e-6 || bypassedReopenedNote.length !== 2) {
      throw new Error(`The bypassed-instrument MIDI take did not survive IndexedDB reopen: ${JSON.stringify(bypassedReopenedNote ?? null)}`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = 'PASS - simulated MIDI recorded notes with normal and bypassed audio; both survived IndexedDB save/reopen';
  } finally {
    if (audioEngine.recorder.state !== 'idle') await audioEngine.recorder.stop();
    audioEngine.isPlaying = false;
    audioEngine.isRecording = false;
    audioEngine.midiTargetDeviceId = null;
    audioEngine.startTransport = originalStartTransport;
    audioEngine.getPlayheadPosition = originalGetPlayheadPosition;
    audioEngine.positionAtTime = originalPositionAtTime;
    audioEngine.timeOfSongPosition = originalTimeOfSongPosition;
    audioEngine.seekToSongPosition = originalSeekToSongPosition;
    if (navigatorDescriptor) Object.defineProperty(navigator, 'requestMIDIAccess', navigatorDescriptor);
    else Reflect.deleteProperty(navigator, 'requestMIDIAccess');
    audioEngine.removeDevice(device.id);
  }
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
