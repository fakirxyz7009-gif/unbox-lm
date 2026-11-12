/**
 * Rack unit for a library plugin or instrument (types vst_effect / vst_instrument).
 * Native plugin binaries can't run inside Web Audio, so the unit renders a category-matched proxy
 * (proxyDsp.ts). Ports, cables, CV and the AI treat it like any other device; a future native
 * host would replace only the proxy inside this class.
 */
import { BaseDevice } from '../audio/BaseDevice.ts';
import type { PortDefinition } from '../audio/types.ts';
import { vstPortLayout } from '../../shared/rack/builtinCatalog.ts';
import type { MacroSpec, MountableItem, PresetItem, SoundCategory, UnitRole, VstManifest } from '../../shared/vst/manifestTypes.ts';
import { createEffectProxy, createInstrumentProxy, defaultMixFor, presetVoicing, type EffectProxy, type InstrumentProxy, type Macros } from './proxyDsp.ts';
import { vstLibrary } from './libraryClient.ts';

/** Everything needed to rebuild a unit without the manifest (stored in project files). */
export interface VstUnitSnapshot {
  itemId: string;
  kind: 'plugin' | 'instrument';
  name: string;
  vendor?: string;
  /** VST3 / VST2 / AAX / CLAP / Kontakt / Library */
  format: string;
  arch?: string;
  engine?: string;
  role: UnitRole;
  category: SoundCategory;
  macros: MacroSpec[];
  hostable: boolean;
  hostIssue?: string;
  path: string;
  previewId?: string;
  presets: { id: string; name: string; group?: string; previewId?: string }[];
}

export function snapshotFromItem(item: MountableItem, manifest: VstManifest | null): VstUnitSnapshot {
  const presets = (manifest?.items ?? [])
    .filter((p): p is PresetItem => p.kind === 'preset' && p.targetId === item.id && !p.duplicateOf)
    .map((p) => ({ id: p.id, name: p.name, group: p.group, previewId: p.previewId }));
  if (item.kind === 'plugin') {
    return {
      itemId: item.id, kind: 'plugin', name: item.name, vendor: item.vendor, format: item.format.toUpperCase(), arch: item.arch,
      role: item.role, category: item.category, macros: item.macros, hostable: item.hostable, hostIssue: item.hostIssue,
      path: item.path, presets,
    };
  }
  return {
    itemId: item.id, kind: 'instrument', name: item.name, vendor: item.vendor, format: item.format === 'kontakt' ? 'Kontakt' : 'Library',
    engine: item.engine, role: 'instrument', category: item.category, macros: item.macros, hostable: false,
    hostIssue: `Needs ${item.engine}`, path: item.path, previewId: item.previewId, presets,
  };
}

const MACRO_KEYS = ['macro1', 'macro2', 'macro3', 'macro4'] as const;

export class VstPluginDevice extends BaseDevice {
  readonly snapshot: VstUnitSnapshot;
  readonly role: UnitRole;
  readonly proxyLabel: string;

  private readonly effect: EffectProxy | null = null;
  private readonly instrument: InstrumentProxy | null = null;
  private readonly inputL: GainNode;
  private readonly inputR: GainNode;
  private readonly merger: ChannelMergerNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly sum: GainNode;
  private readonly out: GainNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly previewBus: GainNode;
  private readonly envBuf: Float32Array<ArrayBuffer>;
  private envValue = 0;
  private cvOffsets: Macros = [0, 0, 0, 0];
  private cvMix = 0;
  private gateNote: number | null = null;
  private pitchCv = 0;
  private preview: AudioBufferSourceNode | null = null;
  private powered = true;
  private bypassed = false;

  constructor(ctx: AudioContext, id: string, name: string, snapshot: VstUnitSnapshot, presetId?: string) {
    super(ctx, id, name, snapshot.role === 'effect' ? 'vst_effect' : 'vst_instrument', 2);
    this.snapshot = snapshot;
    this.role = snapshot.role;

    this.inputL = ctx.createGain();
    this.inputR = ctx.createGain();
    this.merger = ctx.createChannelMerger(2);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.sum = ctx.createGain();
    this.out = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.previewBus = ctx.createGain();
    this.envBuf = new Float32Array(this.analyser.fftSize);

    const outL = ctx.createGain();
    const outR = ctx.createGain();
    this.sum.connect(this.out);
    this.out.connect(this.splitter);
    this.out.connect(this.analyser);
    this.splitter.connect(outL, 0);
    this.splitter.connect(outR, 1);
    this.previewBus.connect(this.sum);
    this.wet.connect(this.sum);
    this.audioOutputs.set('out_l', outL);
    this.audioOutputs.set('out_r', outR);

    if (snapshot.role === 'effect') {
      this.effect = createEffectProxy(ctx, snapshot.category);
      this.proxyLabel = this.effect.label;
      this.inputL.connect(this.merger, 0, 0);
      this.inputR.connect(this.merger, 0, 1);
      this.merger.connect(this.dry);
      this.merger.connect(this.effect.input);
      this.effect.output.connect(this.wet);
      this.dry.connect(this.sum);
      this.audioInputs.set('in_l', this.inputL);
      this.audioInputs.set('in_r', this.inputR);
    } else {
      this.instrument = createInstrumentProxy(ctx, snapshot.category);
      this.proxyLabel = this.instrument.label;
      this.instrument.output.connect(this.wet);
    }

    this.params = {
      ...Object.fromEntries(MACRO_KEYS.map((k, i) => [k, snapshot.macros[i]?.default ?? 0.5])),
      mix: snapshot.role === 'effect' ? defaultMixFor(snapshot.category) : 1,
      output: 0.9,
      presetId: '',
    };
    this.ports = this.buildPorts();
    this.wireCv();

    // Existing UI code toggles isPowered / isBypassed as plain fields; mirror them into the graph.
    this.powered = this.isPowered;
    this.bypassed = this.isBypassed;
    Object.defineProperty(this, 'isPowered', {
      get: () => this.powered,
      set: (v: boolean) => {
        this.powered = v;
        this.syncGains();
      },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(this, 'isBypassed', {
      get: () => this.bypassed,
      set: (v: boolean) => {
        this.bypassed = v;
        this.syncGains();
      },
      enumerable: true,
      configurable: true,
    });

    this.applyMacros();
    this.syncGains();
    if (presetId) this.setParam('presetId', presetId);
  }

  get macroSpecs(): MacroSpec[] {
    return this.snapshot.macros;
  }

  get currentPreset(): VstUnitSnapshot['presets'][number] | undefined {
    return this.snapshot.presets.find((p) => p.id === this.params.presetId);
  }

  /** Preview of the selected preset, else of the instrument itself. */
  get previewId(): string | undefined {
    return this.currentPreset?.previewId ?? this.snapshot.previewId;
  }

  get isPreviewing(): boolean {
    return this.preview !== null;
  }

  private buildPorts(): PortDefinition[] {
    const layout = vstPortLayout(this.role);
    const label = (port: string): string => {
      const macro = /^cv_m(\d)$/.exec(port);
      if (macro) return `${this.snapshot.macros[Number(macro[1]) - 1]?.label ?? `Macro ${macro[1]}`} CV`;
      return ({ cv_mix: 'Mix CV', cv_gate: 'Gate CV', cv_pitch: 'Pitch CV', env_out: 'Envelope CV Out' } as Record<string, string>)[port] ?? port;
    };
    const ports: PortDefinition[] = [];
    if (layout.audioIn) {
      ports.push({ id: 'in_l', name: 'Audio In L', type: 'audio_in', channel: 'left' }, { id: 'in_r', name: 'Audio In R', type: 'audio_in', channel: 'right' });
    }
    ports.push({ id: 'out_l', name: 'Audio Out L', type: 'audio_out', channel: 'left' }, { id: 'out_r', name: 'Audio Out R', type: 'audio_out', channel: 'right' });
    layout.cvIn.forEach((id) => ports.push({ id, name: label(id), type: 'cv_in' }));
    layout.cvOut.forEach((id) => ports.push({ id, name: label(id), type: 'cv_out', description: 'Follows the unit output level (0..1)' }));
    return ports;
  }

  private wireCv(): void {
    MACRO_KEYS.forEach((_, i) => {
      this.cvInputs.set(`cv_m${i + 1}`, {
        setter: (v: number) => {
          this.cvOffsets[i] = Math.max(-1, Math.min(1, v)) * 0.5;
          this.applyMacros();
        },
      });
    });
    if (this.role === 'effect') {
      this.cvInputs.set('cv_mix', {
        setter: (v: number) => {
          this.cvMix = Math.max(-1, Math.min(1, v)) * 0.5;
          this.syncGains();
        },
      });
    } else {
      this.cvInputs.set('cv_pitch', { setter: (semis: number) => (this.pitchCv = Math.round(semis)) });
      this.cvInputs.set('cv_gate', {
        setter: (gate: number) => {
          if (gate > 0.5 && this.gateNote === null) {
            this.gateNote = Math.max(0, Math.min(127, 60 + this.pitchCv));
            this.noteOn(this.gateNote, 0.85);
          } else if (gate <= 0.5 && this.gateNote !== null) {
            this.noteOff(this.gateNote);
            this.gateNote = null;
          }
        },
      });
    }
    this.cvOutputs.set('env_out', {
      getter: () => {
        this.analyser.getFloatTimeDomainData(this.envBuf);
        let sum = 0;
        for (let i = 0; i < this.envBuf.length; i++) sum += this.envBuf[i] * this.envBuf[i];
        const rms = Math.sqrt(sum / this.envBuf.length);
        this.envValue += (Math.min(1, rms * 4) - this.envValue) * 0.3;
        return this.envValue;
      },
    });
  }

  private applyMacros(): void {
    const m = MACRO_KEYS.map((k, i) => Math.max(0, Math.min(1, Number(this.params[k]) + this.cvOffsets[i]))) as Macros;
    (this.effect ?? this.instrument)?.setMacros(m);
  }

  private syncGains(): void {
    const now = this.ctx.currentTime;
    const mix = Math.max(0, Math.min(1, Number(this.params.mix) + this.cvMix));
    const active = this.powered && !this.bypassed;
    if (this.role === 'effect') {
      // Bypass passes the dry signal; power off silences the unit like unplugged hardware.
      this.wet.gain.setTargetAtTime(active ? mix : 0, now, 0.015);
      this.dry.gain.setTargetAtTime(this.powered ? (this.bypassed ? 1 : 1 - mix) : 0, now, 0.015);
    } else {
      this.wet.gain.setTargetAtTime(active ? 1 : 0, now, 0.015);
    }
    this.out.gain.setTargetAtTime(this.powered ? Math.max(0, Math.min(1.5, Number(this.params.output))) : 0, now, 0.015);
  }

  public setParam(key: string, value: unknown): void {
    if ((MACRO_KEYS as readonly string[]).includes(key)) {
      this.params[key] = Math.max(0, Math.min(1, Number(value) || 0));
      this.applyMacros();
    } else if (key === 'mix' || key === 'output') {
      this.params[key] = Math.max(0, Math.min(key === 'mix' ? 1 : 1.5, Number(value) || 0));
      this.syncGains();
    } else if (key === 'presetId') {
      const preset = this.snapshot.presets.find((p) => p.id === value);
      this.params.presetId = preset ? preset.id : '';
      if (preset) {
        Object.entries(presetVoicing(this.snapshot.category, preset.name, preset.group)).forEach(([slot, v]) => {
          this.params[MACRO_KEYS[Number(slot)]] = v;
        });
        this.applyMacros();
      }
    } else {
      this.params[key] = value;
    }
  }

  public noteOn(midi: number, velocity = 0.85, time: number = this.ctx.currentTime): void {
    if (!this.powered || this.bypassed) return;
    this.instrument?.noteOn(midi, velocity, time);
  }

  public noteOff(midi: number, time: number = this.ctx.currentTime): void {
    this.instrument?.noteOff(midi, time);
  }

  /** Play the selected preset's recorded preview through this unit's output (and its cables). */
  public async togglePreview(): Promise<boolean> {
    if (this.preview) {
      this.stopPreview();
      return false;
    }
    const id = this.previewId;
    if (!id) return false;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const buffer = await vstLibrary.decode(id, this.ctx);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.previewBus);
    src.onended = () => {
      if (this.preview === src) this.preview = null;
      src.disconnect();
    };
    src.start();
    this.preview = src;
    return true;
  }

  public stopPreview(): void {
    try {
      this.preview?.stop();
    } catch {
      // already stopped
    }
    this.preview = null;
  }

  /**
   * Replays saved params. Choosing a preset voices the macros, so the preset goes first: replayed
   * in key order it would come after the macros and overwrite the values saved with them.
   */
  public restoreParams(params: Record<string, unknown>): void {
    if (typeof params.presetId === 'string') this.setParam('presetId', params.presetId);
    Object.entries(params).forEach(([k, v]) => {
      if (k !== 'presetId' && typeof v === 'number') this.setParam(k, v);
    });
  }

  public cloneForOfflineContext(ctx: BaseAudioContext): VstPluginDevice {
    const clone = new VstPluginDevice(ctx as AudioContext, this.id, this.name, this.snapshot);
    clone.restoreParams(this.params);
    return clone;
  }

  /** Data stored in project files to rebuild this unit. */
  public toProjectData(): { snapshot: VstUnitSnapshot; params: Record<string, unknown> } {
    return { snapshot: this.snapshot, params: { ...this.params } };
  }

  public dispose(): void {
    this.stopPreview();
    this.instrument?.allNotesOff(this.ctx.currentTime);
    this.effect?.dispose();
    this.instrument?.dispose();
    [this.inputL, this.inputR, this.merger, this.dry, this.wet, this.sum, this.out, this.splitter, this.previewBus].forEach((n) => n.disconnect());
    super.dispose();
  }
}
