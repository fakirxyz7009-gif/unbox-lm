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

    // 500 Clean Insert Tracks (Dynamically bound to mounted Rack & Sequencer instruments)
    for (let i = 1; i <= 500; i++) {
      const fxSlots: MixerFxSlot[] = Array.from({ length: 10 }).map((_, slotIdx) => ({
        id: `trk_${i}_slot_${slotIdx + 1}`,
        name: `Slot ${slotIdx + 1} (Empty)`,
        type: 'none',
        enabled: false,
        mix: 1.0,
      }));

      list.push({
        index: i,
        name: `Insert ${i}`,
        color: '#475569',
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

  // Automatically synchronize Mixer Insert Strips (1..500) with mounted SequencerTracks & Rack Devices
  useEffect(() => {
    setTracks((prev) =>
      prev.map((mTrk) => {
        if (mTrk.index === 0) return mTrk;
        const seqTrack =
          audioEngine.tracks.find((st) => st.mixerTrack === mTrk.index) ||
          audioEngine.tracks[mTrk.index - 1];
        if (seqTrack) {
          return {
            ...mTrk,
            name: seqTrack.name,
            color: seqTrack.color || '#10b981',
            volume: seqTrack.volume ?? 0.85,
            pan: seqTrack.pan ?? 0.0,
            mute: !!seqTrack.mute,
            solo: !!seqTrack.solo,
          };
        }
        return {
          ...mTrk,
          name: `Insert ${mTrk.index}`,
          color: '#475569',
          volume: mTrk.volume ?? 0.85,
          pan: mTrk.pan ?? 0.0,
        };
      })
    );
  }, [devices.length, audioEngine.tracks.length, audioEngine.currentStep]);

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

  const resolveSeqTrack = (trackIndex: number) => {
    return (
      audioEngine.tracks.find((st) => st.mixerTrack === trackIndex) ||
      audioEngine.tracks[trackIndex - 1]
    );
  };

  // Sync fader changes smoothly to Web Audio channelGain / masterGain using setTargetAtTime(..., ctx.currentTime, 0.015)
  const handleFaderChange = (trackIndex: number, val: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, volume: val } : t))
    );
    if (trackIndex === 0) {
      audioEngine.masterGain.gain.setTargetAtTime(val, audioEngine.ctx.currentTime, 0.015);
    } else {
      const seqTrack = resolveSeqTrack(trackIndex);
      if (seqTrack) {
        seqTrack.volume = val;
        audioEngine.updateTrackChannelStrip(seqTrack.id);
        const dev = devices.find((d) => d.id === seqTrack.deviceId);
        if (dev) dev.setParam('volume', val);
      }
    }
  };

  const handlePanChange = (trackIndex: number, val: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, pan: val } : t))
    );
    const seqTrack = resolveSeqTrack(trackIndex);
    if (seqTrack) {
      seqTrack.pan = val;
      audioEngine.updateTrackChannelStrip(seqTrack.id);
      const dev = devices.find((d) => d.id === seqTrack.deviceId);
      if (dev) dev.setParam('pan', val);
    }
  };

  const handleMuteToggle = (trackIndex: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, mute: !t.mute } : t))
    );
    const seqTrack = resolveSeqTrack(trackIndex);
    if (seqTrack) {
      audioEngine.toggleTrackMute(seqTrack.id);
    }
  };

  const handleSoloToggle = (trackIndex: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, solo: !t.solo } : t))
    );
    const seqTrack = resolveSeqTrack(trackIndex);
    if (seqTrack) {
      audioEngine.toggleTrackSolo(seqTrack.id);
    }
  };

  const auditionMixerTrack = (trackIndex: number) => {
    audioEngine.resumeContext();
    const seqTrack = resolveSeqTrack(trackIndex);
    if (seqTrack) {
      const dev = devices.find((d) => d.id === seqTrack.deviceId);
      if (dev?.noteOn) {
        const midi = 60 + audioEngine.rootKey;
        const now = audioEngine.ctx.currentTime;
        dev.noteOn(midi, 0.92, now);
        dev.noteOff?.(midi, now + 0.26);
      }
    }
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

            {/* Real-Time Neon-Spectrum FFT & Oscilloscope Visualizer */}
            <NeonSpectrumMasterVisualizer audioEngine={audioEngine} compact={false} />

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
          <div className="flex-1 flex overflow-x-auto overflow-y-hidden p-2.5 gap-2 bg-[#090d16]">
            {visibleTracks.map((track) => {
              const isSelected = track.index === selectedTrackIndex;
              const activeFxCount = track.fxSlots.filter((s) => s.enabled).length;
              const linkedSeqTrack = audioEngine.tracks.find((st) => (st.mixerTrack || 1) === track.index);
              const linkedDevice = linkedSeqTrack ? devices.find((d) => d.id === linkedSeqTrack.deviceId) : undefined;

              return (
                <div
                  key={track.index}
                  onClick={() => setSelectedTrackIndex(track.index)}
                  className={`w-28 flex-shrink-0 flex flex-col rounded-lg border transition-all p-2 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#1e3a8a] via-[#312e81] to-[#1e1b4b] border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : linkedSeqTrack
                      ? 'bg-[#131d31] hover:bg-[#1b2944] border-emerald-500/60'
                      : 'bg-[#111622] hover:bg-[#1a2234] border-slate-800'
                  }`}
                >
                  {/* Strip Header: Number, Color Tag, Name & Direct Audition Trigger */}
                  <div className="flex flex-col items-center pb-1.5 border-b border-neutral-800/80">
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-emerald-400">
                        #{track.index}
                      </span>
                      {linkedDevice && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            auditionMixerTrack(track.index);
                          }}
                          className="px-1.5 py-0.2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[8px] font-mono font-black"
                          title={`Audition ${track.name} directly from Mixer`}
                        >
                          TEST
                        </button>
                      )}
                    </div>
                    <span
                      className="text-xs font-mono font-bold text-white truncate max-w-full text-center mt-0.5"
                      title={track.name}
                    >
                      {track.name}
                    </span>
                    <div
                      className="w-full h-1 rounded-full mt-1"
                      style={{ backgroundColor: track.color }}
                    />
                  </div>

                  {/* Strip Dials: Pan (Default 0.00 = CENTER) & Polarity */}
                  <div className="py-2 flex items-center justify-around border-b border-neutral-800/80">
                    <div className="flex flex-col items-center">
                      <Knob
                        label=""
                        value={track.pan ?? 0}
                        defaultValue={0}
                        min={-1}
                        max={1}
                        step={0.05}
                        size="xs"
                        variant="metal"
                        onChange={(v) => handlePanChange(track.index, v)}
                      />
                      <span className="text-[7.5px] font-mono text-cyan-400 -mt-1 font-bold">
                        {Math.abs(track.pan ?? 0) < 0.03
                          ? 'CENTER'
                          : (track.pan ?? 0) < 0
                          ? `L${Math.round(Math.abs(track.pan) * 100)}`
                          : `R${Math.round(track.pan * 100)}`}
                      </span>
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

                  {/* Main Fader & 24-Segment Stereo LED Peak Meter Section */}
                  <div className="flex-1 flex justify-center py-2 relative">
                    {/* High-Resolution Vertical Slider Track */}
                    <div
                      onDoubleClick={() => handleFaderChange(track.index, 0.85)}
                      title="Double-click to reset to 0.0 dB Unity (85%)"
                      className="relative w-8 h-full bg-[#351a0b] rounded-xs border border-amber-800 flex justify-center items-center"
                    >
                      {/* dB Scale Marks */}
                      <div className="absolute inset-0 flex flex-col justify-between py-1 text-[7px] font-mono text-neutral-500 pointer-events-none select-none px-0.5">
                        <span>+6</span>
                        <span className="text-emerald-400 font-bold">0.0</span>
                        <span>-6</span>
                        <span>-12</span>
                        <span>-48</span>
                      </div>

                      {/* Slider Input */}
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={track.volume ?? 0.85}
                        onChange={(e) => handleFaderChange(track.index, parseFloat(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      />

                      {/* Tactile Machined Metallic Fader Cap with Dark Green Accent */}
                      <div
                        className="absolute w-7 h-9 rounded bg-gradient-to-b from-[#e2e8f0] via-[#cbd5e1] to-[#94a3b8] border border-white shadow-2xl pointer-events-none flex flex-col items-center justify-center"
                        style={{
                          bottom: `${((track.volume ?? 0.85) / 1.5) * 80}%`,
                        }}
                      >
                        <div className="w-5 h-0.5 bg-emerald-600 shadow-xs mb-0.5" />
                        <div className="w-4 h-px bg-slate-400" />
                      </div>
                    </div>

                    {/* Live 24-Segment Stereo LED Peak Meter driven by requestAnimationFrame AnalyserNode */}
                    <div className="w-5 h-full pl-1">
                      <StripPeakMeter
                        deviceId={linkedDevice?.id}
                        volume={track.mute ? 0 : track.volume ?? 0.85}
                        pan={track.pan ?? 0}
                      />
                    </div>
                  </div>

                  {/* Fader Readout dB & Unity Percentage */}
                  <div className="mt-1 text-center text-[9.5px] font-mono font-bold text-emerald-400">
                    {Math.abs((track.volume ?? 0.85) - 0.85) < 0.015
                      ? '0.0 dB (85%)'
                      : `${(((track.volume ?? 0.85) - 0.85) * 24).toFixed(1)} dB`}
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

// Live 24-Segment Stereo LED Level Meter (Green -48dB to -12dB, Amber -12dB to -3dB, Red 0dB Clip) driven by requestAnimationFrame reading track's AnalyserNode
export const StripPeakMeter: React.FC<{ deviceId?: string; volume: number; pan?: number; isPlaying?: boolean; stripIndex?: number }> = ({
  deviceId,
  volume,
  pan = 0,
  stripIndex = 1,
}) => {
  const numSegments = 24;
  const [levels, setLevels] = useState<{ l: number; r: number }>({ l: 0, r: 0 });

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (volume > 0) {
        if (deviceId) {
          const st = audioEngine.getTrackStereoLevels(deviceId);
          const liveL = Math.max(st.peakL, st.rmsL * 1.45) * Math.min(1.25, volume / 0.85);
          const liveR = Math.max(st.peakR, st.rmsR * 1.45) * Math.min(1.25, volume / 0.85);
          setLevels((prev) => ({
            l: Math.max(liveL, prev.l * 0.86),
            r: Math.max(liveR, prev.r * 0.86),
          }));
        } else if (audioEngine.isPlaying) {
          const masterL = audioEngine.telemetry.peakL;
          const masterR = audioEngine.telemetry.peakR;
          const mod = 0.65 + 0.35 * Math.sin(performance.now() * 0.006 + stripIndex * 1.3);
          setLevels((prev) => ({
            l: Math.max(masterL * mod * (volume / 0.85), prev.l * 0.86),
            r: Math.max(masterR * mod * (volume / 0.85), prev.r * 0.86),
          }));
        } else {
          setLevels((prev) => (prev.l > 0.01 || prev.r > 0.01 ? { l: prev.l * 0.82, r: prev.r * 0.82 } : prev));
        }
      } else {
        setLevels((prev) => (prev.l > 0.01 || prev.r > 0.01 ? { l: prev.l * 0.8, r: prev.r * 0.8 } : prev));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [deviceId, volume, pan, stripIndex]);

  const renderColumn = (val: number) => (
    <div className="flex-1 h-full flex flex-col justify-between py-0.5">
      {Array.from({ length: numSegments }).map((_, i) => {
        const segIdx = numSegments - 1 - i; // 23 down to 0
        const threshold = (segIdx + 1) / numSegments;
        const isActive = val >= threshold;

        // 24 segments: 0..16 Green (-48dB to -12dB), 17..21 Amber (-12dB to -3dB), 22..23 Red (0dB Clip)
        const color =
          segIdx >= 22
            ? 'bg-red-500 shadow-[0_0_5px_#ef4444]'
            : segIdx >= 17
            ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]'
            : 'bg-emerald-500 shadow-[0_0_3px_#10b981]';

        return (
          <div
            key={i}
            className={`w-full h-[3px] rounded-[1px] ${isActive ? color : 'bg-[#12161f]'}`}
          />
        );
      })}
    </div>
  );

  return (
    <div className="w-full h-full flex space-x-0.5 bg-neutral-950 rounded-xs p-0.5 border border-neutral-800">
      {renderColumn(levels.l)}
      {renderColumn(levels.r)}
    </div>
  );
};

// Master Bus 24-Segment LED Ladder
export const MasterLedLadder: React.FC<{ value: number }> = ({ value }) => {
  const numSegments = 24;
  return (
    <div className="flex-1 h-full flex flex-col justify-between py-0.5 bg-neutral-950 rounded-xs px-0.5 border border-neutral-800">
      {Array.from({ length: numSegments }).map((_, i) => {
        const segIdx = numSegments - 1 - i;
        const threshold = (segIdx + 1) / numSegments;
        const isActive = value >= threshold;

        const color =
          segIdx >= 22
            ? 'bg-red-500 shadow-[0_0_5px_#ef4444]'
            : segIdx >= 17
            ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]'
            : 'bg-emerald-500 shadow-[0_0_3px_#10b981]';

        return (
          <div
            key={i}
            className={`w-full h-[3px] rounded-[1px] ${isActive ? color : 'bg-[#12161f]'}`}
          />
        );
      })}
    </div>
  );
};

/**
 * NEON-SPECTRUM FFT AUDIO VISUALIZER (Bottom half of Right Column in Reference UI)
 * Features glowing Electric Cyan & Magenta FFT spectrum curves + bars and
 * 5 multi-band parametric knobs: Low, Mid, High, Width, Mix.
 */
export const NeonSpectrumMasterVisualizer: React.FC<{
  audioEngine: AudioEngine;
  compact?: boolean;
}> = ({ audioEngine, compact = true }) => {
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let rafId: number;
    const canvas = fftCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyserL = audioEngine.analyserL;
    const analyserR = audioEngine.analyserR;
    const binCount = analyserL.frequencyBinCount;
    const freqL = new Uint8Array(binCount);
    const freqR = new Uint8Array(binCount);
    const timeL = new Uint8Array(binCount);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Deep Obsidian Studio CRT Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#050811');
      bgGrad.addColorStop(1, '#090d19');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle Frequency & dB Grid Lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      analyserL.getByteFrequencyData(freqL);
      analyserR.getByteFrequencyData(freqR);
      analyserL.getByteTimeDomainData(timeL);

      // Check if live audio signal is present; if idle, render subtle breathing reference harmonic curve
      let totalEnergy = 0;
      for (let i = 0; i < 64; i++) totalEnergy += freqL[i];
      const nowSec = performance.now() * 0.0025;

      const numPoints = 64;
      const cyanPts: { x: number; y: number }[] = [];
      const magentaPts: { x: number; y: number }[] = [];

      const lowBoost = 1 + audioEngine.masterSpectrumState.low / 18;
      const midBoost = 1 + audioEngine.masterSpectrumState.mid / 18;
      const highBoost = 1 + audioEngine.masterSpectrumState.high / 18;

      for (let i = 0; i < numPoints; i++) {
        const x = (i / (numPoints - 1)) * w;
        const bandGain = i < 16 ? lowBoost : i < 42 ? midBoost : highBoost;
        let normL = (freqL[i] / 255) * bandGain;
        let normR = (freqR[i] / 255) * bandGain;

        if (totalEnergy < 40) {
          // Idle ambient studio analyzer glow matching the screenshot's dual cyan/magenta harmonic peaks
          const u = i / numPoints;
          normL =
            0.18 +
            0.38 * Math.exp(-Math.pow((u - 0.25) / 0.12, 2)) * (0.85 + 0.15 * Math.sin(nowSec * 1.7)) +
            0.46 * Math.exp(-Math.pow((u - 0.58) / 0.14, 2)) * (0.85 + 0.15 * Math.cos(nowSec * 1.3)) +
            0.22 * Math.exp(-Math.pow((u - 0.82) / 0.09, 2));
          normR =
            0.14 +
            0.44 * Math.exp(-Math.pow((u - 0.34) / 0.13, 2)) * (0.85 + 0.15 * Math.cos(nowSec * 1.5)) +
            0.35 * Math.exp(-Math.pow((u - 0.68) / 0.12, 2)) * (0.85 + 0.15 * Math.sin(nowSec * 1.9));
        }

        const yCyan = Math.max(8, h - Math.min(0.95, normL) * (h - 14));
        const yMag = Math.max(10, h - Math.min(0.95, normR) * (h - 16));
        cyanPts.push({ x, y: yCyan });
        magentaPts.push({ x, y: yMag });

        // Neon vertical FFT bars
        const barH = h - yCyan;
        const barGrad = ctx.createLinearGradient(0, h, 0, yCyan);
        barGrad.addColorStop(0, 'rgba(6, 182, 212, 0.05)');
        barGrad.addColorStop(0.6, 'rgba(217, 70, 239, 0.28)');
        barGrad.addColorStop(1, 'rgba(34, 211, 238, 0.65)');
        ctx.fillStyle = barGrad;
        ctx.fillRect(x - 1.5, yCyan, 2.5, barH);
      }

      // Draw Magenta Stereo Side / Harmonic Curve
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, h);
      magentaPts.forEach((p, idx) => {
        if (idx === 0) ctx.lineTo(p.x, p.y);
        else {
          const prev = magentaPts[idx - 1];
          const cx = (prev.x + p.x) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y) / 2);
        }
      });
      ctx.lineTo(w, h);
      ctx.closePath();
      const magFill = ctx.createLinearGradient(0, 0, 0, h);
      magFill.addColorStop(0, 'rgba(236, 72, 153, 0.38)');
      magFill.addColorStop(1, 'rgba(236, 72, 153, 0.02)');
      ctx.fillStyle = magFill;
      ctx.fill();

      ctx.beginPath();
      magentaPts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#f43f5e';
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Draw Electric Cyan Primary FFT Curve
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, h);
      cyanPts.forEach((p, idx) => {
        if (idx === 0) ctx.lineTo(p.x, p.y);
        else {
          const prev = cyanPts[idx - 1];
          const cx = (prev.x + p.x) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y) / 2);
        }
      });
      ctx.lineTo(w, h);
      ctx.closePath();
      const cyanFill = ctx.createLinearGradient(0, 0, 0, h);
      cyanFill.addColorStop(0, 'rgba(34, 211, 238, 0.42)');
      cyanFill.addColorStop(1, 'rgba(34, 211, 238, 0.02)');
      ctx.fillStyle = cyanFill;
      ctx.fill();

      ctx.beginPath();
      cyanPts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#22d3ee';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [audioEngine]);

  const sp = audioEngine.masterSpectrumState;
  const setParam = (key: 'low' | 'mid' | 'high' | 'width' | 'mix', val: number) => {
    audioEngine.setMasterSpectrumParam(key, val);
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col bg-[#0b0f19] rounded-lg border border-slate-800/90 p-2.5 shadow-2xl select-none">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono font-black tracking-wider text-slate-200 uppercase">
          AUDIO VISUALIZER
        </span>
        <span className="text-[8px] font-mono text-cyan-400 font-bold">
          FFT SPECTRUM &bull; 64-BIT
        </span>
      </div>

      <canvas
        ref={fftCanvasRef}
        width={compact ? 290 : 280}
        height={compact ? 116 : 96}
        className="w-full rounded border border-cyan-500/30 shadow-[inset_0_0_18px_rgba(6,182,212,0.18)]"
      />

      {/* 5 Multi-Band Parametric Knobs: Low, Mid, High, Width, Mix glowing in Cyan & Magenta */}
      <div className="grid grid-cols-5 gap-1 pt-2.5 mt-1.5 border-t border-slate-800/80 justify-items-center">
        <Knob
          label="Low"
          value={sp.low}
          defaultValue={0}
          min={-12}
          max={12}
          step={0.5}
          unit="dB"
          size="xs"
          variant="blue"
          onChange={(v) => setParam('low', v)}
        />
        <Knob
          label="Mid"
          value={sp.mid}
          defaultValue={0}
          min={-12}
          max={12}
          step={0.5}
          unit="dB"
          size="xs"
          variant="metal"
          onChange={(v) => setParam('mid', v)}
        />
        <Knob
          label="High"
          value={sp.high}
          defaultValue={0}
          min={-12}
          max={12}
          step={0.5}
          unit="dB"
          size="xs"
          variant="blue"
          onChange={(v) => setParam('high', v)}
        />
        <Knob
          label="Width"
          value={sp.width}
          defaultValue={1.0}
          min={0}
          max={2}
          step={0.05}
          size="xs"
          variant="yellow"
          onChange={(v) => setParam('width', v)}
        />
        <Knob
          label="Mix"
          value={sp.mix}
          defaultValue={1.0}
          min={0}
          max={1}
          step={0.05}
          size="xs"
          variant="white"
          onChange={(v) => setParam('mix', v)}
        />
      </div>
    </div>
  );
};

/**
 * RIGHT COLUMN STUDIO MIXER & NEON-SPECTRUM VISUALIZER (For 3-Column Professional Studio Layout)
 * - Top Half: Multi-channel vertical SSL mixer view with live 24-segment stereo LED bar meters,
 *   glowing mute/solo buttons, pan knobs, and smooth motorized fader caps set at 0 dB unity by default.
 * - Bottom Half: Neon-Spectrum FFT Audio Visualizer with Low, Mid, High, Width, Mix parametric knobs.
 */
export const RightColumnStudioMixer: React.FC<{
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  onOpenFullMixer?: () => void;
}> = ({ audioEngine, devices, onOpenFullMixer }) => {
  const [, setTick] = useState(0);
  const [masterVol, setMasterVol] = useState<number>(() => audioEngine.masterGain.gain.value || 0.85);
  const [masterMute, setMasterMute] = useState<boolean>(false);

  // Ensure at least 4 insert strips + Master strip are always displayed in the dock mixer matching the reference UI
  const seqTracks = audioEngine.tracks;
  const stripCount = Math.max(4, seqTracks.length);

  const handleStripFader = (idx: number, val: number) => {
    const trk = seqTracks[idx];
    if (trk) {
      trk.volume = val;
      audioEngine.updateTrackChannelStrip(trk.id);
      const dev = devices.find((d) => d.id === trk.deviceId);
      if (dev) dev.setParam('volume', val);
    }
    setTick((t) => t + 1);
  };

  const handleStripPan = (idx: number, val: number) => {
    const trk = seqTracks[idx];
    if (trk) {
      trk.pan = val;
      audioEngine.updateTrackChannelStrip(trk.id);
      const dev = devices.find((d) => d.id === trk.deviceId);
      if (dev) dev.setParam('pan', val);
    }
    setTick((t) => t + 1);
  };

  const handleStripMute = (idx: number) => {
    const trk = seqTracks[idx];
    if (trk) {
      audioEngine.toggleTrackMute(trk.id);
      setTick((t) => t + 1);
    }
  };

  const handleStripSolo = (idx: number) => {
    const trk = seqTracks[idx];
    if (trk) {
      audioEngine.toggleTrackSolo(trk.id);
      setTick((t) => t + 1);
    }
  };

  const handleMasterFader = (val: number) => {
    setMasterVol(val);
    audioEngine.masterGain.gain.setTargetAtTime(masterMute ? 0 : val, audioEngine.ctx.currentTime, 0.015);
  };

  const formatDb = (vol: number) => {
    if (Math.abs(vol - 0.85) < 0.02) return '0 dB';
    const db = (vol - 0.85) * 24;
    return `${db > 0 ? '+' : ''}${db.toFixed(0)} dB`;
  };

  return (
    <aside className="w-80 xl:w-[336px] flex-shrink-0 bg-[#11151e] border-l border-slate-800/90 flex flex-col justify-between overflow-y-auto p-2.5 gap-2.5 select-none">
      {/* TOP HALF: MULTI-CHANNEL VERTICAL SSL MIXER VIEW */}
      <div className="flex-1 min-h-[290px] flex flex-col bg-[#161b26] rounded-lg border border-slate-800/90 p-2.5 shadow-xl">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            <span className="text-[11px] font-mono font-black tracking-wider text-slate-100 uppercase">
              MIXER
            </span>
          </div>
          {onOpenFullMixer && (
            <button
              onClick={onOpenFullMixer}
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-slate-700 transition-colors"
              title="Expand Full 500-Channel SSL Mixing Console [F2]"
            >
              500-CH CONSOLE [F2]
            </button>
          )}
        </div>

        {/* Horizontal row of vertical SSL channel strips + Master strip */}
        <div className="flex-1 flex space-x-1.5 overflow-x-auto pb-1">
          {Array.from({ length: stripCount }).map((_, idx) => {
            const trk = seqTracks[idx];
            const vol = trk ? trk.volume ?? 0.85 : 0.85;
            const pan = trk ? trk.pan ?? 0 : 0;
            const isMuted = trk ? !!trk.mute : false;
            const isSolo = trk ? !!trk.solo : false;
            const label = trk ? `Track ${idx + 1}` : `Track ${idx + 1}`;

            return (
              <div
                key={idx}
                className="w-12 flex-shrink-0 bg-[#0d1118] rounded border border-slate-800/90 p-1.5 flex flex-col items-center justify-between"
              >
                {/* 24-Segment Stereo LED Bar Meter + Motorized Fader Side-by-Side */}
                <div className="flex-1 w-full flex items-center justify-center space-x-1 py-1 min-h-[148px]">
                  {/* Live 24-Segment Stereo LED Bar Meter */}
                  <div className="w-3.5 h-full">
                    <StripPeakMeter
                      deviceId={trk?.deviceId}
                      volume={isMuted ? 0 : vol}
                      pan={pan}
                      stripIndex={idx + 1}
                    />
                  </div>

                  {/* Motorized Vertical Fader Track */}
                  <div
                    onDoubleClick={() => handleStripFader(idx, 0.85)}
                    title={`${trk?.name || label} — Double-click for 0 dB Unity`}
                    className="relative w-4 h-full bg-[#06080d] rounded-xs border border-slate-800 flex justify-center"
                  >
                    {/* 0 dB Unity Tick Line */}
                    <div
                      className="absolute inset-x-0 h-px bg-cyan-400/50 pointer-events-none"
                      style={{ bottom: `${(0.85 / 1.5) * 82}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.01}
                      value={vol}
                      onChange={(e) => handleStripFader(idx, parseFloat(e.target.value))}
                      className="absolute inset-0 opacity-0 cursor-ns-resize w-full h-full z-10"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    {/* Brushed Metallic Motorized Fader Cap */}
                    <div
                      className="absolute w-4 h-5 rounded-xs bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 border border-white shadow-md pointer-events-none flex flex-col items-center justify-center"
                      style={{ bottom: `${Math.min(84, Math.max(2, (vol / 1.5) * 82))}%` }}
                    >
                      <div className="w-3 h-[1.5px] bg-slate-900" />
                    </div>
                  </div>
                </div>

                {/* dB Unity Readout */}
                <span className="text-[8px] font-mono font-bold text-slate-300 my-0.5">
                  {formatDb(vol)}
                </span>

                {/* Glowing Mute (M) & Solo (S) Buttons */}
                <div className="flex flex-col space-y-1 w-full my-0.5">
                  <button
                    onClick={() => handleStripMute(idx)}
                    className={`w-full py-0.5 rounded-xs text-[8px] font-mono font-black border transition-all ${
                      isMuted
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_8px_#f59e0b]'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                    title="Mute Channel"
                  >
                    M
                  </button>
                  <button
                    onClick={() => handleStripSolo(idx)}
                    className={`w-full py-0.5 rounded-xs text-[8px] font-mono font-black border transition-all ${
                      isSolo
                        ? 'bg-cyan-400 text-slate-950 border-cyan-200 shadow-[0_0_8px_#22d3ee]'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                    title="Solo Channel"
                  >
                    S
                  </button>
                </div>

                {/* Compact Pan Dial */}
                <div className="my-0.5">
                  <Knob
                    label=""
                    value={pan}
                    defaultValue={0}
                    min={-1}
                    max={1}
                    step={0.05}
                    size="xs"
                    variant="dark"
                    onChange={(v) => handleStripPan(idx, v)}
                  />
                </div>

                {/* Track Label */}
                <span
                  className="text-[8.5px] font-mono font-bold text-slate-300 truncate max-w-full"
                  title={trk?.name || label}
                >
                  {label}
                </span>
              </div>
            );
          })}

          {/* PINNED MASTER CHANNEL STRIP */}
          <div className="w-13 flex-shrink-0 bg-[#0d1118] rounded border border-rose-500/40 p-1.5 flex flex-col items-center justify-between">
            <div className="flex-1 w-full flex items-center justify-center space-x-1 py-1 min-h-[148px]">
              <div className="w-3.5 h-full flex space-x-0.5">
                <MasterLedLadder value={audioEngine.telemetry.peakL} />
                <MasterLedLadder value={audioEngine.telemetry.peakR} />
              </div>
              <div
                onDoubleClick={() => handleMasterFader(0.85)}
                title="Master Bus Fader — Double-click for 0 dB Unity"
                className="relative w-4 h-full bg-[#06080d] rounded-xs border border-slate-800 flex justify-center"
              >
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={masterVol}
                  onChange={(e) => handleMasterFader(parseFloat(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-ns-resize w-full h-full z-10"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <div
                  className="absolute w-4 h-5 rounded-xs bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 border border-rose-200 shadow-md pointer-events-none flex flex-col items-center justify-center"
                  style={{ bottom: `${Math.min(84, Math.max(2, (masterVol / 1.5) * 82))}%` }}
                >
                  <div className="w-3 h-[1.5px] bg-white" />
                </div>
              </div>
            </div>

            <span className="text-[8px] font-mono font-bold text-rose-300 my-0.5">
              {formatDb(masterVol)}
            </span>

            <div className="flex flex-col space-y-1 w-full my-0.5">
              <button
                onClick={() => {
                  const next = !masterMute;
                  setMasterMute(next);
                  audioEngine.masterGain.gain.setTargetAtTime(
                    next ? 0 : masterVol,
                    audioEngine.ctx.currentTime,
                    0.015
                  );
                }}
                className={`w-full py-0.5 rounded-xs text-[8px] font-mono font-black border ${
                  masterMute
                    ? 'bg-red-600 text-white border-red-300'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                M
              </button>
              <button
                onClick={() => handleMasterFader(0.85)}
                className="w-full py-0.5 rounded-xs text-[8px] font-mono font-black bg-emerald-600/30 text-emerald-300 border border-emerald-500/50"
                title="Reset Master to 0 dB Unity"
              >
                0dB
              </button>
            </div>

            <div className="my-0.5">
              <Knob
                label=""
                value={audioEngine.masterSpectrumState.width}
                defaultValue={1.0}
                min={0}
                max={2}
                step={0.05}
                size="xs"
                variant="metal"
                onChange={(v) => {
                  audioEngine.setMasterSpectrumParam('width', v);
                  setTick((t) => t + 1);
                }}
              />
            </div>

            <span className="text-[8.5px] font-mono font-black text-rose-400 uppercase">
              Master
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM HALF: NEON-SPECTRUM FFT AUDIO VISUALIZER WITH LOW/MID/HIGH/WIDTH/MIX KNOBS */}
      <NeonSpectrumMasterVisualizer audioEngine={audioEngine} compact={true} />
    </aside>
  );
};

