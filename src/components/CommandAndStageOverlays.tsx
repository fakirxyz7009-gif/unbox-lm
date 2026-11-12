import React, { useState, useEffect, useRef } from 'react';
import { useStepTick } from '../nexa/useEngine.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { BaseDevice } from '../audio/BaseDevice.ts';
import { DeviceType, SequencerTrack } from '../audio/types.ts';
import { Search, X, Compass, Video } from 'lucide-react';
export interface PaletteCommand {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  shortcut: string;
  run: () => void;
}

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
  // Navigation & Action Callbacks
  onNavigateSequencerTab: (tab: string) => void;
  onSpawnDevice: (type: DeviceType, name?: string) => void;
  onTriggerGlobalAction: (actionId: string) => void;
  /** Extra commands from the app (sections, project actions…). */
  appCommands: PaletteCommand[];
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
  onNavigateSequencerTab,
  onSpawnDevice,
  onTriggerGlobalAction,
  appCommands,
  activeVisualizerTheme,
  onChangeVisualizerTheme,
}) => {
  useStepTick(isStageModeOpen && audioEngine.isPlaying); // stage mode's step readout
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const [hoveredWedge, setHoveredWedge] = useState<string | null>(null);

  // Stage Mode Hardware Video Visualizer Canvas & Video Recorder
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const [, setTick] = useState(0);

  // All Searchable Commands in Global Command Search Bar (Ctrl + K)
  const commandCatalog: PaletteCommand[] = [
    ...appCommands,
    ...([
      ['channel_rack', 'Step sequencer grid', 'Shift+1'],
      ['piano_roll', 'Piano roll (notes, velocity, chords)', 'Shift+2'],
      ['arrangement', 'Arrangement timeline (clips, audio, automation, tempo)', 'Shift+3'],
      ['graph_editor', 'Graph & CC lanes (per-step velocity, pitch, pan, cutoff)', 'Shift+4'],
      ['drum_editor', 'Drum editor (one row per pad)', 'Shift+5'],
      ['loop_tracker', 'Clips & scenes launcher + tracker list', 'Shift+6'],
    ] as const).map(([tab, title, sc]) => ({ id: `tab_${tab}`, category: 'SEQUENCER', title, subtitle: 'Open in the sequencer', shortcut: sc, run: () => onNavigateSequencerTab(tab) })),
    { id: 'cmd_play', category: 'TRANSPORT', title: 'Play / pause', subtitle: 'Space', shortcut: 'SPACE', run: () => void audioEngine.togglePlay() },
    { id: 'cmd_stop', category: 'TRANSPORT', title: 'Stop and return to bar 1', subtitle: '', shortcut: '', run: () => audioEngine.stopTransport() },
    { id: 'cmd_record', category: 'TRANSPORT', title: 'Record armed tracks', subtitle: 'Arm tracks with ● first', shortcut: '', run: () => void audioEngine.recorder.toggle() },
    { id: 'cmd_metro', category: 'TRANSPORT', title: 'Metronome on / off', subtitle: 'M', shortcut: 'M', run: () => onTriggerGlobalAction('toggle_metronome') },
    { id: 'cmd_audio_track', category: 'TRACKS', title: 'New audio track', subtitle: 'Record or import audio', shortcut: '', run: () => audioEngine.createAudioTrack() },
    { id: 'cmd_bus', category: 'MIXER', title: 'New group bus', subtitle: 'Route tracks to it from the mixer', shortcut: '', run: () => audioEngine.mixer.createBus(`Bus ${audioEngine.mixer.buses().length + 1}`) },
    { id: 'cmd_return', category: 'MIXER', title: 'New effect return', subtitle: 'Feed it with sends', shortcut: '', run: () => audioEngine.mixer.createBus(`Return ${audioEngine.mixer.buses().length + 1}`, 'return') },
    { id: 'cmd_stage', category: 'VIEW', title: 'Stage mode (full-screen visualizer)', subtitle: '', shortcut: '', run: () => onTriggerGlobalAction('toggle_stage_mode') },
    { id: 'cmd_pie', category: 'VIEW', title: 'Pie menu', subtitle: '', shortcut: '', run: () => onTriggerGlobalAction('open_pie_center') },
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
          setTimeout(() => URL.revokeObjectURL(url), 10000);
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
    { id: 'loop', label: 'CLIPS & SCENES', sub: 'Launcher', angle: 0, color: '#06b6d4', run: () => onNavigateSequencerTab('loop_tracker') },
    { id: 'drums', label: 'DRUM EDITOR', sub: 'One row per pad', angle: 45, color: '#10b981', run: () => onNavigateSequencerTab('drum_editor') },
    { id: 'wyvern', label: '+ WYVERN SYNTH', sub: 'Dragon Wavetable', angle: 90, color: '#38bdf8', run: () => onSpawnDevice('wyvern', 'Wyvern Synthesizer Module') },
    { id: 'ember', label: '+ EMBER SYNTH', sub: 'Thermal Formant', angle: 135, color: '#f59e0b', run: () => onSpawnDevice('ember', 'Ember Synthesizer Module') },
    { id: 'piano', label: 'PIANO ROLL', sub: 'Notes & chords', angle: 180, color: '#a855f7', run: () => onNavigateSequencerTab('piano_roll') },
    { id: 'arrange', label: 'ARRANGEMENT', sub: 'Clips & automation', angle: 225, color: '#ec4899', run: () => onNavigateSequencerTab('arrangement') },
    { id: 'stems', label: 'EXPORT', sub: 'Mixdown & stems', angle: 270, color: '#22c55e', run: () => onTriggerGlobalAction('open_batch_exporter') },
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
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-cyan-300 font-bold">
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
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-bold">
                        {cmd.category}
                      </span>
                      <span className="text-xs font-bold text-white">{cmd.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{cmd.subtitle}</div>
                  </div>
                  <kbd className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] text-emerald-300 font-bold">
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
                  <div className="text-[11px] font-black tracking-tight" style={{ color: wedge.color }}>
                    {wedge.label}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{wedge.sub}</div>
                </button>
              );
            })}

            {/* Center Hub */}
            <div className="w-28 h-28 rounded-full bg-[#0c1424] border-2 border-emerald-500/60 flex flex-col items-center justify-center text-center p-2 z-10 shadow-inner">
              <Compass className="w-5 h-5 text-cyan-400 mb-0.5 animate-spin" style={{ animationDuration: '10s' }} />
              <span className="text-[11px] font-black text-white">SMART PIE</span>
              <span className="text-[11px] text-emerald-300">
                {hoveredWedge ? hoveredWedge.toUpperCase() : 'SELECT ACTION'}
              </span>
              <button
                onClick={onClosePieMenu}
                className="mt-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-red-900/60 text-[11px] text-slate-400 hover:text-white"
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
              <span className="text-[11px] text-slate-400 mr-1">VISUALIZER THEME:</span>
              {(['Synthwave', 'Neon', 'Galaxy', 'Inferno', 'Timeline'] as VisualizerThemeProfile[]).map((th) => (
                <button
                  key={th}
                  onClick={() => onChangeVisualizerTheme(th)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
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
                className={`ml-2 px-3 py-1 rounded text-[11px] font-black flex items-center space-x-1 ${
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
                className={`px-3 py-1 rounded text-[11px] font-black ${
                  audioEngine.isPlaying ? 'bg-amber-500 text-black' : 'bg-cyan-600 text-white'
                }`}
              >
                {audioEngine.isPlaying ? 'STOP [SPACE]' : 'PLAY [SPACE]'}
              </button>

              <button
                onClick={onCloseStageMode}
                className="px-3 py-1 rounded bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-bold"
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
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded border border-cyan-500/40 text-[11px]">
                  <span className="text-cyan-300 font-black">HARDWARE VIDEO VISUALIZER // </span>
                  <span className="text-emerald-300">{activeVisualizerTheme.toUpperCase()} PROFILE</span>
                </div>
              </div>

              {/* Live Loop Launcher Scene Triggers on Stage */}
              <div className="bg-[#090e1a] border border-cyan-500/30 rounded-xl p-3">
                <div className="text-[11px] text-cyan-300 font-bold mb-2 flex items-center justify-between">
                  <span>STAGE LOOP LAUNCHER // LIVE SCENE PADS</span>
                  <span className="text-emerald-400">ACTIVE SCENE: {audioEngine.activePatternIndex + 1} (pattern mode)</span>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  {Array.from({ length: 8 }).map((_, sIdx) => {
                    const isActive = audioEngine.activePatternIndex === sIdx;
                    return (
                      <button
                        key={sIdx}
                        onClick={() => {
                          audioEngine.setPlaybackMode('pattern_loop');
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
                        <div className="text-[11px] font-black">SCENE {sIdx + 1}</div>
                        <div className="text-[11px] opacity-80">PAT {sIdx + 1}</div>
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
                <div className="text-[11px] text-emerald-400 font-black border-b border-slate-800 pb-1.5 flex justify-between">
                  <span>PRECISION DIAGNOSTIC SCOPES</span>
                  <span>TRUE PEAK &bull; LUFS &bull; PHASE</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[11px] text-slate-400">MOMENTARY</div>
                    <div className="text-sm font-black text-cyan-300">
                      {audioEngine.lufsMetering.momentary.toFixed(1)} LUFS
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[11px] text-slate-400">TRUE PEAK</div>
                    <div className="text-sm font-black text-emerald-400">
                      {audioEngine.lufsMetering.truePeakDbtp.toFixed(1)} dBTP
                    </div>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="text-[11px] text-slate-400">PHASE CORR</div>
                    <div className="text-sm font-black text-amber-300">
                      +{audioEngine.lufsMetering.phaseCorrelation}
                    </div>
                  </div>
                </div>
              </div>

              {/* 8 Bounded Macro Control Knobs */}
              <div className="bg-[#090e1a] border border-cyan-500/30 rounded-xl p-3 flex-1">
                <div className="text-[11px] text-cyan-300 font-black border-b border-slate-800 pb-1.5 mb-2 flex justify-between">
                  <span>8 BOUNDED MACRO CONTROL KNOBS</span>
                  <span className="text-emerald-400">MULTI-TARGET DSP</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {audioEngine.macroKnobs.map((mc) => (
                    <div key={mc.id} className="bg-slate-950/90 border border-slate-800 rounded-lg p-2">
                      <div className="flex justify-between text-[11px] font-bold text-white mb-1">
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
                      <div className="text-[11px] text-slate-400 flex justify-between mt-0.5">
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
    </>
  );
};
