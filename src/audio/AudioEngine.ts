import { BaseDevice } from './BaseDevice.ts';
import { SubtractorDevice } from './devices/SubtractorDevice.ts';
import { ThorDevice } from './devices/ThorDevice.ts';
import { ThirdWaveDevice } from './devices/ThirdWaveDevice.ts';
import { EuropaDevice } from './devices/EuropaDevice.ts';
import { MonotoneDevice } from './devices/MonotoneDevice.ts';
import { RedrumDevice } from './devices/RedrumDevice.ts';
import { MimicDevice } from './devices/MimicDevice.ts';
import { MatrixDevice } from './devices/MatrixDevice.ts';
import { PulsarDevice } from './devices/PulsarDevice.ts';
import { Scream4Device } from './devices/Scream4Device.ts';
import { EchoDevice } from './devices/EchoDevice.ts';
import { RV7000Device } from './devices/RV7000Device.ts';
import { MClassMasterSuite } from './devices/MClassMasterSuite.ts';
import { SpiderAudioDevice } from './devices/SpiderAudioDevice.ts';
import { SpiderCVDevice } from './devices/SpiderCVDevice.ts';
import { ThreeOscDevice } from './devices/ThreeOscDevice.ts';
import { SytrusDevice } from './devices/SytrusDevice.ts';
import { FlexDevice } from './devices/FlexDevice.ts';
import { BansuriDevice } from './devices/BansuriDevice.ts';
import { HarmoniumDevice } from './devices/HarmoniumDevice.ts';
import { TablaDevice } from './devices/TablaDevice.ts';
import { TanpuraDroneDevice } from './devices/TanpuraDroneDevice.ts';
import { DholDevice } from './devices/DholDevice.ts';
import { TumbiDevice } from './devices/TumbiDevice.ts';
import { UniversalWorldInstrumentDevice } from './devices/UniversalWorldInstrumentDevice.ts';
import { UniversalPercussionElectronicDevice } from './devices/UniversalPercussionElectronicDevice.ts';
import { WyvernDevice } from './devices/WyvernDevice.ts';
import { EmberDevice } from './devices/EmberDevice.ts';
import { ObjektDevice, ReasonPerformanceDevice } from './devices/ReasonSynthesizersSuite.ts';
import { RV9Device, OsmiumDevice, RotorDevice, CombinatorDevice, MidiOutDevice } from './devices/ReasonEffectsAndUtilitiesSuite.ts';
import { createSpecDevice } from './spec/registry.ts';
import { SpecDevice } from './spec/SpecDevice.ts';
import { SPEC_BY_TYPE } from '../../shared/rack/devices/index.ts';
import type { NoteSink, PlayerContext } from './spec/engines/players.ts';
import { CVEngine } from './CVEngine.ts';
import { sharedAudioContext } from './AudioEngineGraph.ts';
import {
  AudioConnection,
  CVConnection,
  DeviceType,
  TelemetryData,
  SequencerTrack,
  SequencerNote,
  RackGroup,
  ArrangementClip,
  FolderClip,
  ProjectMarker,
  TrackFolder,
  SongBlock,
  SongBlockPlacement,
} from './types.ts';
import { VstPluginDevice, type VstUnitSnapshot } from '../vst/VstPluginDevice.ts';
import {
  activeHitsAt,
  TICKS_PER_16TH,
  PATTERN_COLORS,
  beatSteps,
  clampLength,
  cloneClip,
  cloneSteps,
  divisionTicks,
  findPattern,
  hitsInWindow,
  makePattern,
  newSeqId,
  normalizeTrackSequencerData,
  resolveSource,
  snapBarTo16th,
  songEndBar,
  sourceStepAt,
  stepsPerBar,
  syncTrackPatterns,
  type PlaybackMode,
  type PlaySource,
  type StepHit,
} from './sequencer/model.ts';
import { SequencerEditor } from './sequencer/editor.ts';
import { strumDelays } from './sequencer/midiTools.ts';
import { MixerController } from './mixer/MixerController.ts';
import { MonitorController } from './mixer/MonitorController.ts';
import { MixBusDevice } from './mixer/MixBusDevice.ts';
import { installBypassShim } from './mixer/bypassShim.ts';
import { installExpression, setModWheel, setPitchBend } from './expression.ts';
import { installLevelTrim, levelTrimOf } from './levelTrim.ts';
import { deviceSamplesSection, installSampleVoice } from './deviceSamples.ts';
import { AudioTrackDevice } from './clips/AudioTrackDevice.ts';
import { ClipVoices } from './clips/clipVoices.ts';
import { audioStore } from './clips/audioStore.ts';
import { audioClipRate, barsForSeconds, secPerBar } from './clips/clipMath.ts';
import { RecordController } from './recording/RecordController.ts';
import { ensureRecorderWorklet, WorkletCapture } from './recording/recorderWorklet.ts';
import { encodeWav, downloadBlob } from './export/wav.ts';
import { renderSong } from './render/renderSong.ts';
import { runExport, DEFAULT_EXPORT } from './export/exporter.ts';
import { AutomationController } from './automation/AutomationController.ts';
import { sortPoints, valueAt, type AutoLane, type AutoPoint } from './automation/model.ts';
import { MasteringChain } from './mastering/MasteringChain.ts';
import { MeterHub } from './analysis/MeterHub.ts';
import { ReferencePlayer } from './mastering/ReferencePlayer.ts';
import type { StripNodes } from './mixer/channelStrip.ts';
import { currentDeviceName } from './legacyNames.ts';
import { undoJournal } from './undoJournal.ts';
import { MidiInput } from './midi/MidiInput.ts';
import { MidiNoteLifecycle } from './midi/MidiNoteLifecycle.ts';
import { supportsDeviceType } from './deviceRegistry.ts';
import { parseImportableProject, PROJECT_FORMAT_VERSION } from '../project/projectFormat.ts';
import { anyDucking, applyDucks, isDrumBeat, type DuckHit } from './mixer/duck.ts';
import {
  ProjectTimeMap,
  TransportState,
  MarkerRegionManager,
} from './time/index.ts';

export type TrackChannelStripNodes = StripNodes;

/** Where scheduled notes go: the live rack, or cloned devices on an offline render context. */
export interface NoteRouting {
  playersFor(deviceId: string): SpecDevice[];
  /** Earliest allowed note time (the context's current time). */
  now(): number;
}

/** A module that stores its own block in project files (mixer, automation, audio clips, …). */
export interface ProjectSection {
  save(): unknown;
  /** `data` is undefined for projects without this block (reset to defaults). */
  load(data: unknown, idMap: Map<string, string>): void;
}

/**
 * Scheduler timer that runs inside a Web Worker so it is NOT throttled when the tab is
 * hidden and is not delayed by heavy React renders on the main thread.
 * Falls back to window.setInterval if Workers/Blob URLs are blocked.
 */
function createSchedulerTimer(onTick: () => void, intervalMs: number): { stop: () => void } {
  let fallbackId: number | null = null;
  const startFallback = () => {
    if (fallbackId === null) fallbackId = window.setInterval(onTick, intervalMs);
  };
  try {
    const src = `let id=null;onmessage=function(e){if(e.data==='start'){if(id)clearInterval(id);id=setInterval(function(){postMessage('tick')},${intervalMs});}else if(e.data==='stop'){if(id)clearInterval(id);id=null;}};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    worker.onerror = () => {
      worker.terminate();
      startFallback();
    };
    worker.postMessage('start');
    return {
      stop: () => {
        worker.postMessage('stop');
        worker.terminate();
        URL.revokeObjectURL(url);
        if (fallbackId !== null) {
          clearInterval(fallbackId);
          fallbackId = null;
        }
      },
    };
  } catch {
    startFallback();
    return {
      stop: () => {
        if (fallbackId !== null) clearInterval(fallbackId);
        fallbackId = null;
      },
    };
  }
}

export class AudioEngine {
  public ctx: AudioContext;
  public masterBusL: GainNode;
  public masterBusR: GainNode;
  public masterGain: GainNode;
  public masterLimiter: DynamicsCompressorNode;

  // Real Web Audio Outboard Mastering & Hardware Emulation Chain
  private outboardDeEsser!: BiquadFilterNode;
  private outboardTubeShaper!: WaveShaperNode;
  private outboardOptoComp!: DynamicsCompressorNode;
  private outboardConvolver!: ConvolverNode;
  public outboardReverbWet!: GainNode;
  private outboardBbdDelay!: DelayNode;
  private outboardBbdFilter!: BiquadFilterNode;
  private outboardBbdFeedback!: GainNode;
  public outboardBbdWet!: GainNode;
  public masterEqLow!: BiquadFilterNode;
  public masterEqMid!: BiquadFilterNode;
  public masterEqHigh!: BiquadFilterNode;
  // Neutral master by default (flat EQ, no sends): the mix should sound like the instruments.
  public masterSpectrumState = {
    low: 0.5,
    mid: 0.5,
    high: 0.5,
    width: 0.5,
    mix: 0.78,
    reverbSend: 0,
    delaySend: 0,
  };
  /** Master stereo width matrix gains [LL, RR, RL, LR]. */
  private masterWidthGains: GainNode[] = [];
  /** Final safety clipper after the limiter: transparent below -1 dBFS, never exceeds 0 dBFS. */
  private masterClipper!: WaveShaperNode;

  /** Mixer channels, buses, sends, VCAs, groups (src/audio/mixer). */
  public mixer!: MixerController;
  /** Monitor section between the master and the speakers. */
  public monitor!: MonitorController;
  /** Transient catalogue audition, routed to the monitor and never into the project or export. */
  private instrumentPreviewDevice: BaseDevice | null = null;
  private instrumentPreviewGain: GainNode | null = null;
  private instrumentPreviewSourceOutputs: GainNode[] = [];
  private instrumentPreviewNote: number | null = null;
  private instrumentPreviewCleanupTimer: number | null = null;
  private instrumentPreviewToken = 0;
  /** Audio clip playback (audio tracks). */
  public clipVoices!: ClipVoices;
  /** Audio / MIDI recording (armed tracks, count-in, punch, takes). */
  public recorder!: RecordController;
  /** Automation lanes: playback + touch / latch / write recording. */
  public automation!: AutomationController;
  /** Mastering chain on the master bus (before the safety limiter). */
  public mastering!: MasteringChain;
  /** Loudness / peak / correlation meters, spectrum and scopes. */
  public meters!: MeterHub;
  /** Reference tracks for A/B listening (monitor only). */
  public reference!: ReferencePlayer;
  /** Metronome level (linear). */
  public metronomeLevel = 0.7;
  /** Stereo input of the master bus (channel strips route here). */
  public masterInput!: GainNode;
  /** Channel strips keyed by owner device id (see MixerController). */
  public get trackChannelStrips(): Map<string, TrackChannelStripNodes> {
    return this.mixer.strips;
  }
  private projectSections = new Map<string, ProjectSection>();
  /** Registers a module's block in project files (key must be unique). */
  public registerProjectSection(key: string, section: ProjectSection): void {
    this.projectSections.set(key, section);
  }

  public analyserL: AnalyserNode;
  public analyserR: AnalyserNode;
  private analyserDataL: Float32Array;
  private analyserDataR: Float32Array;

  public devices: Map<string, BaseDevice> = new Map();
  public audioConnections: AudioConnection[] = [];
  public cvConnections: CVConnection[] = [];
  public cvEngine: CVEngine;

  // Master Sequencer Tracks (Synced with rack instruments)
  public tracks: SequencerTrack[] = [];
  public trackFolders: TrackFolder[] = [];
  /** Reusable song sections mapped to scene/pattern-bank indices. */
  public songBlocks: SongBlock[] = [];
  /** Block occurrences in the song timeline. */
  public blockPlacements: SongBlockPlacement[] = [];
  /** Pattern / clip / marker editing API (see src/audio/sequencer/editor.ts). */
  public readonly sequencer: SequencerEditor = new SequencerEditor(this);
  public patternLength: number = 16; // 16 to 512 steps
  public globalSwing: number = 0; // 0.0 to 1.0
  public activePatternIndex: number = 0; // 0..7 (PAT 1 .. PAT 8)
  public rootKey: number = 0; // 0 = C, 1 = C#, ..., 11 = B
  public scaleType: 'chromatic' | 'minor' | 'major' | 'phrygian' | 'dorian' | 'harmonic_minor' | 'pentatonic' | 'bhairav' = 'minor';

  // Core Audio Hardware & Clocking State
  public driverModel: 'ASIO' | 'CoreAudio' | 'WebAudio' = 'WebAudio';
  public bufferSize: 64 | 128 | 256 | 512 | 1024 | 2048 = 128;
  public sampleRateTarget: 44100 | 48000 | 88200 | 96000 | 192000 = 48000;
  public loopbackEnabled: boolean = false;
  public latencyCompMs: number = 2.67;
  public multiCoreThreads: number = 8;
  public metronomeEnabled: boolean = false;
  public timeSignature: '4/4' | '3/4' | '5/4' | '7/8' | '6/8' = '4/4';
  public tuningReferenceHz: number = 440; // Pitch Frequency Hz-to-MIDI Formula Converter reference (432 / 440 / 442 Hz)

  // Canonical Master Timing, Clock & Transport Subsystem (ONE CLOCK • ONE TRANSPORT • ONE TIME MAP)
  public readonly timeMap: ProjectTimeMap = new ProjectTimeMap(124, 4, 4);
  public readonly transportState: TransportState = new TransportState();
  public readonly markerRegionManager: MarkerRegionManager = new MarkerRegionManager(this.timeMap);


  // Global Modulator Engines (LFO, ADSR, Envelope Follower & Multiband Sidechain Linker)
  public lfoEngine = {
    enabled: false,
    waveform: 'sine' as 'sine' | 'triangle' | 'sawtooth' | 'square' | 's_and_h',
    rateHz: 2.0,
    syncDivision: '1/4' as '1/1' | '1/2' | '1/4' | '1/8' | '1/16',
    depth: 0.35,
    bipolar: true,
    target: 'cutoff' as 'cutoff' | 'resonance' | 'pitch' | 'pan' | 'volume',
    currentValue: 0,
  };

  public adsrEngine = {
    enabled: true,
    attackMs: 12,
    decayMs: 240,
    sustainPct: 72,
    releaseMs: 320,
  };

  public envFollowerEngine = {
    enabled: true,
    thresholdDb: -24,
    attackMs: 10,
    releaseMs: 120,
    gain: 1.35,
    invert: false,
    target: 'cutoff' as 'cutoff' | 'drive' | 'ducking',
    currentEnvelope: 0,
  };

  /** Live master loudness (written by the meter worklet; -70 = silence). */
  public lufsMetering = {
    momentary: -70,
    shortTerm: -70,
    integrated: -70,
    lra: 0,
    truePeakDbtp: -70,
    targetStandard: 'Streaming (-14 LUFS)' as 'Club (-8 LUFS)' | 'Streaming (-14 LUFS)' | 'Broadcast (-23 LUFS)',
    phaseCorrelation: 0,
    phaseAngleDeg: 0,
  };

  public multibandSidechain = {
    enabled: false,
    triggerTrackIdx: 4,
    lowCrossHz: 140,
    highCrossHz: 2800,
    lowDuckPct: 82,
    midDuckPct: 38,
    highDuckPct: 12,
  };

  public sandboxHost = {
    isolationMode: 'Strict Subprocess IPC' as 'Strict Subprocess IPC' | 'Shared Memory Fast' | 'Kernel Bridge',
    crashGuard: true,
    memoryLimitMb: 4096,
    activeSandboxes: 6,
    bufferUnderruns: 0,
  };


  // Global Macro Knobs (8 Bounded Rotary Dials) & Modulation Container Slots
  public macroKnobs = [
    { id: 'm1', name: 'MACRO 1: ROAR / DRIVE', value: 0.48, minBound: 0.1, maxBound: 0.95, targets: ['Cutoff', 'Drive'] },
    { id: 'm2', name: 'MACRO 2: WAVETABLE MORPH', value: 0.62, minBound: 0.0, maxBound: 1.0, targets: ['Morph', 'FM Depth'] },
    { id: 'm3', name: 'MACRO 3: THERMAL DRIFT', value: 0.35, minBound: 0.05, maxBound: 0.85, targets: ['Detune', 'Formant'] },
    { id: 'm4', name: 'MACRO 4: SUB HARMONICS', value: 0.70, minBound: 0.2, maxBound: 1.0, targets: ['Sub Level', 'Resonance'] },
    { id: 'm5', name: 'MACRO 5: REVERB SPACE', value: 0.42, minBound: 0.0, maxBound: 0.9, targets: ['Reverb Mix', 'Decay'] },
    { id: 'm6', name: 'MACRO 6: STEREO WIDTH', value: 0.55, minBound: 0.1, maxBound: 1.0, targets: ['Pan Spread', 'Chorus'] },
    { id: 'm7', name: 'MACRO 7: TRANSIENT SNAP', value: 0.65, minBound: 0.15, maxBound: 0.95, targets: ['Attack', 'Compression'] },
    { id: 'm8', name: 'MACRO 8: MASTER GLUE', value: 0.50, minBound: 0.0, maxBound: 1.0, targets: ['Bus Comp', 'Limiter'] },
  ];

  public modulationContainers = [
    { id: 'slot1', name: 'MOD SLOT 1', source: 'Global LFO (Sine)', target: 'Wyvern / Active Filter Cutoff', depth: 0.55, active: true },
    { id: 'slot2', name: 'MOD SLOT 2', source: 'ADSR Envelope Gen', target: 'Ember Formant & Wavetable Morph', depth: 0.42, active: true },
    { id: 'slot3', name: 'MOD SLOT 3', source: 'Envelope Follower', target: 'Multiband Sidechain Ducking', depth: 0.68, active: true },
    { id: 'slot4', name: 'MOD SLOT 4', source: 'MPE Slide / Timbre', target: 'Resonance & Comb Peaking', depth: 0.48, active: true },
  ];

  // Master Transport & Sequencer Song/Arrangement Playback Detector State
  public bpm: number = 124;
  public isPlaying: boolean = false;
  public isRecording: boolean = false;
  /** Song mode: wrap from the R locator back to L. Off: playback stops at the song end. */
  public loopEnabled: boolean = true;
  /** Loop locators in bars (L inclusive, R exclusive). */
  public loopStartBar: number = 0;
  public loopEndBar: number = 4;
  /** While true, R follows the song end (moving a locator turns this off). */
  public loopFollowsSong: boolean = true;
  /** Legacy playhead: song position modulo the default pattern length (pattern step grids use playheadFor()). */
  public currentStep: number = 0;
  /** 'song_arrangement' plays clips; 'pattern_loop' loops every track's active pattern. */
  public playbackMode: PlaybackMode = 'song_arrangement';
  /** Resume held MIDI notes when playback starts or seeks into their duration. */
  public noteChaseEnabled = true;
  /** Next 16th the scheduler will play (absolute, from bar 1 = 0). */
  public songPosition: number = 0;
  public currentSongBar: number = 0;
  /** Bars the arrangement timeline shows at least ("+ Bars" grows it; clips grow it automatically). */
  public arrangementMinBars: number = 32;
  public arrangementMarkers: ProjectMarker[] = [];
  public activeArrangementSection: string = 'BAR 1';
  /** (audio time, song position) of recently scheduled 16ths, for an exact audible playhead. */
  private playheadQueue: { time: number; pos: number }[] = [];
  private pendingStopTime: number | null = null;
  private chaseNextStep = false;
  public detectedEvents: {
    id: string;
    trackId: string;
    trackName: string;
    deviceType: string;
    noteName: string;
    midi: number;
    freqHz: number;
    velocity: number;
    bar: number;
    step: number;
    clipName: string;
    color: string;
    timestamp: number;
  }[] = [];
  private workerTimer: { stop: () => void } | null = null;
  /**
   * Device-local look-ahead jobs (granular voices, held note-repeat pads, ...)
   * share one worker-backed timer when the transport is stopped. This keeps
   * musical scheduling tied to AudioContext time without each device creating
   * its own window interval.
   */
  private realtimeTasks = new Set<(now: number, until: number) => boolean>();
  private realtimeTimer: { stop: () => void } | null = null;
  private nextNoteTime: number = 0;
  private scheduleAheadTime: number = 0.12;
  private lookaheadMs: number = 25;


  // Master telemetry
  public telemetry: TelemetryData = {
    rmsL: 0,
    rmsR: 0,
    peakL: 0,
    peakR: 0,
    gainReductionDb: 0,
    currentStep: 0,
    bpm: 124,
    isPlaying: false,
    isRecording: false,
    audioTime: 0,
  };

  private listeners: Set<() => void> = new Set();

  public midiToFreq(midi: number): number {
    const refHz = this.tuningReferenceHz || 440;
    return Math.max(20, Math.min(18000, refHz * Math.pow(2, (midi - 69) / 12)));
  }

  public normalizeCutoffToHz(val: number): number {
    const n = Number(val);
    if (isNaN(n)) return 2400;
    if (n <= 1.5) {
      return Math.round(60 * Math.pow(260, Math.max(0.02, Math.min(1.0, n))));
    }
    return Math.max(40, Math.min(18000, n));
  }

  constructor() {
    this.ctx = sharedAudioContext;
    undoJournal.beforePush = () => this.flushPendingUndo();
    // Tempo / transport for spec devices (synced delays, arps, gates, Run mode loops)
    SpecDevice.clock = {
      bpm: () => this.bpm,
      isPlaying: () => this.isPlaying,
      timeOfPosition: (pos16: number) => (this.isPlaying ? this.nextNoteTime + (pos16 - this.songPosition) * (60 / this.bpm / 4) : null),
      requestRealtime: (callback) => this.requestRealtime(callback),
    };

    this.cvEngine = new CVEngine();

    // Master Bus Nodes
    this.masterBusL = this.ctx.createGain();
    this.masterBusR = this.ctx.createGain();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-0.5, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.08, this.ctx.currentTime);

    // Master Analysers for VU metering
    this.analyserL = this.ctx.createAnalyser();
    this.analyserR = this.ctx.createAnalyser();
    this.analyserL.fftSize = 256;
    this.analyserR.fftSize = 256;
    this.analyserDataL = new Float32Array(this.analyserL.fftSize);
    this.analyserDataR = new Float32Array(this.analyserR.fftSize);


    // Master sum
    const merger = this.ctx.createChannelMerger(2);
    this.masterBusL.connect(merger, 0, 0);
    this.masterBusR.connect(merger, 0, 1);
    this.masterInput = this.ctx.createGain();
    this.masterInput.channelCount = 2;
    this.masterInput.channelCountMode = 'explicit';
    const masterSplit = this.ctx.createChannelSplitter(2);
    this.masterInput.connect(masterSplit);
    masterSplit.connect(this.masterBusL, 0);
    masterSplit.connect(this.masterBusR, 1);
    this.mixer = new MixerController(this);
    this.monitor = new MonitorController(this.ctx);
    this.clipVoices = new ClipVoices(this.ctx);
    this.recorder = new RecordController(this);
    this.automation = new AutomationController(this);
    this.registerProjectSection('automation', this.automation);
    this.registerProjectSection('mastering', { save: () => this.mastering.save(), load: (d) => this.mastering.load(d) });
    this.registerProjectSection('mixer', this.mixer);
    this.registerProjectSection('deviceSamples', deviceSamplesSection((id) => this.devices.has(id)));
    this.registerProjectSection('projectTime', {
      save: () => ({
        timeMap: this.timeMap.serialize(),
        transport: this.transportState.serialize(),
        markers: this.markerRegionManager.serialize(),
      }),
      load: (data) => {
        if (data && typeof data === 'object') {
          const d = data as { timeMap?: unknown; transport?: unknown; markers?: unknown };
          if (d.timeMap) this.timeMap.deserialize(d.timeMap);
          if (d.transport) this.transportState.deserialize(d.transport);
          if (d.markers) this.markerRegionManager.deserialize(d.markers);
          this.bpm = this.timeMap.tempoMap.defaultBpm;
          const rootMeter = this.timeMap.meterMap.defaultMeter;
          const sig = `${rootMeter.numerator}/${rootMeter.denominator}`;
          if (['4/4', '3/4', '5/4', '7/8', '6/8'].includes(sig)) {
            this.timeSignature = sig as any;
          }
        }
      },
    });

    // Real Web Audio Outboard Mastering & Hardware Emulation Chain
    this.outboardDeEsser = this.ctx.createBiquadFilter();
    this.outboardDeEsser.type = 'peaking';
    this.outboardDeEsser.frequency.value = 6800;
    this.outboardDeEsser.Q.value = 2.4;
    this.outboardDeEsser.gain.value = 0;

    this.outboardTubeShaper = this.ctx.createWaveShaper();
    this.outboardTubeShaper.oversample = '2x';

    this.outboardOptoComp = this.ctx.createDynamicsCompressor();
    this.outboardOptoComp.threshold.value = -16;
    this.outboardOptoComp.knee.value = 12;
    this.outboardOptoComp.ratio.value = 3.5;
    this.outboardOptoComp.attack.value = 0.015;
    this.outboardOptoComp.release.value = 0.25;

    this.outboardConvolver = this.ctx.createConvolver();
    this.outboardConvolver.buffer = this.buildImpulseResponse(this.ctx, 1.85, 2.8);
    this.outboardReverbWet = this.ctx.createGain();
    this.outboardReverbWet.gain.value = 0.16;

    this.outboardBbdDelay = this.ctx.createDelay(2.0);
    this.outboardBbdDelay.delayTime.value = 0.28;
    this.outboardBbdFeedback = this.ctx.createGain();
    this.outboardBbdFeedback.gain.value = 0.28;
    this.outboardBbdFilter = this.ctx.createBiquadFilter();
    this.outboardBbdFilter.type = 'lowpass';
    this.outboardBbdFilter.frequency.value = 3200;
    this.outboardBbdWet = this.ctx.createGain();
    this.outboardBbdWet.gain.value = 0.14;

    // Wire Master Sum -> DeEsser -> Tube Saturation -> Opto/FET Comp -> MasterGain -> MasterLimiter -> Destination
    // Master stereo width (M/S matrix): L' = L·d + R·x, R' = R·d + L·x
    const wSplit = this.ctx.createChannelSplitter(2);
    const wMerge = this.ctx.createChannelMerger(2);
    this.masterWidthGains = [0, 1, 2, 3].map((i) => {
      const g = this.ctx.createGain();
      g.gain.value = i < 2 ? 1 : 0;
      return g;
    });
    const [wLL, wRR, wRL, wLR] = this.masterWidthGains;
    merger.connect(wSplit);
    wSplit.connect(wLL, 0).connect(wMerge, 0, 0);
    wSplit.connect(wRL, 1).connect(wMerge, 0, 0);
    wSplit.connect(wRR, 1).connect(wMerge, 0, 1);
    wSplit.connect(wLR, 0).connect(wMerge, 0, 1);
    wMerge.connect(this.outboardDeEsser);
    this.outboardDeEsser.connect(this.outboardTubeShaper);
    this.outboardTubeShaper.connect(this.outboardOptoComp);
    this.outboardOptoComp.connect(this.masterGain);

    // Parallel Convolution IR Space & Plate Reverb send
    this.outboardOptoComp.connect(this.outboardConvolver);
    this.outboardConvolver.connect(this.outboardReverbWet);
    this.outboardReverbWet.connect(this.masterGain);

    // Parallel BBD Analog Delay feedback loop
    this.outboardOptoComp.connect(this.outboardBbdDelay);
    this.outboardBbdDelay.connect(this.outboardBbdFilter);
    this.outboardBbdFilter.connect(this.outboardBbdFeedback);
    this.outboardBbdFeedback.connect(this.outboardBbdDelay);
    this.outboardBbdFilter.connect(this.outboardBbdWet);
    this.outboardBbdWet.connect(this.masterGain);

    // 3-Band Master Parametric Spectrum EQ (Low / Mid / High)
    this.masterEqLow = this.ctx.createBiquadFilter();
    this.masterEqLow.type = 'lowshelf';
    this.masterEqLow.frequency.value = 160;
    this.masterEqLow.gain.value = 0;

    this.masterEqMid = this.ctx.createBiquadFilter();
    this.masterEqMid.type = 'peaking';
    this.masterEqMid.frequency.value = 1250;
    this.masterEqMid.Q.value = 1.1;
    this.masterEqMid.gain.value = 0;

    this.masterEqHigh = this.ctx.createBiquadFilter();
    this.masterEqHigh.type = 'highshelf';
    this.masterEqHigh.frequency.value = 6500;
    this.masterEqHigh.gain.value = 0;

    this.masterGain.connect(this.masterEqLow);
    this.masterEqLow.connect(this.masterEqMid);
    this.masterEqMid.connect(this.masterEqHigh);
    this.mastering = new MasteringChain(this.ctx);
    this.masterEqHigh.connect(this.mastering.input);
    this.mastering.output.connect(this.masterLimiter);
    // The limiter (DynamicsCompressor) lets fast transients overshoot; a soft clipper catches them.
    this.masterClipper = this.ctx.createWaveShaper();
    this.masterClipper.curve = AudioEngine.safetyClipCurve();
    this.masterClipper.oversample = '4x';
    this.masterLimiter.connect(this.masterClipper);
    // Speakers via the monitor section (dim / mono / calibration); exports tap the clipper directly.
    this.masterClipper.connect(this.monitor.input);
    // Meters show what you hear: after master gain, EQ, limiter and clipper.
    const meterSplit = this.ctx.createChannelSplitter(2);
    this.masterClipper.connect(meterSplit);
    meterSplit.connect(this.analyserL, 0);
    meterSplit.connect(this.analyserR, 1);
    this.meters = new MeterHub(this.ctx);
    this.meters.setSource(this.masterClipper, 'Master');
    this.reference = new ReferencePlayer(this);
    this.meters.subscribe((r) => {
      // legacy read-outs show the real meter values
      const r1 = (v: number) => Math.round(Math.max(-70, v) * 10) / 10;
      this.lufsMetering.momentary = r1(r.momentary);
      this.lufsMetering.shortTerm = r1(r.shortTerm);
      this.lufsMetering.integrated = r1(r.integrated);
      this.lufsMetering.lra = Math.round(r.lra * 10) / 10;
      this.lufsMetering.truePeakDbtp = r1(r.truePeakMax > 0 ? 20 * Math.log10(r.truePeakMax) : -70);
      this.lufsMetering.phaseCorrelation = Math.round(r.correlation * 100) / 100;
    });

    this.syncOutboardHardwareChain();
    this.initDefaultSession();
    this.startTelemetryLoop();
  }

  /** Linear up to 0.89 (-1 dBFS), then a smooth knee that saturates just below 1.0. */
  private static safetyClipCurve(): Float32Array<ArrayBuffer> {
    // Odd length so x = 0 lands exactly on a curve sample: an even curve interpolates across the
    // centre and outputs a small DC offset (-61 dBFS) even with silent input.
    const n = 4097;
    const c = new Float32Array(n);
    const t = 0.89;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a <= t ? a : t + (0.999 - t) * Math.tanh((a - t) / (0.999 - t));
      c[i] = Math.sign(x) * y;
    }
    return c;
  }

  private buildImpulseResponse(context: BaseAudioContext, durationSec: number, decay: number): AudioBuffer {
    const rate = context.sampleRate || 48000;
    const len = Math.max(1, Math.floor(rate * durationSec));
    const buf = context.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.5;
      }
    }
    return buf;
  }

  private buildSaturationCurve(drivePct: number): Float32Array<ArrayBuffer> {
    // Odd length: x = 0 must hit a real sample, otherwise the shaper emits DC on silence.
    const samples = 1025;
    const curve = new Float32Array(samples);
    const k = Math.max(0, (drivePct / 100) * 18); // 0 = straight line (no colour)
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  public syncOutboardHardwareChain(): void {
    const tube = this.outboardRackState.vintage_tube_sat;
    const opto = this.outboardRackState.opto_leveling_amp;
    const fet = this.outboardRackState.fet_dynamic_limiter;
    const variMu = this.outboardRackState.vari_mu_glue_comp;
    const irSpace = this.outboardRackState.convolution_ir_space;
    const plate = this.outboardRackState.spring_plate_reverb;
    const bbd = this.outboardRackState.bbd_analog_delay;

    const totalDrive =
      (tube?.enabled ? tube.drive * (tube.mix / 100) * 0.55 : 0) +
      (variMu?.enabled ? variMu.drive * (variMu.mix / 100) * 0.35 : 0);
    this.outboardTubeShaper.curve = this.buildSaturationCurve(totalDrive);

    const now = this.ctx.currentTime;
    if (fet?.enabled || opto?.enabled) {
      const thresh = fet?.enabled ? -18 - (fet.drive / 100) * 12 : -14 - ((opto?.drive || 50) / 100) * 8;
      const ratio = fet?.enabled ? 8 + (fet.drive / 100) * 12 : 3.5;
      this.outboardOptoComp.threshold.setTargetAtTime(thresh, now, 0.02);
      this.outboardOptoComp.ratio.setTargetAtTime(ratio, now, 0.02);
    } else {
      this.outboardOptoComp.threshold.setTargetAtTime(0, now, 0.02);
      this.outboardOptoComp.ratio.setTargetAtTime(1, now, 0.02);
    }

    const revWet =
      (irSpace?.enabled ? (irSpace.mix / 100) * 0.25 : 0) +
      (plate?.enabled ? (plate.mix / 100) * 0.2 : 0);
    this.outboardReverbWet.gain.setTargetAtTime(Math.min(0.45, revWet), now, 0.02);

    const delayWet = bbd?.enabled ? (bbd.mix / 100) * 0.28 : 0;
    const delayFb = bbd?.enabled ? Math.min(0.72, 0.18 + (bbd.drive / 100) * 0.45) : 0;
    this.outboardBbdWet.gain.setTargetAtTime(delayWet, now, 0.02);
    this.outboardBbdFeedback.gain.setTargetAtTime(delayFb, now, 0.02);
  }

  public setMasterSpectrumParam(param: 'low' | 'mid' | 'high' | 'width' | 'mix' | 'reverbSend' | 'delaySend', val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.masterSpectrumState[param] = clamped;
    const now = this.ctx.currentTime;
    if (param === 'low') {
      this.masterEqLow.gain.setTargetAtTime((clamped - 0.5) * 18, now, 0.015);
    } else if (param === 'mid') {
      this.masterEqMid.gain.setTargetAtTime((clamped - 0.5) * 16, now, 0.015);
    } else if (param === 'high') {
      this.masterEqHigh.gain.setTargetAtTime((clamped - 0.5) * 18, now, 0.015);
    } else if (param === 'width') {
      // 0.5 = unchanged, 0 = mono, 1 = double side signal
      const w = clamped * 2;
      const [ll, rr, rl, lr] = this.masterWidthGains;
      ll.gain.setTargetAtTime((1 + w) / 2, now, 0.015);
      rr.gain.setTargetAtTime((1 + w) / 2, now, 0.015);
      rl.gain.setTargetAtTime((1 - w) / 2, now, 0.015);
      lr.gain.setTargetAtTime((1 - w) / 2, now, 0.015);
    } else if (param === 'mix') {
      this.masterGain.gain.setTargetAtTime(0.2 + clamped * 0.9, now, 0.015);
    } else if (param === 'reverbSend') {
      this.outboardReverbWet.gain.setTargetAtTime(clamped * 0.55, now, 0.015);
    } else if (param === 'delaySend') {
      this.outboardBbdWet.gain.setTargetAtTime(clamped * 0.5, now, 0.015);
    }
    this.notify();
  }

  public isPlayableInstrument(type: DeviceType): boolean {
    const spec = SPEC_BY_TYPE.get(type);
    if (spec) return spec.kind === 'instrument';
    const nonPlayable: DeviceType[] = [
      'scream4',
      'echo',
      'rv7000',
      'mclass_master',
      'pulsar',
      'matrix',
      'spider_cv',
      'spider_audio',
      'rv9',
      'ripley',
      'osmium',
      'pulveriser',
      'alligator',
      'bvx_vocoder',
      'neptune',
      'pitch_correct',
      'quartet',
      'sweeper',
      'audiomatic',
      'rotor',
      'softube_amp',
      'rpg8',
      'midi_out',
      'line_mixer',
      'automation_clip',
      'vst_effect',
      'mix_bus',
      'audio_track',
    ];
    return !nonPlayable.includes(type);
  }

  public getOrCreateTrackStrip(deviceId: string): TrackChannelStripNodes {
    return this.mixer.strip(deviceId);
  }

  /** Structural change notification for modules (mixer, recorder, …): re-render + autosave. */
  public changed(): void {
    this.notify();
  }

  /** Mixer hook: automation drives this channel param during playback. */
  public automationDrives(channelId: string, param: string): boolean {
    return this.automation?.drives(channelId, param) ?? false;
  }

  /** Mixer hook: a user moved a channel control (automation recording). */
  public onUserChange(channelId: string, param: string, value: number): void {
    this.automation?.userChanged({ kind: 'channel', channelId, param: param as never }, value);
  }

  /** Post-fader levels (linear 0..1) of the channel a device plays through. */
  public getTrackStereoLevels(deviceId: string): { rmsL: number; rmsR: number; peakL: number; peakR: number } {
    return this.mixer.levels(this.mixer.ownerOf(deviceId));
  }

  /** Re-applies every channel strip (volume, pan, mute / solo, sends, routing). */
  public updateTrackChannelStrip(_trackId?: string): void {
    this.mixer.apply();
  }

  /** Master output levels after the limiter / clipper (linear 0..1). */
  public masterLevels(): { peakL: number; peakR: number; rmsL: number; rmsR: number } {
    this.analyserL.getFloatTimeDomainData(this.analyserDataL as Float32Array<ArrayBuffer>);
    this.analyserR.getFloatTimeDomainData(this.analyserDataR as Float32Array<ArrayBuffer>);
    const m = (b: Float32Array) => {
      let p = 0;
      let s = 0;
      for (let i = 0; i < b.length; i++) {
        const v = Math.abs(b[i]);
        if (v > p) p = v;
        s += b[i] * b[i];
      }
      return [p, Math.sqrt(s / b.length)];
    };
    const [peakL, rmsL] = m(this.analyserDataL);
    const [peakR, rmsR] = m(this.analyserDataR);
    return { peakL, peakR, rmsL, rmsR };
  }

  /** Arms / disarms a track for recording (audio tracks record their input, instrument tracks MIDI). */
  public setTrackArmed(trackId: string, on: boolean): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t) return;
    t.armed = on;
    // arming opens the input (asks for microphone access once) and turns on auto monitoring
    if (t.kind === 'audio') void this.recorder.syncInputs();
    this.notify();
  }

  /** Input monitoring of an audio track: auto (while armed), on, off. */
  public setTrackMonitor(trackId: string, mode: 'auto' | 'on' | 'off'): void {
    const t = this.tracks.find((x) => x.id === trackId);
    if (!t) return;
    t.monitor = mode;
    void this.recorder.syncInputs();
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
    this.captureUndoSoon();
  }

  // ---- Deterministic per-step chance (same result in playback and export) ----
  private deterministicChance(trackId: string, bar: number, step: number): number {
    let h = 2166136261;
    const key = `${trackId}|${bar}|${step}`;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---- Undo / Redo (one journal: sequencer snapshots, parameter moves, structural edits) ----
  private lastTracksJson = '';
  private undoTimer: number | null = null;
  private suppressUndoCapture = false;
  private restoring = false;

  private takeUndoSnapshot(): string {
    try {
      return JSON.stringify({
        tracks: this.tracks,
        trackFolders: this.trackFolders,
        songBlocks: this.songBlocks,
        blockPlacements: this.blockPlacements,
        bpm: this.bpm,
        swing: this.globalSwing,
        patternLength: this.patternLength,
        markers: this.arrangementMarkers,
        minBars: this.arrangementMinBars,
        timeMap: this.timeMap.serialize(),
        loop: this.getLoopRange(),
        loopEnabled: this.loopEnabled,
      });
    } catch {
      return '';
    }
  }

  /** Records the sequencer state as an undo step if it differs from the last recorded state. */
  private flushUndoCapture(label = 'Edit'): void {
    const json = this.takeUndoSnapshot();
    if (!json) return;
    if (!this.lastTracksJson) {
      this.lastTracksJson = json;
      return;
    }
    if (json === this.lastTracksJson) return;
    const prev = this.lastTracksJson;
    const next = json;
    this.lastTracksJson = json;
    undoJournal.push(
      `tracks:${label}`,
      label,
      () => this.restoreSnapshot(prev),
      () => this.restoreSnapshot(next)
    );
  }

  private captureUndoSoon(): void {
    if (this.suppressUndoCapture || this.restoring || this.undoTimer !== null) return;
    this.undoTimer = window.setTimeout(() => {
      this.undoTimer = null;
      this.flushUndoCapture();
    }, 500);
  }

  /** Call after any direct edit of track data from the UI so it becomes an undo step. */
  public commitEdit(): void {
    this.notify();
  }

  public canUndo(): boolean {
    return undoJournal.canUndo;
  }
  public canRedo(): boolean {
    return undoJournal.canRedo;
  }

  private restoreSnapshot(json: string): void {
    this.suppressUndoCapture = true;
    try {
      const snap = JSON.parse(json);
      this.tracks = snap.tracks || [];
      this.trackFolders = Array.isArray(snap.trackFolders) ? snap.trackFolders : [];
      this.songBlocks = Array.isArray(snap.songBlocks) ? snap.songBlocks : [];
      this.blockPlacements = Array.isArray(snap.blockPlacements) ? snap.blockPlacements : [];
      // JSON.parse split `steps` from the active pattern's steps: re-link them.
      this.tracks.forEach((t) => syncTrackPatterns(t, this.activePatternIndex));
      if (typeof snap.bpm === 'number') this.bpm = snap.bpm;
      if (typeof snap.swing === 'number') this.globalSwing = snap.swing;
      if (typeof snap.patternLength === 'number') this.patternLength = snap.patternLength;
      if (Array.isArray(snap.markers)) this.arrangementMarkers = snap.markers;
      if (typeof snap.minBars === 'number') this.arrangementMinBars = snap.minBars;
      if (snap.timeMap) this.timeMap.deserialize(snap.timeMap);
      if (snap.loop) this.setLoopLocators(snap.loop.start, snap.loop.end);
      if (typeof snap.loopEnabled === 'boolean') this.loopEnabled = snap.loopEnabled;
      this.lastTracksJson = json;
      this.updateTrackChannelStrip();
      this.notify();
    } finally {
      this.suppressUndoCapture = false;
    }
  }

  public undo(): boolean {
    this.flushPendingUndo();
    return undoJournal.undo() !== null;
  }

  /** Records a pending sequencer capture now (a knob move or an undo must not land beneath it). */
  private flushPendingUndo(): void {
    if (this.undoTimer === null) return;
    clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.flushUndoCapture();
  }

  public redo(): boolean {
    return undoJournal.redo() !== null;
  }

  // ---- Structural undo: add / delete a unit rebuilds the graph, so it restores a project snapshot ----
  private pendingStructural: { label: string; before: string } | null = null;

  /** The mixer asks this before recording a fader step (no steps while the graph is rebuilt). */
  public undoSuspended(): boolean {
    return this.suppressUndoCapture || this.restoring || this.pendingStructural !== null;
  }

  /** Groups a synchronous high-level rack action with its nested device and cable changes. */
  public runStructuralEdit<T>(label: string, edit: () => T): T {
    const undoable = this.beginStructural(label);
    try {
      return edit();
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private beginStructural(label: string): boolean {
    if (this.suppressUndoCapture || this.restoring || this.pendingStructural) return false;
    this.pendingStructural = { label, before: this.exportProjectJSON() };
    return true;
  }

  private endStructural(): void {
    const p = this.pendingStructural;
    this.pendingStructural = null;
    if (!p) return;
    const after = this.exportProjectJSON();
    if (after === p.before) return;
    undoJournal.push(
      `struct:${p.label}:${performance.now()}`,
      p.label,
      () => this.restoreProject(p.before),
      () => this.restoreProject(after)
    );
    // Adding / deleting a unit also changes the track list; keep the sequencer baseline in sync so
    // the pending capture does not add a second, redundant step for the same action.
    this.lastTracksJson = this.takeUndoSnapshot();
  }

  private restoreProject(json: string): void {
    if (this.restoring) return;
    this.restoring = true;
    this.suppressUndoCapture = true;
    try {
      this.importProjectJSON(json);
      this.notify();
      this.lastTracksJson = this.takeUndoSnapshot();
    } finally {
      this.suppressUndoCapture = false;
      this.restoring = false;
    }
  }

  // ---- Project file (.json) ----
  public exportProjectJSON(): string {
    this.tracks.forEach((t) => syncTrackPatterns(t, this.activePatternIndex));
    return JSON.stringify({
      format: 'unbox-project',
      // v4: reusable song blocks join track folders, unlimited patterns and arrangement clips.
      // Older project files remain readable; fields added by later versions are optional.
      version: PROJECT_FORMAT_VERSION,
      bpm: this.bpm,
      globalSwing: this.globalSwing,
      patternLength: this.patternLength,
      rootKey: this.rootKey,
      scaleType: this.scaleType,
      timeSignature: this.timeSignature,
      sequencer: {
        playbackMode: this.playbackMode,
        noteChaseEnabled: this.noteChaseEnabled,
        loopEnabled: this.loopEnabled,
        loopStartBar: this.loopStartBar,
        loopEndBar: this.loopEndBar,
        loopFollowsSong: this.loopFollowsSong,
        arrangementMinBars: this.arrangementMinBars,
        markers: this.arrangementMarkers,
        activePatternIndex: this.activePatternIndex,
      },
      devices: Array.from(this.devices.values())
        .filter((d) => (d.type as string) !== 'master')
        .map((d) => ({
          id: d.id, type: d.type, name: d.name, isPowered: d.isPowered, isBypassed: d.isBypassed, params: { ...d.params },
          vst: d instanceof VstPluginDevice ? d.toProjectData().snapshot : undefined,
        })),
      tracks: this.tracks,
      trackFolders: this.trackFolders,
      songBlocks: this.songBlocks,
      blockPlacements: this.blockPlacements,
      audioConnections: this.audioConnections.map((c) => ({
        s: c.sourceDeviceId, sp: c.sourcePortId, t: c.targetDeviceId, tp: c.targetPortId,
      })),
      cvConnections: this.cvConnections.map((c) => ({
        s: c.sourceDeviceId, sp: c.sourcePortId, t: c.targetDeviceId, tp: c.targetPortId, a: c.amount,
      })),
      rackGroups: this.rackGroups,
      // Module blocks: mixer, automation, audio clips, … (registerProjectSection)
      sections: Object.fromEntries([...this.projectSections].map(([k, s]) => [k, s.save()])),
    });
  }

  public importProjectJSON(json: string): boolean {
    const parsed = parseImportableProject(json);
    if (!parsed) return false;
    if (parsed.devices.some((device) =>
      typeof device.type !== 'string' ||
      (device.type === 'vst_effect' || device.type === 'vst_instrument' ? false : !supportsDeviceType(device.type))
    )) return false;
    const p: any = parsed;
    this.suppressUndoCapture = true;
    try {
      this.stopTransport();
      Array.from(this.devices.values()).forEach((d) => {
        if ((d.type as string) !== 'master') this.removeDevice(d.id, true);
      });
      this.tracks = [];
      this.trackFolders = [];
      this.songBlocks = [];
      this.blockPlacements = [];
      const idMap = new Map<string, string>();
      const playerTargets: [string, string][] = [];
      this.rackGroups = [];
      for (const d of p.devices) {
        try {
          const isVst = !!d.vst && typeof d.vst.itemId === 'string' && Array.isArray(d.vst.macros);
          // Keep IDs during history restores so older edits still address the rebuilt graph.
          const name = typeof d.name === 'string' ? currentDeviceName(d.name) : d.name;
          const nd = isVst ? this.createVstDevice(d.vst as VstUnitSnapshot, { name, restoreId: this.restoring ? d.id : undefined })
            : this.createDeviceInner(d.type, name, this.restoring ? d.id : undefined);
          idMap.set(d.id, nd.id);
          Object.entries(d.params || {}).forEach(([k, v]) => {
            if (typeof v === 'number' || (k === 'subVoice' && typeof v === 'string') || (isVst && k === 'presetId')) nd.setParam(k, v);
            else if (k === 'target' && typeof v === 'string' && v) playerTargets.push([nd.id, v]);
          });
          nd.isPowered = d.isPowered !== false;
          nd.isBypassed = !!d.isBypassed;
        } catch {}
      }
      playerTargets.forEach(([playerId, oldTarget]) => this.devices.get(playerId)?.setParam('target', idMap.get(oldTarget) ?? ''));
      this.trackFolders = Array.isArray(p.trackFolders)
        ? p.trackFolders
            .filter((f: any) => f && typeof f.id === 'string' && typeof f.name === 'string')
            .map((f: any) => ({
              id: f.id,
              name: f.name,
              collapsed: !!f.collapsed,
              clips: Array.isArray(f.clips)
                ? f.clips
                    .filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && Number.isFinite(c.startBar) && Number.isFinite(c.lengthBars) && c.startBar >= 0 && c.lengthBars > 0)
                    .map((c: any) => ({ id: c.id, name: c.name, startBar: c.startBar, lengthBars: c.lengthBars }))
                : [],
            }))
        : [];
      const validFolderIds = new Set(this.trackFolders.map((f) => f.id));
      this.tracks = (p.tracks || [])
        .map((t: any) => ({
          ...t,
          name: typeof t.name === 'string' ? currentDeviceName(t.name) : t.name,
          deviceId: idMap.get(t.deviceId) || t.deviceId,
          folderId: validFolderIds.has(t.folderId) ? t.folderId : undefined,
          duck: t.duck?.source ? { ...t.duck, source: idMap.get(t.duck.source) ?? t.duck.source } : t.duck,
        }))
        .filter((t: any) => this.devices.has(t.deviceId));
      const orderedTracks: SequencerTrack[] = [];
      const seenFolderIds = new Set<string>();
      this.tracks.forEach((track) => {
        if (!track.folderId) {
          orderedTracks.push(track);
        } else if (!seenFolderIds.has(track.folderId)) {
          seenFolderIds.add(track.folderId);
          orderedTracks.push(...this.tracks.filter((member) => member.folderId === track.folderId));
        }
      });
      this.tracks = orderedTracks;
      this.trackFolders = this.trackFolders.filter((folder) => this.tracks.some((track) => track.folderId === folder.id));
      this.songBlocks = Array.isArray(p.songBlocks)
        ? p.songBlocks
            .filter((b: any) => b && typeof b.id === 'string' && typeof b.name === 'string' && Number.isInteger(b.patternIndex) && b.patternIndex >= 0 && b.patternIndex <= 4095)
            .map((b: any) => ({
              id: b.id,
              name: b.name,
              patternIndex: b.patternIndex,
              color: typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : PATTERN_COLORS[b.patternIndex % PATTERN_COLORS.length],
              lengthBars: Number.isFinite(b.lengthBars) && b.lengthBars > 0 ? b.lengthBars : 4,
              audioClipsByTrack: b.audioClipsByTrack && typeof b.audioClipsByTrack === 'object'
                ? Object.fromEntries(Object.entries(b.audioClipsByTrack).map(([trackId, clips]) => [
                    trackId,
                    Array.isArray(clips)
                      ? clips.filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && c.kind === 'audio' && Number.isFinite(c.startBar) && Number.isFinite(c.lengthBars) && c.startBar >= 0 && c.lengthBars > 0).map((c: any) => ({ ...c }))
                      : [],
                  ]))
                : undefined,
              automationLanes: Array.isArray(b.automationLanes)
                ? b.automationLanes.flatMap((lane: any): AutoLane[] => {
                    if (!lane || typeof lane.id !== 'string' || !lane.target || !Array.isArray(lane.points)) return [];
                    const target = lane.target.kind === 'channel' && typeof lane.target.channelId === 'string' && typeof lane.target.param === 'string'
                      ? { ...lane.target, channelId: idMap.get(lane.target.channelId) ?? lane.target.channelId, param: lane.target.param.startsWith('send:') ? `send:${idMap.get(lane.target.param.slice(5)) ?? lane.target.param.slice(5)}` : lane.target.param }
                      : lane.target.kind === 'device' && typeof lane.target.deviceId === 'string' && typeof lane.target.param === 'string'
                        ? { ...lane.target, deviceId: idMap.get(lane.target.deviceId) ?? lane.target.deviceId }
                        : lane.target.kind === 'master' && typeof lane.target.param === 'string'
                          ? { ...lane.target }
                          : lane.target.kind === 'tempo'
                            ? { kind: 'tempo' as const }
                            : null;
                    if (!target) return [];
                    const blockEndPos = (Number.isFinite(b.lengthBars) && b.lengthBars > 0 ? b.lengthBars : 4) * this.stepsPerBar;
                    const points = sortPoints(lane.points
                      .filter((point: any) => point && Number.isFinite(point.pos) && point.pos >= 0 && Number.isFinite(point.value))
                      .map((point: any): AutoPoint => ({
                        ...point,
                        pos: Math.max(0, Math.min(blockEndPos, point.pos)),
                        value: Math.max(0, Math.min(1, point.value)),
                        curve: Number.isFinite(point.curve) ? Math.max(-1, Math.min(1, point.curve)) : undefined,
                        hold: typeof point.hold === 'boolean' ? point.hold : undefined,
                      })));
                    if (!points.length) return [];
                    const mode = ['read', 'touch', 'latch', 'write', 'off'].includes(lane.mode) ? lane.mode : 'read';
                    const trackId = typeof lane.trackId === 'string' && this.tracks.some((track) => track.id === lane.trackId) ? lane.trackId : undefined;
                    return [{ id: lane.id, target, points, mode, trackId, visible: lane.visible !== false }];
                  })
                : undefined,
              automationDisabledLaneIds: Array.isArray(b.automationDisabledLaneIds)
                ? b.automationDisabledLaneIds.filter((id: unknown): id is string => typeof id === 'string')
                : [],
            }))
        : [];
      const validBlockIdsAfterSanitize = new Set(this.songBlocks.map((b) => b.id));
      this.blockPlacements = Array.isArray(p.blockPlacements)
        ? p.blockPlacements
            .filter((b: any) => b && typeof b.id === 'string' && validBlockIdsAfterSanitize.has(b.blockId) && Number.isFinite(b.startBar) && Number.isFinite(b.lengthBars) && b.startBar >= 0 && b.lengthBars > 0)
            .map((b: any) => ({ id: b.id, blockId: b.blockId, startBar: b.startBar, lengthBars: b.lengthBars }))
        : [];
      // createDevice auto-patched every instrument to the master; the saved cables are the truth
      // (otherwise instruments routed through effects would also play dry after a reload).
      if (Array.isArray(p.audioConnections)) {
        this.audioConnections.slice().forEach((c) => this.disconnectAudio(c.id));
      }
      (p.audioConnections || []).forEach((c: any) => {
        const src = idMap.get(c.s);
        const tgt = c.t === 'master' ? 'master' : idMap.get(c.t);
        if (!src || !tgt) return;
        const exists = this.audioConnections.some(
          (x) => x.sourceDeviceId === src && x.sourcePortId === c.sp && x.targetDeviceId === tgt && x.targetPortId === c.tp
        );
        if (!exists) {
          try { this.connectAudio(src, c.sp, tgt, c.tp); } catch {}
        }
      });
      (p.cvConnections || []).forEach((c: any) => {
        const src = idMap.get(c.s);
        const tgt = idMap.get(c.t);
        if (src && tgt) this.connectCV(src, c.sp, tgt, c.tp, typeof c.a === 'number' ? c.a : 1);
      });
      (Array.isArray(p.rackGroups) ? p.rackGroups : []).forEach((g: RackGroup) => {
        const deviceIds = (g.deviceIds || []).map((id) => idMap.get(id)).filter((id): id is string => !!id);
        if (!deviceIds.length) return;
        const macros = (g.macros || []).map((m) => ({
          ...m,
          targets: (m.targets || []).flatMap((t) => {
            const deviceId = idMap.get(t.deviceId);
            return deviceId ? [{ ...t, deviceId }] : [];
          }),
        }));
        this.rackGroups.push({ ...g, deviceIds, macros });
      });
      const sections = p.sections && typeof p.sections === 'object' ? (p.sections as Record<string, unknown>) : {};
      this.projectSections.forEach((s, k) => {
        try {
          s.load(sections[k], idMap);
        } catch (e) {
          console.warn(`Project block "${k}" could not be restored:`, e);
        }
      });
      if (typeof p.bpm === 'number') this.bpm = Math.max(30, Math.min(300, p.bpm));
      if (typeof p.globalSwing === 'number') this.globalSwing = p.globalSwing;
      if (typeof p.patternLength === 'number') this.patternLength = p.patternLength;
      if (typeof p.rootKey === 'number') this.rootKey = p.rootKey;
      if (p.scaleType) this.scaleType = p.scaleType;
      if (typeof p.timeSignature === 'string' && ['4/4', '3/4', '5/4', '7/8', '6/8'].includes(p.timeSignature)) {
        this.timeSignature = p.timeSignature;
      }
      this.applySequencerSettings(p.sequencer);
      const legacyIdx = typeof p.sequencer?.activePatternIndex === 'number' ? p.sequencer.activePatternIndex : 0;
      this.tracks.forEach((t) => normalizeTrackSequencerData(t, this.stepsPerBar, legacyIdx));
      this.songPosition = 0;
      this.currentSongBar = 0;
      this.currentStep = 0;
      this.updateTrackChannelStrip();
      this.lastTracksJson = '';
    } finally {
      this.suppressUndoCapture = false;
    }
    if (!this.restoring) undoJournal.clear();
    this.notify();
    return true;
  }

  // ---- Real-time bounce: records exactly what you hear (before the monitor section) ----
  public async bounceRealtimeWav(): Promise<boolean> {
    await this.resumeContext();
    if (!(await ensureRecorderWorklet(this.ctx))) return false;
    // Whole arrangement in Song mode, one pass of the longest active pattern in Pattern mode (max 10 min).
    const bodyMs = Math.min(600, this.renderLength16ths() * (60 / this.bpm / 4)) * 1000;
    const savedLoop = this.loopEnabled;
    this.stopTransport();
    this.loopEnabled = false; // play straight through to the song end
    this.seekToSongPosition(0);
    const capture = new WorkletCapture(this.ctx, this.masterTap, 2);
    capture.start();
    await this.startTransport();
    await new Promise((r) => setTimeout(r, bodyMs));
    this.stopTransport();
    this.loopEnabled = savedLoop;
    this.notify();
    await new Promise((r) => setTimeout(r, 2000)); // let reverb / delay tails ring out
    const data = await capture.stop();
    if (!data.channels[0]?.length) return false;
    const sr = this.ctx.sampleRate;
    downloadBlob(encodeWav(data.channels, sr, { bitDepth: 24, dither: true }), `THE_UNBOX_APP_Bounce_${sr}Hz_24bit.wav`);
    return true;
  }

  // ---- Hardware MIDI keyboard input (Web MIDI) ----
  public midiTargetDeviceId: string | null = null;
  /** Instruments a live note goes to (the target + linked parts, see liveLink.ts). */
  public liveFanout: (dev: BaseDevice) => BaseDevice[] = (dev) => [dev];
  public noteRecordArmed = false;

  /** Writes a played note into the track at the step currently being heard (needs transport running). */
  public recordNoteToTrack(deviceId: string, midi: number, velocity: number): void {
    if (!this.noteRecordArmed || !this.isPlaying) return;
    const track = this.tracks.find((t) => t.deviceId === deviceId);
    if (!track) return;
    const active = syncTrackPatterns(track, this.activePatternIndex);
    // Write into the edited (active) pattern at the step that is audible right now.
    const T = divisionTicks(active.division);
    const len = Math.max(1, active.length);
    const tick = Math.round(this.getPlayheadPosition() * TICKS_PER_16TH);
    const idx = ((Math.round(tick / T) % len) + len) % len;
    const ex = track.steps[idx];
    if (ex && ex.note !== midi) {
      ex.chordNotes = Array.from(new Set([...(ex.chordNotes || []), midi]));
    } else if (!ex) {
      track.steps[idx] = { note: midi, velocity: Math.max(0.1, Math.min(1, velocity)), length: 1 };
    }
    this.commitEdit();
  }
  /** Hardware MIDI inputs: ports, status, live key / wheel state (audio/midi/MidiInput.ts). */
  public readonly midi = new MidiInput((data) => this.handleMidiMessage(data));

  public enableMidiInput(): Promise<boolean> {
    return this.midi.enable();
  }

  /** Creates a sequencer lane that sends its note clips to the selected Web MIDI output. */
  public createMidiOutTrack(name?: string): SequencerTrack | null {
    const n = this.tracks.filter((t) => this.devices.get(t.deviceId)?.type === 'midi_out').length + 1;
    const dev = this.createDevice('midi_out', name || `MIDI Out ${n}`);
    const track = this.getOrCreateTrackForDevice(dev.id, true);
    if (track) track.group = 'FX';
    this.notify();
    return track;
  }

  private midiTimestamp(audioTime: number): number {
    return performance.now() + Math.max(0, audioTime - this.ctx.currentTime) * 1000;
  }

  private midiClockEnabled(): boolean {
    return Array.from(this.devices.values()).some(
      (dev) => dev.type === 'midi_out' && dev.isPowered && !dev.isBypassed && dev.params.sendClockSync !== false && dev.params.sendClockSync !== 0
    );
  }

  private sendMidiTransport(status: number, audioTime = this.ctx.currentTime): void {
    if (this.midiClockEnabled()) this.midi.sendOutput([status], this.midiTimestamp(audioTime));
  }

  private stopMidiOutput(): void {
    if (!this.midi.outputId || !Array.from(this.devices.values()).some((dev) => dev.type === 'midi_out')) return;
    this.midi.clearOutput();
    const timestamp = this.midiTimestamp(this.ctx.currentTime);
    for (let channel = 0; channel < 16; channel++) this.midi.sendOutput([0xb0 | channel, 123, 0], timestamp);
    this.sendMidiTransport(0xfc);
  }

  private sendMidiSongPosition(pos16: number, audioTime: number): void {
    if (!this.midiClockEnabled()) return;
    const pointer = Math.max(0, Math.min(0x3fff, Math.floor(pos16)));
    this.midi.sendOutput([0xf2, pointer & 0x7f, (pointer >> 7) & 0x7f], this.midiTimestamp(audioTime));
  }

  private sendMidiClockStep(audioTime: number, duration: number): void {
    if (!this.midiClockEnabled() || !this.midi.outputId) return;
    for (let pulse = 0; pulse < 6; pulse++) {
      this.midi.sendOutput([0xf8], this.midiTimestamp(audioTime + (duration * pulse) / 6));
    }
  }

  private readonly midiSustainChannels = new Set<number>();
  private readonly midiNoteLifecycle = new MidiNoteLifecycle<BaseDevice>();

  /** Instrument hardware notes play: the selected part, else the first instrument. */
  public midiTarget(): BaseDevice | undefined {
    const sel = this.midiTargetDeviceId ? this.devices.get(this.midiTargetDeviceId) : undefined;
    return sel ?? [...this.devices.values()].find((d) => this.isPlayableInstrument(d.type));
  }

  /** The instrument that sounds a key played on `selected`. A drum kit answers only on its pad notes, so any
   *  other key goes to the first melodic instrument: the keyboard still plays with the kit selected. */
  public keyboardOwner(selected: BaseDevice, note: number): BaseDevice {
    if (!this.isDrumKit(selected) || this.drumPadNotes(selected).includes(note)) return selected;
    return [...this.devices.values()].find((d) => this.isPlayableInstrument(d.type) && !this.isDrumKit(d)) ?? selected;
  }

  private isDrumKit(dev: BaseDevice): boolean {
    return dev.type === 'redrum' || (dev instanceof SpecDevice && !!dev.spec.pads?.length);
  }

  private drumPadNotes(kit: BaseDevice): number[] {
    if (kit instanceof SpecDevice) return kit.spec.pads?.map((p) => p.note) ?? [];
    return (['kick', 'snare', 'hatC', 'hatO', 'clap', 'perc'] as const).map((role) => this.drumNoteFor(kit, role));
  }

  private handleMidiMessage(data: Uint8Array): void {
    if (!data || data.length < 2) return;
    const cmd = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const note = data[1];
    const vel = data.length > 2 ? data[2] : 0;

    if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      const dev = this.midiTarget();
      const fallbackTargets = dev ? this.liveFanout(dev) : [];
      this.midiNoteLifecycle.noteOff(
        channel,
        note,
        fallbackTargets,
        this.midiSustainChannels.has(channel),
        (target, releasedNote, releasedChannel) => {
          if (target instanceof SpecDevice) target.keyRelease(releasedNote, this.ctx.currentTime);
          this.recorder.noteOff(target.id, releasedNote, releasedChannel);
        },
        (target, releasedNote) => this.releaseLiveSound(target, releasedNote)
      );
      return;
    }

    if (cmd === 0xb0 && note === 64) {
      if (vel >= 64) this.midiSustainChannels.add(channel);
      else {
        this.midiSustainChannels.delete(channel);
        this.midiNoteLifecycle.sustainReleased((target, releasedNote) => this.releaseLiveSound(target, releasedNote), channel);
      }
      return;
    }

    const selected = this.midiTarget();
    if (!selected) return;
    // The instrument that sounds this key: a drum kit passes its non-pad keys on to the melodic part.
    const dev = cmd === 0x90 && vel > 0 ? this.keyboardOwner(selected, note) : selected;
    const canPlay = dev.isPowered && !dev.isBypassed;
    if (canPlay && this.ctx.state === 'suspended') void this.ctx.resume();
    const targets = this.liveFanout(dev);
    if (cmd === 0x90 && vel > 0) {
      this.midiNoteLifecycle.noteOn(channel, note, targets);
      // MIDI capture is independent from the instrument's audio power/bypass state.
      if (canPlay) targets.forEach((d) => this.liveNoteOn(d, note, vel / 127, channel));
      else targets.forEach((d) => this.recorder.noteOn(d.id, note, vel / 127, channel));
      this.recordNoteToTrack(dev.id, note, vel / 127);
    } else if (cmd === 0xe0) {
      if (!canPlay) return;
      targets.forEach((d) => setPitchBend(d, (((vel << 7) | note) - 8192) / 8192));
    } else if (cmd === 0xb0 && note === 1) {
      if (!canPlay) return;
      targets.forEach((d) => setModWheel(d, vel / 127));
    }
  }

  public async resumeContext(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Audition one catalogue instrument note through the monitor without registering a device. */
  public async previewInstrument(type: DeviceType, name = 'Preview'): Promise<void> {
    if (!this.isPlayableInstrument(type)) throw new Error('This device does not produce notes.');
    this.stopInstrumentPreview();
    const token = this.instrumentPreviewToken;
    await this.resumeContext();
    if (token !== this.instrumentPreviewToken) return;

    const dev = this.instantiateDeviceOnContext(this.ctx, type, `preview_${token}`, name);
    this.instrumentPreviewDevice = dev;
    try {
      const sourceOutputs = new Set<GainNode>();
      [dev.audioOutputs.get('out_l'), dev.audioOutputs.get('out_r')].forEach((node) => {
        if (node) sourceOutputs.add(node);
      });
      this.instrumentPreviewSourceOutputs = [...sourceOutputs];
      installLevelTrim(dev);
      const outputs = new Set<GainNode>();
      [dev.audioOutputs.get('out_l'), dev.audioOutputs.get('out_r')].forEach((node) => {
        if (node) outputs.add(node);
      });
      if (!outputs.size) throw new Error('This instrument has no audio output to preview.');

      const previewGain = this.ctx.createGain();
      previewGain.gain.value = 0.28;
      previewGain.connect(this.monitor.clickInput);
      outputs.forEach((node) => node.connect(previewGain));
      this.instrumentPreviewGain = previewGain;

      await dev.ready?.();
      if (token !== this.instrumentPreviewToken) return;

      const note = type === 'redrum' || (dev instanceof SpecDevice && !!dev.spec.pads?.length)
        ? this.drumNoteFor(dev, 'kick')
        : 60;
      this.instrumentPreviewNote = note;
      const start = this.ctx.currentTime + 0.025;
      dev.noteOn(note, 0.82, start);
      dev.noteOff?.(note, start + 0.48);
      this.instrumentPreviewCleanupTimer = window.setTimeout(() => {
        if (token === this.instrumentPreviewToken) this.stopInstrumentPreview();
      }, 1500);
    } catch (error) {
      if (token === this.instrumentPreviewToken) this.stopInstrumentPreview();
      throw error;
    }
  }

  /** Stops and disposes the transient preview device. */
  public stopInstrumentPreview(): void {
    this.instrumentPreviewToken += 1;
    if (this.instrumentPreviewCleanupTimer !== null) {
      window.clearTimeout(this.instrumentPreviewCleanupTimer);
      this.instrumentPreviewCleanupTimer = null;
    }
    const dev = this.instrumentPreviewDevice;
    const note = this.instrumentPreviewNote;
    this.instrumentPreviewDevice = null;
    this.instrumentPreviewNote = null;
    if (dev && note !== null) {
      try { dev.noteOff?.(note, this.ctx.currentTime); } catch {}
    }
    try { this.instrumentPreviewGain?.disconnect(); } catch {}
    this.instrumentPreviewGain = null;
    this.instrumentPreviewSourceOutputs.forEach((node) => {
      try { node.disconnect(); } catch {}
    });
    this.instrumentPreviewSourceOutputs = [];
    try { dev?.dispose(); } catch {}
  }

  // Factory device creator
  /**
   * Create a rack device. The optional sub-voice is meaningful only for the
   * generic recorded-instrument wrappers; other device types safely ignore it.
   */
  public createDevice(type: DeviceType, customName?: string, subVoiceId?: string): BaseDevice {
    const undoable = this.beginStructural('Add device');
    try {
      return this.createDeviceInner(type, customName, undefined, subVoiceId);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private createDeviceInner(
    type: DeviceType,
    customName?: string,
    id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    subVoiceId?: string,
  ): BaseDevice {
    // Spec-driven devices (Reason lineup + hardware emulations): src/audio/spec
    const spec = createSpecDevice(this.ctx, type, id, customName);
    if (spec) return this.registerDevice(spec);
    let dev: BaseDevice;

    switch (type) {
      case 'subtractor':
        dev = new SubtractorDevice(this.ctx, id, customName || 'Twin-Osc Analog Synth');
        break;
      case 'thor':
        dev = new ThorDevice(this.ctx, id, customName || 'Thunderhead Polysonic Synth');
        break;
      case 'third_wave':
        dev = new ThirdWaveDevice(this.ctx, id, customName || '3rd Wave Wavetable Synth');
        break;
      case 'europa':
        dev = new EuropaDevice(this.ctx, id, customName || 'Aurora Wavetable Synth');
        break;
      case 'monotone':
        dev = new MonotoneDevice(this.ctx, id, customName || 'Monobass Synth');
        break;
      case 'redrum':
        dev = new RedrumDevice(this.ctx, id, customName || 'Beatbox 8 Drum Computer');
        break;
      case 'mimic':
        dev = new MimicDevice(this.ctx, id, customName || 'Copycat Creative Sampler');
        break;
      case 'matrix':
        dev = new MatrixDevice(this.ctx, id, customName || 'Matrix Pattern / CV');
        break;
      case 'pulsar':
        dev = new PulsarDevice(this.ctx, id, customName || 'Twin LFO');
        break;
      case 'scream4':
        dev = new Scream4Device(this.ctx, id, customName || 'Howler Distortion');
        break;
      case 'echo':
        dev = new EchoDevice(this.ctx, id, customName || 'Repeater Stereo Delay');
        break;
      case 'rv7000':
        dev = new RV7000Device(this.ctx, id, customName || 'Cathedral Reverb');
        break;
      case 'mclass_master':
        dev = new MClassMasterSuite(this.ctx, id, customName || 'Masterline Mastering Suite');
        break;
      case 'spider_audio':
        dev = new SpiderAudioDevice(this.ctx, id, customName || 'Audio Splitter Utility');
        break;
      case 'spider_cv':
        dev = new SpiderCVDevice(this.ctx, id, customName || 'CV Splitter Utility');
        break;
      case 'three_osc':
        dev = new ThreeOscDevice(this.ctx, id, customName || 'Tri-Osc Power Synth');
        break;
      case 'sytrus':
        dev = new SytrusDevice(this.ctx, id, customName || 'Fusion FM Synth');
        break;
      case 'flex':
        dev = new FlexDevice(this.ctx, id, customName || 'Romplex Advanced Rompler');
        break;
      case 'bansuri':
        dev = new BansuriDevice(this.ctx, id, customName || 'Bansuri Bamboo Flute');
        break;
      case 'harmonium':
        dev = new HarmoniumDevice(this.ctx, id, customName || 'Classical Harmonium');
        break;
      case 'tabla':
        dev = new TablaDevice(this.ctx, id, customName || 'Tabla Percussion');
        break;
      case 'tanpura':
        dev = new TanpuraDroneDevice(this.ctx, id, customName || 'Tanpura & Drone Generator');
        break;
      case 'dhol':
        dev = new DholDevice(this.ctx, id, customName || 'Dhol Folk Drum');
        break;
      case 'tumbi':
        dev = new TumbiDevice(this.ctx, id, customName || 'Tumbi Folk Resonator');
        break;
      case 'world_instrument': {
        const name = customName || 'World Instrument';
        const isWind = name.toLowerCase().includes('flute') || name.toLowerCase().includes('horn') || name.toLowerCase().includes('pipe') || name.toLowerCase().includes('bagpipe') || name.toLowerCase().includes('clarinet') || name.toLowerCase().includes('oboe') || name.toLowerCase().includes('accordion') || name.toLowerCase().includes('saxophone') || name.toLowerCase().includes('whistle') || name.toLowerCase().includes('didgeridoo') || name.toLowerCase().includes('duduk') || name.toLowerCase().includes('recorder');
        dev = new UniversalWorldInstrumentDevice(this.ctx, id, name, isWind ? 'wind' : 'string', subVoiceId);
        break;
      }
      case 'percussion_electronic': {
        const name = customName || 'Percussion/Electronic';
        dev = new UniversalPercussionElectronicDevice(this.ctx, id, name, undefined, subVoiceId);
        break;
      }
      case 'wyvern':
        dev = new WyvernDevice(this.ctx, id, customName || 'Wyvern Synthesizer Module');
        break;
      case 'ember':
        dev = new EmberDevice(this.ctx, id, customName || 'Ember Synthesizer Module');
        break;
      case 'objekt':
        dev = new ObjektDevice(this.ctx, id, customName || 'Bodywork Physical Modeling Synth');
        break;
      case 'reason_performance':
        dev = new ReasonPerformanceDevice(this.ctx, id, customName || 'Session Drum Kits / Electric Bass');
        break;
      case 'rv9':
        dev = new RV9Device(this.ctx, id, customName || 'Flagstone Reverb Station');
        break;
      case 'osmium':
        dev = new OsmiumDevice(this.ctx, id, customName || 'Osmium Distortion Matrix');
        break;
      case 'rotor':
        dev = new RotorDevice(this.ctx, id, customName || 'Rotor Rotary Speaker Emulation');
        break;
      case 'combinator':
        dev = new CombinatorDevice(this.ctx, id, customName || 'Combiner Multi-Device Macro');
        break;
      case 'midi_out':
        dev = new MidiOutDevice(this.ctx, id, customName || 'MIDI Out External Control');
        break;
      case 'automation_clip':
        // Legacy saved type only. New automation is represented by automation lanes, not a rack device.
        dev = new SubtractorDevice(this.ctx, id, customName || 'Automation Clip Modulator');
        break;
      case 'mix_bus':
        dev = new MixBusDevice(this.ctx, id, customName || 'Bus');
        break;
      case 'audio_track':
        dev = new AudioTrackDevice(this.ctx, id, customName || 'Audio');
        break;
      default:
        throw new Error(`Unsupported device type: ${String(type)}`);
    }

    if (dev instanceof MidiOutDevice) {
      dev.onControl = (channel, cc, value) => {
        if (!dev.isPowered || dev.isBypassed || !this.midi.outputId) return;
        this.midi.sendOutput([0xb0 | (channel - 1), cc, value], this.midiTimestamp(this.ctx.currentTime));
      };
    }

    if (subVoiceId && 'setSubVoice' in dev && typeof (dev as any).setSubVoice === 'function') {
      (dev as any).setSubVoice(subVoiceId);
    }

    return this.registerDevice(dev);
  }

  /** Mount a plugin-library plugin / instrument as a rack unit (Web Audio proxy DSP). */
  public createVstDevice(
    snapshot: VstUnitSnapshot,
    opts: { name?: string; presetId?: string; params?: Record<string, unknown>; restoreId?: string } = {}
  ): VstPluginDevice {
    const undoable = this.beginStructural('Add device');
    try {
      const type: DeviceType = snapshot.role === 'effect' ? 'vst_effect' : 'vst_instrument';
      const id = this.restoring && opts.restoreId ? opts.restoreId : `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const dev = new VstPluginDevice(this.ctx, id, opts.name || snapshot.name, snapshot, opts.presetId);
      Object.entries(opts.params ?? {}).forEach(([k, v]) => dev.setParam(k, v));
      this.registerDevice(dev);
      return dev;
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private registerDevice(dev: BaseDevice): BaseDevice {
    const id = dev.id;
    // a new player sits on the most recently added instrument (like placing it above it in Reason)
    if (dev instanceof SpecDevice && dev.spec.kind === 'player') {
      const inst = Array.from(this.devices.values()).filter((d) => this.isPlayableInstrument(d.type)).pop();
      if (inst) dev.setParam('target', inst.id);
    }
    this.devices.set(id, dev);
    dev.isPowered = true;
    // Built-in effects without their own bypass / power switching get a generic one.
    if (!(dev instanceof SpecDevice) && !(dev instanceof VstPluginDevice) && !(dev instanceof MixBusDevice)) installBypassShim(dev);
    // Calibrated instrument output level (some built-ins were far too hot / quiet).
    if (this.isPlayableInstrument(dev.type)) {
      installLevelTrim(dev);
      installSampleVoice(dev); // "Load audio": inside the bend wrapper, after the trim
      installExpression(dev);
    }
    // Knob moves feed automation recording (automation's own changes are flagged and skipped).
    const setParam = dev.setParam.bind(dev);
    dev.setParam = (key: string, value: any) => {
      const prev = dev.params[key];
      setParam(key, value);
      // Every live knob move is reversible. Automation-driven changes are not user edits.
      if (!this.suppressUndoCapture && !this.restoring && !this.pendingStructural && !this.automation.applying && typeof prev === 'number' && typeof value === 'number' && prev !== value) {
        const apply = (v: number) => {
          this.suppressUndoCapture = true;
          try {
            this.devices.get(id)?.setParam(key, v);
            this.changed();
          } finally {
            this.suppressUndoCapture = false;
          }
        };
        undoJournal.push(`param:${id}:${key}`, `Change ${key}`, () => apply(prev), () => apply(value));
      }
      if (typeof value === 'number' && this.isPlaying) this.automation.userChanged({ kind: 'device', deviceId: id, param: key }, value);
    };
    this.cvEngine.registerDevice(dev);

    // Only spawn Sequencer track, seed starter pattern, and auto-patch to Master Bus if playable instrument
    if (this.isPlayableInstrument(dev.type)) {
      const track = this.getOrCreateTrackForDevice(id);

      // New instruments start with an EMPTY pattern (no generated notes).

      const hasOutL = dev.ports.some((p) => p.id === 'out_l');
      const hasOutR = dev.ports.some((p) => p.id === 'out_r');

      if (hasOutL && hasOutR) {
        try {
          this.connectAudio(id, 'out_l', 'master', 'master_l');
          this.connectAudio(id, 'out_r', 'master', 'master_r');
        } catch (e) {}
      }
      this.updateTrackChannelStrip(track?.id);
    }

    this.notify();
    return dev;
  }

  // ---- Combinator groups (rack frames with macro knobs) ----
  public rackGroups: RackGroup[] = [];

  public addRackGroup(group: Omit<RackGroup, 'id'>): RackGroup {
    const undoable = this.beginStructural('Create Combiner');
    try {
      const created: RackGroup = { ...group, id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` };
      this.rackGroups.push(created);
      created.macros.forEach((m) => this.setRackMacro(created.id, m.id, m.value));
      this.notify();
      return created;
    } finally {
      if (undoable) this.endStructural();
    }
  }

  /** Turn a Combinator macro: every target param follows value 0..1 between its min and max. */
  public setRackMacro(groupId: string, macroId: string, value: number): void {
    const macro = this.rackGroups.find((g) => g.id === groupId)?.macros.find((m) => m.id === macroId);
    if (!macro) return;
    macro.value = Math.max(0, Math.min(1, value));
    macro.targets.forEach((t) => this.devices.get(t.deviceId)?.setParam(t.param, t.min + (t.max - t.min) * macro.value));
  }

  /** Remove a group frame; with `deleteDevices` its units are unmounted too (re-bridging the chain). */
  public removeRackGroup(groupId: string, deleteDevices = false): void {
    const undoable = this.beginStructural('Delete Combiner');
    try {
      this.removeRackGroupInner(groupId, deleteDevices);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private removeRackGroupInner(groupId: string, deleteDevices = false): void {
    const group = this.rackGroups.find((g) => g.id === groupId);
    if (!group) return;
    this.rackGroups = this.rackGroups.filter((g) => g.id !== groupId);
    if (deleteDevices) group.deviceIds.forEach((id) => this.removeDevice(id));
    this.notify();
  }

  /** Insert an effect in series on a track's path to the master (chains after existing inserts). */
  public insertEffectOnTrack(effectId: string, trackDeviceId: string): boolean {
    const fx = this.devices.get(effectId);
    const src = this.devices.get(trackDeviceId);
    if (!fx || !src || effectId === trackDeviceId) return false;
    const has = (id: string) => fx.ports.some((p) => p.id === id);
    if (!(has('in_l') && has('in_r') && has('out_l') && has('out_r'))) return false;
    let tail = trackDeviceId;
    for (let guard = 0; guard < 16; guard++) {
      if (this.audioConnections.some((c) => c.sourceDeviceId === tail && c.targetDeviceId === 'master')) break;
      const next = this.audioConnections.find((c) => c.sourceDeviceId === tail && c.sourcePortId === 'out_l');
      if (!next || next.targetDeviceId === effectId) return false;
      tail = next.targetDeviceId;
    }
    const toMaster = this.audioConnections.filter((c) => c.sourceDeviceId === tail && c.targetDeviceId === 'master');
    if (toMaster.length === 0) return false;
    try {
      toMaster.forEach((c) => this.disconnectAudio(c.id));
      this.connectAudio(tail, 'out_l', effectId, 'in_l');
      this.connectAudio(tail, 'out_r', effectId, 'in_r');
      this.connectAudio(effectId, 'out_l', 'master', 'master_l');
      this.connectAudio(effectId, 'out_r', 'master', 'master_r');
    } catch {
      return false;
    }
    this.notify();
    return true;
  }

  public removeDevice(deviceId: string, skipBridge: boolean = false): void {
    const undoable = this.beginStructural('Delete device');
    try {
      this.removeDeviceInner(deviceId, skipBridge);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private removeDeviceInner(deviceId: string, skipBridge: boolean = false): void {
    const dev = this.devices.get(deviceId);
    if (!dev) return;

    // If this device sits inline in a chain, reconnect upstream -> downstream so the track keeps playing
    if (!skipBridge) {
      try {
        const pairs: [string, string][] = [['in_l', 'out_l'], ['in_r', 'out_r']];
        const bridges: { s: string; sp: string; t: string; tp: string }[] = [];
        pairs.forEach(([pin, pout]) => {
          const up = this.audioConnections.find((c) => c.targetDeviceId === deviceId && c.targetPortId === pin);
          const down = this.audioConnections.filter((c) => c.sourceDeviceId === deviceId && c.sourcePortId === pout);
          if (up) down.forEach((d) => bridges.push({ s: up.sourceDeviceId, sp: up.sourcePortId, t: d.targetDeviceId, tp: d.targetPortId }));
        });
        this.audioConnections
          .filter((c) => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId)
          .forEach((c) => this.disconnectAudio(c.id));
        bridges.forEach((b) => this.connectAudio(b.s, b.sp, b.t, b.tp));
      } catch {}
    }

    // Disconnect all audio cables to/from this device
    const toRemoveAudio = this.audioConnections.filter(
      (c) => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
    );
    toRemoveAudio.forEach((c) => this.disconnectAudio(c.id));

    // Disconnect CV cables
    const toRemoveCV = this.cvConnections.filter(
      (c) => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
    );
    toRemoveCV.forEach((c) => this.disconnectCV(c.id));

    // Remove associated sequencer tracks, then the mixer channel (routes / sends to it fall back to master)
    this.tracks = this.tracks.filter((t) => t.deviceId !== deviceId);
    this.trackFolders = this.trackFolders.filter((f) => this.tracks.some((t) => t.folderId === f.id));
    this.mixer.forget(deviceId);
    this.automation.forgetDevice(deviceId);

    this.cvEngine.unregisterDevice(deviceId);
    dev.dispose();
    this.devices.delete(deviceId);

    // Drop the unit from Combinator groups (and macros that pointed at it); empty groups go away.
    this.rackGroups = this.rackGroups
      .map((g) => ({
        ...g,
        deviceIds: g.deviceIds.filter((id) => id !== deviceId),
        macros: g.macros.map((m) => ({ ...m, targets: m.targets.filter((t) => t.deviceId !== deviceId) })),
      }))
      .filter((g) => g.deviceIds.length > 0);
    this.notify();
  }

  /** Returns true if audio can travel from `fromDevId` to `toDevId` via existing audio cables. */
  public audioPathExists(fromDevId: string, toDevId: string): boolean {
    if (fromDevId === toDevId) return true;
    const stack = [fromDevId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === toDevId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      this.audioConnections.forEach((c) => {
        if (c.sourceDeviceId === id && c.targetDeviceId !== 'master') {
          stack.push(c.targetDeviceId);
        }
      });
    }
    return false;
  }

  // Audio Cabling
  /** Connect a cable. The patch is part of the structural undo history. */
  public connectAudio(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string | 'master',
    targetPortId: string,
    color?: string
  ): string | null {
    const undoable = this.beginStructural('Connect cable');
    try {
      return this.connectAudioInner(sourceDeviceId, sourcePortId, targetDeviceId, targetPortId, color);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private connectAudioInner(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string | 'master',
    targetPortId: string,
    color?: string
  ): string | null {
    const srcDev = this.devices.get(sourceDeviceId);
    if (!srcDev) return null;

    // Check duplicate
    const duplicate = this.audioConnections.find(
      (c) =>
        c.sourceDeviceId === sourceDeviceId &&
        c.sourcePortId === sourcePortId &&
        c.targetDeviceId === targetDeviceId &&
        c.targetPortId === targetPortId
    );
    if (duplicate) return duplicate.id;

    // Cycle check: if targetDeviceId reaches sourceDeviceId, adding source -> target would close a loop
    if (targetDeviceId !== 'master' && this.audioPathExists(targetDeviceId, sourceDeviceId)) {
      console.warn(`Prevented audio feedback loop: ${sourceDeviceId} -> ${targetDeviceId}`);
      return null;
    }

    const srcOut = srcDev.audioOutputs.get(sourcePortId);
    if (!srcOut) return null;

    let targetIn: GainNode | null = null;
    let stripId: string | undefined;
    if (targetDeviceId === 'master') {
      // The cable lands on the strip of the channel that owns this chain (track, bus or rack channel).
      stripId = this.mixer.ownerOf(sourceDeviceId);
      const strip = this.mixer.strip(stripId);
      targetIn = targetPortId === 'master_r' ? strip.inR : strip.inL;
    } else {
      const tgtDev = this.devices.get(targetDeviceId);
      if (!tgtDev) return null;
      targetIn = tgtDev.audioInputs.get(targetPortId) || null;
    }

    if (!targetIn) return null;

    try {
      srcOut.connect(targetIn);
      const cableColors = ['#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6'];
      const chosenColor = color || cableColors[this.audioConnections.length % cableColors.length];
      const connId = `aud_conn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

      this.audioConnections.push({
        id: connId,
        sourceDeviceId,
        sourcePortId,
        targetDeviceId,
        targetPortId,
        color: chosenColor,
        stripId,
      });
      // A new cable can change which channel owns a chain (e.g. an effect inserted after an instrument).
      this.mixer.rebindMasterConnections();

      this.playJackSnapSound();
      this.notify();
      return connId;
    } catch (e) {
      console.error('Audio connection failed:', e);
      return null;
    }
  }

  public disconnectAudio(connectionId: string): void {
    const undoable = this.beginStructural('Disconnect cable');
    try {
      this.disconnectAudioInner(connectionId);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private disconnectAudioInner(connectionId: string): void {
    const idx = this.audioConnections.findIndex((c) => c.id === connectionId);
    if (idx === -1) return;

    const conn = this.audioConnections[idx];
    const srcDev = this.devices.get(conn.sourceDeviceId);
    if (srcDev) {
      const srcOut = srcDev.audioOutputs.get(conn.sourcePortId);
      let targetIn: GainNode | null = null;
      if (conn.targetDeviceId === 'master') {
        const strip = this.mixer.strips.get(conn.stripId ?? conn.sourceDeviceId);
        targetIn = strip ? (conn.targetPortId === 'master_r' ? strip.inR : strip.inL) : null;
      } else {
        const tgt = this.devices.get(conn.targetDeviceId);
        targetIn = tgt?.audioInputs.get(conn.targetPortId) || null;
      }

      if (srcOut && targetIn) {
        try {
          srcOut.disconnect(targetIn);
        } catch (e) {}
      }
    }

    this.audioConnections.splice(idx, 1);
    this.mixer.rebindMasterConnections();
    this.notify();
  }

  // CV Cabling
  public connectCV(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string,
    targetPortId: string,
    amount: number = 1.0,
    color?: string
  ): string | null {
    const undoable = this.beginStructural('Connect CV cable');
    try {
      return this.connectCVInner(sourceDeviceId, sourcePortId, targetDeviceId, targetPortId, amount, color);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private connectCVInner(
    sourceDeviceId: string,
    sourcePortId: string,
    targetDeviceId: string,
    targetPortId: string,
    amount: number = 1.0,
    color?: string
  ): string | null {
    const srcDev = this.devices.get(sourceDeviceId);
    const tgtDev = this.devices.get(targetDeviceId);
    if (!srcDev || !tgtDev) return null;

    // Check duplicate
    const duplicate = this.cvConnections.find(
      (c) =>
        c.sourceDeviceId === sourceDeviceId &&
        c.sourcePortId === sourcePortId &&
        c.targetDeviceId === targetDeviceId &&
        c.targetPortId === targetPortId
    );
    if (duplicate) return duplicate.id;

    const cvColors = ['#06b6d4', '#eab308', '#d946ef', '#a855f7', '#22d3ee'];
    const chosenColor = color || cvColors[this.cvConnections.length % cvColors.length];
    const connId = `cv_conn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

    // Register in CV Engine matrix for live modulation calculations and store matrixEntryId
    const matrixEntryId = this.cvEngine.addMatrixEntry({
      sourceDeviceId,
      sourcePortId,
      targetDeviceId,
      targetParam: targetPortId,
      amount,
      offset: 0,
      inverted: false,
    });

    this.cvConnections.push({
      id: connId,
      sourceDeviceId,
      sourcePortId,
      targetDeviceId,
      targetPortId,
      amount,
      color: chosenColor,
      matrixEntryId,
    });

    this.playJackSnapSound();
    this.notify();
    return connId;
  }

  public playJackSnapSound(): void {
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2600, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.02);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }

  public autoPatchAllToMaster(): void {
    // Find all devices with audio outputs that aren't yet plugged into anything
    const mclass = Array.from(this.devices.values()).find((d) => d.type === 'mclass_master');
    const targetId = mclass ? mclass.id : 'master';
    const targetL = mclass ? 'in_l' : 'master_l';
    const targetR = mclass ? 'in_r' : 'master_r';

    this.devices.forEach((dev) => {
      if (dev.id === targetId || dev.type === 'mclass_master') return;
      const hasOutL = dev.ports.some((p) => p.id === 'out_l');
      const hasOutR = dev.ports.some((p) => p.id === 'out_r');

      if (hasOutL && hasOutR) {
        const isLConnected = this.audioConnections.some(
          (c) => c.sourceDeviceId === dev.id && c.sourcePortId === 'out_l'
        );
        const isRConnected = this.audioConnections.some(
          (c) => c.sourceDeviceId === dev.id && c.sourcePortId === 'out_r'
        );

        if (!isLConnected) {
          this.connectAudio(dev.id, 'out_l', targetId, targetL);
        }
        if (!isRConnected) {
          this.connectAudio(dev.id, 'out_r', targetId, targetR);
        }
      }
    });

    this.notify();
  }

  public disconnectCV(connectionId: string): void {
    const undoable = this.beginStructural('Disconnect CV cable');
    try {
      this.disconnectCVInner(connectionId);
    } finally {
      if (undoable) this.endStructural();
    }
  }

  private disconnectCVInner(connectionId: string): void {
    const idx = this.cvConnections.findIndex((c) => c.id === connectionId);
    if (idx === -1) return;

    const conn = this.cvConnections[idx];
    if (conn.matrixEntryId) {
      this.cvEngine.removeMatrixEntry(conn.matrixEntryId);
    } else {
      const fallback = this.cvEngine.matrixEntries.find(
        (m) =>
          m.sourceDeviceId === conn.sourceDeviceId &&
          m.sourcePortId === conn.sourcePortId &&
          m.targetDeviceId === conn.targetDeviceId &&
          m.targetParam === conn.targetPortId
      );
      if (fallback) {
        this.cvEngine.removeMatrixEntry(fallback.id);
      }
    }

    this.cvConnections.splice(idx, 1);
    this.notify();
  }

  // Transport Clock — Driven by Sequencer Song, Arrangement & Pattern Detector
  /** Starts playback at the song position; `startAt` = context time of the first 16th (count-in). */
  public async startTransport(startAt?: number): Promise<void> {
    await this.resumeContext();
    if (this.isPlaying) return;

    // Ensure every playable instrument in the Rack is registered as a Sequencer Track
    this.devices.forEach((dev) => {
      if (this.isPlayableInstrument(dev.type)) {
        this.getOrCreateTrackForDevice(dev.id);
      }
    });

    // NOTE: Play never injects generated patterns. An empty project stays silent.

    this.tracks.forEach((t) => syncTrackPatterns(t, this.activePatternIndex));
    this.isPlaying = true;
    this.transportState.setStatus(this.isRecording ? 'recording' : 'playing');
    this.chaseNextStep = this.noteChaseEnabled;
    this.pendingStopTime = null;
    this.playheadQueue = [];
    this.nextNoteTime = Math.max(this.ctx.currentTime + 0.04, startAt ?? 0);
    if (this.songPosition > 0) {
      this.sendMidiSongPosition(this.songPosition, this.nextNoteTime);
      this.sendMidiTransport(0xfb, this.nextNoteTime);
    } else {
      this.sendMidiTransport(0xfa, this.nextNoteTime);
    }

    if (this.workerTimer) this.workerTimer.stop();
    if (this.realtimeTimer) {
      this.realtimeTimer.stop();
      this.realtimeTimer = null;
    }
    this.workerTimer = createSchedulerTimer(() => {
      if (this.isPlaying) this.scheduler();
    }, this.lookaheadMs);
    // generator players (Beat Map, Quad Note Generator) follow the song
    if (Array.from(this.devices.values()).some((d) => d instanceof SpecDevice && d.engine.player?.tick && d.target)) this.ensurePlayerClock();

    this.notify();
  }


  /** New audio track (records / plays audio clips) wired to its own mixer channel. */
  public createAudioTrack(name?: string): SequencerTrack {
    const n = this.tracks.filter((t) => t.kind === 'audio').length + 1;
    const dev = this.createDevice('audio_track', name || `Audio ${n}`);
    const track = this.getOrCreateTrackForDevice(dev.id, true)!;
    track.kind = 'audio';
    track.group = 'Audio';
    track.arrangementClips = [];
    track.monitor = 'auto';
    track.inputChannel = 'stereo';
    this.connectAudio(dev.id, 'out_l', 'master', 'master_l');
    this.connectAudio(dev.id, 'out_r', 'master', 'master_r');
    this.mixer.apply();
    this.notify();
    return track;
  }

  /**
   * Puts an audio asset on an audio track as a clip at `startBar` (a new audio track when
   * `trackId` is not an audio track). The clip covers the audio at its natural speed.
   */
  public addAudioClip(assetId: string, startBar: number, trackId?: string): { trackId: string; clipId: string } | null {
    const asset = audioStore.get(assetId);
    if (!asset) return null;
    let track = trackId ? this.tracks.find((t) => t.id === trackId && t.kind === 'audio') : undefined;
    if (!track) track = this.createAudioTrack(asset.name);
    const spb = this.stepsPerBar;
    const clip: ArrangementClip = {
      id: newSeqId('clip'),
      kind: 'audio',
      audioId: asset.id,
      startBar: snapBarTo16th(Math.max(0, startBar), spb),
      lengthBars: barsForSeconds(asset.buffer.duration, this.bpm, spb),
      name: asset.name,
      color: track.color,
      audioOffset: 0,
      sourceBpm: asset.sourceBpm ?? asset.detectedBpm,
      // Keep analysis estimates informational until the producer explicitly enables tempo follow.
      warp: asset.sourceBpm ? 'repitch' : 'off',
    };
    if (clip.warp === 'repitch' && asset.sourceBpm) clip.lengthBars = barsForSeconds((asset.buffer.duration * asset.sourceBpm) / this.bpm, this.bpm, spb);
    (track.arrangementClips ??= []).push(clip);
    this.commitEdit();
    this.notify();
    return { trackId: track.id, clipId: clip.id };
  }

  /**
   * Freeze / bounce in place: renders this instrument track's channel offline over the song, puts
   * the result on a new audio track at bar 1 and disables the instrument track (no more CPU for
   * its devices, identical sound). One undo step restores both tracks. Returns the audio track id.
   */
  public async freezeTrack(trackId: string): Promise<string | null> {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track || track.kind === 'audio' || track.disabled || this.isRecording) return null;
    const len = this.renderLength16ths();
    if (len <= 0) return null;
    const before = this.exportProjectJSON();
    const channel = this.mixer.ownerOf(track.deviceId);
    let buffer: AudioBuffer;
    try {
      buffer = await renderSong(this, {
        startPos: 0,
        endPos: len,
        sampleRate: this.ctx.sampleRate,
        tailSec: 2,
        onlyChannels: new Set([channel]),
        stemMode: 'wet',
        masterProcessing: false,
      });
    } catch {
      return null;
    }
    // The project may have changed while the offline render ran.
    const source = this.tracks.find((t) => t.id === trackId);
    if (!source || source.disabled) return null;

    this.suppressUndoCapture = true;
    let audioTrack: SequencerTrack | null = null;
    try {
      const asset = audioStore.add(`${source.name} (frozen)`, buffer);
      audioTrack = this.createAudioTrack(`${source.name} (frozen)`);
      audioTrack.color = source.color;
      audioTrack.frozenFrom = source.id;
      // The render already includes this channel's fader and pan; the bounce plays back at unity.
      audioTrack.volume = 1;
      audioTrack.pan = 0;
      const placed = this.addAudioClip(asset.id, 0, audioTrack.id);
      if (!placed) {
        this.removeDevice(audioTrack.deviceId);
        audioTrack = null;
        return null;
      }
      source.disabled = true;
      source.frozenBy = audioTrack.id;
      this.mixer.apply();
      this.commitEdit();
    } finally {
      this.suppressUndoCapture = false;
    }
    if (!audioTrack) return null;
    const after = this.exportProjectJSON();
    undoJournal.push(
      `freeze:${audioTrack.id}:${performance.now()}`,
      'Freeze track',
      () => this.restoreProject(before),
      () => this.restoreProject(after)
    );
    this.lastTracksJson = this.takeUndoSnapshot();
    this.notify();
    return audioTrack.id;
  }

  /** Removes a frozen render and re-enables the instrument track it replaced. */
  public unfreezeTrack(audioTrackId: string): boolean {    const bounce = this.tracks.find((t) => t.id === audioTrackId && !!t.frozenFrom);
    if (!bounce) return false;
    const before = this.exportProjectJSON();
    this.suppressUndoCapture = true;
    try {
      const source = bounce.frozenFrom ? this.tracks.find((t) => t.id === bounce.frozenFrom) : undefined;
      if (source) {
        source.disabled = false;
        delete source.frozenBy;
      }
      this.removeDevice(bounce.deviceId);
      this.mixer.apply();
      this.commitEdit();
    } finally {
      this.suppressUndoCapture = false;
    }
    const after = this.exportProjectJSON();
    undoJournal.push(
      `unfreeze:${audioTrackId}:${performance.now()}`,
      'Unfreeze track',
      () => this.restoreProject(before),
      () => this.restoreProject(after)
    );
    this.lastTracksJson = this.takeUndoSnapshot();
    this.notify();
    return true;
  }

  /**
   * Delay-compensation slot for one track: shifts its notes and audio clips in time. Positive
   * plays later (adds the child's latency), negative plays earlier (compensates a round trip).
   * Applied live and in every offline render, so exports keep the offset.
   */
  public setTrackOffset(trackId: string, ms: number): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const next = Math.max(-500, Math.min(500, Math.round(Number(ms) || 0)));
    if ((track.offsetMs ?? 0) === next) return;
    track.offsetMs = next;
    this.commitEdit();
  }

  public pauseTransport(): void {
    if (!this.isPlaying) return;
    this.stopMidiOutput();
    this.clipVoices.stopAll();
    this.automation.stopped();
    this.isPlaying = false;
    this.transportState.setStatus('paused');
    if (this.workerTimer) {
      this.workerTimer.stop();
      this.workerTimer = null;
    }
    this.notify();
  }

  public rewindToStart(): void {
    this.seekToSongPosition(0);
  }

  public nextBar(): void {
    this.jumpToSongBar(Math.floor(this.songPosition / this.stepsPerBar) + 1);
  }

  /** Legacy: `step` inside the current pass of the default pattern length. */
  public seekToStep(step: number): void {
    const len = Math.max(16, this.patternLength);
    const base = Math.floor(this.songPosition / len) * len;
    this.seekToSongPosition(base + Math.max(0, Math.min(len - 1, Math.floor(step))));
  }

  public jumpToSongBar(bar: number): void {
    this.seekToSongPosition(Math.max(0, Math.floor(bar)) * this.stepsPerBar);
  }

  /** Moves the song position (16ths). While playing, the next scheduled 16th is this one. */
  public seekToSongPosition(pos16: number): void {
    const pos = Math.max(0, Math.floor(Number(pos16) || 0));
    this.songPosition = pos;
    this.transportState.setPlayhead(pos * TICKS_PER_16TH);
    this.currentSongBar = Math.floor(pos / this.stepsPerBar);
    this.currentStep = pos % Math.max(16, this.patternLength);
    this.activeArrangementSection = `BAR ${this.currentSongBar + 1}`;
    this.playheadQueue = [];
    this.pendingStopTime = null;
    this.launchOrigin.clear();
    this.clipVoices.stopAll();
    if (this.isPlaying) this.chaseNextStep = this.noteChaseEnabled;
    this.notify();
  }

  public stopTransport(): void {
    // Stop the recorder before resetting the playhead; it must capture the final song position
    // to close held MIDI notes and trim audio takes accurately.
    if (this.recorder.state !== 'idle') void this.recorder.stop();
    this.stopMidiOutput();
    this.launchQueue.clear();
    this.launchOrigin.clear();
    this.clipVoices.stopAll();
    this.automation.stopped();
    this.isPlaying = false;
    this.transportState.setStatus('stopped');
    this.transportState.setPlayhead(0);
    this.pendingStopTime = null;
    if (this.workerTimer) {
      this.workerTimer.stop();
      this.workerTimer = null;
    }
    this.refreshRealtimeScheduler();
    this.songPosition = 0;
    this.currentSongBar = 0;
    this.currentStep = 0;
    this.playheadQueue = [];
    this.notify();
  }

  // ---- Song / loop geometry ----
  public get stepsPerBar(): number {
    return stepsPerBar(this.timeSignature);
  }

  /** Bars up to the end of the last clip (at least 1). */
  public get totalSongBars(): number {
    return Math.max(1, Math.ceil(this.arrangementEndBar() - 1e-9));
  }

  /** Bars the arrangement view should show: clips + room to keep painting, never less than the minimum. */
  public get arrangementViewBars(): number {
    return Math.max(this.arrangementMinBars, Math.ceil(this.arrangementEndBar()) + 8, this.currentSongBar + 4);
  }

  /** Effective loop range in bars (R follows the song end while `loopFollowsSong`). */
  public getLoopRange(): { start: number; end: number } {
    const start = Math.max(0, this.loopStartBar);
    const end = this.loopFollowsSong ? Math.max(start + 1, this.totalSongBars) : Math.max(start + 1 / this.stepsPerBar, this.loopEndBar);
    return { start, end };
  }

  public setLoopLocators(startBar: number, endBar: number): void {
    const spb = this.stepsPerBar;
    let s = Math.max(0, snapBarTo16th(Number(startBar) || 0, spb));
    let e = Math.max(0, snapBarTo16th(Number(endBar) || 0, spb));
    if (e < s) [s, e] = [e, s];
    if (e - s < 1 / spb) e = s + 1;
    this.loopStartBar = s;
    this.loopEndBar = e;
    this.loopFollowsSong = false;
    this.transportState.setLoopRange(this.timeMap.meterMap.barToTick(s), this.timeMap.meterMap.barToTick(e), this.loopEnabled);
    this.notify();
  }

  public setLoopFollowsSong(on: boolean): void {
    if (!on) {
      const r = this.getLoopRange();
      this.loopEndBar = r.end;
    } else {
      this.loopStartBar = 0;
    }
    this.loopFollowsSong = on;
    this.notify();
  }

  public setPlaybackMode(mode: PlaybackMode): void {
    if (mode !== 'song_arrangement' && mode !== 'pattern_loop') return;
    this.playbackMode = mode;
    this.pendingStopTime = null;
    if (this.isPlaying) this.chaseNextStep = this.noteChaseEnabled;
    this.notify();
  }

  public setNoteChaseEnabled(enabled: boolean): void {
    this.noteChaseEnabled = !!enabled;
    if (!this.noteChaseEnabled) this.chaseNextStep = false;
    this.notify();
  }

  public addArrangementBars(n: number): void {
    this.arrangementMinBars = Math.max(this.arrangementMinBars, this.arrangementViewBars) + Math.max(1, Math.floor(n));
    this.notify();
  }

  /** Length in 16ths of a full render: the song in Song mode, the longest active pattern in Pattern mode. */
  public renderLength16ths(): number {
    if (this.playbackMode === 'song_arrangement' && (this.blockPlacements.length > 0 || this.tracks.some((t) => (t.arrangementClips || []).some((c) => !c.muted)))) {
      return Math.max(1, Math.ceil(this.arrangementEndBar() * this.stepsPerBar));
    }
    let ticks = this.stepsPerBar * TICKS_PER_16TH;
    this.tracks.forEach((t) => {
      const p = syncTrackPatterns(t, this.activePatternIndex);
      ticks = Math.max(ticks, Math.max(1, p.length) * divisionTicks(p.division));
    });
    return Math.ceil(ticks / TICKS_PER_16TH);
  }

  /** Context time at which song position `pos16` plays (while playing; extrapolated past the queue). */
  public timeOfSongPosition(pos16: number): number | null {
    if (!this.isPlaying) return null;
    const hit = this.playheadQueue.find((q) => q.pos === pos16);
    if (hit) return hit.time;
    return this.nextNoteTime + (this.timeMap.sixteenthToSeconds(pos16) - this.timeMap.sixteenthToSeconds(this.songPosition));
  }

  /** Song position (fractional 16ths) heard at context time `t`. */
  public positionAtTime(t: number): number {
    const q = this.playheadQueue;
    if (!this.isPlaying || q.length === 0) return this.songPosition;
    let i = q.length - 1;
    while (i > 0 && q[i].time > t) i--;
    const cur = q[i];
    const sixteenthDur = Math.max(0.01, this.timeMap.sixteenthToSeconds(cur.pos + 1) - this.timeMap.sixteenthToSeconds(cur.pos));
    if (cur.time > t) return Math.max(0, cur.pos - (cur.time - t) / sixteenthDur);
    const next = q[i + 1];
    if (next && next.pos === cur.pos + 1 && next.time > cur.time) return cur.pos + Math.min(1, (t - cur.time) / (next.time - cur.time));
    return cur.pos + (t - cur.time) / sixteenthDur;
  }

  /** Seconds of the song at the audible playhead. */
  public songSeconds(): number {
    return this.timeMap.sixteenthToSeconds(this.getPlayheadPosition());
  }

  /** Master output before the monitor section (recording / bounce tap). */
  public get masterTap(): AudioNode {
    return this.masterClipper;
  }

  /** Audible song position in 16ths (fractional), from the scheduled-step queue. */
  public getPlayheadPosition(): number {
    if (!this.isPlaying || this.playheadQueue.length === 0) return this.songPosition;
    const now = this.ctx.currentTime;
    const q = this.playheadQueue;
    let i = q.length - 1;
    while (i > 0 && q[i].time > now) i--;
    const cur = q[i];
    if (cur.time > now) return cur.pos;
    const next = q[i + 1];
    if (next && next.pos === cur.pos + 1 && next.time > cur.time) {
      return cur.pos + Math.min(1, (now - cur.time) / (next.time - cur.time));
    }
    return cur.pos + Math.min(1, (now - cur.time) / (60 / this.bpm / 4));
  }

  /** What `track` is playing at the audible position: the pattern (or note clip) and its step. */
  public playheadFor(track: SequencerTrack): { patternId?: string; clipId?: string; step: number } | null {
    syncTrackPatterns(track, this.activePatternIndex);
    const tick = Math.floor(this.getPlayheadPosition() * TICKS_PER_16TH);
    const src = this.sourceForTrack(track, tick, this.launchOrigin.get(track.id));
    if (!src) return null;
    const step = sourceStepAt(src, tick, this.stepsPerBar);
    return src.kind === 'pattern'
      ? { patternId: src.pattern.id, clipId: src.clip?.id, step }
      : { clipId: src.clip.id, step };
  }

  private applySequencerSettings(s: unknown): void {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    this.playbackMode = o.playbackMode === 'pattern_loop' ? 'pattern_loop' : 'song_arrangement';
    this.noteChaseEnabled = o.noteChaseEnabled !== false;
    this.loopEnabled = o.loopEnabled !== false;
    this.loopStartBar = typeof o.loopStartBar === 'number' && o.loopStartBar >= 0 ? o.loopStartBar : 0;
    this.loopEndBar = typeof o.loopEndBar === 'number' && o.loopEndBar > this.loopStartBar ? o.loopEndBar : this.loopStartBar + 4;
    this.loopFollowsSong = typeof o.loopFollowsSong === 'boolean' ? o.loopFollowsSong : true;
    this.arrangementMinBars = typeof o.arrangementMinBars === 'number' ? Math.max(8, Math.min(100000, o.arrangementMinBars)) : 32;
    this.arrangementMarkers = Array.isArray(o.markers)
      ? (o.markers as ProjectMarker[]).filter((m) => m && typeof m.bar === 'number' && typeof m.name === 'string')
      : [];
    if (typeof o.activePatternIndex === 'number') this.activePatternIndex = Math.max(0, Math.floor(o.activePatternIndex));
  }

  public async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.pauseTransport();
    } else {
      await this.startTransport();
    }
  }

  public rewindTransport(steps: number = 4): void {
    this.seekToSongPosition(this.songPosition - steps);
  }

  public fastForwardTransport(steps: number = 4): void {
    this.seekToSongPosition(this.songPosition + steps);
  }

  public toggleLoop(): void {
    this.loopEnabled = !this.loopEnabled;
    this.notify();
  }

  public setBpm(newBpm: number): void {
    this.bpm = Math.max(30, Math.min(300, newBpm));
    this.timeMap.tempoMap.setRootBpm(this.bpm);
    this.notify();
  }

  public setTimeSignature(sig: '4/4' | '3/4' | '5/4' | '7/8' | '6/8'): void {
    this.timeSignature = sig;
    const parts = sig.split('/').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      this.timeMap.meterMap.setRootMeter(parts[0], parts[1]);
    }
    this.notify();
  }

  private scheduler(): void {
    this.automation.pump(this.ctx.currentTime);
    this.serviceRealtimeTasks();
    if (this.pendingStopTime !== null) {
      // Song end reached (loop off): stop once the last scheduled 16th has been heard.
      if (this.ctx.currentTime >= this.pendingStopTime) this.stopTransport();
      return;
    }
    while (this.isPlaying && this.pendingStopTime === null && this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.songPosition, this.nextNoteTime);
      this.advanceStep();
    }
  }

  /**
   * Registers a device look-ahead callback. These are only serviced by their
   * own worker timer while stopped; during playback the transport scheduler
   * services the same set, so there is never a second timing authority.
   */
  private requestRealtime(callback: (now: number, until: number) => boolean): () => void {
    this.realtimeTasks.add(callback);
    this.serviceRealtimeTasks();
    return () => {
      this.realtimeTasks.delete(callback);
      this.refreshRealtimeScheduler();
    };
  }

  private serviceRealtimeTasks(): void {
    if (!this.realtimeTasks.size) {
      this.refreshRealtimeScheduler();
      return;
    }
    const now = this.ctx.currentTime;
    const until = now + Math.max(0.15, this.scheduleAheadTime);
    for (const task of Array.from(this.realtimeTasks)) {
      try {
        if (!task(now, until)) this.realtimeTasks.delete(task);
      } catch {
        // A device being disposed must not be able to take down the shared scheduler.
        this.realtimeTasks.delete(task);
      }
    }
    this.refreshRealtimeScheduler();
  }

  private refreshRealtimeScheduler(): void {
    if (this.isPlaying || this.realtimeTasks.size === 0) {
      if (this.realtimeTimer) {
        this.realtimeTimer.stop();
        this.realtimeTimer = null;
      }
      return;
    }
    if (!this.realtimeTimer) {
      this.realtimeTimer = createSchedulerTimer(() => {
        if (!this.isPlaying) this.serviceRealtimeTasks();
      }, this.lookaheadMs);
    }
  }

  /**
   * Legacy global length: sets the default for new patterns and resizes the ACTIVE pattern of
   * every track (per-pattern lengths: `sequencer.setPatternLength`).
   */
  public setPatternLength(len: number): void {
    this.patternLength = clampLength(len);
    this.tracks.forEach((t) => {
      const p = syncTrackPatterns(t, this.activePatternIndex);
      this.sequencer.setPatternLength(t.id, p.id, this.patternLength, false);
    });
    this.notify();
  }

  public setGlobalSwing(swing: number): void {
    this.globalSwing = Math.max(0, Math.min(1, swing));
    this.notify();
  }

  // Sequencer Track Methods
  public createTrackFolder(trackId: string, name?: string): TrackFolder | null {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return null;
    const current = this.trackFolders.find((f) => f.id === track.folderId);
    if (current) return current;
    const folder: TrackFolder = {
      id: newSeqId('folder'),
      name: name?.trim() || `Folder ${this.trackFolders.length + 1}`,
      collapsed: false,
    };
    this.trackFolders.push(folder);
    this.setTrackFolder(trackId, folder.id);
    return folder;
  }

  /** Assigns a track to a folder and keeps each folder's members adjacent in the song. */
  public setTrackFolder(trackId: string, folderId?: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const nextFolderId = folderId && this.trackFolders.some((f) => f.id === folderId) ? folderId : undefined;
    if (track.folderId === nextFolderId) return;
    const previousFolderId = track.folderId;
    const oldIndex = this.tracks.indexOf(track);
    this.tracks.splice(oldIndex, 1);
    track.folderId = nextFolderId;
    let insertAt = Math.min(oldIndex, this.tracks.length);
    if (nextFolderId) {
      const lastMember = this.tracks.reduce((last, t, i) => (t.folderId === nextFolderId ? i : last), -1);
      if (lastMember >= 0) insertAt = lastMember + 1;
    }
    this.tracks.splice(insertAt, 0, track);
    if (previousFolderId) this.trackFolders = this.trackFolders.filter((f) => f.id !== previousFolderId || this.tracks.some((t) => t.folderId === f.id));
    this.commitEdit();
  }

  public renameTrackFolder(folderId: string, name: string): void {
    const folder = this.trackFolders.find((f) => f.id === folderId);
    const clean = name.trim();
    if (!folder || !clean || folder.name === clean) return;
    const previousName = folder.name;
    folder.name = clean;
    folder.clips?.forEach((clip) => {
      if (clip.name === previousName) clip.name = clean;
    });
    this.commitEdit();
  }

  public toggleTrackFolder(folderId: string): void {
    const folder = this.trackFolders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.collapsed = !folder.collapsed;
    this.commitEdit();
  }

  /** Deletes the folder row and leaves its member tracks in the same timeline order. */
  public deleteTrackFolder(folderId: string): void {
    if (!this.trackFolders.some((f) => f.id === folderId)) return;
    this.tracks.forEach((t) => {
      if (t.folderId === folderId) delete t.folderId;
    });
    this.trackFolders = this.trackFolders.filter((f) => f.id !== folderId);
    this.commitEdit();
  }

  /** Makes a folder region spanning its current member clips. */
  public createTrackFolderClip(folderId: string): FolderClip | null {
    const folder = this.trackFolders.find((f) => f.id === folderId);
    if (!folder) return null;
    const clips = this.tracks.filter((t) => t.folderId === folderId).flatMap((t) => t.arrangementClips || []);
    if (!clips.length) return null;
    const range = clips.reduce((r, clip) => ({ start: Math.min(r.start, clip.startBar), end: Math.max(r.end, clip.startBar + clip.lengthBars) }), { start: Number.POSITIVE_INFINITY, end: 0 });
    const startBar = range.start;
    const endBar = range.end;
    const existing = (folder.clips || []).find((c) => Math.abs(c.startBar - startBar) < 1e-6 && Math.abs(c.lengthBars - (endBar - startBar)) < 1e-6);
    if (existing) return existing;
    const grouped: FolderClip = {
      id: newSeqId('folder_clip'),
      startBar,
      lengthBars: Math.max(1 / this.stepsPerBar, endBar - startBar),
      name: folder.name,
    };
    (folder.clips ??= []).push(grouped);
    this.commitEdit();
    return grouped;
  }

  /** Moves a folder region and every member clip fully inside it by the same bar offset. */
  public moveTrackFolderClip(folderId: string, clipId: string, startBar: number): void {
    const folder = this.trackFolders.find((f) => f.id === folderId);
    const grouped = folder?.clips?.find((c) => c.id === clipId);
    if (!folder || !grouped) return;
    const nextStart = Math.max(0, snapBarTo16th(startBar, this.stepsPerBar));
    const delta = nextStart - grouped.startBar;
    if (Math.abs(delta) < 1e-9) return;
    const end = grouped.startBar + grouped.lengthBars;
    this.tracks.filter((t) => t.folderId === folderId).forEach((t) => {
      (t.arrangementClips || []).forEach((clip) => {
        if (clip.startBar >= grouped.startBar - 1e-6 && clip.startBar + clip.lengthBars <= end + 1e-6) clip.startBar += delta;
      });
    });
    grouped.startBar = nextStart;
    this.commitEdit();
  }

  public deleteTrackFolderClip(folderId: string, clipId: string): void {
    const folder = this.trackFolders.find((f) => f.id === folderId);
    if (!folder?.clips?.some((c) => c.id === clipId)) return;
    folder.clips = (folder.clips || []).filter((c) => c.id !== clipId);
    this.commitEdit();
  }

  // Song Blocks: reusable scene sections placed on a shared song lane.
  public createSongBlock(
    name?: string,
    sourcePatternIndex = this.activePatternIndex,
    sourceRange?: { startBar: number; endBar: number }
  ): SongBlock | null {
    const sourceIndex = Math.max(0, Math.min(4095, Math.floor(sourcePatternIndex)));
    const index = Math.max(sourceIndex + 1, ...this.tracks.map((track) => (track.patternList?.length ?? 1)), 1);
    if (index > 4095) return null;
    const rangeStart = sourceRange ? Math.max(0, snapBarTo16th(sourceRange.startBar, this.stepsPerBar)) : undefined;
    const rangeEnd = sourceRange ? Math.max(0, snapBarTo16th(sourceRange.endBar, this.stepsPerBar)) : undefined;
    if (rangeStart !== undefined && rangeEnd !== undefined && rangeEnd <= rangeStart) return null;
    const cleanName = name?.trim() || `Block ${this.songBlocks.length + 1}`;
    const capturedAutomation = rangeStart !== undefined && rangeEnd !== undefined
      ? this.automation.lanes.flatMap((lane): AutoLane[] => {
          if (!lane.points.length) return [];
          const startPos = rangeStart * this.stepsPerBar;
          const endPos = rangeEnd * this.stepsPerBar;
          const startValue = valueAt(lane.points, startPos);
          const endValue = valueAt(lane.points, endPos);
          if (startValue === null || endValue === null) return [];
          const startSource = lane.points.find((point) => Math.abs(point.pos - startPos) < 1e-6);
          const endSource = lane.points.find((point) => Math.abs(point.pos - endPos) < 1e-6);
          const points: AutoPoint[] = [
            startSource ? { ...startSource, pos: 0 } : { pos: 0, value: startValue },
            ...lane.points.filter((point) => point.pos > startPos + 1e-6 && point.pos < endPos - 1e-6).map((point) => ({ ...point, pos: point.pos - startPos })),
            endSource ? { ...endSource, pos: endPos - startPos } : { pos: endPos - startPos, value: endValue },
          ];
          return [{ ...lane, target: { ...lane.target }, points }];
        })
      : undefined;
    this.tracks.forEach((track) => {
      const active = syncTrackPatterns(track, this.activePatternIndex);
      const list = track.patternList!;
      const source = list[sourceIndex] || active;
      while (list.length < index) {
        list.push(makePattern({
          name: `Pattern ${list.length + 1}`,
          color: PATTERN_COLORS[list.length % PATTERN_COLORS.length],
          length: active.length,
          division: active.division,
        }));
      }
      list.push(makePattern({
        name: cleanName,
        color: PATTERN_COLORS[index % PATTERN_COLORS.length],
        length: source.length,
        division: source.division,
        steps: cloneSteps(source.steps),
      }));
    });
    const block: SongBlock = {
      id: newSeqId('block'),
      name: cleanName,
      patternIndex: index,
      color: PATTERN_COLORS[index % PATTERN_COLORS.length],
      lengthBars: rangeStart !== undefined && rangeEnd !== undefined ? rangeEnd - rangeStart : 4,
      audioClipsByTrack: rangeStart !== undefined && rangeEnd !== undefined
        ? Object.fromEntries(this.tracks.filter((track) => track.kind === 'audio').map((track) => [
            track.id,
            (track.arrangementClips || [])
              .filter((clip) => (clip.kind === 'audio' || !!clip.audioId) && clip.startBar < rangeEnd - 1e-6 && clip.startBar + clip.lengthBars > rangeStart + 1e-6)
              .map((clip) => {
                const copied = { ...cloneClip(clip), id: newSeqId('block_audio'), kind: 'audio' as const };
                const originalEnd = clip.startBar + clip.lengthBars;
                const capturedStart = Math.max(clip.startBar, rangeStart);
                const capturedEnd = Math.min(originalEnd, rangeEnd);
                const cutFromStart = capturedStart - clip.startBar;
                copied.startBar = Math.max(0, capturedStart - rangeStart);
                copied.lengthBars = capturedEnd - capturedStart;
                if (cutFromStart > 1e-6) {
                  const sourcePerBar = secPerBar(this.bpm, this.stepsPerBar) * audioClipRate(clip, this.bpm);
                  copied.audioOffset = (clip.audioOffset ?? 0) + cutFromStart * sourcePerBar;
                  copied.fadeIn = undefined;
                }
                if (capturedEnd < originalEnd - 1e-6) copied.fadeOut = undefined;
                return copied;
              }),
          ]))
        : undefined,
      automationLanes: capturedAutomation,
    };
    this.songBlocks.push(block);
    this.commitEdit();
    return block;
  }

  public renameSongBlock(blockId: string, name: string): void {
    const block = this.songBlocks.find((b) => b.id === blockId);
    const clean = name.trim();
    if (!block || !clean || block.name === clean) return;
    block.name = clean;
    this.commitEdit();
  }

  public updateSongBlockAudioClip(
    blockId: string,
    trackId: string,
    clipId: string,
    patch: Partial<Pick<ArrangementClip, 'startBar' | 'lengthBars' | 'name' | 'gainDb' | 'fadeIn' | 'fadeOut' | 'reverse' | 'pitch' | 'warp' | 'sourceBpm' | 'loopAudio' | 'loopSec' | 'audioOffset' | 'muted'>>,
  ): void {
    const block = this.songBlocks.find((item) => item.id === blockId);
    const clip = block?.audioClipsByTrack?.[trackId]?.find((item) => item.id === clipId);
    if (!block || !clip) return;
    const blockLength = block.lengthBars ?? 4;
    const minLength = 1 / this.stepsPerBar;
    const requestedStart = Number.isFinite(patch.startBar) ? patch.startBar! : clip.startBar;
    const requestedLength = Number.isFinite(patch.lengthBars) ? patch.lengthBars! : clip.lengthBars;
    const startBar = Math.max(0, Math.min(Math.max(0, blockLength - minLength), snapBarTo16th(requestedStart, this.stepsPerBar)));
    const lengthBars = Math.max(minLength, Math.min(blockLength - startBar, snapBarTo16th(requestedLength, this.stepsPerBar)));
    const safePatch = { ...patch, startBar, lengthBars };
    if (safePatch.name !== undefined) safePatch.name = safePatch.name.slice(0, 64);
    if (safePatch.gainDb !== undefined) safePatch.gainDb = Number.isFinite(safePatch.gainDb) ? Math.max(-60, Math.min(24, safePatch.gainDb)) : clip.gainDb;
    if (safePatch.fadeIn !== undefined) safePatch.fadeIn = Number.isFinite(safePatch.fadeIn) ? Math.max(0, safePatch.fadeIn) : clip.fadeIn;
    if (safePatch.fadeOut !== undefined) safePatch.fadeOut = Number.isFinite(safePatch.fadeOut) ? Math.max(0, safePatch.fadeOut) : clip.fadeOut;
    if (safePatch.pitch !== undefined) safePatch.pitch = Number.isFinite(safePatch.pitch) ? Math.max(-24, Math.min(24, safePatch.pitch)) : clip.pitch;
    if (safePatch.audioOffset !== undefined) {
      const asset = audioStore.get(clip.audioId);
      const rate = audioClipRate({ ...clip, ...safePatch }, this.bpm);
      const sourceSpan = clip.loopAudio ? Math.max(0.01, clip.loopSec ?? 0.01) : lengthBars * secPerBar(this.bpm, this.stepsPerBar) * rate;
      const maxOffset = asset ? Math.max(0, asset.buffer.duration - sourceSpan) : Number.MAX_SAFE_INTEGER;
      safePatch.audioOffset = Number.isFinite(safePatch.audioOffset) ? Math.max(0, Math.min(maxOffset, safePatch.audioOffset)) : clip.audioOffset;
    }
    Object.assign(clip, safePatch, { kind: 'audio' as const });
    this.commitEdit();
  }

  public deleteSongBlockAudioClip(blockId: string, trackId: string, clipId: string): void {
    const block = this.songBlocks.find((item) => item.id === blockId);
    const clips = block?.audioClipsByTrack?.[trackId];
    if (!block || !clips?.some((clip) => clip.id === clipId)) return;
    block.audioClipsByTrack![trackId] = clips.filter((clip) => clip.id !== clipId);
    this.commitEdit();
  }

  public updateSongBlockAutomation(blockId: string, laneId: string, points: AutoPoint[]): void {
    const block = this.songBlocks.find((item) => item.id === blockId);
    const lane = block?.automationLanes?.find((item) => item.id === laneId);
    if (!block || !lane) return;
    const endPos = (block.lengthBars ?? 4) * this.stepsPerBar;
    lane.points = sortPoints(points
      .filter((point) => Number.isFinite(point.pos) && Number.isFinite(point.value))
      .map((point) => ({
        ...point,
        pos: Math.max(0, Math.min(endPos, point.pos)),
        value: Math.max(0, Math.min(1, point.value)),
        curve: Number.isFinite(point.curve) ? Math.max(-1, Math.min(1, point.curve!)) : undefined,
        hold: typeof point.hold === 'boolean' ? point.hold : undefined,
      })));
    this.commitEdit();
  }

  public deleteSongBlockAutomationLane(blockId: string, laneId: string): void {
    const block = this.songBlocks.find((item) => item.id === blockId);
    if (!block?.automationLanes?.some((lane) => lane.id === laneId)) return;
    block.automationLanes = block.automationLanes.filter((lane) => lane.id !== laneId);
    block.automationDisabledLaneIds = [...new Set([...(block.automationDisabledLaneIds ?? []), laneId])];
    this.commitEdit();
  }

  public placeSongBlock(blockId: string, startBar: number, lengthBars?: number): SongBlockPlacement | null {
    const block = this.songBlocks.find((b) => b.id === blockId);
    if (!block) return null;
    const placement: SongBlockPlacement = {
      id: newSeqId('block_placement'),
      blockId,
      startBar: Math.max(0, snapBarTo16th(startBar, this.stepsPerBar)),
      lengthBars: Math.max(1 / this.stepsPerBar, snapBarTo16th(lengthBars ?? block.lengthBars ?? 4, this.stepsPerBar)),
    };
    this.blockPlacements.push(placement);
    this.commitEdit();
    return placement;
  }

  public moveSongBlockPlacement(placementId: string, startBar: number): void {
    const placement = this.blockPlacements.find((b) => b.id === placementId);
    if (!placement) return;
    const next = Math.max(0, snapBarTo16th(startBar, this.stepsPerBar));
    if (Math.abs(next - placement.startBar) < 1e-9) return;
    placement.startBar = next;
    this.commitEdit();
  }

  public resizeSongBlockPlacement(placementId: string, lengthBars: number): void {
    const placement = this.blockPlacements.find((b) => b.id === placementId);
    if (!placement) return;
    const next = Math.max(1 / this.stepsPerBar, snapBarTo16th(lengthBars, this.stepsPerBar));
    if (Math.abs(next - placement.lengthBars) < 1e-9) return;
    placement.lengthBars = next;
    this.commitEdit();
  }

  public duplicateSongBlockPlacement(placementId: string, copies = 1): void {
    const placement = this.blockPlacements.find((b) => b.id === placementId);
    if (!placement) return;
    const count = Math.max(1, Math.min(64, Math.floor(copies)));
    for (let i = 1; i <= count; i++) {
      this.blockPlacements.push({
        ...placement,
        id: newSeqId('block_placement'),
        startBar: placement.startBar + placement.lengthBars * i,
      });
    }
    this.commitEdit();
  }

  public deleteSongBlockPlacement(placementId: string): void {
    const next = this.blockPlacements.filter((b) => b.id !== placementId);
    if (next.length === this.blockPlacements.length) return;
    this.blockPlacements = next;
    this.commitEdit();
  }

  public deleteSongBlock(blockId: string): void {
    if (!this.songBlocks.some((b) => b.id === blockId)) return;
    this.songBlocks = this.songBlocks.filter((b) => b.id !== blockId);
    this.blockPlacements = this.blockPlacements.filter((b) => b.blockId !== blockId);
    this.commitEdit();
  }

  /** Song end includes both arrangement clips and placed Blocks. */
  public arrangementEndBar(): number {
    return Math.max(
      songEndBar(this.tracks),
      ...this.blockPlacements.map((b) => b.startBar + b.lengthBars),
      0
    );
  }

  /** Block occurrence under the playhead; later-starting overlaps take priority. */
  public songBlockAtTick(tick: number): { placement: SongBlockPlacement; block: SongBlock } | null {
    let chosen: SongBlockPlacement | undefined;
    for (const placement of this.blockPlacements) {
      const start = Math.round(placement.startBar * this.stepsPerBar * TICKS_PER_16TH);
      const end = Math.round((placement.startBar + placement.lengthBars) * this.stepsPerBar * TICKS_PER_16TH);
      if (tick >= start && tick < end && (!chosen || placement.startBar >= chosen.startBar)) chosen = placement;
    }
    const block = chosen && this.songBlocks.find((b) => b.id === chosen.blockId);
    return chosen && block ? { placement: chosen, block } : null;
  }

  private songBlockForAutomationAtPosition(pos: number): { placement: SongBlockPlacement; block: SongBlock } | null {
    if (this.playbackMode !== 'song_arrangement') return null;
    const tick = pos * TICKS_PER_16TH;
    const active = this.songBlockAtTick(tick);
    if (active || pos <= 0) return active;
    const previous = this.songBlockAtTick(Math.max(0, Math.round(tick) - 1));
    return previous && Math.abs((previous.placement.startBar + previous.placement.lengthBars) * this.stepsPerBar - pos) < 1e-6
      ? previous
      : null;
  }

  /** Automation lanes that should be read at an absolute song position, including Block copies. */
  public automationLanesAtPosition(pos: number): AutoLane[] {
    const base = this.automation.lanes;
    const active = this.songBlockForAutomationAtPosition(pos);
    if (!active) return base;
    const startPos = active.placement.startBar * this.stepsPerBar;
    const byId = new Map(base.map((lane) => [lane.id, lane]));
    for (const laneId of active.block.automationDisabledLaneIds ?? []) {
      const current = byId.get(laneId);
      if (current) byId.set(laneId, { ...current, points: [], mode: 'off' });
    }
    for (const captured of active.block.automationLanes ?? []) {
      const current = byId.get(captured.id);
      byId.set(captured.id, {
        ...captured,
        target: current?.target ?? captured.target,
        mode: current?.mode ?? 'read',
        trackId: current?.trackId ?? captured.trackId,
        visible: current?.visible ?? captured.visible,
        points: captured.points.map((point) => ({ ...point, pos: point.pos + startPos })),
      });
    }
    return [...byId.values()];
  }

  /** Normalized automation value at an absolute song position, with Block content taking priority. */
  public automationValueAt(laneId: string, pos: number): number | null {
    const lane = this.automation.lanes.find((item) => item.id === laneId);
    const active = this.songBlockForAutomationAtPosition(pos);
    if (active?.block.automationDisabledLaneIds?.includes(laneId)) return null;
    const captured = active?.block.automationLanes?.find((item) => item.id === laneId);
    if (active && captured) return valueAt(captured.points, pos - active.placement.startBar * this.stepsPerBar);
    if (lane) return valueAt(lane.points, pos);
    return null;
  }

  /** Union of the live lanes and captured Block lanes, for song export scheduling. */
  public automationLanesForSong(): AutoLane[] {
    const byId = new Map(this.automation.lanes.map((lane) => [lane.id, lane]));
    if (this.playbackMode === 'song_arrangement') {
      for (const block of this.songBlocks) {
        for (const lane of block.automationLanes ?? []) {
          const current = byId.get(lane.id);
          if (!current) byId.set(lane.id, { ...lane, mode: 'read' });
          else if (!current.points.length && lane.points.length) byId.set(lane.id, { ...lane, target: current.target, mode: current.mode });
        }
      }
    }
    return [...byId.values()];
  }

  /** Audio source clips for a track at one song tick. A Block replaces the song lane in its span. */
  public audioClipsForTrack(track: SequencerTrack, tick: number): ArrangementClip[] {
    if (this.playbackMode !== 'song_arrangement') {
      const clips = track.arrangementClips ?? [];
      if (clips.length === 0) return [];
      const spb = this.stepsPerBar;
      const ticksPerBar = spb * TICKS_PER_16TH;
      const active = syncTrackPatterns(track, this.activePatternIndex);
      const loopBars = Math.max(1, Math.ceil(active.length / spb));
      const currentBar = Math.floor(tick / ticksPerBar) % loopBars;
      return clips.filter((c) => c.startBar <= currentBar && c.startBar + c.lengthBars > currentBar);
    }
    const active = this.songBlockAtTick(tick);
    if (!active) return track.arrangementClips ?? [];
    const { placement, block } = active;
    const source = block.audioClipsByTrack?.[track.id] ?? [];
    return source.flatMap((clip) => {
      const startBar = placement.startBar + clip.startBar;
      const remaining = placement.startBar + placement.lengthBars - startBar;
      const lengthBars = Math.min(clip.lengthBars, remaining);
      if (lengthBars <= 1e-9) return [];
      return [{ ...clip, id: `${placement.id}:${clip.id}`, startBar, lengthBars }];
    });
  }

  /** Resolve instrument notes from a placed Block before regular arrangement clips. */
  public sourceForTrack(track: SequencerTrack, tick: number, patternOrigin?: number): PlaySource | null {
    const active = syncTrackPatterns(track, this.activePatternIndex);
    if (this.playbackMode === 'song_arrangement') {
      const occurrence = this.songBlockAtTick(tick);
      if (occurrence) {
        const { placement: chosen, block } = occurrence;
        const list = track.patternList!;
        while (list.length <= block.patternIndex) {
          list.push(makePattern({
            name: `Pattern ${list.length + 1}`,
            color: PATTERN_COLORS[list.length % PATTERN_COLORS.length],
            length: active.length,
            division: active.division,
          }));
        }
        const pattern = list[block.patternIndex];
        const origin = Math.round(chosen.startBar * this.stepsPerBar * TICKS_PER_16TH);
        return resolveSource(track, pattern, tick, 'pattern_loop', this.stepsPerBar, origin);
      }
    }
    return resolveSource(track, active, tick, this.playbackMode, this.stepsPerBar, patternOrigin);
  }

  public getOrCreateTrackForDevice(deviceId: string, force = false): SequencerTrack | null {
    const dev = this.devices.get(deviceId);
    if (!dev || (!force && !this.isPlayableInstrument(dev.type))) return null;
    let track = this.tracks.find((t) => t.deviceId === deviceId);
    if (!track) {
      const colors = ['#10b981', '#059669', '#34d399', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
      const specEngine = dev instanceof SpecDevice ? dev.spec.engine : null;
      const isDrum =
        dev.type === 'redrum' ||
        dev.type === 'dhol' ||
        dev.type === 'tabla' ||
        specEngine === 'drums' ||
        specEngine === 'groove' ||
        specEngine === 'loops' ||
        (specEngine === 'multisample' && !!(dev as SpecDevice).spec.pads?.length);
      const isSynth =
        dev.type === 'three_osc' ||
        dev.type === 'sytrus' ||
        dev.type === 'flex' ||
        dev.type === 'subtractor' ||
        dev.type === 'thor' ||
        dev.type === 'europa' ||
        dev.type === 'monotone' ||
        dev.type === 'wyvern' ||
        dev.type === 'ember' ||
        dev.type === 'malstrom' ||
        dev.type === 'algoritm' ||
        dev.type === 'complex1' ||
        dev.type === 'parsec2' ||
        dev.type === 'polytone' ||
        dev.type === 'objekt' ||
        specEngine === 'poly' ||
        specEngine === 'wavetable' ||
        specEngine === 'fm' ||
        specEngine === 'westcoast';
      const isWorld =
        dev.type === 'world_instrument' ||
        dev.type === 'percussion_electronic' ||
        dev.type === 'bansuri' ||
        dev.type === 'harmonium' ||
        dev.type === 'tanpura' ||
        dev.type === 'tumbi' ||
        dev.type === 'friktion' ||
        dev.type === 'pangea' ||
        dev.type === 'klang' ||
        dev.type === 'humana';
      const stepsCount = Math.max(16, this.patternLength);
      const trackColor = colors[this.tracks.length % colors.length];
      const firstPattern = makePattern({ name: 'Pattern 1', color: PATTERN_COLORS[0], length: stepsCount });
      track = {
        id: `track_${deviceId}`,
        deviceId,
        name: dev.name,
        color: trackColor,
        mute: false,
        solo: false,
        volume: 0.85,
        pan: 0,
        mixerTrack: this.tracks.length + 1,
        swingMix: 0,
        group: isDrum ? 'Drums' : isSynth ? 'Synths' : isWorld ? 'World' : 'Samplers',
        pitchOffset: 0,
        cutoff: 0.8,
        resonance: 0.3,
        steps: firstPattern.steps,
        patternList: [firstPattern],
        activePatternId: firstPattern.id,
        // One 4-bar clip so Song mode plays the first pattern straight away.
        arrangementClips: [
          {
            id: newSeqId('clip'),
            kind: 'pattern',
            startBar: 0,
            lengthBars: 4,
            patternId: firstPattern.id,
            name: '',
            color: trackColor,
          },
        ],
        // Graph lanes exist only once drawn (Graph & CC editor); empty = the device's own knobs rule.
        graphData: {},
      };
      this.tracks.push(track);
      this.getOrCreateTrackStrip(deviceId);
      this.updateTrackChannelStrip(track.id);
      this.notify();
    }
    return track;
  }

  /** Writes one step of the track's ACTIVE pattern (grows the pattern when writing past its end). */
  public setTrackStep(trackId: string, stepIndex: number, note: SequencerNote | null): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const p = syncTrackPatterns(track, this.activePatternIndex);
    const idx = Math.floor(stepIndex);
    if (idx < 0) return;
    if (idx >= p.length) {
      if (!note) return;
      this.sequencer.setPatternLength(track.id, p.id, idx + 1, false);
    }
    track.steps[idx] = note;
    this.notify();
  }

  public clearTrackSteps(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    syncTrackPatterns(track, this.activePatternIndex);
    track.steps.fill(null);
    this.notify();
  }

  public cloneTrack(trackId: string): void {
    const orig = this.tracks.find((t) => t.id === trackId);
    if (!orig) return;
    const origDev = this.devices.get(orig.deviceId);
    if (!origDev) return;
    syncTrackPatterns(orig, this.activePatternIndex);

    // An independent instrument instance so the copy never fights over DSP state or voices.
    const clonedDev =
      origDev instanceof VstPluginDevice
        ? this.createVstDevice(origDev.toProjectData().snapshot, { name: `${orig.name} (Copy)` })
        : this.createDevice(
            origDev.type,
            `${orig.name} (Copy)`,
            typeof origDev.params.subVoice === 'string' && origDev.params.subVoice ? origDev.params.subVoice : undefined,
          );
    Object.entries(origDev.params).forEach(([k, v]) => {
      if (typeof v === 'number') clonedDev.setParam(k, v);
    });
    const clonedTrack = this.tracks.find((t) => t.deviceId === clonedDev.id);
    if (!clonedTrack) return;
    clonedTrack.volume = orig.volume;
    clonedTrack.pan = orig.pan;
    clonedTrack.pitchOffset = orig.pitchOffset;
    clonedTrack.cutoff = orig.cutoff;
    clonedTrack.resonance = orig.resonance;
    const idMap = new Map<string, string>();
    clonedTrack.patternList = (orig.patternList || []).map((p) => {
      const copy = makePattern({ name: p.name, color: p.color, length: p.length, division: p.division, steps: cloneSteps(p.steps) });
      idMap.set(p.id, copy.id);
      return copy;
    });
    clonedTrack.activePatternId = idMap.get(orig.activePatternId || '') || clonedTrack.patternList[0]?.id;
    const active = findPattern(clonedTrack, clonedTrack.activePatternId);
    if (active) clonedTrack.steps = active.steps;
    clonedTrack.arrangementClips = (orig.arrangementClips || []).map((c) => ({
      ...cloneClip(c),
      id: newSeqId('clip'),
      patternId: c.patternId ? idMap.get(c.patternId) : undefined,
      color: clonedTrack.color,
    }));
    if (orig.graphData) {
      clonedTrack.graphData = JSON.parse(JSON.stringify(orig.graphData));
    }
    if (orig.folderId) this.setTrackFolder(clonedTrack.id, orig.folderId);
    this.updateTrackChannelStrip(clonedTrack.id);
    this.notify();
  }

  public toggleTrackMute(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.mute = !track.mute;
    this.updateTrackChannelStrip(track.id);
    this.notify();
  }

  public toggleTrackSolo(trackId: string): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.solo = !track.solo;
    this.updateTrackChannelStrip();
    this.notify();
  }

  public playSingleTrackSolo(trackId: string): void {
    this.tracks.forEach((t) => {
      t.solo = t.id === trackId;
      if (t.id === trackId) t.mute = false;
    });
    this.updateTrackChannelStrip();
    if (!this.isPlaying) {
      this.startTransport();
    } else {
      this.notify();
    }
  }

  public playAllTracksTogether(): void {
    this.tracks.forEach((t) => {
      t.solo = false;
      t.mute = false;
    });
    this.updateTrackChannelStrip();
    if (!this.isPlaying) {
      this.startTransport();
    } else {
      this.notify();
    }
  }

  /**
   * Scene switch: every track selects its pattern at list position `index` (missing patterns
   * are created empty, so scenes 1..n line up across tracks). No upper limit.
   */
  /** Clip launcher queue (key → launch) and where each launched pattern restarts (track id → tick). */
  private launchQueue = new Map<string, { grid: number; fire: (pos16: number) => void }>();
  private launchOrigin = new Map<string, number>();

  /**
   * Clip / scene launch: runs `run` at the next multiple of `grid` 16ths (≤ 1 or stopped = now) and
   * restarts the patterns of `trackIds` from their first step there. Same key = replaces the queued launch.
   */
  public launchQuantized(key: string, grid: number, trackIds: string[], run: () => void): void {
    const fire = (pos16: number) => {
      this.launchQueue.delete(key);
      run();
      trackIds.forEach((id) => this.launchOrigin.set(id, pos16 * TICKS_PER_16TH));
      this.notify();
    };
    if (!this.isPlaying || grid <= 1) fire(this.songPosition);
    else {
      this.launchQueue.set(key, { grid, fire });
      this.notify();
    }
  }

  public isLaunchQueued(key: string): boolean {
    return this.launchQueue.has(key);
  }

  public switchPatternBank(newIndex: number): void {
    const idx = Math.floor(newIndex);
    if (!(idx >= 0) || idx > 4095) return;
    this.tracks.forEach((t) => {
      const active = syncTrackPatterns(t, this.activePatternIndex);
      const list = t.patternList!;
      while (list.length <= idx) {
        list.push(
          makePattern({
            name: `Pattern ${list.length + 1}`,
            color: PATTERN_COLORS[list.length % PATTERN_COLORS.length],
            length: active.length,
            division: active.division,
          })
        );
      }
      t.activePatternId = list[idx].id;
      t.steps = list[idx].steps;
    });
    this.activePatternIndex = idx;
    this.notify();
  }

  public getScaleIntervals(scale: string = this.scaleType): number[] {
    switch (scale) {
      case 'major': return [0, 2, 4, 5, 7, 9, 11];
      case 'minor': return [0, 2, 3, 5, 7, 8, 10];
      case 'phrygian': return [0, 1, 3, 5, 7, 8, 10]; // Industrial / Dark EBM signature scale
      case 'dorian': return [0, 2, 3, 5, 7, 9, 10];
      case 'harmonic_minor': return [0, 2, 3, 5, 7, 8, 11];
      case 'pentatonic': return [0, 3, 5, 7, 10];
      case 'bhairav': return [0, 1, 4, 5, 7, 8, 11];
      default: return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }
  }

  public snapMidiToScale(midi: number): number {
    if (this.scaleType === 'chromatic') return midi;
    const intervals = this.getScaleIntervals(this.scaleType);
    const octave = Math.floor(midi / 12);
    const rel = ((midi % 12) - this.rootKey + 12) % 12;
    let closest = intervals[0];
    let minDiff = 99;
    for (const iv of intervals) {
      const diff = Math.abs(iv - rel);
      if (diff < minDiff) {
        minDiff = diff;
        closest = iv;
      }
    }
    return Math.max(24, Math.min(96, octave * 12 + this.rootKey + closest));
  }

  // Auto-Align Engine: Smart micro-timing snap assistant & scale-lock quantizer
  public autoAlignTrackMidi(trackId: string, strengthPct: number = 100): string {
    const track = this.tracks.find((t) => t.id === trackId) || this.tracks[0];
    if (!track) return 'No active track found for Auto-Align.';
    const ratio = Math.max(0, Math.min(1, strengthPct / 100));
    let alignedCount = 0;
    for (let i = 0; i < track.steps.length; i++) {
      const n = track.steps[i];
      if (!n) continue;
      alignedCount++;
      const curMicro = n.microOffset || 0;
      const newMicro = Number((curMicro * (1 - ratio)).toFixed(3));
      const snappedPitch = this.snapMidiToScale(n.note);
      track.steps[i] = {
        ...n,
        note: snappedPitch,
        microOffset: newMicro,
        finePitch: Math.round((n.finePitch || 0) * (1 - ratio)),
      };
    }
    this.notify();
    return `Auto-Align Engine quantized ${alignedCount} notes on "${track.name}" (${strengthPct}% phase & grid alignment).`;
  }

  public generateInstrumentPattern(
    trackId: string,
    style: 'industrial' | 'acid' | 'bass' | 'chords' | 'melody' | 'arp' | 'drums' | 'euclidean' | 'world'
  ): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const dev = this.devices.get(track.deviceId);
    const len = syncTrackPatterns(track, this.activePatternIndex).length;
    const newSteps: (SequencerNote | null)[] = Array(len).fill(null);
    // drum machines: kick / snare / closed hat / open hat on their real pads
    const drumKit = dev?.type === 'redrum' || (dev instanceof SpecDevice && !!dev.spec.pads?.length);
    const drumNotes = (['kick', 'snare', 'hatC', 'hatO'] as const).map((r) => this.drumNoteFor(dev, r));
    const intervals = this.getScaleIntervals(this.scaleType);
    const rootC3 = 48 + this.rootKey;
    const rootC4 = 60 + this.rootKey;

    for (let barOffset = 0; barOffset < len; barOffset += 16) {
      if (style === 'industrial') {
        const pattern = [0, 0, 12, 0, 1, 0, 7, 0, 0, 12, 3, 0, 5, 3, 1, 0];
        const lengths = [2, 0, 1, 1, 2, 0, 1, 1, 1, 1, 2, 0, 2, 0, 1, 1];
        for (let i = 0; i < 16 && barOffset + i < len; i++) {
          if (lengths[i] > 0) {
            const pitch = drumKit ? drumNotes[i % 4] : this.snapMidiToScale(rootC3 + pattern[i]);
            newSteps[barOffset + i] = {
              note: pitch,
              velocity: i % 4 === 0 ? 1.0 : 0.85,
              length: lengths[i],
              chordNotes: i % 8 === 0 && dev?.type !== 'redrum' ? [pitch + 7] : undefined,
            };
          }
        }
      } else if (style === 'acid') {
        const degrees = [0, 0, 12, 0, 3, 7, 10, 12, 0, 12, 7, 3, 1, 0, -12, 0];
        for (let i = 0; i < 16 && barOffset + i < len; i++) {
          if (i % 2 === 0 || i === 3 || i === 7 || i === 11 || i === 14) {
            const hold = i === 0 || i === 4 || i === 10 ? 2 : 1;
            const pitch = this.snapMidiToScale(rootC3 + degrees[i]);
            newSteps[barOffset + i] = {
              note: pitch,
              velocity: i % 4 === 0 ? 0.98 : 0.78,
              length: hold,
            };
            if (hold === 2) i++;
          }
        }
      } else if (style === 'bass') {
        const placements = [
          { s: 0, semi: 0, l: 4, v: 0.98 },
          { s: 4, semi: 3, l: 4, v: 0.92 },
          { s: 8, semi: 0, l: 4, v: 0.98 },
          { s: 12, semi: 7, l: 2, v: 0.92 },
          { s: 14, semi: 5, l: 2, v: 0.88 },
        ];
        placements.forEach((p) => {
          if (barOffset + p.s < len) {
            newSteps[barOffset + p.s] = {
              note: this.snapMidiToScale(rootC3 - 12 + p.semi),
              velocity: p.v,
              length: p.l,
            };
          }
        });
      } else if (style === 'chords') {
        // Multi-step sustained polyphonic chord blocks (8-step and 16-step full-bar sustained pads/harmoniums)
        const prog = [
          { s: 0, root: rootC4, chord: [3, 7, 12], l: 8 },
          { s: 8, root: rootC4 - 4, chord: [4, 7, 11], l: 8 },
        ];
        prog.forEach((p) => {
          if (barOffset + p.s < len) {
            const base = this.snapMidiToScale(p.root);
            newSteps[barOffset + p.s] = {
              note: base,
              velocity: 0.92,
              length: p.l,
              chordNotes: p.chord.map((c) => this.snapMidiToScale(base + c)),
            };
          }
        });
      } else if (style === 'melody' || style === 'world') {
        const phrase = [
          { s: 0, deg: 0, l: 3, v: 0.92 },
          { s: 3, deg: 2, l: 1, v: 0.85 },
          { s: 4, deg: 4, l: 4, v: 0.95 },
          { s: 8, deg: 3, l: 2, v: 0.88 },
          { s: 10, deg: 1, l: 2, v: 0.84 },
          { s: 12, deg: 0, l: 4, v: 0.94 },
        ];
        phrase.forEach((p) => {
          if (barOffset + p.s < len) {
            const semi = intervals[p.deg % intervals.length] + Math.floor(p.deg / intervals.length) * 12;
            newSteps[barOffset + p.s] = {
              note: rootC4 + semi,
              velocity: p.v,
              length: p.l,
            };
          }
        });
      } else if (style === 'arp') {
        const arpDegs = [0, 2, 4, 6, 7, 6, 4, 2, 1, 3, 5, 7, 8, 7, 5, 3];
        for (let i = 0; i < 16 && barOffset + i < len; i++) {
          const deg = arpDegs[i];
          const semi = intervals[deg % intervals.length] + Math.floor(deg / intervals.length) * 12;
          newSteps[barOffset + i] = {
            note: rootC4 + semi,
            velocity: i % 4 === 0 ? 0.95 : 0.78,
            length: 1,
          };
        }
      } else if (style === 'drums' || style === 'euclidean') {
        for (let i = 0; i < 16 && barOffset + i < len; i++) {
          if (style === 'euclidean') {
            if (i % 8 === 0 || i % 8 === 3 || i % 8 === 6 || i === 15) {
              newSteps[barOffset + i] = {
                note: drumKit ? drumNotes[i % 4 === 0 ? 0 : 1] : rootC4 + (i % 4 === 0 ? 0 : 7),
                velocity: 0.92,
                length: 2,
              };
            }
          } else {
            if (i % 4 === 0) {
              newSteps[barOffset + i] = { note: drumKit ? drumNotes[0] : 48, velocity: 1.0, length: 1 };
            } else if (i % 8 === 4) {
              newSteps[barOffset + i] = { note: drumKit ? drumNotes[1] : 60, velocity: 0.95, length: 1 };
            } else if (i % 2 === 1) {
              newSteps[barOffset + i] = { note: drumKit ? drumNotes[2] : 67, velocity: 0.82, length: 1 };
            }
          }
        }
      }
    }

    // Only the edited (active) pattern changes; the other patterns of the track are left alone.
    const active = syncTrackPatterns(track, this.activePatternIndex);
    for (let i = 0; i < active.length; i++) track.steps[i] = newSteps[i] ?? null;

    this.notify();
  }

  /** Click on every beat of the time signature; accent on the downbeat. */
  private triggerMetronomeClick(posInBar: number, time: number): void {
    // During count-in / recording the click always plays when recording with the metronome on.
    if (!this.metronomeEnabled) return;
    if (posInBar % beatSteps(this.timeSignature) !== 0) return;
    this.clickAt(time, posInBar === 0);
  }

  /** One metronome click (monitor only: never in exports, bounces or master recordings). */
  public clickAt(time: number, downbeat: boolean): void {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(downbeat ? 1600 : 1000, time);
      osc.frequency.exponentialRampToValueAtTime(downbeat ? 800 : 500, time + 0.03);
      gain.gain.setValueAtTime((downbeat ? 0.45 : 0.28) * this.metronomeLevel, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      osc.connect(gain);
      gain.connect(this.monitor.clickInput);
      osc.start(time);
      osc.stop(time + 0.045);
    } catch {
      // context closed
    }
  }

  /** Duration of the 16th at `pos` with swing (even 16ths longer, odd 16ths shorter). */
  private swungStepDuration(pos: number): number {
    const curBpm = this.timeMap.tempoMap.getBpmAtTick(pos * TICKS_PER_16TH);
    const d = 60 / curBpm / 4;
    if (this.globalSwing <= 0) return d;
    const off = d * this.globalSwing * 0.5;
    return pos % 2 === 1 ? d - off : d + off;
  }

  /** Plays one 16th of the song (absolute position `pos`) at audio time `time`. */
  private scheduleStep(pos: number, time: number): void {
    // queued clip / scene launches fire on their grid line, before this 16th's notes
    this.launchQueue.forEach((q) => pos % q.grid === 0 && q.fire(pos));
    const spb = this.stepsPerBar;
    const bar = Math.floor(pos / spb);
    // Automation first: a tempo lane changes the BPM before this 16th's duration is used.
    this.automation.step(pos, time, this.swungStepDuration(pos), this.automationLanesAtPosition(pos), (lane, at) => this.automationValueAt(lane.id, at));
    this.triggerMetronomeClick(pos % spb, time);

    // Tick CV modulation in lockstep with the lookahead scheduler (background-tab safe)
    this.cvEngine.tickCV(time);
    this.activeArrangementSection = this.songBlockAtTick(pos * TICKS_PER_16TH)?.block.name ?? `BAR ${bar + 1}`;
    this.playheadQueue.push({ time, pos });
    if (this.playheadQueue.length > 96) this.playheadQueue.splice(0, this.playheadQueue.length - 64);

    // Step counters of rack devices (Matrix, Alligator, RPG-8 … get the absolute 16th; they wrap themselves)
    this.devices.forEach((dev) => {
      if (dev.type === 'redrum') (dev as RedrumDevice).currentStep = pos % 16;
      else dev.onStepTick?.(pos, time);
    });

    const base16 = 60 / this.bpm / 4;
    const windowDur = this.swungStepDuration(pos);
    this.sendMidiClockStep(time, windowDur);
    const tick = pos * TICKS_PER_16TH;
    const chaseAtThisStep = this.chaseNextStep && this.noteChaseEnabled;
    this.chaseNextStep = false;
    const duckHits: DuckHit[] | null = anyDucking(this.tracks) ? [] : null;

    // Mute / solo are handled by the mixer strips (so buses, sends and tails behave like a console).
    for (const track of this.tracks) {
      if (track.disabled) continue;
      const dev = this.devices.get(track.deviceId);
      if (!dev || !dev.isPowered || dev.isBypassed) continue;
      // Delay compensation slot: a positive offset plays later, negative earlier (hardware latency).
      const offsetSec = (track.offsetMs ?? 0) / 1000;
      const shifted = (t: number) => (offsetSec ? Math.max(this.ctx.currentTime, t + offsetSec) : t);
      if (track.kind === 'audio') {
        if (dev instanceof AudioTrackDevice) {
          this.clipVoices.step(this.audioClipsForTrack(track, tick), tick, shifted(time), this.bpm, spb, dev.clipInput, track.id, this.timeMap);
        }
        continue;
      }
      const src = this.sourceForTrack(track, tick, this.launchOrigin.get(track.id));
      if (!src) continue;
      if (chaseAtThisStep) {
        for (const hit of activeHitsAt(src, tick, spb)) {
          const eventBar = Math.floor((tick - (hit.elapsedTicks || 0)) / (spb * TICKS_PER_16TH));
          if (!this.playHit(track, dev, src, hit, eventBar, shifted(time), base16, true)) continue;
          duckHits?.push({ deviceId: track.deviceId, time: shifted(time), drumBeat: isDrumBeat(track, hit.stepIdx, hit.note.note) });
        }
      }
      for (const hit of hitsInWindow(src, tick, TICKS_PER_16TH, spb)) {
        const hitTime = shifted(time + (hit.offsetTicks / TICKS_PER_16TH) * windowDur);
        if (!this.playHit(track, dev, src, hit, bar, hitTime, base16, true)) continue;
        duckHits?.push({ deviceId: track.deviceId, time: hitTime, drumBeat: isDrumBeat(track, hit.stepIdx, hit.note.note) });
      }
    }

    // Kick ducking (sidechain): channels with a duck setting dip on their source's hits.
    if (duckHits) applyDucks(this.tracks, duckHits, (id) => this.mixer.strips.get(id), time);
  }

  /**
   * Plays one note event (chance, graph lanes, micro timing, ratchets, chord notes) on a device.
   * Shared by live playback (live: telemetry + per-step filter lanes) and the offline export.
   * Returns false when the chance roll skipped it.
   */
  private playHit(
    track: SequencerTrack,
    dev: BaseDevice,
    src: PlaySource,
    hit: StepHit,
    bar: number,
    hitTime: number,
    base16: number,
    live: boolean,
    routing: NoteRouting = this.liveRouting
  ): boolean {
    const note = hit.note;
    if (note.probability !== undefined && note.probability < 1.0) {
      if (this.deterministicChance(track.id, bar, hit.stepIdx) > note.probability) return false;
    }
    const stepDur = (hit.stepTicks / TICKS_PER_16TH) * base16;
    const graphVel = track.graphData?.velocity?.[hit.stepIdx] ?? 1.0;
    const effVelocity = Math.max(0.05, Math.min(1.0, note.velocity * graphVel));

    if (live) {
      let lfoMod = 0;
      if (this.lfoEngine.enabled) {
        const phase = (hitTime * this.lfoEngine.rateHz) % 1;
        const w = this.lfoEngine.waveform;
        const rawWave =
          w === 'sine'
            ? Math.sin(phase * Math.PI * 2)
            : w === 'triangle'
            ? 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25))
            : w === 'sawtooth'
            ? 2 * (phase - Math.floor(phase + 0.5))
            : w === 'square'
            ? phase < 0.5
              ? 1
              : -1
            : Math.sin(hit.stepIdx * 12.9898) * 0.8;
        this.lfoEngine.currentValue = this.lfoEngine.bipolar ? rawWave : (rawWave + 1) * 0.5;
        lfoMod = this.lfoEngine.currentValue * this.lfoEngine.depth * 0.25;
      }
      const cut = track.graphData?.cutoff?.[hit.stepIdx] ?? undefined;
      const res = track.graphData?.resonance?.[hit.stepIdx] ?? undefined;
      this.automation.applying = true;
      try {
        if (cut !== undefined) dev.setParam('cutoff', this.normalizeCutoffToHz(Math.max(0.05, Math.min(1.0, cut + lfoMod))));
        if (res !== undefined) dev.setParam('resonance', Math.max(0.05, Math.min(1.0, res)));
      } finally {
        this.automation.applying = false;
      }
    }

    const pitchOffset = (track.pitchOffset || 0) + (track.graphData?.pitch?.[hit.stepIdx] ?? 0);
    const effNote = Math.max(0, Math.min(127, note.note + pitchOffset));
    const baseTime = Math.max(routing.now(), hitTime + (note.microOffset || 0) * stepDur);

    if (live) {
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      if (this.detectedEvents.length >= 12) this.detectedEvents.pop();
      this.detectedEvents.unshift({
        id: `det_${bar}_${hit.stepIdx}_${track.id}_${Math.round(hitTime * 1000)}`,
        trackId: track.id,
        trackName: track.name,
        deviceType: dev.type,
        noteName: `${noteNames[effNote % 12]}${Math.floor(effNote / 12) - 1}`,
        midi: effNote,
        freqHz: Number(this.midiToFreq(effNote).toFixed(1)),
        velocity: Math.round(effVelocity * 100),
        bar: bar + 1,
        step: hit.stepIdx + 1,
        clipName: src.kind === 'notes' ? src.clip.name || 'Note clip' : src.pattern.name,
        color: track.color || '#10b981',
        timestamp: Date.now(),
      });
    }

    const ratchets = Math.max(1, Math.min(4, Math.round(note.ratchet || 1)));
    const sub = stepDur / ratchets;
    const tickDur = base16 / TICKS_PER_16TH;
    const elapsedTicks = Math.max(0, hit.elapsedTicks || 0);
    const mainDur = ratchets > 1 ? sub * 0.85 : Math.max(1, hit.lengthTicks - elapsedTicks) * tickDur * 0.92;
    const chord = note.chordNotes || [];
    // Strum: the chord's notes (root included) start a few ms apart, lowest first
    const strumAt = strumDelays([effNote, ...chord.map((c) => Math.max(0, Math.min(127, c + pitchOffset)))], note.strum ?? 0);
    for (let r = 0; r < ratchets; r++) {
      const t = baseTime + r * sub;
      const rv = r === 0 ? 1.0 : 0.82;
      if (hit.activePrimary !== false) this.deliverNote(dev, effNote, effVelocity * rv, t + strumAt[0], mainDur, routing);
      for (let i = 0; i < chord.length; i++) {
        if (hit.elapsedTicks !== undefined && !hit.activeChordIndices?.includes(i)) continue;
        const n = Math.max(0, Math.min(127, chord[i] + pitchOffset));
        const len = note.chordLengths?.[i];
        const chordTicks = len !== undefined ? Math.max(1, len) * hit.stepTicks : hit.lengthTicks;
        const dur =
          ratchets > 1 ? sub * 0.85 : len !== undefined ? Math.max(1, len) * hit.stepTicks * tickDur * 0.92 : mainDur;
        const chasedDur = hit.elapsedTicks !== undefined && ratchets === 1 ? Math.max(1, chordTicks - elapsedTicks) * tickDur * 0.92 : dur;
        const vel = Math.max(0.05, Math.min(1, (note.chordVelocities?.[i] ?? note.velocity) * graphVel)) * rv;
        this.deliverNote(dev, n, vel, t + strumAt[i + 1], chasedDur, routing);
      }
    }
    return true;
  }

  /**
   * Sends one timed note to a device. Pad-style instruments (Redrum, Mimic) get note-on only
   * (they play one-shots); everything else gets a matching note-off.
   */
  private deliverNote(dev: BaseDevice, midi: number, velocity: number, time: number, duration: number, routing: NoteRouting = this.liveRouting): void {
    if (dev instanceof MidiOutDevice) {
      if (routing !== this.liveRouting || !this.midi.outputId) return;
      const channel = Math.max(1, Math.min(16, Math.round(Number(dev.params.midiChannel) || 1))) - 1;
      const onTime = this.midiTimestamp(Math.max(routing.now(), time));
      const offTime = this.midiTimestamp(Math.max(routing.now(), time) + Math.max(0.005, duration));
      this.midi.sendOutput([0x90 | channel, midi, Math.max(1, Math.min(127, Math.round(velocity * 127)))], onTime);
      this.midi.sendOutput([0x80 | channel, midi, 0], offTime);
      return;
    }
    const players = routing.playersFor(dev.id);
    if (players.length) {
      this.sinkFor(dev, players, 0, routing).on(midi, velocity, time, Math.max(0.005, duration));
      if (routing === this.liveRouting) this.ensurePlayerClock();
      return;
    }
    if (!dev.noteOn) return;
    dev.noteOn(midi, velocity, time);
    if (dev.type !== 'redrum' && dev.type !== 'mimic') dev.noteOff?.(midi, time + Math.max(0.005, duration));
  }

  // ---- Player devices: note processors that sit on an instrument (their target) ----
  private playerTimer: number | null = null;
  private playerUntil = new Map<string, number>();

  /** Powered players targeting `deviceId`, in rack order. */
  private playersFor(deviceId: string): SpecDevice[] {
    const out: SpecDevice[] = [];
    this.devices.forEach((d) => {
      if (d instanceof SpecDevice && d.engine.player && d.target === deviceId && d.isPowered && !d.isBypassed) out.push(d);
    });
    return out;
  }

  /** Live routing: players of the live rack, times clamped to the live context clock. */
  private readonly liveRouting: NoteRouting = {
    playersFor: (id) => this.playersFor(id),
    now: () => this.ctx.currentTime,
  };

  /** Note sink for link `from` of a player chain (past the last player: the instrument). */
  public sinkFor(dev: BaseDevice, players: SpecDevice[], from: number, routing: NoteRouting = this.liveRouting): NoteSink {
    if (from >= players.length) {
      return {
        on: (n, v, t, d) => {
          dev.noteOn?.(n, v, Math.max(routing.now(), t));
          if (d !== undefined && dev.type !== 'redrum' && dev.type !== 'mimic') dev.noteOff?.(n, Math.max(routing.now(), t) + d);
        },
        off: (n, t) => dev.noteOff?.(n, Math.max(routing.now(), t)),
      };
    }
    const p = players[from].engine.player!;
    const next = this.sinkFor(dev, players, from + 1, routing);
    return { on: (n, v, t, d) => p.noteOn(n, v, t, d, next), off: (n, t) => p.noteOff(n, t, next) };
  }

  private playerContext(target: BaseDevice): PlayerContext {
    const step = () => 60 / this.bpm / 4;
    return {
      stepDur: step,
      gridTime: (pos) => (this.isPlaying ? this.nextNoteTime + (pos - this.songPosition) * step() : null),
      gridPos: (t) => (this.isPlaying ? this.songPosition + (t - this.nextNoteTime) / step() : null),
      drumNote: (role) => this.drumNoteFor(target, role),
    };
  }

  /** Note that plays a drum role on an instrument (pads by voice, Redrum lanes, else GM). */
  public drumNoteFor(dev: BaseDevice | undefined, role: 'kick' | 'snare' | 'hatC' | 'hatO' | 'clap' | 'perc'): number {
    const gm = { kick: 36, snare: 38, hatC: 42, hatO: 46, clap: 39, perc: 37 }[role];
    if (dev instanceof SpecDevice && dev.spec.pads?.length) {
      const re = { kick: /kick|bass ?drum|drum 1/i, snare: /snare/i, hatC: /closed|cl hat|hi-hat cl|^hi-hat$|hat$/i, hatO: /open|op hat/i, clap: /clap/i, perc: /conga|perc|rim|cowbell|shaker|tom/i }[role];
      const pad = dev.spec.pads.find((p) => re.test(p.name) || re.test(p.voice));
      return pad ? pad.note : role === 'hatO' ? this.drumNoteFor(dev, 'hatC') : dev.spec.pads[0].note;
    }
    if (dev?.type === 'redrum') return 60 + { kick: 0, snare: 1, hatC: 2, hatO: 3, clap: 4, perc: 5 }[role];
    return gm;
  }

  private liveNoteListeners = new Set<(deviceId: string, note: number, velocity: number) => void>();
  public onLiveNote(cb: (deviceId: string, note: number, velocity: number) => void): () => void {
    this.liveNoteListeners.add(cb);
    return () => this.liveNoteListeners.delete(cb);
  }

  /** Live (keyboard / MIDI / pad) note into an instrument, through its players. */
  public liveNoteOn(dev: BaseDevice, note: number, velocity = 0.85, channel = 0): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.liveNoteListeners.forEach((cb) => {
      try { cb(dev.id, note, velocity); } catch {}
    });
    this.recorder.noteOn(dev.id, note, velocity, channel);
    const players = this.playersFor(dev.id);
    if (players.length) {
      this.sinkFor(dev, players, 0).on(note, velocity, this.ctx.currentTime, undefined);
      this.ensurePlayerClock();
    } else dev.noteOn?.(note, velocity, this.ctx.currentTime);
  }

  public liveNoteOff(dev: BaseDevice, note: number): void {
    if (dev instanceof SpecDevice) dev.keyRelease(note, this.ctx.currentTime);
    this.recorder.noteOff(dev.id, note);
    this.releaseLiveSound(dev, note);
  }

  private releaseLiveSound(dev: BaseDevice, note: number): void {
    const players = this.playersFor(dev.id);
    if (players.length) this.sinkFor(dev, players, 0).off(note, this.ctx.currentTime);
    else dev.noteOff?.(note, this.ctx.currentTime);
  }

  /** Points a player at an instrument (null = unassigned). */
  public setPlayerTarget(playerId: string, targetId: string | null): void {
    const p = this.devices.get(playerId);
    if (!(p instanceof SpecDevice) || !p.engine.player) return;
    const old = p.target ? this.devices.get(p.target) : undefined;
    // release whatever the player was holding on its old instrument
    if (old) p.engine.player.allOff(this.ctx.currentTime, { on: () => undefined, off: (n, t) => old.noteOff?.(n, t) });
    p.setParam('target', targetId ?? '');
    this.ensurePlayerClock();
    this.notify();
  }

  /** Runs generator players (arps, Beat Map, Quad Note Generator) with a 120 ms look-ahead. */
  private ensurePlayerClock(): void {
    if (this.playerTimer !== null || typeof window === 'undefined') return;
    this.playerTimer = window.setInterval(() => this.tickPlayers(), 25);
  }

  private tickPlayers(): void {
    const now = this.ctx.currentTime;
    const to = now + this.scheduleAheadTime;
    let running = false;
    this.devices.forEach((p) => {
      const proc = p instanceof SpecDevice ? p.engine.player : undefined;
      if (!proc?.tick || !(p instanceof SpecDevice) || !p.target || !p.isPowered || p.isBypassed) return;
      const target = this.devices.get(p.target);
      if (!target) return;
      const pctx = this.playerContext(target);
      if (proc.running && !proc.running(pctx)) {
        this.playerUntil.delete(p.id);
        return;
      }
      running = true;
      const chain = this.playersFor(target.id);
      const from = Math.max(now, this.playerUntil.get(p.id) ?? now);
      if (from < to) proc.tick(from, to, this.sinkFor(target, chain, chain.indexOf(p) + 1), pctx);
      this.playerUntil.set(p.id, to);
    });
    if (!running && this.playerTimer !== null) {
      clearInterval(this.playerTimer);
      this.playerTimer = null;
    }
  }

  private advanceStep(): void {
    const pos = this.songPosition;
    this.nextNoteTime += Math.max(0.015, this.swungStepDuration(pos));
    let next = pos + 1;
    if (this.playbackMode === 'song_arrangement') {
      const spb = this.stepsPerBar;
      if (this.loopEnabled) {
        const { start, end } = this.getLoopRange();
        const endPos = Math.round(end * spb);
        // Wrap only when crossing R (starting after R plays on, like Reason).
        if (pos < endPos && next >= endPos) {
          next = Math.round(start * spb);
          if (this.noteChaseEnabled) this.chaseNextStep = true;
          this.sendMidiTransport(0xfc, this.nextNoteTime);
          this.sendMidiSongPosition(next, this.nextNoteTime);
          this.sendMidiTransport(0xfb, this.nextNoteTime);
          this.clipVoices.stopAll(this.nextNoteTime);
        }
      } else {
        const songEnd = this.renderLength16ths();
        if (pos < songEnd && next >= songEnd) this.pendingStopTime = this.nextNoteTime;
      }
    }
    const prevBar = this.currentSongBar;
    this.songPosition = next;
    this.currentSongBar = Math.floor(next / this.stepsPerBar);
    this.currentStep = next % Math.max(16, this.patternLength);
    // Step lights listen per 16th (onStep); the whole UI re-renders only once per bar.
    this.stepListeners.forEach((cb) => cb());
    if (this.currentSongBar !== prevBar) this.notify();
  }

  private stepListeners = new Set<() => void>();
  /** Called on every scheduled 16th while playing (for step lights; structural UI uses subscribe). */
  public onStep(cb: () => void): () => void {
    this.stepListeners.add(cb);
    return () => this.stepListeners.delete(cb);
  }

  /** Record button: records armed tracks (see RecordController). */
  public startRecording(): void {
    void this.recorder.start();
  }

  public stopRecording(): void {
    void this.recorder.stop();
  }

  /* ---------------------------------------------------------------- offline render support */

  /** Plays one sequencer hit on a device through `routing` (src/audio/render uses it offline). */
  public renderHit(track: SequencerTrack, dev: BaseDevice, src: PlaySource, hit: StepHit, bar: number, time: number, base16: number, routing: NoteRouting): boolean {
    return this.playHit(track, dev, src, hit, bar, time, base16, false, routing);
  }

  /** A copy of a live device on another context (params, samples and library snapshot included). */
  public instantiateOffline(ctx: BaseAudioContext, live: BaseDevice): BaseDevice {
    const subVoiceId = typeof live.params.subVoice === 'string' && live.params.subVoice ? live.params.subVoice : undefined;
    const dev = live.cloneForOfflineContext?.(ctx) ?? this.instantiateDeviceOnContext(ctx as AudioContext, live.type, live.id, live.name, subVoiceId);
    if (!live.cloneForOfflineContext) {
      Object.entries(live.params).forEach(([k, v]) => typeof v === 'number' && dev.setParam(k, v));
      if (live instanceof MimicDevice && dev instanceof MimicDevice) live.pads.forEach((pad, i) => pad.buffer && dev.pads[i] && (dev.pads[i].buffer = pad.buffer));
    }
    // same level calibration as the live unit
    const trim = levelTrimOf(live);
    if (trim !== undefined) installLevelTrim(dev, trim);
    return dev;
  }

  /** Rebuilds the master section (width, outboard, master FX, EQ, limiter, clipper) on `ctx` with the live settings. */
  public async buildMasterChainOn(ctx: BaseAudioContext, input: AudioNode): Promise<{ output: AudioNode; masterGain: GainNode; eq: BiquadFilterNode[]; width: GainNode[] }> {
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const [ll, rr, rl, lr] = this.masterWidthGains.map((g) => gain(g.gain.value));
    input.connect(split);
    split.connect(ll, 0).connect(merge, 0, 0);
    split.connect(rl, 1).connect(merge, 0, 0);
    split.connect(rr, 1).connect(merge, 0, 1);
    split.connect(lr, 0).connect(merge, 0, 1);
    const biquad = (src: BiquadFilterNode) => {
      const b = ctx.createBiquadFilter();
      b.type = src.type;
      b.frequency.value = src.frequency.value;
      b.Q.value = src.Q.value;
      b.gain.value = src.gain.value;
      return b;
    };
    const comp = (src: DynamicsCompressorNode) => {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = src.threshold.value;
      c.knee.value = src.knee.value;
      c.ratio.value = src.ratio.value;
      c.attack.value = src.attack.value;
      c.release.value = src.release.value;
      return c;
    };
    const deEss = biquad(this.outboardDeEsser);
    const tube = ctx.createWaveShaper();
    tube.curve = this.outboardTubeShaper.curve;
    tube.oversample = this.outboardTubeShaper.oversample;
    const opto = comp(this.outboardOptoComp);
    const master = gain(this.masterGain.gain.value);
    merge.connect(deEss).connect(tube).connect(opto).connect(master);
    const conv = ctx.createConvolver();
    conv.buffer = this.outboardConvolver.buffer && this.outboardConvolver.buffer.sampleRate === ctx.sampleRate ? this.outboardConvolver.buffer : this.buildImpulseResponse(ctx, 1.85, 2.8);
    opto.connect(conv).connect(gain(this.outboardReverbWet.gain.value)).connect(master);
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.outboardBbdDelay.delayTime.value;
    const dFilt = biquad(this.outboardBbdFilter);
    const fb = gain(this.outboardBbdFeedback.gain.value);
    opto.connect(delay).connect(dFilt).connect(fb).connect(delay);
    dFilt.connect(gain(this.outboardBbdWet.gain.value)).connect(master);
    const eqL = biquad(this.masterEqLow);
    const eqM = biquad(this.masterEqMid);
    const eqH = biquad(this.masterEqHigh);
    const lim = comp(this.masterLimiter);
    const clip = ctx.createWaveShaper();
    clip.curve = this.masterClipper.curve;
    clip.oversample = this.masterClipper.oversample;
    master.connect(eqL).connect(eqM).connect(eqH);
    (await this.mastering.buildOn(ctx, eqH)).connect(lim);
    lim.connect(clip);
    return { output: clip, masterGain: master, eq: [eqL, eqM, eqH], width: [ll, rr, rl, lr] };
  }

  /** Duration of the 16th at `pos` for a given tempo (swing applied). */
  public stepDurationAt(pos: number, bpm: number): number {
    const d = 60 / bpm / 4;
    if (this.globalSwing <= 0) return d;
    const off = d * this.globalSwing * 0.5;
    return pos % 2 === 1 ? d - off : d + off;
  }

  public exportMasterWav(): void {
    this.exportUncompressedWav(undefined, 'wav');
  }

  private instantiateDeviceOnContext(ctx: AudioContext, type: DeviceType, id: string, name: string, subVoiceId?: string): BaseDevice {
    const spec = createSpecDevice(ctx, type, id, name);
    if (spec) return spec;
    switch (type) {
      case 'subtractor': return new SubtractorDevice(ctx, id, name);
      case 'thor': return new ThorDevice(ctx, id, name);
      case 'third_wave': return new ThirdWaveDevice(ctx, id, name);
      case 'europa': return new EuropaDevice(ctx, id, name);
      case 'monotone': return new MonotoneDevice(ctx, id, name);
      case 'redrum': return new RedrumDevice(ctx, id, name);
      case 'mimic': return new MimicDevice(ctx, id, name);
      case 'matrix': return new MatrixDevice(ctx, id, name);
      case 'pulsar': return new PulsarDevice(ctx, id, name);
      case 'scream4': return new Scream4Device(ctx, id, name);
      case 'echo': return new EchoDevice(ctx, id, name);
      case 'rv7000': return new RV7000Device(ctx, id, name);
      case 'mclass_master': return new MClassMasterSuite(ctx, id, name);
      case 'spider_cv': return new SpiderCVDevice(ctx, id, name);
      case 'spider_audio': return new SpiderAudioDevice(ctx, id, name);
      case 'bansuri': return new BansuriDevice(ctx, id, name);
      case 'harmonium': return new HarmoniumDevice(ctx, id, name);
      case 'tabla': return new TablaDevice(ctx, id, name);
      case 'dhol': return new DholDevice(ctx, id, name);
      case 'tanpura': return new TanpuraDroneDevice(ctx, id, name);
      case 'tumbi': return new TumbiDevice(ctx, id, name);
      case 'three_osc': return new ThreeOscDevice(ctx, id, name);
      case 'sytrus': return new SytrusDevice(ctx, id, name);
      case 'flex': return new FlexDevice(ctx, id, name);
      case 'wyvern': return new WyvernDevice(ctx, id, name);
      case 'ember': return new EmberDevice(ctx, id, name);
      case 'world_instrument': {
        const lowerName = name.toLowerCase();
        const isWind = ['flute', 'horn', 'pipe', 'bagpipe', 'clarinet', 'oboe', 'accordion', 'saxophone', 'whistle', 'didgeridoo', 'duduk', 'recorder'].some((word) => lowerName.includes(word));
        return new UniversalWorldInstrumentDevice(ctx, id, name, isWind ? 'wind' : 'string', subVoiceId);
      }
      case 'percussion_electronic': return new UniversalPercussionElectronicDevice(ctx, id, name, undefined, subVoiceId);
      case 'objekt': return new ObjektDevice(ctx, id, name);
      case 'reason_performance': return new ReasonPerformanceDevice(ctx, id, name);
      case 'rv9': return new RV9Device(ctx, id, name);
      case 'osmium': return new OsmiumDevice(ctx, id, name);
      case 'rotor': return new RotorDevice(ctx, id, name);
      case 'combinator': return new CombinatorDevice(ctx, id, name);
      case 'midi_out': return new MidiOutDevice(ctx, id, name);
      case 'automation_clip':
        // Legacy saved type only. It is not an automation device; automation lives in sequencer lanes.
        return new SubtractorDevice(ctx, id, name);
      case 'mix_bus': return new MixBusDevice(ctx, id, name);
      case 'audio_track': return new AudioTrackDevice(ctx, id, name);
      default: throw new Error(`Unsupported device type: ${String(type)}`);
    }
  }

  // Native Uncompressed Audio Exporter (.wav / .aif / .flac Stem Bounce & Master Render via OfflineAudioContext)
  /** Offline export of the mix (or one track's stem) through the export pipeline (src/audio/export). */
  public async exportUncompressedWav(trackId?: string, ext: 'wav' | 'aif' | 'flac' = 'wav'): Promise<void> {
    const track = trackId ? this.tracks.find((t) => t.id === trackId) : undefined;
    const result = await runExport(
      this,
      { ...DEFAULT_EXPORT, format: ext === 'aif' ? 'aiff' : ext, what: track ? 'stems' : 'mix', stems: track ? [track.deviceId] : [], fileName: track ? track.name : 'THE UNBOX APP mix' },
      () => undefined
    );
    result.files.forEach((f) => downloadBlob(f.blob, f.name));
  }

  // Telemetry loop for reactive VU meters
  private startTelemetryLoop(): void {
    const update = () => {
      this.analyserL.getFloatTimeDomainData(this.analyserDataL as any);
      this.analyserR.getFloatTimeDomainData(this.analyserDataR as any);

      let sumSqL = 0;
      let peakL = 0;
      let sumSqR = 0;
      let peakR = 0;
      let crossLR = 0;

      for (let i = 0; i < this.analyserDataL.length; i++) {
        const vL = this.analyserDataL[i];
        const vR = this.analyserDataR[i];
        sumSqL += vL * vL;
        sumSqR += vR * vR;
        crossLR += vL * vR;
        if (Math.abs(vL) > peakL) peakL = Math.abs(vL);
        if (Math.abs(vR) > peakR) peakR = Math.abs(vR);
      }

      const rmsL = Math.sqrt(sumSqL / this.analyserDataL.length);
      const rmsR = Math.sqrt(sumSqR / this.analyserDataR.length);
      const avgRms = (rmsL + rmsR) * 0.5;
      const maxPeak = Math.max(peakL, peakR);

      // Real-time ITU-R BS.1770 LUFS & Stereo Phase Correlation global calculations
      if (avgRms > 0.0005) {
        const instLufs = Math.max(-60, Math.min(0, -0.691 + 20 * Math.log10(avgRms)));
        this.lufsMetering.momentary = Number((this.lufsMetering.momentary * 0.85 + instLufs * 0.15).toFixed(1));
        this.lufsMetering.shortTerm = Number((this.lufsMetering.shortTerm * 0.94 + instLufs * 0.06).toFixed(1));
        this.lufsMetering.truePeakDbtp = Number(Math.max(-36, Math.min(0.5, 20 * Math.log10(Math.max(0.0001, maxPeak)))).toFixed(1));
        const denom = Math.sqrt(sumSqL * sumSqR);
        if (denom > 0.00001) {
          this.lufsMetering.phaseCorrelation = Number(Math.max(-1, Math.min(1, crossLR / denom)).toFixed(2));
        }
      }
      if (this.envFollowerEngine.enabled) {
        this.envFollowerEngine.currentEnvelope = Math.min(1, avgRms * this.envFollowerEngine.gain * 2.2);
      }

      // Find MClass master gain reduction
      let gr = 0;
      const mclass = Array.from(this.devices.values()).find((d) => d.type === 'mclass_master') as MClassMasterSuite | undefined;
      if (mclass) {
        gr = mclass.getGainReduction();
      }

      this.telemetry = {
        rmsL,
        rmsR,
        peakL,
        peakR,
        gainReductionDb: gr,
        currentStep: this.currentStep,
        bpm: this.bpm,
        isPlaying: this.isPlaying,
        isRecording: this.isRecording,
        audioTime: this.ctx.currentTime,
      };

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  // Initialize the signature Reference Studio Rack (Combinator + RV-7000 + Scream 4 + MClass Compressor) & Multi-Track Session
  private initDefaultSession(): void {
    this.devices.clear();
    this.tracks = [];
    this.trackFolders = [];
    this.songBlocks = [];
    this.blockPlacements = [];
    this.audioConnections = [];
    this.cvConnections = [];
    this.bpm = 128;

    // Instruments, each on its own track and mixer channel
    this.createDevice('redrum', 'Drums');
    this.createDevice('monotone', 'Bass');
    const leadDev = this.createDevice('subtractor', 'Synth Lead');
    const padDev = this.createDevice('europa', 'Pad');
    const thirdWaveDev = this.createDevice('third_wave', '3rd Wave Wavetable Synth');
    this.createDevice('rec_meta_nylon_guitar', 'Guitar');
    this.createDevice('rec_tabla_dholak', 'Tabla');
    this.createDefaultReturns();
    this.mixer.setSend(padDev.id, this.mixer.buses()[0]?.id ?? '', 0.3);
    this.mixer.setSend(thirdWaveDev.id, this.mixer.buses()[0]?.id ?? '', 0.25);
    this.mixer.setSend(leadDev.id, this.mixer.buses()[0]?.id ?? '', 0.2);
    this.mixer.setSend(leadDev.id, this.mixer.buses()[1]?.id ?? '', 0.18);

    // Give the first session a compact, editable groove so Play All is immediately audible.
    this.applyStarterGroove();

    // Assign vibrant reference colors to tracks
    const colorPalette = ['#f43f5e', '#0ea5e9', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#8b5cf6'];
    this.tracks.forEach((t, idx) => {
      t.color = colorPalette[idx % colorPalette.length];
      (t.arrangementClips || []).forEach((c) => {
        c.color = t.color;
      });
    });

    this.notify();
  }

  /** Apply the starter notes to the named tracks in the default session. */
  private applyStarterGroove(): void {
    const deviceForTrack = (name: string) => {
      const track = this.tracks.find((t) => t.name === name);
      return track ? this.devices.get(track.deviceId) : undefined;
    };
    const drumsDev = deviceForTrack('Drums');
    const bassDev = deviceForTrack('Bass');
    const leadDev = deviceForTrack('Synth Lead');
    const padDev = deviceForTrack('Pad');
    if (!drumsDev || !bassDev || !leadDev || !padDev) return;

    const setPattern = (device: BaseDevice, steps: (SequencerNote | null)[]) => {
      const track = this.tracks.find((t) => t.deviceId === device.id);
      if (!track) return;
      const pattern = track.patternList?.find((p) => p.id === track.activePatternId);
      track.steps = steps;
      if (pattern) pattern.steps = steps;
    };

    const drumSteps: (SequencerNote | null)[] = Array(16).fill(null);
    const kick = this.drumNoteFor(drumsDev, 'kick');
    const snare = this.drumNoteFor(drumsDev, 'snare');
    const hat = this.drumNoteFor(drumsDev, 'hatC');
    const openHat = this.drumNoteFor(drumsDev, 'hatO');
    const putDrum = (step: number, note: number, velocity: number, extra?: { note: number; velocity: number }[]) => {
      const chordNotes = extra?.map((hit) => hit.note);
      drumSteps[step] = {
        note,
        velocity,
        length: 1,
        chordNotes: chordNotes?.length ? chordNotes : undefined,
        chordVelocities: extra?.map((hit) => hit.velocity),
      };
    };
    putDrum(0, kick, 0.96, [{ note: hat, velocity: 0.45 }]);
    putDrum(4, snare, 0.8, [{ note: hat, velocity: 0.42 }]);
    putDrum(8, kick, 0.9, [{ note: hat, velocity: 0.46 }]);
    putDrum(12, snare, 0.78, [{ note: hat, velocity: 0.42 }, { note: this.drumNoteFor(drumsDev, 'clap'), velocity: 0.48 }]);
    for (let step = 2; step < 16; step += 2) {
      if (drumSteps[step]) continue;
      putDrum(step, step === 14 ? openHat : hat, step === 14 ? 0.56 : 0.46);
    }
    setPattern(drumsDev, drumSteps);

    const bassSteps: (SequencerNote | null)[] = Array(16).fill(null);
    bassSteps[0] = { note: 36, velocity: 0.9, length: 3 };
    bassSteps[4] = { note: 39, velocity: 0.84, length: 3 };
    bassSteps[8] = { note: 34, velocity: 0.9, length: 3 };
    bassSteps[12] = { note: 31, velocity: 0.86, length: 4 };
    setPattern(bassDev, bassSteps);

    const leadSteps: (SequencerNote | null)[] = Array(16).fill(null);
    leadSteps[2] = { note: 75, velocity: 0.62, length: 1 };
    leadSteps[6] = { note: 79, velocity: 0.7, length: 2 };
    leadSteps[10] = { note: 82, velocity: 0.64, length: 1 };
    leadSteps[14] = { note: 79, velocity: 0.72, length: 2 };
    setPattern(leadDev, leadSteps);

    const padSteps: (SequencerNote | null)[] = Array(16).fill(null);
    padSteps[0] = { note: 60, velocity: 0.42, length: 16, chordNotes: [63, 67], chordVelocities: [0.38, 0.38] };
    setPattern(padDev, padSteps);

    const thirdWaveDev = deviceForTrack('3rd Wave Wavetable Synth');
    if (thirdWaveDev) {
      const twSteps: (SequencerNote | null)[] = Array(16).fill(null);
      twSteps[0] = { note: 48, velocity: 0.75, length: 8, chordNotes: [55, 60], chordVelocities: [0.65, 0.7] };
      twSteps[8] = { note: 46, velocity: 0.72, length: 8, chordNotes: [53, 58], chordVelocities: [0.62, 0.68] };
      setPattern(thirdWaveDev, twSteps);
    }
  }

  /** One-time migration for an untouched legacy default session whose patterns were all blank. */
  public seedLegacyStarterSession(): boolean {
    const expected: readonly { name: string; types: readonly string[] }[] = [
      { name: 'Drums', types: ['redrum'] }, { name: 'Bass', types: ['monotone'] },
      { name: 'Synth Lead', types: ['subtractor'] }, { name: 'Pad', types: ['europa'] },
      { name: 'Guitar', types: ['world_instrument', 'rec_meta_nylon_guitar'] },
      { name: 'Tabla', types: ['tabla', 'rec_tabla_dholak'] },
    ];
    const isBlank = (steps: (SequencerNote | null | undefined)[]) => steps.length === 16 && steps.every((note) => !note);
    if (this.isPlaying || this.recorder.state !== 'idle' || this.bpm !== 128 || this.tracks.length !== expected.length || this.devices.size !== 8) return false;
    const matches = expected.every(({ name, types }, i) => {
      const track = this.tracks[i];
      const device = track ? this.devices.get(track.deviceId) : undefined;
      const pattern = track?.patternList?.find((p) => p.id === track.activePatternId);
      const clip = track?.arrangementClips?.[0];
      return !!track && !!device && !!pattern && track.name === name && types.includes(device.type) && device.name === name &&
        track.patternList?.length === 1 && isBlank(track.steps) && isBlank(pattern.steps) &&
        track.arrangementClips?.length === 1 && clip?.kind === 'pattern' && clip.startBar === 0 && clip.lengthBars === 4;
    });
    const hasDefaultReturns = [...this.devices.values()].some((d) => d.type === 'rv7000' && d.name === 'Reverb (Cathedral)') &&
      [...this.devices.values()].some((d) => d.type === 'echo' && d.name === 'Delay (Repeater)');
    if (!matches || !hasDefaultReturns) return false;
    this.applyStarterGroove();
    this.notify();
    return true;
  }

  /** Reverb and Delay returns (fully wet effects on return buses, fed by channel sends). */
  public createDefaultReturns(): void {
    const reverb = this.createDevice('rv7000', 'Reverb (Cathedral)');
    this.mixer.createReturn('Reverb', reverb, '#38bdf8');
    const delay = this.createDevice('echo', 'Delay (Repeater)');
    delay.setParam('time', (60 / this.bpm) * 0.75);
    this.mixer.createReturn('Delay', delay, '#a78bfa');
  }

  /** Empties the project (devices, tracks, cables, mixer, markers, module blocks) for New / templates. */
  public resetProject(): void {
    this.suppressUndoCapture = true;
    try {
      if (this.recorder.state !== 'idle') void this.recorder.stop();
      this.stopTransport();
      Array.from(this.devices.values()).forEach((d) => this.removeDevice(d.id, true));
      this.tracks = [];
      this.trackFolders = [];
      this.songBlocks = [];
      this.blockPlacements = [];
      this.audioConnections = [];
      this.cvConnections = [];
      this.rackGroups = [];
      this.arrangementMarkers = [];
      this.arrangementMinBars = 32;
      this.bpm = 120;
      this.globalSwing = 0;
      this.timeSignature = '4/4';
      this.rootKey = 0;
      this.scaleType = 'minor';
      this.patternLength = 16;
      this.activePatternIndex = 0;
      this.playbackMode = 'song_arrangement';
      this.loopEnabled = true;
      this.loopStartBar = 0;
      this.loopEndBar = 4;
      this.loopFollowsSong = true;
      this.projectSections.forEach((s) => s.load(undefined, new Map()));
      (['low', 'mid', 'high', 'width'] as const).forEach((k) => this.setMasterSpectrumParam(k, 0.5));
      this.setMasterSpectrumParam('reverbSend', 0);
      this.setMasterSpectrumParam('delaySend', 0);
      this.masterGain.gain.value = 0.9;
      this.masterSpectrumState.mix = 0.78;
    } finally {
      this.suppressUndoCapture = false;
    }
    undoJournal.clear();
    this.lastTracksJson = '';
    this.notify();
  }

  /** New project: the default instruments + Reverb / Delay returns (`empty`: returns only). */
  public newProject(empty = false): void {
    this.resetProject();
    if (empty) {
      this.bpm = 120;
      this.createDefaultReturns();
      this.notify();
      return;
    }
    this.initDefaultSession();
    this.notify();
  }

  public clearAllRackDevices(): void {
    Array.from(this.devices.keys()).forEach((id) => this.removeDevice(id));
    this.tracks = [];
    this.trackFolders = [];
    this.songBlocks = [];
    this.blockPlacements = [];
    this.audioConnections = [];
    this.cvConnections = [];
    this.rackGroups = [];
    this.notify();
  }

  // Optional 1-click manual starter kit if user chooses to unbox a pre-wired ensemble
  public unboxStarterEnsemble(): void {
    this.clearAllRackDevices();
    this.initDefaultSession();
    this.notify();
  }

  // ============================================================================
  // 19 ADVANCED AI, VOCAL, BROWSER & OUTBOARD HARDWARE EXECUTION METHODS
  // ============================================================================
  public outboardRackState: Record<
    string,
    { enabled: boolean; drive: number; mix: number; character: string }
  > = {
    // All off by default: these process the WHOLE master bus (a mix shouldn't start squashed and echoed).
    vintage_tube_sat: { enabled: false, drive: 68, mix: 85, character: '12AX7 Class-A Triode' },
    opto_leveling_amp: { enabled: false, drive: 54, mix: 100, character: 'T4B Electro-Optical' },
    fet_dynamic_limiter: { enabled: false, drive: 82, mix: 70, character: 'FET All-Buttons-In' },
    vari_mu_glue_comp: { enabled: false, drive: 45, mix: 90, character: 'Vari-Mu M/S Master Glue' },
    convolution_ir_space: { enabled: false, drive: 40, mix: 32, character: 'Berlin Industrial Silo IR' },
    spring_plate_reverb: { enabled: false, drive: 55, mix: 28, character: 'Gold Foil Plate' },
    bbd_analog_delay: { enabled: false, drive: 62, mix: 35, character: 'Dual MN3005 4096-Stage BBD' },
  };

}

// Global Singleton Instance
export const audioEngine = new AudioEngine();
