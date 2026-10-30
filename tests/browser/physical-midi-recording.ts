import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { waitForAudioTime } from '../../src/audio/audioClockAlarm.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result');
const connect = document.querySelector<HTMLButtonElement>('#connect');
if (!result || !connect) throw new Error('Missing physical MIDI probe controls');
const resultNode: HTMLPreElement = result;
const connectButton: HTMLButtonElement = connect;
const IMPULSE_NAME = /novation|impulse/i;

function stage(name: string): void {
  resultNode.textContent = `Setup: ${name}`;
  console.info(`PHYSICAL_MIDI_STAGE ${name}`);
}

function withTimeout<T>(name: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${name} did not finish within ${timeoutMs / 1000} seconds.`)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isNoteOn(data: Uint8Array): boolean {
  return data.length >= 3 && (data[0] & 0xf0) === 0x90 && data[2] > 0;
}

function isNoteOff(data: Uint8Array): boolean {
  return data.length >= 2 && ((data[0] & 0xf0) === 0x80 || ((data[0] & 0xf0) === 0x90 && data[2] === 0));
}

async function run(): Promise<void> {
  connectButton.disabled = true;
  resultNode.dataset.status = 'running';
  resultNode.textContent = 'Requesting local browser MIDI access…';
  let deviceId: string | null = null;
  let unsubscribe = (): void => undefined;
  let sawNoteOn = false;
  let sawNoteOff = false;
  let note = -1;
  let velocity = 0;
  let channel = -1;

  try {
    const midiApiAvailable = typeof navigator.requestMIDIAccess === 'function';
    const midiAccessRequest = audioEngine.enableMidiInput();
    stage('resume audio context');
    await withTimeout('AudioContext resume', audioEngine.resumeContext(), 10_000);
    stage('create recorded piano');
    const device = audioEngine.createDevice('rec_meta_piano', 'Impulse 25 Recorded Piano Probe');
    deviceId = device.id;
    stage('load recorded piano samples');
    if (device.ready) await withTimeout('Recorded piano sample load', device.ready(), 45_000);
    const track = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id);
    if (!track) throw new Error('The recorded piano did not create a sequencer track');
    audioEngine.midiTargetDeviceId = device.id;
    audioEngine.playbackMode = 'song_arrangement';
    audioEngine.setTrackArmed(track.id, true);
    audioEngine.recorder.settings.countInBars = 0;
    audioEngine.recorder.settings.preRollBars = 0;

    console.info(`PHYSICAL_MIDI_API available=${midiApiAvailable} origin=${location.origin}`);
    stage('confirm MIDI access');
    if (!(await withTimeout('Web MIDI access request', midiAccessRequest, 60_000))) {
      throw new Error(`Browser MIDI access was refused or unavailable (status=${audioEngine.midi.status}, requestMIDIAccess=${midiApiAvailable}, cause=${resultNode.dataset.midiError ?? 'not captured'}, context=${resultNode.dataset.midiContext ?? 'not captured'})`);
    }
    const portSummary = audioEngine.midi.ports.map((port) => `${port.name}${port.error ? ` (unavailable: ${port.error})` : ''}`).join(', ') || '(none)';
    console.info(`PHYSICAL_MIDI_PORTS ${portSummary}`);
    const inputs = audioEngine.midi.ports.filter((port) => IMPULSE_NAME.test(port.name));
    if (!inputs.length) {
      throw new Error(`No Novation Impulse input found. Browser inputs: ${audioEngine.midi.ports.map((port) => port.name).join(', ') || '(none)'}`);
    }
    const input = inputs.find((port) => !port.error);
    if (!input) throw new Error(`Impulse input is busy: ${inputs.map((port) => port.error).join(', ')}`);

    const receivedNote = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Timed out waiting for one physical Impulse key press and release.')), 60_000);
      unsubscribe = audioEngine.midi.monitor((data, portName) => {
        if (portName !== input.name) return;
        if (isNoteOn(data) && !sawNoteOn) {
          sawNoteOn = true;
          note = data[1] & 0x7f;
          velocity = data[2] & 0x7f;
          channel = data[0] & 0x0f;
          resultNode.textContent = `Received Impulse note-on · MIDI ${note} · velocity ${velocity}/127 · channel ${channel + 1}. Release the key.`;
          return;
        }
        if (sawNoteOn && !sawNoteOff && isNoteOff(data) && (data[1] & 0x7f) === note && (data[0] & 0x0f) === channel) {
          sawNoteOff = true;
          window.clearTimeout(timer);
          resolve();
        }
      });

      if (audioEngine.midi.ports.some((port) => port.id === input.id && port.error)) {
        window.clearTimeout(timer);
        reject(new Error('The Impulse input became unavailable before recording started.'));
      }
    });

    stage('start MIDI recorder');
    if (!(await withTimeout('Recorder start', audioEngine.recorder.start(), 15_000))) {
      throw new Error(`Could not start the armed piano recording: ${audioEngine.recorder.message ?? 'unknown reason'}`);
    }
    resultNode.dataset.status = 'waiting';
    resultNode.textContent = `Ready on ${input.name}. Press and release one key on the Impulse 25 within 60 seconds.`;
    console.info(`PHYSICAL_MIDI_READY ${input.name}`);
    await receivedNote;
    // Let the recorder cross a short, audio-clock-defined duration so a very
    // fast physical key release cannot collapse into a zero-length piano-roll
    // note. This is not a wall-clock delay.
    await waitForAudioTime(audioEngine.ctx, audioEngine.ctx.currentTime + 0.14);
    await audioEngine.recorder.stop();
    await audioEngine.stopTransport();

    const clip = track.arrangementClips?.find((candidate) => candidate.kind === 'notes');
    const recorded = clip?.kind === 'notes'
      ? clip.notes?.find((candidate) => candidate.note === note && Math.abs(candidate.velocity - velocity / 127) < 1e-6)
      : undefined;
    if (!sawNoteOn || !sawNoteOff) throw new Error('The physical note-on/off pair was incomplete.');
    if (!recorded || !(recorded.length > 0)) {
      throw new Error(`Hardware MIDI reached the DAW but did not produce the expected piano-roll note: ${JSON.stringify({ note, velocity, channel, armed: track.armed, midiTarget: audioEngine.midiTargetDeviceId, clips: track.arrangementClips ?? [] })}`);
    }

    await projectManager.save();
    const savedProjectId = projectManager.currentId;
    if (!savedProjectId) throw new Error('The physical MIDI take has no saved project id');
    if (projectManager.dirty) throw new Error('The physical MIDI take remained dirty after save');
    audioEngine.newProject(true);
    if (!(await projectManager.open(savedProjectId))) throw new Error('ProjectManager could not reopen the physical MIDI take');
    const reopenedDevice = [...audioEngine.devices.values()].find((candidate) => candidate.type === 'rec_meta_piano' && candidate.name === 'Impulse 25 Recorded Piano Probe');
    const reopenedTrack = reopenedDevice && audioEngine.tracks.find((candidate) => candidate.deviceId === reopenedDevice.id);
    const reopenedClip = reopenedTrack?.arrangementClips?.find((candidate) => candidate.kind === 'notes');
    const reopenedNote = reopenedClip?.kind === 'notes'
      ? reopenedClip.notes?.find((candidate) => candidate.note === note && Math.abs(candidate.velocity - velocity / 127) < 1e-6)
      : undefined;
    if (!reopenedNote || !(reopenedNote.length > 0)) {
      throw new Error(`Physical piano-roll note did not survive IndexedDB reopen: ${JSON.stringify(reopenedNote ?? null)}`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = `PASS · ${input.name} recorded MIDI ${note}, velocity ${velocity}/127, channel ${channel + 1}, length ${reopenedNote.length.toFixed(3)} sixteenths; IndexedDB save/reopen preserved the physical piano-roll note.`;
  } finally {
    unsubscribe();
    if (audioEngine.recorder.state !== 'idle') await audioEngine.recorder.stop();
    if (audioEngine.isPlaying) await audioEngine.stopTransport();
    audioEngine.midiTargetDeviceId = null;
    if (deviceId) audioEngine.removeDevice(deviceId);
    connectButton.disabled = false;
  }
}

connect.addEventListener('click', () => {
  void run().catch((error: unknown) => {
    resultNode.dataset.status = 'failed';
    resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
  });
});
