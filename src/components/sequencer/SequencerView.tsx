import React, { useState, useEffect } from 'react';
import { useStepTick } from '../../nexa/useEngine.ts';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SequencerTrack, SequencerNote, DeviceType, InternalOptionCategory } from '../../audio/types.ts';
import { Knob } from '../Knob.tsx';
import StepEditor from '../../nexa/StepEditor.tsx';
import { drumLanesFor } from '../../audio/drumLanes.ts';
import { PatternManager } from './PatternManager.tsx';
import { ArrangementTimeline } from './arrangement/ArrangementTimeline.tsx';
import { TrackPanel } from './arrangement/TrackPanel.tsx';
import { PatternPianoRoll } from './pianoRoll/PatternPianoRoll.tsx';
import { PianoRollHardwareConsole } from './pianoRoll/PianoRollHardwareConsole.tsx';
import { syncTrackPatterns } from '../../audio/sequencer/model.ts';
import { SpecDevice } from '../../audio/spec/SpecDevice.ts';
import { ClipLauncherPanel } from './ClipLauncherPanel.tsx';
import { applyTrackAudioAction, type TrackAudioAction } from '../../audio/render/trackAudioActions.ts';
import { focusClip } from '../../shell/clipFocus.ts';
import { RECORDED_INSTRUMENT_OPTIONS } from '../../audio/instrumentCatalog.ts';
import {
  AudioLines,
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
  Sparkles,
  Grid,
} from 'lucide-react';
type GraphLaneId = 'velocity' | 'chance' | 'pitch' | 'cutoff' | 'resonance';
/** Graph & CC lanes (all read by playback and export). */
const GRAPH_LANES: { id: GraphLaneId; label: string; hint: string; toNorm: (v: number) => number; fromNorm: (r: number) => number }[] = [
  { id: 'velocity', label: 'Velocity', hint: 'Note velocity of each step (steps with a note only).', toNorm: (v) => v, fromNorm: (r) => Math.max(0.05, r) },
  { id: 'chance', label: 'Chance', hint: 'Chance that the note plays — rolled per bar, identical in exports.', toNorm: (v) => v, fromNorm: (r) => Math.max(0.05, r) },
  { id: 'pitch', label: 'Pitch', hint: 'Transposes the note on that step (±12 semitones). Empty steps play as written.', toNorm: (v) => (v + 12) / 24, fromNorm: (r) => Math.round(r * 24 - 12) },
  { id: 'cutoff', label: 'Cutoff', hint: "Sets the instrument's filter cutoff when the step plays. Empty steps leave the knob alone.", toNorm: (v) => v, fromNorm: (r) => r },
  { id: 'resonance', label: 'Resonance', hint: "Sets the instrument's resonance when the step plays. Empty steps leave the knob alone.", toNorm: (v) => v, fromNorm: (r) => Math.max(0.05, r) },
];

interface SequencerViewProps {
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  activeDeviceId?: string | null;
  externalTabRequest?: { tab: string; seq: number } | null;
  onSelectDeviceForRack?: (deviceId: string) => void;
  onNavigateToMixerTrack?: (trackNumber: number) => void;
  onTrackSelect?: (deviceId: string) => void;
  /** The host shows its own editor tabs (Clip Editor area). */
  hideViewTabs?: boolean;
  onViewModeChange?: (mode: SequencerTabMode) => void;
  onOpenStems?: () => void;
}

export type SequencerTabMode =
  | 'channel_rack'
  | 'piano_roll'
  | 'arrangement'
  | 'graph_editor'
  | 'drum_editor'
  | 'loop_tracker';


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
  tracks: allTracks,
  activeDeviceId,
  externalTabRequest,
  onSelectDeviceForRack,
  onNavigateToMixerTrack,
  onTrackSelect,
  hideViewTabs,
  onViewModeChange,
  onOpenStems,
}) => {
  useStepTick(); // playhead step / bar readouts and step highlights
  // Step grid, piano roll and generators edit note tracks; the arrangement shows audio tracks too.
  const tracks = allTracks.filter((t) => t.kind !== 'audio');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => {
    if (activeDeviceId) {
      const found = tracks.find((t) => t.deviceId === activeDeviceId);
      if (found) return found.id;
    }
    return tracks[0]?.id || '';
  });

  const [viewMode, setViewMode] = useState<SequencerTabMode>('channel_rack');
  const [audioActionBusy, setAudioActionBusy] = useState(false);
  const [audioActionError, setAudioActionError] = useState<string | null>(null);

  useEffect(() => {
    if (externalTabRequest?.tab) {
      setViewMode(externalTabRequest.tab as SequencerTabMode);
    }
  }, [externalTabRequest]);
  useEffect(() => onViewModeChange?.(viewMode), [viewMode]);
  const [activeGroup, setActiveGroup] = useState<
    'All' | 'Drums' | 'Synths' | 'Samplers' | 'World' | 'Automation' | 'FX'
  >('All');
  const [graphParam, setGraphParam] = useState<GraphLaneId>('velocity');
  const [globalSwing, setGlobalSwing] = useState<number>(audioEngine.globalSwing || 0);
  const [showGeneratorMenu, setShowGeneratorMenu] = useState<boolean>(false);
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  // Piano Roll & Step Grid Surgical Editing + Precision Grid System State
  const [pianoTool, setPianoTool] = useState<PianoRollTool>('draw');
  const [defaultNoteLength, setDefaultNoteLength] = useState<number>(2); // 1, 2, 3, 4, 6, 8, 16 steps
  const [defaultRatchet, setDefaultRatchet] = useState<number>(1); // 1x, 2x, 3x, 4x
  const [defaultProbability, setDefaultProbability] = useState<number>(1.0); // 0.25 .. 1.0
  const [chordStamp, setChordStamp] = useState<ChordStampType>('single');
  const [cellWidth, setCellWidth] = useState<number>(38);
  const [rowHeight, setRowHeight] = useState<number>(24);
  // New Precision Grid System States
  const [gridSnapInterval, setGridSnapInterval] = useState<1 | 2 | 3 | 4>(1);
  const [magneticGridSnap, setMagneticGridSnap] = useState<boolean>(true);
  const [showScaleGuides, setShowScaleGuides] = useState<boolean>(true);
  const [showGhostNotes, setShowGhostNotes] = useState<boolean>(true);
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
  // The step grid and piano roll edit the active pattern of the selected track (its own length).
  const activePattern = activeTrack ? syncTrackPatterns(activeTrack, audioEngine.activePatternIndex) : null;
  const gridSteps = activePattern?.length ?? Math.max(16, audioEngine.patternLength);
  /** Step of the edited pattern that is audible now (-1 when another pattern / clip is playing). */
  const stepPlayingOf = (track: SequencerTrack): number => {
    const ph = audioEngine.playheadFor(track);
    return ph && ph.patternId === track.activePatternId ? ph.step : -1;
  };
  const currentStep = activeTrack ? stepPlayingOf(activeTrack) : -1;

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
          setViewMode('drum_editor');
          return;
        }
        if (e.code === 'Digit6') {
          e.preventDefault();
          setViewMode('loop_tracker');
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

      // Alt + arrows: note length and transpose
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

      // Ctrl + D: generate a pattern for the selected track
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activeTrack) {
          audioEngine.generateInstrumentPattern(activeTrack.id, patternGenStyle);
        }
        return;
      }

      // Piano roll tools on 1..9 (letters would collide with the live keyboard's note keys)
      if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (e.key === '1') {
          setPianoTool('select');
        } else if (e.key === '2') {
          setPianoTool('draw');
        } else if (e.key === '3') {
          setPianoTool('split');
        } else if (e.key === '4') {
          setPianoTool('glue');
        } else if (e.key === '5') {
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
  }, [viewMode, activeTrack, gridSteps, patternGenStyle]);

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
    if (!activeTrack || !activePattern) return;
    audioEngine.sequencer.setPatternLength(activeTrack.id, activePattern.id, newLen);
  };

  // Handle global swing slider
  const handleGlobalSwingChange = (newSwing: number) => {
    setGlobalSwing(newSwing);
    audioEngine.setGlobalSwing(newSwing);
  };

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const getNoteName = (midi: number) => {
    const oct = Math.floor(midi / 12) - 1;
    const name = noteNames[midi % 12];
    return `${name}${oct}`;
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
  // Batch extend / reduce note lengths on the active track
  const handleBatchNoteLengthTransform = (
    mode: 'inc' | 'dec' | 'double' | 'halve' | 'legato' | 'staccato' | 'chop16'
  ) => {
    if (!activeTrack) return;

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

  const handleAudioAction = async (action: TrackAudioAction) => {
    if (!activeTrack || audioActionBusy) return;
    setAudioActionBusy(true);
    setAudioActionError(null);
    try {
      const result = await applyTrackAudioAction(audioEngine, activeTrack.id, action);
      if (result.samplerDeviceId) {
        selectTrack(result.trackId);
        setViewMode('piano_roll');
      } else if (result.clipId) {
        focusClip({ trackId: result.trackId, clipId: result.clipId });
        setViewMode('arrangement');
      }
      setForceUpdate((value) => value + 1);
    } catch (error) {
      setAudioActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAudioActionBusy(false);
    }
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
      const kit = drumLanesFor(dev);
      const defaultPitch = kit ? kit[0].note : 60 + audioEngine.rootKey;
      const chordOffsets = getChordOffsets(chordStamp);
      const chordNotes =
        chordOffsets.length > 0 && !kit
          ? chordOffsets.map((o) => defaultPitch + o)
          : undefined;

      audioEngine.setTrackStep(track.id, stepIdx, {
        note: defaultPitch,
        velocity: 0.88,
        length: kit ? 1 : defaultNoteLength,
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

  // Graph & CC edit: velocity / chance are note properties, the others sparse per-step lanes.
  const handleGraphValueChange = (track: SequencerTrack, stepIdx: number, rawVal: number) => {
    const n = track.steps[stepIdx];
    if (graphParam === 'velocity' || graphParam === 'chance') {
      if (!n) return;
      const v = Math.max(0.05, Math.min(1, rawVal));
      if (graphParam === 'chance') n.probability = v >= 0.995 ? undefined : v;
      else {
        n.velocity = v;
        // the drawn value is what plays (an old multiplier lane would scale it again)
        const mult = track.graphData?.velocity;
        if (mult && mult[stepIdx] != null) mult[stepIdx] = null;
      }
    } else {
      const g = (track.graphData ??= {});
      const lane = (g[graphParam] ??= []);
      while (lane.length <= stepIdx) lane.push(null);
      lane[stepIdx] = rawVal;
    }
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

  return (
    <div className="unbox-sequencer flex-1 flex overflow-hidden p-1.5 md:p-2.5 select-none">
      {/* LEFT ANODIZED TITANIUM CHEEK */}
      <div className="w-4 sm:w-5 flex-shrink-0 wooden-cheek rounded-l-xl flex flex-col justify-between items-center py-3 border-r border-amber-700/40 shadow-2xl select-none z-10">
        <div className="brass-screw" title="Anodized Hex Bolt" />
        <span className="text-[11px] font-mono font-black text-cyan-400/60 rotate-90 tracking-widest uppercase pointer-events-none">
          HI-FI DSP
        </span>
        <div className="brass-screw" title="Anodized Hex Bolt" />
      </div>

      {/* CENTER WORKSPACE CHASSIS */}
      <div className="unbox-sequencer-console flex-1 flex flex-col overflow-hidden font-sans border-y shadow-2xl">
        {/* 1. TOP MASTER WORKSTATION TOOLBAR: 7 VIEWS, PATTERN BANK, SOLO/TOGETHER PLAYBACK & GENERATOR HOST */}
        <div className="unbox-seq-toprail min-h-[50px] border-b px-3 py-1.5 flex flex-wrap items-center justify-between flex-shrink-0 gap-2">
          {/* Left: 7 Workstation View Tabs with Shortcut Badges + Internal Subsystem Inspector Trigger */}
          <div className={`flex items-center space-x-1 bg-[#1a140f] p-1 rounded-lg border border-[#796d5b]/50 overflow-x-auto ${hideViewTabs ? 'hidden' : ''}`}>
            {[
              { id: 'channel_rack', label: 'STEP GRID', hk: '⇧1', icon: Layers, inspectKey: 'step_grid' as InternalOptionCategory },
              { id: 'piano_roll', label: 'PIANO ROLL', hk: '⇧2', icon: Music, inspectKey: 'piano_roll' as InternalOptionCategory },
              { id: 'arrangement', label: 'ARRANGEMENT', hk: '⇧3', icon: Scissors, inspectKey: 'arrangement' as InternalOptionCategory },
              { id: 'graph_editor', label: 'GRAPH & CC', hk: '⇧4', icon: SlidersHorizontal, inspectKey: 'graph_cc' as InternalOptionCategory },
              { id: 'drum_editor', label: 'DRUM EDITOR', hk: '⇧5', icon: Grid, inspectKey: 'step_grid' as InternalOptionCategory },
              { id: 'loop_tracker', label: 'CLIPS & SCENES', hk: '⇧6', icon: Grid, inspectKey: 'f1_sequencer' as InternalOptionCategory },
            ].map((tab) => {
              const Icon = tab.icon;
              const isAct = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id as SequencerTabMode)}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all flex items-center space-x-1 flex-shrink-0 ${
                    isAct
                      ? 'bg-[#282016] text-[#ffc87a] border border-[#d69b50] shadow-[0_0_10px_rgba(214,155,80,0.45)]'
                      : 'text-[#c5baa7] hover:text-white hover:bg-[#2c2217]'
                  }`}
                  title={`${tab.label} [Shift+${tab.hk.replace('⇧', '')}]`}
                >
                  <Icon className={`w-3 h-3 ${isAct ? 'text-[#ffc87a]' : 'text-[#8a7a66]'}`} />
                  <span>{tab.label}</span>
                  <span className={`text-[11px] px-1 rounded ${isAct ? 'bg-[#ffc87a] text-black font-black' : 'bg-[#120e0a] text-[#d69b50] border border-[#d69b50]/30'}`}>
                    {tab.hk}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Center: Play Instrument Separately (SOLO) vs Together (ENSEMBLE); patterns are in the bar below */}
          <div className="flex items-center space-x-2 bg-black/50 px-2.5 py-1 rounded border border-neutral-800 text-[11px] font-mono">

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
                  ? 'bg-[#163238] text-[#00e5ff] border border-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.6)]'
                  : 'bg-neutral-800 hover:bg-[#163238] text-cyan-300 hover:text-white border border-[#2b5860]'
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
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <div className="hidden xl:flex items-center space-x-1 bg-black/40 px-2 py-1 rounded border border-neutral-800">
              <span className="text-neutral-400 font-bold">STEPS:</span>
              {[16, 32, 64, 128, 256].map((steps) => (
                <button
                  key={steps}
                  onClick={() => handleGridStepsChange(steps)}
                  className={`px-1.5 py-0.5 rounded font-bold ${
                    gridSteps === steps
                      ? 'bg-[#163238] text-[#00e5ff] border border-[#00e5ff]'
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
                  ? 'bg-[#163238] text-[#00e5ff] border-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.5)]'
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
                className="px-2.5 py-1 rounded bg-gradient-to-r from-[#163238] to-[#204952] hover:from-[#204952] hover:to-[#2a5e6a] text-[#c8f5f8] border border-[#32585f] text-xs font-mono font-bold flex items-center space-x-1 shadow-md cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD INSTRUMENT</span>
              </button>

              {showGeneratorMenu && (
                <div className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-[#141820] border-2 border-[#2b5860] rounded-lg shadow-2xl z-50 p-2 font-mono text-xs">
                  <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-2 px-2 pb-1 border-b border-neutral-800 flex justify-between items-center">
                    <span>ADD INSTRUMENT</span>
                    <span className="text-[11px] text-neutral-400">RECORDED + DSP</span>
                  </div>
                  <div className="space-y-1">
                    {onOpenStems && (
                      <button
                        onClick={() => {
                          setShowGeneratorMenu(false);
                          onOpenStems();
                        }}
                        className="w-full text-left px-2.5 py-2 mb-2 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/50 font-bold transition-all flex items-center justify-between group"
                      >
                        <span className="flex items-center gap-1.5">
                          <AudioLines className="w-3.5 h-3.5" />
                          <span>Audio Stems & Instruments…</span>
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-black/40 text-amber-300 font-bold">REAL</span>
                      </button>
                    )}
                    {[
                      ...RECORDED_INSTRUMENT_OPTIONS,
                      { type: 'wyvern' as DeviceType, name: 'Wyvern Synthesizer Module', desc: 'Stock virtual dual-wavetable, FM & comb-resonator dragon synth' },
                      { type: 'ember' as DeviceType, name: 'Ember Synthesizer Module', desc: 'Stock virtual thermal-drift, formant & tube warmth synth' },
                      { type: 'three_osc' as DeviceType, name: 'Tri-Osc Power Synth', desc: 'Triple oscillator subtractive synth' },
                      { type: 'sytrus' as DeviceType, name: 'Fusion FM Synthesizer', desc: 'FM operator & additive harmonics' },
                      { type: 'flex' as DeviceType, name: 'Romplex Advanced Rompler', desc: 'Modern acoustic & preset powerhouse' },
                      { type: 'subtractor' as DeviceType, name: 'Twin-Osc Analog Synth', desc: 'Dual-osc analog poly synth' },
                      { type: 'thor' as DeviceType, name: 'Thunderhead Polysonic Synth', desc: 'Semi-modular polysonic synth' },
                      { type: 'europa' as DeviceType, name: 'Aurora Wavetable Synth', desc: 'Spectral wavetable synthesizer' },
                      { type: 'monotone' as DeviceType, name: 'Monobass Synth', desc: 'Deep analog sub & acid bass' },
                      { type: 'redrum' as DeviceType, name: 'Beatbox 8 Drum Computer', desc: '8-pad vintage drum machine' },
                      { type: 'mimic' as DeviceType, name: 'Copycat Creative Sampler', desc: 'Multisample & acoustic sampler' },
                      { type: 'bansuri' as DeviceType, name: 'Bansuri Bamboo Flute', desc: 'Expressive woodwind flute' },
                      { type: 'dhol' as DeviceType, name: 'Dhol Folk Drum', desc: 'Double-headed punchy folk drum' },
                      { type: 'tumbi' as DeviceType, name: 'Tumbi Folk Resonator', desc: 'High-tension plucked string' },
                      { type: 'tanpura' as DeviceType, name: 'Tanpura & Drone Generator', desc: 'Harmonic overtone drone & string' },
                      { type: 'world_instrument' as DeviceType, customName: 'Royal Sitar', name: 'Royal Sitar (World)', desc: 'Resonant plucked string synth' },
                      { type: 'world_instrument' as DeviceType, customName: 'Alto Saxophone', name: 'Alto Saxophone (Brass/Wind)', desc: 'Warm expressive reed horn' },
                      { type: 'percussion_electronic' as DeviceType, customName: 'Tropical Steelpan & Marimba', name: 'Steelpan & Marimba', desc: 'Tuned mallet percussion' },
                    ].map((gen, i) => (
                      <button
                        key={`${gen.type}_${i}`}
                        onClick={() => handleAddGenerator(gen.type, (gen as any).customName)}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#064e3b] text-neutral-200 hover:text-emerald-100 transition-colors flex flex-col group"
                      >
                        <span className="font-bold text-white group-hover:text-emerald-300">{gen.name}</span>
                        <span className="text-[11px] text-neutral-400 group-hover:text-emerald-200/70">{gen.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 1.5 PATTERN BAR: unlimited patterns of the selected instrument */}
        <div className="unbox-seq-patternrail min-h-[34px] border-b px-3 py-1 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
          <PatternManager audioEngine={audioEngine} track={activeTrack} />
        </div>

        {/* 2. SECOND BAR: ACTIVE INSTRUMENT SWITCHER, PER-INSTRUMENT PATTERN GENERATOR & SCALE ENGINE */}
        <div className="unbox-seq-instrumentrail min-h-[40px] border-b px-3 py-1 flex flex-wrap items-center justify-between text-xs font-mono flex-shrink-0 gap-2">
          {/* Active Instrument Selector (Synced with Piano Roll & Bottom MIDI Keyboard) */}
          <div className="flex items-center space-x-2 bg-neutral-900/90 border border-[#2b5860] rounded px-2 py-0.5">
            <Music className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-cyan-300 font-bold uppercase">INSTRUMENT:</span>
            <select
              value={activeTrack?.id || ''}
              onChange={(e) => selectTrack(e.target.value)}
              className="bg-[#18202c] text-white text-xs font-mono font-bold px-2 py-0.5 rounded border border-[#2b5860] focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => auditionDeviceNote(activeDevice, 60 + audioEngine.rootKey, 0.9)}
              className="px-2 py-0.5 rounded bg-[#163238] hover:bg-[#204952] text-[#c8f5f8] border border-[#2b5860] text-[11px] font-bold cursor-pointer"
              title="Audition Active Instrument"
            >
              AUDITION
            </button>
          </div>

          {/* Per-Instrument Pattern Generator (Generates for Active Instrument OR All Together) */}
          <div className="flex items-center space-x-1.5 bg-neutral-900/90 border border-amber-500/40 rounded px-2 py-0.5">
            <Wand2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-amber-300 font-bold">PATTERN GENERATOR:</span>
            <select
              value={patternGenStyle}
              onChange={(e) => setPatternGenStyle(e.target.value as any)}
              className="bg-[#18202c] text-amber-200 text-[11px] font-bold px-1.5 py-0.5 rounded border border-amber-600/50"
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
              className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold"
              title="Generate pattern ONLY for the currently selected instrument without erasing other tracks"
            >
              GENERATE FOR {activeTrack?.name.split(' ')[0].toUpperCase() || 'INSTRUMENT'}
            </button>
            <button
              onClick={() => applyEnsembleStarter('industrial')}
              className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold"
              title="Generate synchronized patterns across ALL instruments to play together"
            >
              GENERATE ALL ENSEMBLE
            </button>
          </div>

          {/* Global Key & Scale Snapping Engine */}
          <div className="flex items-center space-x-1.5 bg-[#1a140f] border border-[#796d5b]/50 rounded px-2 py-0.5 text-[11px]">
            <span className="text-[#ffc87a] font-bold">KEY/SCALE:</span>
            <select
              value={audioEngine.rootKey}
              onChange={(e) => {
                audioEngine.rootKey = Number(e.target.value);
                setForceUpdate((x) => x + 1);
              }}
              className="bg-[#282016] text-[#ffc87a] font-bold px-1 py-0.5 rounded border border-[#d69b50]/60 outline-none"
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
              className="bg-[#282016] text-[#ffc87a] font-bold px-1.5 py-0.5 rounded border border-[#d69b50]/60 outline-none"
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
        <div className="unbox-seq-songrail border-b px-3 py-2 flex flex-col gap-2 flex-shrink-0 font-mono text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Song & Pattern Playback Detector Engine Status */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {/* Playback Scope Mode Switcher */}
              <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                {(
                  [
                    { id: 'song_arrangement', label: 'SONG · CLIPS', help: 'Playback follows clips placed across the song arrangement.' },
                    { id: 'pattern_loop', label: 'PATTERN · LOOP', help: 'Playback loops the selected pattern on each track, independent of song clip placement.' },
                  ] as const
                ).map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => audioEngine.setPlaybackMode(pm.id)}
                    aria-label={pm.help}
                    aria-pressed={audioEngine.playbackMode === pm.id}
                    title={pm.help}
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
                  {currentStep >= 0 ? currentStep + 1 : '–'} / {gridSteps}
                </strong>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-300 font-bold">{audioEngine.activeArrangementSection}</span>
              </div>
            </div>

            {/* Right: song mini-scrubber (as many bars as the song, plus room) */}
            <div className="flex items-center space-x-1.5 flex-wrap">
              <div className="flex items-center space-x-0.5 bg-slate-950 p-1 rounded border border-slate-800 max-w-[42vw] overflow-x-auto">
                <span className="text-[11px] text-slate-400 mr-1 font-bold flex-shrink-0">BARS:</span>
                {Array.from({ length: Math.max(16, audioEngine.totalSongBars + 4, audioEngine.currentSongBar + 1) }).map((_, bIdx) => {
                  const isCurBar = audioEngine.currentSongBar === bIdx;
                  const hasClipAtBar = tracks.some((t) =>
                    t.arrangementClips?.some(
                      (c) => !c.muted && bIdx >= c.startBar && bIdx < c.startBar + c.lengthBars
                    )
                  );
                  return (
                    <button
                      key={bIdx}
                      onClick={() => audioEngine.jumpToSongBar(bIdx)}
                      className={`min-w-4 px-0.5 h-4 rounded-xs text-[11px] font-bold transition-all flex-shrink-0 ${
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

          {activeDevice?.type === 'tabla' && (
            <div className="flex items-center space-x-1 pt-1 border-t border-slate-800/80">
              <span className="text-[11px] text-amber-300 font-black mr-1">TABLA BOLS:</span>
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
                  className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-black text-[11px]"
                  title={`Audition Tabla ${bol.b} Bol`}
                >
                  {bol.b}
                </button>
              ))}
            </div>
          )}
        </div>

        <TrackPanel
          audioEngine={audioEngine}
          track={allTracks.find((t) => t.id === selectedTrackId) ?? activeTrack}
          onOpenRack={onSelectDeviceForRack}
          onOpenMixer={onNavigateToMixerTrack}
        />

        {/* 3. MAIN WORKSPACE VIEW */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* VIEW MODE A: CHANNEL RACK INTERACTIVE STEP SEQUENCER GRID */}
          {viewMode === 'channel_rack' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Group filter bar */}
              <div className="h-8 bg-[#0e1117] border-b border-neutral-800 px-3 flex items-center justify-between text-[11px] font-mono flex-shrink-0">
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
                  <span>PLAYHEAD: <strong className="text-amber-400">STEP {currentStep >= 0 ? currentStep + 1 : '–'}</strong></span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-auto p-2 space-y-1.5 bg-[#100d0a]">
                {tracks.length === 0 && (
                  <div className="my-4 max-w-4xl mx-auto p-5 rounded-xl us-metal border border-[#796d5b] shadow-2xl text-center space-y-4 font-mono text-ink">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#282016] text-[#ffc87a] border border-[#d69b50]/60 text-xs font-black">
                      <Sparkles className="w-4 h-4 text-[#ffc87a]" />
                      <span>MANUAL STUDIO UNBOXING // EMPTY SESSION CRATE</span>
                    </div>
                    <h3 className="text-sm md:text-base font-black text-[#282016] tracking-wide">
                      NO INSTRUMENTS MOUNTED YET &mdash; ADD YOUR FIRST INSTRUMENT OR DEVICE MANUALLY
                    </h3>
                    <p className="text-xs text-ink/80 max-w-2xl mx-auto">
                      Every instrument or device you mount here or in the <strong className="text-[#8d5b24]">Modular Rack [F6]</strong> is automatically synchronized across the <strong className="text-[#3b6647]">Sequencer Step Grid</strong>, <strong className="text-[#b87c32]">Piano Roll</strong>, and <strong className="text-[#40352a]">500-Track Mixer [F5]</strong>.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {[
                        { type: 'tabla' as DeviceType, label: '+ Tabla (Dayan & Bayan)', color: 'bg-amber-500 hover:bg-amber-400 text-slate-950' },
                        { type: 'dhol' as DeviceType, label: '+ Dhol Folk Drum', color: 'bg-orange-500 hover:bg-orange-400 text-slate-950' },
                        { type: 'subtractor' as DeviceType, label: '+ Twin-Osc Analog Synth', color: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950' },
                        { type: 'europa' as DeviceType, label: '+ Aurora Wavetable Synth', color: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' },
                        { type: 'wyvern' as DeviceType, label: '+ Wyvern Dragon Synth', color: 'bg-sky-500 hover:bg-sky-400 text-slate-950' },
                        { type: 'redrum' as DeviceType, label: '+ Beatbox 8 Drum Computer', color: 'bg-rose-500 hover:bg-rose-400 text-white' },
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
                  const rowLen = syncTrackPatterns(track, audioEngine.activePatternIndex).length;
                  const rowStep = stepPlayingOf(track);

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
                      <div className="w-[460px] flex-shrink-0 flex items-center space-x-2 px-2 border-r border-neutral-800">
                        {/* Mute & Solo Toggles */}
                        <div className="flex flex-col space-y-1">
                          <button
                            onClick={() => audioEngine.toggleTrackMute(track.id)}
                            className={`w-5 h-4 rounded text-[11px] font-mono font-bold flex items-center justify-center transition-colors ${
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
                            className={`w-5 h-4 rounded text-[11px] font-mono font-bold flex items-center justify-center transition-colors ${
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
                          <span className="text-[11px] font-mono text-neutral-400 -mt-1">VOL</span>
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
                          <span className="text-[11px] font-mono text-neutral-400 -mt-1">PAN</span>
                        </div>

                        {/* Mixer Routing Assignment Spinner */}
                        <div className="flex flex-col items-center bg-black/60 px-1.5 py-1 rounded border border-neutral-800 text-center">
                          <div className="text-[11px] font-mono text-neutral-500 font-bold uppercase">MIX</div>
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
                            className={`flex-1 min-w-[110px] flex items-center space-x-1.5 cursor-pointer py-1 px-1.5 rounded transition-colors ${
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
                            <div className="absolute left-0 mt-1 w-48 bg-[#141820] border-2 border-emerald-600 rounded-md shadow-2xl z-50 p-1.5 text-[11px] font-mono">
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

                      {/* STEP SEQUENCER GRID (each row shows its own active pattern) */}
                      <div className="flex-1 flex overflow-x-auto py-1 px-2 space-x-1 items-center">
                        {Array.from({ length: rowLen }).map((_, stepIdx) => {
                          const covering = findCoveringNote(track, stepIdx);
                          const isHead = !!track.steps[stepIdx];
                          const isTail = !isHead && !!covering;
                          const isCurrent = rowStep === stepIdx;
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
                                <span className="text-[11px] font-mono font-black text-black">
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
            <div className="flex-1 flex items-center justify-center p-6 bg-[#100d0a] font-mono">
              <div className="max-w-2xl w-full p-6 rounded-xl us-metal border border-[#796d5b] text-center space-y-4 shadow-2xl">
                <div className="text-xs font-black text-[#282016] uppercase tracking-widest">
                  PIANO ROLL &amp; GRAPH EDITOR // INSTRUMENT REQUIRED
                </div>
                <p className="text-xs text-ink/80">
                  Mount an instrument manually below (or from the Modular Rack) to begin editing notes on the Piano Roll:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[
                    { type: 'tabla' as DeviceType, label: '+ Tabla (Dayan & Bayan)' },
                    { type: 'dhol' as DeviceType, label: '+ Dhol Folk Drum' },
                    { type: 'subtractor' as DeviceType, label: '+ Twin-Osc Synth' },
                    { type: 'europa' as DeviceType, label: '+ Aurora Wavetable' },
                    { type: 'wyvern' as DeviceType, label: '+ Wyvern Synth' },
                    { type: 'redrum' as DeviceType, label: '+ Beatbox 8 Drums' },
                    { type: 'bansuri' as DeviceType, label: '+ Bansuri Flute' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => handleAddGenerator(item.type)}
                      className="px-3 py-1.5 rounded-[5px] us-btn-light border border-[#7d6b52] text-[#2b2117] hover:bg-[#ffc87a] hover:text-black font-black text-xs transition-all shadow-sm"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE B: FULL MULTI-STEP NOTE-EDITING PIANO ROLL WITH HARDWARE WORKSTATION CONSOLE */}
          {viewMode === 'piano_roll' && activeTrack && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#100d0a]">
              {(audioActionBusy || audioActionError) && (
                <p role={audioActionError ? 'alert' : 'status'} className="px-3 py-2 text-sm text-[#ffd699]">
                  {audioActionError ?? 'Rendering track audio…'}
                </p>
              )}
              {/* HARDWARE WORKSTATION CONSOLE (Vintage cream chassis, dark LCD, 6 aluminum knobs, note/clip inspector) */}
              <PianoRollHardwareConsole
                audioEngine={audioEngine}
                activeTrack={activeTrack}
                tracks={tracks}
                activeDevice={activeDevice}
                pianoTool={pianoTool}
                setPianoTool={setPianoTool}
                defaultNoteLength={defaultNoteLength}
                setDefaultNoteLength={setDefaultNoteLength}
                handleBatchNoteLengthTransform={handleBatchNoteLengthTransform}
                handleAudioAction={handleAudioAction}
                selectTrack={selectTrack}
                auditionDeviceNote={auditionDeviceNote}
                defaultRatchet={defaultRatchet}
                setDefaultRatchet={setDefaultRatchet}
                defaultProbability={defaultProbability}
                setDefaultProbability={setDefaultProbability}
                chordStamp={chordStamp}
                setChordStamp={setChordStamp}
                handleTransformTrackNotes={handleTransformTrackNotes}
                cellWidth={cellWidth}
                setCellWidth={setCellWidth}
                rowHeight={rowHeight}
                setRowHeight={setRowHeight}
                gridSnapInterval={gridSnapInterval}
                setGridSnapInterval={setGridSnapInterval}
                magneticGridSnap={magneticGridSnap}
                setMagneticGridSnap={setMagneticGridSnap}
                showScaleGuides={showScaleGuides}
                setShowScaleGuides={setShowScaleGuides}
                showGhostNotes={showGhostNotes}
                setShowGhostNotes={setShowGhostNotes}
                gridSteps={gridSteps}
                setForceUpdate={setForceUpdate}
              />

              {/* MAIN PIANO ROLL: canvas, all 128 notes, unlimited length (src/components/sequencer/pianoRoll) */}
              <PatternPianoRoll
                audioEngine={audioEngine}
                track={activeTrack}
                tracks={tracks}
                tool={pianoTool}
                onToolChange={setPianoTool}
                snap={magneticGridSnap ? (gridSnapInterval === 3 ? 2 / 3 : gridSnapInterval) : 0}
                defaultLength={defaultNoteLength}
                chordOffsets={getChordOffsets(chordStamp)}
                newNoteMeta={{
                  ...(defaultRatchet > 1 ? { ratchet: defaultRatchet } : {}),
                  ...(defaultProbability < 1 ? { probability: defaultProbability } : {}),
                }}
                showScale={showScaleGuides}
                showGhosts={showGhostNotes}
                zoomX={cellWidth}
                zoomY={rowHeight}
                onZoomChange={(x, y) => {
                  setCellWidth(x);
                  setRowHeight(y);
                }}
                onAudition={(n, v) => auditionDeviceNote(activeDevice, n, v)}
                isDrumKit={activeDevice?.type === 'redrum'}
                padNames={activeDevice instanceof SpecDevice && activeDevice.spec.pads ? new Map(activeDevice.spec.pads.map((pd) => [pd.note, pd.name])) : undefined}
              />
            </div>
          )}

          {/* GRAPH & CC: per-step lanes of the edited pattern */}
          {viewMode === 'graph_editor' && activeTrack && (() => {
            const lane = GRAPH_LANES.find((l) => l.id === graphParam) ?? GRAPH_LANES[0];
            const noteLane = graphParam === 'velocity' || graphParam === 'chance';
            const valueAt = (i: number): number | null => {
              const n = activeTrack.steps[i];
              if (graphParam === 'velocity') return n ? n.velocity : null;
              if (graphParam === 'chance') return n ? n.probability ?? 1 : null;
              return activeTrack.graphData?.[graphParam]?.[i] ?? null;
            };
            const fill = (fn: (i: number) => number) => {
              for (let i = 0; i < gridSteps; i++) handleGraphValueChange(activeTrack, i, fn(i));
              audioEngine.commitEdit();
            };
            const label = (v: number) =>
              graphParam === 'pitch'
                ? `${v > 0 ? '+' : ''}${v} st`
                : graphParam === 'cutoff'
                ? `${Math.round(audioEngine.normalizeCutoffToHz(Math.max(0.05, v)))} Hz`
                : graphParam === 'velocity'
                ? `${Math.round(v * 127)}`
                : `${Math.round(v * 100)}%`;
            return (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10] p-3" data-testid="graph-editor">
                <div className="h-10 bg-[#12161f] rounded-t-lg border border-neutral-800 px-3 flex items-center justify-between text-xs font-mono flex-shrink-0 overflow-x-auto gap-2">
                  <div className="flex items-center space-x-1">
                    <span className="text-neutral-400 font-bold text-[11px] mr-1">LANE:</span>
                    {GRAPH_LANES.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setGraphParam(l.id)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                          graphParam === l.id ? 'bg-[#163238] text-[#00e5ff] border border-[#00e5ff]' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center space-x-1 text-[11px]">
                    <button onClick={() => fill((i) => lane.fromNorm(i / Math.max(1, gridSteps - 1)))} className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#163238] hover:text-[#00e5ff] text-neutral-200">RAMP UP</button>
                    <button onClick={() => fill((i) => lane.fromNorm(0.5 + 0.45 * Math.sin((i / gridSteps) * Math.PI * 2)))} className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-[#163238] hover:text-[#00e5ff] text-neutral-200">SINE</button>
                    {!noteLane && (
                      <button
                        onClick={() => {
                          if (activeTrack.graphData && !noteLane) delete activeTrack.graphData[graphParam as 'pitch' | 'cutoff' | 'resonance'];
                          audioEngine.commitEdit();
                          setForceUpdate((x) => x + 1);
                        }}
                        className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-red-800 text-neutral-200"
                      >
                        CLEAR LANE
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-neutral-500 px-1 py-1">{lane.hint}</div>
                <div className="flex-1 overflow-x-auto bg-[#0d1015] border-x border-b border-neutral-800 rounded-b-lg p-3 flex items-end space-x-1">
                  {Array.from({ length: gridSteps }).map((_, stepIdx) => {
                    const hasNote = !!activeTrack.steps[stepIdx];
                    const editable = !noteLane || hasNote;
                    const v = valueAt(stepIdx);
                    const h = v === null ? 0 : lane.toNorm(v) * 100;
                    return (
                      <div
                        key={stepIdx}
                        data-step={stepIdx}
                        className={`flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center group relative ${editable ? 'cursor-ns-resize' : 'cursor-not-allowed'}`}
                        title={editable ? `Step ${stepIdx + 1}${v === null ? ' · empty (the knob rules)' : ' · ' + label(v)}` : `Step ${stepIdx + 1} · no note`}
                        onMouseDown={(e) => {
                          if (!editable) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const update = (ev: { clientY: number }) => {
                            const ratio = Math.max(0, Math.min(rect.height, rect.bottom - ev.clientY)) / rect.height;
                            handleGraphValueChange(activeTrack, stepIdx, lane.fromNorm(ratio));
                          };
                          update(e);
                          const onUp = () => {
                            window.removeEventListener('mousemove', update);
                            window.removeEventListener('mouseup', onUp);
                            audioEngine.commitEdit();
                          };
                          window.addEventListener('mousemove', update);
                          window.addEventListener('mouseup', onUp);
                        }}
                      >
                        <span className="text-[11px] font-mono text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                          {v === null ? '—' : label(v)}
                        </span>
                        <div className={`w-2.5 h-full rounded-full relative flex items-end justify-center border ${editable ? 'bg-[#151922] border-neutral-800' : 'bg-[#0f1218] border-neutral-900'}`}>
                          {v !== null && (
                            <>
                              <div className={`w-full rounded-full ${hasNote ? 'bg-gradient-to-t from-[#065f46] via-[#10b981] to-[#34d399]' : 'bg-neutral-600'}`} style={{ height: `${Math.max(4, h)}%` }} />
                              <div className="absolute w-4 h-2 rounded bg-white shadow-md border border-neutral-300 pointer-events-none" style={{ bottom: `calc(${h}% - 4px)` }} />
                            </>
                          )}
                        </div>
                        <span className={`text-[11px] font-mono mt-1 ${currentStep === stepIdx ? 'text-amber-400 font-bold' : 'text-neutral-500'}`}>{stepIdx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* VIEW MODE D: UNLIMITED ARRANGEMENT TIMELINE */}
          {viewMode === 'arrangement' && (
            <ArrangementTimeline
              audioEngine={audioEngine}
              tracks={allTracks}
              activeTrack={allTracks.find((t) => t.id === selectedTrackId) ?? activeTrack}
              onSelectTrack={selectTrack}
              onEditPattern={(trackId, patternId) => {
                audioEngine.sequencer.selectPattern(trackId, patternId);
                selectTrack(trackId);
                setViewMode('piano_roll');
              }}
              onAudition={(trackId, note, vel) => {
                const t = tracks.find((x) => x.id === trackId);
                auditionDeviceNote(t ? devices.find((d) => d.id === t.deviceId) : null, note, vel);
              }}
            />
          )}

          {/* DRUM EDITOR: one row per pad of the selected drum machine */}
          {viewMode === 'drum_editor' && (
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-2" data-testid="drum-editor">
              {(() => {
                const kits = tracks.filter((t) => drumLanesFor(devices.find((d) => d.id === t.deviceId)));
                const kitTrack = activeTrack && drumLanesFor(devices.find((d) => d.id === activeTrack.deviceId)) ? activeTrack : kits[0];
                const lanes = kitTrack ? drumLanesFor(devices.find((d) => d.id === kitTrack.deviceId)) : null;
                if (!kitTrack || !lanes) {
                  return <div className="text-slate-400 text-[11px] p-4">No drum machine in this project yet. Add one from the Drums page (Boomtown, Beatcenter, Atlas, Beatbox 8 …), then edit every pad here.</div>;
                }
                return (
                  <>
                    <div className="text-[11px] text-slate-400">Drum machine: <span className="text-white font-bold">{kitTrack.name}</span> · click / drag to paint hits · Shift = accent · Alt = soft · each pad keeps its own velocity</div>
                    <StepEditor track={kitTrack} tracks={kits} lanes={lanes} rowHeight={24} onSelectTrack={(id) => { const t = tracks.find((x) => x.deviceId === id); if (t) selectTrack(t.id); }} force={() => setForceUpdate((x) => x + 1)} />
                  </>
                );
              })()}
            </div>
          )}

          {viewMode === 'loop_tracker' && (
            <ClipLauncherPanel audioEngine={audioEngine} tracks={tracks} activeTrack={activeTrack} onSelectTrack={selectTrack} />
          )}
        </div>
      </div>

      {/* RIGHT ANODIZED TITANIUM CHEEK */}
      <div className="w-4 sm:w-5 flex-shrink-0 wooden-cheek rounded-r-xl flex flex-col justify-between items-center py-3 border-l border-amber-700/40 shadow-2xl select-none z-10">
        <div className="brass-screw" title="Anodized Hex Bolt" />
        <span className="text-[11px] font-mono font-black text-cyan-400/60 -rotate-90 tracking-widest uppercase pointer-events-none">
          HI-FI DSP
        </span>
        <div className="brass-screw" title="Anodized Hex Bolt" />
      </div>
    </div>
  );
};
