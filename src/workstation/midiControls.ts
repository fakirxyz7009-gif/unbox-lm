/**
 * Hardware knobs, faders and buttons → the workstation: the six big knobs of the selected part,
 * its level and pan, the master level and the transport. Defaults fit controllers whose eight
 * knobs send CC 21–28 and whose fader sends CC 49 (a Novation Impulse in MIDI mode); anything
 * else is assigned with MIDI Learn (Settings · MIDI). Saved in localStorage: the map belongs to
 * the controller, not to a project.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import { gainToDb } from '../studio/ui/levels.ts';
import { barToGain } from '../ui/skin/LevelBar.tsx';
import { fromNorm } from '../ui/skin/RingKnob.tsx';
import { formatParam } from './paramFormat.ts';
import { quickControls } from './partState.ts';

export type MidiTargetId =
  | 'quick1'
  | 'quick2'
  | 'quick3'
  | 'quick4'
  | 'quick5'
  | 'quick6'
  | 'partLevel'
  | 'partPan'
  | 'masterLevel'
  | 'play'
  | 'stop'
  | 'record'
  | 'loop'
  | 'back'
  | 'forward';

export const MIDI_TARGETS: { id: MidiTargetId; label: string; button?: true }[] = [
  { id: 'quick1', label: 'Big knob 1' },
  { id: 'quick2', label: 'Big knob 2' },
  { id: 'quick3', label: 'Big knob 3' },
  { id: 'quick4', label: 'Big knob 4' },
  { id: 'quick5', label: 'Big knob 5' },
  { id: 'quick6', label: 'Big knob 6' },
  { id: 'partPan', label: 'Part pan' },
  { id: 'partLevel', label: 'Part level' },
  { id: 'masterLevel', label: 'Master level' },
  { id: 'play', label: 'Play / pause', button: true },
  { id: 'stop', label: 'Stop', button: true },
  { id: 'record', label: 'Record', button: true },
  { id: 'loop', label: 'Loop on / off', button: true },
  { id: 'back', label: 'One bar back', button: true },
  { id: 'forward', label: 'One bar forward', button: true },
];

type MidiMap = Record<MidiTargetId, number | null>;

const DEFAULTS: MidiMap = {
  quick1: 21,
  quick2: 22,
  quick3: 23,
  quick4: 24,
  quick5: 25,
  quick6: 26,
  partPan: 27,
  masterLevel: 28,
  partLevel: 49,
  play: null,
  stop: null,
  record: null,
  loop: null,
  back: null,
  forward: null,
};

const STORE = 'unbox.midiControls';

function load(): MidiMap {
  const map = { ...DEFAULTS };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (raw && typeof raw === 'object') {
      for (const t of MIDI_TARGETS) {
        const v = (raw as Record<string, unknown>)[t.id];
        if (v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 128)) map[t.id] = v;
      }
    }
  } catch {
    // no storage (private window …): defaults
  }
  return map;
}

let map = load();
let learning: MidiTargetId | null = null;
const listeners = new Set<() => void>();

/** What hardware controls last changed (per-frame UI compares `version`). */
export const midiControlChanges = { version: 0, touched: null as { label: string; value: string } | null };

function changed(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch {
    // not saved; still works this session
  }
  listeners.forEach((f) => f());
}

export const midiMap = (): Readonly<MidiMap> => map;
export const midiLearning = (): MidiTargetId | null => learning;

export function subscribeMidiMap(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The next knob / button moved on the controller is assigned to `id` (null = cancel). */
export function learnMidi(id: MidiTargetId | null): void {
  learning = id;
  listeners.forEach((f) => f());
}

export function clearMidi(id: MidiTargetId): void {
  map = { ...map, [id]: null };
  changed();
}

export function resetMidiMap(): void {
  map = { ...DEFAULTS };
  learning = null;
  changed();
}

function touch(label: string, value: string): void {
  midiControlChanges.touched = { label, value };
  midiControlChanges.version++;
}

function apply(id: MidiTargetId, value: number): void {
  const button = MIDI_TARGETS.find((t) => t.id === id)?.button;
  if (button) {
    if (value < 64) return; // act on press, not on release
    if (id === 'play') void audioEngine.togglePlay();
    else if (id === 'stop') audioEngine.stopTransport();
    else if (id === 'record') void audioEngine.recorder.toggle();
    else if (id === 'loop') audioEngine.toggleLoop();
    else if (id === 'back') audioEngine.rewindTransport(audioEngine.stepsPerBar);
    else if (id === 'forward') audioEngine.nextBar();
    return;
  }
  const f = value / 127;
  if (id === 'masterLevel') {
    const g = barToGain(f);
    audioEngine.mixer.setMasterVolume(g);
    return touch('Master', g <= 0.0001 ? '-∞' : `${gainToDb(g).toFixed(1)}dB`);
  }
  const dev = audioEngine.midiTarget();
  if (!dev) return;
  if (id === 'partLevel') {
    const g = barToGain(f);
    audioEngine.mixer.setVolume(dev.id, g);
    return touch('Level', g <= 0.0001 ? '-∞' : `${gainToDb(g).toFixed(1)}dB`);
  }
  if (id === 'partPan') {
    const pan = Math.max(-1, Math.min(1, (value - 64) / 63));
    audioEngine.mixer.setPan(dev.id, pan);
    return touch('Pan', pan === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`);
  }
  const p = quickControls(dev)[Number(id.slice(5)) - 1];
  if (!p) return;
  let v = fromNorm(f, p.min, p.max, p.curve);
  if (p.step) v = Math.round(v / p.step) * p.step;
  dev.setParam(p.key, v);
  touch(p.label, formatParam(p, v));
}

function onControl(cc: number, value: number): void {
  if (learning) {
    const id = learning;
    learning = null;
    // one control per function: the CC leaves whatever it drove before
    const next = { ...map };
    for (const t of MIDI_TARGETS) if (next[t.id] === cc) next[t.id] = null;
    next[id] = cc;
    map = next;
    changed();
    return;
  }
  for (const t of MIDI_TARGETS) if (map[t.id] === cc) apply(t.id, value);
}

let installed = false;
/** Starts listening to the controller's knobs and buttons (once). */
export function installMidiControls(): void {
  if (installed) return;
  installed = true;
  audioEngine.midi.onControl(onControl);
}
