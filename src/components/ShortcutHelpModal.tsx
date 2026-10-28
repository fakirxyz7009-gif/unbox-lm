import React from 'react';
import { X, Keyboard, Zap, Music, Sliders, Layers, Cpu, MousePointer2 } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerShortcutAction?: (actionId: string) => void;
}

interface Item {
  key: string;
  label: string;
  /** Global action run when the row is clicked (see App.handleTriggerShortcutAction). */
  action?: string;
}

/** Only keys that the app really handles (App.tsx, SequencerView.tsx, the rack and the keyboards). */
const GROUPS: { title: string; icon: typeof Layers; accent: string; items: Item[] }[] = [
  {
    title: 'Views & windows',
    icon: Layers,
    accent: 'text-cyan-400 border-cyan-500/40',
    items: [
      { key: 'F7 / F1 / Alt+1', label: 'Workstation & Sequencer', action: 'view_sequencer' },
      { key: 'F6 / F3 / Alt+3', label: '3-Column Rack', action: 'view_rack' },
      { key: 'F5 / F2 / Alt+2', label: 'Mixer & Clip Editor', action: 'view_mixer' },
      { key: 'F10 / Alt+Enter', label: 'Clip Editor full screen / split toggle', action: 'toggle_clip_fullscreen' },
      { key: 'F4 / Alt+4', label: 'Rack tab: song editors above the rack', action: 'toggle_split' },
      { key: 'F8', label: 'MIDI tools (quantize, humanize, velocity…)', action: 'toggle_f8' },
      { key: 'Ctrl+K', label: 'Command search' },
      { key: 'Alt+C', label: 'AI Co-Pilot', action: 'toggle_copilot' },
      { key: 'Alt+M', label: 'CV matrix', action: 'toggle_cv_matrix' },
      { key: 'Alt+S', label: 'Audio Stems & Instruments', action: 'open_stems' },
      { key: 'Alt+K', label: 'Show / hide the keyboard dock (Rack, Mixer)', action: 'toggle_keyboard' },
      { key: 'Alt+Q / `', label: 'Pie menu', action: 'open_pie_center' },
      { key: 'F11 / Alt+G', label: 'Stage mode', action: 'toggle_stage_mode' },
      { key: '? / Alt+H', label: 'This help' },
    ],
  },
  {
    title: 'Transport & project',
    icon: Zap,
    accent: 'text-emerald-400 border-emerald-500/40',
    items: [
      { key: 'Space', label: 'Play / stop', action: 'play_stop' },
      { key: 'R', label: 'Back to bar 1 (while KEYS plays notes)', action: 'rewind' },
      { key: 'M', label: 'Metronome on / off', action: 'toggle_metro' },
      { key: '[  /  ]', label: 'Tempo −2 / +2 BPM', action: 'bpm_down' },
      { key: 'Ctrl+S', label: 'Save the project', action: 'save_snapshot' },
      { key: 'Ctrl+E', label: 'Export the song as WAV', action: 'export_wav' },
      { key: 'Ctrl+Shift+E', label: 'Export page (formats, stems, MIDI)', action: 'open_batch_exporter' },
      { key: 'Ctrl+Z / Ctrl+Y', label: 'Undo / redo (note and clip edits)' },
    ],
  },
  {
    title: 'Rack & cables',
    icon: Sliders,
    accent: 'text-orange-300 border-orange-500/40',
    items: [
      { key: 'Tab / Alt+F', label: 'Flip the rack front ↔ rear', action: 'flip_rack' },
      { key: 'Drag', label: 'From a free jack: new cable — green jacks accept it' },
      { key: 'Drag plug', label: 'From a patched jack: move that plug · drop on empty space to unplug' },
      { key: 'Shift+drag', label: 'Extra cable from a patched output' },
      { key: 'Click, click', label: 'Pick a cable up, then click a green jack' },
      { key: 'Enter', label: 'Same as a click on a focused jack' },
      { key: 'Alt+click', label: 'Unplug every cable on a jack' },
      { key: 'Double-click', label: 'Unplug the cable under the pointer' },
      { key: 'Esc', label: 'Cancel — a moved cable goes back' },
      { key: 'K (KEYS off)', label: 'Cables: all → selected unit only → hidden' },
      { key: 'Drag ⋮⋮ grip', label: 'Move a unit or Combiner (also into another column)' },
      { key: 'Alt+click ▾', label: 'Fold / unfold the whole column' },
    ],
  },
  {
    title: 'Song sequencer (KEYS off: letters are commands)',
    icon: MousePointer2,
    accent: 'text-amber-300 border-amber-500/40',
    items: [
      { key: 'Q W E R', label: 'Select · Pencil · Eraser · Razor' },
      { key: 'T Y U', label: 'Mute · Zoom (Alt-click = out) · Hand' },
      { key: 'B', label: 'Block / Song' },
      { key: 'L  /  C', label: 'Loop on / off · Click on / off', action: 'toggle_loop' },
      { key: 'Enter', label: 'Edit Mode: open the selected clip' },
      { key: 'Ctrl+wheel / Alt+wheel', label: 'Zoom time / lane height' },
      { key: 'Del · Ctrl+D · M', label: 'Delete · duplicate · mute the selected clips' },
    ],
  },
  {
    title: 'Song editors (Mixer & Clip Editor tab)',
    icon: Cpu,
    accent: 'text-indigo-400 border-indigo-500/40',
    items: [
      { key: 'Shift+1', label: 'Step sequencer' },
      { key: 'Shift+2', label: 'Piano roll' },
      { key: 'Shift+3', label: 'Arrangement' },
      { key: 'Shift+4', label: 'Graph & CC lanes' },
      { key: 'Shift+5', label: 'Drum editor' },
      { key: 'Shift+6', label: 'Clips & scenes' },
      { key: 'F10', label: 'Clip Editor full screen / split toggle', action: 'toggle_clip_fullscreen' },
      { key: 'Shift+S / Shift+A', label: 'Play the selected track solo / play all' },
      { key: 'Shift+L', label: 'Legato (notes last until the next one)' },
      { key: 'Alt+← / →', label: 'Shorten / lengthen the notes' },
      { key: 'Alt+↑ / ↓', label: 'Transpose ±1 semitone' },
      { key: '−  /  =', label: 'Halve / double the pattern length' },
      { key: 'Ctrl+D', label: 'Generate a pattern for the selected track' },
    ],
  },
  {
    title: 'Piano roll tools',
    icon: Music,
    accent: 'text-cyan-300 border-cyan-500/40',
    items: [
      { key: '1', label: 'Select' },
      { key: '2', label: 'Draw' },
      { key: '3', label: 'Split' },
      { key: '4', label: 'Glue' },
      { key: '5', label: 'Erase' },
      { key: '6', label: 'Mute notes' },
      { key: '7', label: 'Zoom' },
      { key: '8', label: 'Stretch' },
      { key: '9', label: 'Marquee select' },
      { key: 'Q', label: 'Snap the notes to the song scale' },
      { key: 'Ctrl+A / Ctrl+I', label: 'Select all notes / invert the selection' },
      { key: 'Shift+R / Shift+F', label: 'Reverse the selection in time / flip its pitches' },
      { key: 'Ctrl+← / →', label: 'Rotate the selection one grid step, wrapping around the pattern' },
      { key: '↑ / ↓  (Shift = octave)', label: 'Transpose the selection' },
      { key: 'Shift+H / Ctrl+M', label: 'Humanize timing and velocity / mute or unmute the selection' },
      { key: 'Del · Ctrl+D', label: 'Delete · duplicate the selected notes' },
      { key: 'Left toolbar', label: 'Tools and note edits; each button names its shortcut in its tooltip' },
    ],
  },
  {
    title: 'Playing',
    icon: Keyboard,
    accent: 'text-teal-400 border-teal-500/40',
    items: [
      { key: 'A W S E D F T G Y H U J K O L P ;', label: 'Play the selected part (KEYS on, in the transport)' },
      { key: 'Z  /  X', label: 'Octave down / up for the computer keys' },
      { key: 'Click a key', label: 'Lower on the key = harder (velocity)' },
      { key: 'LINK', label: 'Linked parts play along from the keyboard and MIDI' },
      { key: 'MIDI input', label: 'Any connected MIDI keyboard plays the selected part' },
    ],
  },
];

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose, onTriggerShortcutAction }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none" onClick={onClose}>
      <div
        className="w-full max-w-6xl max-h-[90vh] bg-[#080b11] border border-cyan-500/50 rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="px-5 py-3 bg-[#0b1322] border-b border-cyan-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-black tracking-widest text-white uppercase">Keyboard shortcuts</h2>
              <p className="text-[11px] text-slate-400">Keys work anywhere except while typing in a field. Click a row to run it.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-red-950/80 text-slate-300 hover:text-red-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5"
          >
            <span>ESC</span>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-[#06090f]">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title} className="bg-[#0c111d] border border-slate-800/90 rounded-lg p-3">
                <div className={`flex items-center gap-2 pb-2 mb-2.5 border-b ${group.accent}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-black tracking-wider uppercase">{group.title}</span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      onClick={() => item.action && onTriggerShortcutAction?.(item.action)}
                      className={`flex items-center justify-between gap-2 p-1.5 rounded bg-[#070a12] border border-slate-800/80 ${
                        item.action ? 'hover:border-cyan-500/50 hover:bg-cyan-950/20 cursor-pointer' : ''
                      }`}
                    >
                      <span className="text-[11px] text-slate-300 leading-tight">{item.label}</span>
                      <kbd className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-cyan-500/40 text-[11px] font-black whitespace-nowrap">{item.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
