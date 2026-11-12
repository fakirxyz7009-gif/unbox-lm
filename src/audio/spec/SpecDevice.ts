/**
 * Rack device built from a DeviceSpec (shared/rack/devices) and rendered by a DSP engine.
 *
 * Graph per audio pair i:  in_l/in_r → merger → engine … engine → wet_i ─┐
 *                                            └→ dry_i (bypass / dry mix) ─┴→ level_i → splitter → out_l/out_r
 * Param values live in `params` (base); CV adds modulation on top (`p(key)` = effective value).
 */
import { BaseDevice } from '../BaseDevice.ts';
import type { DeviceType, PortDefinition } from '../types.ts';
import {
  audioInCount,
  audioOutCount,
  hasAux,
  paramDef,
  specDefaults,
  specPorts,
  type DeviceSpec,
  type ParamDef,
} from '../../../shared/rack/devices/index.ts';
import { clamp, dbToGain, setSmooth } from './dsp.ts';

/** Transport info the engines may use (set once by AudioEngine). */
export interface SpecClock {
  bpm(): number;
  isPlaying(): boolean;
  /** Audio time of song position `pos16` (16ths) if playing, else null. */
  timeOfPosition?(pos16: number): number | null;
  /**
   * Ask the engine's shared, worker-backed look-ahead scheduler to service a
   * live device while transport is stopped. The callback must schedule work at
   * AudioContext times and return false once it no longer needs service.
   * Offline clocks deliberately omit this; offline renders call onStepTick.
   */
  requestRealtime?(callback: (now: number, until: number) => boolean): () => void;
}

export interface SpecHost {
  ctx: BaseAudioContext;
  /** Stable rack identity for device-local deterministic render decisions. */
  id: string;
  spec: DeviceSpec;
  cfg: Readonly<Record<string, unknown>>;
  /** Effective (CV-modulated) value. */
  p(key: string, fallback?: number): number;
  /** Option label of a select param. */
  opt(key: string): string;
  /** Stereo input per audio pair. */
  ins: AudioNode[];
  /** Stereo sidechain / modulator input (sc_l / sc_r), if the spec has one. */
  sc: AudioNode | null;
  /** Mixer aux return. */
  ret: AudioNode | null;
  /** Stereo destinations per output pair (engine output goes here). */
  outs: AudioNode[];
  /** Mixer aux send destination. */
  aux: AudioNode | null;
  clock: SpecClock;
  /** Mod-wheel CV (instruments) and gate CV (effects with a gate input). */
  modWheel(): number;
  /** True after a live CC1 or CV modulation value has arrived. */
  modWheelTouched(): boolean;
  gateCv(): number;
  /** Ask the faceplate to re-render (structural changes only). */
  changed(): void;
}

export interface SpecEngine {
  /** Engine takes care of these generic params itself. */
  handles?: { mix?: boolean; output?: boolean; volume?: boolean };
  onParam?(key: string): void;
  noteOn?(note: number, vel: number, time: number): void;
  /** Physical key release before the sustain pedal decides when to release the sound. */
  keyRelease?(note: number, time: number): void;
  noteOff?(note: number, time: number): void;
  allNotesOff?(time: number): void;
  onStepTick?(pos: number, time: number): void;
  /** CV output values (gr_out, lfo1_out, note_cv …). */
  cv?(id: string): number;
  /** Values for faceplate displays (gain reduction dB, meters 0..1, active step …). */
  meter?(): Record<string, number>;
  /** User sample into a slot / pad (sampler, groove, loops engines). */
  loadSample?(slot: number, buffer: AudioBuffer, name: string): void;
  /** Names of user-loaded samples per slot. */
  sampleNames?(): Record<number, string>;
  /** User-loaded buffers per slot (copied into offline-export clones). */
  userBuffers?(): Map<number, AudioBuffer>;
  /** Resolves when async resources (worklets, rendered sources) are ready. */
  ready?(): Promise<void>;
  /** Player devices: note processing (see src/audio/spec/engines/players.ts). */
  player?: import('./engines/players.ts').PlayerProcessor;
  dispose?(): void;
}

export type EngineFactory = (host: SpecHost) => SpecEngine;

const NOOP_CLOCK: SpecClock = { bpm: () => 120, isPlaying: () => false };

export class SpecDevice extends BaseDevice {
  public static clock: SpecClock = NOOP_CLOCK;

  public readonly spec: DeviceSpec;
  public engine: SpecEngine;
  /** Player target (device id) — players only. */
  public target: string | null = null;
  private cvMod = new Map<string, number>();
  private host: SpecHost;
  private wet: GainNode[] = [];
  private dry: GainNode[] = [];
  private level: GainNode[] = [];
  private outStereo: GainNode[] = [];
  private powered = true;
  private bypassed = false;
  private gateNote: number | null = null;
  private modWheelWasSet = false;
  private pitchCv = 0;
  private envBuf: Float32Array<ArrayBuffer>;
  private envValue = 0;
  private listeners = new Set<() => void>();
  private readonly factory: EngineFactory;

  constructor(ctx: AudioContext, id: string, name: string, spec: DeviceSpec, factory: EngineFactory) {
    super(ctx, id, name, spec.type as DeviceType, spec.panel.units ?? 2);
    this.spec = spec;
    this.factory = factory;
    this.envBuf = new Float32Array(this.analyser.fftSize);
    this.params = { ...specDefaults(spec) };
    this.ports = specPorts(spec) as PortDefinition[];

    const ins = audioInCount(spec);
    const outs = audioOutCount(spec);
    const stereoIn: AudioNode[] = [];
    for (let i = 1; i <= ins; i++) stereoIn.push(this.makeInput(i === 1 ? 'in_l' : `in${i}_l`, i === 1 ? 'in_r' : `in${i}_r`));
    const sc = spec.ports?.sidechain ? this.makeInput('sc_l', 'sc_r') : null;
    const ret = hasAux(spec) ? this.makeInput('ret_l', 'ret_r') : null;

    const outNodes: AudioNode[] = [];
    for (let i = 1; i <= outs; i++) {
      const sum = this.stereoGain();
      const wet = this.stereoGain();
      const dry = this.stereoGain(0);
      const level = this.stereoGain();
      wet.connect(sum);
      dry.connect(sum);
      sum.connect(level);
      this.makeOutput(level, i === 1 ? 'out_l' : `out${i}_l`, i === 1 ? 'out_r' : `out${i}_r`);
      if (i === 1) level.connect(this.analyser);
      // the dry path carries the matching input (bypass / dry mix)
      const src = stereoIn[i - 1];
      if (src) src.connect(dry);
      this.wet.push(wet);
      this.dry.push(dry);
      this.level.push(level);
      this.outStereo.push(sum);
      outNodes.push(wet);
    }
    // summing devices (more inputs than outputs): bypass sums every input to out 1
    if (ins > outs && outs >= 1) for (let i = outs; i < ins; i++) stereoIn[i].connect(this.dry[0]);
    let auxNode: AudioNode | null = null;
    if (hasAux(spec)) {
      const aux = this.stereoGain();
      this.makeOutput(aux, 'aux_l', 'aux_r');
      auxNode = aux;
    }

    const self = this;
    this.host = {
      ctx,
      id: this.id,
      spec,
      cfg: spec.engineConfig ?? {},
      p: (key, fallback) => self.p(key, fallback),
      opt: (key) => self.opt(key),
      ins: stereoIn,
      sc,
      ret,
      outs: outNodes,
      aux: auxNode,
      get clock() {
        return SpecDevice.clock;
      },
      modWheel: () => self.cvValue('__mod'),
      modWheelTouched: () => self.modWheelWasSet,
      gateCv: () => self.cvValue('__gate'),
      changed: () => self.changed(),
    };
    this.engine = factory(this.host);
    this.setupCv();
    this.installPowerAccessors();
    this.syncLevels();
  }

  // ---------------------------------------------------------------- graph helpers

  private stereoGain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.channelCount = 2;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'speakers';
    g.gain.value = value;
    return g;
  }

  private makeInput(lId: string, rId: string): AudioNode {
    const l = this.ctx.createGain();
    const r = this.ctx.createGain();
    for (const g of [l, r]) {
      g.channelCount = 1;
      g.channelCountMode = 'explicit';
      g.channelInterpretation = 'speakers';
    }
    const merger = this.ctx.createChannelMerger(2);
    l.connect(merger, 0, 0);
    r.connect(merger, 0, 1);
    this.audioInputs.set(lId, l);
    this.audioInputs.set(rId, r);
    const stereo = this.stereoGain();
    merger.connect(stereo);
    return stereo;
  }

  private makeOutput(stereo: AudioNode, lId: string, rId: string): void {
    const split = this.ctx.createChannelSplitter(2);
    stereo.connect(split);
    const l = this.ctx.createGain();
    const r = this.ctx.createGain();
    split.connect(l, 0);
    split.connect(r, 1);
    this.audioOutputs.set(lId, l);
    this.audioOutputs.set(rId, r);
  }

  /** Power, bypass, generic mix / output / volume → gains. */
  private syncLevels(): void {
    const has = (k: string) => !!paramDef(this.spec, k);
    const handles = this.engine.handles ?? {};
    const isFx = this.spec.kind === 'effect' || (this.spec.kind === 'utility' && audioInCount(this.spec) > 0);
    const mix = has('mix') && !handles.mix ? clamp(this.p('mix'), 0, 1) : 1;
    const outDb = has('output') && !handles.output && this.spec.engine !== 'mixer' ? this.p('output') : 0;
    const vol = has('volume') && !handles.volume ? clamp(this.p('volume'), 0, 2) : 1;
    const level = this.powered ? dbToGain(outDb) * vol : 0;
    this.wet.forEach((w, i) => {
      setSmooth(w.gain, this.bypassed ? 0 : isFx ? mix : 1, this.ctx, 0.01);
      setSmooth(this.dry[i].gain, isFx ? (this.bypassed ? 1 : 1 - mix) : 0, this.ctx, 0.01);
      setSmooth(this.level[i].gain, this.bypassed && isFx ? (this.powered ? 1 : 0) : this.bypassed ? 0 : level, this.ctx, 0.01);
    });
  }

  private installPowerAccessors(): void {
    this.powered = this.isPowered;
    this.bypassed = this.isBypassed;
    Object.defineProperty(this, 'isPowered', {
      configurable: true,
      enumerable: true,
      get: () => this.powered,
      set: (v: boolean) => {
        this.powered = !!v;
        if (!this.powered) this.engine.allNotesOff?.(this.ctx.currentTime);
        this.syncLevels();
      },
    });
    Object.defineProperty(this, 'isBypassed', {
      configurable: true,
      enumerable: true,
      get: () => this.bypassed,
      set: (v: boolean) => {
        this.bypassed = !!v;
        this.syncLevels();
      },
    });
  }

  // ---------------------------------------------------------------- params

  /** Effective value: base + CV modulation, clamped to the param range. */
  public p(key: string, fallback = 0): number {
    const def = paramDef(this.spec, key);
    const raw = this.params[key];
    const base = typeof raw === 'number' && Number.isFinite(raw) ? raw : def ? def.default : fallback;
    const mod = this.cvMod.get(key);
    if (!def || mod === undefined || mod === 0) return base;
    return clamp(applyMod(def, base, mod), def.min, def.max);
  }

  public opt(key: string): string {
    const def = paramDef(this.spec, key);
    if (!def?.options) return '';
    return def.options[clamp(Math.round(this.p(key)), 0, def.options.length - 1)] ?? '';
  }

  public setParam(key: string, value: unknown): void {
    if (key === 'target') {
      this.target = typeof value === 'string' && value ? value : null;
      this.params.target = this.target ?? '';
      this.changed();
      return;
    }
    const def = paramDef(this.spec, key);
    if (!def) {
      // legacy keys some panels / AI plans send (e.g. 'volume' on effects): keep but ignore
      if (typeof value === 'number') this.params[key] = value;
      return;
    }
    let v = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
    if (typeof value === 'string' && def.options) {
      const idx = def.options.indexOf(value);
      if (idx >= 0) v = idx;
    }
    if (typeof value === 'boolean') v = value ? 1 : 0;
    if (!Number.isFinite(v)) return;
    v = clamp(v, def.min, def.max);
    if (def.options || def.step === 1) v = Math.round(v);
    this.params[key] = v;
    this.applyParam(key);
  }

  private applyParam(key: string): void {
    if (key === 'mix' || key === 'output' || key === 'volume') this.syncLevels();
    this.engine.onParam?.(key);
  }

  // ---------------------------------------------------------------- CV

  private setupCv(): void {
    for (const p of this.spec.params) {
      if (!p.cv) continue;
      this.cvInputs.set(`cv_${p.key}`, {
        setter: (v: number) => {
          const prev = this.cvMod.get(p.key) ?? 0;
          if (Math.abs(prev - v) < 1e-4) return;
          this.cvMod.set(p.key, v);
          this.applyParam(p.key);
        },
      });
    }
    if (this.spec.kind === 'instrument') {
      this.cvInputs.set('cv_pitch', { setter: (semis: number) => (this.pitchCv = Math.round(semis)) });
      this.cvInputs.set('cv_gate', {
        setter: (gate: number) => {
          if (gate > 0.5 && this.gateNote === null) {
            this.gateNote = clamp(60 + this.pitchCv, 0, 127);
            this.noteOn(this.gateNote, clamp(gate, 0.5, 1));
          } else if (gate <= 0.5 && this.gateNote !== null) {
            this.noteOff(this.gateNote);
            this.gateNote = null;
          }
        },
      });
      this.cvInputs.set('cv_mod', {
        setter: (v: number) => {
          this.modWheelWasSet = true;
          this.cvMod.set('__mod', v);
          this.engine.onParam?.('__mod');
        },
      });
    } else if (this.spec.ports?.cvIn?.includes('cv_gate')) {
      // effects with a gate input (ECF-42): forward as a param-like event
      this.cvInputs.set('cv_gate', {
        setter: (gate: number) => {
          this.cvMod.set('__gate', gate);
          this.engine.onParam?.('__gate');
        },
      });
    }
    for (const port of this.ports) {
      if (port.type !== 'cv_out') continue;
      if (port.id === 'env_out') this.cvOutputs.set('env_out', { getter: () => this.envelope() });
      else this.cvOutputs.set(port.id, { getter: () => this.engine.cv?.(port.id) ?? 0 });
    }
  }

  /** Raw CV value of an internal input (gate / mod wheel). */
  public cvValue(key: '__gate' | '__mod'): number {
    return this.cvMod.get(key) ?? 0;
  }

  private envelope(): number {
    this.analyser.getFloatTimeDomainData(this.envBuf);
    let sum = 0;
    for (let i = 0; i < this.envBuf.length; i++) sum += this.envBuf[i] * this.envBuf[i];
    const rms = Math.sqrt(sum / this.envBuf.length);
    this.envValue += (Math.min(1, rms * 4) - this.envValue) * 0.3;
    return this.envValue;
  }

  // ---------------------------------------------------------------- notes

  public override isPlayableInstrument(): boolean {
    return this.spec.kind === 'instrument';
  }

  public override noteOn(note: number, velocity = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.powered || (this.bypassed && this.spec.kind === 'instrument')) return;
    this.engine.noteOn?.(clamp(Math.round(note), 0, 127), clamp(velocity, 0, 1), Math.max(this.ctx.currentTime, time));
  }

  public override noteOff(note: number, time: number = this.ctx.currentTime): void {
    const noteNumber = clamp(Math.round(note), 0, 127);
    const noteTime = Math.max(this.ctx.currentTime, time);
    // Momentary switches follow physical key-up even when the sustain pedal delays voice release.
    this.keyRelease(noteNumber, noteTime);
    this.engine.noteOff?.(noteNumber, noteTime);
  }

  public keyRelease(note: number, time: number = this.ctx.currentTime): void {
    this.engine.keyRelease?.(clamp(Math.round(note), 0, 127), Math.max(this.ctx.currentTime, time));
  }

  public override triggerPad(padIndex: number, velocity = 0.9, time?: number): void {
    const pad = this.spec.pads?.[padIndex];
    if (pad) this.noteOn(pad.note, velocity, time);
  }

  public override onStepTick(step: number, time?: number): void {
    if (!this.powered) return;
    this.engine.onStepTick?.(step, time ?? this.ctx.currentTime);
  }

  public allNotesOff(): void {
    this.engine.allNotesOff?.(this.ctx.currentTime);
  }

  // ---------------------------------------------------------------- samples / meters / lifecycle

  public async loadSampleFile(slot: number, file: File): Promise<void> {
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.engine.loadSample?.(slot, buffer, file.name.replace(/\.[^.]+$/, ''));
    this.changed();
  }

  public meter(): Record<string, number> {
    return this.engine.meter?.() ?? {};
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    this.listeners.forEach((cb) => cb());
  }

  public override ready(): Promise<void> {
    return this.engine.ready?.() ?? Promise.resolve();
  }

  public override cloneForOfflineContext(ctx: BaseAudioContext): BaseDevice {
    const copy = new SpecDevice(ctx as AudioContext, this.id, this.name, this.spec, this.factory);
    for (const [k, v] of Object.entries(this.params)) copy.setParam(k, v);
    const names = this.engine.sampleNames?.() ?? {};
    const buffers = this.engine.userBuffers?.();
    if (buffers) buffers.forEach((buf, slot) => copy.engine.loadSample?.(slot, buf, names[slot] ?? 'Sample'));
    return copy;
  }

  public override dispose(): void {
    this.engine.allNotesOff?.(this.ctx.currentTime);
    this.engine.dispose?.();
    super.dispose();
  }
}

/** CV → param modulation: log params ±2 octaves per unit, linear ±half range, selects ±half the options. */
function applyMod(def: ParamDef, base: number, mod: number): number {
  if (def.options) return Math.round(base + mod * (def.options.length / 2));
  if (def.curve === 'log' && def.min > 0) return base * Math.pow(2, mod * 2);
  return base + mod * ((def.max - def.min) / 2);
}
