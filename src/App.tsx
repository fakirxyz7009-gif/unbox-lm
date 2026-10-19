import React, { useState, useEffect, useRef } from 'react';
import { audioEngine } from './audio/AudioEngine.ts';
import { BaseDevice } from './audio/BaseDevice.ts';
import { DeviceType, WorkspaceViewMode, InternalOptionCategory, AdvancedOptionCategory } from './audio/types.ts';
import { HeaderTransport } from './components/HeaderTransport.tsx';
import { RackUnitContainer } from './components/RackUnitContainer.tsx';
import { DeviceFaceplate } from './components/faceplates/DeviceFaceplate.tsx';
import { CablePatchBay } from './components/CablePatchBay.tsx';
import { CVMatrixModal } from './components/CVMatrixModal.tsx';
import { AICoPilotDrawer } from './components/AICoPilotDrawer.tsx';
import { StudioKeyboard } from './components/StudioKeyboard.tsx';
import { SequencerView } from './components/sequencer/SequencerView.tsx';
import { MixerConsoleView, RightColumnStudioMixer } from './components/mixer/MixerConsoleView.tsx';
import { ToolWindowF8 } from './components/panels/ToolWindowF8.tsx';
import { InternalSubsystemInspectorModal } from './components/InternalSubsystemInspectorModal.tsx';
import { ShortcutHelpModal } from './components/ShortcutHelpModal.tsx';
import { CommandAndStageOverlays, VisualizerThemeProfile } from './components/CommandAndStageOverlays.tsx';
import { soundFontEngine } from './audio/SoundFontEngine.ts';
import {
  AlertCircle,
  CheckCircle2,
  Keyboard,
  Sparkles,
  Sliders,
  Layers,
  Music,
  Cpu,
  Volume2,
  Search,
  Compass,
  Maximize2,
  Download,
  Folder,
  FolderOpen,
  FileAudio,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  Play,
  Plus,
} from 'lucide-react';

interface BrowserFolderNode {
  id: string;
  label: string;
  category: 'Browser' | 'Samples' | 'Presets' | 'Effects';
  deviceType: DeviceType;
  customName: string;
  children: { id: string; name: string; type: DeviceType; presetHint?: string }[];
}

const STUDIO_BROWSER_TREE: BrowserFolderNode[] = [
  {
    id: '808s',
    label: '808s',
    category: 'Samples',
    deviceType: 'monotone',
    customName: '808 Sub Bass Synth',
    children: [
      { id: '808_clean', name: '808 Clean Sub Glide.sf2', type: 'monotone' },
      { id: '808_dist', name: '808 Tape Saturated.sf2', type: 'subtractor' },
      { id: '808_kit', name: 'TR-808 Drum Machine Kit', type: 'redrum' },
    ],
  },
  {
    id: 'acoustic_drums',
    label: 'Acoustic Drums',
    category: 'Samples',
    deviceType: 'kong',
    customName: 'Acoustic Studio Drum Kit',
    children: [
      { id: 'ac_kit_1', name: 'FluidR3 Studio Maple Kit.sf2', type: 'kong' },
      { id: 'ac_tabla', name: 'Royal Banaras Tabla Pair.sf2', type: 'tabla' },
      { id: 'ac_dhol', name: 'Punjabi Bhangra Dhol.sf2', type: 'dhol' },
      { id: 'ac_redrum', name: 'Vintage Breakbeat Sampler', type: 'redrum' },
    ],
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    category: 'Presets',
    deviceType: 'combinator',
    customName: 'Cinematic Combinator Stack',
    children: [
      { id: 'cin_brass', name: 'Blade Runner CS-80 Brass', type: 'combinator' },
      { id: 'cin_piano', name: 'Concert Grand Piano.sf2', type: 'radical_piano' },
      { id: 'cin_santoor', name: 'Kashmiri 100-String Santoor.sf2', type: 'santoor' },
    ],
  },
  {
    id: 'synth_leads',
    label: 'Synth Leads',
    category: 'Presets',
    deviceType: 'combinator',
    customName: 'Combinator Poly Lead',
    children: [
      { id: 'lead_comb', name: 'Combinator Polyphonic Lead', type: 'combinator' },
      { id: 'lead_thor', name: 'Thor Polysonic Lead', type: 'thor' },
      { id: 'lead_europa', name: 'Europa Spectral Lead', type: 'europa' },
      { id: 'lead_wyvern', name: 'Wyvern Cyber Dragon Lead', type: 'wyvern' },
    ],
  },
  {
    id: 'synth_pads',
    label: 'Synth Pads',
    category: 'Presets',
    deviceType: 'europa',
    customName: 'Warm Horizon Synth Pad',
    children: [
      { id: 'pad_europa', name: 'Lush Analog Horizon Pad', type: 'europa' },
      { id: 'pad_harm', name: 'Vedic Reed Harmonium.sf2', type: 'harmonium' },
      { id: 'pad_tanpura', name: 'Classical Tanpura Jivari Drone', type: 'tanpura' },
    ],
  },
  {
    id: 'bass',
    label: 'Bass',
    category: 'Presets',
    deviceType: 'subtractor',
    customName: 'Subtractor Analog Bass',
    children: [
      { id: 'bass_sub', name: 'Subtractor Reese Bass', type: 'subtractor' },
      { id: 'bass_mono', name: 'Monotone Acid 303 Bass', type: 'monotone' },
      { id: 'bass_fm', name: 'Algoritm FM Pluck Bass', type: 'algoritm' },
    ],
  },
  {
    id: 'guitars',
    label: 'Guitars',
    category: 'Samples',
    deviceType: 'world_instrument',
    customName: 'Acoustic Nylon Guitar.sf2',
    children: [
      { id: 'gtr_nylon', name: 'Spanish Nylon Guitar.sf2', type: 'world_instrument' },
      { id: 'gtr_sitar', name: 'Royal Miraj Sitar (Jivari).sf2', type: 'sitar' },
      { id: 'gtr_sarod', name: 'Classical Fretless Sarod.sf2', type: 'sarod' },
      { id: 'gtr_tumbi', name: 'Punjabi Folk Tumbi Pluck.sf2', type: 'tumbi' },
    ],
  },
  {
    id: 'vocals',
    label: 'Vocals',
    category: 'Samples',
    deviceType: 'bansuri',
    customName: 'Vocal & Bansuri Flute Choir',
    children: [
      { id: 'voc_bansuri', name: 'Vrindavan Bamboo Bansuri.sf2', type: 'bansuri' },
      { id: 'voc_choir', name: 'Formant Choir & Vocal Pad', type: 'ember' },
      { id: 'voc_mimic', name: 'Mimic Vocal Chop Sampler', type: 'mimic' },
    ],
  },
  {
    id: 'ambience',
    label: 'Ambience',
    category: 'Effects',
    deviceType: 'rv7000',
    customName: 'RV-7000 Advanced Reverb',
    children: [
      { id: 'amb_rv7000', name: 'RV-7000 MkII Convolution Hall', type: 'rv7000' },
      { id: 'amb_echo', name: 'The Echo Tape Ping-Pong', type: 'echo' },
      { id: 'amb_rv9', name: 'RV-9 Shimmer Cathedral', type: 'rv9' },
    ],
  },
  {
    id: 'fx',
    label: 'FX',
    category: 'Effects',
    deviceType: 'scream4',
    customName: 'Scream 4 Sound Destruction',
    children: [
      { id: 'fx_scream4', name: 'Scream 4 Tube Distortion', type: 'scream4' },
      { id: 'fx_mclass', name: 'MClass Mastering Compressor', type: 'mclass_master' },
      { id: 'fx_pulveriser', name: 'Pulveriser Parallel Smash', type: 'pulveriser' },
      { id: 'fx_pulsar', name: 'Pulsar Dual CV LFO', type: 'pulsar' },
    ],
  },
];

export default function App() {
  const [devices, setDevices] = useState<BaseDevice[]>(() =>
    Array.from(audioEngine.devices.values())
  );
  const [audioConnections, setAudioConnections] = useState(() => audioEngine.audioConnections);
  const [cvConnections, setCvConnections] = useState(() => audioEngine.cvConnections);
  const [tracks, setTracks] = useState(() => [...audioEngine.tracks]);

  // Parallel / Linear / Modular Grid / 3-Column Studio Workspace Multi-View state
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('sequencer');
  const [isParallelView, setIsParallelView] = useState(false);
  const [bottomParallelPanel, setBottomParallelPanel] = useState<'rack' | 'mixer'>('mixer');
  const [selectedMixerTrack, setSelectedMixerTrack] = useState<number>(1);

  // Left Column Smart Asset & Plugin Browser state
  const [isLeftBrowserOpen, setIsLeftBrowserOpen] = useState<boolean>(true);
  const [browserTab, setBrowserTab] = useState<'Browser' | 'Samples' | 'Presets' | 'Effects'>('Browser');
  const [browserSearch, setBrowserSearch] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    '808s': true,
    acoustic_drums: true,
    synth_leads: true,
    guitars: true,
    fx: true,
  });
  const [centerBottomMode, setCenterBottomMode] = useState<'arrangement' | 'sequencer'>('arrangement');

  // Modular Studio Grid System State ('studio_3col' | 'single' | 'parallel_h' | 'parallel_v' | 'linear_stack' | 'modular_grid')
  type StudioTopologyMode = 'studio_3col' | 'single' | 'parallel_h' | 'parallel_v' | 'linear_stack' | 'modular_grid';
  type GridBodyType = 'sequencer' | 'mixer' | 'rack' | 'cv_matrix' | 'f8_tools' | 'unbox_crate';
  interface StudioGridCell {
    id: string;
    bodyType: GridBodyType;
    title: string;
    colSpan: 1 | 2;
    heightClass: string;
  }
  const [topologyMode, setTopologyMode] = useState<StudioTopologyMode>('studio_3col');
  const [gridCells, setGridCells] = useState<StudioGridCell[]>([
    { id: 'cell-seq', bodyType: 'sequencer', title: 'MAIN SEQUENCER & SONG ARRANGEMENT ENGINE', colSpan: 2, heightClass: 'h-[520px]' },
    { id: 'cell-mix', bodyType: 'mixer', title: '500-CH SSL MIXING CONSOLE', colSpan: 1, heightClass: 'h-[480px]' },
    { id: 'cell-rack', bodyType: 'rack', title: 'CV MODULATION & SOUND GENERATOR RACK', colSpan: 1, heightClass: 'h-[480px]' },
  ]);

  const addGridCell = (bodyType: GridBodyType = 'mixer') => {
    const titles: Record<GridBodyType, string> = {
      sequencer: 'SEQUENCER & PIANO ROLL',
      mixer: '500-CH MIXING CONSOLE',
      rack: 'MODULAR RACK & CV PATCH BAY',
      cv_matrix: 'CV MODULATION MATRIX & ROUTING',
      f8_tools: 'SURGICAL PRODUCTION TOOLS & SCALES',
      unbox_crate: 'HARDWARE UNBOXING CRATE & LAUNCHER',
    };
    setGridCells((prev) => [
      ...prev,
      {
        id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        bodyType,
        title: titles[bodyType],
        colSpan: bodyType === 'sequencer' ? 2 : 1,
        heightClass: 'h-[480px]',
      },
    ]);
    if (topologyMode === 'single') {
      setTopologyMode('modular_grid');
    }
    showToast(`Added ${titles[bodyType]} cell to Modular Grid`, 'success');
  };

  const removeGridCell = (cellId: string) => {
    setGridCells((prev) => prev.filter((c) => c.id !== cellId));
    showToast('Removed workspace body from grid', 'info');
  };

  const updateGridCellBody = (cellId: string, bodyType: GridBodyType) => {
    const titles: Record<GridBodyType, string> = {
      sequencer: 'SEQUENCER & PIANO ROLL',
      mixer: '500-CH MIXING CONSOLE',
      rack: 'MODULAR RACK & CV PATCH BAY',
      cv_matrix: 'CV MODULATION MATRIX & ROUTING',
      f8_tools: 'SURGICAL PRODUCTION TOOLS & SCALES',
      unbox_crate: 'HARDWARE UNBOXING CRATE & LAUNCHER',
    };
    setGridCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, bodyType, title: titles[bodyType] } : c))
    );
  };

  const toggleGridCellSpan = (cellId: string) => {
    setGridCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, colSpan: c.colSpan === 2 ? 1 : 2 } : c))
    );
  };

  const [isBackView, setIsBackView] = useState(false);
  const [isCVMatrixOpen, setIsCVMatrixOpen] = useState(false);
  const [isAICoPilotOpen, setIsAICoPilotOpen] = useState(false);
  const [internalInspectorCategory, setInternalInspectorCategory] = useState<InternalOptionCategory | null>(null);
  const [advancedInspectorCategory, setAdvancedInspectorCategory] = useState<AdvancedOptionCategory | null>(null);
  const [activePlayableDeviceId, setActivePlayableDeviceId] = useState<string | null>(
    () => audioEngine.tracks[0]?.deviceId || null
  );
  const [isF8Open, setIsF8Open] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(true);

  // New Core Overlays & Visualizers State
  const [isCommandSearchOpen, setIsCommandSearchOpen] = useState(false);
  const [pieMenuPos, setPieMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isStageModeOpen, setIsStageModeOpen] = useState(false);
  const [isBatchExporterOpen, setIsBatchExporterOpen] = useState(false);
  const [activeVisualizerTheme, setActiveVisualizerTheme] = useState<VisualizerThemeProfile>('Synthwave');
  const [externalSeqTab, setExternalSeqTab] = useState<{ tab: string; seq: number } | null>(null);

  // Active jack connection state when routing cables on back rack
  const [activeConnectingJack, setActiveConnectingJack] = useState<{
    deviceId: string;
    portId: string;
    type: string;
  } | null>(null);

  // User friendly feedback toast
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const rackContainerRef = useRef<HTMLDivElement>(null);
  const [, setRerender] = useState(0);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast((cur) => (cur?.message === message ? null : cur));
    }, 3200);
  };

  // Sync state with audio engine
  useEffect(() => {
    const unsub = audioEngine.subscribe(() => {
      setDevices(Array.from(audioEngine.devices.values()));
      setAudioConnections([...audioEngine.audioConnections]);
      setCvConnections([...audioEngine.cvConnections]);
      setTracks([...audioEngine.tracks]);
      setRerender((r) => r + 1);
    });
    return unsub;
  }, []);

  // Execute action from ShortcutHelpModal or Quick Ribbon
  const handleTriggerShortcutAction = (actionId: string) => {
    switch (actionId) {
      case 'view_sequencer':
        setViewMode('sequencer');
        setIsParallelView(false);
        setTopologyMode('single');
        showToast('Switched to Sequencer [F1]', 'info');
        break;
      case 'view_mixer':
        setViewMode('mixer');
        setIsParallelView(false);
        setTopologyMode('single');
        showToast('Switched to Mixing Console [F2]', 'info');
        break;
      case 'view_rack':
        setViewMode('rack');
        setIsParallelView(false);
        setTopologyMode('single');
        showToast('Switched to Device Rack [F3]', 'info');
        break;
      case 'toggle_split':
        setIsParallelView((v) => {
          const next = !v;
          setTopologyMode(next ? 'parallel_v' : 'single');
          return next;
        });
        showToast(!isParallelView ? 'Enabled Parallel Split View [F4]' : 'Disabled Parallel Split View', 'info');
        break;
      case 'toggle_f8':
        setIsF8Open((v) => !v);
        showToast(!isF8Open ? 'Opened F8 Surgical Tool Panel' : 'Closed F8 Surgical Tool Panel', 'info');
        break;
      case 'flip_rack':
        setIsBackView((v) => !v);
        showToast(isBackView ? 'Front Hardware Controls [Tab]' : 'Rear Modular Patch Bay [Tab]', 'info');
        break;
      case 'toggle_copilot':
        setIsAICoPilotOpen((v) => !v);
        break;
      case 'toggle_inspector':
        setInternalInspectorCategory((cur) => (cur ? null : 'unboxed_gold'));
        break;
      case 'toggle_cv_matrix':
        setIsCVMatrixOpen((v) => !v);
        break;
      case 'toggle_keyboard':
        setIsKeyboardVisible((v) => !v);
        showToast(isKeyboardVisible ? 'Hidden Studio Keyboard [Alt+K]' : 'Shown Studio Keyboard [Alt+K]', 'info');
        break;
      case 'play_stop':
        audioEngine.togglePlay();
        showToast(audioEngine.isPlaying ? 'Transport Playing [Space]' : 'Transport Stopped [Space]', 'info');
        break;
      case 'rewind':
        audioEngine.rewindTransport();
        showToast('Rewound to Step 1 [R]', 'info');
        break;
      case 'toggle_metro':
        audioEngine.metronomeEnabled = !audioEngine.metronomeEnabled;
        setRerender((r) => r + 1);
        showToast(`Metronome ${audioEngine.metronomeEnabled ? 'ON' : 'OFF'} [M]`, 'info');
        break;
      case 'toggle_loop':
        audioEngine.loopEnabled = !audioEngine.loopEnabled;
        setRerender((r) => r + 1);
        showToast(`Loop Mode ${audioEngine.loopEnabled ? 'ON' : 'OFF'} [L]`, 'info');
        break;
      case 'bpm_down':
        audioEngine.setBpm(audioEngine.bpm - 2);
        showToast(`Tempo: ${audioEngine.bpm} BPM [[]`, 'info');
        break;
      case 'bpm_up':
        audioEngine.setBpm(audioEngine.bpm + 2);
        showToast(`Tempo: ${audioEngine.bpm} BPM []]`, 'info');
        break;
      case 'save_snapshot':
        audioEngine.saveSessionSnapshot('Hotkey Checkpoint');
        showToast('Session Snapshot Saved [Ctrl+S]', 'success');
        break;
      case 'export_wav':
        audioEngine.exportMasterWav();
        showToast('Exporting 24-Bit Master WAV [Ctrl+E]', 'success');
        break;
      case 'auto_patch':
        audioEngine.autoPatchAllToMaster();
        showToast('Auto-patched all instruments to Master Bus', 'success');
        break;
      case 'toggle_stage_mode':
        setIsStageModeOpen((v) => !v);
        showToast(!isStageModeOpen ? 'Entered Stage Mode Full-Screen Layout [F11]' : 'Exited Stage Mode', 'info');
        break;
      case 'open_pie_center':
        setPieMenuPos((cur) => (cur ? null : { x: window.innerWidth / 2, y: window.innerHeight / 2 }));
        break;
      case 'open_batch_exporter':
        setIsBatchExporterOpen(true);
        break;
      default:
        break;
    }
  };

  // Global keyboard shortcuts router
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K: Global Command Search Bar (works even if focused)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandSearchOpen((v) => !v);
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ctrl/Cmd + Shift + E: Batch Stem Exporter Window
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsBatchExporterOpen((v) => !v);
        return;
      }

      // Ctrl/Cmd + S: Save Snapshot, Ctrl/Cmd + E: Export WAV
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleTriggerShortcutAction('save_snapshot');
          return;
        }
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          handleTriggerShortcutAction('export_wav');
          return;
        }
      }

      // F11 or Alt+G: Stage Mode Full-Screen Layout
      if (e.key === 'F11' || (e.altKey && e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_stage_mode');
        return;
      }

      // Alt+Q or Backquote (`): Smart Pie Menu
      if ((e.altKey && e.key.toLowerCase() === 'q') || (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === '`')) {
        e.preventDefault();
        handleTriggerShortcutAction('open_pie_center');
        return;
      }

      // ? or Alt+H: Toggle Global Shortcut Matrix Modal
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash') || (e.altKey && e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
        return;
      }

      // Alt + Hotkeys
      if (e.altKey && !e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (e.key === '1' || e.code === 'Digit1') {
          e.preventDefault();
          handleTriggerShortcutAction('view_sequencer');
          return;
        }
        if (e.key === '2' || e.code === 'Digit2') {
          e.preventDefault();
          handleTriggerShortcutAction('view_mixer');
          return;
        }
        if (e.key === '3' || e.code === 'Digit3') {
          e.preventDefault();
          handleTriggerShortcutAction('view_rack');
          return;
        }
        if (e.key === '4' || e.code === 'Digit4' || k === 's') {
          e.preventDefault();
          handleTriggerShortcutAction('toggle_split');
          return;
        }
        if (k === 'c') {
          e.preventDefault();
          handleTriggerShortcutAction('toggle_copilot');
          return;
        }
        if (k === 'i' || k === 't' || k === 'v') {
          e.preventDefault();
          handleTriggerShortcutAction('toggle_inspector');
          return;
        }
        if (k === 'm') {
          e.preventDefault();
          handleTriggerShortcutAction('toggle_cv_matrix');
          return;
        }
        if (k === 'f') {
          e.preventDefault();
          handleTriggerShortcutAction('flip_rack');
          return;
        }
        if (k === 'k') {
          e.preventDefault();
          handleTriggerShortcutAction('toggle_keyboard');
          return;
        }
      }

      if (e.key === 'F1') {
        e.preventDefault();
        handleTriggerShortcutAction('view_sequencer');
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleTriggerShortcutAction('view_mixer');
      } else if (e.key === 'F3') {
        e.preventDefault();
        handleTriggerShortcutAction('view_rack');
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_split');
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleTriggerShortcutAction('view_mixer');
      } else if (e.key === 'F6') {
        e.preventDefault();
        handleTriggerShortcutAction('view_rack');
      } else if (e.key === 'F7') {
        e.preventDefault();
        handleTriggerShortcutAction('view_sequencer');
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_f8');
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerShortcutAction('play_stop');
      } else if (e.code === 'Tab') {
        e.preventDefault();
        handleTriggerShortcutAction('flip_rack');
      } else if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === '[') {
        e.preventDefault();
        handleTriggerShortcutAction('bpm_down');
      } else if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === ']') {
        e.preventDefault();
        handleTriggerShortcutAction('bpm_up');
      } else if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_metro');
      } else if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleTriggerShortcutAction('rewind');
      } else if (e.code === 'Escape') {
        if (activeConnectingJack) {
          setActiveConnectingJack(null);
          showToast('Cable routing cancelled', 'info');
        } else if (isShortcutsOpen) {
          setIsShortcutsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeConnectingJack, isBackView, isParallelView, isF8Open, isShortcutsOpen, isKeyboardVisible]);

  // Map of connected ports to cable colors for rendering jack plugs
  const connectedPortsMap = new Map<string, string>();
  audioConnections.forEach((c) => {
    connectedPortsMap.set(`${c.sourceDeviceId}:${c.sourcePortId}`, c.color);
    connectedPortsMap.set(`${c.targetDeviceId}:${c.targetPortId}`, c.color);
  });
  cvConnections.forEach((c) => {
    connectedPortsMap.set(`${c.sourceDeviceId}:${c.sourcePortId}`, c.color);
    connectedPortsMap.set(`${c.targetDeviceId}:${c.targetPortId}`, c.color);
  });

  // Find source device & port details for the active cable HUD
  const activeSourceDev = activeConnectingJack
    ? devices.find((d) => d.id === activeConnectingJack.deviceId)
    : null;
  const activeSourcePort = activeConnectingJack && activeSourceDev
    ? activeSourceDev.ports.find((p) => p.id === activeConnectingJack.portId)
    : null;

  // Handle jack socket clicks with intelligent connection validation
  const handleJackClick = (deviceId: string, portId: string, portType: string) => {
    const jackKey = `${deviceId}:${portId}`;
    const clickedDev = devices.find((d) => d.id === deviceId);
    const clickedPort = clickedDev?.ports.find((p) => p.id === portId);

    // If clicking an already connected jack while not currently routing a new wire, disconnect it
    if (!activeConnectingJack && connectedPortsMap.has(jackKey)) {
      const audioConn = audioConnections.find(
        (c) =>
          (c.sourceDeviceId === deviceId && c.sourcePortId === portId) ||
          (c.targetDeviceId === deviceId && c.targetPortId === portId)
      );
      if (audioConn) {
        audioEngine.disconnectAudio(audioConn.id);
        showToast(`Disconnected audio cable from ${clickedDev?.name || ''} (${clickedPort?.name || ''})`, 'info');
        return;
      }
      const cvConn = cvConnections.find(
        (c) =>
          (c.sourceDeviceId === deviceId && c.sourcePortId === portId) ||
          (c.targetDeviceId === deviceId && c.targetPortId === portId)
      );
      if (cvConn) {
        audioEngine.disconnectCV(cvConn.id);
        showToast(`Disconnected CV cable from ${clickedDev?.name || ''} (${clickedPort?.name || ''})`, 'info');
        return;
      }
    }

    if (!activeConnectingJack) {
      // Begin cable routing from this jack
      setActiveConnectingJack({ deviceId, portId, type: portType });
      const isOut = portType.endsWith('_out');
      const isCV = portType.startsWith('cv');
      showToast(
        `Selected ${clickedDev?.name} [${clickedPort?.name}]. Now click a compatible ${
          isOut ? 'INPUT' : 'OUTPUT'
        } (${isCV ? 'CV' : 'Audio'}) jack to complete.`,
        'info'
      );
    } else {
      // User is attempting to connect to a target jack
      if (activeConnectingJack.deviceId === deviceId && activeConnectingJack.portId === portId) {
        // Clicked same jack -> cancel
        setActiveConnectingJack(null);
        showToast('Cable routing cancelled', 'info');
        return;
      }

      const isStartAudio = !activeConnectingJack.type.startsWith('cv');
      const isTargetAudio = !portType.startsWith('cv');
      const startIsOut = activeConnectingJack.type.endsWith('_out');
      const targetIsOut = portType.endsWith('_out');

      // STRICT VALIDATION: Ensure user only connects where it is supposed to go!
      if (isStartAudio !== isTargetAudio) {
        showToast(
          isStartAudio
            ? 'Incompatible: Cannot plug an Audio Signal into a Control Voltage (CV) Jack!'
            : 'Incompatible: Cannot plug a Control Voltage (CV) into an Audio Jack!',
          'error'
        );
        return;
      }

      if (startIsOut === targetIsOut) {
        showToast(
          startIsOut
            ? 'Incompatible: Both jacks are Outputs! Connect Output to an Input.'
            : 'Incompatible: Both jacks are Inputs! Connect Input to an Output.',
          'error'
        );
        return;
      }

      if (activeConnectingJack.deviceId === deviceId && isStartAudio) {
        showToast('Incompatible: Cannot loop a device audio output directly into its own input (prevents feedback).', 'error');
        return;
      }

      // Valid connection!
      if (isStartAudio) {
        const src = startIsOut ? activeConnectingJack : { deviceId, portId };
        const tgt = startIsOut ? { deviceId, portId } : activeConnectingJack;
        const connId = audioEngine.connectAudio(src.deviceId, src.portId, tgt.deviceId, tgt.portId);
        if (connId) {
          const srcD = devices.find((d) => d.id === src.deviceId);
          const tgtD = devices.find((d) => d.id === tgt.deviceId);
          showToast(`Connected: ${srcD?.name} &rarr; ${tgtD?.name}`, 'success');
        }
      } else {
        const src = startIsOut ? activeConnectingJack : { deviceId, portId };
        const tgt = startIsOut ? { deviceId, portId } : activeConnectingJack;
        const connId = audioEngine.connectCV(src.deviceId, src.portId, tgt.deviceId, tgt.portId, 1.0);
        if (connId) {
          const srcD = devices.find((d) => d.id === src.deviceId);
          const tgtD = devices.find((d) => d.id === tgt.deviceId);
          showToast(`CV Routed: ${srcD?.name} &rarr; ${tgtD?.name}`, 'success');
        }
      }

      setActiveConnectingJack(null);
    }
  };

  const handleAddDevice = (type: DeviceType, customName?: string) => {
    const dev = audioEngine.createDevice(type, customName);
    if (dev.type !== 'master') {
      setActivePlayableDeviceId(dev.id);
    }
    showToast(`Unboxed & Synced ${dev.name} across Rack, Sequencer, Piano Roll & Mixer`, 'success');
  };

  const handleRemoveDevice = (id: string) => {
    const dev = devices.find((d) => d.id === id);
    audioEngine.removeDevice(id);
    showToast(`Unmounted ${dev?.name || 'device'} from rack`, 'info');
  };

  const handlePowerToggle = (id: string) => {
    const dev = audioEngine.devices.get(id);
    if (dev) {
      dev.isPowered = !dev.isPowered;
      setRerender((r) => r + 1);
    }
  };

  const handleBypassToggle = (id: string) => {
    const dev = audioEngine.devices.get(id);
    if (dev) {
      dev.isBypassed = !dev.isBypassed;
      setRerender((r) => r + 1);
    }
  };

  // Calculate total rack units
  const totalUnits = devices.reduce((sum, d) => sum + d.heightUnits, 0);

  return (
    <div
      className="min-h-screen bg-[#05080f] super-textured-chassis text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500 selection:text-slate-950"
      onClick={() => audioEngine.resumeContext()}
    >
      {/* 1. MASTER HEADER & TRANSPORT STRIP */}
      <HeaderTransport
        audioEngine={audioEngine}
        isBackView={isBackView}
        onToggleBackView={() => setIsBackView(!isBackView)}
        onOpenAICoPilot={() => setIsAICoPilotOpen(true)}
        onOpenCVMatrix={() => setIsCVMatrixOpen(true)}
        onOpenInternalInspector={(cat) => setInternalInspectorCategory(cat)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onAddDevice={handleAddDevice}
        onAutoPatchMaster={() => {
          audioEngine.autoPatchAllToMaster();
          showToast('Auto-patched all free instrument outputs to Master Bus', 'success');
        }}
        activeViewMode={viewMode}
        onViewModeChange={(m) => {
          setViewMode(m);
          setIsParallelView(false);
        }}
        isParallelView={isParallelView}
        onToggleParallelView={() => setIsParallelView(!isParallelView)}
      />

      {/* 1.5 ULTRA-HD QUICK NAVIGATION & SHORTCUT COMMAND BAR */}
      <div className="h-8 bg-[#070b14]/95 border-b border-cyan-500/25 px-3 flex items-center justify-between text-[10px] font-mono select-none overflow-x-auto gap-3">
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-black tracking-wider">
            HI-FI STUDIO NAV
          </span>
          <button
            onClick={() => handleTriggerShortcutAction('view_sequencer')}
            className={`px-2 py-0.5 rounded font-bold flex items-center space-x-1 transition-all ${
              viewMode === 'sequencer' && !isParallelView
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                : 'bg-slate-900/90 text-slate-300 hover:text-cyan-300 border border-slate-800'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Sequencer & Piano Roll</span>
            <kbd className="text-[8px] opacity-80">[F1]</kbd>
          </button>
          <button
            onClick={() => handleTriggerShortcutAction('view_mixer')}
            className={`px-2 py-0.5 rounded font-bold flex items-center space-x-1 transition-all ${
              viewMode === 'mixer' && !isParallelView
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                : 'bg-slate-900/90 text-slate-300 hover:text-cyan-300 border border-slate-800'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>500-Ch Mixer</span>
            <kbd className="text-[8px] opacity-80">[F2]</kbd>
          </button>
          <button
            onClick={() => handleTriggerShortcutAction('view_rack')}
            className={`px-2 py-0.5 rounded font-bold flex items-center space-x-1 transition-all ${
              viewMode === 'rack' && !isParallelView
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                : 'bg-slate-900/90 text-slate-300 hover:text-cyan-300 border border-slate-800'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span>Modular Rack</span>
            <kbd className="text-[8px] opacity-80">[F3]</kbd>
          </button>
          <button
            onClick={() => handleTriggerShortcutAction('toggle_f8')}
            className={`px-2 py-0.5 rounded font-bold flex items-center space-x-1 transition-all ${
              isF8Open
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900/90 text-slate-300 hover:text-emerald-300 border border-slate-800'
            }`}
          >
            <Music className="w-3 h-3" />
            <span>F8 Tool Matrix</span>
            <kbd className="text-[8px] opacity-80">[F8]</kbd>
          </button>

          <button
            onClick={() => setIsCommandSearchOpen(true)}
            className="px-2 py-0.5 rounded bg-cyan-950/90 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 font-bold flex items-center space-x-1 transition-all"
            title="Open Global Command Search Bar [Ctrl+K]"
          >
            <Search className="w-3 h-3" />
            <span>SEARCH COMMANDS</span>
            <kbd className="text-[8px] opacity-80">[Ctrl+K]</kbd>
          </button>

          <button
            onClick={(e) => setPieMenuPos({ x: e.clientX, y: Math.max(200, e.clientY + 140) })}
            className="px-2 py-0.5 rounded bg-emerald-950/90 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 font-bold flex items-center space-x-1 transition-all"
            title="Open Floating Contextual Smart Pie Menu [Alt+Q]"
          >
            <Compass className="w-3 h-3" />
            <span>SMART PIE</span>
            <kbd className="text-[8px] opacity-80">[Alt+Q]</kbd>
          </button>

          <button
            onClick={() => setIsStageModeOpen(true)}
            className="px-2 py-0.5 rounded bg-amber-950/90 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-bold flex items-center space-x-1 transition-all"
            title="Launch Borderless Stage Mode Layout & Video Visualizer [F11 / Alt+G]"
          >
            <Maximize2 className="w-3 h-3" />
            <span>STAGE MODE</span>
            <kbd className="text-[8px] opacity-80">[F11]</kbd>
          </button>

          <button
            onClick={() => setIsBatchExporterOpen(true)}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-slate-700 font-bold flex items-center space-x-1 transition-all"
            title="Open Batch Stem Exporter & Clip Gain Maps [Ctrl+Shift+E]"
          >
            <Download className="w-3 h-3" />
            <span>STEM EXPORTER</span>
          </button>

          {/* WORKSPACE TOPOLOGY & GRID SYSTEM CONTROLLER */}
          <div className="flex items-center space-x-1 pl-2 ml-1 border-l border-cyan-500/30">
            <span className="text-[9px] text-amber-300 font-black tracking-wider uppercase">LAYOUT:</span>
            <button
              onClick={() => {
                setTopologyMode('studio_3col');
                setIsParallelView(false);
              }}
              className={`px-2.5 py-0.5 rounded font-black transition-all ${
                topologyMode === 'studio_3col'
                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.6)]'
                  : 'bg-cyan-950/80 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 border border-cyan-500/40'
              }`}
              title="3-Column Professional Studio Layout (Browser + Stacked Hardware Rack & Arrangement + SSL Mixer & FFT Visualizer)"
            >
              3-COL STUDIO DOCK
            </button>
            <button
              onClick={() => {
                setTopologyMode('single');
                setIsParallelView(false);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                topologyMode === 'single' && !isParallelView
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
              title="Single Full-Screen Body View"
            >
              SINGLE
            </button>
            <button
              onClick={() => {
                setTopologyMode('parallel_h');
                setIsParallelView(false);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                topologyMode === 'parallel_h'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
              title="Side-by-Side Parallel Workspace (Sequencer + Mixer / Rack)"
            >
              PARALLEL SIDE-BY-SIDE
            </button>
            <button
              onClick={() => {
                setTopologyMode('parallel_v');
                setIsParallelView(true);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                topologyMode === 'parallel_v' || isParallelView
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
              title="Top/Bottom Parallel Split Workspace [F4]"
            >
              PARALLEL SPLIT
            </button>
            <button
              onClick={() => {
                setTopologyMode('linear_stack');
                setIsParallelView(false);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                topologyMode === 'linear_stack'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
              title="Linear Signal Chain Flow (Rack -> Sequencer -> Mixer stacked linearly)"
            >
              LINEAR FLOW
            </button>
            <button
              onClick={() => {
                setTopologyMode('modular_grid');
                setIsParallelView(false);
              }}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                topologyMode === 'modular_grid'
                  ? 'bg-emerald-400 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                  : 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/40'
              }`}
              title="Modular Multi-Cell Grid System — Add, Remove & Arrange Any Studio Body"
            >
              MODULAR GRID ({gridCells.length})
            </button>
            <button
              onClick={() => addGridCell('mixer')}
              className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 font-black transition-all"
              title="Add a new customizable studio body cell to the Modular Grid"
            >
              + ADD GRID CELL
            </button>
          </div>
        </div>

        {/* Right Quick Status & Shortcut Pill Triggers */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <div className="hidden xl:flex items-center space-x-2 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-slate-400">
            <Volume2 className="w-3 h-3 text-emerald-400" />
            <span>MOUNTED: <strong className="text-emerald-300">{Math.max(0, devices.length - 1)}</strong></span>
            <span>&bull;</span>
            <span>TRACKS: <strong className="text-cyan-300">{tracks.length}</strong></span>
            <span>&bull;</span>
            <span>LUFS: <strong className="text-cyan-300">{audioEngine.lufsMetering.momentary.toFixed(1)}</strong></span>
          </div>

          <button
            onClick={() => handleTriggerShortcutAction('toggle_keyboard')}
            className={`px-2 py-0.5 rounded font-bold border transition-all ${
              isKeyboardVisible
                ? 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Show/Hide Bottom Live Studio Keyboard [Alt+K]"
          >
            KEYS {isKeyboardVisible ? 'ON' : 'OFF'} [Alt+K]
          </button>

          <button
            onClick={() => setIsShortcutsOpen(true)}
            className="px-2.5 py-0.5 rounded bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500 hover:to-emerald-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/50 font-bold flex items-center space-x-1 transition-all"
            title="Open Full Keyboard Shortcuts & Command Matrix [?]"
          >
            <Keyboard className="w-3 h-3" />
            <span>ALL SHORTCUTS [?]</span>
          </button>
        </div>
      </div>

      {/* Floating Status Toast */}
      {feedbackToast && (
        <div
          className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg font-mono text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 border ${
            feedbackToast.type === 'error'
              ? 'bg-red-950 border-red-500 text-red-200'
              : feedbackToast.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-slate-900 border-cyan-500/50 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
          }`}
        >
          {feedbackToast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          )}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* 2. MODULAR STUDIO GRID / 3-COLUMN STUDIO DOCK / PARALLEL / LINEAR / SINGLE WORKSPACE ENGINE */}
      <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
        {topologyMode === 'studio_3col' ? (
          /* THE 3-COLUMN PROFESSIONAL STUDIO LAYOUT (MATCHING REFERENCE UI) */
          <div className="flex-1 flex overflow-hidden bg-[#0b0e16]">
            {/* COLUMN 1: LEFT SMART ASSET & PLUGIN BROWSER */}
            {isLeftBrowserOpen ? (
              <aside className="w-60 xl:w-64 flex-shrink-0 bg-[#121621] border-r border-slate-800/90 flex flex-col select-none">
                {/* 2x2 Category Tabs: Browser, Samples, Presets, Effects */}
                <div className="p-2 border-b border-slate-800/90">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-black tracking-wider text-slate-300 uppercase">
                      STUDIO BROWSER
                    </span>
                    <button
                      onClick={() => setIsLeftBrowserOpen(false)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Collapse Browser Panel"
                    >
                      <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                    {(['Browser', 'Samples', 'Presets', 'Effects'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setBrowserTab(tab)}
                        className={`py-1.5 px-2 rounded font-bold transition-all ${
                          browserTab === tab
                            ? 'bg-[#252d3d] text-white border border-cyan-500/50 shadow-inner'
                            : 'bg-[#181d29] text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Live Search Filter Input */}
                  <div className="relative mt-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={browserSearch}
                      onChange={(e) => setBrowserSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full bg-[#0b0e15] border border-slate-700/80 focus:border-cyan-400 rounded pl-8 pr-2.5 py-1 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Nested Folder Tree (808s, Acoustic Drums, Cinematic, Synth Leads, Synth Pads, Bass, Guitars, Vocals, Ambience, FX) */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-sans">
                  {STUDIO_BROWSER_TREE.filter((folder) => {
                    const matchesTab = browserTab === 'Browser' || folder.category === browserTab;
                    const q = browserSearch.trim().toLowerCase();
                    if (!q) return matchesTab;
                    return (
                      folder.label.toLowerCase().includes(q) ||
                      folder.children.some((c) => c.name.toLowerCase().includes(q))
                    );
                  }).map((folder) => {
                    const isOpen = !!expandedFolders[folder.id] || browserSearch.trim().length > 0;
                    return (
                      <div key={folder.id} className="select-none">
                        <div
                          onClick={() =>
                            setExpandedFolders((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))
                          }
                          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#1d2433] cursor-pointer group transition-colors"
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            )}
                            {isOpen ? (
                              <FolderOpen className="w-3.5 h-3.5 text-amber-400/90 flex-shrink-0" />
                            ) : (
                              <Folder className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 flex-shrink-0" />
                            )}
                            <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                              {folder.label}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddDevice(folder.deviceType, folder.customName);
                            }}
                            className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 text-[9px] font-mono font-bold transition-all"
                            title={`Mount ${folder.customName} in Rack`}
                          >
                            +LOAD
                          </button>
                        </div>

                        {isOpen && (
                          <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l border-slate-800 ml-3.5">
                            {folder.children.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => handleAddDevice(item.type, item.name.replace(/\.sf2$/i, ''))}
                                className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-cyan-500/15 text-left group transition-colors"
                                title={`Click to mount & audition ${item.name}`}
                              >
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <FileAudio className="w-3 h-3 text-cyan-400/80 flex-shrink-0" />
                                  <span className="text-[11px] font-mono text-slate-300 group-hover:text-cyan-200 truncate">
                                    {item.name}
                                  </span>
                                </div>
                                <Plus className="w-3 h-3 text-slate-500 group-hover:text-cyan-300 flex-shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* SoundFont (.SF2) Loader Footer */}
                <div className="p-2.5 border-t border-slate-800 bg-[#0d111a] font-mono">
                  <div className="flex items-center justify-between text-[9px] text-emerald-400 font-bold mb-1.5">
                    <span>SOUNDFONT (.SF2) ENGINE</span>
                    <span>{(soundFontEngine.loadedSf2Banks?.length ?? 1)} BANKS</span>
                  </div>
                  <label className="w-full py-1.5 px-2.5 rounded bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500 hover:to-emerald-500 text-cyan-200 hover:text-slate-950 border border-cyan-500/40 text-[10px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all">
                    <Upload className="w-3 h-3" />
                    <span>IMPORT .SF2 SOUNDFONT</span>
                    <input
                      type="file"
                      accept=".sf2,.SF2"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const meta = await soundFontEngine.loadSf2File(file);
                          showToast(
                            `Loaded SoundFont "${meta.bankName}" (${meta.presetNames.length} presets, ${(meta.sampleDataBytes / 1024).toFixed(0)} KB PCM)`,
                            'success'
                          );
                          setRerender((r) => r + 1);
                        } catch {
                          showToast('Failed to parse .SF2 file', 'error');
                        }
                      }}
                    />
                  </label>
                </div>
              </aside>
            ) : (
              <div className="w-9 bg-[#121621] border-r border-slate-800 flex flex-col items-center py-2 select-none">
                <button
                  onClick={() => setIsLeftBrowserOpen(true)}
                  className="p-1.5 rounded bg-slate-800/80 hover:bg-cyan-500 text-slate-300 hover:text-slate-950"
                  title="Expand Asset & Plugin Browser"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* COLUMN 2: CENTER MAIN WORKSPACE (STACKED MODULAR HARDWARE RACK + INLINE ARRANGEMENT TIMELINE) */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0c1018]">
              {/* Top Half: Stacked Modular Hardware Rack (Red Combinator, Blue RV-7000, Green Scream 4, Gold MClass + Custom Units) */}
              <div className="flex-[3] min-h-[280px] overflow-y-auto p-3 border-b-2 border-slate-800/90 relative">
                {/* Rack Header Bar */}
                <div className="flex items-center justify-between mb-2.5 px-3 py-1.5 rounded bg-[#141924] border border-slate-800 text-[10px] font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="font-black text-slate-200 tracking-wider uppercase">
                      MODULAR HARDWARE RACK // {devices.filter((d) => d.type !== 'master').length} UNITS MOUNTED
                    </span>
                    <span className="text-emerald-400 hidden sm:inline">
                      &bull; SOUNDFONT (.SF2) MULTI-SAMPLE DSP ACTIVE
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => {
                        audioEngine.loadReferenceStudioRack();
                        showToast('Mounted Reference Rack (Red Combinator, Blue RV-7000, Green Scream 4, Gold MClass)', 'success');
                      }}
                      className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white border border-rose-500/40 font-bold transition-colors"
                      title="Restore the 4 Reference Hardware Units"
                    >
                      LOAD REFERENCE RACK
                    </button>
                    <button
                      onClick={() => setIsBackView((v) => !v)}
                      className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black transition-colors"
                    >
                      {isBackView ? 'FRONT PANELS [Tab]' : 'FLIP RACK (REAR CABLES) [Tab]'}
                    </button>
                  </div>
                </div>

                {/* 19-Inch Metallic Rack Rails + Stacked Hardware Units */}
                <div className="flex bg-[#070a10] rounded-lg border border-slate-800 shadow-2xl overflow-hidden relative">
                  <div className="w-6 studio-rack-rail flex flex-col justify-between py-3 items-center flex-shrink-0 select-none">
                    {Array.from({ length: Math.max(10, totalUnits + 2) }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center space-y-1 my-1">
                        <div className="rack-hole" />
                        <span className="text-[6px] font-mono text-slate-500 font-bold">{i + 1}</span>
                        <div className="rack-hole" />
                      </div>
                    ))}
                  </div>

                  <div
                    ref={rackContainerRef}
                    className="flex-1 p-2.5 relative overflow-visible"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(0deg, #090d15, #090d15 3px, #0d121d 3px, #0d121d 6px)',
                    }}
                  >
                    <CablePatchBay
                      rackRef={rackContainerRef}
                      audioConnections={audioConnections}
                      cvConnections={cvConnections}
                      activeConnectingJack={activeConnectingJack}
                      activeSourceDeviceName={activeSourceDev?.name}
                      activeSourcePortName={activeSourcePort?.name}
                      onCancelConnecting={() => {
                        setActiveConnectingJack(null);
                        showToast('Cable routing cancelled', 'info');
                      }}
                      onDisconnectAudio={(id) => audioEngine.disconnectAudio(id)}
                      onDisconnectCV={(id) => audioEngine.disconnectCV(id)}
                      isBackView={isBackView}
                    />

                    {devices
                      .filter((d) => d.type !== 'master')
                      .map((device) => (
                        <RackUnitContainer
                          key={device.id}
                          device={device}
                          isBackView={isBackView}
                          onRemove={handleRemoveDevice}
                          onPowerToggle={handlePowerToggle}
                          onBypassToggle={handleBypassToggle}
                          activeConnectingJack={activeConnectingJack}
                          onJackClick={handleJackClick}
                          connectedPortsMap={connectedPortsMap}
                        >
                          <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                        </RackUnitContainer>
                      ))}
                  </div>

                  <div className="w-6 studio-rack-rail flex flex-col justify-between py-3 items-center flex-shrink-0 select-none">
                    {Array.from({ length: Math.max(10, totalUnits + 2) }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center space-y-1 my-1">
                        <div className="rack-hole" />
                        <span className="text-[6px] font-mono text-slate-500 font-bold">{i + 1}</span>
                        <div className="rack-hole" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Half: Multi-Track Arrangement Timeline & Live Step Sequencer Grid */}
              <div className="flex-[2] min-h-[215px] flex flex-col bg-[#0e131d] overflow-hidden select-none">
                {/* Arrangement / Step Sequencer Mode Header */}
                <div className="h-8 bg-[#151b28] border-b border-slate-800 px-3 flex items-center justify-between text-[10px] font-mono flex-shrink-0">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCenterBottomMode('arrangement')}
                      className={`px-2.5 py-0.5 rounded font-black transition-all ${
                        centerBottomMode === 'arrangement'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      ARRANGEMENT TIMELINE &amp; CLIPS
                    </button>
                    <button
                      onClick={() => setCenterBottomMode('sequencer')}
                      className={`px-2.5 py-0.5 rounded font-black transition-all ${
                        centerBottomMode === 'sequencer'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      STEP SEQUENCER &amp; PIANO ROLL
                    </button>
                  </div>
                  <div className="flex items-center space-x-3 text-slate-400">
                    <span>
                      STEP: <strong className="text-cyan-300">{(audioEngine.currentStep % 16) + 1} / 16</strong>
                    </span>
                    <button
                      onClick={() => {
                        setViewMode('sequencer');
                        setTopologyMode('single');
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-bold"
                    >
                      FULL SEQUENCER [F1] &rarr;
                    </button>
                  </div>
                </div>

                {centerBottomMode === 'sequencer' ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <SequencerView
                      audioEngine={audioEngine}
                      devices={devices}
                      tracks={tracks}
                      activeDeviceId={activePlayableDeviceId}
                      externalTabRequest={externalSeqTab}
                      activeVisualizerTheme={activeVisualizerTheme}
                      onChangeVisualizerTheme={setActiveVisualizerTheme}
                      onOpenStageMode={() => setIsStageModeOpen(true)}
                      onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
                      onNavigateToMixerTrack={(tNum) => setSelectedMixerTrack(tNum)}
                      onSelectDeviceForRack={(devId) => setActivePlayableDeviceId(devId)}
                      onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
                      onOpenInternalInspector={(cat) => setInternalInspectorCategory(cat)}
                      onOpenAdvancedInspector={(advCat) => {
                        setInternalInspectorCategory('ai_copilot');
                        setAdvancedInspectorCategory(advCat);
                      }}
                    />
                  </div>
                ) : (
                  /* Inline Multi-Track Arrangement Timeline with Vibrant Color-Coded Clip Blocks (Drums in Red, Bass in Orange, Synth Leads in Green, Vocals in Purple) */
                  <div className="flex-1 flex flex-col overflow-y-auto bg-[#0b0f17]">
                    {/* Bar / Step Ruler (1..16) */}
                    <div className="h-6 bg-[#121824] border-b border-slate-800 flex items-center text-[9px] font-mono text-slate-400 sticky top-0 z-10">
                      <div className="w-40 flex-shrink-0 px-3 font-bold text-slate-300 border-r border-slate-800">
                        TRACKS ({Math.max(4, tracks.length)})
                      </div>
                      <div className="flex-1 grid grid-cols-16 relative">
                        {Array.from({ length: 16 }).map((_, barIdx) => {
                          const isPlayhead = audioEngine.isPlaying && audioEngine.currentStep % 16 === barIdx;
                          return (
                            <div
                              key={barIdx}
                              className={`px-1.5 py-0.5 border-r border-slate-800/70 text-center font-bold ${
                                isPlayhead ? 'bg-cyan-500/30 text-cyan-200' : ''
                              }`}
                            >
                              {barIdx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Arrangement Lanes matching the Reference UI (Drums in Red, Bass in Orange, Synth Leads in Green, Vocals in Purple + Mounted Tracks) */}
                    <div className="divide-y divide-slate-800/80">
                      {[
                        {
                          laneIndex: 0,
                          defaultTitle: 'Track 1 - Drums',
                          colorHex: '#ef4444',
                          clipBg: 'bg-gradient-to-r from-red-600/90 to-rose-500/85 border-red-300/60',
                          clips: [
                            { start: 0, span: 4, label: 'Drums' },
                            { start: 5, span: 5, label: 'Drums' },
                            { start: 11, span: 5, label: 'Drums B' },
                          ],
                        },
                        {
                          laneIndex: 1,
                          defaultTitle: 'Track 2 - Bass',
                          colorHex: '#f97316',
                          clipBg: 'bg-gradient-to-r from-orange-500/90 to-amber-500/85 border-orange-300/60',
                          clips: [
                            { start: 2, span: 5, label: 'Bassline' },
                            { start: 8, span: 6, label: 'Sub Bass' },
                          ],
                        },
                        {
                          laneIndex: 2,
                          defaultTitle: 'Track 3 - Synth Lead',
                          colorHex: '#10b981',
                          clipBg: 'bg-gradient-to-r from-emerald-600/90 to-teal-500/85 border-emerald-300/60',
                          clips: [
                            { start: 3, span: 4, label: 'Lead Synth' },
                            { start: 8, span: 4, label: 'Lead Hook' },
                          ],
                        },
                        {
                          laneIndex: 3,
                          defaultTitle: 'Track 4 - Vocals',
                          colorHex: '#a855f7',
                          clipBg: 'bg-gradient-to-r from-purple-600/90 to-fuchsia-600/85 border-purple-300/60',
                          clips: [
                            { start: 6, span: 7, label: 'Pad' },
                          ],
                        },
                      ].map((lane) => {
                        const seqTrack = tracks[lane.laneIndex];
                        const trackTitle = seqTrack ? `Track ${lane.laneIndex + 1} - ${seqTrack.name}` : lane.defaultTitle;

                        return (
                          <div
                            key={lane.laneIndex}
                            className="h-11 flex items-center hover:bg-[#131926] transition-colors"
                          >
                            {/* Track Header */}
                            <div className="w-40 flex-shrink-0 h-full px-2.5 flex items-center justify-between border-r border-slate-800 bg-[#101520]">
                              <div className="flex items-center space-x-2 min-w-0">
                                <span
                                  className="w-2 h-6 rounded-xs flex-shrink-0"
                                  style={{ backgroundColor: lane.colorHex }}
                                />
                                <span className="text-[11px] font-mono font-bold text-slate-200 truncate">
                                  {trackTitle}
                                </span>
                              </div>
                              {seqTrack && (
                                <button
                                  onClick={() => audioEngine.toggleTrackMute(seqTrack.id)}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-black ${
                                    seqTrack.mute
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  M
                                </button>
                              )}
                            </div>

                            {/* 16-Step Arrangement Clip & Step Grid */}
                            <div className="flex-1 h-full grid grid-cols-16 relative items-center px-0.5">
                              {/* Vertical Grid Lines & Interactive Step Toggles */}
                              {Array.from({ length: 16 }).map((_, sIdx) => {
                                const hasStep = !!seqTrack?.steps?.[sIdx];
                                const isCur = audioEngine.isPlaying && audioEngine.currentStep % 16 === sIdx;
                                return (
                                  <div
                                    key={sIdx}
                                    onClick={() => {
                                      if (seqTrack) {
                                        if (hasStep) {
                                          audioEngine.setTrackStep(seqTrack.id, sIdx, null);
                                        } else {
                                          audioEngine.setTrackStep(seqTrack.id, sIdx, {
                                            note: 60,
                                            velocity: 0.9,
                                            length: 1,
                                          });
                                        }
                                      }
                                    }}
                                    className={`h-full border-r border-slate-800/50 cursor-pointer relative ${
                                      isCur ? 'bg-white/10' : ''
                                    }`}
                                    title={seqTrack ? `Toggle Step ${sIdx + 1} on ${seqTrack.name}` : `Step ${sIdx + 1}`}
                                  >
                                    {hasStep && (
                                      <div
                                        className="absolute bottom-1 inset-x-1 h-1.5 rounded-full opacity-90"
                                        style={{ backgroundColor: lane.colorHex }}
                                      />
                                    )}
                                  </div>
                                );
                              })}

                              {/* Vibrant Color-Coded Clip Blocks Overlay */}
                              {lane.clips.map((clip, cIdx) => (
                                <div
                                  key={cIdx}
                                  onClick={() => {
                                    if (seqTrack) {
                                      setActivePlayableDeviceId(seqTrack.deviceId);
                                    }
                                    if (!audioEngine.isPlaying) {
                                      audioEngine.togglePlay();
                                    }
                                  }}
                                  style={{
                                    left: `${(clip.start / 16) * 100}%`,
                                    width: `${(clip.span / 16) * 100}%`,
                                  }}
                                  className={`absolute top-1.5 bottom-2.5 rounded border px-2 flex items-center justify-between cursor-pointer shadow-md hover:brightness-110 transition-all ${lane.clipBg}`}
                                >
                                  <span className="text-[10px] font-mono font-black text-white drop-shadow truncate">
                                    {seqTrack ? seqTrack.name : clip.label}
                                  </span>
                                  {/* Mini Waveform Preview inside Clip */}
                                  <div className="hidden sm:flex items-center space-x-0.5 opacity-75">
                                    {[3, 6, 4, 8, 5, 7, 3, 6].map((h, i) => (
                                      <div
                                        key={i}
                                        className="w-0.5 bg-white rounded-full"
                                        style={{ height: `${h * 2}px` }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: RIGHT PROFESSIONAL SSL MIXING CONSOLE & NEON-SPECTRUM FFT VISUALIZER */}
            <RightColumnStudioMixer
              audioEngine={audioEngine}
              devices={devices}
              onOpenFullMixer={() => {
                setViewMode('mixer');
                setTopologyMode('single');
              }}
            />
          </div>
        ) : topologyMode === 'modular_grid' ? (
          /* MODULAR MULTI-CELL GRID SYSTEM — ADD, REMOVE, SWAP & ARRANGE ANY WORKSPACE BODY */
          <div className="flex-1 overflow-y-auto p-3 bg-[#05080f] space-y-3">
            {/* Grid Control Header */}
            <div className="bg-[#090e18] border border-emerald-500/40 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xl">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono text-[10px] font-black tracking-wider uppercase">
                  MODULAR UNBOX GRID SYSTEM
                </span>
                <span className="text-xs font-mono text-slate-300">
                  Add, remove, resize, and run Sequencer, Mixer, CV Rack, and Production Tools in parallel or linear cells. Every device added syncs everywhere.
                </span>
              </div>
              <div className="flex items-center flex-wrap gap-1.5 font-mono text-[10px]">
                <button
                  onClick={() => addGridCell('sequencer')}
                  className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 font-bold transition-all"
                >
                  + SEQUENCER CELL
                </button>
                <button
                  onClick={() => addGridCell('mixer')}
                  className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 font-bold transition-all"
                >
                  + MIXER CELL
                </button>
                <button
                  onClick={() => addGridCell('rack')}
                  className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-bold transition-all"
                >
                  + CV RACK CELL
                </button>
                <button
                  onClick={() => addGridCell('unbox_crate')}
                  className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-slate-950 border border-purple-500/40 font-bold transition-all"
                >
                  + UNBOX INSTRUMENT CRATE
                </button>
              </div>
            </div>

            {/* Dynamic CSS Grid of Studio Bodies */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {gridCells.map((cell, idx) => (
                <div
                  key={cell.id}
                  className={`${
                    cell.colSpan === 2 ? 'xl:col-span-2' : 'xl:col-span-1'
                  } ${cell.heightClass} flex flex-col bg-[#080c14] border-2 border-cyan-500/30 rounded-xl overflow-hidden shadow-2xl`}
                >
                  {/* Cell Header Bar with Body Switcher, Span Toggle & Remove */}
                  <div className="h-8 bg-[#0c121e] border-b border-cyan-500/25 px-3 flex items-center justify-between text-[10px] font-mono flex-shrink-0">
                    <div className="flex items-center space-x-2">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black">
                        CELL #{idx + 1}
                      </span>
                      <select
                        value={cell.bodyType}
                        onChange={(e) => updateGridCellBody(cell.id, e.target.value as GridBodyType)}
                        className="bg-slate-900 border border-cyan-500/40 rounded px-2 py-0.5 text-cyan-200 font-bold focus:outline-none"
                      >
                        <option value="sequencer">SEQUENCER & SONG ARRANGER (MAIN PLAYBACK)</option>
                        <option value="mixer">500-CH MIXING CONSOLE</option>
                        <option value="rack">MODULAR RACK (CV MODULATION & SOUND GEN)</option>
                        <option value="unbox_crate">HARDWARE UNBOX CRATE (ADD INSTRUMENTS)</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => toggleGridCellSpan(cell.id)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-500 text-slate-300 hover:text-slate-950 font-bold transition-colors"
                        title="Toggle Half / Full Grid Width"
                      >
                        {cell.colSpan === 2 ? 'FULL WIDTH (2x)' : 'HALF WIDTH (1x)'}
                      </button>
                      <button
                        onClick={() => removeGridCell(cell.id)}
                        className="px-2 py-0.5 rounded bg-red-950/80 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 font-bold transition-colors"
                        title="Remove this cell from the Grid"
                      >
                        REMOVE &times;
                      </button>
                    </div>
                  </div>

                  {/* Cell Body Content */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {cell.bodyType === 'sequencer' && (
                      <SequencerView
                        audioEngine={audioEngine}
                        devices={devices}
                        tracks={tracks}
                        activeDeviceId={activePlayableDeviceId}
                        externalTabRequest={externalSeqTab}
                        activeVisualizerTheme={activeVisualizerTheme}
                        onChangeVisualizerTheme={setActiveVisualizerTheme}
                        onOpenStageMode={() => setIsStageModeOpen(true)}
                        onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
                        onNavigateToMixerTrack={(tNum) => setSelectedMixerTrack(tNum)}
                        onSelectDeviceForRack={(devId) => setActivePlayableDeviceId(devId)}
                        onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
                        onOpenInternalInspector={(cat) => setInternalInspectorCategory(cat)}
                        onOpenAdvancedInspector={(advCat) => {
                          setInternalInspectorCategory('ai_copilot');
                          setAdvancedInspectorCategory(advCat);
                        }}
                      />
                    )}
                    {cell.bodyType === 'mixer' && (
                      <MixerConsoleView
                        audioEngine={audioEngine}
                        devices={devices}
                        initialSelectedTrack={selectedMixerTrack}
                        onSelectDeviceForRack={(devId) => setActivePlayableDeviceId(devId)}
                      />
                    )}
                    {cell.bodyType === 'rack' && (
                      <div className="flex-1 overflow-y-auto p-3 bg-[#070a10]">
                        <div className="mb-2 flex items-center justify-between bg-slate-900/90 border border-cyan-500/30 rounded px-3 py-1.5 text-[10px] font-mono">
                          <span className="text-cyan-300 font-bold">
                            MODULAR RACK ROLE: CV MODULATION &amp; SOUND SYNTHESIS (Arrangement playback controlled by Sequencer)
                          </span>
                          <button
                            onClick={() => setIsBackView((v) => !v)}
                            className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black"
                          >
                            {isBackView ? 'SHOW FRONT PANELS' : 'FLIP TO REAR CV/AUDIO PATCH BAY [Tab]'}
                          </button>
                        </div>
                        {devices.map((device) => (
                          <RackUnitContainer
                            key={device.id}
                            device={device}
                            isBackView={isBackView}
                            onRemove={handleRemoveDevice}
                            onPowerToggle={handlePowerToggle}
                            onBypassToggle={handleBypassToggle}
                            activeConnectingJack={activeConnectingJack}
                            onJackClick={handleJackClick}
                            connectedPortsMap={connectedPortsMap}
                          >
                            <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                          </RackUnitContainer>
                        ))}
                      </div>
                    )}
                    {cell.bodyType === 'unbox_crate' && (
                      <div className="flex-1 overflow-y-auto p-4 bg-[#070b12] font-mono">
                        <div className="text-xs font-black text-amber-300 uppercase tracking-wider mb-1">
                          MANUAL HARDWARE UNBOXING CRATE &mdash; CLICK TO MOUNT &amp; AUTO-SYNC EVERYWHERE
                        </div>
                        <p className="text-[11px] text-slate-400 mb-3">
                          Mounting any instrument or effect here adds it to the Modular Rack, creates its Sequencer &amp; Piano Roll track, and binds its Mixer channel strip automatically.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {(
                            [
                              ['tabla', 'Tabla Percussion (Bols)'],
                              ['dhol', 'Punjabi Dhol'],
                              ['bansuri', 'Bansuri Bamboo Flute'],
                              ['sitar', 'Royal Sitar'],
                              ['sarod', 'Classical Sarod'],
                              ['santoor', 'Kashmiri Santoor'],
                              ['harmonium', 'Vedic Harmonium'],
                              ['tanpura', 'Tanpura Drone'],
                              ['tumbi', 'Punjabi Tumbi'],
                              ['europa', 'Europa Wavetable Synth'],
                              ['thor', 'Thor Polysonic Synth'],
                              ['subtractor', 'Subtractor Analog Synth'],
                              ['redrum', 'Redrum Drum Computer'],
                              ['kong', 'Kong Drum Designer'],
                              ['malstrom', 'Malstrom Graintable'],
                              ['algoritm', 'Algoritm FM Synth'],
                              ['radical_piano', 'Radical Acoustic Piano'],
                              ['rv7000', 'RV7000 MkII Reverb'],
                              ['scream4', 'Scream 4 Distortion'],
                              ['pulsar', 'Pulsar Dual LFO (CV)'],
                            ] as [DeviceType, string][]
                          ).map(([t, label]) => (
                            <button
                              key={t}
                              onClick={() => handleAddDevice(t, label)}
                              className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-cyan-500 text-left text-cyan-200 hover:text-slate-950 border border-cyan-500/30 transition-all shadow group"
                            >
                              <div className="text-[10px] font-black uppercase tracking-wider">+ UNBOX &amp; MOUNT</div>
                              <div className="text-xs font-bold mt-0.5 truncate">{label}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : topologyMode === 'parallel_h' ? (
          /* SIDE-BY-SIDE HORIZONTAL PARALLEL WORKSPACE (SEQUENCER LEFT + MIXER/RACK RIGHT) */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden divide-x-2 divide-cyan-500/30">
            <div className="flex flex-col overflow-hidden">
              <SequencerView
                audioEngine={audioEngine}
                devices={devices}
                tracks={tracks}
                activeDeviceId={activePlayableDeviceId}
                externalTabRequest={externalSeqTab}
                activeVisualizerTheme={activeVisualizerTheme}
                onChangeVisualizerTheme={setActiveVisualizerTheme}
                onOpenStageMode={() => setIsStageModeOpen(true)}
                onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
                onNavigateToMixerTrack={(tNum) => {
                  setSelectedMixerTrack(tNum);
                  setBottomParallelPanel('mixer');
                }}
                onSelectDeviceForRack={(devId) => {
                  setActivePlayableDeviceId(devId);
                  setBottomParallelPanel('rack');
                }}
                onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
                onOpenInternalInspector={(cat) => setInternalInspectorCategory(cat)}
                onOpenAdvancedInspector={(advCat) => {
                  setInternalInspectorCategory('ai_copilot');
                  setAdvancedInspectorCategory(advCat);
                }}
              />
            </div>
            <div className="flex flex-col overflow-hidden">
              <div className="h-8 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between text-[10px] font-mono flex-shrink-0">
                <span className="text-amber-300 font-bold uppercase">PARALLEL RIGHT DECK:</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setBottomParallelPanel('mixer')}
                    className={`px-2.5 py-0.5 rounded font-bold ${
                      bottomParallelPanel === 'mixer'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    500-CH MIXER
                  </button>
                  <button
                    onClick={() => setBottomParallelPanel('rack')}
                    className={`px-2.5 py-0.5 rounded font-bold ${
                      bottomParallelPanel === 'rack'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    CV &amp; SOUND RACK
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {bottomParallelPanel === 'mixer' ? (
                  <MixerConsoleView
                    audioEngine={audioEngine}
                    devices={devices}
                    initialSelectedTrack={selectedMixerTrack}
                    onSelectDeviceForRack={() => setBottomParallelPanel('rack')}
                  />
                ) : (
                  <div className="p-3 space-y-2">
                    {devices.map((device) => (
                      <RackUnitContainer
                        key={device.id}
                        device={device}
                        isBackView={isBackView}
                        onRemove={handleRemoveDevice}
                        onPowerToggle={handlePowerToggle}
                        onBypassToggle={handleBypassToggle}
                        activeConnectingJack={activeConnectingJack}
                        onJackClick={handleJackClick}
                        connectedPortsMap={connectedPortsMap}
                      >
                        <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                      </RackUnitContainer>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : topologyMode === 'linear_stack' ? (
          /* LINEAR SIGNAL FLOW STACK (SEQUENCER -> MIXER -> CV RACK IN CONTINUOUS VERTICAL FLOW) */
          <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-[#05080f]">
            <div className="border-2 border-cyan-500/40 rounded-xl overflow-hidden shadow-2xl h-[540px] flex flex-col">
              <div className="bg-cyan-950/90 px-4 py-1.5 border-b border-cyan-500/40 flex items-center justify-between font-mono text-xs">
                <span className="font-black text-cyan-300">STAGE 1 // SEQUENCER, SONG ARRANGEMENT &amp; PIANO ROLL ENGINE</span>
                <span className="text-[10px] text-emerald-300">MASTER TRANSPORT &amp; PATTERN DETECTOR</span>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <SequencerView
                  audioEngine={audioEngine}
                  devices={devices}
                  tracks={tracks}
                  activeDeviceId={activePlayableDeviceId}
                  externalTabRequest={externalSeqTab}
                  activeVisualizerTheme={activeVisualizerTheme}
                  onChangeVisualizerTheme={setActiveVisualizerTheme}
                  onOpenStageMode={() => setIsStageModeOpen(true)}
                  onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
                  onNavigateToMixerTrack={(tNum) => setSelectedMixerTrack(tNum)}
                  onSelectDeviceForRack={(devId) => setActivePlayableDeviceId(devId)}
                  onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
                  onOpenInternalInspector={(cat) => setInternalInspectorCategory(cat)}
                  onOpenAdvancedInspector={(advCat) => {
                    setInternalInspectorCategory('ai_copilot');
                    setAdvancedInspectorCategory(advCat);
                  }}
                />
              </div>
            </div>

            <div className="border-2 border-emerald-500/40 rounded-xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
              <div className="bg-emerald-950/90 px-4 py-1.5 border-b border-emerald-500/40 flex items-center justify-between font-mono text-xs">
                <span className="font-black text-emerald-300">STAGE 2 // 500-CHANNEL SSL MIXING CONSOLE &amp; SIGNAL METERING</span>
                <span className="text-[10px] text-cyan-300">AUTO-SYNCHRONIZED WITH MOUNTED INSTRUMENTS</span>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <MixerConsoleView
                  audioEngine={audioEngine}
                  devices={devices}
                  initialSelectedTrack={selectedMixerTrack}
                  onSelectDeviceForRack={(devId) => setActivePlayableDeviceId(devId)}
                />
              </div>
            </div>

            <div className="border-2 border-amber-500/40 rounded-xl overflow-hidden shadow-2xl p-4 bg-[#070a10]">
              <div className="mb-3 flex items-center justify-between border-b border-amber-500/30 pb-2 font-mono text-xs">
                <span className="font-black text-amber-300">STAGE 3 // MODULAR HARDWARE RACK (CV MODULATION &amp; SOUND SYNTHESIS)</span>
                <button
                  onClick={() => setIsBackView((v) => !v)}
                  className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-black text-[10px]"
                >
                  {isBackView ? 'FRONT HARDWARE FACEPLATES' : 'REAR CV & AUDIO PATCH BAY [Tab]'}
                </button>
              </div>
              {devices.map((device) => (
                <RackUnitContainer
                  key={device.id}
                  device={device}
                  isBackView={isBackView}
                  onRemove={handleRemoveDevice}
                  onPowerToggle={handlePowerToggle}
                  onBypassToggle={handleBypassToggle}
                  activeConnectingJack={activeConnectingJack}
                  onJackClick={handleJackClick}
                  connectedPortsMap={connectedPortsMap}
                >
                  <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                </RackUnitContainer>
              ))}
            </div>
          </div>
        ) : isParallelView || topologyMode === 'parallel_v' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Panel: Sequencer Arranger & Piano Roll */}
          <div className="h-[46vh] flex flex-col border-b-2 border-neutral-800 overflow-hidden shadow-2xl">
            <SequencerView
              audioEngine={audioEngine}
              devices={devices}
              tracks={tracks}
              activeDeviceId={activePlayableDeviceId}
              externalTabRequest={externalSeqTab}
              activeVisualizerTheme={activeVisualizerTheme}
              onChangeVisualizerTheme={setActiveVisualizerTheme}
              onOpenStageMode={() => setIsStageModeOpen(true)}
              onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
              onNavigateToMixerTrack={(tNum) => {
                setSelectedMixerTrack(tNum);
                setBottomParallelPanel('mixer');
                showToast(`Focused Mixer Track #${tNum}`, 'info');
              }}
              onSelectDeviceForRack={(devId) => {
                setBottomParallelPanel('rack');
              }}
              onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
              onOpenInternalInspector={(cat) => {
                setAdvancedInspectorCategory(null);
                setInternalInspectorCategory(cat);
              }}
              onOpenAdvancedInspector={(advCat) => {
                setInternalInspectorCategory('ai_copilot');
                setAdvancedInspectorCategory(advCat);
              }}
            />
          </div>

          {/* Parallel Mid-Bar Switcher */}
          <div className="h-8 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between text-xs font-mono flex-shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-neutral-300 font-bold tracking-wider">
                PARALLEL WORKSPACE // LOWER DECK:
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setBottomParallelPanel('rack')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                  bottomParallelPanel === 'rack'
                    ? 'bg-emerald-700 text-white border-emerald-500 shadow'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white border-neutral-700'
                }`}
              >
                DEVICE RACK (F3)
              </button>
              <button
                onClick={() => setBottomParallelPanel('mixer')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                  bottomParallelPanel === 'mixer'
                    ? 'bg-emerald-700 text-white border-emerald-500 shadow'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white border-neutral-700'
                }`}
              >
                MIXING CONSOLE (F2)
              </button>
            </div>
          </div>

          {/* Bottom Panel: Device Rack or Mixing Console */}
          <div className="flex-1 overflow-y-auto">
            {bottomParallelPanel === 'rack' ? (
              <main className="max-w-7xl w-full mx-auto p-3 md:p-6">
                <div className="studio-wood-cabinet rounded-xl p-3 md:p-5 shadow-2xl border border-cyan-500/30">
                  <div className="studio-wood-top h-6 -mx-3 -mt-3 md:-mx-5 md:-mt-5 rounded-t-lg mb-3 flex items-center justify-between px-4 border-b border-cyan-500/20">
                    <span className="text-[9px] font-mono font-bold tracking-widest text-cyan-300/80 uppercase">
                      ANODIZED TITANIUM 19-INCH MODULAR DSP RACK BAY // CV MODULATION &amp; SOUND ENGINE
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400/80 font-bold">
                      {totalUnits}U LOADED &bull; 48kHz / 64-BIT FLOAT DSP
                    </span>
                  </div>

                  <div className="flex bg-[#070a10] rounded-lg border border-cyan-500/25 shadow-2xl overflow-hidden relative">
                    <div className="w-7 studio-rack-rail flex flex-col justify-between py-4 items-center flex-shrink-0 select-none">
                      {Array.from({ length: Math.max(12, totalUnits + 2) }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center space-y-1.5 my-1">
                          <div className="rack-hole" />
                          <span className="text-[6px] font-mono text-neutral-600 font-bold">{i + 1}</span>
                          <div className="rack-hole" />
                        </div>
                      ))}
                    </div>

                    <div
                      ref={rackContainerRef}
                      className="flex-1 p-2 md:p-3 relative overflow-visible"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(0deg, #101215, #101215 3px, #14171a 3px, #14171a 6px)',
                      }}
                    >
                      <CablePatchBay
                        rackRef={rackContainerRef}
                        audioConnections={audioConnections}
                        cvConnections={cvConnections}
                        activeConnectingJack={activeConnectingJack}
                        activeSourceDeviceName={activeSourceDev?.name}
                        activeSourcePortName={activeSourcePort?.name}
                        onCancelConnecting={() => {
                          setActiveConnectingJack(null);
                          showToast('Cable routing cancelled', 'info');
                        }}
                        onDisconnectAudio={(id) => audioEngine.disconnectAudio(id)}
                        onDisconnectCV={(id) => audioEngine.disconnectCV(id)}
                        isBackView={isBackView}
                      />

                      {devices.map((device) => (
                        <RackUnitContainer
                          key={device.id}
                          device={device}
                          isBackView={isBackView}
                          onRemove={handleRemoveDevice}
                          onPowerToggle={handlePowerToggle}
                          onBypassToggle={handleBypassToggle}
                          activeConnectingJack={activeConnectingJack}
                          onJackClick={handleJackClick}
                          connectedPortsMap={connectedPortsMap}
                        >
                          <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                        </RackUnitContainer>
                      ))}
                    </div>

                    <div className="w-7 studio-rack-rail flex flex-col justify-between py-4 items-center flex-shrink-0 select-none">
                      {Array.from({ length: Math.max(12, totalUnits + 2) }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center space-y-1.5 my-1">
                          <div className="rack-hole" />
                          <span className="text-[6px] font-mono text-neutral-600 font-bold">{i + 1}</span>
                          <div className="rack-hole" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </main>
            ) : (
              <MixerConsoleView
                audioEngine={audioEngine}
                devices={devices}
                initialSelectedTrack={selectedMixerTrack}
                onSelectDeviceForRack={() => {
                  setBottomParallelPanel('rack');
                }}
              />
            )}
          </div>
        </div>
      ) : viewMode === 'sequencer' ? (
        /* Dedicated Full-Screen Sequencer View (F1) */
        <SequencerView
          audioEngine={audioEngine}
          devices={devices}
          tracks={tracks}
          activeDeviceId={activePlayableDeviceId}
          externalTabRequest={externalSeqTab}
          activeVisualizerTheme={activeVisualizerTheme}
          onChangeVisualizerTheme={setActiveVisualizerTheme}
          onOpenStageMode={() => setIsStageModeOpen(true)}
          onOpenBatchExporter={() => setIsBatchExporterOpen(true)}
          onNavigateToMixerTrack={(tNum) => {
            setSelectedMixerTrack(tNum);
            setViewMode('mixer');
            setIsParallelView(false);
            showToast(`Switched to Mixer Track #${tNum}`, 'info');
          }}
          onSelectDeviceForRack={(devId) => {
            setViewMode('rack');
            setIsParallelView(false);
          }}
          onTrackSelect={(devId) => {
            setActivePlayableDeviceId(devId);
          }}
          onOpenInternalInspector={(cat) => {
            setAdvancedInspectorCategory(null);
            setInternalInspectorCategory(cat);
          }}
          onOpenAdvancedInspector={(advCat) => {
            setInternalInspectorCategory('ai_copilot');
            setAdvancedInspectorCategory(advCat);
          }}
        />
      ) : viewMode === 'mixer' ? (
        /* Dedicated Full-Screen Mixing Console View (F2) */
        <MixerConsoleView
          audioEngine={audioEngine}
          devices={devices}
          initialSelectedTrack={selectedMixerTrack}
          onSelectDeviceForRack={(devId) => {
            setViewMode('rack');
            setIsParallelView(false);
          }}
        />
      ) : (
        /* Dedicated Full-Screen Hardware Rack View (F3) */
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 overflow-y-auto">
          {/* Manual Unbox Hardware Crate Banner when Rack starts with 0 instruments */}
          {devices.length <= 1 && (
            <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-[#091322] via-[#0c1829] to-[#08121f] border-2 border-cyan-500/40 shadow-2xl font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black uppercase">
                    CLEAN MANUAL UNBOXING STATE
                  </span>
                  <h2 className="text-sm font-black text-white mt-1">
                    MODULAR SOUND GENERATOR &amp; CV RACK &mdash; SELECT HARDWARE TO UNBOX
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    The studio starts completely clean. Any instrument or device you mount here is automatically added to the Sequencer, Piano Roll, and 500-Ch Mixer!
                  </p>
                </div>
                <button
                  onClick={() => {
                    setViewMode('sequencer');
                    setTopologyMode('single');
                  }}
                  className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow"
                >
                  GO TO SEQUENCER (MAIN PLAYBACK) &rarr;
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-3">
                {(
                  [
                    ['tabla', 'Tabla Percussion'],
                    ['dhol', 'Punjabi Dhol'],
                    ['bansuri', 'Bansuri Flute'],
                    ['sitar', 'Royal Sitar'],
                    ['harmonium', 'Vedic Harmonium'],
                    ['tanpura', 'Tanpura Drone'],
                    ['europa', 'Europa Synth'],
                    ['thor', 'Thor Polysonic'],
                    ['subtractor', 'Subtractor Bass'],
                    ['redrum', 'Redrum Drums'],
                    ['kong', 'Kong Drum Pads'],
                    ['pulsar', 'Pulsar Dual LFO'],
                  ] as [DeviceType, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => handleAddDevice(t, label)}
                    className="px-2.5 py-2 rounded bg-slate-900/90 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 text-left transition-all shadow"
                  >
                    <div className="text-[9px] font-black uppercase opacity-80">+ UNBOX</div>
                    <div className="text-[11px] font-bold truncate">{label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="studio-wood-cabinet rounded-xl p-3 md:p-5 shadow-2xl border border-cyan-500/30">
            <div className="studio-wood-top h-6 -mx-3 -mt-3 md:-mx-5 md:-mt-5 rounded-t-lg mb-3 flex items-center justify-between px-4 border-b border-cyan-500/20">
              <span className="text-[9px] font-mono font-bold tracking-widest text-cyan-300/80 uppercase">
                ANODIZED TITANIUM 19-INCH MODULAR DSP RACK BAY // CV MODULATION &amp; SOUND GENERATORS ONLY
              </span>
              <span className="text-[9px] font-mono text-emerald-400/80 font-bold">
                {totalUnits}U LOADED &bull; SEQUENCER CONTROLS SONG PLAYBACK
              </span>
            </div>

            <div className="flex bg-[#070a10] rounded-lg border border-cyan-500/25 shadow-2xl overflow-hidden relative">
              <div className="w-7 studio-rack-rail flex flex-col justify-between py-4 items-center flex-shrink-0 select-none">
                {Array.from({ length: Math.max(12, totalUnits + 2) }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center space-y-1.5 my-1">
                    <div className="rack-hole" />
                    <span className="text-[6px] font-mono text-slate-500 font-bold">{i + 1}</span>
                    <div className="rack-hole" />
                  </div>
                ))}
              </div>

              <div
                ref={rackContainerRef}
                className="flex-1 p-2 md:p-3 relative overflow-visible"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, #080c14, #080c14 3px, #0b101b 3px, #0b101b 6px)',
                }}
              >
                <CablePatchBay
                  rackRef={rackContainerRef}
                  audioConnections={audioConnections}
                  cvConnections={cvConnections}
                  activeConnectingJack={activeConnectingJack}
                  activeSourceDeviceName={activeSourceDev?.name}
                  activeSourcePortName={activeSourcePort?.name}
                  onCancelConnecting={() => {
                    setActiveConnectingJack(null);
                    showToast('Cable routing cancelled', 'info');
                  }}
                  onDisconnectAudio={(id) => audioEngine.disconnectAudio(id)}
                  onDisconnectCV={(id) => audioEngine.disconnectCV(id)}
                  isBackView={isBackView}
                />

                {devices.map((device) => (
                  <RackUnitContainer
                    key={device.id}
                    device={device}
                    isBackView={isBackView}
                    onRemove={handleRemoveDevice}
                    onPowerToggle={handlePowerToggle}
                    onBypassToggle={handleBypassToggle}
                    activeConnectingJack={activeConnectingJack}
                    onJackClick={handleJackClick}
                    connectedPortsMap={connectedPortsMap}
                  >
                    <DeviceFaceplate device={device} onUpdate={() => setRerender((r) => r + 1)} />
                  </RackUnitContainer>
                ))}
              </div>

              <div className="w-7 studio-rack-rail flex flex-col justify-between py-4 items-center flex-shrink-0 select-none">
                {Array.from({ length: Math.max(12, totalUnits + 2) }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center space-y-1.5 my-1">
                    <div className="rack-hole" />
                    <span className="text-[6px] font-mono text-slate-500 font-bold">{i + 1}</span>
                    <div className="rack-hole" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}
      </div>

      {/* 3. STUDIO PIANO KEYBOARD & CONTROLLER */}
      {isKeyboardVisible && (
        <StudioKeyboard
          devices={devices}
          tracks={tracks}
          currentStep={audioEngine.currentStep}
          isPlaying={audioEngine.isPlaying}
          activeDeviceId={activePlayableDeviceId}
          onSelectDevice={(id) => {
            audioEngine.getOrCreateTrackForDevice(id);
            setActivePlayableDeviceId(id);
          }}
        />
      )}

      {/* 4. MODALS & DRAWERS */}
      <CVMatrixModal
        isOpen={isCVMatrixOpen}
        onClose={() => setIsCVMatrixOpen(false)}
        devices={devices}
        cvEngine={audioEngine.cvEngine}
      />

      <AICoPilotDrawer
        isOpen={isAICoPilotOpen}
        onClose={() => setIsAICoPilotOpen(false)}
        audioEngine={audioEngine}
        devices={devices}
      />

      <ToolWindowF8 isOpen={isF8Open} onClose={() => setIsF8Open(false)} />

      <ShortcutHelpModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        onTriggerShortcutAction={handleTriggerShortcutAction}
      />

      <InternalSubsystemInspectorModal
        isOpen={internalInspectorCategory !== null || advancedInspectorCategory !== null}
        onClose={() => {
          setInternalInspectorCategory(null);
          setAdvancedInspectorCategory(null);
        }}
        audioEngine={audioEngine}
        initialCategory={internalInspectorCategory || 'unboxed_gold'}
        initialAdvancedCategory={advancedInspectorCategory || undefined}
      />

      <CommandAndStageOverlays
        audioEngine={audioEngine}
        devices={devices}
        tracks={tracks}
        isCommandSearchOpen={isCommandSearchOpen}
        onCloseCommandSearch={() => setIsCommandSearchOpen(false)}
        pieMenuPos={pieMenuPos}
        onClosePieMenu={() => setPieMenuPos(null)}
        isStageModeOpen={isStageModeOpen}
        onCloseStageMode={() => setIsStageModeOpen(false)}
        isBatchExporterOpen={isBatchExporterOpen}
        onCloseBatchExporter={() => setIsBatchExporterOpen(false)}
        onNavigateSequencerTab={(tab) => {
          setViewMode('sequencer');
          setIsParallelView(false);
          setExternalSeqTab({ tab, seq: Date.now() });
          showToast(`Opened ${tab.replace(/_/g, ' ').toUpperCase()}`, 'info');
        }}
        onSpawnDevice={(type, name) => {
          handleAddDevice(type, name);
        }}
        onTriggerGlobalAction={handleTriggerShortcutAction}
        activeVisualizerTheme={activeVisualizerTheme}
        onChangeVisualizerTheme={setActiveVisualizerTheme}
      />
    </div>
  );
}
