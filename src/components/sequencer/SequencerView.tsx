import React, { useState, useRef, useEffect } from 'react';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SequencerTrack, SequencerNote, DeviceType } from '../../audio/types.ts';
import { Knob } from '../Knob.tsx';
import {
  Play,
  Square,
  Sparkles,
  Volume2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Sliders,
  Music,
  Plus,
  Copy,
  FolderSync,
  ListFilter,
  Wand2,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  Eye,
  SlidersHorizontal,
  Compass,
  Repeat,
  RotateCw,
  Hash,
  Gauge,
  Radio,
} from 'lucide-react';

interface SequencerViewProps {
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  onSelectDeviceForRack?: (deviceId: string) => void;
  onNavigateToMixerTrack?: (trackNumber: number) => void;
  onTrackSelect?: (deviceId: string) => void;
}

export const SequencerView: React.FC<SequencerViewProps> = ({
  audioEngine,
  devices,
  tracks,
  onSelectDeviceForRack,
  onNavigateToMixerTrack,
  onTrackSelect,
}) => {
  useEffect(() => {
    console.log('SequencerView: Received tracks prop update', tracks.length);
  }, [tracks]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => tracks[0]?.id || '');
  const [viewMode, setViewMode] = useState<'channel_rack' | 'piano_roll' | 'graph_editor'>('channel_rack');
  const [activeGroup, setActiveGroup] = useState<'All' | 'Drums' | 'Synths' | 'Samplers' | 'World' | 'Automation' | 'FX'>('All');
  const [graphParam, setGraphParam] = useState<'velocity' | 'pitch' | 'pan' | 'cutoff' | 'resonance'>('velocity');
  const [gridSteps, setGridSteps] = useState<number>(audioEngine.patternLength || 16);
  const [globalSwing, setGlobalSwing] = useState<number>(audioEngine.globalSwing || 0);
  const [showGeneratorMenu, setShowGeneratorMenu] = useState<boolean>(false);
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  const activeTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  const activeDevice = activeTrack ? devices.find((d) => d.id === activeTrack.deviceId) : null;
  const currentStep = audioEngine.currentStep;

  // Handle grid steps length change (16 to 512)
  const handleGridStepsChange = (newLen: number) => {
    setGridSteps(newLen);
    audioEngine.setPatternLength(newLen);
  };

  // Handle global swing slider
  const handleGlobalSwingChange = (newSwing: number) => {
    setGlobalSwing(newSwing);
    audioEngine.setGlobalSwing(newSwing);
  };

  // Piano Roll Note Range: C2 (36) to C6 (84)
  const MIN_NOTE = 36;
  const MAX_NOTE = 76;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const getNoteName = (midi: number) => {
    const oct = Math.floor(midi / 12) - 1;
    const name = noteNames[midi % 12];
    return `${name}${oct}`;
  };

  const isBlackKey = (midi: number) => {
    const n = midi % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
  };

  // Step Sequencer Left-Click (Add or Toggle)
  const handleStepClick = (track: SequencerTrack, stepIdx: number) => {
    const curNote = track.steps[stepIdx];
    const dev = devices.find((d) => d.id === track.deviceId);

    if (curNote) {
      audioEngine.setTrackStep(track.id, stepIdx, null);
    } else {
      const defaultPitch = dev?.type === 'redrum' ? 0 : 60; // C4
      audioEngine.setTrackStep(track.id, stepIdx, {
        note: defaultPitch,
        velocity: 0.85,
        length: 1,
      });

      // Audition note immediately
      if (dev) {
        if (dev.type === 'redrum' || dev.type === 'mimic') {
          (dev as any).triggerPad?.(0, 0.9);
        } else if (dev.noteOn) {
          dev.noteOn(defaultPitch, 0.85);
          setTimeout(() => dev.noteOff?.(defaultPitch), 180);
        }
      }
    }
  };

  // Step Sequencer Right-Click (Remove step)
  const handleStepContextMenu = (e: React.MouseEvent, track: SequencerTrack, stepIdx: number) => {
    e.preventDefault();
    audioEngine.setTrackStep(track.id, stepIdx, null);
  };

  // Piano Roll Grid Click
  const handlePianoCellClick = (stepIdx: number, midiNote: number) => {
    if (!activeTrack) return;
    const curNote = activeTrack.steps[stepIdx];
    if (curNote && curNote.note === midiNote) {
      audioEngine.setTrackStep(activeTrack.id, stepIdx, null);
    } else {
      audioEngine.setTrackStep(activeTrack.id, stepIdx, {
        note: midiNote,
        velocity: 0.85,
        length: 1,
      });
      if (activeDevice?.noteOn) {
        activeDevice.noteOn(midiNote, 0.85);
        setTimeout(() => activeDevice.noteOff?.(midiNote), 180);
      }
    }
  };

  // Graph Stalk Value Adjustment
  const handleGraphValueChange = (track: SequencerTrack, stepIdx: number, rawVal: number) => {
    if (!track.graphData) {
      track.graphData = {
        velocity: Array(gridSteps).fill(0.85),
        pitch: Array(gridSteps).fill(0),
        pan: Array(gridSteps).fill(0),
        cutoff: Array(gridSteps).fill(0.8),
        resonance: Array(gridSteps).fill(0.3),
      };
    }
    track.graphData[graphParam][stepIdx] = rawVal;
    // If setting velocity and step has a note, update step velocity
    if (graphParam === 'velocity' && track.steps[stepIdx]) {
      track.steps[stepIdx]!.velocity = rawVal;
    }
    audioEngine['notify']?.();
  };

  // Channel Controls
  const handleVolumeChange = (track: SequencerTrack, val: number) => {
    track.volume = val;
    const dev = devices.find((d) => d.id === track.deviceId);
    if (dev) dev.setParam('volume', val);
    audioEngine['notify']?.();
  };

  const handlePanChange = (track: SequencerTrack, val: number) => {
    track.pan = val;
    const dev = devices.find((d) => d.id === track.deviceId);
    if (dev) dev.setParam('pan', val);
    audioEngine['notify']?.();
  };

  const handleMixerTrackAssign = (track: SequencerTrack, delta: number) => {
    const cur = track.mixerTrack || 1;
    const next = Math.max(0, Math.min(500, cur + delta));
    track.mixerTrack = next;
    audioEngine['notify']?.();
  };

  // Quick-Fill Tools
  const applyQuickFill = (trackId: string, type: 'fill_2' | 'fill_4' | 'fill_8' | 'euclidean_3' | 'random' | 'invert' | 'clear') => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    const len = gridSteps;

    if (type === 'clear') {
      audioEngine.clearTrackSteps(track.id);
      return;
    }

    const defaultPitch = track.deviceId.includes('redrum') ? 0 : 60;
    const newSteps: (SequencerNote | null)[] = Array(len).fill(null);

    for (let s = 0; s < len; s++) {
      if (type === 'fill_2' && s % 2 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 0.85, length: 1 };
      } else if (type === 'fill_4' && s % 4 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 0.95, length: 1 };
      } else if (type === 'fill_8' && s % 8 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 1.0, length: 1 };
      } else if (type === 'euclidean_3') {
        // Standard Tresillo rhythm (steps 0, 3, 6 in 8)
        if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) {
          newSteps[s] = { note: defaultPitch, velocity: 0.9, length: 1 };
        }
      } else if (type === 'random') {
        if (Math.random() > 0.6) {
          newSteps[s] = { note: defaultPitch + Math.floor(Math.random() * 5), velocity: 0.7 + Math.random() * 0.3, length: 1 };
        }
      } else if (type === 'invert') {
        newSteps[s] = track.steps[s] ? null : { note: defaultPitch, velocity: 0.85, length: 1 };
      }
    }

    newSteps.forEach((st, idx) => {
      audioEngine.setTrackStep(track.id, idx, st);
    });
    setActiveMenuTrackId(null);
  };

  // Loop Starters
  const applyLoopStarter = (genre: 'trap' | 'house' | 'synthwave' | 'dnb') => {
    tracks.forEach((t) => audioEngine.clearTrackSteps(t.id));
    const subTrack = tracks.find((t) => t.name.toLowerCase().includes('subtractor') || t.name.toLowerCase().includes('bass'));
    const threeOscTrack = tracks.find((t) => t.name.toLowerCase().includes('3x') || t.name.toLowerCase().includes('synth'));
    const flexTrack = tracks.find((t) => t.name.toLowerCase().includes('flex') || t.name.toLowerCase().includes('pluck'));
    const drumTrack = tracks.find((t) => t.name.toLowerCase().includes('redrum') || t.name.toLowerCase().includes('drum'));

    if (genre === 'house') {
      audioEngine.setBpm(126);
      if (drumTrack) {
        // 4-on-the-floor kick & offbeat hat
        for (let s = 0; s < 16; s++) {
          if (s % 4 === 0) audioEngine.setTrackStep(drumTrack.id, s, { note: 0, velocity: 1.0, length: 1 });
          if (s % 4 === 2) audioEngine.setTrackStep(drumTrack.id, s, { note: 2, velocity: 0.85, length: 1 });
          if (s % 8 === 4) audioEngine.setTrackStep(drumTrack.id, s, { note: 1, velocity: 0.9, length: 1 });
        }
      }
      if (threeOscTrack) {
        // Classic 90s organ chord stab on 2, 6, 10, 14
        [2, 6, 10, 14].forEach((s) => {
          audioEngine.setTrackStep(threeOscTrack.id, s, { note: 60, velocity: 0.88, length: 1 });
        });
      }
      if (subTrack) {
        // Rolling house bassline
        [0, 3, 6, 8, 11, 14].forEach((s, idx) => {
          audioEngine.setTrackStep(subTrack.id, s, { note: idx % 2 === 0 ? 36 : 48, velocity: 0.9, length: 1 });
        });
      }
    } else if (genre === 'trap') {
      audioEngine.setBpm(140);
      if (drumTrack) {
        // 808 Trap kick & snare
        audioEngine.setTrackStep(drumTrack.id, 0, { note: 0, velocity: 1.0, length: 1 });
        audioEngine.setTrackStep(drumTrack.id, 8, { note: 1, velocity: 0.95, length: 1 }); // Snare on 3
        [2, 4, 6, 10, 12, 14].forEach((s) => {
          audioEngine.setTrackStep(drumTrack.id, s, { note: 2, velocity: 0.75, length: 1 });
        });
      }
      if (subTrack) {
        // Heavy 808 glide bass
        audioEngine.setTrackStep(subTrack.id, 0, { note: 36, velocity: 1.0, length: 4 });
        audioEngine.setTrackStep(subTrack.id, 6, { note: 41, velocity: 0.9, length: 2 });
        audioEngine.setTrackStep(subTrack.id, 10, { note: 39, velocity: 0.9, length: 4 });
      }
      if (flexTrack) {
        // Dark bell melody
        [2, 5, 8, 11, 14].forEach((s, idx) => {
          audioEngine.setTrackStep(flexTrack.id, s, { note: 72 + (idx % 3) * 3, velocity: 0.8, length: 1 });
        });
      }
    } else if (genre === 'synthwave') {
      audioEngine.setBpm(118);
      if (drumTrack) {
        for (let s = 0; s < 16; s++) {
          if (s % 4 === 0) audioEngine.setTrackStep(drumTrack.id, s, { note: 0, velocity: 1.0, length: 1 });
          if (s % 8 === 4) audioEngine.setTrackStep(drumTrack.id, s, { note: 1, velocity: 0.95, length: 1 });
          if (s % 2 === 0) audioEngine.setTrackStep(drumTrack.id, s, { note: 2, velocity: 0.7, length: 1 });
        }
      }
      if (subTrack) {
        // 16th note running bassline
        for (let s = 0; s < 16; s++) {
          audioEngine.setTrackStep(subTrack.id, s, { note: s < 8 ? 36 : 41, velocity: s % 2 === 0 ? 0.95 : 0.75, length: 1 });
        }
      }
      if (threeOscTrack) {
        [0, 4, 8, 12].forEach((s, idx) => {
          audioEngine.setTrackStep(threeOscTrack.id, s, { note: 60 + idx * 2, velocity: 0.9, length: 2 });
        });
      }
    } else if (genre === 'dnb') {
      audioEngine.setBpm(174);
      if (drumTrack) {
        // Breakbeat 174 kick & snare
        audioEngine.setTrackStep(drumTrack.id, 0, { note: 0, velocity: 1.0, length: 1 });
        audioEngine.setTrackStep(drumTrack.id, 4, { note: 1, velocity: 0.95, length: 1 });
        audioEngine.setTrackStep(drumTrack.id, 10, { note: 0, velocity: 0.9, length: 1 });
        audioEngine.setTrackStep(drumTrack.id, 12, { note: 1, velocity: 0.95, length: 1 });
      }
      if (subTrack) {
        audioEngine.setTrackStep(subTrack.id, 0, { note: 36, velocity: 0.95, length: 3 });
        audioEngine.setTrackStep(subTrack.id, 6, { note: 38, velocity: 0.9, length: 2 });
        audioEngine.setTrackStep(subTrack.id, 10, { note: 34, velocity: 0.95, length: 4 });
      }
    }
  };

  // Add generator
  const handleAddGenerator = (type: DeviceType) => {
    const dev = audioEngine.createDevice(type);
    audioEngine.getOrCreateTrackForDevice(dev.id);
    setShowGeneratorMenu(false);
  };

  // Filtered tracks
  const filteredTracks = tracks.filter((t) => {
    if (activeGroup === 'All') return true;
    if (activeGroup === 'Drums') return t.group === 'Drums' || t.name.toLowerCase().includes('drum');
    if (activeGroup === 'Synths') return t.group === 'Synths' || t.name.toLowerCase().includes('synth') || t.name.toLowerCase().includes('osc');
    if (activeGroup === 'Samplers') return t.group === 'Samplers' || t.name.toLowerCase().includes('sampler');
    if (activeGroup === 'World') return t.group === 'World' || t.name.toLowerCase().includes('instrument');
    if (activeGroup === 'Automation') return t.group === 'Automation' || t.name.toLowerCase().includes('auto');
    if (activeGroup === 'FX') return t.group === 'FX' || t.name.toLowerCase().includes('fx');
    return true;
  });

  return (
    <div className="flex-1 flex overflow-hidden bg-[#111827] scifi-cyber-grid p-2 md:p-3 select-none">
      {/* LEFT WOODEN BOX CHEEK (Warm Mahogany & Walnut Chassis) */}
      <div className="w-5 sm:w-6 flex-shrink-0 wooden-cheek rounded-l-xl flex flex-col justify-between items-center py-3 border-r border-[#1a0f07] shadow-2xl select-none z-10">
        <div className="brass-screw" title="Solid Timber Box Screw" />
        <span className="text-[7px] font-mono font-black text-cyan-200/50 rotate-90 tracking-widest uppercase pointer-events-none">
          UNBOXED
        </span>
        <div className="brass-screw" title="Solid Timber Box Screw" />
      </div>

      {/* CENTER WORKSPACE CHASSIS */}
      <div className="flex-1 flex flex-col bg-[#1f2937] text-cyan-100 overflow-hidden font-sans border-y-2 border-cyan-500/60 shadow-2xl">
        
        {/* 1. TOP TOOLBAR: PATTERN, GRID LENGTH, SWING, VIEW MODE & GENERATOR HOSTING */}
        <div className="h-14 bg-gradient-to-r from-[#065f46] via-[#1e3a8a] to-[#065f46] border-b border-cyan-600 px-3.5 flex items-center justify-between flex-shrink-0 gap-2">
          
          {/* Left: View Mode Tabs & Status */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 mr-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
              <h2 className="text-xs font-mono font-bold tracking-wider text-neutral-100 uppercase hidden sm:inline">
                CHANNEL RACK &bull; SEQUENCER
              </h2>
            </div>

            {/* Seamless View Mode Toggles: Step Grid | Piano Roll | Graph Editor */}
            <div className="flex items-center bg-[#351a0b]/80 p-0.5 rounded-md border border-amber-800">
              <button
                onClick={() => setViewMode('channel_rack')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all flex items-center space-x-1 ${
                  viewMode === 'channel_rack'
                    ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Channel Rack Step Sequencer Grid (16-512 Steps)"
              >
                <Layers className="w-3 h-3" />
                <span>STEP GRID</span>
              </button>

              <button
                onClick={() => setViewMode('piano_roll')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all flex items-center space-x-1 ${
                  viewMode === 'piano_roll'
                    ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Full Polyphonic Piano Roll Note Editor"
              >
                <Music className="w-3 h-3" />
                <span>PIANO ROLL</span>
              </button>

              <button
                onClick={() => setViewMode('graph_editor')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all flex items-center space-x-1 ${
                  viewMode === 'graph_editor'
                    ? 'bg-[#064e3b] text-emerald-200 border border-emerald-500/70 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Micro-Parameter Graph Editor (Velocity, Pitch, Pan, Filter Cutoff)"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>GRAPH</span>
              </button>
            </div>
          </div>

          {/* Center: Grid Step Length (16-512) & Global Swing */}
          <div className="hidden md:flex items-center space-x-3 bg-black/40 px-3 py-1 rounded-md border border-neutral-800 text-[10px] font-mono">
            {/* Steps selector: 16, 32, 64, 128, 256, 512 */}
            <div className="flex items-center space-x-1">
              <span className="text-neutral-400 font-bold">GRID:</span>
              {[16, 32, 64, 128, 256].map((steps) => (
                <button
                  key={steps}
                  onClick={() => handleGridStepsChange(steps)}
                  className={`px-1.5 py-0.5 rounded transition-all font-bold ${
                    gridSteps === steps
                      ? 'bg-emerald-600 text-white shadow-[0_0_6px_#10b981]'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {steps}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-neutral-800" />

            {/* Global Swing Slider */}
            <div className="flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400 font-bold">SWING:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={globalSwing}
                onChange={(e) => handleGlobalSwingChange(parseFloat(e.target.value))}
                className="w-16 h-1.5 accent-emerald-500 bg-neutral-800 rounded cursor-pointer"
                title={`Global Swing: ${(globalSwing * 100).toFixed(0)}%`}
              />
              <span className="text-emerald-400 font-bold w-7">
                {(globalSwing * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Right: Loop Starters & + Generator Button */}
          <div className="flex items-center space-x-2">
            {/* Quick Loop Starters Dropdown */}
            <div className="hidden lg:flex items-center space-x-1 bg-black/40 p-1 rounded border border-neutral-800 text-[10px] font-mono">
              <span className="text-neutral-400 font-bold px-1 flex items-center">
                <Wand2 className="w-3 h-3 mr-1 text-emerald-400" /> STARTER:
              </span>
              <button
                onClick={() => applyLoopStarter('house')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-300 transition-colors"
              >
                House
              </button>
              <button
                onClick={() => applyLoopStarter('trap')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-300 transition-colors"
              >
                808 Trap
              </button>
              <button
                onClick={() => applyLoopStarter('synthwave')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-300 transition-colors"
              >
                Synthwave
              </button>
              <button
                onClick={() => applyLoopStarter('dnb')}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-300 transition-colors"
              >
                DnB 174
              </button>
            </div>

            {/* + Add Generator / Instrument Hosting Button */}
            <div className="relative">
              <button
                onClick={() => setShowGeneratorMenu(!showGeneratorMenu)}
                className="px-3 py-1.5 rounded bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white text-xs font-mono font-bold flex items-center space-x-1 shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD GENERATOR</span>
              </button>

              {/* Generator Selection Dropdown Menu */}
              {showGeneratorMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-[#141820] border-2 border-emerald-600 rounded-lg shadow-2xl z-50 p-2 font-mono text-xs">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 px-2 pb-1 border-b border-neutral-800 flex justify-between items-center">
                    <span>HOST GENERATOR / SYNTH</span>
                    <span className="text-[9px] text-neutral-400">DSP</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { type: 'three_osc' as DeviceType, name: '3x OSC Power Synth', desc: 'Triple oscillator subtractive synth' },
                      { type: 'sytrus' as DeviceType, name: 'Sytrus FM Synthesizer', desc: 'FM operator & additive harmonics' },
                      { type: 'flex' as DeviceType, name: 'FLEX Advanced Rompler', desc: 'Modern acoustic & preset powerhouse' },
                      { type: 'subtractor' as DeviceType, name: 'Subtractor Analog Synth', desc: 'Dual-osc analog poly synth' },
                      { type: 'redrum' as DeviceType, name: 'Redrum Drum Computer', desc: '8-pad vintage drum machine' },
                      { type: 'mimic' as DeviceType, name: 'Mimic Creative Sampler', desc: 'Multisample & acoustic sampler' },
                      { type: 'automation_clip' as DeviceType, name: 'Automation Clip', desc: 'Parameter modulation envelope' },
                    ].map((gen) => (
                      <button
                        key={gen.type}
                        onClick={() => handleAddGenerator(gen.type)}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-100 transition-colors flex flex-col group"
                      >
                        <span className="font-bold text-white group-hover:text-emerald-300">{gen.name}</span>
                        <span className="text-[9px] text-neutral-400 group-hover:text-emerald-200/70">{gen.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. CHANNEL GROUPING TABS (All | Drums | Synths | Samplers | Automation | FX) */}
        <div className="h-9 bg-[#11141a] border-b border-neutral-800 px-3 flex items-center justify-between text-xs font-mono flex-shrink-0">
          <div className="flex items-center space-x-1">
            <span className="text-neutral-500 font-bold mr-1 text-[10px] flex items-center">
              <ListFilter className="w-3 h-3 mr-1 text-emerald-400" /> GROUP:
            </span>
            {(['All', 'Drums', 'Synths', 'Samplers', 'Automation', 'FX'] as const).map((group) => (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  activeGroup === group
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/70 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-4 text-[10px] text-neutral-400">
            <span>CHANNELS: <strong className="text-emerald-400">{filteredTracks.length}</strong></span>
            <span>PATTERN STEPS: <strong className="text-emerald-400">{gridSteps}</strong></span>
            <span>PLAYHEAD: <strong className="text-amber-400">STEP {currentStep + 1}</strong></span>
          </div>
        </div>

        {/* 3. MAIN WORKSPACE VIEW (Channel Rack, Piano Roll, or Graph Editor) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* VIEW MODE A: CHANNEL RACK INTERACTIVE STEP SEQUENCER GRID */}
          {viewMode === 'channel_rack' && (
            <div className="flex-1 overflow-y-auto overflow-x-auto p-2 space-y-1.5 bg-[#3c2415]">
              {filteredTracks.map((track) => {
                const isSelected = track.id === activeTrack?.id;
                const dev = devices.find((d) => d.id === track.deviceId);

                return (
                  <div
                    key={track.id}
                    className={`flex items-center rounded-lg border transition-all p-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#1e3a8a] via-[#312e81] to-[#1e1b4b] border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                        : 'bg-[#1f2937] hover:bg-[#374151] border-cyan-600/60'
                    }`}
                  >
                    {/* CHANNEL CONTROLS SECTION */}
                    <div className="w-80 flex-shrink-0 flex items-center space-x-2 px-2 border-r border-neutral-800">
                      {/* Mute & Solo Toggles with Dark Green / Emerald Glowing LED */}
                      <div className="flex flex-col space-y-1">
                        <button
                          onClick={() => audioEngine.toggleTrackMute(track.id)}
                          className={`w-5 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center transition-colors ${
                            track.mute
                              ? 'bg-red-950 text-red-400 border border-red-700/60'
                              : 'bg-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                          title="Mute Channel"
                        >
                          M
                        </button>
                        <button
                          onClick={() => audioEngine.toggleTrackSolo(track.id)}
                          className={`w-5 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center transition-colors ${
                            track.solo
                              ? 'bg-emerald-600 text-white shadow-[0_0_8px_#10b981]'
                              : 'bg-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                          title="Solo Channel"
                        >
                          S
                        </button>
                      </div>

                      {/* Channel Volume Dial */}
                      <div className="flex flex-col items-center">
                        <Knob
                          label=""
                          value={track.volume ?? 0.85}
                          min={0}
                          max={1}
                          step={0.02}
                          size="xs"
                          variant="metal"
                          onChange={(v) => handleVolumeChange(track, v)}
                        />
                        <span className="text-[8px] font-mono text-neutral-400 -mt-1">VOL</span>
                      </div>

                      {/* Channel Pan Dial */}
                      <div className="flex flex-col items-center">
                        <Knob
                          label=""
                          value={track.pan ?? 0}
                          min={-1}
                          max={1}
                          step={0.05}
                          size="xs"
                          variant="metal"
                          onChange={(v) => handlePanChange(track, v)}
                        />
                        <span className="text-[8px] font-mono text-neutral-400 -mt-1">PAN</span>
                      </div>

                      {/* Mixer Routing Assignment Spinner (Route to 1..500 or Master) */}
                      <div className="flex flex-col items-center bg-black/60 px-1.5 py-1 rounded border border-neutral-800 text-center">
                        <div className="text-[8px] font-mono text-neutral-500 font-bold uppercase">MIX</div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleMixerTrackAssign(track, -1)}
                            className="text-neutral-400 hover:text-white text-xs px-0.5"
                          >
                            -
                          </button>
                          <span
                            onClick={() => onNavigateToMixerTrack?.(track.mixerTrack || 1)}
                            className="text-xs font-mono font-bold text-emerald-400 cursor-pointer hover:underline"
                            title={`Routed to Mixer Track ${track.mixerTrack || 1}. Click to view in Mixer.`}
                          >
                            {track.mixerTrack === 0 ? 'MST' : `${track.mixerTrack || 1}`}
                          </span>
                          <button
                            onClick={() => handleMixerTrackAssign(track, 1)}
                            className="text-neutral-400 hover:text-white text-xs px-0.5"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Channel Name & Quick Options Button */}
                      <div className="flex-1 min-w-0">
                        <div
                          onClick={() => {
                            setSelectedTrackId(track.id);
                            if (onSelectDeviceForRack && dev) onSelectDeviceForRack(dev.id);
                            if (onTrackSelect && dev) onTrackSelect(dev.id);
                          }}
                          className="flex items-center space-x-1.5 cursor-pointer py-1 px-1.5 rounded hover:bg-neutral-800/80 transition-colors"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs flex-shrink-0"
                            style={{ backgroundColor: track.color || '#10b981' }}
                          />
                          <span className="text-xs font-mono font-bold text-white truncate" title={track.name}>
                            {track.name}
                          </span>
                        </div>
                      </div>

                      {/* Quick Tools & Fill Popover Trigger */}
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenuTrackId(activeMenuTrackId === track.id ? null : track.id)}
                          className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                          title="Channel Fill & Management Tools"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {activeMenuTrackId === track.id && (
                          <div className="absolute left-0 mt-1 w-44 bg-[#141820] border-2 border-emerald-600 rounded-md shadow-2xl z-50 p-1.5 text-[10px] font-mono">
                            <button
                              onClick={() => applyQuickFill(track.id, 'fill_2')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                            >
                              Fill each 2 steps
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'fill_4')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                            >
                              Fill each 4 steps (Beat)
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'fill_8')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                            >
                              Fill each 8 steps
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'euclidean_3')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-emerald-300 font-bold"
                            >
                              Euclidean (Tresillo 3/8)
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'random')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                            >
                              Randomize steps
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'invert')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                            >
                              Invert steps
                            </button>
                            <div className="my-1 border-t border-neutral-800" />
                            <button
                              onClick={() => {
                                audioEngine.cloneTrack(track.id);
                                setActiveMenuTrackId(null);
                              }}
                              className="w-full text-left px-2 py-1 rounded hover:bg-neutral-800 text-cyan-300 flex items-center space-x-1"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Clone Channel</span>
                            </button>
                            <button
                              onClick={() => applyQuickFill(track.id, 'clear')}
                              className="w-full text-left px-2 py-1 rounded hover:bg-red-950 text-red-400 flex items-center space-x-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Clear Steps</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* STEP SEQUENCER GRID (16-to-512 Step Interactive Pattern Grid) */}
                    <div className="flex-1 flex overflow-x-auto py-1 px-2 space-x-1 items-center">
                      {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                        const note = track.steps[stepIdx];
                        const isCurrent = currentStep === stepIdx;
                        const beatIndex = Math.floor(stepIdx / 4);
                        const isEvenBeat = beatIndex % 2 === 0;

                        return (
                          <div
                            key={stepIdx}
                            onClick={() => handleStepClick(track, stepIdx)}
                            onContextMenu={(e) => handleStepContextMenu(e, track, stepIdx)}
                            className={`w-7 sm:w-8 h-8 rounded-xs cursor-pointer flex flex-col items-center justify-center transition-all relative select-none flex-shrink-0 ${
                              note
                                ? 'bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.8)] border border-amber-200 scale-95'
                                : isEvenBeat
                                ? 'bg-[#57351f] hover:bg-[#6e4428] border border-amber-700'
                                : 'bg-[#4a2e1b] hover:bg-[#57351f] border border-amber-800'
                            } ${isCurrent ? 'ring-2 ring-amber-300 z-10' : ''}`}
                            title={`Step ${stepIdx + 1} (Beat ${beatIndex + 1}) - Left-click to place, Right-click to clear`}
                          >
                            {/* Inner LED highlight indicator */}
                            {note && (
                              <div className="w-3 h-1.5 rounded-xs bg-white/90 shadow-sm" />
                            )}
                            {/* Subtle step beat dot marker */}
                            {!note && stepIdx % 4 === 0 && (
                              <div className="w-1 h-1 rounded-full bg-neutral-600/60" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE B: FULL NOTE-EDITING PIANO ROLL */}
          {viewMode === 'piano_roll' && activeTrack && (
            <div className="flex-1 flex overflow-hidden bg-[#0a0c10]">
              {/* Keyboard Keys on Left Side */}
              <div className="w-24 sm:w-28 flex-shrink-0 overflow-y-auto border-r border-neutral-800 bg-[#101319] select-none">
                <div className="py-2 text-center text-[10px] font-mono text-emerald-400 font-bold border-b border-neutral-800">
                  {activeTrack.name.toUpperCase()}
                </div>
                {Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }).map((_, i) => {
                  const midi = MAX_NOTE - i;
                  const isBlack = isBlackKey(midi);
                  return (
                    <div
                      key={midi}
                      onClick={() => {
                        if (activeDevice?.noteOn) {
                          activeDevice.noteOn(midi, 0.9);
                          setTimeout(() => activeDevice.noteOff?.(midi), 200);
                        }
                      }}
                      className={`h-6 px-2 flex items-center justify-between text-[10px] font-mono font-bold cursor-pointer border-b transition-colors ${
                        isBlack
                          ? 'bg-[#181a20] text-neutral-300 hover:bg-[#252830] border-neutral-900'
                          : 'bg-[#e2e8f0] text-slate-900 hover:bg-white border-neutral-300'
                      }`}
                    >
                      <span>{getNoteName(midi)}</span>
                      {midi % 12 === 0 && (
                        <span className="text-[8px] opacity-60">OCT</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Piano Roll Grid Canvas Area */}
              <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#08090c] relative">
                <div className="flex flex-col" style={{ width: gridSteps * 36 }}>
                  {Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }).map((_, i) => {
                    const midi = MAX_NOTE - i;
                    const isBlack = isBlackKey(midi);

                    return (
                      <div
                        key={midi}
                        className={`h-6 flex border-b ${
                          isBlack ? 'bg-[#0f1217] border-neutral-900/60' : 'bg-[#13171e] border-neutral-900/40'
                        }`}
                      >
                        {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                          const note = activeTrack.steps[stepIdx];
                          const hasNote = note && note.note === midi;
                          const isCurrent = currentStep === stepIdx;

                          return (
                            <div
                              key={stepIdx}
                              onClick={() => handlePianoCellClick(stepIdx, midi)}
                              onContextMenu={(e) => handleStepContextMenu(e, activeTrack, stepIdx)}
                              className={`w-9 h-full border-r border-neutral-900 cursor-pointer relative flex items-center justify-center transition-colors ${
                                hasNote
                                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 border border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.8)] z-10'
                                  : 'hover:bg-neutral-800/40'
                              } ${isCurrent ? 'bg-amber-400/10' : ''}`}
                            >
                              {hasNote && (
                                <span className="text-[8px] font-mono font-bold text-white tracking-tighter truncate px-0.5">
                                  {getNoteName(midi)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE C: MICRO-PARAMETER GRAPH EDITOR */}
          {viewMode === 'graph_editor' && activeTrack && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10] p-3">
              {/* Parameter Selection Bar: Velocity, Pitch, Pan, Cutoff, Resonance */}
              <div className="h-10 bg-[#12161f] rounded-t-lg border border-neutral-800 px-3 flex items-center justify-between text-xs font-mono flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="text-neutral-400 font-bold text-[10px]">GRAPH PARAMETER:</span>
                  {(['velocity', 'pitch', 'pan', 'cutoff', 'resonance'] as const).map((param) => (
                    <button
                      key={param}
                      onClick={() => setGraphParam(param)}
                      className={`px-3 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                        graphParam === param
                          ? 'bg-emerald-600 text-white shadow-[0_0_8px_#10b981]'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {param}
                    </button>
                  ))}
                </div>

                <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                  EDITING:
                  <select
                    value={activeTrack.id}
                    onChange={(e) => {
                      const newTrackId = e.target.value;
                      console.log('SequencerView: Dropdown switching to track', newTrackId);
                      setSelectedTrackId(newTrackId);
                      const track = tracks.find(t => t.id === newTrackId);
                      if (track && onTrackSelect) onTrackSelect(track.deviceId);
                    }}
                    className="bg-[#1f2937] text-white font-mono p-1 rounded border border-neutral-600"
                  >
                    {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  &bull; PER-STEP MODULATION
                </div>
              </div>

              {/* Interactive Stalks Canvas Lane */}
              <div className="flex-1 overflow-x-auto bg-[#0d1015] border-x border-b border-neutral-800 rounded-b-lg p-3 flex items-end space-x-1">
                {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                  const stepNote = activeTrack.steps[stepIdx];
                  const hasNote = !!stepNote;
                  const isCurrent = currentStep === stepIdx;

                  const dataArr = activeTrack.graphData?.[graphParam] || [];
                  const defaultVal =
                    graphParam === 'velocity' ? 0.85 :
                    graphParam === 'pitch' ? 0 :
                    graphParam === 'pan' ? 0 : 0.7;

                  const currentVal = dataArr[stepIdx] !== undefined ? dataArr[stepIdx] : defaultVal;
                  // Normalize height percentage (0 to 100%)
                  const normalizedHeight =
                    graphParam === 'pitch' ? ((currentVal + 12) / 24) * 100 :
                    graphParam === 'pan' ? ((currentVal + 1) / 2) * 100 :
                    currentVal * 100;

                  return (
                    <div
                      key={stepIdx}
                      className="flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center group relative cursor-ns-resize"
                      onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const updateVal = (moveEvent: MouseEvent) => {
                          const y = Math.max(0, Math.min(rect.height, rect.bottom - moveEvent.clientY));
                          const ratio = y / rect.height;
                          let computedVal = ratio;
                          if (graphParam === 'pitch') computedVal = Math.round((ratio * 24) - 12);
                          else if (graphParam === 'pan') computedVal = (ratio * 2) - 1;
                          handleGraphValueChange(activeTrack, stepIdx, computedVal);
                        };
                        const onUp = () => {
                          window.removeEventListener('mousemove', updateVal);
                          window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', updateVal);
                        window.addEventListener('mouseup', onUp);
                      }}
                    >
                      {/* Readout label on hover */}
                      <span className="text-[8px] font-mono text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                        {graphParam === 'pitch'
                          ? `${currentVal > 0 ? '+' : ''}${currentVal} st`
                          : `${(currentVal * 100).toFixed(0)}%`}
                      </span>

                      {/* Stalk Track */}
                      <div className="w-2.5 h-full bg-[#151922] rounded-full relative flex items-end justify-center border border-neutral-800">
                        <div
                          className={`w-full rounded-full transition-all ${
                            hasNote
                              ? 'bg-gradient-to-t from-[#065f46] via-[#10b981] to-[#34d399] shadow-[0_0_8px_#10b981]'
                              : 'bg-neutral-700'
                          }`}
                          style={{ height: `${Math.max(4, normalizedHeight)}%` }}
                        />
                        {/* Stalk Head Handle */}
                        <div
                          className="absolute w-4 h-2 rounded bg-white shadow-md border border-neutral-300 pointer-events-none"
                          style={{ bottom: `calc(${normalizedHeight}% - 4px)` }}
                        />
                      </div>

                      {/* Step index label */}
                      <span className={`text-[8px] font-mono mt-1 ${isCurrent ? 'text-amber-400 font-bold' : 'text-neutral-500'}`}>
                        {stepIdx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT WOODEN BOX CHEEK */}
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
