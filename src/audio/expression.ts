/**
 * Pitch bend and mod wheel for every instrument, without per-engine code.
 *
 * Bend: the oscillators and sample sources an instrument creates while it starts a note get the
 * device's expression signal on their `detune` (summed with the engine's own detune), so held and
 * new notes bend together. The connection is dropped when the source ends.
 * Mod wheel: instruments with a `cv_mod` input get it (their own mod routing); the others get
 * vibrato on the same expression signal.
 */
import type { BaseDevice } from './BaseDevice.ts';

interface Expression {
  /** Sum of bend + vibrato, in cents, patched into every captured source's detune. */
  bus: GainNode;
  bend: ConstantSourceNode;
  vibrato: GainNode | null;
  rangeSemis: number;
}

type Source = OscillatorNode | AudioBufferSourceNode;

const exprs = new WeakMap<BaseDevice, Expression>();
/** Nested captures (a player's note starting another instrument's note) get their own frame. */
const frames: Source[][] = [];
/** Sources captured per note number, so MPE per-note detune can reach them mid-note. */
const perNoteSources = new WeakMap<BaseDevice, Map<number, Source[]>>();

function captureSources(ctx: BaseAudioContext, fn: () => void): Source[] {
  const frame: Source[] = [];
  const outer = frames.length === 0;
  const oscDescriptor = Object.getOwnPropertyDescriptor(ctx, 'createOscillator');
  const bufDescriptor = Object.getOwnPropertyDescriptor(ctx, 'createBufferSource');
  if (outer) {
    const osc = ctx.createOscillator;
    const buf = ctx.createBufferSource;
    // instance properties shadow the prototype factories for the duration of the call
    Object.defineProperty(ctx, 'createOscillator', {
      configurable: true,
      value: () => {
        const o = osc.call(ctx);
        frames[frames.length - 1]?.push(o);
        return o;
      },
    });
    Object.defineProperty(ctx, 'createBufferSource', {
      configurable: true,
      value: () => {
        const b = buf.call(ctx);
        frames[frames.length - 1]?.push(b);
        return b;
      },
    });
  }
  frames.push(frame);
  try {
    fn();
  } finally {
    frames.pop();
    if (outer) {
      if (oscDescriptor) Object.defineProperty(ctx, 'createOscillator', oscDescriptor);
      else Reflect.deleteProperty(ctx, 'createOscillator');
      if (bufDescriptor) Object.defineProperty(ctx, 'createBufferSource', bufDescriptor);
      else Reflect.deleteProperty(ctx, 'createBufferSource');
    }
  }
  return frame;
}

function attach(bus: GainNode, s: Source): void {
  bus.connect(s.detune);
  s.addEventListener(
    'ended',
    () => {
      try {
        bus.disconnect(s.detune);
      } catch {
        /* already disconnected */
      }
    },
    { once: true }
  );
}

/** Wraps the instrument's noteOn so the voices it starts follow bend / vibrato. */
export function installExpression(dev: BaseDevice): void {
  if (typeof dev.noteOn !== 'function' || exprs.has(dev)) return;
  const ctx = dev.ctx;
  const bus = ctx.createGain();
  const bend = ctx.createConstantSource();
  bend.offset.value = 0;
  bend.connect(bus);
  bend.start();
  exprs.set(dev, { bus, bend, vibrato: null, rangeSemis: 2 });
  const noteSources = new Map<number, Source[]>();
  perNoteSources.set(dev, noteSources);
  const noteOn = dev.noteOn.bind(dev);
  dev.noteOn = (note: number, velocity?: number, time?: number) => {
    const captured = captureSources(ctx, () => noteOn(note, velocity, time));
    for (const s of captured) attach(bus, s);
    // Apply any stored per-note detune (MPE bend) to this note's sources at start.
    const cents = dev.perNoteDetune.get(note) ?? 0;
    if (cents !== 0) {
      for (const s of captured) {
        s.detune.setValueAtTime(cents, ctx.currentTime);
      }
    }
    noteSources.set(note, captured);
  };
  const noteOff = dev.noteOff.bind(dev);
  dev.noteOff = (note: number, time?: number) => {
    for (const s of captureSources(ctx, () => noteOff(note, time))) attach(bus, s);
    noteSources.delete(note);
    dev.perNoteDetune.delete(note);
    dev.perNotePressure.delete(note);
    dev.perNoteTimbre.delete(note);
  };
}

/** amount −1..1 (wheel position); range ±2 semitones like most hardware synths. */
export function setPitchBend(dev: BaseDevice, amount: number): void {
  const e = exprs.get(dev);
  if (!e) return;
  const cents = Math.max(-1, Math.min(1, amount)) * e.rangeSemis * 100;
  e.bend.offset.setTargetAtTime(cents, dev.ctx.currentTime, 0.008);
  dev.pitchBend = Math.max(-1, Math.min(1, amount));
}

/** value 0..1. */
export function setModWheel(dev: BaseDevice, value: number): void {
  const v = Math.max(0, Math.min(1, value));
  dev.modWheel = v;
  const cv = dev.cvInputs.get('cv_mod')?.setter;
  if (cv) {
    cv(v);
    return;
  }
  const e = exprs.get(dev);
  if (!e) return;
  if (!e.vibrato && v > 0) {
    const lfo = dev.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    e.vibrato = dev.ctx.createGain();
    e.vibrato.gain.value = 0;
    lfo.connect(e.vibrato).connect(e.bus);
    lfo.start();
  }
  // up to ±40 cents of vibrato at full wheel
  e.vibrato?.gain.setTargetAtTime(v * 40, dev.ctx.currentTime, 0.02);
}

/**
 * MPE: set per-note pitch bend in cents for `note` and apply it to all currently sounding
 * sources for that note. Called when a per-note MIDI channel sends pitch bend (0xe0).
 */
export function updateNoteDetune(dev: BaseDevice, note: number, cents: number): void {
  dev.perNoteDetune.set(note, Math.max(-200, Math.min(200, cents)));
  const sources = perNoteSources.get(dev)?.get(note);
  if (sources) {
    const now = dev.ctx.currentTime;
    for (const s of sources) {
      s.detune.setValueAtTime(cents, now);
    }
  }
}

/**
 * MPE: set per-note pressure (0..1) for `note`. Engines that consume per-note pressure
 * (e.g. for swell or filter brightness) read `dev.perNotePressure`.
 */
export function setPerNotePressure(dev: BaseDevice, note: number, value: number): void {
  dev.perNotePressure.set(note, Math.max(0, Math.min(1, value)));
}

/**
 * MPE: set per-note timbre / CC74 (0..1) for `note`. Engines that consume per-note timbre
 * (e.g. for filter cutoff or oscillator wave) read `dev.perNoteTimbre`.
 */
export function setPerNoteTimbre(dev: BaseDevice, note: number, value: number): void {
  dev.perNoteTimbre.set(note, Math.max(0, Math.min(1, value)));
}
