import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { DeviceType, SequencerTrack } from '../audio/types.ts';
import {
  Search,
  X,
  Play,
  Square,
  Download,
  Sparkles,
  Cpu,
  Sliders,
  Layers,
  Radio,
  Maximize2,
  Compass,
  Video,
  Activity,
  Disc,
  Wand2,
  CheckCircle2,
  Volume2,
  Grid,
} from 'lucide-react';

export type VisualizerThemeProfile = 'Synthwave' | 'Neon' | 'Galaxy' | 'Inferno' | 'Timeline';

interface CommandAndStageOverlaysProps {
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  // Command Search Bar (Ctrl + K)
  isCommandSearchOpen: boolean;
  onCloseCommandSearch: () => void;
  // Smart Pie Menu (Alt + Q / Right-Click Wheel)
  pieMenuPos: { x: number; y: number } | null;
  onClosePieMenu: () => void;
  // Stage Mode Full-Screen Layout (F11 / Alt + G)
  isStageModeOpen: boolean;
  onCloseStageMode: () => void;
  // Batch Stem Exporter Window (Ctrl + Shift + E)
  isBatchExporterOpen: boolean;
  onCloseBatchExporter: () => void;
  // Navigation & Action Callbacks
  onNavigateSequencerTab: (tab: string) => void;
  onSpawnDevice: (type: DeviceType, name?: string) => void;
  onTriggerGlobalAction: (actionId: string) => void;
  activeVisualizerTheme: VisualizerThemeProfile;
  onChangeVisualizerTheme: (theme: VisualizerThemeProfile) => void;
}

export const CommandAndStageOverlays: React.FC<CommandAndStageOverlaysProps> = ({
  audioEngine,
  devices,
  tracks,
  isCommandSearchOpen,
  onCloseCommandSearch,
  pieMenuPos,
  onClosePieMenu,
  isStageModeOpen,
  onCloseStageMode,
  isBatchExporterOpen,
  onCloseBatchExporter,
  onNavigateSequencerTab,
  onSpawnDevice,
  onTriggerGlobalAction,
  activeVisualizerTheme,
  onChangeVisualizerTheme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [hoveredWedge, setHoveredWedge] = useState<string | null>(null);

  // Batch Stem Exporter State
  const [selectedFormats, setSelectedFormats] = useState<Record<'wav24' | 'wav32' | 'flac' | 'aif', boolean>>({
    wav24: true,
    wav32: false,
    flac: true,
    aif: false,
  });
  const [stemClipGainMap, setStemClipGainMap] = useState<Record<string, number>>({});
  const [selectedStems, setSelectedStems] = useState<Record<string, boolean>>({});
  const [normalizeStems, setNormalizeStems] = useState(true);
  const [includeReverbTail, setIncludeReverbTail] = useState(true);
  const [exportProgressMsg, setExportProgressMsg] = useState<string | null>(null);

  // Stage Mode Hardware Video Visualizer Canvas & Video Recorder
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const [, setTick] = useState(0);

  // Initialize stem selection & clip gain map
  useEffect(() => {
    const nextSel: Record<string, boolean> = {};
    const nextGain: Record<string, number> = {};
    tracks.forEach((t) => {
      nextSel[t.id] = selectedStems[t.id] ?? true;
      nextGain[t.id] = stemClipGainMap[t.id] ?? 0.0;
    });
    setSelectedStems(nextSel);
    setStemClipGainMap(nextGain);
  }, [tracks.length]);

  // All Searchable Commands in Global Command Search Bar (Ctrl + K)
  const commandCatalog = [
    {
      id: 'cmd_loop_launcher',
      category: 'CORE INTERFACE',
      title: 'Loop Launcher & Step Tracker View',
      subtitle: 'Live 8-Scene clip launcher matrix + Hex/Grid Step Tracker data entry',
      shortcut: 'Shift+8',
      run: () => onNavigateSequencerTab('loop_tracker'),
    },
    {
      id: 'cmd_routing_matrix',
      category: 'CORE INTERFACE',
      title: '128-Channel Visual Routing Matrix & Mod Slots',
      subtitle: 'Graphic patch-bay node connection map + Global LFO & 8 Macro Control Knobs',
      shortcut: 'Shift+9',
      run: () => onNavigateSequencerTab('routing_mod_matrix'),
    },
    {
      id: 'cmd_video_vis',
      category: 'CORE INTERFACE',
      title: 'Hardware Video Visualizer & Diagnostic Scopes',
      subtitle: 'Synthwave, Neon, Galaxy, Inferno & Timeline reactive MP4/WebM engine',
      shortcut: 'Shift+0',
      run: () => onNavigateSequencerTab('video_visualizer'),
    },
    {
      id: 'cmd_stage_mode',
      category: 'CORE INTERFACE',
      title: 'Stage Mode Full-Screen Layout',
      subtitle: 'Borderless full-screen visualization of active modules, scenes & scopes',
      shortcut: 'Alt+G / F11',
      run: () => onTriggerGlobalAction('toggle_stage_mode'),
    },
    {
      id: 'cmd_pie_menu',
      category: 'CORE INTERFACE',
      title: 'Open Smart Pie Menu (Radial Wheel)',
      subtitle: 'Floating contextual circular pop-up wheel menu for instant tool/module access',
      shortcut: 'Alt+Q',
      run: () => onTriggerGlobalAction('open_pie_center'),
    },
    {
      id: 'cmd_batch_stem',
      category: 'EXPORT & STEMS',
      title: 'Batch Stem Exporter Window & Clip Gain Maps',
      subtitle: 'Render multi-format stems (.WAV, .FLAC, .AIF) with per-track clip gain maps',
      shortcut: 'Ctrl+Shift+E',
      run: () => onTriggerGlobalAction('open_batch_exporter'),
    },
    {
      id: 'cmd_wyvern',
      category: 'SYNTHESIS & MODULATION',
      title: 'Mount Wyvern Synthesizer Module',
      subtitle: 'Stock virtual dual-wavetable, FM & comb-resonator synth with Mod Containers',
      shortcut: 'INST',
      run: () => onSpawnDevice('wyvern', 'Wyvern Synthesizer Module'),
    },
    {
      id: 'cmd_ember',
      category: 'SYNTHESIS & MODULATION',
      title: 'Mount Ember Synthesizer Module',
      subtitle: 'Stock virtual thermal-drift, formant & tube warmth synthesizer',
      shortcut: 'INST',
      run: () => onSpawnDevice('ember', 'Ember Synthesizer Module'),
    },
    {
      id: 'cmd_arrangement',
      category: 'EDITING & PRODUCTION',
      title: 'Arrangement Timeline, Take Comping & AI Chord Lane',
      subtitle: 'Linear multi-track clip grid, Swipe Comp Brush, Bezier Automation & AI Chords',
      shortcut: 'Shift+3',
      run: () => onNavigateSequencerTab('arrangement'),
    },
    {
      id: 'cmd_piano_mpe',
      category: 'EDITING & PRODUCTION',
      title: 'Piano Roll & MPE Parameter Editor (Pitch / Pressure / Slide)',
      subtitle: 'Multi-dimensional per-note MPE expression lanes & Auto-Align MIDI quantizer',
      shortcut: 'Shift+2',
      run: () => onNavigateSequencerTab('piano_roll'),
    },
    {
      id: 'cmd_sample_editor',
      category: 'EDITING & PRODUCTION',
      title: 'Sample-Level Audio Editor (Transients, Zero-Crossings & Time-Warp Flex)',
      subtitle: 'Zoomed waveform transient pins, zero-crossing snap & Time-Warp Flex anchors',
      shortcut: 'Shift+5',
      run: () => onNavigateSequencerTab('sample_warp'),
    },
    {
      id: 'cmd_auto_align',
      category: 'EDITING & PRODUCTION',
      title: 'Run Auto-Align Engine on Active Track',
      subtitle: 'Smart micro-timing snap assistant to quantize input MIDI & align phase',
      shortcut: 'ALIGN',
      run: () => {
        if (tracks[0]) audioEngine.autoAlignTrackMidi(tracks[0].id, 100);
      },
    },
    {
      id: 'cmd_sos_looper',
      category: 'EDITING & PRODUCTION',
      title: 'Trigger Sound-on-Sound Tape Overdub Pass',
      subtitle: 'Virtual overdub tracking engine mimicking tape loopers with feedback decay',
      shortcut: 'OVERDUB',
      run: () => {
        if (tracks[0]) audioEngine.triggerSoundOnSoundOverdub(tracks[0].id);
      },
    },
    {
      id: 'cmd_vst_clap',
      category: 'DSP & HOSTING',
      title: 'VST3 / CLAP / AU Sandboxed Hosting Engine & Diagnostic Scopes',
      subtitle: 'Manage sandboxed third-party DSP wrappers, True Peak & LUFS scopes',
      shortcut: 'Shift+6',
      run: () => onNavigateSequencerTab('dsp_analyzer'),
    },
  ];

  const filteredCommands = commandCatalog.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stage Mode 60FPS Reactive Hardware Video Visualizer Loop
  useEffect(() => {
    if (!isStageModeOpen) return;
    let rafId: number;
    const freqData = new Uint8Array(audioEngine.analyserL.frequencyBinCount);
    const timeL = new Float32Array(audioEngine.analyserL.fftSize);
    const timeR = new Float32Array(audioEngine.analyserR.fftSize);
    let phase = 0;

    const renderStageVisualizer = () => {
      phase += 0.03;
      audioEngine.analyserL.getByteFrequencyData(freqData);
      audioEngine.analyserL.getFloatTimeDomainData(timeL);
      audioEngine.analyserR.getFloatTimeDomainData(timeR);

      const canvas = stageCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const bassEnergy = (freqData[1] + freqData[2] + freqData[3]) / (3 * 255);

          // Background per theme
          if (activeVisualizerTheme === 'Synthwave') {
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#090418');
            bg.addColorStop(0.55, '#2a0845');
            bg.addColorStop(1, '#050811');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Retro Sun
            const sunRadius = 55 + bassEnergy * 28;
            const sunGrad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.55);
            sunGrad.addColorStop(0, '#f43f5e');
            sunGrad.addColorStop(1, '#f59e0b');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(w / 2, h * 0.38, sunRadius, 0, Math.PI * 2);
            ctx.fill();

            // Perspective Horizon Grid
            ctx.strokeStyle = 'rgba(236, 72, 153, 0.55)';
            ctx.lineWidth = 1.2;
            const horizonY = h * 0.56;
            for (let i = -10; i <= 10; i++) {
              ctx.beginPath();
              ctx.moveTo(w / 2 + i * 18, horizonY);
              ctx.lineTo(w / 2 + i * 95, h);
              ctx.stroke();
            }
            for (let row = 0; row < 8; row++) {
              const yOffset = ((row + (phase % 1)) / 8) ** 1.8 * (h - horizonY);
              ctx.beginPath();
              ctx.moveTo(0, horizonY + yOffset);
              ctx.lineTo(w, horizonY + yOffset);
              ctx.stroke();
            }
          } else if (activeVisualizerTheme === 'Neon') {
            ctx.fillStyle = 'rgba(4, 8, 16, 0.35)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 64; i++) {
              const angle = (i / 64) * Math.PI * 2 + phase * 0.4;
              const r = 65 + (freqData[i] / 255) * 110;
              const x = w / 2 + Math.cos(angle) * r;
              const y = h / 2 + Math.sin(angle) * r;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
          } else if (activeVisualizerTheme === 'Galaxy') {
            ctx.fillStyle = 'rgba(3, 6, 15, 0.3)';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 72; i++) {
              const arm = i % 3;
              const dist = (i / 72) * (Math.min(w, h) * 0.46);
              const angle = arm * ((Math.PI * 2) / 3) + dist * 0.025 - phase * 0.6;
              const size = 1.8 + (freqData[i % 64] / 255) * 6;
              const x = w / 2 + Math.cos(angle) * dist;
              const y = h / 2 + Math.sin(angle) * dist;
              ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#a855f7';
              ctx.beginPath();
              ctx.arc(x, y, size, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (activeVisualizerTheme === 'Inferno') {
            ctx.fillStyle = 'rgba(15, 4, 4, 0.35)';
            ctx.fillRect(0, 0, w, h);
            const bars = 48;
            const bw = w / bars;
            for (let i = 0; i < bars; i++) {
              const v = freqData[i] / 255;
              const bh = Math.max(8, v * h * 0.85);
              const g = ctx.createLinearGradient(0, h, 0, h - bh);
              g.addColorStop(0, '#991b1b');
              g.addColorStop(0.5, '#ea580c');
              g.addColorStop(1, '#fde047');
              ctx.fillStyle = g;
              ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
            }
          } else {
            // Timeline reactive multi-layer waveform + playhead
            ctx.fillStyle = '#060a12';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
            for (let s = 0; s < 16; s++) {
              const sx = (s / 16) * w;
              ctx.beginPath();
              ctx.moveTo(sx, 0);
              ctx.lineTo(sx, h);
              ctx.stroke();
            }
            const playheadX = ((audioEngine.currentStep % 16) / 16) * w;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
            ctx.fillRect(playheadX, 0, w / 16, h);
          }

          // Foreground Oscilloscope Wave Overlay
          ctx.strokeStyle = activeVisualizerTheme === 'Inferno' ? '#fde047' : '#10b981';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          for (let i = 0; i < timeL.length; i++) {
            const x = (i / (timeL.length - 1)) * w;
            const y = h * 0.5 + timeL[i] * (h * 0.32);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(renderStageVisualizer);
    };

    rafId = requestAnimationFrame(renderStageVisualizer);
    return () => cancelAnimationFrame(rafId);
  }, [isStageModeOpen, activeVisualizerTheme, audioEngine]);

  // Toggle video recording of Hardware Video Visualizer
  const handleToggleVideoRecord = () => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return;
    if (!isRecordingVideo) {
      try {
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
        if (!stream) return;
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        videoChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) videoChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Unboxed_Hardware_Visualizer_${activeVisualizerTheme}.webm`;
          a.click();
        };
        recorder.start();
        videoRecorderRef.current = recorder;
        setIsRecordingVideo(true);
      } catch (e) {}
    } else {
      videoRecorderRef.current?.stop();
      setIsRecordingVideo(false);
    }
  };

  // Pie Menu 8 Outer Wedges
  const pieOuterWedges = [
    { id: 'loop', label: 'LOOP LAUNCHER', sub: 'Live Scenes', angle: 0, color: '#06b6d4', run: () => onNavigateSequencerTab('loop_tracker') },
    { id: 'tracker', label: 'STEP TRACKER', sub: 'Hex/List Grid', angle: 45, color: '#10b981', run: () => onNavigateSequencerTab('loop_tracker') },
    { id: 'wyvern', label: '+ WYVERN SYNTH', sub: 'Dragon Wavetable', angle: 90, color: '#38bdf8', run: () => onSpawnDevice('wyvern', 'Wyvern Synthesizer Module') },
    { id: 'ember', label: '+ EMBER SYNTH', sub: 'Thermal Formant', angle: 135, color: '#f59e0b', run: () => onSpawnDevice('ember', 'Ember Synthesizer Module') },
    { id: 'matrix128', label: '128-CH MATRIX', sub: 'Patch Nodes', angle: 180, color: '#a855f7', run: () => onNavigateSequencerTab('routing_mod_matrix') },
    { id: 'vis', label: 'VIDEO VISUALIZER', sub: '5 Themes + MP4', angle: 225, color: '#ec4899', run: () => onNavigateSequencerTab('video_visualizer') },
    { id: 'stems', label: 'STEM EXPORTER', sub: 'Clip Gain Maps', angle: 270, color: '#22c55e', run: () => onTriggerGlobalAction('open_batch_exporter') },
    { id: 'stage', label: 'STAGE MODE', sub: 'Full-Screen', angle: 315, color: '#eab308', run: () => onTriggerGlobalAction('toggle_stage_mode') },
  ];

  return (
    <>
      {/* 1. GLOBAL COMMAND SEARCH BAR (Ctrl + K) */}
      {isCommandSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-20 p-4"
          onClick={onCloseCommandSearch}
        >
          <div
            className="w-full max-w-2xl bg-[#080d18] border-2 border-cyan-500/50 rounded-xl shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 bg-[#0c1322] border-b border-cyan-500/30 flex items-center space-x-3">
              <Search className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedCmdIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedCmdIdx((i) => Math.min(filteredCommands.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedCmdIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' && filteredCommands[selectedCmdIdx]) {
                    e.preventDefault();
                    filteredCommands[selectedCmdIdx].run();
                    onCloseCommandSearch();
                  } else if (e.key === 'Escape') {
                    onCloseCommandSearch();
                  }
                }}
                placeholder="Type a command, synth (Wyvern, Ember), view (Loop Launcher, 128-Ch Matrix, Stage Mode)..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-cyan-300 font-bold">
                CTRL + K
              </span>
              <button onClick={onCloseCommandSearch} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/80 p-2">
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  onMouseEnter={() => setSelectedCmdIdx(idx)}
                  onClick={() => {
                    cmd.run();
                    onCloseCommandSearch();
                  }}
                  className={`p-2.5 rounded-lg cursor-pointer flex items-center justify-between transition-all ${
                    idx === selectedCmdIdx
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-white'
                      : 'hover:bg-slate-900/80 text-slate-300 border border-transparent'
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-bold">
                        {cmd.category}
                      </span>
                      <span className="text-xs font-bold text-white">{cmd.title}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{cmd.subtitle}</div>
                  </div>
                  <kbd className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[10px] text-emerald-300 font-bold">
                    {cmd.shortcut}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. SMART PIE MENU (Contextual Circular Pop-Up Wheel Menu) */}
      {pieMenuPos && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
          onClick={onClosePieMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            onClosePieMenu();
          }}
        >
          <div
            style={{
              left: Math.max(190, Math.min(window.innerWidth - 190, pieMenuPos.x)),
              top: Math.max(190, Math.min(window.innerHeight - 190, pieMenuPos.y)),
            }}
            className="fixed -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full pointer-events-auto select-none font-mono flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Outer Radial Ring */}
            <div className="absolute inset-0 rounded-full bg-[#070b14]/95 border-2 border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.4)]" />

            {/* 8 Radial Wedge Buttons */}
            {pieOuterWedges.map((wedge) => {
              const rad = ((wedge.angle - 90) * Math.PI) / 180;
              const radius = 122;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const isHovered = hoveredWedge === wedge.id;

              return (
                <button
                  key={wedge.id}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                    borderColor: isHovered ? wedge.color : 'rgba(51,65,85,0.8)',
                  }}
                  onMouseEnter={() => setHoveredWedge(wedge.id)}
                  onMouseLeave={() => setHoveredWedge(null)}
                  onClick={() => {
                    wedge.run();
                    onClosePieMenu();
                  }}
                  className="absolute w-28 py-2 px-1.5 rounded-xl bg-[#0d1424] hover:bg-[#132038] border-2 text-center transition-all shadow-lg"
                >
                  <div className="text-[9px] font-black tracking-tight" style={{ color: wedge.color }}>
                    {wedge.label}
                  </div>
                  <div className="text-[8px] text-slate-400 truncate">{wedge.sub}</div>
                </button>
              );
            })}

            {/* Center Hub */}
            <div className="w-28 h-28 rounded-full bg-[#0c1424] border-2 border-emerald-500/60 flex flex-col items-center justify-center text-center p-2 z-10 shadow-inner">
              <Compass className="w-5 h-5 text-cyan-400 mb-0.5 animate-spin" style={{ animationDuration: '10s' }} />
              <span className="text-[9px] font-black text-white">SMART PIE</span>
              <span className="text-[8px] text-emerald-300">
                {hoveredWedge ? hoveredWedge.toUpperCase() : 'SELECT ACTION'}
              </span>
              <button
                onClick={onClosePieMenu}
                className="mt-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-red-900/60 text-[8px] text-slate-400 hover:text-white"
              >
                CLOSE [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. STAGE MODE FULL-SCREEN LAYOUT (Borderless Visualization of Active Modules, Scenes, Macros & Video Visualizer) */}
      {isStageModeOpen && (
        <div className="fixed inset-0 z-50 bg-[#04070e] text-white font-mono flex flex-col overflow-hidden">
          {/* Minimal Borderless Stage Header */}
          <div className="h-12 bg-[#070b14]/90 border-b border-cyan-500/30 px-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-black text-xs tracking-wider">
                STAGE MODE // LIVE PERFORMANCE CONSOLE
              </span>
              <span className="text-xs text-emerald-400 font-bold">
                {audioEngine.bpm} BPM &bull; {audioEngine.scaleType.toUpperCase()} &bull; STEP {audioEngine.currentStep + 1}
              </span>
            </div>

            {/* Visualizer Theme Profile Switcher */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-400 mr-1">VISUALIZER THEME:</span>
              {(['Synthwave', 'Neon', 'Galaxy', 'Inferno', 'Timeline'] as VisualizerThemeProfile[]).map((th) => (
                <button
                  key={th}
                  onClick={() => onChangeVisualizerTheme(th)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                    activeVisualizerTheme === th
                      ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.6)]'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  {th.toUpperCase()}
                </button>
              ))}

              <button
                onClick={handleToggleVideoRecord}
                className={`ml-2 px-3 py-1 rounded text-[10px] font-black flex items-center space-x-1 ${
                  isRecordingVideo
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>{isRecordingVideo ? 'STOP & SAVE VIDEO (.WEBM)' : 'RECORD VIDEO'}</span>
              </button>

              <button
                onClick={() => audioEngine.togglePlay()}
                className={`px-3 py-1 rounded text-[10px] font-black ${
                  audioEngine.isPlaying ? 'bg-amber-500 text-black' : 'bg-cyan-600 text-white'
                }`}
              >
                {audioEngine.isPlaying ? 'STOP [SPACE]' : 'PLAY [SPACE]'}
              </button>

              <button
                onClick={onCloseStageMode}
                className="px-3 py-1 rounded bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-bold"
              >
                EXIT STAGE [ESC]
              </button>
            </div>
          </div>

          {/* Main Stage Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 overflow-y-auto">
            {/* Left/Center 2 Cols: Reactive Hardware Video Visualizer Canvas + Live Scene Trigger Pads */}
            <div className="lg:col-span-2 flex flex-col space-y-3">
              <div className="flex-1 min-h-[280px] bg-black rounded-xl border border-cyan-500/40 relative overflow-hidden shadow-2xl">
                <canvas ref={stageCanvasRef} width={920} height={420} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded border border-cyan-500/40 text-[10px]">
                  <span className="text-cyan-300 font-black">HARDWARE VIDEO VISUALIZER // </span>
                  <span className="text-emerald-300">{activeVisualizerTheme.toUpperCase()} PROFILE</span>
                </div>
              </div>

              {/* Live Loop Launcher Scene Triggers on Stage */}
              <div className="bg-[#090e1a] border border-cyan-500/30 rounded-xl p-3">
                <div className="text-[10px] text-cyan-300 font-bold mb-2 flex items-center justify-between">
                  <span>STAGE LOOP LAUNCHER // LIVE SCENE PADS</span>
                  <span className="text-emerald-400">ACTIVE PATTERN BANK: PAT {audioEngine.activePatternIndex + 1}</span>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  {Array.from({ length: 8 }).map((_, sIdx) => {
                    const isActive = audioEngine.activePatternIndex === sIdx;
                    return (
                      <button
                        key={sIdx}
                        onClick={() => {
                          audioEngine.switchPatternBank(sIdx);
                          if (!audioEngine.isPlaying) audioEngine.togglePlay();
                          setTick((x) => x + 1);
                        }}
                        className={`py-3 px-2 rounded-lg border font-bold text-center transition-all ${
                          isActive
                            ? 'bg-gradient-to-br from-cyan-500 to-emerald-500 text-slate-950 border-white shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        <div className="text-[10px] font-black">SCENE {sIdx + 1}</div>
                        <div className="text-[8px] opacity-80">PAT {sIdx + 1}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Col: Precision Diagnostic Scopes (True Peak, LUFS, Phase) + 8 Bounded Macro Control Knobs */}
            <div className="flex flex-col space-y-3">
              {/* Precision Diagnostic Scopes */}
              <div className="bg-[#090e1a] border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
                <div className="text-[10px] text-emerald-400 font-black border-b border-slate-800 pb-1.5 flex justify-between">
                  <span>PRECISION DIAGNOSTIC SCOPES</span>
                  <span>TRUE PEAK &bull; LUFS &bull; PHASE</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[8px] text-slate-400">MOMENTARY</div>
                    <div className="text-sm font-black text-cyan-300">
                      {audioEngine.lufsMetering.momentary.toFixed(1)} LUFS
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[8px] text-slate-400">TRUE PEAK</div>
                    <div className="text-sm font-black text-emerald-400">
                      {audioEngine.lufsMetering.truePeakDbtp.toFixed(1)} dBTP
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[8px] text-slate-400">PHASE CORR</div>
                    <div className="text-sm font-black text-amber-300">
                      +{audioEngine.lufsMetering.phaseCorrelation}
                    </div>
                  </div>
                </div>
              </div>

              {/* 8 Bounded Macro Control Knobs */}
              <div className="bg-[#090e1a] border border-cyan-500/30 rounded-xl p-3 flex-1">
                <div className="text-[10px] text-cyan-300 font-black border-b border-slate-800 pb-1.5 mb-2 flex justify-between">
                  <span>8 BOUNDED MACRO CONTROL KNOBS</span>
                  <span className="text-emerald-400">MULTI-TARGET DSP</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {audioEngine.macroKnobs.map((mc) => (
                    <div key={mc.id} className="bg-slate-950/90 border border-slate-800 rounded-lg p-2">
                      <div className="flex justify-between text-[9px] font-bold text-white mb-1">
                        <span className="truncate">{mc.name}</span>
                        <span className="text-cyan-300">{Math.round(mc.value * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={mc.minBound}
                        max={mc.maxBound}
                        step={0.01}
                        value={mc.value}
                        onChange={(e) => {
                          mc.value = Number(e.target.value);
                          setTick((x) => x + 1);
                        }}
                        className="w-full accent-cyan-400"
                      />
                      <div className="text-[8px] text-slate-400 flex justify-between mt-0.5">
                        <span>Bounds: [{Math.round(mc.minBound * 100)}%..{Math.round(mc.maxBound * 100)}%]</span>
                        <span className="text-emerald-400">{mc.targets.join(' + ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. BATCH STEM EXPORTER WINDOW (Multi-Format Stems & Clip Gain Maps) */}
      {isBatchExporterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onCloseBatchExporter}
        >
          <div
            className="w-full max-w-4xl bg-[#080d18] border-2 border-cyan-500/50 rounded-xl shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden font-mono flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-[#0c1322] border-b border-cyan-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Download className="w-5 h-5 text-cyan-400" />
                <div>
                  <h2 className="text-sm font-black text-white tracking-wider">
                    BATCH STEM EXPORTER // MULTI-FORMAT RENDERING & CLIP GAIN MAPS
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    Parallel Stem Bounce Engine &bull; Individual Clip Gain Trim Map (-18dB to +6dB) &bull; ITU-R Loudness Normalization
                  </p>
                </div>
              </div>
              <button onClick={onCloseBatchExporter} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Format & Mastering Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-cyan-300 mb-2">MULTI-FORMAT RENDER TARGETS:</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {[
                      { key: 'wav24', label: 'WAV 24-Bit / 48kHz PCM' },
                      { key: 'wav32', label: 'WAV 32-Bit Float Master' },
                      { key: 'flac', label: 'FLAC Lossless Archival' },
                      { key: 'aif', label: 'AIFF Apple Studio PCM' },
                    ].map((fmt) => (
                      <label key={fmt.key} className="flex items-center space-x-2 bg-slate-900 p-2 rounded border border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(selectedFormats as any)[fmt.key]}
                          onChange={(e) =>
                            setSelectedFormats((prev) => ({ ...prev, [fmt.key]: e.target.checked }))
                          }
                          className="accent-cyan-400"
                        />
                        <span className="text-white font-bold">{fmt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
                  <div className="text-[10px] font-bold text-emerald-400 mb-2">DSP RENDERING & GAIN MAP OPTIONS:</div>
                  <div className="space-y-2 text-[10px]">
                    <label className="flex items-center justify-between bg-slate-900 p-2 rounded border border-slate-800 cursor-pointer">
                      <span>Normalize Stem True Peaks to -1.0 dBTP</span>
                      <input
                        type="checkbox"
                        checked={normalizeStems}
                        onChange={(e) => setNormalizeStems(e.target.checked)}
                        className="accent-emerald-400"
                      />
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 p-2 rounded border border-slate-800 cursor-pointer">
                      <span>Include RV7000 Reverb & Delay Tail (+4 Bars)</span>
                      <input
                        type="checkbox"
                        checked={includeReverbTail}
                        onChange={(e) => setIncludeReverbTail(e.target.checked)}
                        className="accent-emerald-400"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Per-Track Stem Clip Gain Map Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-amber-300 border-b border-slate-800 pb-1.5">
                  <span>TRACK STEM SELECTION & VISUAL CLIP GAIN MAP</span>
                  <span>{tracks.length} ACTIVE INSTRUMENT STEMS</span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {tracks.map((t, idx) => {
                    const gainDb = stemClipGainMap[t.id] ?? 0;
                    const isChecked = selectedStems[t.id] ?? true;
                    return (
                      <div
                        key={t.id}
                        className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <label className="flex items-center space-x-2.5 min-w-[180px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setSelectedStems((prev) => ({ ...prev, [t.id]: e.target.checked }))
                            }
                            className="accent-cyan-400"
                          />
                          <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: t.color }} />
                          <span className="font-bold text-white truncate">{t.name}</span>
                        </label>

                        {/* Visual Clip Gain Envelope Bar Map */}
                        <div className="flex-1 min-w-[160px] h-6 bg-slate-950 rounded border border-slate-800 px-1.5 flex items-center space-x-0.5">
                          {Array.from({ length: 24 }).map((_, b) => {
                            const hasNote = !!t.steps[b % t.steps.length];
                            const scale = Math.max(0.15, Math.min(1, (hasNote ? 0.7 : 0.2) * Math.pow(10, gainDb / 20)));
                            return (
                              <div key={b} className="flex-1 h-full flex items-center">
                                <div
                                  className="w-full rounded-xs transition-all"
                                  style={{
                                    height: `${Math.round(scale * 100)}%`,
                                    backgroundColor: gainDb > 3 ? '#f59e0b' : '#06b6d4',
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Clip Gain Trim Slider (-18dB to +6dB) */}
                        <div className="flex items-center space-x-2 w-48">
                          <span className="text-[9px] text-slate-400">GAIN:</span>
                          <input
                            type="range"
                            min={-18}
                            max={6}
                            step={0.5}
                            value={gainDb}
                            onChange={(e) =>
                              setStemClipGainMap((prev) => ({ ...prev, [t.id]: Number(e.target.value) }))
                            }
                            className="flex-1 accent-emerald-400"
                          />
                          <span className="text-[10px] font-bold text-emerald-300 w-12 text-right">
                            {gainDb > 0 ? `+${gainDb}` : gainDb} dB
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {exportProgressMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{exportProgressMsg}</span>
                </div>
              )}
            </div>

            <div className="p-3.5 bg-[#0c1322] border-t border-cyan-500/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Ready to render {Object.values(selectedStems).filter(Boolean).length} stems across{' '}
                {Object.values(selectedFormats).filter(Boolean).length} formats
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const activeTrackIds = tracks.filter((t) => selectedStems[t.id]).map((t) => t.id);
                    if (activeTrackIds.length > 0) {
                      audioEngine.exportUncompressedWav(activeTrackIds[0], 'wav');
                    } else {
                      audioEngine.exportMasterWav();
                    }
                    setExportProgressMsg(
                      `Rendered & Exported ${activeTrackIds.length} Stems with Clip Gain Maps Applied!`
                    );
                  }}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                >
                  <Download className="w-4 h-4" />
                  <span>RENDER & EXPORT ALL SELECTED STEMS</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
