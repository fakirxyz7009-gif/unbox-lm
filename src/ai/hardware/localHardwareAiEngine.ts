/**
 * localHardwareAiEngine.ts
 *
 * The Co-Pilot's on-device engine. Everything here runs on this computer, as keyword rules and the
 * offline rack planner; the music assistant asks a local Ollama model instead when one is running.
 * WebGPU is only probed, to show the graphics adapter: no model or shader runs on it, so the UI
 * must not claim GPU or neural processing.
 *
 * Provides:
 *  - Rack Building (AI Combinator)
 *  - Device Preset Crafting
 *  - Sequencer Note Generation & Pattern Transforms
 *  - Acoustic Mix & Master Analysis
 */

import type { BaseDevice } from '../../audio/BaseDevice.ts';
import type { RackPatchPlan } from '../../../shared/rack/patchPlan.ts';
import { planLocally } from '../../../shared/rack/localPlanner.ts';
import { vstLibrary } from '../../vst/libraryClient.ts';
import { localPreset, validatePreset, type CraftedPreset } from '../../../shared/rack/presetCraft.ts';
import { deviceParams } from '../../audio/deviceParams.ts';
import { audioGenerationRequestRejection, type AssistantAction, type AssistantContext, type AssistantNote } from '../../../shared/localAi/assistant.ts';
import { askLocalAi, fetchLocalAiStatus } from '../localAiClient.ts';
import type { MixAnalysis, MasterTarget } from '../../audio/mastering/assistant.ts';
import type { AutoPoint } from '../../audio/automation/model.ts';
import {
  generateMasteringEngineeringReport,
  generateTrainedAutomationPoints,
  TRAINED_SCALES,
  TRAINED_PROGRESSIONS,
  TRAINED_GROOVES,
} from './localHardwareAiTraining.ts';

export type HardwareAiBackend = 'webgpu' | 'ollama' | 'lmstudio' | 'local_neural_cpu';

export interface GpuHardwareInfo {
  supported: boolean;
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  backend: string;
  maxBufferSizeMb?: number;
}

export interface HardwareAiState {
  backend: HardwareAiBackend;
  gpu: GpuHardwareInfo;
  daemonOnline: boolean;
  daemonUrl: string;
  daemonModels: string[];
  selectedModel: string;
  lastLatencyMs: number;
  totalInferences: number;
  is100PercentOffline: true;
}

class LocalHardwareAiEngine {
  private static instance: LocalHardwareAiEngine | null = null;
  private listeners = new Set<() => void>();

  public state: HardwareAiState = {
    backend: 'webgpu',
    gpu: {
      supported: false,
      vendor: 'Detecting…',
      architecture: 'Universal',
      device: 'Scanning hardware…',
      description: 'Physical GPU probe in progress',
      backend: 'WebGPU / Direct3D12 / Vulkan',
    },
    daemonOnline: false,
    daemonUrl: 'http://127.0.0.1:11434',
    daemonModels: [],
    selectedModel: 'qwen2.5-coder:7b',
    lastLatencyMs: 0,
    totalInferences: 0,
    is100PercentOffline: true,
  };

  public static getInstance(): LocalHardwareAiEngine {
    if (!LocalHardwareAiEngine.instance) {
      LocalHardwareAiEngine.instance = new LocalHardwareAiEngine();
    }
    return LocalHardwareAiEngine.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      void this.probeHardware();
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  /**
   * Probes physical GPU hardware via WebGPU and local neural daemons.
   */
  public async probeHardware(): Promise<void> {
    // 1. Probe WebGPU
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          const info = adapter.info || (await (adapter as any).requestAdapterInfo?.().catch(() => null)) || {};
          const maxBufferSizeMb = adapter.limits?.maxBufferSize
            ? Math.round(adapter.limits.maxBufferSize / (1024 * 1024))
            : undefined;

          this.state.gpu = {
            supported: true,
            vendor: info.vendor || (navigator.userAgent.includes('Windows') ? 'Direct3D12 GPU' : 'Vulkan / Metal GPU'),
            architecture: info.architecture || 'Hardware Accelerated',
            device: info.device || 'Dedicated Graphics Adapter',
            description: info.description || `${info.vendor ?? 'GPU'} Shader Processor`,
            backend: 'WebGPU adapter (probed only)',
            maxBufferSizeMb,
          };
          this.state.backend = 'webgpu';
        } else {
          this.state.gpu = {
            supported: false,
            vendor: 'CPU Vector',
            architecture: 'x86_64 / ARM64',
            device: 'WASM SIMD Vector Unit',
            description: 'No discrete WebGPU adapter granted; using CPU SIMD',
            backend: 'Software Vector CPU',
          };
          this.state.backend = 'local_neural_cpu';
        }
      } catch {
        this.state.gpu = {
          supported: false,
          vendor: 'Local CPU',
          architecture: 'Universal',
          device: 'High-Performance Neural CPU',
          description: 'Local CPU fallback',
          backend: 'Local CPU',
        };
        this.state.backend = 'local_neural_cpu';
      }
    } else {
      this.state.gpu = {
        supported: false,
        vendor: 'Local CPU',
        architecture: 'Universal',
        device: 'Multi-Core CPU',
        description: 'WebGPU not present; running on Local CPU',
        backend: 'Local CPU',
      };
      this.state.backend = 'local_neural_cpu';
    }

    // 2. Probe Local Neural Daemons (Ollama / LM Studio)
    try {
      const daemonStatus = await fetchLocalAiStatus();
      if (daemonStatus?.online) {
        this.state.daemonOnline = true;
        this.state.daemonUrl = daemonStatus.url;
        this.state.daemonModels = daemonStatus.models;
        if (daemonStatus.models.length > 0 && !daemonStatus.models.includes(this.state.selectedModel)) {
          this.state.selectedModel = daemonStatus.models[0];
        }
        // If Ollama is running with models, it provides deep LLM capability
        if (!this.state.gpu.supported) {
          this.state.backend = 'ollama';
        }
      } else {
        this.state.daemonOnline = false;
      }
    } catch {
      this.state.daemonOnline = false;
    }

    this.notify();
  }

  public setBackend(backend: HardwareAiBackend): void {
    this.state.backend = backend;
    this.notify();
  }

  public setSelectedModel(model: string): void {
    this.state.selectedModel = model;
    this.notify();
  }

  /**
   * Local Hardware Rack Combinator Planner:
   * Generates a complete modular rack and patch plan using local hardware.
   */
  public async planRackOnHardware(prompt: string): Promise<{
    plan: RackPatchPlan;
    source: string;
    warnings: string[];
    latencyMs: number;
  }> {
    const start = performance.now();
    const manifest = vstLibrary.manifest ?? (await vstLibrary.load());

    // Execute through local offline planner
    const local = planLocally(prompt, manifest);
    const latency = Math.round(performance.now() - start);

    this.state.lastLatencyMs = latency;
    this.state.totalInferences++;
    this.notify();

    // the offline planner answers whatever the backend: say so
    const hardwareLabel = 'Local planner (rules)';

    return {
      plan: local.plan,
      source: hardwareLabel,
      warnings: local.warnings,
      latencyMs: latency,
    };
  }

  /**
   * Local Hardware Preset Crafter:
   * Generates device parameters locally based on acoustic and sound-design prompts.
   */
  public async craftPresetOnHardware(
    device: BaseDevice,
    prompt: string
  ): Promise<{
    preset: CraftedPreset;
    source: string;
    latencyMs: number;
  }> {
    const start = performance.now();
    const params = deviceParams(device).map(({ key, label, min, max, value, options }) => ({
      key,
      label,
      min,
      max,
      value,
      options,
    }));

    // Calculate parameter adjustments based on acoustic keywords and envelope profiling
    const crafted = localPreset(prompt, params, 'local-offline');
    const v = validatePreset(crafted.parameters, params);
    const validated: CraftedPreset = { ...crafted, parameters: v.parameters, skipped: v.skipped };
    const latency = Math.round(performance.now() - start);

    this.state.lastLatencyMs = latency;
    this.state.totalInferences++;
    this.notify();

    const hardwareLabel = 'Local keyword rules';

    return {
      preset: validated,
      source: hardwareLabel,
      latencyMs: latency,
    };
  }

  /**
   * Local Hardware Music Copilot:
   * Generates patterns, notes, chords, and musical transformations on hardware.
   */
  public async generateMusicalActionsOnHardware(
    message: string,
    context: AssistantContext
  ): Promise<{
    reply: string;
    actions: AssistantAction[];
    rejected: string[];
    source: string;
    latencyMs: number;
  }> {
    const audioRequestRejection = audioGenerationRequestRejection(message);
    if (audioRequestRejection) {
      return {
        reply: audioRequestRejection,
        actions: [],
        rejected: [audioRequestRejection],
        source: 'Local control-only policy',
        latencyMs: 0,
      };
    }
    const start = performance.now();

    // If local Ollama daemon is online and chosen, use it
    if (this.state.backend === 'ollama' && this.state.daemonOnline && this.state.daemonModels.length > 0) {
      try {
        const daemonReply = await askLocalAi({
          model: this.state.selectedModel,
          message,
          context,
        });
        const latency = Math.round(performance.now() - start);
        this.state.lastLatencyMs = latency;
        this.state.totalInferences++;
        this.notify();
        return {
          reply: daemonReply.reply,
          actions: daemonReply.actions,
          rejected: daemonReply.rejected,
          source: `Ollama (${this.state.selectedModel})`,
          latencyMs: latency,
        };
      } catch {
        // Fall back to the keyword rules
      }
    }

    // Keyword rules (deterministic)
    const lower = message.toLowerCase();
    const actions: AssistantAction[] = [];
    let textReply = 'Applied local hardware pattern generation.';

    // 1. Tempo adjustments
    const bpmMatch = lower.match(/(?:set|change|tempo|bpm)\s*(?:to)?\s*(\d{2,3})/);
    if (bpmMatch && bpmMatch[1]) {
      const bpm = parseInt(bpmMatch[1], 10);
      if (bpm >= 40 && bpm <= 240) {
        actions.push({ type: 'set_tempo', bpm });
        textReply = `Adjusted tempo to ${bpm} BPM using local hardware engine.`;
      }
    }

    // 2. Drum Groove generation
    if (lower.includes('drum') || lower.includes('beat') || lower.includes('groove') || lower.includes('rhythm')) {
      const grooveKey = lower.includes('trap')
        ? 'trap_half_time'
        : lower.includes('synth') || lower.includes('80s')
        ? 'synthwave_drive'
        : lower.includes('dnb') || lower.includes('jungle')
        ? 'drum_and_bass'
        : 'house_four_on_floor';

      const groove = TRAINED_GROOVES[grooveKey];
      const notes: AssistantNote[] = [];

      // Kick (36)
      groove.kickSteps.forEach((hit, step) => {
        if (hit) notes.push({ step, note: 36, length: 0.5, velocity: 0.95 });
      });
      // Snare / Clap (38 / 39)
      groove.snareSteps.forEach((hit, step) => {
        if (hit) notes.push({ step, note: 38, length: 0.5, velocity: 0.88 });
      });
      // Hi-Hats (42)
      groove.hihatSteps.forEach((hit, step) => {
        if (hit) notes.push({ step, note: 42, length: 0.25, velocity: step % 4 === 2 ? 0.85 : 0.65 });
      });

      actions.push({ type: 'write_notes', scope: 'pattern', replace: true, notes });
      textReply = `Generated ${groove.name} (${groove.genre}) rhythm pattern on local hardware.`;
    }
    // 3. Chord & Harmonic progression generation
    else if (lower.includes('chord') || lower.includes('progression') || lower.includes('triad')) {
      const progKey = lower.includes('pop')
        ? 'pop_anthem'
        : lower.includes('soul') || lower.includes('jazz') || lower.includes('r&b')
        ? 'neo_soul_jazz'
        : lower.includes('lofi') || lower.includes('chill')
        ? 'lofi_chill'
        : lower.includes('cinema') || lower.includes('orchestral')
        ? 'cinematic_epic'
        : 'synthwave_dark';

      const prog = TRAINED_PROGRESSIONS[progKey];
      const root = 60; // C4
      const notes: AssistantNote[] = [];
      let stepOffset = 0;

      prog.chords.forEach((chord, i) => {
        const dur = prog.durations[i] ?? 4;
        chord.forEach((interval) => {
          notes.push({
            step: stepOffset,
            note: root + interval,
            length: Math.max(1, dur - 0.5),
            velocity: 0.82,
          });
        });
        stepOffset += dur;
      });

      actions.push({ type: 'write_notes', scope: 'pattern', replace: true, notes });
      textReply = `Generated ${prog.name} (${prog.genre}) on local hardware.`;
    }
    // 4. Modal Scale / Indian Raga melody generation
    else if (lower.includes('scale') || lower.includes('raga') || lower.includes('modal') || lower.includes('melody')) {
      const scaleKey = lower.includes('yaman')
        ? 'raga_yaman'
        : lower.includes('bhairav')
        ? 'raga_bhairav'
        : lower.includes('kafi')
        ? 'raga_kafi'
        : lower.includes('dorian')
        ? 'dorian'
        : lower.includes('phrygian')
        ? 'phrygian'
        : lower.includes('lydian')
        ? 'lydian'
        : lower.includes('blues')
        ? 'blues'
        : 'minor';

      const scale = TRAINED_SCALES[scaleKey];
      const root = 60; // C4
      const notes: AssistantNote[] = [];

      // Generate melodic passage using scale degrees
      const melodicIndices = [0, 2, 4, 3, 5, 4, 6, 5, 7 % scale.intervals.length, 4, 2, 0];
      melodicIndices.forEach((deg, idx) => {
        const interval = scale.intervals[deg % scale.intervals.length] + Math.floor(deg / scale.intervals.length) * 12;
        notes.push({
          step: idx * 1.25,
          note: root + interval,
          length: 1.0,
          velocity: idx % 2 === 0 ? 0.85 : 0.72,
        });
      });

      actions.push({ type: 'write_notes', scope: 'pattern', replace: true, notes });
      textReply = `Composed melodic motif using ${scale.name} (${scale.category}) on local hardware.`;
    } else if (lower.includes('bass') || lower.includes('bassline')) {
      // Generate syncopated 16th-note electro/synthwave bassline
      const root = 36; // C2
      const pattern = [0, 0, 12, 0, 3, 0, 7, 0, 0, 0, 10, 0, 5, 0, 7, 0];
      const notes = pattern.map((semitone, step) => ({
        step,
        note: root + semitone,
        length: 0.75,
        velocity: step % 4 === 0 ? 0.95 : 0.75,
      }));
      actions.push({ type: 'write_notes', scope: 'pattern', replace: true, notes });
      textReply = `Generated 16th-note driving bassline on local hardware.`;
    } else if (lower.includes('arp') || lower.includes('arpeggio')) {
      // 16th note upward-downward arpeggiator
      const root = 60;
      const arpNotes = [0, 3, 7, 12, 15, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3];
      const notes = arpNotes.map((semi, step) => ({
        step,
        note: root + semi,
        length: 0.8,
        velocity: 0.82,
      }));
      actions.push({ type: 'write_notes', scope: 'pattern', replace: true, notes });
      textReply = `Synthesized 16th-note melodic arpeggio on local hardware.`;
    } else if (lower.includes('humanize')) {
      actions.push({ type: 'transform_notes', scope: 'pattern', op: 'humanize', semitones: 0 });
      textReply = `Humanized note micro-timing and velocities on local hardware.`;
    } else if (lower.includes('reverse')) {
      actions.push({ type: 'transform_notes', scope: 'pattern', op: 'reverse', semitones: 0 });
      textReply = `Reversed melodic sequence on local hardware.`;
    } else if (lower.includes('transpose') || lower.includes('octave')) {
      const up = lower.includes('up') || !lower.includes('down');
      const semitones = lower.includes('octave') ? (up ? 12 : -12) : up ? 2 : -2;
      actions.push({ type: 'transform_notes', scope: 'pattern', op: 'transpose', semitones });
      textReply = `Transposed sequence by ${semitones > 0 ? `+${semitones}` : semitones} semitones on local hardware.`;
    }

    const latency = Math.round(performance.now() - start);
    this.state.lastLatencyMs = latency;
    this.state.totalInferences++;
    this.notify();

    return {
      reply: textReply,
      actions,
      rejected: [],
      source: 'Local rules',
      latencyMs: latency,
    };
  }

  /**
   * Local Hardware Acoustic Mix & Master Assistant:
   * Analyzes offline rendered song measurements and outputs engineering notes & tips.
   */
  public analyzeAndMasterOnHardware(
    m: MixAnalysis,
    target: MasterTarget
  ): {
    summary: string;
    tips: string[];
    source: string;
    latencyMs: number;
  } {
    const start = performance.now();
    const rep = generateMasteringEngineeringReport(m, target);
    const latency = Math.round(performance.now() - start);

    this.state.lastLatencyMs = latency;
    this.state.totalInferences++;
    this.notify();

    return {
      summary: rep.summary,
      tips: rep.tips,
      source: 'Local rules (measured mix)',
      latencyMs: latency,
    };
  }

  /**
   * Local Hardware Automation Curve Generator:
   * Creates calibrated macro automation points (sidechain pumps, riser sweeps, LFO wobbles).
   */
  public generateAutomationOnHardware(
    curveType: 'sidechain_pump' | 'riser_sweep' | 'lfo_wobble' | 'fade_in',
    bars = 4
  ): {
    points: AutoPoint[];
    latencyMs: number;
  } {
    const start = performance.now();
    const points = generateTrainedAutomationPoints(curveType, bars);
    const latency = Math.round(performance.now() - start);

    this.state.lastLatencyMs = latency;
    this.state.totalInferences++;
    this.notify();

    return { points, latencyMs: latency };
  }
}

export const localHardwareAi = LocalHardwareAiEngine.getInstance();
