/**
 * "Load audio" for every instrument: an audio file becomes the instrument's sound.
 *
 * - Keys: one sample played across the keyboard, resampled from its root note (detected from the
 *   file's pitch when it has one, else C4), with tune, level, attack, release and loop.
 * - Pads (drum machines / kits, see drumLanes.ts): a sample per pad note, played one-shot at its own
 *   pitch; pads without one keep the device's own sound.
 *
 * The voice sits between the instrument's noteOn / noteOff and its (level-trimmed) outputs, inside
 * the pitch-bend wrapper, so cables, the mixer strip, bend and vibrato all apply. Assignments are a
 * project section (`deviceSamples`), the audio lives in the audio store, and renderSong installs the
 * same voice on its offline copies, so exports play the samples too.
 */
import type { BaseDevice } from './BaseDevice.ts';
import { audioStore } from './clips/audioStore.ts';
import { sf2DefaultVelocityAmplitude } from './soundfont/sf2.ts';

export interface KeySample {
  audioId: string;
  /** MIDI note at which the file plays at its original speed. */
  root: number;
  /** Fine tune in cents. */
  tune: number;
  /** Linear gain (1 = 0 dB). */
  level: number;
  attack: number;
  release: number;
  loop: boolean;
}

export interface PadSample {
  audioId: string;
  level: number;
  offset?: number;
  duration?: number;
  pitch?: number;
  tune?: number;
  reverse?: boolean;
  loop?: boolean;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

/** One velocity/key zone from an imported multisample bank (for example an SF2 preset). */
export interface MultiSampleZone {
  audioId: string;
  keyLow: number;
  keyHigh: number;
  velLow: number;
  velHigh: number;
  root: number;
  tune: number;
  level: number;
  delay?: number;
  attack: number;
  hold?: number;
  decay?: number;
  sustain?: number;
  release: number;
  /** SF2 timecents per key number, applied around MIDI key 60. */
  keyToHold?: number;
  keyToDecay?: number;
  /** SF2 cents per MIDI key; 100 is normal equal-tempered scaling. */
  scaleTuning?: number;
  /** SF2 initialFilterFc generator in cents; enables velocity-sensitive low-pass filtering. */
  filterCutoffCents?: number;
  /** Apply SF2's default 960 cB velocity-to-attenuation response instead of the generic sample curve. */
  sf2DefaultVelocityAttenuation?: boolean;
  /** SF2 exclusive class; a new voice fades existing voices in this preset class. */
  exclusiveClass?: number;
  loop: boolean;
  /** SF2 sample mode 3: continue from the current loop position into the sample tail at key-up. */
  loopUntilRelease?: boolean;
  loopStart?: number;
  loopEnd?: number;
}

export interface DeviceSampleState {
  keys?: KeySample;
  /** By pad note. */
  pads?: Record<number, PadSample>;
  multiSample?: MultiSampleZone[];
}

export const DEFAULT_KEY_SAMPLE: Omit<KeySample, 'audioId'> = { root: 60, tune: 0, level: 1, attack: 0.003, release: 0.25, loop: false };
const MAX_VOICES = 64;

const samples = new Map<string, DeviceSampleState>();
let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((s) => s());
};

export function deviceSample(deviceId: string): DeviceSampleState | undefined {
  return samples.get(deviceId);
}
export function subscribeDeviceSamples(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
export const deviceSamplesVersion = (): number => version;

/** Every audio id the assignments use (exports and project archives load / bundle them). */
export function deviceSampleAudioIds(deviceId?: string): string[] {
  const ids = new Set<string>();
  samples.forEach((s, id) => {
    if (deviceId && id !== deviceId) return;
    if (s.keys) ids.add(s.keys.audioId);
    Object.values(s.pads ?? {}).forEach((p) => ids.add(p.audioId));
    s.multiSample?.forEach((z) => ids.add(z.audioId));
  });
  return [...ids];
}

function edit(deviceId: string, fn: (s: DeviceSampleState) => void): void {
  const s = { ...samples.get(deviceId) };
  fn(s);
  if (!s.keys && !(s.pads && Object.keys(s.pads).length) && !s.multiSample?.length) samples.delete(deviceId);
  else samples.set(deviceId, s);
  bump();
}

/** `null` = back to the instrument's own sound. */
export function setKeySample(deviceId: string, sample: KeySample | null): void {
  edit(deviceId, (s) => {
    if (sample) {
      if (s.keys?.audioId !== sample.audioId) delete s.pads;
      delete s.multiSample;
      s.keys = sample;
    }
    else delete s.keys;
  });
}

export function updateKeySample(deviceId: string, patch: Partial<Omit<KeySample, 'audioId'>>): void {
  const cur = samples.get(deviceId)?.keys;
  if (cur) setKeySample(deviceId, { ...cur, ...patch });
}

export function setPadSample(deviceId: string, note: number, sample: PadSample | null): void {
  edit(deviceId, (s) => {
    const pads = { ...s.pads };
    if (sample) pads[note] = sample;
    else delete pads[note];
    s.pads = pads;
  });
}

export function clearPadSamples(deviceId: string): void {
  edit(deviceId, (s) => delete s.pads);
}

/** Replaces a device's one-shot/key samples with a project-persisted multisample map. */
export function setMultiSample(deviceId: string, zones: MultiSampleZone[] | null): void {
  edit(deviceId, (s) => {
    delete s.keys;
    delete s.pads;
    if (zones?.length) s.multiSample = zones;
    else delete s.multiSample;
  });
}

// ---------------------------------------------------------------------------------------------
// root note detection (YIN-style difference function on a window after the attack)

/** MIDI note (and cents off) of a pitched sample; null when it has no clear pitch (drums, noise). */
export function detectPitch(buffer: AudioBuffer): { note: number; cents: number } | null {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / buffer.numberOfChannels;
  }
  // first 20 ms block that reaches 10 % of the loudest block, then skip 60 ms of attack
  const block = Math.max(1, Math.round(sr * 0.02));
  const rms: number[] = [];
  for (let i = 0; i + block <= len; i += block) {
    let s = 0;
    for (let j = i; j < i + block; j++) s += mono[j] * mono[j];
    rms.push(Math.sqrt(s / block));
  }
  const loudest = Math.max(0, ...rms);
  if (loudest < 1e-4) return null;
  const onset = Math.max(0, rms.findIndex((r) => r >= loudest * 0.1)) * block;
  const start = onset + Math.round(sr * 0.06);
  const W = Math.min(4096, Math.floor((len - start) / 2));
  if (W < 512) return null;
  const minLag = Math.floor(sr / 1500);
  const maxLag = Math.min(W - 1, Math.ceil(sr / 35));
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = mono[start + i] - mono[start + i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  let best = -1;
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < 0.15) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return null;
  // parabolic refinement
  const a = cmnd[best - 1] ?? cmnd[best];
  const b = cmnd[best];
  const c = cmnd[best + 1] ?? cmnd[best];
  const shift = a + c - 2 * b !== 0 ? (0.5 * (a - c)) / (a + c - 2 * b) : 0;
  const freq = sr / (best + shift);
  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = Math.round(midi);
  if (note < 12 || note > 115) return null;
  return { note, cents: Math.round((midi - note) * 100) };
}

/** Decodes a file into the audio store and makes it the instrument's sound (keys mode). */
export async function loadKeySampleFile(deviceId: string, file: File | Blob): Promise<KeySample> {
  const asset = await audioStore.importFile(file);
  const pitch = detectPitch(asset.buffer);
  const sample: KeySample = { ...DEFAULT_KEY_SAMPLE, audioId: asset.id, root: pitch?.note ?? DEFAULT_KEY_SAMPLE.root, tune: pitch ? -pitch.cents : 0 };
  setKeySample(deviceId, sample);
  return sample;
}

export async function loadPadSampleFile(deviceId: string, note: number, file: File | Blob): Promise<void> {
  const asset = await audioStore.importFile(file);
  setPadSample(deviceId, note, { audioId: asset.id, level: 1 });
}

// ---------------------------------------------------------------------------------------------
// the voice

interface Voice {
  note: number;
  src: AudioBufferSourceNode;
  amp: GainNode;
  oneShot: boolean;
  release: number;
  /** Scheduled end of any audible source for this note, including an SF2 release tail. */
  endTime: number;
  sf2Envelope: boolean;
  loopUntilRelease: boolean;
  exclusiveClass: number;
  startTime: number;
  offset: number;
  rate: number;
  loopStart?: number;
  loopEnd?: number;
  filter?: BiquadFilterNode;
  peakGain: number;
  sustainGain: number;
  decayTarget: number;
  attackStart: number;
  attackEnd: number;
  decayStart: number;
  decayEnd: number;
  tailSource?: AudioBufferSourceNode;
  retire: () => void;
}

const wrapped = new WeakSet<BaseDevice>();
const voiceMaps = new WeakMap<BaseDevice, Map<number, Voice>>();
const exclusiveVoices = new WeakMap<BaseDevice, Map<number, Set<Voice>>>();
const buses = new WeakMap<BaseDevice, GainNode>();

function exclusiveVoiceSet(dev: BaseDevice, exclusiveClass: number, create: boolean): Set<Voice> | undefined {
  let classes = exclusiveVoices.get(dev);
  if (!classes && create) exclusiveVoices.set(dev, (classes = new Map()));
  let voices = classes?.get(exclusiveClass);
  if (!voices && create) classes?.set(exclusiveClass, (voices = new Set()));
  return voices;
}

function retireExclusiveVoice(dev: BaseDevice, voice: Voice): void {
  if (voice.exclusiveClass <= 0) return;
  const classes = exclusiveVoices.get(dev);
  const voices = classes?.get(voice.exclusiveClass);
  voices?.delete(voice);
  if (voices?.size === 0) classes?.delete(voice.exclusiveClass);
}

/** Stereo bus into the device's (trimmed) output jacks. */
function busOf(dev: BaseDevice): GainNode | null {
  let bus = buses.get(dev);
  if (bus) return bus;
  const l = dev.audioOutputs.get('out_l');
  const r = dev.audioOutputs.get('out_r');
  if (!l) return null;
  const ctx = dev.ctx;
  bus = ctx.createGain();
  bus.channelCount = 2;
  bus.channelCountMode = 'explicit';
  bus.channelInterpretation = 'speakers'; // a mono file plays on both sides
  if (!r || r === l) bus.connect(l);
  else {
    const split = ctx.createChannelSplitter(2);
    bus.connect(split);
    split.connect(l, 0);
    split.connect(r, 1);
  }
  buses.set(dev, bus);
  return bus;
}

function stopVoice(v: Voice, t: number, fade: number): void {
  if (v.endTime <= t + 1e-6) {
    v.retire();
    return;
  }
  try {
    if (v.sf2Envelope) {
      const duration = Math.max(0.001, fade);
      v.amp.gain.cancelAndHoldAtTime(t);
      const start = Math.max(1e-8, scheduledEnvelopeGain(v, t));
      v.amp.gain.setValueAtTime(start, t);
      v.amp.gain.exponentialRampToValueAtTime(Math.max(1e-13, start * 1e-5), t + duration);
      v.amp.gain.setValueAtTime(0, t + duration + 0.001);
      v.endTime = Math.min(v.endTime, t + duration + 0.01);
      try { v.src.stop(t + duration + 0.01); } catch { /* the original loop source may already have ended */ }
      try { v.tailSource?.stop(t + duration + 0.01); } catch { /* the release tail may already have ended */ }
      return;
    }
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, Math.max(0.003, fade / 4));
    v.endTime = Math.min(v.endTime, t + fade + 0.05);
    v.src.stop(t + fade + 0.05);
  } catch {
    // already stopped
  }
}

function scheduledEnvelopeGain(v: Voice, t: number): number {
  if (t < v.attackStart) return 0;
  if (t < v.attackEnd) {
    return v.peakGain * ((t - v.attackStart) / Math.max(0.001, v.attackEnd - v.attackStart));
  }
  if (t < v.decayStart) return v.peakGain;
  if (t < v.decayEnd) {
    const progress = (t - v.decayStart) / Math.max(0.001, v.decayEnd - v.decayStart);
    if (v.sf2Envelope) return v.peakGain * Math.pow(Math.max(1e-8, v.decayTarget / Math.max(1e-8, v.peakGain)), progress);
    return v.peakGain + (v.sustainGain - v.peakGain) * progress;
  }
  if (v.sf2Envelope && v.sustainGain < v.decayTarget && t > v.decayEnd + 0.001) return 0;
  return v.sustainGain;
}

/** Release a loop-until-key-up sample at its scheduled audio time, then play its tail once. */
function releaseLoopUntilKeyUp(v: Voice, t: number, ctx: BaseAudioContext): void {
  const duration = Math.max(0.001, v.release);
  const buffer = v.src.buffer;
  if (!buffer || v.loopStart === undefined || v.loopEnd === undefined || v.loopEnd <= v.loopStart) {
    stopVoice(v, t, duration);
    return;
  }

  try {
    v.amp.gain.cancelAndHoldAtTime(t);
    const level = Math.max(1e-8, scheduledEnvelopeGain(v, t));
    v.amp.gain.setValueAtTime(level, t);
    v.amp.gain.exponentialRampToValueAtTime(Math.max(1e-13, level * 1e-5), t + duration);
    v.amp.gain.setValueAtTime(0, t + duration + 0.001);
    v.src.stop(t);

    // A release scheduled before its note starts cancels that note without creating a tail.
    if (t < v.startTime || !Number.isFinite(v.rate) || v.rate <= 0) return;
    const loopLength = v.loopEnd - v.loopStart;
    const elapsed = Math.max(0, t - v.startTime);
    const position = v.offset + elapsed * v.rate;
    const tailOffset = position < v.loopEnd
      ? position
      : v.loopStart + ((position - v.loopStart) % loopLength);
    if (tailOffset >= buffer.duration) return;
    v.endTime = Math.min(t + duration, t + (buffer.duration - tailOffset) / v.rate);

    const tail = ctx.createBufferSource();
    tail.buffer = buffer;
    tail.playbackRate.setValueAtTime(v.rate, t);
    tail.connect(v.filter ?? v.amp);
    v.tailSource = tail;
    tail.addEventListener('ended', () => {
      tail.disconnect();
      if (v.tailSource === tail) {
        v.tailSource = undefined;
        v.retire();
        v.amp.disconnect();
        v.filter?.disconnect();
      }
    }, { once: true });
    tail.start(t, tailOffset);
  } catch {
    // If the scheduled tail cannot start, keep the release click-free and bounded.
    stopVoice(v, t, duration);
  }
}

const reversedBuffers = new WeakMap<AudioBuffer, AudioBuffer>();
function getReversed(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  let r = reversedBuffers.get(buf);
  if (r) return r;
  r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = r.getChannelData(c);
    for (let i = 0, j = buf.length - 1; i < buf.length; i++, j--) {
      dst[i] = src[j];
    }
  }
  reversedBuffers.set(buf, r);
  return r;
}

function keyTrackedTime(seconds: number, timecentsPerKey: number, note: number): number {
  const exponent = Math.max(-10, Math.min(8000 / 1200, (timecentsPerKey * (60 - note)) / 1200));
  return Math.max(0.001, Math.min(10, seconds * 2 ** exponent));
}

function play(
  dev: BaseDevice,
  note: number,
  buffer: AudioBuffer,
  o: {
    rate: number;
    level: number;
    attack: number;
    release: number;
    delay?: number;
    hold?: number;
    sf2Envelope?: boolean;
    loop: boolean;
    loopStart?: number;
    loopEnd?: number;
    oneShot: boolean;
    offset?: number;
    duration?: number;
    decay?: number;
    sustain?: number;
    sf2FilterCutoffCents?: number;
    sf2DefaultVelocityAttenuation?: boolean;
    reverse?: boolean;
    loopUntilRelease?: boolean;
    exclusiveClass?: number;
  },
  velocity: number,
  time?: number
): void {
  const bus = busOf(dev);
  if (!bus) return;
  const ctx = dev.ctx;
  const t = Math.max(ctx.currentTime, time ?? ctx.currentTime);
  let map = voiceMaps.get(dev);
  if (!map) voiceMaps.set(dev, (map = new Map()));
  const exclusiveClass = Math.max(0, Math.min(127, Math.round(o.exclusiveClass ?? 0)));
  if (exclusiveClass > 0) {
    for (const active of [...(exclusiveVoiceSet(dev, exclusiveClass, false) ?? [])]) {
      if (active.startTime > t + 1e-6) continue;
      if (active.endTime <= t + 1e-6) {
        if (map.get(active.note) === active) map.delete(active.note);
        active.retire();
        continue;
      }
      stopVoice(active, t, 0.03);
      if (map.get(active.note) === active) map.delete(active.note);
    }
  }
  const prev = map.get(note);
  if (prev) {
    if (prev.endTime <= t + 1e-6) {
      map.delete(note);
      prev.retire();
    } else stopVoice(prev, t, 0.01); // re-strike
  }
  if (map.size >= MAX_VOICES) {
    const [oldNote, oldest] = map.entries().next().value as [number, Voice];
    stopVoice(oldest, t, 0.01);
    map.delete(oldNote);
  }
  const actualBuf = o.reverse ? getReversed(ctx, buffer) : buffer;
  const src = ctx.createBufferSource();
  src.buffer = actualBuf;
  src.playbackRate.value = o.rate;
  src.loop = o.loop;
  if (o.loopStart !== undefined && o.loopStart >= 0) src.loopStart = o.loopStart;
  if (o.loopEnd !== undefined && o.loopEnd > (o.loopStart ?? 0)) src.loopEnd = o.loopEnd;
  const amp = ctx.createGain();
  const peak = o.sf2DefaultVelocityAttenuation
    ? o.level * sf2DefaultVelocityAmplitude(velocity)
    : o.level * (0.15 + 0.85 * Math.max(0, Math.min(1, velocity)));
  const att = Math.max(0.002, o.attack || 0.002);
  const delay = Math.max(0, Math.min(10, o.delay ?? 0));
  const hold = Math.max(0, Math.min(10, o.hold ?? 0));
  const dec = Math.max(0.001, Math.min(10, o.decay ?? 0.25));
  const sus = Math.max(0, Math.min(1, o.sustain ?? 1)) * peak;

  amp.gain.setValueAtTime(0, t);
  const attackStart = t + delay;
  if (delay > 0) amp.gain.setValueAtTime(0, attackStart);
  const attackEnd = attackStart + att;
  amp.gain.linearRampToValueAtTime(peak, attackEnd);
  const decayStart = attackEnd + hold;
  if (hold > 0) amp.gain.setValueAtTime(peak, decayStart);
  const decayEnd = decayStart + dec;
  if (o.sf2Envelope && peak > 0) {
    const floor = Math.max(1e-8, peak * 1e-5);
    amp.gain.exponentialRampToValueAtTime(Math.max(sus, floor), decayEnd);
    if (sus < floor) amp.gain.setValueAtTime(0, decayEnd + 0.001);
  } else {
    amp.gain.linearRampToValueAtTime(sus, decayEnd);
  }

  let sourceNode: AudioNode = src;
  let filter: BiquadFilterNode | undefined;
  if (o.sf2FilterCutoffCents !== undefined) {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = Math.SQRT1_2;
    const velocity127 = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    const cutoffCents = o.sf2FilterCutoffCents - 2400 * (1 - velocity127 / 128);
    const cutoffHz = 8.176 * 2 ** (cutoffCents / 1200);
    filter.frequency.setValueAtTime(Math.max(20, Math.min(ctx.sampleRate * 0.45, cutoffHz)), t);
    sourceNode.connect(filter);
    sourceNode = filter;
  }
  sourceNode.connect(amp).connect(bus);

  const offset = Math.max(0, Math.min(actualBuf.duration - 1 / actualBuf.sampleRate, o.offset || 0));
  const sourceDuration = Math.max(0, Math.min(actualBuf.duration - offset, o.duration && o.duration > 0 ? o.duration : actualBuf.duration - offset));
  const playbackDuration = sourceDuration / Math.max(0.001, o.rate);
  const endTime = o.loop ? Infinity : t + playbackDuration;
  if (o.loop) {
    if (o.loopStart === undefined) src.loopStart = offset;
    if (o.loopEnd === undefined) src.loopEnd = offset + sourceDuration;
    src.start(t, offset);
  } else if (o.duration && o.duration > 0) {
    const rel = Math.min(playbackDuration * 0.5, Math.max(0.01, o.release || 0.05));
    src.start(t, offset, sourceDuration);
    amp.gain.setTargetAtTime(0, t + Math.max(0.005, playbackDuration - rel), Math.max(0.001, rel / 3));
  } else {
    src.start(t, offset);
  }

  const v: Voice = {
    note, src, amp, oneShot: o.oneShot, release: o.release, endTime, sf2Envelope: o.sf2Envelope === true,
    loopUntilRelease: o.loopUntilRelease === true, exclusiveClass, startTime: t, offset, rate: o.rate,
    loopStart: o.loopStart, loopEnd: o.loopEnd, filter,
    peakGain: peak, sustainGain: sus, decayTarget: o.sf2Envelope ? Math.max(sus, Math.max(1e-8, peak * 1e-5)) : sus,
    attackStart, attackEnd, decayStart, decayEnd,
    retire: () => retireExclusiveVoice(dev, v),
  };
  map.set(note, v);
  if (exclusiveClass > 0) exclusiveVoiceSet(dev, exclusiveClass, true)?.add(v);
  src.addEventListener(
    'ended',
    () => {
      if (map.get(note) === v) map.delete(note);
      if (!v.tailSource) {
        v.retire();
        amp.disconnect();
        filter?.disconnect();
      }
    },
    { once: true }
  );
}

/**
 * Wraps an instrument's noteOn / noteOff (live units: before the pitch-bend wrapper; offline
 * copies in renderSong). Assignments are looked up by device id at every note.
 */
export function installSampleVoice(dev: BaseDevice): void {
  if (wrapped.has(dev)) return;
  wrapped.add(dev);
  const noteOn = dev.noteOn.bind(dev);
  const noteOff = dev.noteOff.bind(dev);
  dev.noteOn = (note: number, velocity: number = 0.85, time?: number) => {
    const st = samples.get(dev.id);
    if (st && dev.isPowered && !dev.isBypassed) {
      // An explicit per-note edit overrides a bank only at that MIDI note.
      const pad = st.pads?.[note];
      const padBuf = pad && audioStore.get(pad.audioId)?.buffer;
      if (pad && padBuf) {
        const rate = Math.pow(2, ((pad.pitch || 0) + (pad.tune || 0) / 100) / 12);
        return play(
          dev,
          note,
          padBuf,
          {
            rate,
            level: pad.level,
            attack: pad.attack ?? 0.001,
            decay: pad.decay ?? 0.25,
            sustain: pad.sustain ?? 1,
            release: pad.release ?? 0.05,
            offset: pad.offset ?? 0,
            duration: pad.duration,
            reverse: pad.reverse ?? false,
            loop: pad.loop ?? false,
            oneShot: !pad.loop && (pad.sustain === undefined || pad.sustain === 0),
          },
          velocity,
          time
        );
      }
      const zones = st.multiSample;
      if (zones?.length) {
        const velocity127 = Math.max(1, Math.min(127, Math.round(velocity * 127)));
        const matches = zones.filter((z) => note >= z.keyLow && note <= z.keyHigh && velocity127 >= z.velLow && velocity127 <= z.velHigh);
        const zone = matches[0] ?? zones.reduce((best, candidate) => {
          const distance = (z: MultiSampleZone) => {
            const key = note < z.keyLow ? z.keyLow - note : note > z.keyHigh ? note - z.keyHigh : 0;
            const vel = velocity127 < z.velLow ? z.velLow - velocity127 : velocity127 > z.velHigh ? velocity127 - z.velHigh : 0;
            return key * 128 + vel;
          };
          return distance(candidate) < distance(best) ? candidate : best;
        });
        const buffer = audioStore.get(zone.audioId)?.buffer;
        if (buffer) {
          return play(dev, note, buffer, {
            rate: Math.pow(2, ((note - zone.root) * ((zone.scaleTuning ?? 100) / 100) + zone.tune / 100) / 12),
            level: zone.level,
            sf2FilterCutoffCents: zone.filterCutoffCents,
            sf2DefaultVelocityAttenuation: zone.sf2DefaultVelocityAttenuation,
            delay: zone.delay,
            attack: zone.attack,
            hold: keyTrackedTime(zone.hold ?? 0, zone.keyToHold ?? 0, note),
            decay: keyTrackedTime(zone.decay ?? 0.25, zone.keyToDecay ?? 0, note),
            sustain: zone.sustain,
            release: zone.release,
            sf2Envelope: true,
            loop: zone.loop,
            loopUntilRelease: zone.loopUntilRelease,
            exclusiveClass: zone.exclusiveClass,
            loopStart: zone.loopStart,
            loopEnd: zone.loopEnd,
            oneShot: false,
          }, velocity, time);
        }
      }
      const k = st.keys;
      const keyBuf = k && audioStore.get(k.audioId)?.buffer;
      if (k && keyBuf) return play(dev, note, keyBuf, { rate: Math.pow(2, (note - k.root + k.tune / 100) / 12), level: k.level, attack: k.attack, release: k.release, loop: k.loop, oneShot: false }, velocity, time);
    }
    noteOn(note, velocity, time);
  };
  dev.noteOff = (note: number, time?: number) => {
    const map = voiceMaps.get(dev);
    const v = map?.get(note);
    if (v) {
      if (!v.oneShot) {
        const releaseAt = Math.max(dev.ctx.currentTime, time ?? dev.ctx.currentTime);
        if (v.loopUntilRelease) releaseLoopUntilKeyUp(v, releaseAt, dev.ctx);
        else stopVoice(v, releaseAt, v.release);
        map!.delete(note);
      }
      return; // pads ring out
    }
    noteOff(note, time);
  };
}

// ---------------------------------------------------------------------------------------------
// project section

const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);

function parseKey(raw: unknown): KeySample | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const k = raw as Record<string, unknown>;
  if (typeof k.audioId !== 'string') return undefined;
  const d = DEFAULT_KEY_SAMPLE;
  return {
    audioId: k.audioId,
    root: Math.round(num(k.root, d.root, 0, 127)),
    tune: num(k.tune, d.tune, -100, 100),
    level: num(k.level, d.level, 0, 4),
    attack: num(k.attack, d.attack, 0.001, 5),
    release: num(k.release, d.release, 0.01, 10),
    loop: k.loop === true,
  };
}

/** Project section `deviceSamples`; `alive` filters out removed devices on save. */
export function deviceSamplesSection(alive: (id: string) => boolean) {
  return {
    save: () => Object.fromEntries([...samples].filter(([id]) => alive(id))),
    load: (data: unknown, idMap: Map<string, string>) => {
      samples.clear();
      if (data && typeof data === 'object') {
        for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
          if (!raw || typeof raw !== 'object') continue;
          const r = raw as Record<string, unknown>;
          const st: DeviceSampleState = {};
          const keys = parseKey(r.keys);
          if (keys) st.keys = keys;
          if (r.pads && typeof r.pads === 'object') {
            const pads: Record<number, PadSample> = {};
            for (const [n, p] of Object.entries(r.pads as Record<string, unknown>)) {
              const pp = p as Record<string, unknown> | null;
              const note = Number(n);
              if (!pp || typeof pp.audioId !== 'string' || !Number.isInteger(note) || note < 0 || note > 127) continue;
              const pad: PadSample = { audioId: pp.audioId, level: num(pp.level, 1, 0, 4) };
              if (typeof pp.offset === 'number') pad.offset = num(pp.offset, 0, 0, 3600);
              if (typeof pp.duration === 'number') pad.duration = num(pp.duration, 0, 0, 3600);
              if (typeof pp.pitch === 'number') pad.pitch = num(pp.pitch, 0, -48, 48);
              if (typeof pp.tune === 'number') pad.tune = num(pp.tune, 0, -1200, 1200);
              if (typeof pp.reverse === 'boolean') pad.reverse = pp.reverse;
              if (typeof pp.loop === 'boolean') pad.loop = pp.loop;
              if (typeof pp.attack === 'number') pad.attack = num(pp.attack, 0.002, 0, 30);
              if (typeof pp.decay === 'number') pad.decay = num(pp.decay, 0.25, 0, 30);
              if (typeof pp.sustain === 'number') pad.sustain = num(pp.sustain, 1, 0, 1);
              if (typeof pp.release === 'number') pad.release = num(pp.release, 0.05, 0, 30);
              pads[note] = pad;
            }
            if (Object.keys(pads).length) st.pads = pads;
          }
          if (Array.isArray(r.multiSample)) {
            const zones = r.multiSample.flatMap((zone): MultiSampleZone[] => {
              if (!zone || typeof zone !== 'object') return [];
              const z = zone as Record<string, unknown>;
              if (typeof z.audioId !== 'string') return [];
              return [{
                audioId: z.audioId,
                keyLow: Math.round(num(z.keyLow, 0, 0, 127)),
                keyHigh: Math.round(num(z.keyHigh, 127, 0, 127)),
                velLow: Math.round(num(z.velLow, 0, 0, 127)),
                velHigh: Math.round(num(z.velHigh, 127, 0, 127)),
                root: Math.round(num(z.root, 60, 0, 127)),
                tune: num(z.tune, 0, -2400, 2400),
                level: num(z.level, 1, 0, 4),
                delay: num(z.delay, 0.001, 0, 10),
                attack: num(z.attack, 0.001, 0.001, 10),
                hold: num(z.hold, 0.001, 0, 10),
                decay: num(z.decay, 0.001, 0.001, 10),
                sustain: num(z.sustain, 1, 0, 1),
                release: num(z.release, 0.25, 0.001, 10),
                keyToHold: num(z.keyToHold, 0, -1200, 1200),
                keyToDecay: num(z.keyToDecay, 0, -1200, 1200),
                ...(typeof z.scaleTuning === 'number' ? { scaleTuning: num(z.scaleTuning, 100, 0, 1200) } : {}),
                ...(typeof z.filterCutoffCents === 'number' ? { filterCutoffCents: num(z.filterCutoffCents, 13500, 1500, 13500) } : {}),
                ...(z.sf2DefaultVelocityAttenuation === true ? { sf2DefaultVelocityAttenuation: true } : {}),
                ...(num(z.exclusiveClass, 0, 0, 127) > 0 ? { exclusiveClass: Math.round(num(z.exclusiveClass, 0, 0, 127)) } : {}),
                loop: z.loop === true,
                ...(typeof z.loopStart === 'number' ? { loopStart: num(z.loopStart, 0, 0, 3600) } : {}),
                ...(typeof z.loopEnd === 'number' ? { loopEnd: num(z.loopEnd, 0, 0, 3600) } : {}),
                ...(z.loopUntilRelease === true ? { loopUntilRelease: true } : {}),
              }];
            }).filter((zone) => zone.keyLow <= zone.keyHigh && zone.velLow <= zone.velHigh);
            if (zones.length) st.multiSample = zones;
          }
          if (st.keys || st.pads || st.multiSample) samples.set(idMap.get(id) ?? id, st);
        }
      }
      void audioStore.ensure(deviceSampleAudioIds());
      bump();
    },
  };
}
