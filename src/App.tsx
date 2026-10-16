import React, { useState, useEffect, useRef } from 'react';
import { audioEngine } from './audio/AudioEngine.ts';
import { BaseDevice } from './audio/BaseDevice.ts';
import { DeviceType, WorkspaceViewMode } from './audio/types.ts';
import { HeaderTransport } from './components/HeaderTransport.tsx';
import { RackUnitContainer } from './components/RackUnitContainer.tsx';
import { DeviceFaceplate } from './components/faceplates/DeviceFaceplate.tsx';
import { CablePatchBay } from './components/CablePatchBay.tsx';
import { CVMatrixModal } from './components/CVMatrixModal.tsx';
import { AICoPilotDrawer } from './components/AICoPilotDrawer.tsx';
import { StudioKeyboard } from './components/StudioKeyboard.tsx';
import { SequencerView } from './components/sequencer/SequencerView.tsx';
import { MixerConsoleView } from './components/mixer/MixerConsoleView.tsx';
import { ToolWindowF8 } from './components/panels/ToolWindowF8.tsx';
import { AlertCircle, CheckCircle2, RotateCcw, Columns, SplitSquareVertical } from 'lucide-react';

export default function App() {
  const [devices, setDevices] = useState<BaseDevice[]>(() =>
    Array.from(audioEngine.devices.values())
  );
  const [audioConnections, setAudioConnections] = useState(() => audioEngine.audioConnections);
  const [cvConnections, setCvConnections] = useState(() => audioEngine.cvConnections);
  const [tracks, setTracks] = useState(() => [...audioEngine.tracks]);

  // Parallel Workspace Multi-View state: 'sequencer' (F1) | 'mixer' (F2) | 'rack' (F3) | parallel split
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('rack');
  const [isParallelView, setIsParallelView] = useState(false);
  const [bottomParallelPanel, setBottomParallelPanel] = useState<'rack' | 'mixer'>('rack');
  const [selectedMixerTrack, setSelectedMixerTrack] = useState<number>(1);

  const [isBackView, setIsBackView] = useState(false);
  const [isCVMatrixOpen, setIsCVMatrixOpen] = useState(false);
  const [isAICoPilotOpen, setIsAICoPilotOpen] = useState(false);
  const [activePlayableDeviceId, setActivePlayableDeviceId] = useState<string | null>(null);
  const [isF8Open, setIsF8Open] = useState(false);

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

  // Global keyboard shortcuts router:
  // F1: Sequencer, F2: Mixer, F3: Device Rack, F4: Parallel Split, Space: Play/Pause, Tab: Flip Rack, Esc: Cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'F1' || (e.altKey && (e.key === '1' || e.code === 'Digit1'))) {
        e.preventDefault();
        setViewMode('sequencer');
        setIsParallelView(false);
        showToast('Switched to Sequencer [F1]', 'info');
      } else if (e.key === 'F2' || (e.altKey && (e.key === '2' || e.code === 'Digit2'))) {
        e.preventDefault();
        setViewMode('mixer');
        setIsParallelView(false);
        showToast('Switched to Mixing Console [F2]', 'info');
      } else if (e.key === 'F3' || (e.altKey && (e.key === '3' || e.code === 'Digit3'))) {
        e.preventDefault();
        setViewMode('rack');
        setIsParallelView(false);
        showToast('Switched to Device Rack [F3]', 'info');
      } else if (e.key === 'F4' || (e.altKey && (e.key === '4' || e.code === 'Digit4'))) {
        e.preventDefault();
        setIsParallelView((v) => !v);
        showToast(!isParallelView ? 'Enabled Parallel Split View [F4]' : 'Disabled Parallel Split View', 'info');
      } else if (e.key === 'F5') {
        e.preventDefault();
        setViewMode('mixer');
        setIsParallelView(false);
        showToast('Main Mixer Full View [F5]', 'info');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setViewMode('rack');
        setIsParallelView(false);
        showToast('Device Rack Full View [F6]', 'info');
      } else if (e.key === 'F7') {
        e.preventDefault();
        setViewMode('sequencer');
        setIsParallelView(false);
        showToast('Sequencer Full View [F7]', 'info');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsF8Open((v) => !v);
        showToast(!isF8Open ? 'Opened F8 Surgical Tool Panel' : 'Closed F8 Surgical Tool Panel', 'info');
      } else if (e.code === 'Space') {
        e.preventDefault();
        audioEngine.togglePlay();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setIsBackView((v) => !v);
        showToast(isBackView ? 'Front Hardware Controls' : 'Back Modular Patch Bay', 'info');
      } else if (e.code === 'Escape') {
        if (activeConnectingJack) {
          setActiveConnectingJack(null);
          showToast('Cable routing cancelled', 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeConnectingJack, isBackView, isParallelView, isF8Open]);

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

  const handleAddDevice = (type: DeviceType) => {
    const dev = audioEngine.createDevice(type);
    showToast(`Mounted ${dev.name} into rack`, 'success');
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
      className="min-h-screen bg-[#3c2415] super-textured-chassis text-[#f5efe6] flex flex-col justify-between font-sans selection:bg-emerald-600 selection:text-white"
      onClick={() => audioEngine.resumeContext()}
    >
      {/* 1. MASTER HEADER & TRANSPORT STRIP */}
      <HeaderTransport
        audioEngine={audioEngine}
        isBackView={isBackView}
        onToggleBackView={() => setIsBackView(!isBackView)}
        onOpenAICoPilot={() => setIsAICoPilotOpen(true)}
        onOpenCVMatrix={() => setIsCVMatrixOpen(true)}
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

      {/* Floating Status Toast */}
      {feedbackToast && (
        <div
          className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg font-mono text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 border ${
            feedbackToast.type === 'error'
              ? 'bg-red-950 border-red-600 text-red-200'
              : feedbackToast.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-neutral-900 border-neutral-700 text-neutral-200'
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

      {/* 2. PARALLEL WORKSPACE / MULTI-VIEW PANELS */}
      <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300" key={isParallelView ? 'parallel' : viewMode}>
      {isParallelView ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Panel: Sequencer Arranger & Piano Roll */}
          <div className="h-[46vh] flex flex-col border-b-2 border-neutral-800 overflow-hidden shadow-2xl">
            <SequencerView
              audioEngine={audioEngine}
              devices={devices}
              tracks={tracks}
              onNavigateToMixerTrack={(tNum) => {
                setSelectedMixerTrack(tNum);
                setBottomParallelPanel('mixer');
                showToast(`Focused Mixer Track #${tNum}`, 'info');
              }}
              onSelectDeviceForRack={(devId) => {
                setBottomParallelPanel('rack');
              }}
              onTrackSelect={(devId) => setActivePlayableDeviceId(devId)}
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
                <div className="studio-wood-cabinet rounded-xl p-3 md:p-5 shadow-2xl border-2 border-[#1c1209]">
                  <div className="studio-wood-top h-5 -mx-3 -mt-3 md:-mx-5 md:-mt-5 rounded-t-lg mb-3 flex items-center justify-between px-4 border-b border-black/40">
                    <span className="text-[9px] font-mono font-bold tracking-widest text-amber-200/50 uppercase">
                      SOLID TIMBER STUDIO OUTBOARD BAY // 19-INCH SPECIFICATION
                    </span>
                    <span className="text-[9px] font-mono text-amber-200/40">
                      {totalUnits}U LOADED &bull; 48kHz / 24-BIT DSP
                    </span>
                  </div>

                  <div className="flex bg-[#0b0c0e] rounded-lg border-2 border-neutral-800/80 shadow-2xl overflow-hidden relative">
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
            console.log('App: Setting active playable device', devId);
            setActivePlayableDeviceId(devId);
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
          <div className="studio-wood-cabinet rounded-xl p-3 md:p-5 shadow-2xl border-2 border-[#1c1209]">
            <div className="studio-wood-top h-5 -mx-3 -mt-3 md:-mx-5 md:-mt-5 rounded-t-lg mb-3 flex items-center justify-between px-4 border-b border-black/40">
              <span className="text-[9px] font-mono font-bold tracking-widest text-amber-200/50 uppercase">
                SOLID TIMBER STUDIO OUTBOARD BAY // 19-INCH SPECIFICATION
              </span>
              <span className="text-[9px] font-mono text-amber-200/40">
                {totalUnits}U LOADED &bull; 48kHz / 24-BIT DSP
              </span>
            </div>

            <div className="flex bg-[#0b0c0e] rounded-lg border-2 border-neutral-800/80 shadow-2xl overflow-hidden relative">
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
      )}
      </div>

      {/* 3. STUDIO PIANO KEYBOARD & CONTROLLER */}
      <StudioKeyboard
        devices={devices}
        activeDeviceId={activePlayableDeviceId}
        onSelectDevice={(id) => setActivePlayableDeviceId(id)}
      />

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
    </div>
  );
}
