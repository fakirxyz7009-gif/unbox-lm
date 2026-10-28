import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { audioEngine } from './audio/AudioEngine.ts';
import type { BaseDevice } from './audio/BaseDevice.ts';
import type { DeviceType } from './audio/types.ts';
import { ModularRack } from './rack/ModularRack.tsx';
import { CVMatrixModal } from './components/CVMatrixModal.tsx';
import { AICoPilotDrawer } from './components/AICoPilotDrawer.tsx';
import { StudioKeyboard } from './components/StudioKeyboard.tsx';
import { SequencerView } from './components/sequencer/SequencerView.tsx';
import { MixerTab } from './clipEditor/MixerTab.tsx';
import { StudioPage } from './studio/StudioPages.tsx';
import { SECTIONS, isPage, type PageId, type SectionId } from './studio/sections.ts';
import { projectManager } from './project/ProjectManager.ts';
import { ToolWindowF8 } from './components/panels/ToolWindowF8.tsx';
import { ShortcutHelpModal } from './components/ShortcutHelpModal.tsx';
import { CommandAndStageOverlays, VisualizerThemeProfile } from './components/CommandAndStageOverlays.tsx';
import { AppShell, type WorkspaceTab } from './shell/AppShell.tsx';
import { RecoveryBanner } from './shell/RecoveryBanner.tsx';
import { getUi, setUi, type SeqTool } from './shell/uiStore.ts';
import { WorkstationTab } from './workstation/WorkstationTab.tsx';
import { installMidiControls } from './workstation/midiControls.ts';
import { StemBrowserModal } from './components/StemBrowserModal.tsx';
import { AutomateMenu } from './components/AutomateMenu.tsx';

/** Letter keys while computer keys are commands (Reason-style tools). */
const TOOL_KEYS: Record<string, SeqTool> = { q: 'pointer', w: 'pencil', e: 'eraser', r: 'razor', t: 'mute', y: 'zoom', u: 'hand' };

export default function App() {
  const [tab, setTab] = useState<WorkspaceTab>('workstation');
  /** A full-screen page (Projects, Instruments, …) over the tabs. */
  const [page, setPage] = useState<PageId | null>(null);
  useEffect(() => {
    void projectManager.init();
  }, []);
  const [devices, setDevices] = useState<BaseDevice[]>(() => Array.from(audioEngine.devices.values()));
  const [audioConnections, setAudioConnections] = useState(() => audioEngine.audioConnections);
  const [cvConnections, setCvConnections] = useState(() => audioEngine.cvConnections);
  const [tracks, setTracks] = useState(() => [...audioEngine.tracks]);
  const [rackGroups, setRackGroups] = useState(() => [...audioEngine.rackGroups]);
  const [rackSelectedId, setRackSelectedId] = useState<string | null>(null);
  /** F4: song editors above the rack (Rack tab). */
  const [isParallelView, setIsParallelView] = useState(false);
  const [isBackView, setIsBackView] = useState(false);
  const [isCVMatrixOpen, setIsCVMatrixOpen] = useState(false);
  const [isAICoPilotOpen, setIsAICoPilotOpen] = useState(false);
  const [isStemBrowserOpen, setIsStemBrowserOpen] = useState(false);
  const [activePlayableDeviceId, setActivePlayableDeviceId] = useState<string | null>(() => audioEngine.tracks[0]?.deviceId || null);
  const [isF8Open, setIsF8Open] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => window.innerHeight > 760);
  const [isCommandSearchOpen, setIsCommandSearchOpen] = useState(false);
  const [pieMenuPos, setPieMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isStageModeOpen, setIsStageModeOpen] = useState(false);
  const [activeVisualizerTheme, setActiveVisualizerTheme] = useState<VisualizerThemeProfile>('Synthwave');
  const [externalSeqTab, setExternalSeqTab] = useState<{ tab: string; seq: number } | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [, setRerender] = useState(0);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedbackToast({ type, message });
    setTimeout(() => setFeedbackToast((cur) => (cur?.message === message ? null : cur)), 3200);
  };
  // any part of the UI reports through toast() (shell/toast.ts)
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; type: 'success' | 'error' | 'info' }>).detail;
      showToast(d.message, d.type);
    };
    window.addEventListener('unbox:toast', onToast);
    return () => window.removeEventListener('unbox:toast', onToast);
  }, []);

  useEffect(
    () =>
      audioEngine.subscribe(() => {
        setDevices(Array.from(audioEngine.devices.values()));
        setAudioConnections([...audioEngine.audioConnections]);
        setCvConnections([...audioEngine.cvConnections]);
        setTracks([...audioEngine.tracks]);
        setRackGroups([...audioEngine.rackGroups]);
        setRerender((r) => r + 1);
      }),
    []
  );

  // The selected part plays from the keyboards and hardware MIDI; fall back to the first part.
  const partIds = tracks.filter((t) => t.kind !== 'audio').map((t) => t.deviceId);
  const selectedPart = activePlayableDeviceId && partIds.includes(activePlayableDeviceId) ? activePlayableDeviceId : partIds[0] ?? null;
  useEffect(() => {
    audioEngine.midiTargetDeviceId = selectedPart;
  }, [selectedPart]);

  // Connect a keyboard at start-up: always in the desktop app, and in a browser once the site already has MIDI
  // permission (nothing new is asked on load).
  useEffect(() => {
    if (/Electron\//.test(navigator.userAgent)) {
      void audioEngine.enableMidiInput();
      return;
    }
    navigator.permissions
      ?.query({ name: 'midi' as PermissionName })
      .then((status) => {
        if (status.state === 'granted') void audioEngine.enableMidiInput();
      })
      .catch(() => undefined);
  }, []);

  const goTab = (t: WorkspaceTab) => {
    setPage(null);
    setTab(t);
    if (t !== 'rack') setIsParallelView(false);
  };
  /** Opens one of the song editors (piano roll, step grid …) in the Mixer & Clip Editor tab. */
  const openEditor = (seqTab: string) => {
    goTab('mixer');
    if (getUi().mixerLayout === 'mixer') {
      setUi({ mixerLayout: 'clip' });
    }
    setExternalSeqTab({ tab: seqTab, seq: Date.now() });
  };
  const goSection = (id: SectionId) => {
    if (isPage(id)) setPage(id);
    else if (id === 'rack') goTab('rack');
    else if (id === 'mixer') goTab('mixer');
    else if (id === 'midi') openEditor('piano_roll');
    else if (id === 'sequencer') openEditor('channel_rack');
    else goTab('workstation');
  };

  const handleTriggerShortcutAction = (actionId: string) => {
    switch (actionId) {
      case 'view_sequencer':
        goTab('workstation');
        break;
      case 'view_mixer':
        goTab('mixer');
        break;
      case 'toggle_clip_fullscreen':
        setPage(null);
        goTab('mixer');
        setUi({ mixerLayout: getUi().mixerLayout === 'clip' ? 'split' : 'clip' });
        break;
      case 'view_clip_editor':
        setPage(null);
        goTab('mixer');
        setUi({ mixerLayout: 'clip' });
        break;
      case 'view_rack':
        goTab('rack');
        break;
      case 'toggle_split':
        setPage(null);
        setTab('rack');
        setIsParallelView((v) => !v);
        break;
      case 'toggle_f8':
        setIsF8Open((v) => !v);
        break;
      case 'open_stems':
        setIsStemBrowserOpen(true);
        break;
      case 'flip_rack':
        if (page || tab !== 'rack') {
          goTab('rack');
          setIsBackView(true);
        } else setIsBackView((v) => !v);
        break;
      case 'toggle_copilot':
        setIsAICoPilotOpen((v) => !v);
        break;
      case 'toggle_cv_matrix':
        setIsCVMatrixOpen((v) => !v);
        break;
      case 'toggle_keyboard':
        setIsKeyboardVisible((v) => !v);
        break;
      case 'play_stop':
        void audioEngine.togglePlay();
        break;
      case 'rewind':
        audioEngine.rewindToStart();
        break;
      case 'toggle_metro':
        audioEngine.metronomeEnabled = !audioEngine.metronomeEnabled;
        setRerender((r) => r + 1);
        break;
      case 'toggle_loop':
        audioEngine.toggleLoop();
        break;
      case 'bpm_down':
        audioEngine.setBpm(audioEngine.bpm - 2);
        break;
      case 'bpm_up':
        audioEngine.setBpm(audioEngine.bpm + 2);
        break;
      case 'save_snapshot':
        void projectManager.save().then((saved) => showToast(
          saved ? `Saved "${projectManager.currentName}"` : projectManager.status || 'Save failed',
          saved ? 'success' : 'error',
        ));
        break;
      case 'export_wav':
        audioEngine.exportMasterWav();
        showToast('Exporting 24-bit WAV', 'success');
        break;
      case 'auto_patch':
        audioEngine.autoPatchAllToMaster();
        showToast('Auto-patched all instruments to the master', 'success');
        break;
      case 'toggle_stage_mode':
        setIsStageModeOpen((v) => !v);
        break;
      case 'open_pie_center':
        setPieMenuPos((cur) => (cur ? null : { x: window.innerWidth / 2, y: window.innerHeight / 2 }));
        break;
      case 'open_batch_exporter':
        setPage('export');
        break;
      default:
        break;
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandSearchOpen((v) => !v);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'e') {
        e.preventDefault();
        setPage('export');
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (k === 's') {
          e.preventDefault();
          handleTriggerShortcutAction('save_snapshot');
        } else if (k === 'e') {
          e.preventDefault();
          handleTriggerShortcutAction('export_wav');
        }
        return;
      }
      if (e.key === 'F11' || (e.altKey && k === 'g')) {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_stage_mode');
        return;
      }
      if ((e.altKey && k === 'q') || (!e.altKey && !e.shiftKey && e.key === '`')) {
        e.preventDefault();
        handleTriggerShortcutAction('open_pie_center');
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash') || (e.altKey && k === 'h')) {
        e.preventDefault();
        setIsShortcutsOpen((v) => !v);
        return;
      }
      if (e.altKey) {
        const map: Record<string, string> = { '1': 'view_sequencer', '2': 'view_mixer', '3': 'view_rack', '4': 'toggle_split', s: 'open_stems', c: 'toggle_copilot', m: 'toggle_cv_matrix', f: 'flip_rack', k: 'toggle_keyboard' };
        const id = map[e.code.startsWith('Digit') ? e.code.slice(5) : k];
        if (id) {
          e.preventDefault();
          handleTriggerShortcutAction(id);
        }
        return;
      }
      const fkeys: Record<string, string> = { F1: 'view_sequencer', F7: 'view_sequencer', F2: 'view_mixer', F5: 'view_mixer', F3: 'view_rack', F6: 'view_rack', F4: 'toggle_split', F8: 'toggle_f8' };
      if (fkeys[e.key]) {
        e.preventDefault();
        handleTriggerShortcutAction(fkeys[e.key]);
        return;
      }
      if (e.key === 'F10' || (e.altKey && e.code === 'Enter')) {
        e.preventDefault();
        handleTriggerShortcutAction('toggle_clip_fullscreen');
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerShortcutAction('play_stop');
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        handleTriggerShortcutAction('flip_rack');
        return;
      }
      if (e.code === 'Escape') {
        if (isShortcutsOpen) setIsShortcutsOpen(false);
        else if (tab === 'mixer' && getUi().mixerLayout !== 'split') setUi({ mixerLayout: 'split' });
        return;
      }
      if (e.shiftKey) return;
      if (e.key === '[') handleTriggerShortcutAction('bpm_down');
      else if (e.key === ']') handleTriggerShortcutAction('bpm_up');
      else if (k === 'm') handleTriggerShortcutAction('toggle_metro');
      else if (!getUi().qwertyPiano && TOOL_KEYS[k]) setUi({ seqTool: TOOL_KEYS[k] });
      else if (!getUi().qwertyPiano && k === 'b') audioEngine.setPlaybackMode(audioEngine.playbackMode === 'pattern_loop' ? 'song_arrangement' : 'pattern_loop');
      else if (!getUi().qwertyPiano && k === 'l') handleTriggerShortcutAction('toggle_loop');
      else if (!getUi().qwertyPiano && k === 'c') handleTriggerShortcutAction('toggle_metro');
      else if (k === 'r') handleTriggerShortcutAction('rewind');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBackView, isShortcutsOpen, tab, page]);

  // Undo / Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y)
  useEffect(() => {
    const onUndoRedo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (audioEngine.undo()) showToast('Undo', 'info');
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        if (audioEngine.redo()) showToast('Redo', 'info');
      }
    };
    window.addEventListener('keydown', onUndoRedo);
    return () => window.removeEventListener('keydown', onUndoRedo);
  }, []);

  useEffect(() => {
    installMidiControls();
  }, []);

  const handleAddDevice = (type: DeviceType, customName?: string) => {
    const dev = audioEngine.createDevice(type, customName);
    if (audioEngine.isPlayableInstrument(dev.type)) setActivePlayableDeviceId(dev.id);
    showToast(`Added ${dev.name}`, 'success');
  };

  const openInRack = (id: string) => {
    setRackSelectedId(id);
    goTab('rack');
    setIsBackView(false);
  };

  const sequencerEl = (
    <SequencerView
      audioEngine={audioEngine}
      devices={devices}
      tracks={tracks}
      activeDeviceId={selectedPart}
      externalTabRequest={externalSeqTab}
      onNavigateToMixerTrack={() => goTab('mixer')}
      onSelectDeviceForRack={openInRack}
      onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
      onOpenStems={() => setIsStemBrowserOpen(true)}
    />
  );
  const rackEl = (
    <ModularRack
      engine={audioEngine}
      devices={devices}
      audioConnections={audioConnections}
      cvConnections={cvConnections}
      rackGroups={rackGroups}
      face={isBackView ? 'rear' : 'front'}
      onSetFace={(f) => setIsBackView(f === 'rear')}
      selectedId={rackSelectedId || selectedPart}
      onSelect={(id) => {
        setRackSelectedId(id);
        const dev = id ? audioEngine.devices.get(id) : undefined;
        if (dev && audioEngine.isPlayableInstrument(dev.type)) setActivePlayableDeviceId(dev.id);
      }}
      onMessage={showToast}
    />
  );
  const keyboardDock = isKeyboardVisible && (
    <StudioKeyboard
      devices={devices}
      tracks={tracks}
      isPlaying={audioEngine.isPlaying}
      activeDeviceId={selectedPart}
      onSelectDevice={(id) => {
        audioEngine.getOrCreateTrackForDevice(id);
        setActivePlayableDeviceId(id);
        setRackSelectedId(id);
      }}
    />
  );

  const content =
    tab === 'workstation' ? (
      <WorkstationTab
        tracks={tracks}
        selectedId={selectedPart}
        onSelect={(id) => {
          setActivePlayableDeviceId(id);
          setRackSelectedId(id);
        }}
        onOpenSettings={() => setPage('settings')}
        onEditPattern={() => openEditor('piano_roll')}
        onMessage={showToast}
      />
    ) : tab === 'rack' ? (
      <div className="flex-1 min-h-0 flex flex-col studio-wood-cabinet relative overflow-hidden">
        {isParallelView ? (
          <div className="flex-1 min-h-0 flex flex-col" data-testid="split-view">
            <div className="flex-[3] min-h-0 overflow-auto flex flex-col border-b-2 border-chrome-line">{sequencerEl}</div>
            <div className="flex-[2] min-h-0 overflow-auto flex flex-col">{rackEl}</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto flex flex-col">{rackEl}</div>
        )}
        {keyboardDock}
      </div>
    ) : (
      <MixerTab
        request={externalSeqTab}
        selectedPart={selectedPart}
        onSelectPart={setActivePlayableDeviceId}
        onOpenDevice={openInRack}
        keyboardDock={keyboardDock}
        renderSequencer={(req, onModeChange) => (
          <SequencerView
            audioEngine={audioEngine}
            devices={devices}
            tracks={tracks}
            activeDeviceId={selectedPart}
            externalTabRequest={req}
            hideViewTabs
            onViewModeChange={onModeChange}
            onNavigateToMixerTrack={() => goTab('mixer')}
            onSelectDeviceForRack={openInRack}
            onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
            onOpenStems={() => setIsStemBrowserOpen(true)}
          />
        )}
      />
    );

  return (
    <AppShell
      tab={tab}
      onTab={goTab}
      page={page}
      onPage={setPage}
      content={content}
      renderPage={(id) => (
        <StudioPage
          id={id}
          onOpenDevice={openInRack}
          onOpenRear={() => {
            goTab('rack');
            setIsBackView(true);
          }}
        />
      )}
      actions={{
        aiCopilot: () => setIsAICoPilotOpen(true),
        cvMatrix: () => setIsCVMatrixOpen(true),
        shortcuts: () => setIsShortcutsOpen(true),
        f8: () => setIsF8Open(true),
        stage: () => setIsStageModeOpen(true),
        command: () => setIsCommandSearchOpen(true),
        autoPatch: () => handleTriggerShortcutAction('auto_patch'),
        flipRack: () => handleTriggerShortcutAction('flip_rack'),
        toggleKeyboardDock: () => setIsKeyboardVisible((v) => !v),
        openStems: () => setIsStemBrowserOpen(true),
      }}
    >
      <RecoveryBanner />
      {feedbackToast && (
        <div
          className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg font-label text-[13px] font-semibold shadow-2xl flex items-center gap-2 border ${
            feedbackToast.type === 'error'
              ? 'bg-red-950 border-red-500 text-red-200'
              : feedbackToast.type === 'success'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                : 'bg-chrome-1 border-chrome-line text-[#d5dae0]'
          }`}
          role="status"
        >
          {feedbackToast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : feedbackToast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : null}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      <CVMatrixModal isOpen={isCVMatrixOpen} onClose={() => setIsCVMatrixOpen(false)} devices={devices} cvEngine={audioEngine.cvEngine} />
      <AICoPilotDrawer
        isOpen={isAICoPilotOpen}
        onClose={() => setIsAICoPilotOpen(false)}
        audioEngine={audioEngine}
        devices={devices}
        onRackBuilt={() => {
          goTab('rack');
          setIsBackView(true);
        }}
        onOpenMastering={() => {
          setIsAICoPilotOpen(false);
          setPage('mastering');
        }}
      />
      <ToolWindowF8 isOpen={isF8Open} onClose={() => setIsF8Open(false)} />
      <ShortcutHelpModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} onTriggerShortcutAction={handleTriggerShortcutAction} />
      <AutomateMenu />
      <StemBrowserModal
        isOpen={isStemBrowserOpen}
        onClose={() => setIsStemBrowserOpen(false)}
        onMessage={showToast}
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
        onNavigateSequencerTab={(seqTab) => (seqTab === 'arrangement' ? goTab('workstation') : openEditor(seqTab))}
        onSpawnDevice={(type, name) => handleAddDevice(type, name)}
        onTriggerGlobalAction={handleTriggerShortcutAction}
        appCommands={[
          ...SECTIONS.map((sec) => ({ id: `go_${sec.id}`, category: 'GO TO', title: sec.label, subtitle: 'Open this section', shortcut: '', run: () => goSection(sec.id) })),
          { id: 'open_browser', category: 'INSERT', title: 'Samples & Stems', subtitle: 'Every sample in the project, plus the experimental four-band split', shortcut: 'Alt+S', run: () => setIsStemBrowserOpen(true) },
          { id: 'view_clip_editor_full', category: 'VIEW', title: 'Clip Editor: Full Screen', subtitle: 'Open Clip Editor in full screen mode (hide mixer)', shortcut: 'F10', run: () => handleTriggerShortcutAction('toggle_clip_fullscreen') },
          { id: 'view_clip_editor_split', category: 'VIEW', title: 'Mixer & Clip Editor: Split View', subtitle: 'Show mixer console and clip editor split', shortcut: '', run: () => { goTab('mixer'); setUi({ mixerLayout: 'split' }); } },
          { id: 'view_mixer_full', category: 'VIEW', title: 'Mixer: Full Screen', subtitle: 'Open Mixer console in full screen mode', shortcut: '', run: () => { goTab('mixer'); setUi({ mixerLayout: 'mixer' }); } },
        ]}
        activeVisualizerTheme={activeVisualizerTheme}
        onChangeVisualizerTheme={setActiveVisualizerTheme}
      />
    </AppShell>
  );
}
