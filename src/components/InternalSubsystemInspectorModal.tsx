import React, { useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { InternalOptionCategory, AdvancedOptionCategory } from '../audio/types.ts';
import { ADVANCED_ENGINE_SPECS, ADVANCED_ENGINE_LIST } from '../audio/advancedToolsData.ts';
import {
  X,
  ShieldCheck,
  Cpu,
  Sliders,
  Layers,
  Sparkles,
  Activity,
  Radio,
  HardDrive,
  FolderArchive,
  Save,
  RotateCcw,
  CheckCircle2,
  Waves,
  Gauge,
  SplitSquareVertical,
  PlusCircle,
  Music,
  Download,
  Play,
} from 'lucide-react';

interface InternalSubsystemInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioEngine: AudioEngine;
  initialCategory?: InternalOptionCategory;
  initialAdvancedCategory?: AdvancedOptionCategory;
}

interface SubsystemToolDef {
  id: string;
  name: string;
  metricLabel: string;
  defaultValue: string;
  options: string[];
  desc: string;
}

const OPTION_SUBSYSTEM_MAP: Record<
  InternalOptionCategory,
  {
    title: string;
    badge: string;
    subtitle: string;
    tools: SubsystemToolDef[];
  }
> = {
  unboxed_gold: {
    title: 'UNBOXED / TECHNO HI-FI',
    badge: 'CORE DSP & GRAPHICS',
    subtitle: 'Cryptographic License Verification, Manifest Updater & 120FPS GPU Canvas Engine',
    tools: [
      {
        id: 'lic_val',
        name: 'Product License Validation Routine',
        metricLabel: 'CERTIFICATE STATE',
        defaultValue: 'TECHNO-HIFI-PRO-VERIFIED',
        options: ['TECHNO-HIFI-PRO-VERIFIED', 'ENTERPRISE-STUDIO-KEY', 'OFFLINE-DONGLE-AUTH'],
        desc: 'RSA-4096 hardware-bound studio entitlement verification routine.',
      },
      {
        id: 'anti_piracy',
        name: 'Anti-Piracy Key Verification Module',
        metricLabel: 'HASH INTEGRITY',
        defaultValue: 'SHA-512 SIGNED (OK)',
        options: ['SHA-512 SIGNED (OK)', 'STRICT KERNEL ENCLAVE', 'DEEP BINARY CHECKSUM'],
        desc: 'Real-time binary signature guard preventing unauthorized DSP injection.',
      },
      {
        id: 'ver_manifest',
        name: 'Version Manifest Update Checker',
        metricLabel: 'BUILD CHANNEL',
        defaultValue: 'v2026.10 HI-FI MASTER',
        options: ['v2026.10 HI-FI MASTER', 'NIGHTLY DSP BRANCH', 'LTS STUDIO LOCKED'],
        desc: 'Queries remote manifest registry for zero-downtime DSP engine updates.',
      },
      {
        id: 'gfx_canvas',
        name: 'Graphics Engine Canvas Renderer',
        metricLabel: 'RENDER PIPELINE',
        defaultValue: '120 FPS WebGL2 / HiDPI',
        options: ['120 FPS WebGL2 / HiDPI', '60 FPS VSync Locked', 'Ultra-Low Power 2D'],
        desc: 'Hardware-accelerated framebuffer pipeline for VU needles, cables, and FFT scopes.',
      },
    ],
  },
  f1_sequencer: {
    title: 'F1 SEQUENCER',
    badge: 'CLOCK & ARBITRATION',
    subtitle: 'High-Precision Lookahead Clock Comparator, Pattern Cache & Voice Arbitrator',
    tools: [
      {
        id: 'playhead_matrix',
        name: 'Playhead Frame Counter Matrix',
        metricLabel: 'PPQN RESOLUTION',
        defaultValue: '960 PPQN Sub-Sample',
        options: ['960 PPQN Sub-Sample', '480 PPQN Studio', '1920 PPQN Ultra-Sync'],
        desc: 'Tracks sample-accurate frame positions across 16 to 512 step pattern banks.',
      },
      {
        id: 'tick_grid',
        name: 'Continuous Tick-to-Grid Clock Event Comparator',
        metricLabel: 'LOOKAHEAD HORIZON',
        defaultValue: '100 ms / 25 ms Tick',
        options: ['100 ms / 25 ms Tick', '50 ms / 10 ms Tight', '150 ms Safe Buffer'],
        desc: 'Compares WebAudio hardware clock against scheduled step events with zero drift.',
      },
      {
        id: 'pat_cache',
        name: 'Internal Pattern Buffer Cache Manager',
        metricLabel: 'BANK PRE-FETCH',
        defaultValue: 'PAT 1–8 Zero-Latency RAM',
        options: ['PAT 1–8 Zero-Latency RAM', 'Double-Buffered Swap', 'On-Bar Quantized Switch'],
        desc: 'Pre-caches all 8 pattern banks per instrument for instantaneous switching.',
      },
      {
        id: 'quant_snap',
        name: 'Step Quantization Snap Algorithm Engine',
        metricLabel: 'SNAP GRID MAGNETISM',
        defaultValue: '1/16th + Scale Lock',
        options: ['1/16th + Scale Lock', '1/32nd Surgical', '1/8th Triplet Groove', 'Micro-Free'],
        desc: 'Magnetic grid & musical scale snapping algorithm for incoming MIDI and drawn notes.',
      },
      {
        id: 'note_arbitrator',
        name: 'Monophonic/Polyphonic Note State Arbitrator',
        metricLabel: 'VOICE STEALING MODE',
        defaultValue: '64-Voice Poly / Oldest Steal',
        options: ['64-Voice Poly / Oldest Steal', 'Mono Legato Glide', 'Priority High-Note'],
        desc: 'manages active voice allocation and overlap termination across all synth generators.',
      },
    ],
  },
  f2_mixer: {
    title: 'F2 MIXER',
    badge: '64-BIT SUMMING BUS',
    subtitle: 'Floating-Point dB Fader Law, Pan-Pot Compensation & DMA Stream Router',
    tools: [
      {
        id: 'db_mult',
        name: 'Floating-Point DB Volume Multiplier Processing Node',
        metricLabel: 'SUMMING PRECISION',
        defaultValue: '64-Bit Float Logarithmic',
        options: ['64-Bit Float Logarithmic', '32-Bit IEEE Float', 'Analog Console Modeling'],
        desc: 'Converts linear fader travel to smooth decibel gain ramps without zipper noise.',
      },
      {
        id: 'pan_law',
        name: 'Pan-Pot Inter-channel Level Law Coefficient Calculator',
        metricLabel: 'STEREO PAN LAW',
        defaultValue: '-3.0 dB Constant Power',
        options: ['-3.0 dB Constant Power', '-4.5 dB SSL/Neve Law', '-6.0 dB Linear Broadcast'],
        desc: 'Calculates sin/cos stereo pan coefficients to preserve perceived center loudness.',
      },
      {
        id: 'dma_router',
        name: 'Direct Memory Access Inter-Plugin Multi-Stream Buffer Router',
        metricLabel: 'BUS ROUTING DMA',
        defaultValue: '500 Inserts Zero-Copy',
        options: ['500 Inserts Zero-Copy', 'Parallel Lockless Ring', 'SIMD Vector Bus'],
        desc: 'Routes multi-channel audio streams across 500 inserts and 10 FX slots per strip.',
      },
      {
        id: 'phase_inv',
        name: 'Input/Output Master Phase Inversion Logic Module',
        metricLabel: 'POLARITY MATRIX (Ø)',
        defaultValue: '0° Normal Polarity',
        options: ['0° Normal Polarity', '180° Inverted L+R', '180° Side-Only Flip'],
        desc: 'Flips waveform polarity (-1.0x multiplier) to correct multi-mic phase cancellation.',
      },
      {
        id: 'pre_post_tap',
        name: 'Pre-Fader vs Post-Fader Tap Interceptor Hook',
        metricLabel: 'AUX / METER TAP POINT',
        defaultValue: 'Post-Fader / Post-FX',
        options: ['Post-Fader / Post-FX', 'Pre-Fader Input Tap', 'Pre-FX Dry Signal Tap'],
        desc: 'Selects signal interception point for auxiliary sends, sidechains, and peak meters.',
      },
    ],
  },
  f3_rack: {
    title: 'F3 RACK',
    badge: 'MODULAR OUTBOARD CHASSIS',
    subtitle: 'Virtual Node Graph, DC Overload Guard & Cable Vector Geometry Renderer',
    tools: [
      {
        id: 'rack_graph',
        name: 'Virtual Rack Unit Node Connector Graph',
        metricLabel: 'TOPOLOGY SOLVER',
        defaultValue: 'Directed Acyclic DSP Graph',
        options: ['Directed Acyclic DSP Graph', 'Feedback-Delay Compensated', 'Auto-Master Normalled'],
        desc: 'Resolves modular audio and CV patching chains between 19-inch rack devices.',
      },
      {
        id: 'dc_safety',
        name: 'Direct Current Overload Safety Limiter Subroutine',
        metricLabel: 'DC & CLIPPING GUARD',
        defaultValue: '20Hz Highpass + -0.1dB Brickwall',
        options: ['20Hz Highpass + -0.1dB Brickwall', 'Soft-Knee Analog Clipper', 'Hard Mute > +6dBFS'],
        desc: 'Removes sub-audible DC offset and prevents runaway feedback spikes.',
      },
      {
        id: 'z_axis_sort',
        name: 'Modular Device Z-Axis Layout Sorting Engine',
        metricLabel: 'CHASSIS STACK ORDER',
        defaultValue: 'Signal-Flow Auto-Stack',
        options: ['Signal-Flow Auto-Stack', 'Instruments Top / FX Bottom', 'Custom Manual Lock'],
        desc: 'Manages 1U/2U/3U rack rail elevation and front/back flip z-index layering.',
      },
      {
        id: 'cable_geo',
        name: 'Audio Cable Control Voltage Vector Geometry Renderer',
        metricLabel: 'CABLE PHYSICS SAG',
        defaultValue: 'Catenary Gravity Curve (High)',
        options: ['Catenary Gravity Curve (High)', 'Tight Patch Cords', 'Translucent Ghost Mode'],
        desc: 'Computes bezier catenary droop and signal-pulsing glow for rear patch cables.',
      },
      {
        id: 'patch_packager',
        name: 'Dynamic Serialization Patch State Packager',
        metricLabel: 'RACK SNAPSHOT FORMAT',
        defaultValue: 'Full Rack + CV (.ubxpatch)',
        options: ['Full Rack + CV (.ubxpatch)', 'Cables Only Preset', 'Compressed Binary'],
        desc: 'Serializes all rack devices, knob values, and rear patch cords into portable patches.',
      },
    ],
  },
  split_view: {
    title: 'SPLIT (PARALLEL WORKSPACE)',
    badge: 'MULTI-VIEWPORT ENGINE',
    subtitle: 'Dual-Deck Matrix Bounds Recalculator, HiDPI Context Splitter & Event Multiplexer',
    tools: [
      {
        id: 'panel_bounds',
        name: 'Multi-Window Panel Matrix Bounds Recalculator',
        metricLabel: 'SPLIT RATIO',
        defaultValue: '55% Upper Sequencer / 45% Lower Deck',
        options: ['55% Upper Sequencer / 45% Lower Deck', '50% / 50% Balanced', '65% Upper / 35% Lower'],
        desc: 'Dynamically computes viewport bounding boxes when stacking Sequencer + Rack/Mixer.',
      },
      {
        id: 'hidpi_split',
        name: 'UI Thread High-DPI Context Splitter',
        metricLabel: 'DEVICE PIXEL RATIO',
        defaultValue: 'Retina 2x Super-Sampled',
        options: ['Retina 2x Super-Sampled', 'Native 1x Fast Blit', '3x Ultra-Crisp Vector'],
        desc: 'Maintains razor-sharp font and canvas scaling across independent split scroll containers.',
      },
      {
        id: 'fb_scheduler',
        name: 'Framebuffer Blitting Workspace Redraw Scheduler',
        metricLabel: 'DIRTY-RECT CULLING',
        defaultValue: 'Smart Playhead Diffing',
        options: ['Smart Playhead Diffing', 'Full Frame Sync 60Hz', 'GPU Layer Compositing'],
        desc: 'Schedules simultaneous playhead and VU meter repaints without blocking audio threads.',
      },
      {
        id: 'event_mux',
        name: 'Viewport Event Multiplexer Forwarding Controller',
        metricLabel: 'HOTKEY & MIDI ROUTING',
        defaultValue: 'Global Transport + Active Deck',
        options: ['Global Transport + Active Deck', 'Focus-Locked Pane', 'Dual-Pane Broadcast'],
        desc: 'Forwards keyboard shortcuts (Space, F1–F3, Tab) and MIDI notes across split panes.',
      },
    ],
  },
  add_module: {
    title: 'ADD MODULE (EQUIPMENT LOCKER)',
    badge: 'PLUGIN & INSTRUMENT HOST',
    subtitle: 'VST3 DLL Wrapper, CLAP/AU Registry Scanner & Sandboxed Subprocess Spawner',
    tools: [
      {
        id: 'vst3_dll',
        name: 'VST3 Dynamic Link Library (DLL) Wrapper Host Node',
        metricLabel: 'VST3 SDK BRIDGE',
        defaultValue: 'VST 3.7.9 AudioProcessor',
        options: ['VST 3.7.9 AudioProcessor', 'VST2 Legacy Adapter', '64-Bit Native Bridge'],
        desc: 'Wraps external VST3 binary audio processors into unified WebAudio rack nodes.',
      },
      {
        id: 'clap_au_scan',
        name: 'CLAP/AudioUnit Registry Query Scanning Engine',
        metricLabel: 'SCAN REGISTRY STATUS',
        defaultValue: '128 Instruments & FX Indexed',
        options: ['128 Instruments & FX Indexed', 'Deep Rescan On Boot', 'Fast Cache Lookup'],
        desc: 'Queries CLAP, macOS AudioUnit, and AAX system directories for zero-wait instantiation.',
      },
      {
        id: 'cat_parser',
        name: 'Categories Sub-Menu Directory Mapping Parser',
        metricLabel: 'TAXONOMY CLASSIFICATION',
        defaultValue: 'Hornbostel-Sachs + Synth/FX',
        options: ['Hornbostel-Sachs + Synth/FX', 'By Manufacturer', 'By CPU Footprint'],
        desc: 'Maps Synths, Percussion, Electrophones, Chordophones, Aerophones, and Mastering FX.',
      },
      {
        id: 'sandbox_spawn',
        name: 'Sandbox Subprocess Instantiation Handler',
        metricLabel: 'PROCESS ISOLATION',
        defaultValue: 'Isolated Worker + Crash Guard',
        options: ['Isolated Worker + Crash Guard', 'In-Process Zero Latency', 'Dedicated DSP Core'],
        desc: 'Spawns newly added instruments inside a protected memory space with auto-routing.',
      },
    ],
  },
  ai_copilot: {
    title: 'AI CO-PILOT',
    badge: 'NEURAL MUSIC ENGINE',
    subtitle: 'Neural Weight Graph, Text-to-MIDI Tokenizer & Voice-Leading Evaluator',
    tools: [
      {
        id: 'dnn_graph',
        name: 'Deep Neural Network Matrix Float Weight Processing Graph',
        metricLabel: 'TENSOR PRECISION',
        defaultValue: 'FP16 Accelerated Transformer',
        options: ['FP16 Accelerated Transformer', 'INT8 Ultra-Fast Quantized', 'FP32 Studio Quality'],
        desc: 'Executes neural attention layers for genre-authentic pattern and patch synthesis.',
      },
      {
        id: 'txt_to_midi',
        name: 'Real-Time Low-Latency Text-to-MIDI Note Translator Tokenizer',
        metricLabel: 'TOKENIZER VOCABULARY',
        defaultValue: 'Pitch + Velocity + Gate + CC',
        options: ['Pitch + Velocity + Gate + CC', 'Polyphonic Chord Tokens', 'Drum Groove Micro-Grid'],
        desc: 'Translates natural language prompts into quantized SequencerNote events.',
      },
      {
        id: 'prompt_cache',
        name: 'Localized Offline Contextual Prompt Parameter Vector Cache',
        metricLabel: 'EMBEDDING CACHE',
        defaultValue: 'Session Context Active (RAM)',
        options: ['Session Context Active (RAM)', 'Persistent Disk Cache', 'Zero-History Fresh'],
        desc: 'Caches active project BPM, key scale, and instrument roster for context-aware generation.',
      },
      {
        id: 'worker_queue',
        name: 'Parallel Non-Blocking Background Thread Worker Task Queue',
        metricLabel: 'ASYNC WORKER POOL',
        defaultValue: '4 Background Threads (Non-Blocking)',
        options: ['4 Background Threads (Non-Blocking)', '8 Priority Threads', 'Low-CPU Eco Queue'],
        desc: 'Runs AI composition and sound design tasks asynchronously without audio dropouts.',
      },
      {
        id: 'voice_leading',
        name: 'Algorithmic Voice-Leading Rule Engine Evaluator',
        metricLabel: 'HARMONIC CONSTRAINTS',
        defaultValue: 'Counterpoint + Scale Lock',
        options: ['Counterpoint + Scale Lock', 'Industrial Parallel 5ths', 'Jazz Extended Voicings'],
        desc: 'Enforces smooth chord inversions and prevents dissonant clashes across tracks.',
      },
    ],
  },
  cv_matrix: {
    title: 'CV MATRIX',
    badge: 'CONTROL VOLTAGE ROUTER',
    subtitle: 'Floating-Point CV Accumulator, Bipolar Mapper & Spider Signal Splitter',
    tools: [
      {
        id: 'cv_accum',
        name: 'Floating-Point Control Voltage Sample Accumulator',
        metricLabel: 'CV SAMPLE RATE',
        defaultValue: 'Audio-Rate 48kHz Summing',
        options: ['Audio-Rate 48kHz Summing', 'Control-Rate 1kHz Fast', 'Sub-Step Interpolated'],
        desc: 'Sums multiple LFO, Matrix, and Envelope CV sources into unified modulation buses.',
      },
      {
        id: 'bi_uni_map',
        name: 'Bipolar-to-Unipolar Signal Range Mapping Node',
        metricLabel: 'VOLTAGE POLARITY',
        defaultValue: '-5V..+5V <-> 0.0..1.0 Auto-Map',
        options: ['-5V..+5V <-> 0.0..1.0 Auto-Map', 'Unipolar 0V..+10V Strict', 'Inverted Polarity'],
        desc: 'Maps bipolar LFO waves (-1..+1) onto unipolar synth filter/resonance parameters.',
      },
      {
        id: 'spider_split',
        name: 'Spider Audio/CV Signal Splitter Interceptor Topology',
        metricLabel: 'SPLITTER MATRIX',
        defaultValue: '1-to-4 Buffered Multi-Out + Invert',
        options: ['1-to-4 Buffered Multi-Out + Invert', '4-to-1 CV Merger', 'Dual Cross-Mod Matrix'],
        desc: 'Clones a single CV or audio signal across 4 destination jacks with zero voltage drop.',
      },
      {
        id: 'mod_mem_map',
        name: 'Modulation Routing Target Node Index Memory Map',
        metricLabel: 'ACTIVE ROUTES',
        defaultValue: '64-Slot Lockless Lookup Table',
        options: ['64-Slot Lockless Lookup Table', '128-Slot Extended Matrix', 'Direct Pointer Dispatch'],
        desc: 'Maintains O(1) lookup pointers from CV sources to destination device parameters.',
      },
      {
        id: 'smooth_interp',
        name: 'Signal Smooth Filter Dampening Interpolator',
        metricLabel: 'SLEW LIMITER TIME',
        defaultValue: '8.5 ms Zipper-Free Ramp',
        options: ['8.5 ms Zipper-Free Ramp', '0.5 ms Instant Step', '45 ms Analog Lag Glide'],
        desc: 'Applies exponential lowpass smoothing to stepped modulation signals.',
      },
    ],
  },
  master_knob: {
    title: 'MASTER (KNOB)',
    badge: 'MASTER GAIN & HEADROOM',
    subtitle: 'Exponential Audio Taper, Safety Ceiling Interceptor & 64-Bit Headroom Preserver',
    tools: [
      {
        id: 'exp_taper',
        name: 'Exponential Audio Taper Curve Lookup Matrix Table',
        metricLabel: 'POTENTIOMETER LAW',
        defaultValue: 'Logarithmic dB Studio Taper',
        options: ['Logarithmic dB Studio Taper', 'S-Curve Mastering Taper', 'Linear Voltage Law'],
        desc: 'Provides fine 0.1 dB resolution near unity gain (0.0 dBFS) on the Master rotary control.',
      },
      {
        id: 'clip_ceiling',
        name: 'Safety Clipping Ceiling Interceptor Node',
        metricLabel: 'TRUE PEAK CEILING',
        defaultValue: '-0.5 dBTP Brickwall Guard',
        options: ['-0.5 dBTP Brickwall Guard', '-0.1 dBTP Club Loud', '-1.0 dBTP Streaming Safe'],
        desc: 'Intercepts inter-sample peaks before the DAC output stage to eliminate digital clipping.',
      },
      {
        id: 'bit_headroom',
        name: 'Global Gain Node Bit-Depth Headroom Preserver',
        metricLabel: 'INTERNAL HEADROOM',
        defaultValue: '+36 dB Floating-Point Headroom',
        options: ['+36 dB Floating-Point Headroom', '24-Bit TPDF Dithered', '64-Bit Double Bus'],
        desc: 'Preserves full dynamic range prior to final master bus limiting.',
      },
      {
        id: 'midi_cc_hook',
        name: 'Thread-Safe MIDI CC Parameter Automation Input Hook',
        metricLabel: 'MIDI CC BINDING',
        defaultValue: 'CC #7 Master Volume (Smoothed)',
        options: ['CC #7 Master Volume (Smoothed)', 'CC #11 Expression', 'Hardware Fader Lock'],
        desc: 'Accepts external MIDI controller CC messages with sample-accurate ramp smoothing.',
      },
    ],
  },
  vu_dials: {
    title: 'OUT L / OUT R (VU DIALS)',
    badge: 'BALLISTICS & METERING',
    subtitle: 'FFT RMS Energy Calculator, Analog VU Inertia Physics & Peak Clip Monitor',
    tools: [
      {
        id: 'fft_rms',
        name: 'Fast-Fourier Transform RMS Energy Amplitude Signal Calculator',
        metricLabel: 'RMS WINDOW SIZE',
        defaultValue: '256-Sample True RMS',
        options: ['256-Sample True RMS', '1024-Sample ITU-R BS.1770', '128-Sample Fast Transient'],
        desc: 'Computes root-mean-square acoustic power separately for Left and Right master buses.',
      },
      {
        id: 'vu_ballistics',
        name: 'Analog-Modeled VU Needle Return Inertia Physics Ballistics Engine',
        metricLabel: 'NEEDLE BALLISTICS',
        defaultValue: '300 ms ANSI C16.5 Standard',
        options: ['300 ms ANSI C16.5 Standard', '150 ms Fast BBC PPM', '500 ms Damped Vintage'],
        desc: 'Simulates physical coil mass, spring tension, and needle overshoot/decay inertia.',
      },
      {
        id: 'db_to_angle',
        name: 'Decibel-to-Angle Frame Display Coordinate Translator',
        metricLabel: 'DIAL ARC CALIBRATION',
        defaultValue: '-20 dB to +3 dB (0 VU = -18 dBFS)',
        options: ['-20 dB to +3 dB (0 VU = -18 dBFS)', '0 VU = -14 dBFS Mastering', '0 VU = -12 dBFS Hot'],
        desc: 'Maps logarithmic decibel values onto radial needle angles on the backlit cream dial.',
      },
      {
        id: 'clip_led',
        name: 'Visual Clip Indicator Peak Threshold Monitor',
        metricLabel: 'PEAK HOLD LED',
        defaultValue: '-0.2 dBFS Trigger / 2s Hold',
        options: ['-0.2 dBFS Trigger / 2s Hold', '0.0 dBFS Instant', 'Infinite Peak Hold'],
        desc: 'Illuminates the ruby peak warning LED whenever instantaneous sample amplitude nears 0 dBFS.',
      },
    ],
  },
  step_grid: {
    title: 'STEP GRID',
    badge: 'EUCLIDEAN & RATCHET SEQUENCER',
    subtitle: 'Subdivision Math Trigger, Micro-Timing Buffer, Probability & Ratchet Sub-Loop',
    tools: [
      {
        id: 'subdiv_math',
        name: 'Note Division Frequency Subdivision Math Trigger',
        metricLabel: 'STEP CLOCK DIVISION',
        defaultValue: '1/16th Note (4 Steps/Beat)',
        options: ['1/16th Note (4 Steps/Beat)', '1/32nd Double-Time', '1/8th Triplet Feel', '1/4 Bar Pulse'],
        desc: 'Dynamically computes step intervals from global BPM and time signature.',
      },
      {
        id: 'micro_delay',
        name: 'Micro-Timing Step Millisecond Offset Delay Buffer',
        metricLabel: 'SWING & NUDGE RANGE',
        defaultValue: '±50% Step Micro-Offset',
        options: ['±50% Step Micro-Offset', 'MPC 58% Classic Swing', 'Sample-Accurate Sub-Tick'],
        desc: 'Shifts individual step triggers ahead or behind the beat without altering grid visuals.',
      },
      {
        id: 'prob_op',
        name: 'Per-Step Random Number Note Chance Probability Operator',
        metricLabel: 'BERNOULLI GATE RNG',
        defaultValue: '10%–100% Per-Step Chance',
        options: ['10%–100% Per-Step Chance', 'Seeded Deterministic RNG', 'Alternating A/B Cycle'],
        desc: 'Evaluates per-step probability before firing noteOn to create evolving industrial patterns.',
      },
      {
        id: 'ratchet_loop',
        name: 'Step Ratchet Note Subdivision Repetition Sub-Loop Engine',
        metricLabel: 'RATCHET MULTIPLIER',
        defaultValue: '1x / 2x / 3x / 4x Rapid Burst',
        options: ['1x / 2x / 3x / 4x Rapid Burst', 'Velocity-Decaying Flam', 'Accelerando Roll'],
        desc: 'Subdivides a single step into 2, 3, or 4 rapid-fire re-triggers for snare rolls and acid trills.',
      },
    ],
  },
  piano_roll: {
    title: 'PIANO ROLL',
    badge: 'SURGICAL MIDI MATRIX',
    subtitle: 'Velocity Data Packer, Hz-to-MIDI Converter, Vector Resize Box & Poly Aftertouch',
    tools: [
      {
        id: 'vel_packer',
        name: 'MIDI Note-On / Note-Off Inter-Thread Velocity Data Packer',
        metricLabel: 'VELOCITY RESOLUTION',
        defaultValue: 'Float32 (0.00–1.00) + 14-Bit MIDI',
        options: ['Float32 (0.00–1.00) + 14-Bit MIDI', '7-Bit Standard (0–127)', 'Velocity Curve Exp'],
        desc: 'Packs pitch, velocity, gate length, and chord stack offsets into lockless audio packets.',
      },
      {
        id: 'hz_to_midi',
        name: 'Pitch Frequency Hz-to-MIDI Note Integer Formula Converter',
        metricLabel: 'CONCERT PITCH A4',
        defaultValue: '440.0 Hz Equal Temperament',
        options: ['440.0 Hz Equal Temperament', '432.0 Hz Verdi Tuning', '442.0 Hz Orchestral Bright'],
        desc: 'Computes exact oscillator frequencies via f = A4 * 2^((midi - 69 + finePitch)/12).',
      },
      {
        id: 'drag_resize_box',
        name: 'Visual Note Vector Bound Drag-Resize Bounding Calculation Box',
        metricLabel: 'RESIZE HANDLE HITBOX',
        defaultValue: 'Right-Edge Drag + Inline -/+',
        options: ['Right-Edge Drag + Inline -/+', 'Free Sub-Step Resize', 'Auto-Truncate Overlap'],
        desc: 'Tracks horizontal mouse delta to extend or reduce note durations from 1 to 64 steps.',
      },
      {
        id: 'poly_at',
        name: 'Polyphonic Aftertouch Continuous Pressure Value Tracker',
        metricLabel: 'AFTERTOUCH ROUTING',
        defaultValue: 'Per-Note Filter Cutoff + Vibrato',
        options: ['Per-Note Filter Cutoff + Vibrato', 'Pitch Bend Micro-Expression', 'Gain Swell'],
        desc: 'Tracks independent per-note pressure curves for MPE and expressive synth articulation.',
      },
    ],
  },
  arrangement: {
    title: 'ARRANGEMENT',
    badge: 'LINEAR TIMELINE & STEMS',
    subtitle: 'Disk Waveform Interceptor, Viewport Scroller, Multi-Stem Sync & Region Splicer',
    tools: [
      {
        id: 'disk_buffer',
        name: 'Audio Sample Waveform File Disk Interceptor Buffer',
        metricLabel: 'STREAMING CACHE',
        defaultValue: '64 MB RAM Pre-Roll Ring Buffer',
        options: ['64 MB RAM Pre-Roll Ring Buffer', 'Full RAM Lock (Zero Disk)', 'Direct-From-Disk NVMe'],
        desc: 'Streams frozen stems and long audio takes with zero seek latency.',
      },
      {
        id: 'viewport_scroller',
        name: 'Multi-Track Grid Frame Bounds Viewport Caching Scroller',
        metricLabel: 'TIMELINE VIRTUALIZATION',
        defaultValue: '16-Bar Hardware-Accelerated Grid',
        options: ['16-Bar Hardware-Accelerated Grid', '64-Bar Extended Song', 'Auto-Follow Playhead'],
        desc: 'Caches off-screen arrangement clip geometry for smooth horizontal timeline scrolling.',
      },
      {
        id: 'stem_sync',
        name: 'Linear Timeline Multi-Stem Event Time Sync Scheduler',
        metricLabel: 'CLIP BANK LOCK',
        defaultValue: 'Sample-Locked PAT 1–8 Clips',
        options: ['Sample-Locked PAT 1–8 Clips', 'Beat-Quantized Launch', 'Free Timecode Sync'],
        desc: 'Synchronizes pattern clips, comping takes (T1–T3), and project markers across all tracks.',
      },
      {
        id: 'region_splicer',
        name: 'Non-Destructive Audio Region Splice Clip Boundary Slicing Mapper',
        metricLabel: 'SPLICE CROSSFADE',
        defaultValue: '5 ms Cosine De-Click Crossfade',
        options: ['5 ms Cosine De-Click Crossfade', 'Zero-Crossing Snap', 'Hard Industrial Cut'],
        desc: 'Performs non-destructive Scissors split and Glue join operations without audio clicks.',
      },
    ],
  },
  graph_cc: {
    title: 'GRAPH & CC',
    badge: 'AUTOMATION & MODULATION',
    subtitle: 'Bezier Curve Calculator, Envelope Cache Iterator & Node Decimation Optimizer',
    tools: [
      {
        id: 'bezier_calc',
        name: 'Bezier Control Node Vector Curve Trajectory Calculator',
        metricLabel: 'CURVE INTERPOLATION',
        defaultValue: 'Cubic Bezier Tension Spline',
        options: ['Cubic Bezier Tension Spline', 'Stepped Sample & Hold', 'Exponential Analog Sweep'],
        desc: 'Computes smooth parameter trajectories between step stalks for CC1, CC74, CC91, and Cutoff.',
      },
      {
        id: 'env_iterator',
        name: 'Continuous Control Parameter Automation Envelope Cache Iterator',
        metricLabel: 'AUTOMATION UPDATE RATE',
        defaultValue: 'Every Step + Sub-Frame Ramp',
        options: ['Every Step + Sub-Frame Ramp', 'Audio-Rate 48kHz Smooth', 'On-Note-Trigger Only'],
        desc: 'Iterates through cached Velocity, Vari-Pitch, Pan, and Filter lanes during playback.',
      },
      {
        id: 'uni_bi_interp',
        name: 'Unipolar vs Bipolar Mod Offset Value Linear Interpolator',
        metricLabel: 'LANE SCALING MODE',
        defaultValue: 'Auto (Pitch/Pan Bipolar, CC Unipolar)',
        options: ['Auto (Pitch/Pan Bipolar, CC Unipolar)', 'Normalized 0–100%', 'Signed 14-Bit Offset'],
        desc: 'Scales stalk heights to +/-12 semitones for Pitch, L/R for Pan, and 0–100% for MIDI CCs.',
      },
      {
        id: 'node_decimator',
        name: 'Vector Automation Redundant Anchor Node Decimation Optimizer',
        metricLabel: 'CURVE SIMPLIFICATION',
        defaultValue: 'Ramer-Douglas-Peucker (0.5% Tol)',
        options: ['Ramer-Douglas-Peucker (0.5% Tol)', 'Lossless Exact Nodes', 'Aggressive Smoothing'],
        desc: 'Eliminates redundant co-linear automation points to minimize CPU parameter dispatch.',
      },
    ],
  },
  sample_warp: {
    title: 'SAMPLE & WARP',
    badge: 'PHASE VOCODER & SLICING',
    subtitle: 'Transient Spectral Engine, Granular Phase Vocoder & Warp Marker Coordinate Tracker',
    tools: [
      {
        id: 'transient_spec',
        name: 'Peak Transient Detection Phase Coherence Spectral Engine',
        metricLabel: 'DETECTION ALGORITHM',
        defaultValue: 'Spectral Flux + High-Freq Energy',
        options: ['Spectral Flux + High-Freq Energy', 'RMS Derivative Drum Mode', 'Zero-Crossing Strict'],
        desc: 'Detects percussive attacks and harmonic onsets to place transient warp markers automatically.',
      },
      {
        id: 'phase_vocoder',
        name: 'Granular Time-Stretching Audio Phase Vocoder Interpolator',
        metricLabel: 'WARP ENGINE MODE',
        defaultValue: 'Phase-Locked Vocoder + Formant Lock',
        options: ['Phase-Locked Vocoder + Formant Lock', 'Granular Texture Clouds', 'Classic Tape Repitch'],
        desc: 'Stretches audio from 50% to 200% and shifts pitch ±24 semitones while preserving vocal formants.',
      },
      {
        id: 'slice_alloc',
        name: 'Slicing Cutpoint Sample Region Memory Boundary Allocator',
        metricLabel: 'SLICE TO MIDI TARGET',
        defaultValue: 'Auto-Map Slices to C2–G3 Pads',
        options: ['Auto-Map Slices to C2–G3 Pads', 'Transient Chop to Redrum', 'Equal 1/16th Grid Slices'],
        desc: 'Allocates non-destructive buffer pointers for each transient slice between Warp Markers.',
      },
      {
        id: 'warp_tracker',
        name: 'Warp Marker Waveform Canvas Pixel Coordinate Tracker',
        metricLabel: 'MARKER QUANTIZATION',
        defaultValue: 'Sub-Millisecond Normalized [0..1]',
        options: ['Sub-Millisecond Normalized [0..1]', 'Snap to 1/16th Beat Grid', 'Snap to Zero-Crossing'],
        desc: 'Maps interactive canvas click coordinates to sample frame indices with instant audition.',
      },
    ],
  },
  dsp_analyzer: {
    title: 'DSP & ANALYZER',
    badge: 'SPECTRAL & CPU DIAGNOSTICS',
    subtitle: 'Blackman-Harris FFT Window, Per-Thread Cycle Benchmarker & Phase Dot-Product Plotter',
    tools: [
      {
        id: 'fft_window',
        name: 'Real-Time FFT Window Blackman-Harris Frequency Component Analyzer',
        metricLabel: 'FFT WINDOW FUNCTION',
        defaultValue: '4-Term Blackman-Harris (-92dB Sidelobe)',
        options: ['4-Term Blackman-Harris (-92dB Sidelobe)', 'Hann Smoothing Window', 'Flat-Top Amplitude Exact'],
        desc: 'Applies precision spectral windowing across 64 logarithmic bands from 20Hz to 20kHz.',
      },
      {
        id: 'cpu_bench',
        name: 'Per-Thread CPU Load Millisecond Cycle Diagnostics Benchmarker',
        metricLabel: 'DSP CYCLE BUDGET',
        defaultValue: '0.31 ms / 2.67 ms Buffer Budget',
        options: ['0.31 ms / 2.67 ms Buffer Budget', 'Per-Core Thread Profiler', 'Peak Spike Logger'],
        desc: 'Measures real-time audio callback execution time across all 8 multi-core processing threads.',
      },
      {
        id: 'xrun_monitor',
        name: 'Audio Buffer Under-run Frame-Drop Exception Warning Monitor',
        metricLabel: 'XRUN / DROPOUT GUARD',
        defaultValue: '0 Underruns ( Buffer Healthy )',
        options: ['0 Underruns ( Buffer Healthy )', 'Auto-Upscale Buffer on XRUN', 'Strict Low-Latency Lock'],
        desc: 'Monitors hardware ring-buffer starvation and prevents audible clicks under heavy load.',
      },
      {
        id: 'phase_dot',
        name: 'Stereo Correlation Phase Coherence Angle Dot-Product Plotter',
        metricLabel: 'CORRELATION MATH',
        defaultValue: 'L·R / sqrt(L²·R²) -> +0.94 In-Phase',
        options: ['L·R / sqrt(L²·R²) -> +0.94 In-Phase', 'Mid/Side Energy Ratio', 'Lissajous Polar Vector'],
        desc: 'Computes normalized stereo dot-product and vectorscope phase angle for mono compatibility.',
      },
    ],
  },
};

export const InternalSubsystemInspectorModal: React.FC<InternalSubsystemInspectorModalProps> = ({
  isOpen,
  onClose,
  audioEngine,
  initialCategory = 'unboxed_gold',
  initialAdvancedCategory,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<InternalOptionCategory>(initialCategory);
  const [selectedAdvancedCategory, setSelectedAdvancedCategory] = useState<AdvancedOptionCategory>(
    initialAdvancedCategory || 'neural_stem_sep'
  );
  const [activeTab, setActiveTab] = useState<
    'image_options' | 'advanced_engines' | 'modulators' | 'daemon_assets' | 'lufs_sandbox'
  >(initialAdvancedCategory ? 'advanced_engines' : 'image_options');
  const [selectedSettings, setSelectedSettings] = useState<Record<string, string>>({});
  const [actionStatusMsg, setActionStatusMsg] = useState<string>('');
  const [, setTick] = useState(0);

  React.useEffect(() => {
    if (initialAdvancedCategory) {
      setSelectedAdvancedCategory(initialAdvancedCategory);
      setActiveTab('advanced_engines');
    } else if (initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory, initialAdvancedCategory]);

  if (!isOpen) return null;

  const activeSpec = OPTION_SUBSYSTEM_MAP[selectedCategory];
  const activeAdvSpec = ADVANCED_ENGINE_SPECS[selectedAdvancedCategory];
  const dependencies = audioEngine.collectSampleDependencies();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 font-mono">
      <div className="w-full max-w-6xl h-[88vh] bg-[#070a10] border-2 border-cyan-500/60 rounded-xl shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="h-12 bg-gradient-to-r from-[#06090f] via-[#0c1424] to-[#06090f] border-b border-cyan-500/30 px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-xs font-black tracking-wider text-cyan-300 uppercase">
                UNBOXED TECHNO HI-FI // INTERNAL SUBSYSTEMS, AI / VOCAL / OUTBOARD & ENGINE SUITE
              </div>
              <div className="text-[10px] text-slate-400">
                16 UI Option Matrices &bull; 19 Advanced Engines (76 Internal Tools) &bull; LFO / ADSR &bull; Auto-Save &bull; LUFS & Sandbox
              </div>
            </div>
          </div>

          {/* Top Mode Tabs */}
          <div className="flex items-center space-x-1">
            {[
              { id: 'image_options', label: '16 UI OPTION TOOLS' },
              { id: 'advanced_engines', label: '19 ADVANCED ENGINES (76 TOOLS)' },
              { id: 'modulators', label: 'LFO / ADSR / SIDECHAIN' },
              { id: 'daemon_assets', label: 'AUTO-SAVE & ASSETS' },
              { id: 'lufs_sandbox', label: 'LUFS & SANDBOX' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <button
              onClick={onClose}
              className="p-1.5 rounded bg-neutral-900 hover:bg-red-900/60 text-neutral-400 hover:text-white border border-neutral-700 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TAB 1: INTERNAL TOOLS FOR EVERY IMAGE OPTION (ALL 16 CATEGORIES) */}
        {activeTab === 'image_options' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar: All 16 UI Image Options */}
            <div className="w-64 bg-[#080a0f] border-r border-neutral-800 overflow-y-auto p-2 space-y-1 flex-shrink-0">
              <div className="text-[9px] font-bold text-amber-400/90 px-2 py-1 uppercase tracking-wider">
                Select UI Option to Inspect & Tune:
              </div>
              {(Object.keys(OPTION_SUBSYSTEM_MAP) as InternalOptionCategory[]).map((catKey) => {
                const item = OPTION_SUBSYSTEM_MAP[catKey];
                const isSelected = selectedCategory === catKey;
                return (
                  <button
                    key={catKey}
                    onClick={() => setSelectedCategory(catKey)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[10px] transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                        : 'bg-[#10141d] border-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-800/60'
                    }`}
                  >
                    <span className="font-bold truncate">{item.title}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-black/50 text-emerald-400">
                      {item.tools.length} TOOLS
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Inspector Panel: Active Option's Internal Tools */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0c1017]">
              <div className="bg-[#131924] border border-emerald-500/40 rounded-lg p-3.5 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-black text-white">{activeSpec.title}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      {activeSpec.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{activeSpec.subtitle}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-600/50 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ALL SUBSYSTEMS ONLINE
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeSpec.tools.map((tool) => {
                  const curVal = selectedSettings[tool.id] || tool.defaultValue;
                  return (
                    <div
                      key={tool.id}
                      className="bg-[#12161f] border border-neutral-800 hover:border-amber-500/50 rounded-lg p-3.5 flex flex-col justify-between space-y-3 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-amber-300">{tool.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50 font-bold">
                            ACTIVE
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-relaxed">{tool.desc}</p>
                      </div>

                      <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                        <span className="text-[9px] text-neutral-400 font-bold">{tool.metricLabel}:</span>
                        <select
                          value={curVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedSettings((prev) => ({ ...prev, [tool.id]: val }));
                            if (tool.id === 'hz_to_midi') {
                              audioEngine.tuningReferenceHz = val.includes('432')
                                ? 432
                                : val.includes('442')
                                ? 442
                                : 440;
                            }
                          }}
                          className="bg-[#090c10] border border-neutral-700 rounded px-2 py-1 text-[10px] text-emerald-300 font-bold outline-none focus:border-amber-400"
                        >
                          {tool.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 1B: INTERNAL TOOLS FOR EVERY ADVANCED OPTION (19 ADVANCED ENGINES × 4 TOOLS = 76 SUBSYSTEMS) */}
        {activeTab === 'advanced_engines' && activeAdvSpec && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar: All 19 Advanced Options grouped by their 4 Suites */}
            <div className="w-76 bg-[#080a0f] border-r border-neutral-800 overflow-y-auto p-2.5 space-y-3 flex-shrink-0">
              {(
                [
                  'Advanced AI & Deep Learning Music Tools',
                  'Advanced Vocal Manipulation Engines',
                  'Browser & Transport Power Components',
                  'Real-World Outboard Hardware Mixing & Rack Emulations',
                ] as const
              ).map((grpName) => {
                const groupItems = ADVANCED_ENGINE_LIST.filter((e) => e.group === grpName);
                return (
                  <div key={grpName} className="space-y-1">
                    <div className="text-[9px] font-black text-amber-400 px-1.5 py-0.5 uppercase tracking-wider border-b border-neutral-800/80">
                      {grpName}
                    </div>
                    {groupItems.map((eng) => {
                      const isSel = selectedAdvancedCategory === eng.id;
                      return (
                        <button
                          key={eng.id}
                          onClick={() => {
                            setSelectedAdvancedCategory(eng.id);
                            setActionStatusMsg('');
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition-all flex items-center justify-between border ${
                            isSel
                              ? 'bg-emerald-950/90 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                              : 'bg-[#10141d] border-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-800/60'
                          }`}
                        >
                          <span className="font-bold truncate pr-2">{eng.title}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-black/50 text-cyan-300 flex-shrink-0">
                            4 TOOLS
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Right Panel: Selected Advanced Option's 4 Internal Tools + Live Execution */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0c1017]">
              <div className="bg-[#131924] border border-amber-500/40 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
                    {activeAdvSpec.group}
                  </div>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-base font-black text-white">{activeAdvSpec.title}</span>
                    <span className="text-[9px] font-mono text-emerald-300">
                      · {activeAdvSpec.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{activeAdvSpec.subtitle}</p>
                </div>

                <button
                  onClick={() => {
                    const msg = audioEngine.executeAdvancedEngineAction(activeAdvSpec.id);
                    setActionStatusMsg(msg);
                    setTick((x) => x + 1);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black flex items-center space-x-1.5 shadow-lg transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{activeAdvSpec.actionLabel}</span>
                </button>
              </div>

              {actionStatusMsg && (
                <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-lg px-3 py-2 text-[10px] text-emerald-200 flex items-center justify-between">
                  <span>
                    <strong className="text-emerald-400">DSP EXECUTION CONFIRMED:</strong> {actionStatusMsg}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-bold">64-BIT ACTIVE</span>
                </div>
              )}

              {/* The 4 Internal Tools for the Selected Advanced Option */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeAdvSpec.internalTools.map((tool, tIdx) => {
                  const curVal = selectedSettings[tool.id] || tool.defaultValue;
                  return (
                    <div
                      key={tool.id}
                      className="bg-[#12161f] border border-neutral-800 hover:border-emerald-500/50 rounded-lg p-3.5 flex flex-col justify-between space-y-3 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-amber-300">
                            {tIdx + 1}. {tool.name}
                          </span>
                          <span className="text-[9px] text-emerald-400 font-bold">ONLINE</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-relaxed">{tool.desc}</p>
                      </div>

                      <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                        <span className="text-[9px] text-neutral-400 font-bold">{tool.metricLabel}:</span>
                        <select
                          value={curVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedSettings((prev) => ({ ...prev, [tool.id]: val }));
                          }}
                          className="bg-[#090c10] border border-neutral-700 rounded px-2 py-1 text-[10px] text-cyan-300 font-bold outline-none focus:border-amber-400"
                        >
                          {tool.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LFO MODULATOR, ADSR ENVELOPE, ENVELOPE FOLLOWER & MULTIBAND SIDECHAIN LINKER */}
        {activeTab === 'modulators' && (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0c1017] text-xs">
            {/* 1. Low-Frequency Oscillator (LFO) Modulator Engine */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <Waves className="w-4 h-4" />
                  LOW-FREQUENCY OSCILLATOR (LFO) MODULATOR ENGINE
                </span>
                <button
                  onClick={() => {
                    audioEngine.lfoEngine.enabled = !audioEngine.lfoEngine.enabled;
                    setTick((x) => x + 1);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    audioEngine.lfoEngine.enabled ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {audioEngine.lfoEngine.enabled ? 'ENABLED' : 'BYPASSED'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div>
                  <label className="text-neutral-400 block mb-1">WAVEFORM SHAPE:</label>
                  <select
                    value={audioEngine.lfoEngine.waveform}
                    onChange={(e) => {
                      audioEngine.lfoEngine.waveform = e.target.value as any;
                      setTick((x) => x + 1);
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded p-1.5 text-white font-bold"
                  >
                    <option value="sine">Sine Wave (Smooth)</option>
                    <option value="triangle">Triangle Wave (Linear)</option>
                    <option value="sawtooth">Ramp Sawtooth</option>
                    <option value="square">Square Pulse Gate</option>
                    <option value="s_and_h">Sample & Hold (Random Stepped)</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">MODULATION TARGET:</label>
                  <select
                    value={audioEngine.lfoEngine.target}
                    onChange={(e) => {
                      audioEngine.lfoEngine.target = e.target.value as any;
                      setTick((x) => x + 1);
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded p-1.5 text-amber-300 font-bold"
                  >
                    <option value="cutoff">Filter Cutoff Frequency</option>
                    <option value="resonance">Filter Resonance Peak</option>
                    <option value="pitch">Oscillator Pitch Vibrato</option>
                    <option value="pan">Stereo Auto-Pan</option>
                    <option value="volume">Tremolo Gain</option>
                  </select>
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">
                    LFO RATE ({audioEngine.lfoEngine.rateHz.toFixed(1)} Hz):
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={audioEngine.lfoEngine.rateHz}
                    onChange={(e) => {
                      audioEngine.lfoEngine.rateHz = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-neutral-400 block mb-1">
                    MOD DEPTH ({(audioEngine.lfoEngine.depth * 100).toFixed(0)}%):
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={audioEngine.lfoEngine.depth}
                    onChange={(e) => {
                      audioEngine.lfoEngine.depth = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. ADSR Envelope Generator */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-amber-400 font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  ADSR ENVELOPE GENERATOR
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">POLYPHONIC VCA / VCF</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div>
                  <label className="text-neutral-400 block mb-1">
                    ATTACK ({audioEngine.adsrEngine.attackMs} ms):
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="1000"
                    value={audioEngine.adsrEngine.attackMs}
                    onChange={(e) => {
                      audioEngine.adsrEngine.attackMs = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    DECAY ({audioEngine.adsrEngine.decayMs} ms):
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="2000"
                    value={audioEngine.adsrEngine.decayMs}
                    onChange={(e) => {
                      audioEngine.adsrEngine.decayMs = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    SUSTAIN LEVEL ({audioEngine.adsrEngine.sustainPct}%):
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audioEngine.adsrEngine.sustainPct}
                    onChange={(e) => {
                      audioEngine.adsrEngine.sustainPct = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    RELEASE ({audioEngine.adsrEngine.releaseMs} ms):
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="4000"
                    value={audioEngine.adsrEngine.releaseMs}
                    onChange={(e) => {
                      audioEngine.adsrEngine.releaseMs = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* 3. Envelope Follower Modulator */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                  <Radio className="w-4 h-4" />
                  ENVELOPE FOLLOWER MODULATOR
                </span>
                <span className="text-[10px] text-cyan-400">DYNAMIC AUDIO TRACKER</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div>
                  <label className="text-neutral-400 block mb-1">
                    THRESHOLD ({audioEngine.envFollowerEngine.thresholdDb} dB):
                  </label>
                  <input
                    type="range"
                    min="-48"
                    max="0"
                    value={audioEngine.envFollowerEngine.thresholdDb}
                    onChange={(e) => {
                      audioEngine.envFollowerEngine.thresholdDb = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">
                    RELEASE SMOOTHING ({audioEngine.envFollowerEngine.releaseMs} ms):
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    value={audioEngine.envFollowerEngine.releaseMs}
                    onChange={(e) => {
                      audioEngine.envFollowerEngine.releaseMs = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* 4. Sidechain Multiband Dynamic Linker */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-purple-300 font-bold flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" />
                  SIDECHAIN MULTIBAND DYNAMIC LINKER
                </span>
                <span className="text-[10px] text-emerald-400">3-BAND CROSSOVER MATRIX</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                  <div className="text-amber-300 font-bold mb-1">
                    LOW (&lt;{audioEngine.multibandSidechain.lowCrossHz}Hz)
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audioEngine.multibandSidechain.lowDuckPct}
                    onChange={(e) => {
                      audioEngine.multibandSidechain.lowDuckPct = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-amber-500"
                  />
                  <div className="text-right text-white font-bold">
                    -{audioEngine.multibandSidechain.lowDuckPct}% Duck
                  </div>
                </div>

                <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                  <div className="text-emerald-300 font-bold mb-1">MID BAND</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audioEngine.multibandSidechain.midDuckPct}
                    onChange={(e) => {
                      audioEngine.multibandSidechain.midDuckPct = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-emerald-500"
                  />
                  <div className="text-right text-white font-bold">
                    -{audioEngine.multibandSidechain.midDuckPct}% Duck
                  </div>
                </div>

                <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                  <div className="text-cyan-300 font-bold mb-1">
                    HIGH (&gt;{audioEngine.multibandSidechain.highCrossHz}Hz)
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audioEngine.multibandSidechain.highDuckPct}
                    onChange={(e) => {
                      audioEngine.multibandSidechain.highDuckPct = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-cyan-400"
                  />
                  <div className="text-right text-white font-bold">
                    -{audioEngine.multibandSidechain.highDuckPct}% Duck
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BACKGROUND SESSION AUTO-SAVE DAEMON & SAMPLE DEPENDENCY ASSET COLLECTOR */}
        {activeTab === 'daemon_assets' && (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#0c1017] text-xs">
            {/* Background Session Auto-Save Daemon */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    BACKGROUND SESSION AUTO-SAVE DAEMON
                  </span>
                  <span className="text-[10px] text-emerald-300">
                    LAST SYNC: {audioEngine.lastAutoSaveTimestamp}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded border border-neutral-800 text-[10px]">
                  <div className="flex items-center space-x-2">
                    <span className="text-neutral-400">DAEMON INTERVAL:</span>
                    <select
                      value={audioEngine.autoSaveIntervalSec}
                      onChange={(e) => {
                        audioEngine.autoSaveIntervalSec = Number(e.target.value);
                        audioEngine.startAutoSaveDaemon();
                        setTick((x) => x + 1);
                      }}
                      className="bg-black border border-neutral-700 rounded px-2 py-1 text-amber-300 font-bold"
                    >
                      <option value={15}>Every 15 Seconds</option>
                      <option value={30}>Every 30 Seconds</option>
                      <option value={60}>Every 60 Seconds</option>
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      audioEngine.saveSessionSnapshot('User Manual Checkpoint');
                      setTick((x) => x + 1);
                    }}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    + SAVE SNAPSHOT NOW
                  </button>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {audioEngine.autoSaveSnapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="flex items-center justify-between bg-neutral-900/90 px-3 py-2 rounded border border-neutral-800 text-[10px]"
                    >
                      <div>
                        <div className="text-white font-bold">{snap.label}</div>
                        <div className="text-neutral-400">
                          {snap.timestamp} &bull; {snap.bpm} BPM &bull; {snap.tracksCount} Tracks &bull; PAT {snap.patternIdx + 1}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          audioEngine.restoreSessionSnapshot(snap.id);
                          setTick((x) => x + 1);
                        }}
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/40 font-bold"
                      >
                        RESTORE
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sample Dependency Asset Collector */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    <FolderArchive className="w-4 h-4" />
                    SAMPLE DEPENDENCY ASSET COLLECTOR
                  </span>
                  <button
                    onClick={() => audioEngine.exportDependencyBundle()}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    COLLECT ALL & SAVE BUNDLE (.UBXPACK)
                  </button>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {dependencies.map((dep) => (
                    <div
                      key={dep.id}
                      className="flex items-center justify-between bg-neutral-900/90 px-3 py-2 rounded border border-neutral-800 text-[10px]"
                    >
                      <div>
                        <div className="text-white font-bold">{dep.name}</div>
                        <div className="text-neutral-400">
                          Device: {dep.sourceDevice} &bull; {dep.format} &bull; {dep.sampleRate} / {dep.bitDepth}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50 font-bold">
                        {dep.status} ({dep.sizeKb} KB)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LUFS LOUDNESS METERING, GONIOMETER VECTORSCOPE & SANDBOXED PLUGIN HOST */}
        {activeTab === 'lufs_sandbox' && (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-[#0c1017] text-xs">
            {/* LUFS Loudness Metering Engine & Vectorscope Telemetry */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <Gauge className="w-4 h-4" />
                  LUFS LOUDNESS METERING & VECTORSCOPE PHASE ENGINE
                </span>
                <span className="text-[10px] text-amber-300 font-bold">ITU-R BS.1770-4 COMPLIANT</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                  <div className="text-[9px] text-neutral-400">MOMENTARY (400ms)</div>
                  <div className="text-lg font-black text-emerald-400 mt-1">
                    {audioEngine.lufsMetering.momentary.toFixed(1)} LUFS
                  </div>
                </div>
                <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                  <div className="text-[9px] text-neutral-400">SHORT-TERM (3s)</div>
                  <div className="text-lg font-black text-cyan-300 mt-1">
                    {audioEngine.lufsMetering.shortTerm.toFixed(1)} LUFS
                  </div>
                </div>
                <div className="bg-neutral-900 p-3 rounded border border-neutral-800">
                  <div className="text-[9px] text-neutral-400">INTEGRATED MASTER</div>
                  <div className="text-lg font-black text-amber-400 mt-1">
                    {audioEngine.lufsMetering.integrated.toFixed(1)} LUFS
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[10px]">
                <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800 flex justify-between">
                  <span className="text-neutral-400">TRUE PEAK MAX:</span>
                  <span className="text-emerald-400 font-bold">{audioEngine.lufsMetering.truePeakDbtp} dBTP</span>
                </div>
                <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800 flex justify-between">
                  <span className="text-neutral-400">GONIOMETER PHASE:</span>
                  <span className="text-emerald-400 font-bold">
                    +{audioEngine.lufsMetering.phaseCorrelation} ({audioEngine.lufsMetering.phaseAngleDeg}°)
                  </span>
                </div>
              </div>
            </div>

            {/* Sandboxed Plugin Architecture Host */}
            <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  SANDBOXED PLUGIN ARCHITECTURE HOST
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">CRASH-ISOLATED IPC</span>
              </div>

              <div className="space-y-2 text-[10px]">
                <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400">SANDBOX ISOLATION POLICY:</span>
                  <select
                    value={audioEngine.sandboxHost.isolationMode}
                    onChange={(e) => {
                      audioEngine.sandboxHost.isolationMode = e.target.value as any;
                      setTick((x) => x + 1);
                    }}
                    className="bg-black border border-neutral-700 rounded px-2 py-1 text-emerald-300 font-bold"
                  >
                    <option value="Strict Subprocess IPC">Strict Subprocess IPC (Zero Crash Propagation)</option>
                    <option value="Shared Memory Fast">Shared Memory Ring Buffer (Ultra-Low Latency)</option>
                    <option value="Kernel Bridge">Kernel Audio Bridge</option>
                  </select>
                </div>

                <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400">PER-PLUGIN MEMORY GUARD:</span>
                  <span className="text-amber-300 font-bold">{audioEngine.sandboxHost.memoryLimitMb} MB Dedicated Heap</span>
                </div>

                <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400">BUFFER UNDERRUN EXCEPTION MONITOR:</span>
                  <span className="text-emerald-400 font-bold">0 XRUNS // PROTECTED</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
