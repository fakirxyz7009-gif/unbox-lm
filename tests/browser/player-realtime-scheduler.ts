import { audioEngine } from '../../src/audio/AudioEngine.ts';
import { projectManager } from '../../src/project/ProjectManager.ts';

const result = document.querySelector<HTMLPreElement>('#result')!;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function verifyHeldRoutes(): Promise<void> {
  const instrument = audioEngine.createDevice('polytone', 'Player Route Synth');
  const replacement = audioEngine.createDevice('polytone', 'New Player Target');
  const events: string[] = [];
  for (const device of [instrument, replacement]) {
    const target = device === instrument ? 'old' : 'new';
    const noteOn = device.noteOn.bind(device);
    const noteOff = device.noteOff.bind(device);
    device.noteOn = (n, v, t) => { events.push(`${target}+${n}`); noteOn(n, v, t); };
    device.noteOff = (n, t) => { events.push(`${target}-${n}`); noteOff(n, t); };
  }
  const check = (label: string, expected: string) => {
    const actual = events.splice(0).join(' ');
    expect(actual === expected, `${label}: expected ${expected || '(no events)'}, got ${actual || '(no events)'}.`);
  };
  const input = Object.assign(new EventTarget(), {
    id: 'player-route-midi', name: 'Player Route Probe', state: 'connected', connection: 'open',
  });
  const originalPermission = Object.getOwnPropertyDescriptor(navigator, 'requestMIDIAccess');
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null }),
  });
  const midi = (status: number, note: number, velocity: number) =>
    input.dispatchEvent(new MessageEvent('midimessage', { data: new Uint8Array([status, note, velocity]) }));
  const originalTarget = audioEngine.midiTargetDeviceId;
  const addedDevices = [instrument, replacement];
  try {
    expect(await audioEngine.midi.enable(), 'The simulated MIDI input did not connect.');
    audioEngine.midiTargetDeviceId = instrument.id;
    const addPlayer = () => {
      const player = audioEngine.createDevice('scales_chords', 'Player Route Chord Builder');
      addedDevices.push(player);
      audioEngine.setPlayerTarget(player.id, instrument.id);
      return player;
    };

    audioEngine.liveNoteOn(instrument, 61);
    const first = addPlayer();
    first.setParam('chord', 'Off');
    audioEngine.liveNoteOff(instrument, 61);
    check('attached a Player while a raw note was held', 'old+61 old-61');

    midi(0x90, 61, 99);
    midi(0x91, 61, 95);
    check('shared pitch on two MIDI channels', 'old+60');
    first.isBypassed = true;
    midi(0x80, 61, 0);
    check('released one owner after bypass', '');
    midi(0x81, 61, 0);
    check('released the last owner through the original Player', 'old-60');
    audioEngine.liveNoteOn(instrument, 61);
    audioEngine.liveNoteOff(instrument, 61);
    check('new keys bypass the Player', 'old+61 old-61');
    first.isBypassed = false;

    midi(0x90, 61, 99);
    first.isBypassed = true;
    midi(0x91, 61, 95);
    check('equal input pitches on separate channels keep their own routes across bypass', 'old+60 old+61');
    midi(0x81, 61, 0);
    check('released the newer channel on its raw pitch', 'old-61');
    midi(0x80, 61, 0);
    check('released the older channel on its transformed pitch', 'old-60');
    first.isBypassed = false;

    midi(0xb0, 64, 127);
    midi(0x90, 61, 99);
    midi(0x80, 61, 0);
    midi(0x90, 61, 98);
    check('retriggered a sustained pitch on the same channel', 'old+60 old-60 old+60');
    first.isPowered = false;
    midi(0xb0, 64, 0);
    check('pedal-up preserves the physically held retrigger', '');
    midi(0x80, 61, 0);
    check('key-up still reaches the powered-off Player chain', 'old-60');
    first.isPowered = true;

    for (const setting of ['isBypassed', 'isPowered'] as const) {
      for (const [firstUp, lastUp] of [[61, 60], [60, 61]]) {
        audioEngine.liveNoteOn(instrument, 61); // sounds C through the Player
        const active = first[setting];
        first[setting] = !active;
        audioEngine.liveNoteOn(instrument, 60); // sounds the same C directly
        check(`${setting} changes while an output pitch is held`, 'old+60');
        audioEngine.liveNoteOff(instrument, firstUp);
        check(`${setting} releases source ${firstUp} first`, '');
        audioEngine.liveNoteOff(instrument, lastUp);
        check(`${setting} releases the final owner ${lastUp}`, 'old-60');
        first[setting] = active;
      }
    }

    const second = addPlayer();
    second.setParam('chord', 'Triad');
    audioEngine.liveNoteOn(instrument, 60);
    audioEngine.liveNoteOn(instrument, 61); // both become C before the second Player
    check('distinct keys through two Players share the same chord voices', 'old+60 old+64 old+67');
    audioEngine.liveNoteOff(instrument, 60);
    check('a shared intermediate pitch keeps the chord held after the first key-up', '');
    audioEngine.liveNoteOff(instrument, 61);
    check('the final owner releases the entire chord', 'old-60 old-64 old-67');

    audioEngine.liveNoteOn(instrument, 61);
    audioEngine.setPlayerTarget(first.id, replacement.id);
    audioEngine.liveNoteOff(instrument, 61);
    check('retargeting an upstream Player releases the downstream chord on the original instrument', 'old+60 old+64 old+67 old-60 old-64 old-67');
    audioEngine.liveNoteOn(replacement, 61);
    audioEngine.liveNoteOff(replacement, 61);
    check('retargeted Player processes new notes', 'new+60 new-60');

    audioEngine.liveNoteOn(instrument, 61);
    expect(audioEngine.removeDevice(second.id, true), 'Could not remove the Player during a held chord.');
    audioEngine.liveNoteOff(instrument, 61);
    check('removing a Player releases its original chord', 'old+60 old+64 old+67 old-60 old-64 old-67');
  } finally {
    audioEngine.midiTargetDeviceId = originalTarget;
    if (originalPermission) Object.defineProperty(navigator, 'requestMIDIAccess', originalPermission);
    else Reflect.deleteProperty(navigator, 'requestMIDIAccess');
    addedDevices.reverse().forEach((device) => audioEngine.removeDevice(device.id, true));
  }
}

async function run(): Promise<void> {
  projectManager.autosave = false;
  await projectManager.create('empty', 'Player Realtime Scheduler Regression');
  await audioEngine.resumeContext();
  audioEngine.stopTransport();

  const originalInterval = window.setInterval;
  let intervals = 0;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    intervals++;
    return originalInterval(...args);
  }) as typeof window.setInterval;

  const synth = audioEngine.createDevice('subtractor', 'Player Clock Synth');
  const arp = audioEngine.createDevice('rpg8', 'Player Clock Arp');
  const engineState = audioEngine as unknown as { realtimeTasks: Set<unknown>; realtimeTimer: unknown; isPlaying: boolean };
  const noteOn = synth.noteOn.bind(synth);
  let scheduledNotes = 0;
  const player = arp as unknown as { target: string | null; engine: { player?: { tick?: (...args: unknown[]) => void } } };
  const tick = player.engine.player?.tick?.bind(player.engine.player);
  let ticks = 0;
  if (tick) player.engine.player!.tick = (...args: unknown[]) => { ticks++; tick(...args); };
  synth.noteOn = (note, velocity, time) => {
    scheduledNotes++;
    noteOn(note, velocity, time);
  };
  try {
    audioEngine.setPlayerTarget(arp.id, synth.id);
    audioEngine.liveNoteOn(synth, 60, 0.82);

    let peak = 0;
    let sourcePeak = 0;
    const waveform = new Float32Array(synth.analyser.fftSize);
    for (let index = 0; index < 18; index++) {
      await wait(20);
      const levels = audioEngine.getTrackStereoLevels(synth.id);
      peak = Math.max(peak, levels.peakL, levels.peakR);
      synth.analyser.getFloatTimeDomainData(waveform);
      for (const sample of waveform) sourcePeak = Math.max(sourcePeak, Math.abs(sample));
    }
    audioEngine.liveNoteOff(synth, 60);
    await wait(80);

    expect(intervals === 0, `Live player created ${intervals} window interval(s).`);
    expect(scheduledNotes > 0, `Held live arpeggiator never scheduled a synth note (target ${player.target ?? 'none'}, ticks ${ticks}, tasks ${engineState.realtimeTasks.size}, timer ${engineState.realtimeTimer ? 'present' : 'missing'}, playing ${engineState.isPlaying}).`);
    expect(sourcePeak > 1e-4, `Held live arpeggiator scheduled notes but rendered no source audio (peak ${sourcePeak.toExponential(2)}).`);
    await verifyHeldRoutes();
    result.dataset.status = 'passed';
    result.textContent = `PASS · shared realtime scheduler emitted ${scheduledNotes} held live arpeggiator note(s) at ${sourcePeak.toFixed(4)} source peak without a window interval; mixer peak observed ${peak.toFixed(4)}. Live note-offs kept their original paths across Player attachment, power, bypass, retargeting and removal, with independent MIDI channels and sustain retriggers. Shared output pitches and chained chords held until their final key-up.`;
  } finally {
    window.setInterval = originalInterval;
    audioEngine.removeDevice(arp.id, true);
    audioEngine.removeDevice(synth.id, true);
  }
}

void run().catch((error: unknown) => {
  audioEngine.stopTransport();
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
