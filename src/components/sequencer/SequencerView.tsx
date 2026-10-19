import React, { useState, useEffect } from 'react';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SequencerTrack, SequencerNote, DeviceType, InternalOptionCategory, AdvancedOptionCategory } from '../../audio/types.ts';
import { Knob } from '../Knob.tsx';
import { WorkstationPanels } from './WorkstationPanels.tsx';
import { LiveAndMatrixPanels } from './LiveAndMatrixPanels.tsx';
import { VisualizerThemeProfile } from '../CommandAndStageOverlays.tsx';
import {
  Play,
  Square,
  Trash2,
  Layers,
  Sliders,
  Music,
  Plus,
  Copy,
  ListFilter,
  Wand2,
  ChevronDown,
  SlidersHorizontal,
  Compass,
  Scissors,
  MousePointer,
  PenTool,
  VolumeX,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Cpu,
  Waves,
  Download,
  Radio,
  Sparkles,
  Grid,
  Video,
} from 'lucide-react';

interface SequencerViewProps {
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  activeDeviceId?: string | null;
  externalTabRequest?: { tab: string; seq: number } | null;
  activeVisualizerTheme?: VisualizerThemeProfile;
  onChangeVisualizerTheme?: (theme: VisualizerThemeProfile) => void;
  onOpenStageMode?: () => void;
  onOpenBatchExporter?: () => void;
  onSelectDeviceForRack?: (deviceId: string) => void;
  onNavigateToMixerTrack?: (trackNumber: number) => void;
  onTrackSelect?: (deviceId: string) => void;
  onOpenInternalInspector?: (category: InternalOptionCategory) => void;
  onOpenAdvancedInspector?: (category: AdvancedOptionCategory) => void;
}

export type SequencerTabMode =
  | 'channel_rack'
  | 'piano_roll'
  | 'arrangement'
  | 'graph_editor'
  | 'sample_warp'
  | 'dsp_analyzer'
  | 'advanced_suite'
  | 'loop_tracker'
  | 'routing_mod_matrix'
  | 'video_visualizer';


type PianoRollTool =
  | 'select'
  | 'draw'
  | 'split'
  | 'glue'
  | 'erase'
  | 'mute'
  | 'stretch'
  | 'zoom'
  | 'marquee';

type ChordStampType = 'single' | 'power5' | 'minor' | 'major' | 'sus2' | 'octave';

export const SequencerView: React.FC<SequencerViewProps> = ({
  audioEngine,
  devices,
  tracks,
  activeDeviceId,
  externalTabRequest,
  activeVisualizerTheme = 'Synthwave',
  onChangeVisualizerTheme,
  onOpenStageMode,
  onOpenBatchExporter,
  onSelectDeviceForRack,
  onNavigateToMixerTrack,
  onTrackSelect,
  onOpenInternalInspector,
  onOpenAdvancedInspector,
}) => {
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => {
    if (activeDeviceId) {
      const found = tracks.find((t) => t.deviceId === activeDeviceId);
      if (found) return found.id;
    }
    return tracks[0]?.id || '';
  });

  const [viewMode, setViewMode] = useState<SequencerTabMode>('channel_rack');
  const [showMpeOverlay, setShowMpeOverlay] = useState<boolean>(true);
  const [activeMpeDimension, setActiveMpeDimension] = useState<'mpePitch' | 'mpePressure' | 'mpeSlide'>('mpeSlide');

  useEffect(() => {
    if (externalTabRequest?.tab) {
      setViewMode(externalTabRequest.tab as SequencerTabMode);
    }
  }, [externalTabRequest]);
  const [activeGroup, setActiveGroup] = useState<
    'All' | 'Drums' | 'Synths' | 'Samplers' | 'World' | 'Automation' | 'FX'
  >('All');
  const [graphParam, setGraphParam] = useState<
    'velocity' | 'pitch' | 'pan' | 'cutoff' | 'resonance' | 'cc1' | 'cc74' | 'cc91'
  >('velocity');
  const [gridSteps, setGridSteps] = useState<number>(audioEngine.patternLength || 16);
  const [globalSwing, setGlobalSwing] = useState<number>(audioEngine.globalSwing || 0);
  const [showGeneratorMenu, setShowGeneratorMenu] = useState<boolean>(false);
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  // Piano Roll & Step Grid Surgical Editing + Precision Grid System State
  const [pianoTool, setPianoTool] = useState<PianoRollTool>('draw');
  const [defaultNoteLength, setDefaultNoteLength] = useState<number>(2); // 1, 2, 3, 4, 6, 8, 16 steps
  const [defaultRatchet, setDefaultRatchet] = useState<number>(1); // 1x, 2x, 3x, 4x
  const [defaultProbability, setDefaultProbability] = useState<number>(1.0); // 0.25 .. 1.0
  const [chordStamp, setChordStamp] = useState<ChordStampType>('single');
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [cellWidth, setCellWidth] = useState<number>(38);
  const [rowHeight, setRowHeight] = useState<number>(24);
  const [marqueeRange, setMarqueeRange] = useState<{ start: number; end: number } | null>(null);
  // New Precision Grid System States
  const [gridSnapInterval, setGridSnapInterval] = useState<1 | 2 | 3 | 4>(1);
  const [magneticGridSnap, setMagneticGridSnap] = useState<boolean>(true);
  const [showScaleGuides, setShowScaleGuides] = useState<boolean>(true);
  const [showGhostNotes, setShowGhostNotes] = useState<boolean>(true);
  const [hoveredGridCell, setHoveredGridCell] = useState<{ step: number; midi: number } | null>(null);
  const [patternGenStyle, setPatternGenStyle] = useState<
    'industrial' | 'acid' | 'bass' | 'chords' | 'melody' | 'arp' | 'drums' | 'euclidean' | 'world'
  >('industrial');
  const [, setForceUpdate] = useState(0);

  // Sync selectedTrackId when activeDeviceId changes (e.g. from bottom StudioKeyboard or Rack)
  useEffect(() => {
    if (activeDeviceId) {
      const matchingTrack = tracks.find((t) => t.deviceId === activeDeviceId);
      if (matchingTrack && matchingTrack.id !== selectedTrackId) {
        setSelectedTrackId(matchingTrack.id);
      }
    }
  }, [activeDeviceId, tracks]);

  // Auto-select newly added track when tracks list grows from empty
  useEffect(() => {
    if (tracks.length > 0 && (!selectedTrackId || !tracks.some((t) => t.id === selectedTrackId))) {
      setSelectedTrackId(tracks[tracks.length - 1].id);
    }
  }, [tracks.length]);

  const activeTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  const activeDevice = activeTrack ? devices.find((d) => d.id === activeTrack.deviceId) : null;
  const currentStep = audioEngine.currentStep;

  const selectTrack = (trackId: string) => {
    setSelectedTrackId(trackId);
    const track = tracks.find((t) => t.id === trackId);
    if (track && onTrackSelect) {
      onTrackSelect(track.deviceId);
    }
  };

  // Sequencer & Piano Roll Hotkeys Router
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Shift + 1..7: Switch Sequencer Sub-Views
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (e.code === 'Digit1') {
          e.preventDefault();
          setViewMode('channel_rack');
          return;
        }
        if (e.code === 'Digit2') {
          e.preventDefault();
          setViewMode('piano_roll');
          return;
        }
        if (e.code === 'Digit3') {
          e.preventDefault();
          setViewMode('arrangement');
          return;
        }
        if (e.code === 'Digit4') {
          e.preventDefault();
          setViewMode('graph_editor');
          return;
        }
        if (e.code === 'Digit5') {
          e.preventDefault();
          setViewMode('sample_warp');
          return;
        }
        if (e.code === 'Digit6') {
          e.preventDefault();
          setViewMode('dsp_analyzer');
          return;
        }
        if (e.code === 'Digit7') {
          e.preventDefault();
          setViewMode('advanced_suite');
          return;
        }
        if (e.code === 'Digit8') {
          e.preventDefault();
          setViewMode('loop_tracker');
          return;
        }
        if (e.code === 'Digit9') {
          e.preventDefault();
          setViewMode('routing_mod_matrix');
          return;
        }
        if (e.code === 'Digit0') {
          e.preventDefault();
          setViewMode('video_visualizer');
          return;
        }
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          handleBatchNoteLengthTransform('legato');
          return;
        }
        if (e.key.toLowerCase() === 's' && activeTrack) {
          e.preventDefault();
          audioEngine.playSingleTrackSolo(activeTrack.id);
          return;
        }
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          audioEngine.playAllTracksTogether();
          return;
        }
      }

      // Alt + Arrow keys: Surgical Note Length & Transpose
      if (e.altKey && !e.ctrlKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleBatchNoteLengthTransform('inc');
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleBatchNoteLengthTransform('dec');
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleTransformTrackNotes('up_semi');
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          handleTransformTrackNotes('down_semi');
          return;
        }
      }

      // Ctrl + D: Clone / Double Pattern
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activeTrack) {
          audioEngine.generateInstrumentPattern(activeTrack.id, patternGenStyle);
        }
        return;
      }

      // Piano Roll Surgical Editing Tool Hotkeys (when in piano_roll or with number keys 1-9)
      if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (e.key === '1' || (viewMode === 'piano_roll' && e.key.toLowerCase() === 'v')) {
          setPianoTool('select');
        } else if (e.key === '2' || (viewMode === 'piano_roll' && e.key.toLowerCase() === 'b')) {
          setPianoTool('draw');
        } else if (e.key === '3' || (viewMode === 'piano_roll' && e.key.toLowerCase() === 'c')) {
          setPianoTool('split');
        } else if (e.key === '4' || (viewMode === 'piano_roll' && e.key.toLowerCase() === 'g')) {
          setPianoTool('glue');
        } else if (e.key === '5' || (viewMode === 'piano_roll' && e.key.toLowerCase() === 'e')) {
          setPianoTool('erase');
        } else if (e.key === '6') {
          setPianoTool('mute');
        } else if (e.key === '7') {
          setPianoTool('zoom');
        } else if (e.key === '8') {
          setPianoTool('stretch');
        } else if (e.key === '9') {
          setPianoTool('marquee');
        } else if (e.key === '-') {
          const next = Math.max(16, Math.floor(gridSteps / 2));
          handleGridStepsChange(next);
        } else if (e.key === '=') {
          const next = Math.min(256, gridSteps * 2);
          handleGridStepsChange(next);
        } else if (viewMode === 'piano_roll' && e.key.toLowerCase() === 'q') {
          handleTransformTrackNotes('snap_scale');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, activeTrack, gridSteps, patternGenStyle, selectedStepIdx]);

  const getChordOffsets = (stamp: ChordStampType): number[] => {
    switch (stamp) {
      case 'power5':
        return [7, 12]; // Industrial Power Fifth + Octave
      case 'minor':
        return [3, 7];
      case 'major':
        return [4, 7];
      case 'sus2':
        return [2, 7];
      case 'octave':
        return [12];
      default:
        return [];
    }
  };

  const auditionDeviceNote = (
    dev: BaseDevice | null | undefined,
    midiNote: number,
    velocity: number = 0.88,
    chordNotes?: number[]
  ) => {
    if (!dev) return;
    audioEngine.resumeContext();
    if (dev.noteOn) {
      const now = audioEngine.ctx.currentTime;
      const all = [midiNote, ...(chordNotes || [])];
      all.forEach((n) => {
        dev.noteOn!(n, velocity, now);
        dev.noteOff?.(n, now + 0.22);
      });
    } else if (dev.type === 'redrum' || dev.type === 'mimic') {
      (dev as any).triggerPad?.(((midiNote % 8) + 8) % 8, velocity);
    }
  };

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

  // Piano Roll Note Range: C2 (36) to E5 (76)
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

  // Helper to find if a step on a given pitch is covered by a multi-step note starting earlier
  const findCoveringNote = (
    track: SequencerTrack,
    stepIdx: number,
    midiNote?: number
  ): { startStep: number; note: SequencerNote } | null => {
    for (let s = stepIdx; s >= 0; s--) {
      const n = track.steps[s];
      if (!n) continue;
      const len = Math.max(1, n.length || 1);
      if (s + len > stepIdx) {
        if (midiNote === undefined || n.note === midiNote) {
          return { startStep: s, note: n };
        }
      }
    }
    return null;
  };

  // Change length of a specific note or all notes on active track
  const adjustNoteLengthAtStep = (track: SequencerTrack, startStep: number, newLength: number) => {
    const n = track.steps[startStep];
    if (!n) return;
    const clampedLen = Math.max(1, Math.min(gridSteps - startStep, newLength));
    // Clear any overwritten steps if extending
    for (let s = startStep + 1; s < startStep + clampedLen; s++) {
      if (track.steps[s] && track.steps[s]?.note === n.note) {
        track.steps[s] = null;
      }
    }
    audioEngine.setTrackStep(track.id, startStep, {
      ...n,
      length: clampedLen,
    });
  };

  // Batch extend/reduce note lengths on active track (or selected note)
  const handleBatchNoteLengthTransform = (
    mode: 'inc' | 'dec' | 'double' | 'halve' | 'legato' | 'staccato' | 'chop16'
  ) => {
    if (!activeTrack) return;

    // If a single note is selected and mode is inc/dec/double/halve, apply to selected note or all notes
    if (
      selectedStepIdx !== null &&
      activeTrack.steps[selectedStepIdx] &&
      (mode === 'inc' || mode === 'dec')
    ) {
      const cur = activeTrack.steps[selectedStepIdx]!;
      const nextLen = mode === 'inc' ? (cur.length || 1) + 1 : Math.max(1, (cur.length || 1) - 1);
      adjustNoteLengthAtStep(activeTrack, selectedStepIdx, nextLen);
      return;
    }

    const len = gridSteps;
    const activeIndices: number[] = [];
    for (let s = 0; s < len; s++) {
      if (activeTrack.steps[s]) activeIndices.push(s);
    }

    if (mode === 'legato') {
      for (let i = 0; i < activeIndices.length; i++) {
        const curStep = activeIndices[i];
        const nextStep = i + 1 < activeIndices.length ? activeIndices[i + 1] : len;
        const n = activeTrack.steps[curStep]!;
        activeTrack.steps[curStep] = { ...n, length: Math.max(1, nextStep - curStep) };
      }
    } else if (mode === 'staccato') {
      activeIndices.forEach((s) => {
        const n = activeTrack.steps[s]!;
        activeTrack.steps[s] = { ...n, length: 1 };
      });
    } else if (mode === 'chop16') {
      activeIndices.forEach((s) => {
        const n = activeTrack.steps[s]!;
        const origLen = Math.max(1, n.length || 1);
        for (let k = 0; k < origLen && s + k < len; k++) {
          activeTrack.steps[s + k] = {
            ...n,
            length: 1,
            velocity: k === 0 ? n.velocity : Math.max(0.5, n.velocity * 0.85),
          };
        }
      });
    } else {
      activeIndices.forEach((s) => {
        const n = activeTrack.steps[s]!;
        const curL = Math.max(1, n.length || 1);
        let nextL = curL;
        if (mode === 'inc') nextL = curL + 1;
        else if (mode === 'dec') nextL = Math.max(1, curL - 1);
        else if (mode === 'double') nextL = curL * 2;
        else if (mode === 'halve') nextL = Math.max(1, Math.floor(curL / 2));
        activeTrack.steps[s] = { ...n, length: Math.min(len - s, nextL) };
      });
    }
    audioEngine['notify']?.();
    setForceUpdate((x) => x + 1);
  };

  // Shift or Transpose active track notes
  const handleTransformTrackNotes = (type: 'shift_left' | 'shift_right' | 'up_semi' | 'down_semi' | 'up_oct' | 'down_oct' | 'snap_scale') => {
    if (!activeTrack) return;
    const len = gridSteps;
    if (type === 'shift_left') {
      const first = activeTrack.steps[0];
      for (let i = 0; i < len - 1; i++) activeTrack.steps[i] = activeTrack.steps[i + 1];
      activeTrack.steps[len - 1] = first;
    } else if (type === 'shift_right') {
      const last = activeTrack.steps[len - 1];
      for (let i = len - 1; i > 0; i--) activeTrack.steps[i] = activeTrack.steps[i - 1];
      activeTrack.steps[0] = last;
    } else {
      const delta =
        type === 'up_semi' ? 1 :
        type === 'down_semi' ? -1 :
        type === 'up_oct' ? 12 :
        type === 'down_oct' ? -12 : 0;

      for (let i = 0; i < len; i++) {
        const n = activeTrack.steps[i];
        if (!n) continue;
        const rawPitch = Math.max(24, Math.min(96, n.note + delta));
        const finalPitch = type === 'snap_scale' ? audioEngine.snapMidiToScale(rawPitch) : rawPitch;
        activeTrack.steps[i] = {
          ...n,
          note: finalPitch,
          chordNotes: n.chordNotes?.map((cn) =>
            type === 'snap_scale' ? audioEngine.snapMidiToScale(cn + delta) : cn + delta
          ),
        };
      }
    }
    audioEngine['notify']?.();
    setForceUpdate((x) => x + 1);
  };

  // Step Sequencer Left-Click (Add or Toggle)
  const handleStepClick = (track: SequencerTrack, stepIdx: number) => {
    selectTrack(track.id);
    const curNote = track.steps[stepIdx];
    const dev = devices.find((d) => d.id === track.deviceId);

    if (curNote) {
      audioEngine.setTrackStep(track.id, stepIdx, null);
    } else {
      const defaultPitch = dev?.type === 'redrum' ? 60 : 60 + audioEngine.rootKey;
      const chordOffsets = getChordOffsets(chordStamp);
      const chordNotes =
        chordOffsets.length > 0 && dev?.type !== 'redrum'
          ? chordOffsets.map((o) => defaultPitch + o)
          : undefined;

      audioEngine.setTrackStep(track.id, stepIdx, {
        note: defaultPitch,
        velocity: 0.88,
        length: defaultNoteLength,
        ratchet: defaultRatchet,
        probability: defaultProbability,
        chordNotes,
      });

      auditionDeviceNote(dev, defaultPitch, 0.88, chordNotes);
    }
  };

  // Step Sequencer Right-Click (Remove step)
  const handleStepContextMenu = (e: React.MouseEvent, track: SequencerTrack, stepIdx: number) => {
    e.preventDefault();
    const covering = findCoveringNote(track, stepIdx);
    if (covering) {
      audioEngine.setTrackStep(track.id, covering.startStep, null);
    } else {
      audioEngine.setTrackStep(track.id, stepIdx, null);
    }
  };

  // Piano Roll Multi-Tool Grid Click
  const handlePianoCellClick = (stepIdx: number, midiNote: number) => {
    if (!activeTrack) return;
    const covering = findCoveringNote(activeTrack, stepIdx, midiNote);

    if (pianoTool === 'zoom') {
      setCellWidth((w) => (w >= 64 ? 32 : w + 8));
      setRowHeight((h) => (h >= 32 ? 20 : h + 2));
      return;
    }

    if (pianoTool === 'erase') {
      if (covering) {
        audioEngine.setTrackStep(activeTrack.id, covering.startStep, null);
      } else if (activeTrack.steps[stepIdx]) {
        audioEngine.setTrackStep(activeTrack.id, stepIdx, null);
      }
      return;
    }

    if (pianoTool === 'mute') {
      if (covering) {
        covering.note.muted = !covering.note.muted;
        audioEngine['notify']?.();
        setForceUpdate((x) => x + 1);
      }
      return;
    }

    if (pianoTool === 'split') {
      if (covering && covering.note.length > 1) {
        const splitOffset = stepIdx > covering.startStep ? stepIdx - covering.startStep : Math.floor(covering.note.length / 2);
        const firstLen = Math.max(1, splitOffset);
        const secondLen = Math.max(1, covering.note.length - firstLen);
        audioEngine.setTrackStep(activeTrack.id, covering.startStep, {
          ...covering.note,
          length: firstLen,
        });
        if (covering.startStep + firstLen < gridSteps) {
          audioEngine.setTrackStep(activeTrack.id, covering.startStep + firstLen, {
            ...covering.note,
            length: secondLen,
          });
        }
      }
      return;
    }

    if (pianoTool === 'glue') {
      if (covering) {
        let mergedLen = covering.note.length + defaultNoteLength;
        for (let s = covering.startStep + covering.note.length; s < gridSteps; s++) {
          const nextN = activeTrack.steps[s];
          if (nextN && nextN.note === midiNote) {
            mergedLen = s + (nextN.length || 1) - covering.startStep;
            activeTrack.steps[s] = null;
            break;
          }
        }
        adjustNoteLengthAtStep(activeTrack, covering.startStep, mergedLen);
      }
      return;
    }

    if (pianoTool === 'stretch') {
      if (covering) {
        const nextLen = covering.note.length >= 8 ? 1 : covering.note.length * 2;
        adjustNoteLengthAtStep(activeTrack, covering.startStep, nextLen);
      }
      return;
    }

    if (pianoTool === 'marquee') {
      setMarqueeRange((prev) =>
        !prev ? { start: stepIdx, end: Math.min(gridSteps - 1, stepIdx + 3) } : { start: Math.min(prev.start, stepIdx), end: Math.max(prev.end, stepIdx) }
      );
      return;
    }

    if (pianoTool === 'select') {
      if (covering) {
        setSelectedStepIdx(covering.startStep);
        auditionDeviceNote(activeDevice, covering.note.note, covering.note.velocity, covering.note.chordNotes);
      }
      return;
    }

    // Default 'draw' tool: toggle if clicking head of existing note, or place new note with magnetic grid snap
    const targetStep = magneticGridSnap
      ? Math.min(gridSteps - 1, Math.floor(stepIdx / gridSnapInterval) * gridSnapInterval)
      : stepIdx;

    if (covering && covering.startStep === targetStep) {
      audioEngine.setTrackStep(activeTrack.id, targetStep, null);
      if (selectedStepIdx === targetStep) setSelectedStepIdx(null);
    } else {
      const snappedPitch =
        audioEngine.scaleType !== 'chromatic' ? audioEngine.snapMidiToScale(midiNote) : midiNote;
      const chordOffsets = getChordOffsets(chordStamp);
      const chordNotes =
        chordOffsets.length > 0 && activeDevice?.type !== 'redrum'
          ? chordOffsets.map((o) => snappedPitch + o)
          : undefined;

      audioEngine.setTrackStep(activeTrack.id, targetStep, {
        note: snappedPitch,
        velocity: 0.88,
        length: Math.max(defaultNoteLength, gridSnapInterval),
        ratchet: defaultRatchet,
        probability: defaultProbability,
        chordNotes,
      });
      setSelectedStepIdx(targetStep);
      auditionDeviceNote(activeDevice, snappedPitch, 0.88, chordNotes);
    }
  };

  // Start drag-to-resize note length in Piano Roll
  const handleStartResizeNote = (e: React.MouseEvent, track: SequencerTrack, startStep: number) => {
    e.stopPropagation();
    const origNote = track.steps[startStep];
    if (!origNote) return;
    const startX = e.clientX;
    const startLen = Math.max(1, origNote.length || 1);

    const onMove = (moveEv: MouseEvent) => {
      const deltaSteps = Math.round((moveEv.clientX - startX) / cellWidth);
      const nextLen = Math.max(1, Math.min(gridSteps - startStep, startLen + deltaSteps));
      if (nextLen !== origNote.length) {
        adjustNoteLengthAtStep(track, startStep, nextLen);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
        cc1: Array(gridSteps).fill(0.5),
        cc74: Array(gridSteps).fill(0.75),
        cc91: Array(gridSteps).fill(0.25),
      };
    }
    if (!track.graphData[graphParam]) {
      track.graphData[graphParam] = Array(gridSteps).fill(0.5);
    }
    track.graphData[graphParam]![stepIdx] = rawVal;
    if (graphParam === 'velocity' && track.steps[stepIdx]) {
      track.steps[stepIdx]!.velocity = rawVal;
    }
    audioEngine['notify']?.();
    setForceUpdate((x) => x + 1);
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
  const applyQuickFill = (
    trackId: string,
    type: 'fill_2' | 'fill_4' | 'fill_8' | 'euclidean_3' | 'industrial' | 'acid' | 'random' | 'invert' | 'clear'
  ) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (type === 'clear') {
      audioEngine.clearTrackSteps(track.id);
      setActiveMenuTrackId(null);
      return;
    }
    if (type === 'industrial' || type === 'acid') {
      audioEngine.generateInstrumentPattern(track.id, type);
      setActiveMenuTrackId(null);
      return;
    }

    const len = gridSteps;
    const defaultPitch = track.deviceId.includes('redrum') ? 60 : 60 + audioEngine.rootKey;
    const newSteps: (SequencerNote | null)[] = Array(len).fill(null);

    for (let s = 0; s < len; s++) {
      if (type === 'fill_2' && s % 2 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 0.85, length: defaultNoteLength };
      } else if (type === 'fill_4' && s % 4 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 0.95, length: defaultNoteLength };
      } else if (type === 'fill_8' && s % 8 === 0) {
        newSteps[s] = { note: defaultPitch, velocity: 1.0, length: Math.max(2, defaultNoteLength) };
      } else if (type === 'euclidean_3') {
        if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) {
          newSteps[s] = { note: defaultPitch, velocity: 0.9, length: defaultNoteLength };
        }
      } else if (type === 'random') {
        if (Math.random() > 0.6) {
          newSteps[s] = {
            note: audioEngine.snapMidiToScale(defaultPitch + Math.floor(Math.random() * 8)),
            velocity: 0.7 + Math.random() * 0.3,
            length: Math.random() > 0.5 ? 2 : 1,
          };
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

  // Multi-Track Ensemble Loop Starters
  const applyEnsembleStarter = (genre: 'industrial' | 'trap' | 'house' | 'synthwave' | 'dnb') => {
    tracks.forEach((t, idx) => {
      const lower = t.name.toLowerCase();
      if (lower.includes('redrum') || lower.includes('drum') || lower.includes('dhol') || lower.includes('tabla')) {
        audioEngine.generateInstrumentPattern(t.id, genre === 'industrial' ? 'euclidean' : 'drums');
      } else if (lower.includes('subtractor') || lower.includes('bass') || lower.includes('monotone')) {
        audioEngine.generateInstrumentPattern(t.id, genre === 'industrial' ? 'industrial' : 'bass');
      } else if (lower.includes('3x') || lower.includes('sytrus') || lower.includes('thor')) {
        audioEngine.generateInstrumentPattern(t.id, genre === 'synthwave' ? 'arp' : 'acid');
      } else if (lower.includes('flex') || lower.includes('europa')) {
        audioEngine.generateInstrumentPattern(t.id, 'chords');
      } else {
        audioEngine.generateInstrumentPattern(t.id, idx % 2 === 0 ? 'melody' : 'industrial');
      }
    });
    if (genre === 'industrial') audioEngine.setBpm(132);
    else if (genre === 'house') audioEngine.setBpm(126);
    else if (genre === 'trap') audioEngine.setBpm(140);
    else if (genre === 'synthwave') audioEngine.setBpm(118);
    else if (genre === 'dnb') audioEngine.setBpm(174);
  };

  // Add generator
  const handleAddGenerator = (type: DeviceType, customName?: string) => {
    const dev = audioEngine.createDevice(type, customName);
    const track = audioEngine.getOrCreateTrackForDevice(dev.id);
    if (track) {
      setSelectedTrackId(track.id);
    }
    if (onTrackSelect) {
      onTrackSelect(dev.id);
    }
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

  const selectedNoteObj =
    activeTrack && selectedStepIdx !== null ? activeTrack.steps[selectedStepIdx] : null;

  return (
    <div className="flex-1 flex overflow-hidden bg-[#06090f] scifi-cyber-grid p-1.5 md:p-2.5 select-none">
      {/* LEFT ANODIZED TITANIUM CHEEK */}
      <div className="w-4 sm:w-5 flex-shrink-0 wooden-cheek rounded-l-xl flex flex-col justify-between items-center py-3 border-r border-cyan-500/20 shadow-2xl select-none z-10">
        <div className="brass-screw" title="Anodized Hex Bolt" />
        <span className="text-[7px] font-mono font-black text-cyan-400/60 rotate-90 tracking-widest uppercase pointer-events-none">
          HI-FI DSP
        </span>
        <div className="brass-screw" title="Anodized Hex Bolt" />
      </div>

      {/* CENTER WORKSPACE CHASSIS */}
      <div className="flex-1 flex flex-col bg-[#0a0f1a] text-cyan-100 overflow-hidden font-sans border-y border-cyan-500/40 shadow-2xl">
        {/* 1. TOP MASTER WORKSTATION TOOLBAR: 7 VIEWS, PATTERN BANK, SOLO/TOGETHER PLAYBACK & GENERATOR HOST */}
        <div className="min-h-[50px] bg-gradient-to-r from-[#070b14] via-[#0c1629] to-[#070b14] border-b border-cyan-500/30 px-3 py-1.5 flex flex-wrap items-center justify-between flex-shrink-0 gap-2">
          {/* Left: 7 Workstation View Tabs with Shortcut Badges + Internal Subsystem Inspector Trigger */}
          <div className="flex items-center space-x-1 bg-[#05080f] p-1 rounded-lg border border-cyan-500/30 overflow-x-auto">
            {[
              { id: 'channel_rack', label: 'STEP GRID', hk: '⇧1', icon: Layers, inspectKey: 'step_grid' as InternalOptionCategory },
              { id: 'piano_roll', label: 'PIANO ROLL', hk: '⇧2', icon: Music, inspectKey: 'piano_roll' as InternalOptionCategory },
              { id: 'arrangement', label: 'ARRANGEMENT', hk: '⇧3', icon: Scissors, inspectKey: 'arrangement' as InternalOptionCategory },
              { id: 'graph_editor', label: 'GRAPH & CC', hk: '⇧4', icon: SlidersHorizontal, inspectKey: 'graph_cc' as InternalOptionCategory },
              { id: 'sample_warp', label: 'SAMPLE & WARP', hk: '⇧5', icon: Waves, inspectKey: 'sample_warp' as InternalOptionCategory },
              { id: 'dsp_analyzer', label: 'DSP & ANALYZER', hk: '⇧6', icon: Cpu, inspectKey: 'dsp_analyzer' as InternalOptionCategory },
              { id: 'advanced_suite', label: 'AI & OUTBOARD', hk: '⇧7', icon: Sparkles, inspectKey: 'ai_copilot' as InternalOptionCategory },
              { id: 'loop_tracker', label: 'LOOP & TRACKER', hk: '⇧8', icon: Grid, inspectKey: 'f1_sequencer' as InternalOptionCategory },
              { id: 'routing_mod_matrix', label: '128-CH & MODS', hk: '⇧9', icon: Radio, inspectKey: 'cv_matrix' as InternalOptionCategory },
              { id: 'video_visualizer', label: 'VIDEO & SCOPES', hk: '⇧0', icon: Video, inspectKey: 'unboxed_gold' as InternalOptionCategory },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id as SequencerTabMode)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (tab.id === 'advanced_suite') {
                      onOpenAdvancedInspector?.('neural_stem_sep');
                    } else {
                      onOpenInternalInspector?.(tab.inspectKey);
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all flex items-center space-x-1 flex-shrink-0 ${
                    viewMode === tab.id
                      ? 'bg-cyan-500 text-slate-950 border border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.45)]'
                      : 'text-slate-300 hover:text-cyan-200 hover:bg-slate-800/70'
                  }`}
                  title={`${tab.label} [Shortcut: Shift+${tab.hk.replace('⇧', '')}] | Right-click for Internal Engine Tools`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{tab.label}</span>
                  <span className={`text-[8px] px-1 rounded ${viewMode === tab.id ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-900 text-cyan-400/80 border border-cyan-500/20'}`}>
                    {tab.hk}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => {
                if (viewMode === 'advanced_suite') {
                  onOpenAdvancedInspector?.('neural_stem_sep');
                  return;
                }
                const map: Record<SequencerTabMode, InternalOptionCategory> = {
                  channel_rack: 'step_grid',
                  piano_roll: 'piano_roll',
                  arrangement: 'arrangement',
                  graph_editor: 'graph_cc',
                  sample_warp: 'sample_warp',
                  dsp_analyzer: 'dsp_analyzer',
                  advanced_suite: 'ai_copilot',
                  loop_tracker: 'f1_sequencer',
                  routing_mod_matrix: 'cv_matrix',
                  video_visualizer: 'unboxed_gold',
                };
                onOpenInternalInspector?.(map[viewMode]);
              }}
              className="px-2 py-1 rounded text-[9px] font-mono font-bold bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 flex-shrink-0"
              title="Inspect Internal Tools for the active Sequencer view [Alt+I]"
            >
              SUBSYSTEM TOOLS
            </button>
          </div>

          {/* Center: Pattern Bank (PAT 1..8) + Play Instrument Separately (SOLO) vs Together (ENSEMBLE) */}
          <div className="flex items-center space-x-2 bg-black/50 px-2.5 py-1 rounded border border-neutral-800 text-[10px] font-mono">
            <span className="text-neutral-400 font-bold">PAT:</span>
            <div className="flex items-center space-x-0.5">
              {Array.from({ length: 8 }).map((_, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => {
                    audioEngine.switchPatternBank(pIdx);
                    setForceUpdate((x) => x + 1);
                  }}
                  className={`w-5 h-5 rounded text-[9px] font-bold transition-all ${
                    audioEngine.activePatternIndex === pIdx
                      ? 'bg-amber-500 text-black shadow-[0_0_6px_#f59e0b]'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                  title={`Switch to Pattern Bank ${pIdx + 1}`}
                >
                  {pIdx + 1}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-neutral-700" />

            {/* Play Selected Instrument Separately vs Play All Instruments Together */}
            <button
              onClick={() => activeTrack && audioEngine.playSingleTrackSolo(activeTrack.id)}
              className={`px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition-all ${
                activeTrack?.solo
                  ? 'bg-amber-500 text-black shadow-[0_0_8px_#f59e0b]'
                  : 'bg-neutral-800 hover:bg-amber-600/80 text-amber-300 hover:text-black border border-amber-500/40'
              }`}
              title="Play ONLY the active instrument's pattern separately (Isolated Solo Mode)"
            >
              <Play className="w-3 h-3" />
              <span>PLAY SOLO</span>
            </button>

            <button
              onClick={() => audioEngine.playAllTracksTogether()}
              className={`px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition-all ${
                audioEngine.isPlaying && !tracks.some((t) => t.solo)
                  ? 'bg-emerald-600 text-white shadow-[0_0_8px_#10b981]'
                  : 'bg-neutral-800 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-500/40'
              }`}
              title="Play ALL instruments and patterns together simultaneously (Full Ensemble Mode)"
            >
              <Play className="w-3 h-3" />
              <span>PLAY ALL TOGETHER</span>
            </button>

            {audioEngine.isPlaying && (
              <button
                onClick={() => audioEngine.stopTransport()}
                className="px-2 py-1 rounded bg-red-900/90 hover:bg-red-700 text-white font-bold flex items-center space-x-1"
                title="Stop Playback"
              >
                <Square className="w-3 h-3" />
                <span>STOP</span>
              </button>
            )}
          </div>

          {/* Right: Grid Length (16..256), Swing, Metronome & + Add Generator */}
          <div className="flex items-center space-x-2 text-[10px] font-mono">
            <div className="hidden xl:flex items-center space-x-1 bg-black/40 px-2 py-1 rounded border border-neutral-800">
              <span className="text-neutral-400 font-bold">STEPS:</span>
              {[16, 32, 64, 128, 256].map((steps) => (
                <button
                  key={steps}
                  onClick={() => handleGridStepsChange(steps)}
                  className={`px-1.5 py-0.5 rounded font-bold ${
                    gridSteps === steps
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {steps}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                audioEngine.metronomeEnabled = !audioEngine.metronomeEnabled;
                setForceUpdate((x) => x + 1);
              }}
              className={`px-2 py-1 rounded font-bold border ${
                audioEngine.metronomeEnabled
                  ? 'bg-cyan-700 text-white border-cyan-400'
                  : 'bg-black/40 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
              title="Toggle Studio Metronome Click"
            >
              METRO {audioEngine.metronomeEnabled ? 'ON' : 'OFF'}
            </button>

            {/* + Add Generator / Instrument Hosting Button */}
            <div className="relative">
              <button
                onClick={() => setShowGeneratorMenu(!showGeneratorMenu)}
                className="px-2.5 py-1 rounded bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white text-xs font-mono font-bold flex items-center space-x-1 shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD INSTRUMENT</span>
              </button>

              {showGeneratorMenu && (
                <div className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-[#141820] border-2 border-emerald-600 rounded-lg shadow-2xl z-50 p-2 font-mono text-xs">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 px-2 pb-1 border-b border-neutral-800 flex justify-between items-center">
                    <span>HOST GENERATOR / INSTRUMENT</span>
                    <span className="text-[9px] text-neutral-400">DSP</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { type: 'wyvern' as DeviceType, name: 'Wyvern Synthesizer Module', desc: 'Stock virtual dual-wavetable, FM & comb-resonator dragon synth' },
                      { type: 'ember' as DeviceType, name: 'Ember Synthesizer Module', desc: 'Stock virtual thermal-drift, formant & tube warmth synth' },
                      { type: 'three_osc' as DeviceType, name: '3x OSC Power Synth', desc: 'Triple oscillator subtractive synth' },
                      { type: 'sytrus' as DeviceType, name: 'Sytrus FM Synthesizer', desc: 'FM operator & additive harmonics' },
                      { type: 'flex' as DeviceType, name: 'FLEX Advanced Rompler', desc: 'Modern acoustic & preset powerhouse' },
                      { type: 'subtractor' as DeviceType, name: 'Subtractor Analog Synth', desc: 'Dual-osc analog poly synth' },
                      { type: 'thor' as DeviceType, name: 'Thor Polysonic Synth', desc: 'Semi-modular polysonic synth' },
                      { type: 'europa' as DeviceType, name: 'Europa Wavetable Synth', desc: 'Spectral wavetable synthesizer' },
                      { type: 'monotone' as DeviceType, name: 'Monotone Bass Synth', desc: 'Deep analog sub & acid bass' },
                      { type: 'redrum' as DeviceType, name: 'Redrum Drum Computer', desc: '8-pad vintage drum machine' },
                      { type: 'mimic' as DeviceType, name: 'Mimic Creative Sampler', desc: 'Multisample & acoustic sampler' },
                      { type: 'bansuri' as DeviceType, name: 'Bansuri Bamboo Flute', desc: 'Expressive woodwind flute' },
                      { type: 'harmonium' as DeviceType, name: 'Classical Harmonium', desc: 'Multi-reed acoustic pump organ' },
                      { type: 'tabla' as DeviceType, name: 'Tabla Percussion', desc: 'Tuned Dayan & Bayan drums' },
                      { type: 'dhol' as DeviceType, name: 'Dhol Folk Drum', desc: 'Double-headed punchy folk drum' },
                      { type: 'tumbi' as DeviceType, name: 'Tumbi Folk Resonator', desc: 'High-tension plucked string' },
                      { type: 'tanpura' as DeviceType, name: 'Tanpura & Drone Generator', desc: 'Harmonic overtone drone & string' },
                      { type: 'world_instrument' as DeviceType, customName: 'Royal Sitar', name: 'Royal Sitar (World)', desc: 'Resonant plucked string synth' },
                      { type: 'world_instrument' as DeviceType, customName: 'Solo Violin', name: 'Solo Violin (Strings)', desc: 'Bowed orchestral string' },
                      { type: 'world_instrument' as DeviceType, customName: 'Alto Saxophone', name: 'Alto Saxophone (Brass/Wind)', desc: 'Warm expressive reed horn' },
                      { type: 'percussion_electronic' as DeviceType, customName: 'Concert Grand Piano', name: 'Concert Grand Piano', desc: 'Acoustic & electric keyboard' },
                      { type: 'percussion_electronic' as DeviceType, customName: 'Tropical Steelpan & Marimba', name: 'Steelpan & Marimba', desc: 'Tuned mallet percussion' },
                    ].map((gen, i) => (
                      <button
                        key={`${gen.type}_${i}`}
                        onClick={() => handleAddGenerator(gen.type, (gen as any).customName)}
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

        {/* 2. SECOND BAR: ACTIVE INSTRUMENT SWITCHER, PER-INSTRUMENT PATTERN GENERATOR & SCALE ENGINE */}
        <div className="min-h-[40px] bg-[#11141a] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between text-xs font-mono flex-shrink-0 gap-2">
          {/* Active Instrument Selector (Synced with Piano Roll & Bottom MIDI Keyboard) */}
          <div className="flex items-center space-x-2 bg-neutral-900/90 border border-emerald-500/40 rounded px-2 py-0.5">
            <Music className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-300 font-bold uppercase">INSTRUMENT:</span>
            <select
              value={activeTrack?.id || ''}
              onChange={(e) => selectTrack(e.target.value)}
              className="bg-[#18202c] text-white text-xs font-mono font-bold px-2 py-0.5 rounded border border-emerald-500/60 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => auditionDeviceNote(activeDevice, 60 + audioEngine.rootKey, 0.9)}
              className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold"
              title="Audition Active Instrument"
            >
              AUDITION
            </button>
          </div>

          {/* Per-Instrument Pattern Generator (Generates for Active Instrument OR All Together) */}
          <div className="flex items-center space-x-1.5 bg-neutral-900/90 border border-amber-500/40 rounded px-2 py-0.5">
            <Wand2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-amber-300 font-bold">PATTERN GENERATOR:</span>
            <select
              value={patternGenStyle}
              onChange={(e) => setPatternGenStyle(e.target.value as any)}
              className="bg-[#18202c] text-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-600/50"
            >
              <option value="industrial">Industrial EBM Riff (Multi-Step)</option>
              <option value="acid">Acid 303 Glide Sequence</option>
              <option value="bass">Sustained Sub & Rolling Bass</option>
              <option value="chords">Polyphonic Sustained Chords</option>
              <option value="melody">Expressive Lead / World Phrase</option>
              <option value="arp">16th-Note Arpeggiator</option>
              <option value="drums">Industrial Drum Groove</option>
              <option value="euclidean">Euclidean Polyrhythm (3/8)</option>
            </select>
            <button
              onClick={() => {
                if (!activeTrack) return;
                audioEngine.generateInstrumentPattern(activeTrack.id, patternGenStyle);
              }}
              className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold"
              title="Generate pattern ONLY for the currently selected instrument without erasing other tracks"
            >
              GENERATE FOR {activeTrack?.name.split(' ')[0].toUpperCase() || 'INSTRUMENT'}
            </button>
            <button
              onClick={() => applyEnsembleStarter('industrial')}
              className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold"
              title="Generate synchronized patterns across ALL instruments to play together"
            >
              GENERATE ALL ENSEMBLE
            </button>
          </div>

          {/* Global Key & Scale Snapping Engine */}
          <div className="flex items-center space-x-1.5 bg-neutral-900/90 border border-cyan-500/30 rounded px-2 py-0.5 text-[10px]">
            <span className="text-cyan-300 font-bold">KEY/SCALE:</span>
            <select
              value={audioEngine.rootKey}
              onChange={(e) => {
                audioEngine.rootKey = Number(e.target.value);
                setForceUpdate((x) => x + 1);
              }}
              className="bg-[#18202c] text-white font-bold px-1 py-0.5 rounded border border-neutral-700"
            >
              {noteNames.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={audioEngine.scaleType}
              onChange={(e) => {
                audioEngine.scaleType = e.target.value as any;
                setForceUpdate((x) => x + 1);
              }}
              className="bg-[#18202c] text-cyan-200 font-bold px-1.5 py-0.5 rounded border border-neutral-700"
            >
              <option value="minor">Natural Minor</option>
              <option value="phrygian">Industrial Phrygian</option>
              <option value="harmonic_minor">Harmonic Minor</option>
              <option value="major">Major (Ionian)</option>
              <option value="dorian">Dorian Mode</option>
              <option value="pentatonic">Minor Pentatonic</option>
              <option value="bhairav">Raga Bhairav</option>
              <option value="chromatic">Chromatic (12-Tone)</option>
            </select>
            <button
              onClick={() => handleTransformTrackNotes('snap_scale')}
              className="px-1.5 py-0.5 rounded bg-cyan-800 hover:bg-cyan-700 text-white font-bold"
              title="Quantize all notes on the active instrument to the selected Key & Scale"
            >
              SNAP
            </button>
          </div>
        </div>

        {/* 2.5 SEQUENCER SONG ARRANGEMENT & PATTERN PLAYBACK DETECTOR BODY + MAIN SOUND SCULPTOR */}
        <div className="bg-gradient-to-r from-[#060b14] via-[#0a1426] to-[#060b14] border-b border-cyan-500/40 px-3 py-2 flex flex-col gap-2 flex-shrink-0 font-mono text-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Song & Pattern Playback Detector Engine Status */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-cyan-950/90 border border-cyan-400/50">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    audioEngine.isPlaying
                      ? 'bg-emerald-400 animate-ping shadow-[0_0_8px_#10b981]'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="font-black text-cyan-200 tracking-wider">
                  SEQUENCER SONG &amp; PATTERN PLAYBACK DETECTOR:
                </span>
                <span className={`font-black px-1.5 py-0.2 rounded ${audioEngine.isPlaying ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                  {audioEngine.isPlaying ? 'DETECTING & PLAYING LIVE' : 'STANDBY'}
                </span>
              </div>

              {/* Playback Scope Mode Switcher */}
              <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                {(
                  [
                    { id: 'all', label: 'SONG + PATTERNS (WHOLE)' },
                    { id: 'song', label: 'ARRANGEMENT TIMELINE' },
                    { id: 'pattern', label: 'ACTIVE PATTERN LOOP' },
                  ] as const
                ).map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => {
                      audioEngine.playbackMode = pm.id;
                      setForceUpdate((x) => x + 1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      audioEngine.playbackMode === pm.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              {/* Active Song Bar & Arrangement Section Indicator */}
              <div className="flex items-center space-x-1.5 bg-slate-950/90 px-2.5 py-1 rounded border border-emerald-500/40">
                <span className="text-slate-400">SONG BAR:</span>
                <strong className="text-amber-300">
                  {audioEngine.currentSongBar + 1} / {audioEngine.totalSongBars}
                </strong>
                <span className="text-slate-600">&bull;</span>
                <span className="text-slate-400">STEP:</span>
                <strong className="text-cyan-300">
                  {currentStep + 1} / {gridSteps}
                </strong>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-300 font-bold">{audioEngine.activeArrangementSection}</span>
              </div>
            </div>

            {/* Right: 16-Bar Song Timeline Mini-Scrubber & Live Detected Note Readout */}
            <div className="flex items-center space-x-1.5 flex-wrap">
              <div className="flex items-center space-x-0.5 bg-slate-950 p-1 rounded border border-slate-800">
                <span className="text-[8px] text-slate-400 mr-1 font-bold">BARS:</span>
                {Array.from({ length: 16 }).map((_, bIdx) => {
                  const isCurBar = audioEngine.currentSongBar === bIdx;
                  const hasClipAtBar = tracks.some((t) =>
                    t.arrangementClips?.some(
                      (c) => !c.muted && bIdx >= c.startBar && bIdx < c.startBar + c.lengthBars
                    )
                  );
                  return (
                    <button
                      key={bIdx}
                      onClick={() => {
                        audioEngine.jumpToSongBar(bIdx);
                        setForceUpdate((x) => x + 1);
                      }}
                      className={`w-4 h-4 rounded-xs text-[8px] font-bold transition-all ${
                        isCurBar
                          ? 'bg-amber-400 text-slate-950 shadow-[0_0_6px_#f59e0b] scale-110'
                          : hasClipAtBar
                          ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-700'
                          : 'bg-slate-900 text-slate-500 hover:text-white'
                      }`}
                      title={`Jump Song Arrangement to Bar ${bIdx + 1}`}
                    >
                      {bIdx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row B: Live Detected Note & Pattern Stream + Main Sequencer Sound Editing Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            {/* Live Detected Events Feed */}
            <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 max-w-full">
              <span className="text-[9px] font-black text-emerald-400 uppercase flex-shrink-0">
                LIVE DETECTED STREAM:
              </span>
              {audioEngine.detectedEvents.length === 0 ? (
                <span className="text-slate-400 italic">
                  {tracks.length === 0
                    ? 'No instruments added yet — manually add an instrument from [+ ADD INSTRUMENT] or the Rack to begin sequencing.'
                    : 'Click [PLAY ALL TOGETHER] or press [SPACE] to detect & play active patterns and song arrangements.'}
                </span>
              ) : (
                audioEngine.detectedEvents.slice(0, 5).map((ev) => (
                  <div
                    key={ev.id}
                    className="px-2 py-0.5 rounded bg-slate-900/95 border border-cyan-500/30 flex items-center space-x-1.5 flex-shrink-0"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ev.color }} />
                    <span className="font-bold text-white">{ev.trackName}</span>
                    <span className="text-cyan-300 font-black">{ev.noteName}</span>
                    <span className="text-slate-400">({ev.freqHz}Hz)</span>
                    <span className="text-amber-300">
                      B{ev.bar}:S{ev.step}
                    </span>
                    <span className="text-[8px] px-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      {ev.clipName}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Main Sequencer Sound Editing & Synthesis Controls for Active Instrument */}
            {activeDevice && activeTrack && (
              <div className="flex items-center space-x-2 bg-slate-950/90 px-2.5 py-1 rounded border border-cyan-500/30 flex-shrink-0">
                <span className="text-[9px] font-black text-cyan-300 uppercase">
                  MAIN SOUND EDITOR ({activeTrack.name}):
                </span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[8px] text-slate-400">TONE/CUT:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.02"
                    defaultValue={0.78}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      activeDevice.setParam('cutoff', audioEngine.normalizeCutoffToHz(val));
                      activeDevice.setParam('skinTension', 0.4 + val);
                      activeDevice.setParam('brilliance', val);
                      setForceUpdate((x) => x + 1);
                    }}
                    className="w-14 h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
                    title="Adjust Instrument Filter Cutoff / Skin Tension / Brilliance directly from Sequencer"
                  />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[8px] text-slate-400">RES/SUB:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.02"
                    defaultValue={0.65}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      activeDevice.setParam('resonance', val * 10);
                      activeDevice.setParam('bayanResonance', 0.3 + val);
                      setForceUpdate((x) => x + 1);
                    }}
                    className="w-14 h-1.5 accent-emerald-400 bg-slate-800 rounded cursor-pointer"
                    title="Adjust Resonance / Bayan Sub Depth directly from Sequencer"
                  />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[8px] text-slate-400">DECAY:</span>
                  <input
                    type="range"
                    min="0.08"
                    max="1.5"
                    step="0.05"
                    defaultValue={0.45}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      activeDevice.setParam('decay', val);
                      activeDevice.setParam('release', val);
                      setForceUpdate((x) => x + 1);
                    }}
                    className="w-14 h-1.5 accent-amber-400 bg-slate-800 rounded cursor-pointer"
                    title="Adjust Envelope Decay / Release directly from Sequencer"
                  />
                </div>
                {activeDevice.type === 'tabla' && (
                  <div className="flex items-center space-x-1 pl-1 border-l border-slate-800">
                    {[
                      { b: 'NA', m: 60 },
                      { b: 'TIN', m: 62 },
                      { b: 'TUN', m: 64 },
                      { b: 'GE', m: 48 },
                      { b: 'DHA', m: 65 },
                    ].map((bol) => (
                      <button
                        key={bol.b}
                        onClick={() => auditionDeviceNote(activeDevice, bol.m, 0.95)}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-black text-[8px]"
                        title={`Audition Tabla ${bol.b} Bol`}
                      >
                        {bol.b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. MAIN WORKSPACE VIEW */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* VIEW MODE A: CHANNEL RACK INTERACTIVE STEP SEQUENCER GRID */}
          {viewMode === 'channel_rack' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Group filter bar */}
              <div className="h-8 bg-[#0e1117] border-b border-neutral-800 px-3 flex items-center justify-between text-[10px] font-mono flex-shrink-0">
                <div className="flex items-center space-x-1">
                  <span className="text-neutral-500 font-bold mr-1 flex items-center">
                    <ListFilter className="w-3 h-3 mr-1 text-emerald-400" /> GROUP:
                  </span>
                  {(['All', 'Drums', 'Synths', 'Samplers', 'World', 'Automation', 'FX'] as const).map((group) => (
                    <button
                      key={group}
                      onClick={() => setActiveGroup(group)}
                      className={`px-2 py-0.5 rounded font-bold transition-all ${
                        activeGroup === group
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/70'
                          : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      {group}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-3 text-neutral-400">
                  <div className="flex items-center space-x-1">
                    <Compass className="w-3 h-3 text-emerald-400" />
                    <span>SWING:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={globalSwing}
                      onChange={(e) => handleGlobalSwingChange(parseFloat(e.target.value))}
                      className="w-16 h-1.5 accent-emerald-500 bg-neutral-800 rounded cursor-pointer"
                    />
                    <span className="text-emerald-400 font-bold">{(globalSwing * 100).toFixed(0)}%</span>
                  </div>
                  <span>PLAYHEAD: <strong className="text-amber-400">STEP {currentStep + 1}</strong></span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-auto p-2 space-y-1.5 bg-[#090d16]">
                {tracks.length === 0 && (
                  <div className="my-4 max-w-4xl mx-auto p-5 rounded-xl bg-gradient-to-br from-[#0c1424] via-[#0f1b30] to-[#080d18] border-2 border-dashed border-cyan-500/50 shadow-2xl text-center space-y-4 font-mono">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-black">
                      <Sparkles className="w-4 h-4" />
                      <span>MANUAL STUDIO UNBOXING // EMPTY SESSION CRATE</span>
                    </div>
                    <h3 className="text-sm md:text-base font-black text-white tracking-wide">
                      NO INSTRUMENTS MOUNTED YET &mdash; ADD YOUR FIRST INSTRUMENT OR DEVICE MANUALLY
                    </h3>
                    <p className="text-xs text-slate-300 max-w-2xl mx-auto">
                      Every instrument or device you mount here or in the <strong className="text-cyan-300">Modular Rack [F3]</strong> is automatically synchronized across the <strong className="text-emerald-300">Sequencer Step Grid</strong>, <strong className="text-amber-300">Piano Roll</strong>, <strong className="text-cyan-300">Arrangement Timeline</strong>, and <strong className="text-purple-300">500-Track Mixer [F2]</strong>.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {[
                        { type: 'tabla' as DeviceType, label: '+ Tabla (Dayan & Bayan)', color: 'bg-amber-500 hover:bg-amber-400 text-slate-950' },
                        { type: 'dhol' as DeviceType, label: '+ Dhol Folk Drum', color: 'bg-orange-500 hover:bg-orange-400 text-slate-950' },
                        { type: 'subtractor' as DeviceType, label: '+ Subtractor Analog Synth', color: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950' },
                        { type: 'europa' as DeviceType, label: '+ Europa Wavetable Synth', color: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' },
                        { type: 'wyvern' as DeviceType, label: '+ Wyvern Dragon Synth', color: 'bg-sky-500 hover:bg-sky-400 text-slate-950' },
                        { type: 'redrum' as DeviceType, label: '+ Redrum Drum Computer', color: 'bg-rose-500 hover:bg-rose-400 text-white' },
                        { type: 'bansuri' as DeviceType, label: '+ Bansuri Bamboo Flute', color: 'bg-teal-500 hover:bg-teal-400 text-slate-950' },
                        { type: 'harmonium' as DeviceType, label: '+ Classical Harmonium', color: 'bg-pink-500 hover:bg-pink-400 text-white' },
                      ].map((btn) => (
                        <button
                          key={btn.type}
                          onClick={() => handleAddGenerator(btn.type)}
                          className={`px-3 py-1.5 rounded-lg font-black text-xs shadow-lg transition-all ${btn.color}`}
                        >
                          {btn.label}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          audioEngine.unboxStarterEnsemble();
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg"
                      >
                        UNBOX FULL STARTER ENSEMBLE (5 DEVICES)
                      </button>
                    </div>
                  </div>
                )}
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
                      <div className="w-88 flex-shrink-0 flex items-center space-x-2 px-2 border-r border-neutral-800">
                        {/* Mute & Solo Toggles */}
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
                            title="Solo Channel (Play Separately)"
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

                        {/* Mixer Routing Assignment Spinner */}
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

                        {/* Channel Name & Quick Action Buttons */}
                        <div className="flex-1 min-w-0 flex items-center space-x-1">
                          <div
                            onClick={() => {
                              selectTrack(track.id);
                              auditionDeviceNote(dev, dev?.type === 'redrum' ? 60 : 60 + audioEngine.rootKey, 0.85);
                            }}
                            onDoubleClick={() => {
                              selectTrack(track.id);
                              setViewMode('piano_roll');
                            }}
                            className={`flex-1 min-w-0 flex items-center space-x-1.5 cursor-pointer py-1 px-1.5 rounded transition-colors ${
                              isSelected ? 'bg-cyan-500/20 border border-cyan-400/50' : 'hover:bg-neutral-800/80'
                            }`}
                            title="Click to select instrument for Piano Roll & MIDI Keyboard"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-xs flex-shrink-0"
                              style={{ backgroundColor: track.color || '#10b981' }}
                            />
                            <span className="text-xs font-mono font-bold text-white truncate">
                              {track.name}
                            </span>
                          </div>

                          {/* Play Only This Instrument Pattern Button */}
                          <button
                            onClick={() => {
                              selectTrack(track.id);
                              audioEngine.playSingleTrackSolo(track.id);
                            }}
                            className={`p-1 rounded transition-colors flex-shrink-0 ${
                              track.solo
                                ? 'bg-amber-500 text-black'
                                : 'bg-neutral-800/80 hover:bg-amber-600 text-amber-300 hover:text-black'
                            }`}
                            title="Play this instrument pattern separately (Solo Audition)"
                          >
                            <Play className="w-3 h-3" />
                          </button>

                          {/* Generate Pattern for This Instrument */}
                          <button
                            onClick={() => {
                              selectTrack(track.id);
                              audioEngine.generateInstrumentPattern(track.id, patternGenStyle);
                            }}
                            className="p-1 rounded bg-neutral-800/80 hover:bg-emerald-600 text-emerald-300 hover:text-white transition-colors flex-shrink-0"
                            title={`Generate ${patternGenStyle.toUpperCase()} pattern for ${track.name}`}
                          >
                            <Wand2 className="w-3 h-3" />
                          </button>

                          {/* Open in Piano Roll */}
                          <button
                            onClick={() => {
                              selectTrack(track.id);
                              setViewMode('piano_roll');
                            }}
                            className="p-1 rounded bg-neutral-800/80 hover:bg-cyan-600 text-cyan-300 hover:text-white transition-colors flex-shrink-0"
                            title="Edit this instrument in Piano Roll"
                          >
                            <Music className="w-3 h-3" />
                          </button>

                          {onSelectDeviceForRack && dev && (
                            <button
                              onClick={() => onSelectDeviceForRack(dev.id)}
                              className="p-1 rounded bg-neutral-800/80 hover:bg-cyan-700 text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                              title="Inspect Device Faceplate in Hardware Rack"
                            >
                              <Sliders className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Quick Tools & Fill Popover Trigger */}
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuTrackId(activeMenuTrackId === track.id ? null : track.id)}
                            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                            title="Channel Pattern & Fill Tools"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuTrackId === track.id && (
                            <div className="absolute left-0 mt-1 w-48 bg-[#141820] border-2 border-emerald-600 rounded-md shadow-2xl z-50 p-1.5 text-[10px] font-mono">
                              <button
                                onClick={() => applyQuickFill(track.id, 'industrial')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-amber-300 font-bold"
                              >
                                Generate Industrial Riff
                              </button>
                              <button
                                onClick={() => applyQuickFill(track.id, 'acid')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-emerald-300 font-bold"
                              >
                                Generate Acid 303 Glide
                              </button>
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
                                onClick={() => applyQuickFill(track.id, 'euclidean_3')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-cyan-300"
                              >
                                Euclidean (Tresillo 3/8)
                              </button>
                              <button
                                onClick={() => applyQuickFill(track.id, 'random')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-[#064e3b] text-neutral-200"
                              >
                                Randomize scale steps
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

                      {/* STEP SEQUENCER GRID */}
                      <div className="flex-1 flex overflow-x-auto py-1 px-2 space-x-1 items-center">
                        {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                          const covering = findCoveringNote(track, stepIdx);
                          const isHead = !!track.steps[stepIdx];
                          const isTail = !isHead && !!covering;
                          const isCurrent = currentStep === stepIdx;
                          const beatIndex = Math.floor(stepIdx / 4);
                          const isEvenBeat = beatIndex % 2 === 0;

                          return (
                            <div
                              key={stepIdx}
                              onClick={() => handleStepClick(track, stepIdx)}
                              onContextMenu={(e) => handleStepContextMenu(e, track, stepIdx)}
                              className={`w-7 sm:w-8 h-8 rounded-xs cursor-pointer flex flex-col items-center justify-center transition-all relative select-none flex-shrink-0 ${
                                isHead
                                  ? 'bg-gradient-to-b from-cyan-400 to-emerald-500 shadow-[0_0_10px_rgba(6,182,212,0.85)] border border-cyan-200 scale-95'
                                  : isTail
                                  ? 'bg-cyan-600/40 border border-cyan-400/50'
                                  : isEvenBeat
                                  ? 'bg-[#101827] hover:bg-[#1a2740] border border-cyan-500/30'
                                  : 'bg-[#0a0f1a] hover:bg-[#141e33] border border-slate-800'
                              } ${isCurrent ? 'ring-2 ring-cyan-300 z-10' : ''}`}
                              title={
                                isHead
                                  ? `Step ${stepIdx + 1}: ${getNoteName(track.steps[stepIdx]!.note)} (Len: ${track.steps[stepIdx]!.length || 1} steps)`
                                  : `Step ${stepIdx + 1}`
                              }
                            >
                              {isHead && (
                                <span className="text-[8px] font-mono font-black text-black">
                                  {(track.steps[stepIdx]!.length || 1) > 1
                                    ? `${track.steps[stepIdx]!.length}x`
                                    : ''}
                                </span>
                              )}
                              {!isHead && !isTail && stepIdx % 4 === 0 && (
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
            </div>
          )}

          {/* EMPTY STATE FOR PIANO ROLL OR GRAPH EDITOR WHEN NO INSTRUMENTS ADDED YET */}
          {(viewMode === 'piano_roll' || viewMode === 'graph_editor') && !activeTrack && (
            <div className="flex-1 flex items-center justify-center p-6 bg-[#080c14] font-mono">
              <div className="max-w-2xl w-full p-6 rounded-xl bg-slate-950/90 border-2 border-dashed border-cyan-500/50 text-center space-y-4">
                <div className="text-xs font-black text-cyan-300 uppercase tracking-widest">
                  PIANO ROLL &amp; GRAPH EDITOR // MANUAL INSTRUMENT REQUIRED
                </div>
                <p className="text-xs text-slate-300">
                  Mount an instrument manually below (or from the Modular Rack) to begin editing notes on the Piano Roll:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[
                    { type: 'tabla' as DeviceType, label: '+ Tabla (Dayan & Bayan)' },
                    { type: 'dhol' as DeviceType, label: '+ Dhol Folk Drum' },
                    { type: 'subtractor' as DeviceType, label: '+ Subtractor Synth' },
                    { type: 'europa' as DeviceType, label: '+ Europa Wavetable' },
                    { type: 'wyvern' as DeviceType, label: '+ Wyvern Synth' },
                    { type: 'redrum' as DeviceType, label: '+ Redrum Drums' },
                    { type: 'bansuri' as DeviceType, label: '+ Bansuri Flute' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => handleAddGenerator(item.type)}
                      className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE B: FULL MULTI-STEP NOTE-EDITING PIANO ROLL WITH NOTE LENGTH EXTENDER / REDUCER */}
          {viewMode === 'piano_roll' && activeTrack && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10]">
              {/* ROW 1: PIANO ROLL EDITING TOOLS & NOTE DURATION / LENGTH EXTENDER-REDUCER BAR */}
              <div className="min-h-[42px] bg-[#12161f] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-[10px] font-mono">
                {/* All 9 On-Screen Navigation & Manipulation Tools with Shortcut Badges */}
                <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded border border-cyan-500/30">
                  {[
                    { id: 'draw', label: 'Pencil / Draw', hk: 'B/2', icon: PenTool },
                    { id: 'select', label: 'Pointer', hk: 'V/1', icon: MousePointer },
                    { id: 'split', label: 'Split / Scissors', hk: 'C/3', icon: Scissors },
                    { id: 'glue', label: 'Glue / Join', hk: 'G/4', icon: Layers },
                    { id: 'erase', label: 'Eraser', hk: 'E/5', icon: Trash2 },
                    { id: 'mute', label: 'Mute', hk: '6', icon: VolumeX },
                    { id: 'stretch', label: 'Slip / Stretch', hk: '8', icon: ArrowRight },
                    { id: 'zoom', label: 'Zoom Tool', hk: '7', icon: ZoomIn },
                    { id: 'marquee', label: 'Marquee', hk: '9', icon: Compass },
                  ].map((tl) => {
                    const Icon = tl.icon;
                    return (
                      <button
                        key={tl.id}
                        onClick={() => setPianoTool(tl.id as PianoRollTool)}
                        className={`px-2 py-1 rounded font-bold flex items-center space-x-1 transition-all ${
                          pianoTool === tl.id
                            ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title={`${tl.label} [Shortcut: ${tl.hk}]`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{tl.label}</span>
                        <span className={`text-[8px] px-1 rounded ${pianoTool === tl.id ? 'bg-slate-950/25 text-slate-950' : 'bg-slate-900 text-cyan-400/80'}`}>
                          {tl.hk}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Note Duration Preset Selector (for new notes) */}
                <div className="flex items-center space-x-1 bg-neutral-900 px-2 py-0.5 rounded border border-emerald-500/40">
                  <span className="text-emerald-300 font-bold">NOTE LENGTH:</span>
                  {[
                    { l: 1, label: '1/16 (1)' },
                    { l: 2, label: '1/8 (2)' },
                    { l: 3, label: '3/16 (3)' },
                    { l: 4, label: '1/4 (4)' },
                    { l: 6, label: '3/8 (6)' },
                    { l: 8, label: '1/2 (8)' },
                    { l: 16, label: '1 BAR (16)' },
                  ].map((opt) => (
                    <button
                      key={opt.l}
                      onClick={() => {
                        setDefaultNoteLength(opt.l);
                        if (selectedStepIdx !== null && activeTrack.steps[selectedStepIdx]) {
                          adjustNoteLengthAtStep(activeTrack, selectedStepIdx, opt.l);
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                        defaultNoteLength === opt.l
                          ? 'bg-amber-500 text-black'
                          : 'bg-neutral-800 text-neutral-300 hover:text-white'
                      }`}
                      title={`Set default note duration to ${opt.l} steps (and resize selected note if any)`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Direct Note Length Extend / Reduce / Legato / Chop Actions */}
                <div className="flex items-center space-x-1 bg-neutral-900 px-2 py-0.5 rounded border border-amber-500/40">
                  <span className="text-amber-300 font-bold">RESIZE NOTES:</span>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('dec')}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-amber-500 hover:text-black text-amber-300 font-bold"
                    title="Reduce note length by 1 step (-1 Step)"
                  >
                    -1 STEP
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('inc')}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-amber-500 hover:text-black text-amber-300 font-bold"
                    title="Extend note length by 1 step (+1 Step)"
                  >
                    +1 STEP
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('halve')}
                    className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold"
                    title="Halve all note durations (÷2)"
                  >
                    ÷2 LEN
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('double')}
                    className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold"
                    title="Double all note durations (×2)"
                  >
                    ×2 LEN
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('legato')}
                    className="px-2 py-0.5 rounded bg-emerald-800 hover:bg-emerald-600 text-white font-bold"
                    title="Extend every note to sustain continuously into the next note (Legato)"
                  >
                    LEGATO
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('staccato')}
                    className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold"
                    title="Shorten all notes to 1-step staccato"
                  >
                    STACCATO
                  </button>
                  <button
                    onClick={() => handleBatchNoteLengthTransform('chop16')}
                    className="px-2 py-0.5 rounded bg-cyan-900 hover:bg-cyan-700 text-cyan-200 font-bold"
                    title="Slice sustained notes into rapid 16th-note industrial machine-gun hits"
                  >
                    CHOP 16THS
                  </button>
                </div>
              </div>

              {/* ROW 2: CHORD STAMP, TRANSPOSE, SLIP & INSTRUMENT PILL BAR */}
              <div className="min-h-[38px] bg-[#0e121a] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-[10px] font-mono">
                {/* Quick Instrument Switcher Pills */}
                <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
                  <span className="text-neutral-500 font-bold mr-1">TRACKS:</span>
                  {tracks.map((t) => {
                    const isAct = t.id === activeTrack.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          selectTrack(t.id);
                          const dev = devices.find((d) => d.id === t.deviceId);
                          auditionDeviceNote(dev, dev?.type === 'redrum' ? 60 : 60 + audioEngine.rootKey, 0.85);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1 flex-shrink-0 border transition-all ${
                          isAct
                            ? 'bg-emerald-700 text-white border-emerald-400 shadow'
                            : 'bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: t.color || '#10b981' }} />
                        <span>{t.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Chord Trigger Stamp + Step Ratchet + Step Probability + Transpose + Slip + Zoom */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {/* Step Ratchet (1x..4x) & Probability (25%..100%) */}
                  <div className="flex items-center space-x-1 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                    <span className="text-amber-300 font-bold">RATCHET:</span>
                    {[1, 2, 3, 4].map((rt) => (
                      <button
                        key={rt}
                        onClick={() => {
                          setDefaultRatchet(rt);
                          if (selectedStepIdx !== null && activeTrack.steps[selectedStepIdx]) {
                            activeTrack.steps[selectedStepIdx]!.ratchet = rt;
                            setForceUpdate((x) => x + 1);
                          }
                        }}
                        className={`px-1.5 py-0.2 rounded font-bold ${
                          defaultRatchet === rt ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                        title={`Set Step Ratchet Sub-Loop Repetition to ${rt}x`}
                      >
                        {rt}x
                      </button>
                    ))}
                    <span className="text-emerald-300 font-bold ml-1">CHANCE:</span>
                    <select
                      value={defaultProbability}
                      onChange={(e) => {
                        const prob = Number(e.target.value);
                        setDefaultProbability(prob);
                        if (selectedStepIdx !== null && activeTrack.steps[selectedStepIdx]) {
                          activeTrack.steps[selectedStepIdx]!.probability = prob;
                          setForceUpdate((x) => x + 1);
                        }
                      }}
                      className="bg-[#18202c] text-emerald-300 font-bold px-1 py-0.5 rounded border border-neutral-700"
                    >
                      <option value={1}>100%</option>
                      <option value={0.75}>75%</option>
                      <option value={0.5}>50%</option>
                      <option value={0.25}>25%</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                    <span className="text-cyan-400 font-bold">CHORD STAMP:</span>
                    <select
                      value={chordStamp}
                      onChange={(e) => setChordStamp(e.target.value as ChordStampType)}
                      className="bg-[#18202c] text-white font-bold px-1.5 py-0.5 rounded border border-neutral-700"
                    >
                      <option value="single">Single Note</option>
                      <option value="power5">Industrial Power 5th</option>
                      <option value="minor">Minor Triad</option>
                      <option value="major">Major Triad</option>
                      <option value="sus2">Suspended Sus2</option>
                      <option value="octave">Octave Stack</option>
                    </select>
                  </div>

                  {/* Slip Timing & Transpose */}
                  <div className="flex items-center space-x-1 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                    <button
                      onClick={() => handleTransformTrackNotes('shift_left')}
                      className="p-0.5 hover:text-amber-400 text-neutral-300"
                      title="Slip Pattern Left (-1 Step)"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTransformTrackNotes('shift_right')}
                      className="p-0.5 hover:text-amber-400 text-neutral-300"
                      title="Slip Pattern Right (+1 Step)"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTransformTrackNotes('up_semi')}
                      className="px-1 hover:text-emerald-400 text-neutral-300 font-bold"
                      title="Transpose +1 Semitone"
                    >
                      +1st
                    </button>
                    <button
                      onClick={() => handleTransformTrackNotes('down_semi')}
                      className="px-1 hover:text-emerald-400 text-neutral-300 font-bold"
                      title="Transpose -1 Semitone"
                    >
                      -1st
                    </button>
                    <button
                      onClick={() => handleTransformTrackNotes('up_oct')}
                      className="px-1 hover:text-cyan-400 text-neutral-300 font-bold"
                      title="Transpose +1 Octave"
                    >
                      +OCT
                    </button>
                    <button
                      onClick={() => handleTransformTrackNotes('down_oct')}
                      className="px-1 hover:text-cyan-400 text-neutral-300 font-bold"
                      title="Transpose -1 Octave"
                    >
                      -OCT
                    </button>
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center space-x-1 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                    <button
                      onClick={() => setCellWidth((w) => Math.max(24, w - 6))}
                      className="p-0.5 text-neutral-400 hover:text-white"
                      title="Zoom Out Grid"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCellWidth((w) => Math.min(72, w + 6))}
                      className="p-0.5 text-neutral-400 hover:text-white"
                      title="Zoom In Grid"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => audioEngine.clearTrackSteps(activeTrack.id)}
                    className="px-2 py-0.5 rounded bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 font-bold flex items-center space-x-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>CLEAR</span>
                  </button>
                </div>
              </div>

              {/* ROW 3: PIANO ROLL PRECISION MAGNETIC GRID SYSTEM, SCALE GUIDES, GHOST NOTES & COORDINATE HUD */}
              <div className="min-h-[34px] bg-[#090d14] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-[10px] font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-amber-400 font-bold">GRID SNAP RESOLUTION:</span>
                  {[
                    { g: 1 as const, label: '1/16 STEP' },
                    { g: 2 as const, label: '1/8 NOTE' },
                    { g: 3 as const, label: '1/16 TRIPLET' },
                    { g: 4 as const, label: '1/4 BEAT' },
                  ].map((item) => (
                    <button
                      key={item.g}
                      onClick={() => {
                        setGridSnapInterval(item.g);
                        setDefaultNoteLength(item.g);
                      }}
                      className={`px-2 py-0.5 rounded font-bold transition-colors ${
                        gridSnapInterval === item.g
                          ? 'bg-amber-500 text-black'
                          : 'bg-neutral-800 text-neutral-300 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}

                  <button
                    onClick={() => setMagneticGridSnap(!magneticGridSnap)}
                    className={`px-2 py-0.5 rounded font-bold border ${
                      magneticGridSnap
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    MAGNETIC SNAP: {magneticGridSnap ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => setShowScaleGuides(!showScaleGuides)}
                    className={`px-2 py-0.5 rounded font-bold border ${
                      showScaleGuides
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    SCALE GUIDES: {showScaleGuides ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => setShowGhostNotes(!showGhostNotes)}
                    className={`px-2 py-0.5 rounded font-bold border ${
                      showGhostNotes
                        ? 'bg-purple-950 border-purple-500 text-purple-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    GHOST NOTES: {showGhostNotes ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Live Grid Coordinate Crosshair Readout & Quick Grid Fill Helpers */}
                <div className="flex items-center space-x-2">
                  <div className="bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-neutral-300">
                    {hoveredGridCell ? (
                      <span>
                        BAR <strong className="text-amber-300">{Math.floor(hoveredGridCell.step / 16) + 1}</strong> · BEAT{' '}
                        <strong className="text-emerald-300">{Math.floor((hoveredGridCell.step % 16) / 4) + 1}</strong> · STEP{' '}
                        <strong className="text-cyan-300">{hoveredGridCell.step + 1}</strong> · NOTE{' '}
                        <strong className="text-white">{getNoteName(hoveredGridCell.midi)}</strong> (
                        {(audioEngine.tuningReferenceHz * Math.pow(2, (hoveredGridCell.midi - 69) / 12)).toFixed(1)}Hz)
                      </span>
                    ) : (
                      <span>HOVER PIANO GRID FOR BAR · BEAT · STEP · HZ READOUT</span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      audioEngine.autoAlignTrackMidi(activeTrack.id, 100);
                      setForceUpdate((x) => x + 1);
                    }}
                    className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black"
                    title="Auto-Align Engine: Smart micro-timing snap assistant to quantize input MIDI"
                  >
                    AUTO-ALIGN MIDI
                  </button>

                  <button
                    onClick={() => setShowMpeOverlay((v) => !v)}
                    className={`px-2 py-0.5 rounded font-bold border ${
                      showMpeOverlay
                        ? 'bg-amber-500 text-slate-950 border-amber-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                    }`}
                    title="Toggle MPE Parameter Editor (Per-Note Pitch, Pressure & Slide Multi-Dimensional Lane)"
                  >
                    MPE LANE: {showMpeOverlay ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={() => {
                      const rootMidi = activeDevice?.type === 'redrum' ? 60 : 48 + audioEngine.rootKey;
                      for (let s = 0; s < gridSteps; s++) {
                        activeTrack.steps[s] =
                          s % 4 === 0
                            ? {
                                note: rootMidi,
                                velocity: 0.92,
                                length: 2,
                                ratchet: 1,
                                probability: 1.0,
                              }
                            : null;
                      }
                      audioEngine['notify']?.();
                      setForceUpdate((x) => x + 1);
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-white font-bold"
                    title="Fill every 1/4 beat on the grid"
                  >
                    1/4 BEAT GRID FILL
                  </button>
                </div>
              </div>

              {/* MPE PARAMETER EDITOR (Per-Note Multi-Dimensional Lane Overlay for Pitch, Pressure, and Slide) */}
              {showMpeOverlay && (
                <div className="bg-[#070b14] border-b border-cyan-500/30 px-3 py-1.5 flex items-center justify-between gap-3 flex-shrink-0 text-[10px] font-mono">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-cyan-300 font-black">MPE PARAMETER EDITOR (PER-NOTE 3D EXPRESSION):</span>
                    {(
                      [
                        { id: 'mpePitch', label: 'MPE Pitch Bend (-24..+24st)' },
                        { id: 'mpePressure', label: 'MPE Pressure / Aftertouch (0..100%)' },
                        { id: 'mpeSlide', label: 'MPE Y-Slide / Timbre CC74 (0..100%)' },
                      ] as const
                    ).map((dim) => (
                      <button
                        key={dim.id}
                        onClick={() => setActiveMpeDimension(dim.id)}
                        className={`px-2 py-0.5 rounded font-bold transition-all ${
                          activeMpeDimension === dim.id
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {dim.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick Per-Step MPE Bar Strip */}
                  <div className="flex items-center space-x-1 overflow-x-auto max-w-xl py-0.5">
                    {Array.from({ length: Math.min(16, gridSteps) }).map((_, sIdx) => {
                      const st = activeTrack.steps[sIdx];
                      const val =
                        activeMpeDimension === 'mpePitch'
                          ? ((st?.mpePitch ?? 0) + 24) / 48
                          : activeMpeDimension === 'mpePressure'
                          ? st?.mpePressure ?? st?.aftertouch ?? 0.75
                          : st?.mpeSlide ?? 0.5;
                      return (
                        <button
                          key={sIdx}
                          onClick={() => {
                            if (!st) return;
                            if (activeMpeDimension === 'mpePitch') {
                              const nextP = (st.mpePitch ?? 0) >= 12 ? -12 : (st.mpePitch ?? 0) + 6;
                              audioEngine.setTrackStep(activeTrack.id, sIdx, { ...st, mpePitch: nextP, finePitch: nextP * 8 });
                            } else if (activeMpeDimension === 'mpePressure') {
                              const nextPr = (st.mpePressure ?? 0.75) >= 0.9 ? 0.35 : Number(((st.mpePressure ?? 0.5) + 0.25).toFixed(2));
                              audioEngine.setTrackStep(activeTrack.id, sIdx, { ...st, mpePressure: nextPr, aftertouch: nextPr });
                            } else {
                              const nextSl = (st.mpeSlide ?? 0.5) >= 0.9 ? 0.2 : Number(((st.mpeSlide ?? 0.5) + 0.25).toFixed(2));
                              audioEngine.setTrackStep(activeTrack.id, sIdx, { ...st, mpeSlide: nextSl });
                            }
                            setForceUpdate((x) => x + 1);
                          }}
                          className={`w-6 h-5 rounded border flex flex-col justify-end p-0.5 ${
                            st ? 'border-cyan-500/50 bg-slate-950' : 'border-slate-800 bg-slate-900/40 opacity-40'
                          }`}
                          title={`Step ${sIdx + 1} ${activeMpeDimension}: Click to cycle MPE expression`}
                        >
                          <div
                            style={{ height: `${Math.max(15, Math.round(val * 100))}%` }}
                            className="w-full bg-cyan-400 rounded-xs"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MAIN PIANO ROLL CANVAS WITH MULTI-STEP NOTE BARS & DRAG-TO-RESIZE HANDLES */}
              <div className="flex-1 flex overflow-hidden">
                {/* Keyboard Keys on Left Side */}
                <div className="w-24 sm:w-28 flex-shrink-0 overflow-y-auto border-r border-neutral-800 bg-[#101319] select-none">
                  <div
                    className="py-1.5 px-1 text-center text-[10px] font-mono text-emerald-400 font-bold border-b border-neutral-800 truncate"
                    title={activeTrack.name}
                  >
                    {activeTrack.name.toUpperCase()}
                  </div>
                  {Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }).map((_, i) => {
                    const midi = MAX_NOTE - i;
                    const isBlack = isBlackKey(midi);
                    const isRootKey = (midi - audioEngine.rootKey) % 12 === 0;
                    return (
                      <div
                        key={midi}
                        style={{ height: rowHeight }}
                        onClick={() => auditionDeviceNote(activeDevice, midi, 0.9)}
                        className={`px-2 flex items-center justify-between text-[10px] font-mono font-bold cursor-pointer border-b transition-colors ${
                          isRootKey
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                            : isBlack
                            ? 'bg-[#181a20] text-neutral-300 hover:bg-[#252830] border-neutral-900'
                            : 'bg-[#e2e8f0] text-slate-900 hover:bg-white border-neutral-300'
                        }`}
                      >
                        <span>{getNoteName(midi)}</span>
                        {isRootKey ? (
                          <span className="text-[8px] text-amber-400 font-black">ROOT</span>
                        ) : (
                          midi % 12 === 0 && <span className="text-[8px] opacity-60">OCT</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Piano Roll Multi-Step Note Grid Area */}
                <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#08090c] relative">
                  {/* Bar.Beat.Step Ruler Header (Click any step to scrub playhead) */}
                  <div
                    className="h-7 bg-[#10141d] border-b border-neutral-800 flex items-center sticky top-0 z-30"
                    style={{ width: gridSteps * cellWidth }}
                  >
                    {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                      const isBarStart = stepIdx % 16 === 0;
                      const isBeatStart = stepIdx % 4 === 0;
                      const barNum = Math.floor(stepIdx / 16) + 1;
                      const beatNum = Math.floor((stepIdx % 16) / 4) + 1;
                      return (
                        <div
                          key={stepIdx}
                          style={{ width: cellWidth }}
                          onClick={() => {
                            audioEngine.currentStep = stepIdx;
                            setForceUpdate((x) => x + 1);
                          }}
                          className={`h-full border-r cursor-pointer flex flex-col items-center justify-center text-[8px] font-mono font-bold ${
                            isBarStart
                              ? 'border-l-2 border-l-amber-400 border-r-neutral-700 bg-amber-500/15 text-amber-300'
                              : isBeatStart
                              ? 'border-l border-l-emerald-500/60 border-r-neutral-800 bg-emerald-950/40 text-emerald-300'
                              : 'border-r-neutral-800/80 text-neutral-500'
                          } ${currentStep === stepIdx ? '!bg-amber-500 !text-black' : ''}`}
                          title={`Click to move playhead to Bar ${barNum}, Beat ${beatNum}, Step ${stepIdx + 1}`}
                        >
                          {isBeatStart && (
                            <span className="text-[7px] leading-none opacity-80">
                              {barNum}.{beatNum}
                            </span>
                          )}
                          <span className="leading-none">{stepIdx + 1}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Note Rows with Scale Guides, Bar/Beat Sub-Grid Lines, Ghost Notes & Crosshair */}
                  <div className="flex flex-col" style={{ width: gridSteps * cellWidth }}>
                    {Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }).map((_, i) => {
                      const midi = MAX_NOTE - i;
                      const isBlack = isBlackKey(midi);
                      const isRootKey = (midi - audioEngine.rootKey) % 12 === 0;
                      const inScale = audioEngine.snapMidiToScale(midi) === midi;
                      const isHoveredRow = hoveredGridCell?.midi === midi;

                      return (
                        <div
                          key={midi}
                          style={{ height: rowHeight }}
                          className={`flex border-b relative ${
                            isRootKey
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : showScaleGuides && inScale
                              ? 'bg-[#121a22] border-neutral-800/50'
                              : isBlack
                              ? 'bg-[#0b0d12] border-neutral-900/70'
                              : 'bg-[#10131a] border-neutral-900/50'
                          } ${isHoveredRow ? 'ring-1 ring-inset ring-cyan-500/30' : ''}`}
                        >
                          {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                            const noteAtStep = activeTrack.steps[stepIdx];
                            const isNoteHead =
                              noteAtStep &&
                              (noteAtStep.note === midi || noteAtStep.chordNotes?.includes(midi));
                            const isPrimaryHead = noteAtStep && noteAtStep.note === midi;
                            const isCurrent = currentStep === stepIdx;
                            const noteLen = noteAtStep ? Math.max(1, noteAtStep.length || 1) : 1;
                            const isBarBoundary = stepIdx % 16 === 0;
                            const isBeatBoundary = stepIdx % 4 === 0;
                            const isSnapBoundary = stepIdx % gridSnapInterval === 0;
                            const isHoveredCol = hoveredGridCell?.step === stepIdx;

                            // Find ghost note from other tracks at this cell
                            const ghostTrack = showGhostNotes
                              ? tracks.find(
                                  (gt) =>
                                    gt.id !== activeTrack.id &&
                                    !gt.mute &&
                                    gt.steps[stepIdx] &&
                                    (gt.steps[stepIdx]!.note === midi ||
                                      gt.steps[stepIdx]!.chordNotes?.includes(midi))
                                )
                              : undefined;

                            return (
                              <div
                                key={stepIdx}
                                style={{ width: cellWidth }}
                                onMouseEnter={() => setHoveredGridCell({ step: stepIdx, midi })}
                                onMouseLeave={() => setHoveredGridCell(null)}
                                onClick={() => handlePianoCellClick(stepIdx, midi)}
                                onContextMenu={(e) => handleStepContextMenu(e, activeTrack, stepIdx)}
                                className={`h-full border-r ${
                                  isBarBoundary
                                    ? 'border-l-2 border-l-amber-500/45 border-r-neutral-800'
                                    : isBeatBoundary
                                    ? 'border-l border-l-emerald-500/35 border-r-neutral-800'
                                    : isSnapBoundary
                                    ? 'border-r-neutral-800/90'
                                    : 'border-r-neutral-900/70'
                                } cursor-pointer relative flex items-center transition-colors hover:bg-emerald-500/15 ${
                                  isCurrent ? 'bg-amber-400/15' : isHoveredCol ? 'bg-white/[0.03]' : ''
                                }`}
                              >
                                {/* Ghost Note Indicator from Other Instrument Tracks */}
                                {!isNoteHead && ghostTrack && (
                                  <div
                                    style={{
                                      width: Math.max(
                                        cellWidth - 4,
                                        (ghostTrack.steps[stepIdx]?.length || 1) * cellWidth - 4
                                      ),
                                      borderColor: ghostTrack.color || '#64748b',
                                    }}
                                    className="absolute left-0.5 top-1 bottom-1 rounded-xs bg-white/[0.06] border border-dashed z-10 pointer-events-none flex items-center px-1"
                                  >
                                    <span className="text-[7px] font-mono text-neutral-400 truncate">
                                      {ghostTrack.name.slice(0, 6)}
                                    </span>
                                  </div>
                                )}

                                {/* Multi-Step Spanned Note Block */}
                                {isNoteHead && noteAtStep && (
                                  <div
                                    style={{
                                      width: Math.max(cellWidth - 2, noteLen * cellWidth - 2),
                                    }}
                                    className={`absolute left-0 top-0.5 bottom-0.5 rounded-xs z-20 flex items-center justify-between px-1 select-none shadow-md ${
                                      noteAtStep.muted
                                        ? 'bg-neutral-700/70 border border-neutral-500 text-neutral-400 line-through'
                                        : isPrimaryHead
                                        ? selectedStepIdx === stepIdx
                                          ? 'bg-gradient-to-r from-amber-500 to-emerald-500 border-2 border-white text-black'
                                          : 'bg-gradient-to-r from-emerald-500 to-teal-600 border border-emerald-200 text-white shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                                        : 'bg-cyan-700/80 border border-cyan-300 text-cyan-100'
                                    }`}
                                  >
                                    <span className="text-[9px] font-mono font-bold truncate">
                                      {getNoteName(midi)} {noteLen > 1 ? `(${noteLen}s)` : ''}
                                    </span>

                                    {/* Inline Quick Note Length - / + Buttons & Drag Handle on Primary Note */}
                                    {isPrimaryHead && (
                                      <div className="flex items-center space-x-0.5 ml-1">
                                        {noteLen > 1 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              adjustNoteLengthAtStep(activeTrack, stepIdx, noteLen - 1);
                                            }}
                                            className="px-1 rounded-xs bg-black/40 hover:bg-black/80 text-white text-[8px] font-bold"
                                            title="Reduce Note Length (-1 Step)"
                                          >
                                            -
                                          </button>
                                        )}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            adjustNoteLengthAtStep(activeTrack, stepIdx, noteLen + 1);
                                          }}
                                          className="px-1 rounded-xs bg-black/40 hover:bg-black/80 text-white text-[8px] font-bold"
                                          title="Extend Note Length (+1 Step)"
                                        >
                                          +
                                        </button>
                                        {/* Right-Edge Drag-to-Resize Handle */}
                                        <div
                                          onMouseDown={(e) => handleStartResizeNote(e, activeTrack, stepIdx)}
                                          className="w-2 h-4 bg-white/80 hover:bg-amber-300 rounded-xs cursor-ew-resize ml-0.5"
                                          title="Drag right edge to extend or reduce note length"
                                        />
                                      </div>
                                    )}
                                  </div>
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
            </div>
          )}

          {/* VIEW MODE C: MICRO-PARAMETER GRAPH & MIDI CC AUTOMATION LANES */}
          {viewMode === 'graph_editor' && activeTrack && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10] p-3">
              <div className="h-10 bg-[#12161f] rounded-t-lg border border-neutral-800 px-3 flex items-center justify-between text-xs font-mono flex-shrink-0 overflow-x-auto gap-2">
                <div className="flex items-center space-x-1">
                  <span className="text-neutral-400 font-bold text-[10px] mr-1">PARAMETER / MIDI CC LANE:</span>
                  {(
                    [
                      { id: 'velocity', label: 'Velocity' },
                      { id: 'pitch', label: 'Vari-Pitch' },
                      { id: 'pan', label: 'Stereo Pan' },
                      { id: 'cutoff', label: 'Filter Cutoff' },
                      { id: 'resonance', label: 'Resonance' },
                      { id: 'cc1', label: 'CC1 ModWheel' },
                      { id: 'cc74', label: 'CC74 Brightness' },
                      { id: 'cc91', label: 'CC91 Reverb Send' },
                    ] as const
                  ).map((param) => (
                    <button
                      key={param.id}
                      onClick={() => setGraphParam(param.id)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                        graphParam === param.id
                          ? 'bg-emerald-600 text-white shadow-[0_0_8px_#10b981]'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {param.label}
                    </button>
                  ))}
                </div>

                {/* Envelope Curve Generators */}
                <div className="flex items-center space-x-1 text-[10px]">
                  <button
                    onClick={() => {
                      for (let i = 0; i < gridSteps; i++) {
                        handleGraphValueChange(activeTrack, i, Number((i / Math.max(1, gridSteps - 1)).toFixed(2)));
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-emerald-700 text-neutral-200"
                  >
                    RAMP UP
                  </button>
                  <button
                    onClick={() => {
                      for (let i = 0; i < gridSteps; i++) {
                        handleGraphValueChange(activeTrack, i, Number((0.5 + 0.45 * Math.sin((i / gridSteps) * Math.PI * 2)).toFixed(2)));
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-emerald-700 text-neutral-200"
                  >
                    SINE LFO
                  </button>
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
                    graphParam === 'velocity' ? 0.85 : graphParam === 'pitch' ? 0 : graphParam === 'pan' ? 0 : 0.7;

                  const currentVal = dataArr[stepIdx] !== undefined ? dataArr[stepIdx] : defaultVal;
                  const normalizedHeight =
                    graphParam === 'pitch'
                      ? ((currentVal + 12) / 24) * 100
                      : graphParam === 'pan'
                      ? ((currentVal + 1) / 2) * 100
                      : currentVal * 100;

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
                          if (graphParam === 'pitch') computedVal = Math.round(ratio * 24 - 12);
                          else if (graphParam === 'pan') computedVal = ratio * 2 - 1;
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
                      <span className="text-[8px] font-mono text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                        {graphParam === 'pitch'
                          ? `${currentVal > 0 ? '+' : ''}${currentVal} st`
                          : `${(currentVal * 100).toFixed(0)}%`}
                      </span>

                      <div className="w-2.5 h-full bg-[#151922] rounded-full relative flex items-end justify-center border border-neutral-800">
                        <div
                          className={`w-full rounded-full transition-all ${
                            hasNote
                              ? 'bg-gradient-to-t from-[#065f46] via-[#10b981] to-[#34d399] shadow-[0_0_8px_#10b981]'
                              : 'bg-neutral-700'
                          }`}
                          style={{ height: `${Math.max(4, normalizedHeight)}%` }}
                        />
                        <div
                          className="absolute w-4 h-2 rounded bg-white shadow-md border border-neutral-300 pointer-events-none"
                          style={{ bottom: `calc(${normalizedHeight}% - 4px)` }}
                        />
                      </div>

                      <span className={`text-[8px] font-mono mt-1 ${isCurrent ? 'text-amber-400 font-bold' : 'text-neutral-500'}`}>
                        {stepIdx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW MODES D, E, F, G: ARRANGEMENT, SAMPLE & WARP LAB, DSP & ANALYZER HUB, AI/VOCAL/OUTBOARD SUITE */}
          {(viewMode === 'arrangement' ||
            viewMode === 'sample_warp' ||
            viewMode === 'dsp_analyzer' ||
            viewMode === 'advanced_suite') && (
            <WorkstationPanels
              mode={viewMode}
              audioEngine={audioEngine}
              devices={devices}
              tracks={tracks}
              activeTrack={activeTrack}
              onSelectTrack={selectTrack}
              onOpenAdvancedInspector={onOpenAdvancedInspector}
              onOpenBatchExporter={onOpenBatchExporter}
            />
          )}

          {/* VIEW MODES H, I, J: LOOP LAUNCHER & STEP TRACKER, 128-CH ROUTING & MODULATION MATRIX, HARDWARE VIDEO VISUALIZER */}
          {(viewMode === 'loop_tracker' ||
            viewMode === 'routing_mod_matrix' ||
            viewMode === 'video_visualizer') && (
            <LiveAndMatrixPanels
              mode={viewMode}
              audioEngine={audioEngine}
              devices={devices}
              tracks={tracks}
              activeTrack={activeTrack}
              onSelectTrack={selectTrack}
              activeVisualizerTheme={activeVisualizerTheme}
              onChangeVisualizerTheme={onChangeVisualizerTheme || (() => {})}
              onOpenStageMode={onOpenStageMode}
              onOpenBatchExporter={onOpenBatchExporter}
            />
          )}
        </div>
      </div>

      {/* RIGHT ANODIZED TITANIUM CHEEK */}
      <div className="w-4 sm:w-5 flex-shrink-0 wooden-cheek rounded-r-xl flex flex-col justify-between items-center py-3 border-l border-cyan-500/20 shadow-2xl select-none z-10">
        <div className="brass-screw" title="Anodized Hex Bolt" />
        <span className="text-[7px] font-mono font-black text-cyan-400/60 -rotate-90 tracking-widest uppercase pointer-events-none">
          HI-FI DSP
        </span>
        <div className="brass-screw" title="Anodized Hex Bolt" />
      </div>
    </div>
  );
};
