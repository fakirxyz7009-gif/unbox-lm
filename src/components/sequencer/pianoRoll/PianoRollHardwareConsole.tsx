/**
 * PianoRollHardwareConsole — Elite Compact Hardware Console for Piano Roll
 *
 * Designed to maximize audio & note editing workspace:
 * - Fine 1px box borders and compact bezels to give maximum vertical screen space to the Piano Roll
 * - One-click COMPACT / EXPAND toggle:
 *   - Compact mode: ultra-sleek 38px ribbon with all tools, note lengths, audio chop, snap & audition
 *   - Expanded mode: vintage workstation hardware console (105px) with 3rd Wave style LCD, 6 aluminum
 *     knobs with amber halo arcs, note audition, waveform display, and ADSR
 * - Tactile cream push buttons (.us-btn-light) with illuminated amber LEDs
 */
import React, { useReducer, useRef, useState } from 'react';
import {
  PenTool,
  MousePointer,
  Scissors,
  Layers,
  Trash2,
  VolumeX,
  ArrowRight,
  ZoomIn,
  Play,
  Music,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { BaseDevice } from '../../../audio/BaseDevice.ts';
import type { SequencerTrack } from '../../../audio/types.ts';
import { deviceParams, type DeviceParam } from '../../../audio/deviceParams.ts';
import { syncTrackPatterns } from '../../../audio/sequencer/model.ts';
import { useFrame } from '../../../nexa/useEngine.ts';
import { RingKnob } from '../../../ui/skin/RingKnob.tsx';
import { setText } from '../../../ui/skin/dom.ts';
import { gainToDb } from '../../../studio/ui/levels.ts';
import { formatParam as fmt } from '../../../workstation/paramFormat.ts';
import { midiControlChanges } from '../../../workstation/midiControls.ts';
import { LcdAudioClipBox } from '../../../workstation/LcdAudioClipBox.tsx';

export type PianoRollTool =
  | 'select'
  | 'draw'
  | 'split'
  | 'glue'
  | 'erase'
  | 'mute'
  | 'stretch'
  | 'zoom'
  | 'marquee';

export type ChordStampType = 'single' | 'power5' | 'minor' | 'major' | 'sus2' | 'octave';

interface Props {
  audioEngine: AudioEngine;
  activeTrack: SequencerTrack;
  tracks: SequencerTrack[];
  activeDevice: BaseDevice | null | undefined;
  pianoTool: PianoRollTool;
  setPianoTool: (tool: PianoRollTool) => void;
  defaultNoteLength: number;
  setDefaultNoteLength: (len: number) => void;
  /** Every note of the pattern: -1 / +1 step, legato to the next note, chop into 16ths. */
  handleBatchNoteLengthTransform: (action: 'dec' | 'inc' | 'legato' | 'chop16') => void;
  handleAudioAction: (
    action: 'split' | 'chop16' | 'chop8' | 'chop4' | 'chopToKeys'
  ) => Promise<void> | void;
  selectTrack: (id: string) => void;
  auditionDeviceNote: (dev: BaseDevice | null | undefined, note: number, vel?: number) => void;
  defaultRatchet: number;
  setDefaultRatchet: (r: number) => void;
  defaultProbability: number;
  setDefaultProbability: (p: number) => void;
  chordStamp: ChordStampType;
  setChordStamp: (c: ChordStampType) => void;
  handleTransformTrackNotes: (
    action: 'shift_left' | 'shift_right' | 'up_semi' | 'down_semi' | 'up_oct' | 'down_oct'
  ) => void;
  cellWidth: number;
  setCellWidth: React.Dispatch<React.SetStateAction<number>>;
  rowHeight: number;
  setRowHeight: React.Dispatch<React.SetStateAction<number>>;
  gridSnapInterval: 1 | 2 | 3 | 4;
  setGridSnapInterval: (snap: 1 | 2 | 3 | 4) => void;
  magneticGridSnap: boolean;
  setMagneticGridSnap: (snap: boolean) => void;
  showScaleGuides: boolean;
  setShowScaleGuides: (guides: boolean) => void;
  showGhostNotes: boolean;
  setShowGhostNotes: (ghosts: boolean) => void;
  gridSteps: number;
  setForceUpdate: React.Dispatch<React.SetStateAction<number>>;
}

const pick = (params: DeviceParam[], ...res: RegExp[]) => {
  for (const re of res) {
    const hit = params.find((p) => !p.options && re.test(p.key));
    if (hit) return hit;
  }
  return null;
};

function sectionsOf(params: DeviceParam[]): { id: string; label: string; params: DeviceParam[] }[] {
  const useful = params.filter((p) => !/^p\d+/.test(p.key));
  if (useful.some((p) => p.section)) {
    const map = new Map<string, DeviceParam[]>();
    for (const p of useful) {
      const s = p.section ?? 'Main';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(p);
    }
    return [...map].map(([label, ps]) => ({ id: label, label, params: ps }));
  }
  const out: { id: string; label: string; params: DeviceParam[] }[] = [];
  for (let i = 0; i < useful.length; i += 8) {
    out.push({ id: `Page ${i / 8 + 1}`, label: `Page ${i / 8 + 1}`, params: useful.slice(i, i + 8) });
  }
  return out;
}

export const PianoRollHardwareConsole: React.FC<Props> = ({
  audioEngine,
  activeTrack,
  tracks,
  activeDevice,
  pianoTool,
  setPianoTool,
  defaultNoteLength,
  setDefaultNoteLength,
  handleBatchNoteLengthTransform,
  handleAudioAction,
  selectTrack,
  auditionDeviceNote,
  defaultRatchet,
  setDefaultRatchet,
  defaultProbability,
  setDefaultProbability,
  chordStamp,
  setChordStamp,
  handleTransformTrackNotes,
  cellWidth,
  setCellWidth,
  rowHeight,
  setRowHeight,
  gridSnapInterval,
  setGridSnapInterval,
  magneticGridSnap,
  setMagneticGridSnap,
  showScaleGuides,
  setShowScaleGuides,
  showGhostNotes,
  setShowGhostNotes,
  gridSteps,
  setForceUpdate,
}) => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false); // Default compact to give maximum screen room!
  const [activeTab, setActiveTab] = useState<string>('easy');
  const [rightMode, setRightMode] = useState<'clip' | 'adsr'>('clip');
  const [touched, setTouched] = useState<{ label: string; value: string } | null>(null);
  const voicesRef = useRef<HTMLSpanElement>(null);
  const midiSeen = useRef(midiControlChanges.version);

  useFrame(() => {
    const m = (activeDevice as { meter?: () => Record<string, number> } | null)?.meter?.();
    setText(voicesRef.current, String(Math.round(m?.voices ?? 0)).padStart(2, '0'));
    if (midiControlChanges.version !== midiSeen.current) {
      midiSeen.current = midiControlChanges.version;
      setTouched(midiControlChanges.touched);
      force();
    }
  });

  const dev = activeDevice;
  const chan = dev ? audioEngine.mixer.settingsOf(dev.id) : null;
  const params = dev ? deviceParams(dev) : [];
  const sections = sectionsOf(params);
  const pattern = syncTrackPatterns(activeTrack, audioEngine.activePatternIndex);
  const out = chan?.output && chan.output !== 'master' ? audioEngine.devices.get(chan.output)?.name ?? 'Bus' : 'Master';
  const partNo = Math.max(1, tracks.findIndex((p) => p.id === activeTrack.id) + 1);

  const setParam = (p: DeviceParam, v: number) => {
    if (!dev) return;
    dev.setParam(p.key, v);
    setTouched({ label: p.label, value: fmt(p, v) });
    force();
  };

  const knob = (p: DeviceParam | null, label: string, size = 30) =>
    p ? (
      <RingKnob
        key={p.key + label}
        value={p.value}
        min={p.min}
        max={p.max}
        curve={p.curve}
        step={p.step}
        defaultValue={p.defaultValue}
        bipolar={p.min < 0 && p.max > 0}
        label={label}
        size={size}
        tone="metal"
        color="#d69b50"
        format={(v) => fmt(p, v)}
        onChange={(v) => setParam(p, v)}
      />
    ) : (
      <RingKnob
        key={label}
        value={0}
        min={0}
        max={1}
        label={label}
        size={size}
        tone="metal"
        color="#d69b50"
        disabled
        title={`${label}: not on this instrument`}
        onChange={() => undefined}
      />
    );

  const chanKnob = (
    label: string,
    value: number,
    min: number,
    max: number,
    def: number,
    set: (v: number) => void,
    show: (v: number) => string,
    bipolar = false
  ) => (
    <RingKnob
      key={label}
      value={value}
      min={min}
      max={max}
      defaultValue={def}
      bipolar={bipolar}
      label={label}
      size={30}
      tone="metal"
      color="#d69b50"
      format={show}
      onChange={(v) => {
        set(v);
        setTouched({ label, value: show(v) });
        force();
      }}
    />
  );

  const levelKnob = dev
    ? chanKnob(
        'Level',
        chan?.volume ?? 0.85,
        0,
        1.5,
        0.85,
        (v) => audioEngine.mixer.setVolume(dev.id, v),
        (v) => `${gainToDb(v).toFixed(1)}dB`
      )
    : null;

  const panKnob = dev
    ? chanKnob(
        'Pan',
        chan?.pan ?? 0,
        -1,
        1,
        0,
        (v) => audioEngine.mixer.setPan(dev.id, v),
        (v) => (Math.abs(v) < 0.01 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`),
        true
      )
    : null;

  const velKnob = knob(pick(params, /^velSens$/i, /velToFilter/i, /vel/i), 'Vel Sens', 30);

  const availablePages = [
    { id: 'easy', label: 'Easy' },
    { id: 'clip', label: 'Audio Clip' },
    ...sections.map((s) => ({ id: `sec:${s.id}`, label: s.label })),
  ];

  return (
    <div className="us-metal border-b border-[#796d5b]/80 flex flex-col shadow-sm select-none text-[11px] font-mono relative shrink-0">
      
      {/* 1. EXPANDED WORKSTATION CONSOLE DECK (Vintage Cream Chassis, Dark Phosphor LCD, 6 Knobs) */}
      {isExpanded && (
        <div className="flex items-stretch px-2 pt-1.5 pb-1 gap-2 border-b border-[#796d5b]/50">
          {/* Left Phosphor LCD: Device & Part */}
          <div className="w-[34%] min-w-[300px] max-w-[420px] flex flex-col us-bezel rounded-md p-1 shadow-inner">
            <div className="us-lcd flex-1 rounded-sm p-1.5 flex flex-col justify-between overflow-hidden">
              <div>
                <div className="font-lcd text-[18px] tracking-wide leading-tight text-lcd-ink truncate">
                  {dev?.name || activeTrack.name}
                </div>
                <div className="flex items-center justify-between text-lcd-ink font-mono text-[11px] border-b border-[#40352a]/40 pb-0.5 mt-0.5">
                  <span className="us-lcd-inverse px-1 py-0 rounded-xs font-label font-bold text-[11px] tracking-wider">
                    EDIT TARGET
                  </span>
                  <span className="font-bold tracking-wider">
                    PART {String(partNo).padStart(2, '0')}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-lcd-ink/80 mt-0.5 space-y-0.2">
                  <div className="truncate font-semibold">{dev?.name || activeTrack.name} · {params.length} params</div>
                  <div className="text-lcd-ink/75 flex justify-between">
                    <span>1. {pattern.name} ({pattern.length}x1/16)</span>
                    <span>2. OUT: {out}</span>
                  </div>
                </div>
              </div>

              {/* Page tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pt-0.5 mt-0.5 border-t border-[#40352a]/30">
                {availablePages.slice(0, 5).map((pg) => (
                  <button
                    key={pg.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(pg.id);
                      if (pg.id === 'clip') setRightMode('clip');
                    }}
                    className={`px-1.5 py-0.2 rounded text-[11px] font-label font-bold transition-all ${
                      activeTab === pg.id ? 'us-lcd-inverse' : 'us-lcd-box hover:bg-black/10'
                    }`}
                  >
                    {pg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Center 6 Fluted Aluminum Knobs */}
          <div className="flex flex-col items-center justify-between px-1.5 min-w-[190px] shrink-0 border-x border-[#40352a]/20">
            <div className="font-label font-bold text-[11px] uppercase tracking-wider text-ink text-center truncate max-w-full">
              Edit: <span className="font-semibold">{dev?.name || activeTrack.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 my-auto">
              {knob(pick(params, /^cutoff$/i, /cutoff/i, /^tone$/i), 'Cutoff', 28)}
              {knob(pick(params, /^resonance$/i, /^res/i, /reso/i), 'Resonance', 28)}
              {knob(pick(params, /^envAmount$/i, /env.*(amt|amount|depth)/i, /^punch$/i), 'Env', 28)}
              {levelKnob}
              {panKnob}
              {velKnob}
            </div>
            <div className="text-[11px] font-mono text-ink/70 tracking-tight text-center">
              {touched ? `${touched.label}: ${touched.value}` : 'ANALOG MODELLING'}
            </div>
          </div>

          {/* Right Phosphor LCD: Note Audition, Waveform & ADSR */}
          <div className="flex-1 min-w-[300px] flex flex-col us-bezel rounded-md p-1 shadow-inner">
            <div className="us-lcd flex-1 rounded-sm p-1.5 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between w-full mb-0.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRightMode('clip')}
                    className={`font-label font-bold text-[11px] px-1.5 py-0.2 rounded transition-all ${
                      rightMode === 'clip' ? 'us-lcd-inverse' : 'us-lcd-box hover:bg-black/10'
                    }`}
                  >
                    ∼ CLIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightMode('adsr')}
                    className={`font-label font-bold text-[11px] px-1.5 py-0.2 rounded transition-all ${
                      rightMode === 'adsr' ? 'us-lcd-inverse' : 'us-lcd-box hover:bg-black/10'
                    }`}
                  >
                    ⊓ ADSR
                  </button>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-mono">
                  <span className="font-label font-bold">Voices:</span>
                  <div className="us-lcd-box px-1 font-lcd text-[18px] leading-none">
                    <span ref={voicesRef}>00</span>
                  </div>
                </div>
              </div>

              <div className="us-lcd-box flex-1 w-full min-h-0 flex flex-col p-1 overflow-hidden">
                {rightMode === 'clip' ? (
                  <LcdAudioClipBox track={activeTrack} onTouched={setTouched} onForce={force} />
                ) : (
                  <div className="flex-1 flex items-center justify-around px-2 text-[11px]">
                    {['A', 'D', 'S', 'R'].map((label, idx) => (
                      <div key={label} className="flex flex-col items-center">
                        <span className="font-bold">{label}</span>
                        <input type="range" min="0" max="1" step="0.01" defaultValue={0.5} className="h-10 -rotate-90 us-range" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SLIM HIGH-DENSITY HARDWARE TOOLBAR RIBBON (Always Accessible, Only ~34px Height!) */}
      <div className="px-2 py-1 flex flex-wrap items-center justify-between gap-1.5 bg-[#dfd7c7]/80">
        
        {/* Left: Quick Console Toggle + All 9 Piano Roll Tools */}
        <div className="flex items-center space-x-1">
          {/* Toggle Full Hardware Console */}
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className={`px-1.5 py-0.5 rounded-[3px] font-label font-bold text-[11px] flex items-center gap-1 border transition-all ${
              isExpanded
                ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50] shadow-xs'
                : 'us-btn-light text-[#2b241c] border-[#8a7b68]/40 hover:bg-[#ffc87a]'
            }`}
            title={isExpanded ? 'Collapse Console (More room for Piano Roll notes)' : 'Expand Full Workstation LCD & Knobs'}
          >
            {isExpanded ? <ChevronUp className="w-3 h-3 text-[#ffc87a]" /> : <ChevronDown className="w-3 h-3 text-[#8a7b68]" />}
            <span>{isExpanded ? 'CONSOLE ▲' : 'CONSOLE ▼'}</span>
          </button>

          {/* Tools with Shortcut Badges */}
          <div className="flex items-center space-x-0.5 bg-[#d0c7b6] p-0.5 rounded-[4px] border border-[#8a7b68]/30">
            {[
              { id: 'draw', label: 'Draw', hk: 'B', icon: PenTool },
              { id: 'select', label: 'Select', hk: 'V', icon: MousePointer },
              { id: 'split', label: 'Split', hk: 'C', icon: Scissors },
              { id: 'glue', label: 'Glue', hk: 'G', icon: Layers },
              { id: 'erase', label: 'Erase', hk: 'E', icon: Trash2 },
              { id: 'mute', label: 'Mute', hk: '6', icon: VolumeX },
              { id: 'stretch', label: 'Stretch', hk: '8', icon: ArrowRight },
              { id: 'zoom', label: 'Zoom', hk: '7', icon: ZoomIn },
            ].map((tl) => {
              const Icon = tl.icon;
              const isAct = pianoTool === tl.id;
              return (
                <button
                  key={tl.id}
                  onClick={() => setPianoTool(tl.id as PianoRollTool)}
                  className={`px-1.5 py-0.5 rounded-[3px] font-label font-bold text-[11px] flex items-center space-x-1 border transition-all ${
                    isAct
                      ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50] shadow-[0_0_6px_rgba(214,155,80,0.4)]'
                      : 'us-btn-light text-[#2b241c] hover:bg-[#eae4d7] border-[#8a7b68]/40'
                  }`}
                  title={`${tl.label} [Shortcut: ${tl.hk}]`}
                >
                  <Icon className={`w-3 h-3 ${isAct ? 'text-[#ffc87a]' : 'text-[#504030]'}`} />
                  <span className="hidden sm:inline">{tl.label}</span>
                  <span className={`text-[11px] font-mono px-0.5 rounded-xs ${isAct ? 'bg-[#ffc87a] text-black font-black' : 'bg-[#ded7c8] text-[#554737]'}`}>
                    {tl.hk}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Note Length Presets & Direct Articulation Actions */}
        <div className="flex items-center space-x-1">
          <span className="font-label font-bold text-[11px] text-[#40352a]">LEN:</span>
          {[
            { l: 1, label: '1/16' },
            { l: 2, label: '1/8' },
            { l: 4, label: '1/4' },
            { l: 8, label: '1/2' },
            { l: 16, label: '1B' },
          ].map((opt) => (
            <button
              key={opt.l}
              onClick={() => setDefaultNoteLength(opt.l)}
              className={`px-1 py-0.5 rounded-[3px] font-label font-bold text-[11px] border transition-colors ${
                defaultNoteLength === opt.l
                  ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50]'
                  : 'us-btn-light text-[#302519] border-[#8a7b68]/40 hover:bg-[#eee8dc]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Quick Resizing */}
          <div className="flex items-center space-x-0.5 border-l border-[#8a7b68]/30 pl-1">
            <button
              onClick={() => handleBatchNoteLengthTransform('dec')}
              className="px-1 py-0.5 rounded-[3px] us-btn-light text-[#302519] font-bold text-[11px] border border-[#8a7b68]/40 hover:bg-[#ffc87a] hover:text-black"
              title="Reduce note length (-1 Step)"
            >
              -1S
            </button>
            <button
              onClick={() => handleBatchNoteLengthTransform('inc')}
              className="px-1 py-0.5 rounded-[3px] us-btn-light text-[#302519] font-bold text-[11px] border border-[#8a7b68]/40 hover:bg-[#ffc87a] hover:text-black"
              title="Extend note length (+1 Step)"
            >
              +1S
            </button>
            <button
              onClick={() => handleBatchNoteLengthTransform('legato')}
              className="px-1.5 py-0.5 rounded-[3px] bg-[#163238] text-[#c8f5f8] border border-[#2b5860] font-bold text-[11px] hover:bg-[#204952]"
              title="Extend notes to touch next note (Legato)"
            >
              LEGATO
            </button>
            <button
              onClick={() => handleBatchNoteLengthTransform('chop16')}
              className="px-1.5 py-0.5 rounded-[3px] bg-[#433120] text-[#ffc87a] border border-[#795b3b] font-bold text-[11px]"
              title="Chop notes into 16ths"
            >
              CHOP16
            </button>
          </div>

          {/* Audio Chop / Split shortcuts */}
          <div className="flex items-center space-x-0.5 border-l border-[#8a7b68]/30 pl-1">
            <button
              onClick={() => void handleAudioAction('split')}
              className="px-1.5 py-0.5 rounded-[3px] us-btn-light text-[#302519] font-bold text-[11px] border border-[#8a7b68]/40 hover:bg-[#ffc87a] hover:text-black flex items-center gap-0.5"
              title="Split active audio clip"
            >
              <Scissors className="w-2.5 h-2.5 text-[#d69b50]" />
              <span>SPLIT</span>
            </button>
            <button
              onClick={() => void handleAudioAction('chopToKeys')}
              className="px-1.5 py-0.5 rounded-[3px] bg-[#3a2818] text-[#ffd699] border border-[#966533] font-bold text-[11px] flex items-center gap-0.5"
              title="Render this track into 16 audio slices on a new sampler, mapped to MIDI 60–75 (C4–D♯5)"
            >
              <Music className="w-2.5 h-2.5" />
              <span>TO KEYS</span>
            </button>
          </div>
        </div>

        {/* Right: Grid Snap, Scale, Chord Stamp, Quantize & Clear */}
        <div className="flex items-center space-x-1">
          <span className="font-label font-bold text-[11px] text-[#40352a]">SNAP:</span>
          {[
            { g: 1 as const, label: '1/16' },
            { g: 2 as const, label: '1/8' },
            { g: 4 as const, label: '1/4' },
          ].map((item) => (
            <button
              key={item.g}
              onClick={() => {
                setGridSnapInterval(item.g);
                setDefaultNoteLength(item.g);
              }}
              className={`px-1 py-0.5 rounded-[3px] font-bold text-[11px] border transition-colors ${
                gridSnapInterval === item.g
                  ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50]'
                  : 'us-btn-light text-[#302519] border-[#8a7b68]/40'
              }`}
            >
              {item.label}
            </button>
          ))}

          <button
            onClick={() => setMagneticGridSnap(!magneticGridSnap)}
            className={`px-1.5 py-0.5 rounded-[3px] font-bold text-[11px] border ${
              magneticGridSnap
                ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50]'
                : 'us-btn-light text-[#4a3e30] border-[#8a7b68]/40'
            }`}
          >
            MAG: {magneticGridSnap ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowScaleGuides(!showScaleGuides)}
            className={`px-1.5 py-0.5 rounded-[3px] font-bold text-[11px] border ${
              showScaleGuides
                ? 'bg-[#282016] text-[#ffc87a] border-[#d69b50]'
                : 'us-btn-light text-[#4a3e30] border-[#8a7b68]/40'
            }`}
          >
            SCALE
          </button>

          <select
            value={chordStamp}
            onChange={(e) => setChordStamp(e.target.value as ChordStampType)}
            className="bg-[#282016] text-[#ffc87a] font-bold text-[11px] px-1 py-0.5 rounded-[3px] border border-[#d69b50]/60 outline-none"
          >
            <option value="single">Single</option>
            <option value="power5">Power 5th</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="sus2">Sus2</option>
            <option value="octave">Octave</option>
          </select>

          {/* Quick Audition Active Instrument */}
          <button
            type="button"
            onClick={() => auditionDeviceNote(dev, 60, 0.85)}
            className="px-1.5 py-0.5 rounded-[3px] bg-[#282016] hover:bg-[#3d3122] text-[#ffc87a] border border-[#d69b50] font-bold text-[11px] flex items-center gap-0.5"
            title="Audition active track root note (C3)"
          >
            <Play className="w-2.5 h-2.5 text-[#d69b50]" />
            <span>AUD</span>
          </button>

          <button
            onClick={() => {
              audioEngine.autoAlignTrackMidi(activeTrack.id, 100);
              setForceUpdate((x) => x + 1);
            }}
            className="px-1.5 py-0.5 rounded-[3px] bg-[#282016] text-[#ffc87a] border border-[#d69b50] font-bold text-[11px]"
            title="Snap pitches to current song key"
          >
            QUANTIZE
          </button>
        </div>
      </div>
    </div>
  );
};
