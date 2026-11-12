import type { audioEngine as AudioEngineInstance } from '../../src/audio/AudioEngine.ts';
import type { ClipNote, SequencerTrack } from '../../src/audio/types.ts';
import type { projectManager as ProjectManagerInstance } from '../../src/project/ProjectManager.ts';

interface ProbeInput extends EventTarget {
  id: string;
  name: string;
  state: MIDIPortDeviceState;
  connection: MIDIPortConnectionState;
  open(): Promise<ProbeInput>;
}

interface WindowWithMidiProbe extends Window {
  __midiRequestCount: number;
}

interface RecorderProbeState {
  midiPending: Map<string, unknown>;
  midiNotes: Map<string, { deviceId: string; notes: ClipNote[] }>;
}

const result = document.querySelector<HTMLPreElement>('#result');
if (!result) throw new Error('Missing result node');
const resultNode: HTMLPreElement = result;
const probeWindow = window as unknown as WindowWithMidiProbe;
const physicalMidi = new URLSearchParams(location.search).get('physical') === '1';
const midiRequestCount = (): number => probeWindow.__midiRequestCount;
let activeEngine: typeof AudioEngineInstance | null = null;
let resolvePendingMidiAccess: ((access: MIDIAccess) => void) | null = null;
const port = new EventTarget() as ProbeInput;
Object.assign(port, {
  id: 'simulated-impulse-ui',
  name: 'Novation Impulse 25 (simulated UI)',
  state: 'connected' as MIDIPortDeviceState,
  connection: 'closed' as MIDIPortConnectionState,
  open: async (): Promise<ProbeInput> => {
    port.connection = 'open';
    return port;
  },
});

const midiAccess = {
  inputs: new Map<string, MIDIInput>([[port.id, port as unknown as MIDIInput]]),
  outputs: new Map<string, MIDIOutput>(),
  onstatechange: null,
} as unknown as MIDIAccess;

function waitFor(predicate: () => boolean, label: string, timeoutMs = 12_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + timeoutMs;
    const poll = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (performance.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${label}.`));
        return;
      }
      window.setTimeout(poll, 25);
    };
    poll();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function recordButton(): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Record armed tracks"]')][0];
  if (!button) throw new Error('The workstation transport Record button was not rendered.');
  return button;
}

function assertProbeStatusOverlay(): void {
  const style = getComputedStyle(resultNode);
  const rect = resultNode.getBoundingClientRect();
  if (style.position !== 'fixed' || style.zIndex !== '2147483647' || style.pointerEvents !== 'none' ||
    style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0 ||
    rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 ||
    rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
    throw new Error('The physical MIDI instructions/result overlay is not visibly layered above the workstation.');
  }
}

async function run(): Promise<void> {
  const originalRequestMidi = Object.getOwnPropertyDescriptor(navigator, 'requestMIDIAccess');
  if (!physicalMidi) {
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: (): Promise<MIDIAccess> => {
        probeWindow.__midiRequestCount++;
        return new Promise<MIDIAccess>((resolve) => { resolvePendingMidiAccess = resolve; });
      },
    });
  }
  probeWindow.__midiRequestCount = 0;

  try {
    resultNode.textContent = 'Starting the workstation…';
    // The workstation loads enough modules to overflow Chrome's default resource timing buffer.
    performance.setResourceTimingBufferSize(10_000);
    const appEntry = '/src/main.tsx';
    await import(/* @vite-ignore */ appEntry);
    await waitFor(() => !!document.querySelector('[data-testid="transport-midi"]'), 'workstation transport');
    assertProbeStatusOverlay();
    const assistantStatus = document.querySelector<HTMLElement>('[data-testid="status-local-ai"]');
    if (!assistantStatus || !/no audio gen/i.test(assistantStatus.textContent ?? '') || !/never creates, renders or replaces audio/i.test(assistantStatus.title)) {
      throw new Error('The visible local-assistant status does not promise its control-only, no-audio-generation policy.');
    }
    const resourceUrl = (suffix: string): string => {
      const url = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => new URL(name).pathname.endsWith(suffix));
      if (!url) throw new Error(`The running app did not load ${suffix}.`);
      return url;
    };
    const engineUrl = resourceUrl('/src/audio/AudioEngine.ts');
    const projectManagerUrl = resourceUrl('/src/project/ProjectManager.ts');
    const [{ audioEngine }, { projectManager }] = await Promise.all([
      import(/* @vite-ignore */ engineUrl) as Promise<{ audioEngine: typeof AudioEngineInstance }>,
      import(/* @vite-ignore */ projectManagerUrl) as Promise<{ projectManager: typeof ProjectManagerInstance }>,
    ]);
    activeEngine = audioEngine;
    await waitFor(() => !!projectManager.currentId, 'initial project setup');
    if (!physicalMidi && midiRequestCount() !== 0) throw new Error('The app requested MIDI permission during startup.');

    const projectName = 'MIDI Workstation UI Probe';
    await projectManager.create('empty', projectName);
    const staleProbeProjects = (await projectManager.list())
      .filter((project) => project.name === projectName && project.id !== projectManager.currentId);
    for (const project of staleProbeProjects) await projectManager.remove(project.id);

    resultNode.textContent = 'Creating the recorded piano part…';
    const device = audioEngine.createDevice('rec_meta_piano', projectName);
    if (device.ready) await device.ready();
    const track = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id);
    if (!track) throw new Error('The recorded piano did not create a workstation part.');
    audioEngine.recorder.settings.countInBars = 0;
    audioEngine.recorder.settings.preRollBars = 0;
    await waitFor(() => [...document.querySelectorAll<HTMLElement>('[data-testid="part-row"]')]
      .some((row) => row.textContent?.includes('MIDI Workstation UI Probe')), 'probe part in workstation');
    const probePartButton = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="part-patch"]')]
      .find((button) => button.textContent?.trim() === projectName);
    if (!probePartButton) throw new Error('The workstation did not render the recorded piano part.');
    probePartButton.click();
    await waitFor(() => !![...document.querySelectorAll<HTMLElement>('[data-testid="part-row"]')]
      .find((row) => row.textContent?.includes('MIDI Workstation UI Probe') && row.dataset.selected === 'true'), 'probe part selection');
    if (physicalMidi && audioEngine.midiTargetDeviceId !== device.id) {
      throw new Error(`The selected workstation part is not the hardware MIDI target: selected=${device.id}, target=${audioEngine.midiTargetDeviceId ?? 'none'}.`);
    }

    const midiPageButton = document.querySelector<HTMLButtonElement>('[data-testid="ws-midi"]');
    if (!midiPageButton) throw new Error('Workstation MIDI page button is missing.');
    midiPageButton.click();
    await waitFor(
      () => [...document.querySelectorAll('label')].some((label) => label.textContent?.includes('Arm this part for transport recording')),
      'part arm control',
    );
    const armLabel = [...document.querySelectorAll('label')].find((label) => label.textContent?.includes('Arm this part for transport recording'));
    const armCheckbox = armLabel?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!armCheckbox) throw new Error('The MIDI page did not expose the selected part arm checkbox.');
    let armChangeEvents = 0;
    armCheckbox.addEventListener('change', () => { armChangeEvents++; });
    if (!armCheckbox.checked) armCheckbox.click();
    await delay(100);
    const matchingTrack = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id);
    if (!matchingTrack?.armed) {
      const partRows = [...document.querySelectorAll<HTMLElement>('[data-testid="part-row"]')].map((row) => ({
        text: row.textContent?.trim() ?? '',
        selected: row.dataset.selected ?? '',
      }));
      throw new Error(`Clicking the workstation arm control did not arm the probe part: ${JSON.stringify({
        checkboxChecked: armCheckbox.checked,
        armChangeEvents,
        initialTrackArmed: track.armed,
        matchingTrackArmed: matchingTrack?.armed ?? null,
        matchingDevice: [...audioEngine.devices.values()].some((candidate) => candidate.id === device.id),
        partRows,
      })}`);
    }
    const armedTrack = audioEngine.tracks.find((candidate) => candidate.deviceId === device.id);
    if (!armedTrack) throw new Error('The selected workstation part disappeared after arming.');

    let noteNumber = -1;
    let noteVelocity = -1;
    let noteChannel = -1;
    resultNode.textContent = 'Starting recording from the workstation transport…';
    if (physicalMidi) {
      resultNode.dataset.status = 'ready';
      resultNode.textContent = 'Ready — click the red Record button in the bottom transport. If Chrome asks, allow MIDI access. When this panel says “Recording is live…”, press and release one key on the Impulse. The probe stops the take and checks save/reopen.';
      await waitForPhysicalRecording(audioEngine);
      const inputs = await waitForImpulse(audioEngine);
      let noteOnSeen = false;
      let noteOffSeen = false;
      const noteReceived = new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Timed out waiting for an Impulse note press and release.')), 90_000);
        const unsubscribe = audioEngine.midi.monitor((data, portName) => {
          if (!inputs.includes(portName)) return;
          const status = data[0] & 0xf0;
          const channel = data[0] & 0x0f;
          if (!noteOnSeen && status === 0x90 && data[2] > 0) {
            noteNumber = data[1] & 0x7f;
            noteVelocity = data[2] & 0x7f;
            noteChannel = channel;
            noteOnSeen = true;
            resultNode.textContent = `Impulse note received — MIDI ${noteNumber}, velocity ${noteVelocity}/127, channel ${noteChannel + 1}. Release the key.`;
          } else if (noteOnSeen && !noteOffSeen && data[1] === noteNumber && channel === noteChannel &&
            (status === 0x80 || (status === 0x90 && data[2] === 0))) {
            noteOffSeen = true;
            window.clearTimeout(timer);
            unsubscribe();
            resolve();
          }
        });
      });
      resultNode.textContent = `Recording is live through ${inputs.join(', ')}. Play and release one key on the Impulse 25.`;
      await noteReceived;
      await delay(120);
      const recorderProbe = audioEngine.recorder as unknown as RecorderProbeState;
      const recorderAtRelease = {
        state: audioEngine.recorder.state,
        pending: [...recorderProbe.midiPending.keys()],
        noteBuckets: [...recorderProbe.midiNotes.values()].map((entry) => ({ deviceId: entry.deviceId, notes: entry.notes })),
        selectedTarget: audioEngine.midiTargetDeviceId,
        actualTarget: audioEngine.midiTarget()?.id ?? null,
        probeDevice: device.id,
        armed: track.armed,
      };
      recordButton().click();
      await waitFor(() => !audioEngine.isRecording, 'transport Record stop');
      const recorded = notesFrom(track).find((note) => note.note === noteNumber && Math.abs(note.velocity - noteVelocity / 127) < 1e-6);
      if (!recorded || !(recorded.length > 0)) {
        throw new Error(`The Impulse sent MIDI but the workstation Record button did not write a piano-roll note: ${JSON.stringify({ noteNumber, noteVelocity, noteChannel, notes: notesFrom(track), recorderAtRelease })}.`);
      }
    } else {
      recordButton().click();
      await waitFor(() => midiRequestCount() === 1 && audioEngine.isRecording && audioEngine.midi.status === 'connecting', 'recording while the MIDI permission request is pending');
      if (!resolvePendingMidiAccess) throw new Error('The simulated MIDI permission request did not remain pending.');
      resolvePendingMidiAccess(midiAccess);
      resolvePendingMidiAccess = null;
      await waitFor(() => port.connection === 'open' && audioEngine.midi.ports.some((input) => input.id === port.id), 'simulated Impulse connection');
    }
    if (audioEngine.playbackMode !== 'song_arrangement') throw new Error('The probe did not run in Song mode.');

    if (!physicalMidi) {
      resultNode.textContent = 'Recording a simulated Impulse piano-roll note…';
      port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x90, 60, 100]) }));
      await delay(180);
      port.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([0x80, 60, 0]) }));
      await delay(100);
      recordButton().click();
      await waitFor(() => !audioEngine.isRecording, 'transport Record stop');
    }

    const noteFrom = (candidate: SequencerTrack | undefined) => candidate?.arrangementClips
      ?.filter((clip) => clip.kind === 'notes')
      .flatMap((clip) => clip.kind === 'notes' ? clip.notes ?? [] : [])
      .find((note) => note.note === 60 && Math.abs(note.velocity - 100 / 127) < 1e-6);
    const note = physicalMidi
      ? notesFrom(armedTrack).find((candidate) => candidate.note === noteNumber &&
        Math.abs(candidate.velocity - noteVelocity / 127) < 1e-6)
      : noteFrom(armedTrack);
    if (!note || !(note.length > 0)) {
      throw new Error(`The workstation Record button did not create the expected piano-roll note: ${JSON.stringify(note ?? null)}.`);
    }
    if (!physicalMidi && midiRequestCount() !== 1) throw new Error(`Expected one MIDI permission request, got ${midiRequestCount()}.`);

    resultNode.textContent = 'Saving the recorded piano-roll note…';
    await projectManager.save();
    const projectId = projectManager.currentId;
    if (!projectId || projectManager.dirty) throw new Error('The UI-recorded MIDI take did not finish saving.');
    audioEngine.newProject(true);
    if (!(await projectManager.open(projectId))) throw new Error('The UI-recorded MIDI project did not reopen.');
    const reopenedDevice = [...audioEngine.devices.values()].find((candidate) => candidate.type === 'rec_meta_piano' && candidate.name === 'MIDI Workstation UI Probe');
    const reopenedTrack = reopenedDevice && audioEngine.tracks.find((candidate) => candidate.deviceId === reopenedDevice.id);
    const reopenedNote = physicalMidi
      ? reopenedTrack && note
        ? notesFrom(reopenedTrack).find((candidate) => candidate.note === note.note &&
          Math.abs(candidate.velocity - note.velocity) < 1e-6)
        : undefined
      : noteFrom(reopenedTrack);
    if (!reopenedNote || Math.abs(reopenedNote.length - note.length) > 1e-6) {
      throw new Error(`The workstation-recorded note did not survive save/reopen: ${JSON.stringify(reopenedNote ?? null)}.`);
    }

    resultNode.dataset.status = 'passed';
    resultNode.textContent = physicalMidi
      ? `PASS — workstation arm + Record UI captured physical Impulse MIDI ${reopenedNote.note} at velocity ${(reopenedNote.velocity * 127).toFixed(0)}/127 for ${reopenedNote.length.toFixed(3)} sixteenths and preserved it through IndexedDB save/reopen.`
      : `PASS — workstation arm + Record UI requested MIDI once, recorded MIDI 60 at velocity 100/127 for ${reopenedNote.length.toFixed(3)} sixteenths, and preserved the piano-roll note through IndexedDB save/reopen.`;
  } finally {
    if (activeEngine) {
      const audioEngine = activeEngine;
      if (audioEngine.recorder.state !== 'idle') await audioEngine.recorder.stop();
      if (audioEngine.isPlaying) await audioEngine.stopTransport();
      audioEngine.midiTargetDeviceId = null;
    }
    if (originalRequestMidi) Object.defineProperty(navigator, 'requestMIDIAccess', originalRequestMidi);
    else Reflect.deleteProperty(navigator, 'requestMIDIAccess');
  }
}

async function waitForImpulse(audioEngine: typeof AudioEngineInstance): Promise<string[]> {
  let names: string[] = [];
  try {
    await waitFor(() => {
      names = audioEngine.midi.ports.filter((input) => /novation|impulse/i.test(input.name) && !input.error).map((input) => input.name);
      return names.length > 0;
    }, 'connected Novation Impulse MIDI input', 90_000);
  } catch (error) {
    const inputs = audioEngine.midi.ports.map(({ name, error: openError }) => ({ name, error: openError ?? null }));
    const nextStep = audioEngine.midi.status === 'connecting'
      ? 'Chrome MIDI permission is still pending; allow it in the probe window.'
      : audioEngine.midi.status === 'blocked'
        ? 'Chrome denied MIDI access; reconnect the controller and allow access when prompted.'
        : 'Check that the Impulse is connected and not held by other MIDI software.';
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}; MIDI status=${audioEngine.midi.status}; inputs=${JSON.stringify(inputs)}. ${nextStep}`);
  }
  return names;
}

async function waitForPhysicalRecording(audioEngine: typeof AudioEngineInstance): Promise<void> {
  const deadline = performance.now() + 90_000;
  while (!audioEngine.isRecording) {
    const status = audioEngine.midi.status;
    resultNode.textContent = status === 'connecting'
      ? 'Chrome MIDI permission is pending. Choose Allow in the browser prompt to start recording.'
      : `Starting the armed piano recorder… MIDI status: ${status}.`;
    if (performance.now() >= deadline) {
      throw new Error(`Transport recording did not start (recorder=${audioEngine.recorder.state}, MIDI=${status}, ports=${JSON.stringify(audioEngine.midi.ports)}, recorderMessage=${audioEngine.recorder.message ?? 'none'}).`);
    }
    await delay(100);
  }
}

function notesFrom(track: SequencerTrack): ClipNote[] {
  return track.arrangementClips
    ?.filter((clip) => clip.kind === 'notes')
    .flatMap((clip) => clip.kind === 'notes' ? clip.notes ?? [] : []) ?? [];
}

void run().catch((error: unknown) => {
  resultNode.dataset.status = 'failed';
  resultNode.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
