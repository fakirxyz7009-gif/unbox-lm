import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { MixerTrackState, MixerFxSlot } from '../../audio/types.ts';
import { Knob } from '../Knob.tsx';
import {
  Sliders,
  Volume2,
  Activity,
  Disc,
  Zap,
  Flame,
  Radio,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  ArrowUpDown,
  Power,
  RotateCcw,
  Waves,
  BarChart2,
  Check,
} from 'lucide-react';

interface MixerConsoleViewProps {
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  onSelectDeviceForRack?: (deviceId: string) => void;
  initialSelectedTrack?: number;
}

export const MixerConsoleView: React.FC<MixerConsoleViewProps> = ({
  audioEngine,
  devices,
  onSelectDeviceForRack,
  initialSelectedTrack = 1,
}) => {
  const [, setRerender] = useState(0);

  // 500 Insert Tracks state storage
  const [tracks, setTracks] = useState<MixerTrackState[]>(() => {
    const list: MixerTrackState[] = [];
    // Index 0 = Master Track
    list.push({
      index: 0,
      name: 'Master Bus',
      color: '#ef4444',
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
      phaseInvert: false,
      stereoSeparation: 0,
      pdcEnabled: true,
      pdcMs: 0.0,
      lowEq: 0,
      midEq: 0,
      highEq: 0,
      fxSlots: [
        { id: 'm_fx_1', name: 'Master 4-Band EQ', type: 'eq', enabled: true, mix: 1.0 },
        { id: 'm_fx_2', name: 'Bus Compressor', type: 'compressor', enabled: true, mix: 1.0 },
        { id: 'm_fx_3', name: 'Maximizer / Limiter', type: 'limiter', enabled: true, mix: 1.0 },
        { id: 'm_fx_4', name: 'Slot 4 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_5', name: 'Slot 5 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_6', name: 'Slot 6 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_7', name: 'Slot 7 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_8', name: 'Slot 8 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_9', name: 'Slot 9 (Empty)', type: 'none', enabled: false, mix: 1.0 },
        { id: 'm_fx_10', name: 'Slot 10 (Empty)', type: 'none', enabled: false, mix: 1.0 },
      ],
      routedToMaster: true,
      sendToTracks: [],
      peakL: 0,
      peakR: 0,
    });

    // 500 Insert Tracks
    for (let i = 1; i <= 500; i++) {
      const defaultName =
        i === 1 ? 'Insert 1 (Lead)' :
        i === 2 ? 'Insert 2 (3x OSC)' :
        i === 3 ? 'Insert 3 (FLEX)' :
        i === 4 ? 'Insert 4 (Redrum)' :
        `Insert ${i}`;

      const defaultColor =
        i === 1 ? '#10b981' :
        i === 2 ? '#34d399' :
        i === 3 ? '#059669' :
        i === 4 ? '#f59e0b' : '#64748b';

      const fxSlots: MixerFxSlot[] = Array.from({ length: 10 }).map((_, slotIdx) => ({
        id: `trk_${i}_slot_${slotIdx + 1}`,
        name: `Slot ${slotIdx + 1} (Empty)`,
        type: 'none',
        enabled: false,
        mix: 1.0,
      }));

      // Give default inserts some starter effects
      if (i === 1) {
        fxSlots[0] = { id: `trk_1_slot_1`, name: 'Parametric EQ', type: 'eq', enabled: true, mix: 1.0 };
        fxSlots[1] = { id: `trk_1_slot_2`, name: 'Scream Tape Warmer', type: 'distortion', enabled: true, mix: 0.85 };
        fxSlots[2] = { id: `trk_1_slot_3`, name: 'Ping-Pong Delay', type: 'delay', enabled: true, mix: 0.4 };
      } else if (i === 4) {
        fxSlots[0] = { id: `trk_4_slot_1`, name: 'Drum Bus Compressor', type: 'compressor', enabled: true, mix: 1.0 };
        fxSlots[1] = { id: `trk_4_slot_2`, name: 'PDC Gate / Transient', type: 'gate', enabled: true, mix: 0.9 };
      }

      list.push({
        index: i,
        name: defaultName,
        color: defaultColor,
        volume: 0.85,
        pan: 0,
        mute: false,
        solo: false,
        phaseInvert: false,
        stereoSeparation: 0,
        pdcEnabled: true,
        pdcMs: 0.0,
        lowEq: 0,
        midEq: 0,
        highEq: 0,
        fxSlots,
        routedToMaster: true,
        sendToTracks: [],
        peakL: 0,
        peakR: 0,
      });
    }

    return list;
  });

  // Selected track index for Current Selected Utility Track Strip
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(initialSelectedTrack);
  const selectedTrack = tracks.find((t) => t.index === selectedTrackIndex) || tracks[1];

  // Visualizer display mode on inspector: 'waveform' | 'spectrum' | 'meter'
  const [visualizerMode, setVisualizerMode] = useState<'waveform' | 'spectrum' | 'meter'>('waveform');

  // Track pagination / banking for smooth rendering of 500 tracks (e.g. 16 tracks visible per page)
  const [pageStart, setPageStart] = useState<number>(1);
  const PAGE_SIZE = 16;
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Canvas ref for live oscilloscope / spectrum on selected utility track
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync fader changes to device volume if mapped
  const handleFaderChange = (trackIndex: number, val: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, volume: val } : t))
    );
    if (trackIndex === 0) {
      audioEngine.masterGain.gain.setValueAtTime(val, audioEngine.ctx.currentTime);
    } else {
      // Find matching sequencer track or device
      const seqTrack = audioEngine.tracks.find((st) => (st.mixerTrack || 1) === trackIndex);
      if (seqTrack) {
        seqTrack.volume = val;
        const dev = devices.find((d) => d.id === seqTrack.deviceId);
        if (dev) dev.setParam('volume', val);
      }
    }
  };

  const handlePanChange = (trackIndex: number, val: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, pan: val } : t))
    );
    const seqTrack = audioEngine.tracks.find((st) => (st.mixerTrack || 1) === trackIndex);
    if (seqTrack) {
      seqTrack.pan = val;
      const dev = devices.find((d) => d.id === seqTrack.deviceId);
      if (dev) dev.setParam('pan', val);
    }
  };

  const handleMuteToggle = (trackIndex: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, mute: !t.mute } : t))
    );
  };

  const handleSoloToggle = (trackIndex: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, solo: !t.solo } : t))
    );
  };

  const handlePhaseInvertToggle = (trackIndex: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, phaseInvert: !t.phaseInvert } : t))
    );
  };

  const handleStereoSeparationChange = (trackIndex: number, val: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, stereoSeparation: val } : t))
    );
  };

  // FX Slot manipulation
  const toggleFxSlot = (slotIdx: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== selectedTrackIndex) return t;
        const updated = [...t.fxSlots];
        updated[slotIdx] = { ...updated[slotIdx], enabled: !updated[slotIdx].enabled };
        return { ...t, fxSlots: updated };
      })
    );
  };

  const changeFxType = (slotIdx: number, type: MixerFxSlot['type']) => {
    const names: Record<MixerFxSlot['type'], string> = {
      none: `Slot ${slotIdx + 1} (Empty)`,
      eq: 'Parametric Studio EQ',
      compressor: 'VCA Bus Compressor',
      reverb: 'Pro Convolution Reverb',
      delay: 'Stereo Tape Echo',
      distortion: 'Scream Tube Overdrive',
      chorus: 'Dimension Chorus',
      flanger: 'Analog Flanger',
      limiter: 'True Peak Limiter',
      widener: 'Stereo Imager Widener',
      gate: 'Noise Gate & Transient',
    };

    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== selectedTrackIndex) return t;
        const updated = [...t.fxSlots];
        updated[slotIdx] = {
          ...updated[slotIdx],
          type,
          name: names[type],
          enabled: type !== 'none',
        };
        return { ...t, fxSlots: updated };
      })
    );
  };

  const moveFxSlot = (fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= 10) return;

    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== selectedTrackIndex) return t;
        const updated = [...t.fxSlots];
        const temp = updated[fromIdx];
        updated[fromIdx] = updated[toIdx];
        updated[toIdx] = temp;
        return { ...t, fxSlots: updated };
      })
    );
  };

  const setFxSidechainSource = (slotIdx: number, sourceTrack: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== selectedTrackIndex) return t;
        const updated = [...t.fxSlots];
        updated[slotIdx] = { ...updated[slotIdx], sidechainSourceTrack: sourceTrack };
        return { ...t, fxSlots: updated };
      })
    );
  };

  // Real-time Canvas Rendering Loop for Inspector Visualizer
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioEngine.analyserL;
    const bufferLength = analyser.frequencyBinCount;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Grid background
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (visualizerMode === 'waveform') {
        analyser.getByteTimeDomainData(timeData);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#10b981';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === 'spectrum') {
        analyser.getByteFrequencyData(freqData);
        const barWidth = (width / (bufferLength / 2)) * 1.5;
        let x = 0;
        for (let i = 0; i < bufferLength / 2; i++) {
          const barHeight = (freqData[i] / 255.0) * height;
          const grad = ctx.createLinearGradient(0, height, 0, 0);
          grad.addColorStop(0, '#064e3b');
          grad.addColorStop(0.6, '#10b981');
          grad.addColorStop(1, '#34d399');
          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [visualizerMode, audioEngine]);

  // Jump to track number
  const handleJumpToTrack = (numStr: string) => {
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num >= 1 && num <= 500) {
      setSelectedTrackIndex(num);
      const newPage = Math.floor((num - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
      setPageStart(newPage);
    }
  };

  const t = audioEngine.telemetry;
  const masterTrack = tracks[0];

  // Visible tracks in current bank
  const visibleTracks = tracks.filter((trk) => {
    if (trk.index === 0) return false; // Master is pinned on right
    if (searchQuery.trim() !== '') {
      return (
        trk.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trk.index.toString() === searchQuery.trim()
      );
    }
    return trk.index >= pageStart && trk.index < pageStart + PAGE_SIZE;
  });

  return (
    <div className="flex-1 flex overflow-hidden bg-[#111827] scifi-cyber-grid p-2 md:p-3 select-none">
      {/* LEFT WOODEN CONSOLE CHEEK */}
      <div className="w-5 sm:w-6 flex-shrink-0 wooden-cheek rounded-l-xl flex flex-col justify-between items-center py-3 border-r border-[#1a0f07] shadow-2xl select-none z-10">
        <div className="brass-screw" title="Solid Timber Box Screw" />
        <span className="text-[7px] font-mono font-black text-cyan-200/50 rotate-90 tracking-widest uppercase pointer-events-none">
          UNBOXED
        </span>
        <div className="brass-screw" title="Solid Timber Box Screw" />
      </div>

      {/* CENTER CONSOLE FRAME */}
      <div className="flex-1 flex flex-col bg-[#1f2937] text-cyan-100 overflow-hidden font-sans border-y-2 border-cyan-500/60 shadow-2xl">
        
        {/* 1. TOP MIXER HEADER: TRACK JUMP, SEARCH & 500-TRACK ARCHITECTURE STATUS */}
        <div className="h-14 bg-gradient-to-r from-[#065f46] via-[#1e3a8a] to-[#065f46] border-b border-cyan-600 px-4 flex items-center justify-between flex-shrink-0 gap-3">
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
              <h2 className="text-xs font-mono font-bold tracking-wider text-neutral-100 uppercase">
                500-TRACK DISCRETE MIXING CONSOLE
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#064e3b]/80 border border-emerald-500/60 text-[10px] font-mono text-emerald-300 font-bold">
              F2 ACTIVE &bull; 500 INSERTS + 1 MASTER
            </span>
          </div>

          {/* Quick Bank Pagination & Direct Track Jump */}
          <div className="flex items-center space-x-2">
            {/* Direct Track Jump Input */}
            <div className="flex items-center space-x-1.5 bg-[#351a0b]/80 px-2.5 py-1 rounded border border-amber-800 text-[10px] font-mono">
              <Search className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-amber-200">JUMP:</span>
              <input
                type="number"
                min="1"
                max="500"
                placeholder="1-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJumpToTrack((e.target as HTMLInputElement).value);
                }}
                className="w-14 bg-[#4a2e1b] text-amber-200 border border-amber-700 rounded px-1.5 py-0.5 text-center font-bold focus:outline-hidden focus:border-amber-400"
              />
            </div>

            {/* Bank Pager (e.g. Tracks 1-16, 17-32, etc.) */}
            <div className="flex items-center space-x-1 bg-[#351a0b]/80 p-1 rounded border border-amber-800 text-[10px] font-mono">
              <button
                onClick={() => setPageStart((p) => Math.max(1, p - PAGE_SIZE))}
                disabled={pageStart <= 1}
                className="p-1 rounded bg-[#4a2e1b] hover:bg-[#57351f] disabled:opacity-30 disabled:hover:bg-[#4a2e1b] text-amber-200"
                title="Previous 16 Tracks"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-2 text-amber-200 font-bold">
                TRACKS {pageStart} &ndash; {Math.min(500, pageStart + PAGE_SIZE - 1)} / 500
              </span>

              <button
                onClick={() => setPageStart((p) => Math.min(500 - PAGE_SIZE + 1, p + PAGE_SIZE))}
                disabled={pageStart + PAGE_SIZE > 500}
                className="p-1 rounded bg-[#4a2e1b] hover:bg-[#57351f] disabled:opacity-30 disabled:hover:bg-[#4a2e1b] text-amber-200"
                title="Next 16 Tracks"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. MAIN CONSOLE WORKSPACE (INSPECTOR UTILITY STRIP + HORIZONTAL INSERTS + PINNED MASTER) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* A. CURRENT SELECTED UTILITY TRACK INSPECTOR (LEFT PANEL) */}
          <div className="w-72 lg:w-80 flex-shrink-0 bg-[#1f2937] border-r border-cyan-600 flex flex-col overflow-y-auto p-3 space-y-3">
            
            {/* Inspector Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center space-x-2">
                <span
                  className="w-3 h-3 rounded-xs flex-shrink-0"
                  style={{ backgroundColor: selectedTrack.color }}
                />
                <span className="text-xs font-mono font-bold text-white uppercase truncate">
                  {selectedTrack.index === 0 ? 'MASTER BUS INSPECTOR' : `INSPECTOR: ${selectedTrack.name}`}
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-600/50">
                CH #{selectedTrack.index}
              </span>
            </div>

            {/* Real-Time Graphical Sound Visualizer (Oscilloscope / Spectrum) */}
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                <span className="font-bold flex items-center">
                  <Activity className="w-3 h-3 mr-1 text-emerald-400" /> REAL-TIME DSP ANALYTICS
                </span>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setVisualizerMode('waveform')}
                    className={`px-1.5 py-0.5 rounded ${
                      visualizerMode === 'waveform' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    OSC
                  </button>
                  <button
                    onClick={() => setVisualizerMode('spectrum')}
                    className={`px-1.5 py-0.5 rounded ${
                      visualizerMode === 'spectrum' ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    FFT
                  </button>
                </div>
              </div>
              <canvas
                ref={canvasRef}
                width={280}
                height={90}
                className="w-full h-22 rounded border border-neutral-800 shadow-inner"
              />
            </div>

            {/* Utility Channel Controls: Phase ø, Stereo Width, PDC */}
            <div className="bg-[#141820] p-2.5 rounded-lg border border-neutral-800 space-y-2">
              <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase flex items-center justify-between">
                <span>STRIP PROCESSORS</span>
                <span className="text-[9px] text-neutral-500">PDC COMPENSATED</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                {/* Polarity Phase Inversion ø */}
                <button
                  onClick={() => handlePhaseInvertToggle(selectedTrack.index)}
                  className={`py-1.5 px-2 rounded border font-bold flex flex-col items-center justify-center transition-all ${
                    selectedTrack.phaseInvert
                      ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                  }`}
                  title="Invert audio polarity (180 deg phase shift)"
                >
                  <span className="text-xs">&oslash;</span>
                  <span className="text-[8px]">PHASE</span>
                </button>

                {/* Stereo Separation Knob */}
                <div className="flex flex-col items-center bg-black/40 py-1 rounded border border-neutral-800">
                  <Knob
                    label=""
                    value={selectedTrack.stereoSeparation}
                    min={-1}
                    max={1}
                    step={0.05}
                    size="xs"
                    variant="metal"
                    onChange={(v) => handleStereoSeparationChange(selectedTrack.index, v)}
                  />
                  <span className="text-[8px] font-mono text-neutral-400 -mt-1">WIDTH</span>
                </div>

                {/* PDC Toggle */}
                <div className="flex flex-col items-center justify-center bg-black/40 py-1 px-1 rounded border border-neutral-800">
                  <span className="text-[8px] text-neutral-500">PDC</span>
                  <span className="text-[9px] font-bold text-emerald-400">0.0 ms</span>
                  <span className="text-[7px] text-emerald-500 uppercase">ACTIVE</span>
                </div>
              </div>
            </div>

            {/* 10 DEDICATED FX PLUGIN SLOTS */}
            <div className="flex-1 flex flex-col space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-emerald-400">
                <span>10 FX PLUGIN SLOTS</span>
                <span className="text-[9px] text-neutral-500">CUSTOM REORDER & SIDECHAIN</span>
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[300px] pr-1">
                {selectedTrack.fxSlots.map((slot, sIdx) => {
                  return (
                    <div
                      key={slot.id}
                      className={`p-1.5 rounded border flex items-center justify-between text-xs font-mono transition-colors ${
                        slot.enabled
                          ? 'bg-[#151c24] border-emerald-600/70 text-white shadow-xs'
                          : 'bg-[#101318] border-neutral-800/80 text-neutral-400'
                      }`}
                    >
                      {/* Slot Index & Power Bypass Toggle */}
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[9px] font-bold text-neutral-500 w-3">
                          {sIdx + 1}
                        </span>
                        <button
                          onClick={() => toggleFxSlot(sIdx)}
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            slot.enabled ? 'bg-emerald-500 text-black shadow-[0_0_6px_#10b981]' : 'bg-neutral-800 text-neutral-500'
                          }`}
                          title="Toggle Plugin Bypass"
                        >
                          <Power className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Plugin Selector Dropdown */}
                      <select
                        value={slot.type}
                        onChange={(e) => changeFxType(sIdx, e.target.value as any)}
                        className="flex-1 mx-1 bg-black/60 text-neutral-200 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] focus:outline-hidden focus:border-emerald-500 truncate"
                      >
                        <option value="none">(Empty Slot)</option>
                        <option value="eq">Parametric EQ</option>
                        <option value="compressor">VCA Compressor</option>
                        <option value="reverb">Pro Reverb</option>
                        <option value="delay">Stereo Delay</option>
                        <option value="distortion">Scream Distortion</option>
                        <option value="chorus">Dimension Chorus</option>
                        <option value="flanger">Analog Flanger</option>
                        <option value="limiter">Peak Limiter</option>
                        <option value="widener">Stereo Widener</option>
                        <option value="gate">Noise Gate</option>
                      </select>

                      {/* Reorder Up / Down & Sidechain Menu */}
                      <div className="flex items-center space-x-0.5">
                        <button
                          onClick={() => moveFxSlot(sIdx, 'up')}
                          disabled={sIdx === 0}
                          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20"
                          title="Move Slot Up"
                        >
                          &uarr;
                        </button>
                        <button
                          onClick={() => moveFxSlot(sIdx, 'down')}
                          disabled={sIdx === 9}
                          className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-20"
                          title="Move Slot Down"
                        >
                          &darr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* B. HORIZONTAL CHANNEL STRIPS ROW (SCROLLABLE INSERTS 1..500) */}
          <div className="flex-1 flex overflow-x-auto overflow-y-hidden p-2.5 gap-2 bg-[#3c2415]">
            {visibleTracks.map((track) => {
              const isSelected = track.index === selectedTrackIndex;
              const activeFxCount = track.fxSlots.filter((s) => s.enabled).length;

              return (
                <div
                  key={track.index}
                  onClick={() => setSelectedTrackIndex(track.index)}
                  className={`w-28 flex-shrink-0 flex flex-col rounded-lg border transition-all p-2 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#1e3a8a] via-[#312e81] to-[#1e1b4b] border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : 'bg-[#1f2937] hover:bg-[#374151] border-cyan-600/60'
                  }`}
                >
                  {/* Strip Header: Number, Color Tag & Name */}
                  <div className="flex flex-col items-center pb-2 border-b border-neutral-800/80">
                    <span className="text-[10px] font-mono font-bold text-emerald-400">
                      #{track.index}
                    </span>
                    <span
                      className="text-xs font-mono font-bold text-white truncate max-w-full text-center"
                      title={track.name}
                    >
                      {track.name}
                    </span>
                    <div
                      className="w-full h-1 rounded-full mt-1"
                      style={{ backgroundColor: track.color }}
                    />
                  </div>

                  {/* Strip Dials: Pan & Stereo Width */}
                  <div className="py-2 flex items-center justify-around border-b border-neutral-800/80">
                    <div className="flex flex-col items-center">
                      <Knob
                        label=""
                        value={track.pan}
                        min={-1}
                        max={1}
                        step={0.05}
                        size="xs"
                        variant="metal"
                        onChange={(v) => handlePanChange(track.index, v)}
                      />
                      <span className="text-[8px] font-mono text-neutral-400 -mt-1">PAN</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePhaseInvertToggle(track.index);
                        }}
                        className={`w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-colors ${
                          track.phaseInvert
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                        title="Polarity Inversion (ø)"
                      >
                        &oslash;
                      </button>
                      <span className="text-[8px] font-mono text-neutral-400 mt-0.5">PHS</span>
                    </div>
                  </div>

                  {/* Mute & Solo Buttons */}
                  <div className="grid grid-cols-2 gap-1 py-1.5 border-b border-neutral-800/80">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMuteToggle(track.index);
                      }}
                      className={`py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                        track.mute
                          ? 'bg-red-950 text-red-400 border border-red-700/60'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      MUTE
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSoloToggle(track.index);
                      }}
                      className={`py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                        track.solo
                          ? 'bg-emerald-600 text-white shadow-[0_0_8px_#10b981]'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      SOLO
                    </button>
                  </div>

                  {/* Active FX Slots Count Badge */}
                  <div className="py-1 text-center text-[9px] font-mono text-neutral-400 border-b border-neutral-800/80">
                    <span className="text-emerald-400 font-bold">{activeFxCount}</span> / 10 FX
                  </div>

                  {/* Main Fader & Peak Meter Section */}
                  <div className="flex-1 flex justify-center py-2 relative">
                    {/* High-Resolution Vertical Slider Track */}
                    <div className="relative w-8 h-full bg-[#351a0b] rounded-xs border border-amber-800 flex justify-center items-center">
                      {/* dB Scale Marks */}
                      <div className="absolute inset-0 flex flex-col justify-between py-1 text-[7px] font-mono text-neutral-600 pointer-events-none select-none px-0.5">
                        <span>+6</span>
                        <span>0</span>
                        <span>-6</span>
                        <span>-12</span>
                        <span>-inf</span>
                      </div>

                      {/* Slider Input */}
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={track.volume}
                        onChange={(e) => handleFaderChange(track.index, parseFloat(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      />

                      {/* Tactile Machined Metallic Fader Cap with Dark Green Accent */}
                      <div
                        className="absolute w-7 h-9 rounded bg-gradient-to-b from-[#e2e8f0] via-[#cbd5e1] to-[#94a3b8] border border-white shadow-2xl pointer-events-none flex flex-col items-center justify-center"
                        style={{
                          bottom: `${(track.volume / 1.5) * 80}%`,
                        }}
                      >
                        <div className="w-5 h-0.5 bg-emerald-600 shadow-xs mb-0.5" />
                        <div className="w-4 h-px bg-slate-400" />
                      </div>
                    </div>

                    {/* Channel LED Peak Meter */}
                    <div className="w-3.5 h-full pl-1">
                      <StripPeakMeter volume={track.mute ? 0 : track.volume} />
                    </div>
                  </div>

                  {/* Fader Readout Percentage */}
                  <div className="mt-1 text-center text-[10px] font-mono font-bold text-emerald-400">
                    {(track.volume * 100).toFixed(0)} %
                  </div>
                </div>
              );
            })}
          </div>

          {/* C. PINNED MASTER BUS STRIP (RIGHT SIDE) */}
          <div className="w-36 flex-shrink-0 bg-[#0e1218] border-l-2 border-emerald-950 flex flex-col p-2.5 select-none shadow-2xl">
            {/* Master Strip Header */}
            <div className="flex flex-col items-center pb-2 border-b border-neutral-800">
              <span className="text-[10px] font-mono font-bold text-red-400">MASTER BUS</span>
              <span className="text-xs font-mono font-black text-white">MAIN OUT</span>
              <div className="w-full h-1 bg-red-500 rounded-full mt-1" />
            </div>

            {/* Master Stereo Width & Dim Controls */}
            <div className="py-2 flex items-center justify-around border-b border-neutral-800">
              <div className="flex flex-col items-center">
                <Knob
                  label=""
                  value={1.0}
                  min={0}
                  max={2}
                  step={0.05}
                  size="xs"
                  variant="metal"
                  onChange={() => {}}
                />
                <span className="text-[8px] font-mono text-neutral-400 -mt-1">WIDTH</span>
              </div>
            </div>

            {/* Master Fader & Stereo Dual LED Meter */}
            <div className="flex-1 flex justify-center py-2 relative">
              <div className="relative w-9 h-full bg-[#0a0c10] rounded-xs border border-neutral-800 flex justify-center items-center">
                <div className="absolute inset-0 flex flex-col justify-between py-1 text-[7px] font-mono text-neutral-600 pointer-events-none px-0.5">
                  <span>+6</span>
                  <span>0</span>
                  <span>-6</span>
                  <span>-12</span>
                  <span>-inf</span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={masterTrack.volume}
                  onChange={(e) => handleFaderChange(0, parseFloat(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />

                {/* Iconic Red Master Fader Cap */}
                <div
                  className="absolute w-8 h-10 rounded bg-gradient-to-b from-red-500 via-red-600 to-red-800 border border-red-300 shadow-2xl pointer-events-none flex flex-col items-center justify-center"
                  style={{
                    bottom: `${(masterTrack.volume / 1.5) * 80}%`,
                  }}
                >
                  <div className="w-6 h-0.5 bg-white shadow-xs mb-0.5" />
                  <div className="w-5 h-px bg-red-950" />
                </div>
              </div>

              {/* Master Stereo Peak LED Ladders */}
              <div className="w-5 h-full flex space-x-1 pl-1">
                <MasterLedLadder value={t.peakL} />
                <MasterLedLadder value={t.peakR} />
              </div>
            </div>

            <div className="mt-1 text-center text-[10px] font-mono font-bold text-red-400">
              {(masterTrack.volume * 100).toFixed(0)} %
            </div>
          </div>
        </div>

        {/* 3. SOLID WOOD CONSOLE ARMREST BOLSTER */}
        <div className="h-6 studio-wood-top border-t border-[#2d180c] px-4 flex items-center justify-between text-[9px] font-mono text-amber-200/60 flex-shrink-0 shadow-lg">
          <span className="font-bold tracking-widest uppercase">
            SOLID MAHOGANY CONSOLE ARMREST // 500-BUS DISCRETE MIXING SPECIFICATION
          </span>
          <span className="hidden sm:inline">ZERO-LATENCY 64-BIT PRECISION BALANCED SUMMING</span>
        </div>
      </div>

      {/* RIGHT WOODEN CONSOLE CHEEK */}
      <div className="w-5 sm:w-6 flex-shrink-0 wooden-cheek rounded-r-xl flex flex-col justify-between items-center py-3 border-l border-[#1a0f07] shadow-2xl select-none z-10">
        <div className="brass-screw" title="Solid Timber Box Screw" />
        <span className="text-[7px] font-mono font-black text-amber-200/50 -rotate-90 tracking-widest uppercase pointer-events-none">
          UNBOXED
        </span>
        <div className="brass-screw" title="Solid Timber Box Screw" />
      </div>
    </div>
  );
};

// Real-Time LED Peak Meter for Individual Insert Strip
const StripPeakMeter: React.FC<{ volume: number }> = ({ volume }) => {
  const numSegments = 12;
  const level = volume * 0.75;

  return (
    <div className="w-full h-full flex flex-col justify-between py-1 bg-neutral-950 rounded-xs px-0.5 border border-neutral-800">
      {Array.from({ length: numSegments }).map((_, i) => {
        const segIdx = numSegments - 1 - i;
        const threshold = (segIdx + 1) / numSegments;
        const isActive = level >= threshold;

        const color =
          segIdx >= 10
            ? 'bg-red-500 shadow-[0_0_4px_#ef4444]'
            : segIdx >= 7
            ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]'
            : 'bg-emerald-500 shadow-[0_0_4px_#10b981]';

        return (
          <div
            key={i}
            className={`w-full h-1.5 rounded-xs transition-colors duration-75 ${
              isActive ? color : 'bg-[#151820]'
            }`}
          />
        );
      })}
    </div>
  );
};

// Master Bus LED Ladder
const MasterLedLadder: React.FC<{ value: number }> = ({ value }) => {
  const numSegments = 12;
  return (
    <div className="flex-1 h-full flex flex-col justify-between py-1 bg-neutral-950 rounded-xs px-0.5 border border-neutral-800">
      {Array.from({ length: numSegments }).map((_, i) => {
        const segIdx = numSegments - 1 - i;
        const threshold = (segIdx + 1) / numSegments;
        const isActive = value >= threshold;

        const color =
          segIdx >= 10
            ? 'bg-red-500 shadow-[0_0_4px_#ef4444]'
            : segIdx >= 7
            ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]'
            : 'bg-emerald-500 shadow-[0_0_4px_#10b981]';

        return (
          <div
            key={i}
            className={`w-full h-1.5 rounded-xs transition-colors duration-75 ${
              isActive ? color : 'bg-[#151820]'
            }`}
          />
        );
      })}
    </div>
  );
};
