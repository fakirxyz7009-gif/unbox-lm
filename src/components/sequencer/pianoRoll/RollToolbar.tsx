/**
 * Left-hand strip of the piano roll: the drawing tools, then the note edits grouped by purpose.
 * Every edit button names its shortcut in its tooltip. The owner keeps the tool state, so the
 * pattern editor and the note-clip editor both stay in step with the console and the keyboard.
 */
import React from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Crosshair,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Link2,
  ListChecks,
  MoveHorizontal,
  MousePointer2,
  Pencil,
  RotateCcw,
  RotateCw,
  Scissors,
  Shuffle,
  Timer,
  Trash2,
  VolumeX,
  ZoomIn,
} from 'lucide-react';
import type { RollTool } from './PianoRoll.tsx';

export type RollAction =
  | 'selectAll'
  | 'invertSelection'
  | 'reverse'
  | 'flipPitch'
  | 'rotateLeft'
  | 'rotateRight'
  | 'transposeUp'
  | 'transposeDown'
  | 'octaveUp'
  | 'octaveDown'
  | 'double'
  | 'halve'
  | 'legato'
  | 'humanize'
  | 'crescendo'
  | 'splitAtPlayhead'
  | 'toggleMute'
  | 'duplicate'
  | 'delete';

export const TOOLBAR_WIDTH = 40;

type IconComponent = React.ComponentType<{ className?: string }>;

const TOOLS: { id: RollTool; label: string; hint: string; Icon: IconComponent }[] = [
  { id: 'select', label: 'Select', hint: 'Select: click or drag to select notes (Shift adds or removes)', Icon: MousePointer2 },
  { id: 'draw', label: 'Draw', hint: 'Draw: click to add a note, drag to set its length, right-click to erase', Icon: Pencil },
  { id: 'erase', label: 'Erase', hint: 'Erase: click or drag across notes to delete them', Icon: Eraser },
  { id: 'mute', label: 'Mute tool', hint: 'Mute tool: click a note to mute or unmute it', Icon: VolumeX },
  { id: 'split', label: 'Split', hint: 'Split: click a note to cut it at the grid position under the pointer', Icon: Scissors },
  { id: 'glue', label: 'Glue', hint: 'Glue: click a note to join it to the next note of its pitch', Icon: Link2 },
  { id: 'stretch', label: 'Stretch', hint: 'Stretch: drag a note end to change its length', Icon: MoveHorizontal },
  { id: 'zoom', label: 'Zoom', hint: 'Zoom: click to zoom in, Alt-click or right-click to zoom out', Icon: ZoomIn },
];

interface ActionDef {
  id: RollAction;
  label: string;
  hint: string;
  Icon?: IconComponent;
  glyph?: string;
}

const ACTION_GROUPS: ActionDef[][] = [
  [
    { id: 'selectAll', label: 'Select all', hint: 'Select all notes (Ctrl+A)', Icon: ListChecks },
    { id: 'invertSelection', label: 'Invert selection', hint: 'Select the notes that are not selected (Ctrl+I)', glyph: 'INV' },
  ],
  [
    { id: 'reverse', label: 'Reverse', hint: 'Reverse the time order of the selection, the last note first (Shift+R)', Icon: FlipHorizontal2 },
    { id: 'flipPitch', label: 'Flip pitch', hint: 'Mirror the pitches of the selection around its middle (Shift+F)', Icon: FlipVertical2 },
    { id: 'rotateLeft', label: 'Rotate left', hint: 'Move the selection one grid step earlier, wrapping around the pattern (Ctrl+Left)', Icon: RotateCcw },
    { id: 'rotateRight', label: 'Rotate right', hint: 'Move the selection one grid step later, wrapping around the pattern (Ctrl+Right)', Icon: RotateCw },
  ],
  [
    { id: 'transposeUp', label: 'Up one semitone', hint: 'Transpose the selection up one semitone (Up)', Icon: ArrowUp },
    { id: 'transposeDown', label: 'Down one semitone', hint: 'Transpose the selection down one semitone (Down)', Icon: ArrowDown },
    { id: 'octaveUp', label: 'Up one octave', hint: 'Transpose the selection up an octave (Shift+Up)', Icon: ChevronsUp },
    { id: 'octaveDown', label: 'Down one octave', hint: 'Transpose the selection down an octave (Shift+Down)', Icon: ChevronsDown },
  ],
  [
    { id: 'double', label: 'Double length', hint: 'Double the length of the selected notes', glyph: '2x' },
    { id: 'halve', label: 'Halve length', hint: 'Halve the length of the selected notes (not below the grid)', glyph: '1/2' },
    { id: 'legato', label: 'Legato', hint: 'Extend each note up to the next note of its pitch (Shift+L)', Icon: Timer },
  ],
  [
    { id: 'humanize', label: 'Humanize', hint: 'Random timing and velocity for the selection (Shift+H)', Icon: Shuffle },
    { id: 'crescendo', label: 'Crescendo', hint: 'Velocity ramp from soft to loud across the selection in time order', Icon: Activity },
  ],
  [
    { id: 'splitAtPlayhead', label: 'Split at playhead', hint: 'Cut the notes that cross the playhead (or the cursor when stopped)', Icon: Crosshair },
    { id: 'toggleMute', label: 'Mute or unmute', hint: 'Mute or unmute the selection (Ctrl+M)', Icon: Ban },
  ],
  [
    { id: 'duplicate', label: 'Duplicate', hint: 'Copy the selection to its right (Ctrl+D)', Icon: Copy },
    { id: 'delete', label: 'Delete', hint: 'Delete the selection (Delete)', Icon: Trash2 },
  ],
];

const button = (active: boolean) =>
  `flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border font-mono text-[12px] font-bold transition-colors ${
    active
      ? 'border-[#d69b50]/70 bg-[#282016] text-[#ffc87a] shadow-[0_0_6px_rgba(214,155,80,0.35)]'
      : 'border-transparent text-[#c9a46a] hover:bg-[#241c14] hover:text-[#ffe1a8]'
  }`;

const Separator: React.FC = () => <div className="my-1 h-px w-6 flex-shrink-0 bg-[#59452e]" />;

interface Props {
  tool: RollTool;
  onTool: (tool: RollTool) => void;
  onAction: (action: RollAction) => void;
  selectedCount: number;
  snapLabel: string;
}

export const RollToolbar: React.FC<Props> = ({ tool, onTool, onAction, selectedCount, snapLabel }) => (
  <div
    role="toolbar"
    aria-label="Piano roll tools"
    data-testid="piano-roll-toolbar"
    className="flex flex-shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-[#59452e] bg-[#17130f] py-1"
    style={{ width: TOOLBAR_WIDTH }}
  >
    {TOOLS.map(({ id, label, hint, Icon }) => (
      <button
        key={id}
        type="button"
        aria-label={label}
        aria-pressed={tool === id}
        title={hint}
        data-testid={`roll-tool-${id}`}
        onClick={() => onTool(id)}
        className={button(tool === id)}
      >
        <Icon className="h-4 w-4" />
      </button>
    ))}
    {ACTION_GROUPS.map((group, index) => (
      <React.Fragment key={index}>
        <Separator />
        {group.map(({ id, label, hint, Icon, glyph }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            title={hint}
            data-testid={`roll-action-${id}`}
            onClick={() => onAction(id)}
            className={button(false)}
          >
            {Icon ? <Icon className="h-4 w-4" /> : <span>{glyph}</span>}
          </button>
        ))}
      </React.Fragment>
    ))}
    <div className="mt-auto pt-1 text-center font-mono text-[10px] leading-tight text-[#d6b074]" aria-live="polite">
      {selectedCount} sel
      <br />
      {snapLabel}
    </div>
  </div>
);
