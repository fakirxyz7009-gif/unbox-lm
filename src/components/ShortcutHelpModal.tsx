import React from 'react';
import { X, Keyboard, Zap, Music, Sliders, Layers, Cpu, Sparkles } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerShortcutAction?: (actionId: string) => void;
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({
  isOpen,
  onClose,
  onTriggerShortcutAction,
}) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'GLOBAL WORKSPACES & DECK NAVIGATION',
      icon: Layers,
      accent: 'text-cyan-400 border-cyan-500/40',
      items: [
        { key: 'F1 / Alt+1', label: 'Sequencer & Multi-Mode Workstation', action: 'view_sequencer' },
        { key: 'F2 / Alt+2', label: '500-Track Hi-Fi Mixing Console', action: 'view_mixer' },
        { key: 'F3 / Alt+3', label: '19" Modular Hardware DSP Rack', action: 'view_rack' },
        { key: 'F4 / Alt+4', label: 'Parallel Split Dual-Deck View', action: 'toggle_split' },
        { key: 'F8', label: 'Surgical Plugin & Asset Browser Drawer', action: 'toggle_f8' },
        { key: 'TAB', label: 'Flip Hardware Rack (Front Faceplate / Rear Patch Bay)', action: 'flip_rack' },
        { key: 'A', label: 'Open Neural AI Co-Pilot & Patch Architect', action: 'open_ai' },
        { key: 'C', label: 'Open Control Voltage (CV) Modulation Matrix', action: 'open_cv' },
        { key: 'I', label: 'Open Internal Subsystems & 19 Advanced Engines Inspector', action: 'open_inspector' },
        { key: '? / H', label: 'Toggle Global Keyboard Shortcuts Matrix HUD', action: 'close_help' },
      ],
    },
    {
      title: 'MASTER TRANSPORT, CLOCK & RECORDING',
      icon: Zap,
      accent: 'text-emerald-400 border-emerald-500/40',
      items: [
        { key: 'SPACE', label: 'Play / Pause Master Sequencer Transport', action: 'play_pause' },
        { key: 'S', label: 'Stop Transport & Reset Playhead to Bar 01:01:01', action: 'stop' },
        { key: 'R', label: 'Arm / Toggle Master Bus Audio Recording', action: 'record' },
        { key: 'L', label: 'Toggle Pattern & Timeline Loop Region', action: 'loop' },
        { key: 'M', label: 'Toggle High-Precision Quartz Metronome Click', action: 'metronome' },
        { key: '← / →', label: 'Scrub Playhead Backward / Forward (-4 / +4 Steps)', action: 'scrub' },
      ],
    },
    {
      title: 'SEQUENCER 7 SUB-WORKSPACES (SHIFT + 1..7)',
      icon: Cpu,
      accent: 'text-indigo-400 border-indigo-500/40',
      items: [
        { key: 'Shift + 1', label: 'Step Sequencer Grid & Channel Rack', action: 'sub_step_grid' },
        { key: 'Shift + 2', label: 'Precision MIDI Piano Roll & Note Editor', action: 'sub_piano_roll' },
        { key: 'Shift + 3', label: 'Multi-Track Arrangement & Comping Timeline', action: 'sub_arrangement' },
        { key: 'Shift + 4', label: 'Per-Step Graph & MIDI CC Modulation Lanes', action: 'sub_graph' },
        { key: 'Shift + 5', label: 'Sample Waveform, Transient Warp & Vari-Pitch', action: 'sub_sample' },
        { key: 'Shift + 6', label: 'Core Audio Drivers, FFT Analyzer & Native Plugins', action: 'sub_dsp' },
        { key: 'Shift + 7', label: '19 Advanced AI, Vocal, Browser & Outboard Suite', action: 'sub_advanced' },
      ],
    },
    {
      title: 'PIANO ROLL 9 SURGICAL EDITING TOOLS (KEYS 1..9)',
      icon: Music,
      accent: 'text-cyan-300 border-cyan-500/40',
      items: [
        { key: '1', label: 'Pencil / Draw Note & Chord Stamp Tool', action: 'tool_draw' },
        { key: '2', label: 'Selection / Pointer Inspector Tool', action: 'tool_select' },
        { key: '3', label: 'Split / Scissors Note Slicer Tool', action: 'tool_split' },
        { key: '4', label: 'Glue / Join Adjacent Notes Tool', action: 'tool_glue' },
        { key: '5', label: 'Eraser / Delete Step Note Tool', action: 'tool_erase' },
        { key: '6', label: 'Mute / Unmute Individual Step Note Tool', action: 'tool_mute' },
        { key: '7', label: 'Slip / Time-Stretch Note Duration Tool', action: 'tool_stretch' },
        { key: '8', label: 'Zoom Grid Resolution Tool', action: 'tool_zoom' },
        { key: '9', label: 'Marquee Multi-Step Range Selection Tool', action: 'tool_marquee' },
      ],
    },
    {
      title: 'PATTERN GENERATION, NOTE LENGTH & SCALE QUANTIZE',
      icon: Sparkles,
      accent: 'text-purple-400 border-purple-500/40',
      items: [
        { key: 'G', label: 'Generate Techno/Acid/Bass Pattern for Active Instrument', action: 'gen_active' },
        { key: 'Shift + G', label: 'Generate Synchronized Ensemble Across All Instruments', action: 'gen_ensemble' },
        { key: 'Q', label: 'Snap / Quantize Active Track Notes to Global Key Scale', action: 'quantize_scale' },
        { key: '[  /  ]', label: 'Reduce (-1 Step) / Extend (+1 Step) Note Length', action: 'note_len' },
        { key: '=', label: 'Legato Sustain All Notes on Active Track', action: 'note_legato' },
        { key: '-', label: 'Chop Sustained Notes into 16th-Note Techno Gate', action: 'note_chop16' },
      ],
    },
    {
      title: 'LIVE STUDIO KEYBOARD & OCTAVE TRANSPOSE',
      icon: Sliders,
      accent: 'text-teal-400 border-teal-500/40',
      items: [
        { key: 'A S D F G H J K L', label: 'Play White Keys (C4 – E5) on Active Instrument', action: '' },
        { key: 'W E T Y U O P', label: 'Play Black Sharp/Flat Keys on Active Instrument', action: '' },
        { key: 'Z  /  X', label: 'Transpose Live Keyboard Octave Down / Up (C1 – C7)', action: '' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-6xl max-h-[90vh] bg-[#080b11] border border-cyan-500/50 rounded-xl shadow-[0_0_60px_rgba(6,182,212,0.25)] flex flex-col overflow-hidden font-mono">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#0b1322] via-[#0f172a] to-[#081c24] border-b border-cyan-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Keyboard className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black tracking-widest text-white uppercase">
                  UNBOXED // TECHNO HI-FI SHORTCUT &amp; HOTKEY MATRIX
                </h2>
                <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold">
                  ZERO-LATENCY COMMAND ROUTER
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Press any hotkey anywhere in the studio or click a command row below to execute immediately
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-red-950/80 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/50 text-xs font-bold flex items-center space-x-1.5 transition-all"
          >
            <span>ESC</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid of Shortcut Groups */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-[#06090f]">
          {shortcutGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.title}
                className="bg-[#0c111d] border border-slate-800/90 hover:border-cyan-500/40 rounded-lg p-3 flex flex-col justify-between transition-all shadow-lg"
              >
                <div>
                  <div className={`flex items-center space-x-2 pb-2 mb-2.5 border-b ${group.accent}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-[10px] font-black tracking-wider uppercase">{group.title}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div
                        key={item.key}
                        onClick={() => {
                          if (item.action && onTriggerShortcutAction) {
                            onTriggerShortcutAction(item.action);
                          }
                        }}
                        className={`flex items-center justify-between gap-2 p-1.5 rounded bg-[#070a12] border border-slate-800/80 ${
                          item.action
                            ? 'hover:border-cyan-500/50 hover:bg-cyan-950/20 cursor-pointer'
                            : ''
                        } transition-colors`}
                      >
                        <span className="text-[10px] text-slate-300 leading-tight">{item.label}</span>
                        <kbd className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/40 text-[9px] font-black whitespace-nowrap shadow-inner">
                          {item.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#090d16] border-t border-slate-800 flex flex-wrap items-center justify-between text-[10px] text-slate-400">
          <span>
            TIP: Hover over any button in the Transport, Sequencer, Piano Roll, or Mixer to see its assigned <strong className="text-cyan-300">[HOTKEY]</strong> badge.
          </span>
          <span className="text-emerald-400 font-bold">
            64-BIT HI-FI DSP ENGINE &bull; ALL SHORTCUTS ACTIVE
          </span>
        </div>
      </div>
    </div>
  );
};
