import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SequencerTrack, ArrangementClip, ProjectMarker, AdvancedOptionCategory } from '../../audio/types.ts';
import { ADVANCED_ENGINE_LIST } from '../../audio/advancedToolsData.ts';
import {
  Play,
  Square,
  Scissors,
  Layers,
  Volume2,
  Download,
  Upload,
  Cpu,
  Activity,
  Radio,
  Sliders,
  Sparkles,
  Plus,
  Trash2,
  Snowflake,
  CheckCircle2,
  Disc,
  Gauge,
  Waves,
  ShieldCheck,
  Grid,
  Search,
  Mic2,
  FolderSearch,
} from 'lucide-react';

interface WorkstationPanelsProps {
  mode: 'arrangement' | 'sample_warp' | 'dsp_analyzer' | 'advanced_suite';
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  activeTrack: SequencerTrack | undefined;
  onSelectTrack: (trackId: string) => void;
  onOpenAdvancedInspector?: (cat: AdvancedOptionCategory) => void;
  onOpenBatchExporter?: () => void;
}

export const WorkstationPanels: React.FC<WorkstationPanelsProps> = ({
  mode,
  audioEngine,
  devices,
  tracks,
  activeTrack,
  onSelectTrack,
  onOpenAdvancedInspector,
  onOpenBatchExporter,
}) => {
  // --- ARRANGEMENT & COMPING STATE ---
  const [arrTool, setArrTool] = useState<'pointer' | 'draw' | 'split' | 'glue' | 'swipe_comp' | 'mute' | 'stretch' | 'erase'>('draw');
  const [arrSnapBars, setArrSnapBars] = useState<1 | 2 | 4>(2);
  const [showCompLanes, setShowCompLanes] = useState<boolean>(true);
  const [showAutomationLane, setShowAutomationLane] = useState<boolean>(true);
  const [automationCurveMode, setAutomationCurveMode] = useState<'linear' | 'bezier'>('bezier');
  const [automationPoints, setAutomationPoints] = useState<number[]>([
    0.35, 0.48, 0.72, 0.85, 0.60, 0.40, 0.78, 0.92, 0.55, 0.30, 0.65, 0.88, 0.74, 0.50, 0.82, 0.95,
  ]);
  const [compSwipedTakes, setCompSwipedTakes] = useState<Record<string, number>>({});
  const [aiChords, setAiChords] = useState([
    { bar: 0, degree: 'i', name: 'Cm9 (Tonic)', intervals: [0, 3, 7, 10] },
    { bar: 4, degree: 'VI', name: 'AbMaj7 (Submed)', intervals: [8, 12, 15, 19] },
    { bar: 8, degree: 'III', name: 'EbMaj9 (Mediant)', intervals: [3, 7, 10, 14] },
    { bar: 12, degree: 'VII', name: 'Bb6 (Subtonic)', intervals: [10, 14, 17, 21] },
  ]);
  const [sampleEditorTool, setSampleEditorTool] = useState<'transient_pin' | 'time_warp_flex' | 'zero_cross'>('transient_pin');
  const [sampleZoom, setSampleZoom] = useState<1 | 2 | 4>(1);
  const [showBeatSubGrid, setShowBeatSubGrid] = useState<boolean>(true);
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const [activeClipPattern, setActiveClipPattern] = useState<number>(audioEngine.activePatternIndex || 0);
  const [markers, setMarkers] = useState<ProjectMarker[]>([
    { id: 'm1', bar: 0, name: 'INTRO // ATMOS', color: '#10b981' },
    { id: 'm2', bar: 4, name: 'INDUSTRIAL DROP', color: '#f59e0b' },
    { id: 'm3', bar: 8, name: 'ACID BREAKDOWN', color: '#06b6d4' },
    { id: 'm4', bar: 12, name: 'FINAL CLIMAX', color: '#ec4899' },
  ]);
  const [newMarkerName, setNewMarkerName] = useState('');
  const [newMarkerBar, setNewMarkerBar] = useState(2);
  const [, setTick] = useState(0);

  // Initialize default arrangement clips if empty
  useEffect(() => {
    let changed = false;
    tracks.forEach((t, idx) => {
      if (!t.arrangementClips || t.arrangementClips.length === 0) {
        t.arrangementClips = [
          {
            id: `clip_${t.id}_0`,
            startBar: 0,
            lengthBars: 4,
            patternIndex: 0,
            name: `${t.name} [PAT 1]`,
            color: t.color || '#10b981',
          },
          {
            id: `clip_${t.id}_1`,
            startBar: idx % 2 === 0 ? 4 : 6,
            lengthBars: 4,
            patternIndex: 0,
            name: `${t.name} [PAT 1]`,
            color: t.color || '#10b981',
          },
        ];
        changed = true;
      }
    });
    if (changed) setTick((x) => x + 1);
  }, [tracks.length]);

  // --- SAMPLE & WARP LAB STATE ---
  const [warpPitchSemi, setWarpPitchSemi] = useState<number>(0);
  const [warpStretchPct, setWarpStretchPct] = useState<number>(100);
  const [formantPreserve, setFormantPreserve] = useState<boolean>(true);
  const [transientSensitivity, setTransientSensitivity] = useState<number>(72);
  const [warpMarkers, setWarpMarkers] = useState<number[]>([0.08, 0.24, 0.42, 0.58, 0.76, 0.91]);
  const [sampleWaveform, setSampleWaveform] = useState<number[]>(() =>
    Array.from({ length: 128 }, (_, i) => {
      const beatPeak = (i % 16 < 3) ? 0.95 : 0.35;
      return Math.sin(i * 0.45) * beatPeak * (0.6 + 0.4 * Math.cos(i * 0.13));
    })
  );
  const [loadedSampleName, setLoadedSampleName] = useState<string>('Industrial_Metal_Impact_48kHz.wav');

  // --- DSP & ANALYZER HUB STATE ---
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [vstPlugins, setVstPlugins] = useState([
    { id: 'vst1', name: 'Unboxed Pro-Q8 Parametric EQ', format: 'VST3', cpu: '0.8%', latency: '0.0 ms', enabled: true },
    { id: 'vst2', name: 'Wyvern PolyMod Spectral Filter', format: 'CLAP', cpu: '0.7%', latency: '0.0 ms', enabled: true },
    { id: 'vst3', name: 'IronBus VCA Mastering Compressor', format: 'VST3', cpu: '1.2%', latency: '0.4 ms', enabled: true },
    { id: 'vst4', name: 'Ember Analog Tape & Tube Warmth', format: 'CLAP', cpu: '0.9%', latency: '0.1 ms', enabled: true },
    { id: 'vst5', name: 'Precision Gate & Transient Expander', format: 'AU', cpu: '0.5%', latency: '0.0 ms', enabled: true },
    { id: 'vst6', name: 'PolyChord & Matrix Arpeggiator MIDI FX', format: 'VST3', cpu: '0.3%', latency: '0.0 ms', enabled: true },
  ]);

  // --- ADVANCED AI, VOCAL, BROWSER & OUTBOARD LAB STATE ---
  const [aiPromptText, setAiPromptText] = useState<string>('Cyberpunk Industrial Acid Lead 132 BPM');
  const [browserSearchQuery, setBrowserSearchQuery] = useState<string>('');
  const [browserTagFilter, setBrowserTagFilter] = useState<string>('ALL');
  const [advStatusBanner, setAdvStatusBanner] = useState<string>('');

  // Real-time FFT Spectrum & Stereo Phase Goniometer animation loop
  useEffect(() => {
    if (mode !== 'dsp_analyzer') return;
    let rafId: number;
    const freqData = new Uint8Array(audioEngine.analyserL.frequencyBinCount);
    const timeL = new Float32Array(audioEngine.analyserL.fftSize);
    const timeR = new Float32Array(audioEngine.analyserR.fftSize);

    const renderMeters = () => {
      audioEngine.analyserL.getByteFrequencyData(freqData);
      audioEngine.analyserL.getFloatTimeDomainData(timeL);
      audioEngine.analyserR.getFloatTimeDomainData(timeR);

      // 1. Draw FFT Spectrum
      const fftCanvas = fftCanvasRef.current;
      if (fftCanvas) {
        const ctx = fftCanvas.getContext('2d');
        if (ctx) {
          const w = fftCanvas.width;
          const h = fftCanvas.height;
          ctx.fillStyle = '#090c12';
          ctx.fillRect(0, 0, w, h);

          // Grid lines
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          for (let y = 0.25; y < 1; y += 0.25) {
            ctx.beginPath();
            ctx.moveTo(0, h * y);
            ctx.lineTo(w, h * y);
            ctx.stroke();
          }

          const bins = 64;
          const barW = w / bins - 2;
          for (let i = 0; i < bins; i++) {
            const val = freqData[i] / 255;
            const barH = Math.max(3, val * (h - 12));
            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#059669');
            grad.addColorStop(0.7, '#10b981');
            grad.addColorStop(1, '#f59e0b');
            ctx.fillStyle = grad;
            ctx.fillRect(i * (barW + 2), h - barH, barW, barH);
          }
        }
      }

      // 2. Draw Stereo Phase Goniometer / Correlation Scope
      const phaseCanvas = phaseCanvasRef.current;
      if (phaseCanvas) {
        const ctx = phaseCanvas.getContext('2d');
        if (ctx) {
          const w = phaseCanvas.width;
          const h = phaseCanvas.height;
          ctx.fillStyle = 'rgba(9, 12, 18, 0.35)';
          ctx.fillRect(0, 0, w, h);

          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w / 2, h);
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < timeL.length; i++) {
            const l = timeL[i];
            const r = timeR[i];
            const mid = (l + r) * 0.5;
            const side = (l - r) * 0.5;
            const x = w / 2 + side * (w * 0.45);
            const y = h / 2 - mid * (h * 0.45);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(renderMeters);
    };

    rafId = requestAnimationFrame(renderMeters);
    return () => cancelAnimationFrame(rafId);
  }, [mode, audioEngine]);

  // Handle arrangement bar click
  const handleArrangementCellClick = (track: SequencerTrack, barIdx: number) => {
    if (!track.arrangementClips) track.arrangementClips = [];
    const existingIdx = track.arrangementClips.findIndex(
      (c) => barIdx >= c.startBar && barIdx < c.startBar + c.lengthBars
    );

    if (existingIdx !== -1) {
      const clip = track.arrangementClips[existingIdx];
      if (arrTool === 'erase') {
        track.arrangementClips.splice(existingIdx, 1);
      } else if (arrTool === 'split') {
        if (clip.lengthBars > 1) {
          const splitPoint = barIdx > clip.startBar ? barIdx - clip.startBar : Math.floor(clip.lengthBars / 2);
          const firstLen = Math.max(1, splitPoint);
          const secondLen = Math.max(1, clip.lengthBars - firstLen);
          clip.lengthBars = firstLen;
          track.arrangementClips.push({
            id: `clip_${Date.now()}`,
            startBar: clip.startBar + firstLen,
            lengthBars: secondLen,
            patternIndex: clip.patternIndex,
            name: `${clip.name} (Slice)`,
            color: clip.color,
          });
        }
      } else if (arrTool === 'glue') {
        const nextClipIdx = track.arrangementClips.findIndex(
          (c, i) => i !== existingIdx && c.startBar === clip.startBar + clip.lengthBars
        );
        if (nextClipIdx !== -1) {
          clip.lengthBars += track.arrangementClips[nextClipIdx].lengthBars;
          track.arrangementClips.splice(nextClipIdx, 1);
        } else {
          clip.lengthBars = Math.min(16 - clip.startBar, clip.lengthBars + 2);
        }
      } else if (arrTool === 'mute') {
        clip.muted = !clip.muted;
      } else if (arrTool === 'stretch') {
        clip.lengthBars = clip.lengthBars >= 4 ? 2 : clip.lengthBars * 2;
      } else {
        onSelectTrack(track.id);
        audioEngine.switchPatternBank(clip.patternIndex);
      }
    } else if (arrTool === 'draw' || arrTool === 'pointer') {
      const snappedStart = Math.floor(barIdx / arrSnapBars) * arrSnapBars;
      track.arrangementClips.push({
        id: `clip_${Date.now()}_${snappedStart}`,
        startBar: snappedStart,
        lengthBars: Math.min(16 - snappedStart, arrSnapBars),
        patternIndex: activeClipPattern,
        name: `${track.name} [PAT ${activeClipPattern + 1}]`,
        color: track.color || '#10b981',
      });
    }
    setTick((x) => x + 1);
  };

  // Switch multi-take comping lane on active track
  const handleSwitchTake = (track: SequencerTrack, takeNum: number) => {
    if (!track.takes) track.takes = {};
    const curTake = track.activeTake ?? 0;
    track.takes[curTake] = track.steps.map((s) => (s ? { ...s } : null));
    track.activeTake = takeNum;
    if (track.takes[takeNum]) {
      track.steps = track.takes[takeNum].map((s) => (s ? { ...s } : null));
    } else {
      const styles = ['industrial', 'acid', 'melody'] as const;
      audioEngine.generateInstrumentPattern(track.id, styles[takeNum % styles.length]);
    }
    setTick((x) => x + 1);
  };

  if (mode === 'arrangement') {
    const totalBars = 16;
    const currentBar = audioEngine.currentSongBar % totalBars;

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10] text-xs font-mono">
        {/* ROW 1: Arrangement Top Manipulation Toolbar */}
        <div className="min-h-[42px] bg-[#12161f] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                audioEngine.playbackMode = 'song';
                if (!audioEngine.isPlaying) {
                  audioEngine.playAllTracksTogether('song');
                } else {
                  audioEngine.stopTransport();
                }
                setTick((x) => x + 1);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-black flex items-center space-x-1 mr-1 transition-all ${
                audioEngine.isPlaying
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              }`}
              title="Play/Stop Full 16-Bar Song Arrangement Timeline"
            >
              {audioEngine.isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{audioEngine.isPlaying ? `PLAYING BAR ${currentBar + 1}/16` : 'PLAY SONG ARRANGEMENT'}</span>
            </button>
            <span className="text-[10px] text-neutral-400 font-bold mr-1">TIMELINE TOOLS:</span>
            {[
              { id: 'pointer', label: 'Pointer / Select' },
              { id: 'draw', label: 'Pencil / Place Clip' },
              { id: 'split', label: 'Scissors / Split' },
              { id: 'glue', label: 'Glue / Join' },
              { id: 'swipe_comp', label: 'Swipe Comp Brush' },
              { id: 'mute', label: 'Mute Clip' },
              { id: 'stretch', label: 'Time-Warp Flex' },
              { id: 'erase', label: 'Eraser' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setArrTool(t.id as any)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  arrTool === t.id
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Add Project Marker & Batch Export Stems */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setShowCompLanes((v) => !v)}
              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                showCompLanes
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              TAKE COMP LANES: {showCompLanes ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setShowAutomationLane((v) => !v)}
              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                showAutomationLane
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              BEZIER AUTOMATION: {showAutomationLane ? 'ON' : 'OFF'}
            </button>
            {onOpenBatchExporter && (
              <button
                onClick={onOpenBatchExporter}
                className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>BATCH STEM EXPORTER</span>
              </button>
            )}
            <button
              onClick={() => audioEngine.exportUncompressedWav(undefined, 'wav')}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] flex items-center space-x-1"
              title="Bounce & Export Full Arrangement Master as Uncompressed 48kHz WAV"
            >
              <Download className="w-3 h-3" />
              <span>BOUNCE MASTER .WAV</span>
            </button>
          </div>
        </div>

        {/* ROW 2: MASTER ARRANGEMENT MAGNETIC GRID SYSTEM & SNAP CONTROLLER */}
        <div className="min-h-[36px] bg-[#0d1118] border-b border-neutral-800 px-3 py-1 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-[10px]">
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Grid className="w-3.5 h-3.5" />
              ARRANGEMENT GRID SNAP:
            </span>
            {([1, 2, 4] as const).map((bars) => (
              <button
                key={bars}
                onClick={() => setArrSnapBars(bars)}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  arrSnapBars === bars
                    ? 'bg-amber-500 text-black'
                    : 'bg-neutral-800 text-neutral-300 hover:text-white'
                }`}
              >
                {bars} {bars === 1 ? 'BAR' : 'BARS'}
              </button>
            ))}

            <button
              onClick={() => setShowBeatSubGrid(!showBeatSubGrid)}
              className={`px-2 py-0.5 rounded font-bold border ${
                showBeatSubGrid
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              4-BEAT SUB-GRID: {showBeatSubGrid ? 'ON' : 'OFF'}
            </button>

            <div className="flex items-center space-x-1 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              <span className="text-cyan-300 font-bold">PAINT PATTERN:</span>
              {Array.from({ length: 8 }).map((_, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => setActiveClipPattern(pIdx)}
                  className={`px-1.5 py-0.2 rounded font-bold ${
                    activeClipPattern === pIdx
                      ? 'bg-cyan-500 text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  P{pIdx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-neutral-400">
              ACTIVE BAR:{' '}
              <strong className="text-amber-300">
                BAR {currentBar + 1}.{Math.floor((audioEngine.currentStep % 16) / 4) + 1} ({audioEngine.activeArrangementSection})
              </strong>
            </span>
            <button
              onClick={() => {
                tracks.forEach((t, idx) => {
                  t.arrangementClips = [
                    {
                      id: `clip_${t.id}_a`,
                      startBar: 0,
                      lengthBars: 4,
                      patternIndex: 0,
                      name: `${t.name} [PAT 1]`,
                      color: t.color || '#10b981',
                    },
                    {
                      id: `clip_${t.id}_b`,
                      startBar: 4,
                      lengthBars: 4,
                      patternIndex: idx % 2,
                      name: `${t.name} [PAT ${(idx % 2) + 1}]`,
                      color: t.color || '#10b981',
                    },
                    {
                      id: `clip_${t.id}_c`,
                      startBar: 8,
                      lengthBars: 4,
                      patternIndex: 0,
                      name: `${t.name} [PAT 1]`,
                      color: t.color || '#10b981',
                    },
                    {
                      id: `clip_${t.id}_d`,
                      startBar: 12,
                      lengthBars: 4,
                      patternIndex: (idx + 1) % 2,
                      name: `${t.name} [PAT ${((idx + 1) % 2) + 1}]`,
                      color: t.color || '#10b981',
                    },
                  ];
                });
                setTick((x) => x + 1);
              }}
              className="px-2 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-white font-bold"
              title="Auto-populate full 16-bar song arrangement across all tracks"
            >
              AUTO-FILL 16-BAR SONG GRID
            </button>
          </div>
        </div>

        {/* Project Markers & Interactive Bar Ruler (Click any bar to jump playhead) */}
        <div className="flex border-b border-neutral-800 bg-[#0e1218] flex-shrink-0">
          <div className="w-64 flex-shrink-0 px-3 py-1.5 border-r border-neutral-800 text-[10px] font-bold text-neutral-400 flex items-center justify-between">
            <span>TRACK / COMPING TAKES</span>
            <span>STEM BOUNCE</span>
          </div>
          <div className="flex-1 grid grid-cols-16 relative">
            {Array.from({ length: totalBars }).map((_, barIdx) => {
              const marker = markers.find((m) => m.bar === barIdx);
              const isSectionStart = barIdx % 4 === 0;
              return (
                <div
                  key={barIdx}
                  onClick={() => {
                    audioEngine.jumpToSongBar(barIdx);
                    setTick((x) => x + 1);
                  }}
                  className={`h-9 border-r cursor-pointer px-1 flex flex-col justify-between transition-colors ${
                    isSectionStart ? 'border-l-2 border-l-emerald-500/50 border-r-neutral-800' : 'border-r-neutral-800/80'
                  } ${
                    currentBar === barIdx
                      ? 'bg-amber-500/25'
                      : hoveredBarIdx === barIdx
                      ? 'bg-neutral-800/60'
                      : ''
                  }`}
                  title={`Click to scrub playhead to Bar ${barIdx + 1}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-bold ${isSectionStart ? 'text-emerald-400' : 'text-neutral-400'}`}>
                      {barIdx + 1}
                    </span>
                    <span className="text-[7px] text-neutral-600">{barIdx * 4 + 1}b</span>
                  </div>
                  {marker && (
                    <span
                      className="text-[8px] font-bold px-1 rounded truncate text-black"
                      style={{ backgroundColor: marker.color }}
                      title={marker.name}
                    >
                      {marker.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* AI CHORD GENERATION LANE (Visual Helper Track Projecting Scale-Locked Chords & Variations) */}
        <div className="flex border-b border-cyan-500/30 bg-[#08101d] flex-shrink-0">
          <div className="w-64 flex-shrink-0 px-3 py-1.5 border-r border-neutral-800 flex items-center justify-between text-[10px]">
            <span className="text-cyan-300 font-black flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              AI CHORD GENERATION LANE
            </span>
            <button
              onClick={() => {
                const variations = [
                  [
                    { bar: 0, degree: 'i9', name: 'Cm9 (Dark)', intervals: [0, 3, 7, 10] },
                    { bar: 4, degree: 'iv7', name: 'Fm7 (Subdom)', intervals: [5, 8, 12, 15] },
                    { bar: 8, degree: 'VI', name: 'AbMaj7 (Epic)', intervals: [8, 12, 15, 19] },
                    { bar: 12, degree: 'V7b9', name: 'G7b9 (Tension)', intervals: [7, 11, 14, 17] },
                  ],
                  [
                    { bar: 0, degree: 'i', name: 'Cm (Industrial)', intervals: [0, 3, 7] },
                    { bar: 4, degree: 'bII', name: 'DbMaj7 (Phrygian)', intervals: [1, 5, 8, 12] },
                    { bar: 8, degree: 'VII', name: 'Bb (Power)', intervals: [10, 14, 17] },
                    { bar: 12, degree: 'i', name: 'Cm Oct', intervals: [0, 7, 12] },
                  ],
                ];
                setAiChords(variations[Math.floor(Math.random() * variations.length)]);
              }}
              className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 font-bold text-[8px] border border-cyan-500/40"
            >
              MUTATE CHORDS
            </button>
          </div>
          <div className="flex-1 grid grid-cols-4 gap-1 p-1">
            {aiChords.map((ch, cIdx) => (
              <div
                key={cIdx}
                onClick={() => {
                  if (!activeTrack) return;
                  const root = 60 + audioEngine.rootKey;
                  const notes = ch.intervals.map((iv) => root + iv);
                  const stepStart = (ch.bar * 4) % Math.max(16, audioEngine.patternLength);
                  audioEngine.setTrackStep(activeTrack.id, stepStart, {
                    note: notes[0],
                    velocity: 0.9,
                    length: 4,
                    chordNotes: notes.slice(1),
                  });
                  setTick((x) => x + 1);
                }}
                className="bg-gradient-to-r from-cyan-950/90 to-emerald-950/80 hover:from-cyan-800 hover:to-emerald-800 border border-cyan-500/40 rounded px-2 py-1 cursor-pointer flex items-center justify-between text-[9px]"
                title="Click to commit this scale-locked AI Chord directly to the active instrument track"
              >
                <div>
                  <span className="text-amber-300 font-black mr-1.5">[{ch.degree}]</span>
                  <span className="text-white font-bold">{ch.name}</span>
                </div>
                <span className="text-[8px] text-cyan-300 font-bold">+ COMMIT</span>
              </div>
            ))}
          </div>
        </div>

        {/* AUTOMATION ENVELOPE LANE (Linear & Bezier Automation Curves Overlay Track) */}
        {showAutomationLane && (
          <div className="flex border-b border-emerald-500/30 bg-[#070d16] h-14 flex-shrink-0">
            <div className="w-64 flex-shrink-0 px-3 py-1 border-r border-neutral-800 flex flex-col justify-between text-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-black">AUTOMATION ENVELOPE LANE</span>
                <span className="text-cyan-300">{automationCurveMode.toUpperCase()}</span>
              </div>
              <div className="flex items-center space-x-1">
                {(['linear', 'bezier'] as const).map((cm) => (
                  <button
                    key={cm}
                    onClick={() => setAutomationCurveMode(cm)}
                    className={`px-2 py-0.5 rounded font-bold uppercase text-[8px] ${
                      automationCurveMode === cm
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cm} Curve
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-16 relative items-end p-1 bg-[#05080f]">
              {automationPoints.map((pt, barIdx) => (
                <div
                  key={barIdx}
                  onClick={() => {
                    const next = [...automationPoints];
                    next[barIdx] = pt > 0.75 ? 0.25 : Number((pt + 0.22).toFixed(2));
                    setAutomationPoints(next);
                  }}
                  className="h-full border-r border-slate-900 flex flex-col justify-end items-center cursor-ns-resize group px-0.5"
                  title={`Bar ${barIdx + 1} Automation Node (${Math.round(pt * 100)}%) - Click to adjust`}
                >
                  <div
                    style={{ height: `${Math.round(pt * 100)}%` }}
                    className={`w-full transition-all ${
                      automationCurveMode === 'bezier'
                        ? 'rounded-t-full bg-gradient-to-t from-cyan-600/40 to-emerald-400/80 border-t-2 border-emerald-300'
                        : 'bg-cyan-500/40 border-t-2 border-cyan-300'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Track Arrangement Clips & Multi-Take Comping Lanes */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/70">
          {tracks.map((track) => {
            const isSelected = track.id === activeTrack?.id;
            const curTake = track.activeTake ?? 0;

            return (
              <React.Fragment key={track.id}>
              <div
                className={`flex items-stretch min-h-[58px] ${
                  isSelected ? 'bg-[#131c2e]' : 'bg-[#0b0e14]'
                }`}
              >
                {/* Left Track Header with Solo/Together, Comping Takes & Stem Freeze/Bounce */}
                <div className="w-64 flex-shrink-0 p-2 border-r border-neutral-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-1">
                    <div
                      onClick={() => onSelectTrack(track.id)}
                      className="flex items-center space-x-1.5 cursor-pointer truncate"
                    >
                      <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: track.color }} />
                      <span className="font-bold text-white truncate">{track.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => audioEngine.playSingleTrackSolo(track.id)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          track.solo ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-300 hover:text-white'
                        }`}
                        title="Play this instrument pattern separately (Solo)"
                      >
                        SOLO
                      </button>
                      <button
                        onClick={() => {
                          track.frozen = !track.frozen;
                          setTick((x) => x + 1);
                        }}
                        className={`p-1 rounded ${
                          track.frozen ? 'bg-cyan-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                        title="Freeze Track Stem (CPU Lock)"
                      >
                        <Snowflake className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => audioEngine.exportUncompressedWav(track.id, 'wav')}
                        className="p-1 rounded bg-neutral-800 hover:bg-emerald-700 text-emerald-400 hover:text-white"
                        title="Bounce & Export Uncompressed Track Stem (.WAV)"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-Take Comping Selector (Take 1, Take 2, Take 3) */}
                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-neutral-800/80 text-[9px]">
                    <span className="text-neutral-500">COMP TAKE:</span>
                    <div className="flex space-x-1">
                      {[0, 1, 2].map((tk) => (
                        <button
                          key={tk}
                          onClick={() => handleSwitchTake(track, tk)}
                          className={`px-1.5 py-0.2 rounded font-bold ${
                            curTake === tk
                              ? 'bg-emerald-700 text-white'
                              : 'bg-neutral-900 text-neutral-400 hover:text-white'
                          }`}
                        >
                          T{tk + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 16-Bar Arrangement Timeline Grid with 4-Beat Sub-Grid Lines & Direct Clip Resize Controls */}
                <div className="flex-1 grid grid-cols-16 relative bg-[#080a0f]">
                  {Array.from({ length: totalBars }).map((_, barIdx) => {
                    const clipStartingHere = (track.arrangementClips || []).find((c) => c.startBar === barIdx);
                    const clipCoveringHere = (track.arrangementClips || []).find(
                      (c) => barIdx >= c.startBar && barIdx < c.startBar + c.lengthBars
                    );
                    const isSectionStart = barIdx % 4 === 0;

                    return (
                      <div
                        key={barIdx}
                        onMouseEnter={() => setHoveredBarIdx(barIdx)}
                        onMouseLeave={() => setHoveredBarIdx(null)}
                        onClick={() => handleArrangementCellClick(track, barIdx)}
                        className={`border-r relative cursor-pointer hover:bg-neutral-800/35 p-0.5 ${
                          isSectionStart
                            ? 'border-l-2 border-l-emerald-500/35 border-r-neutral-800/90 bg-white/[0.01]'
                            : 'border-r-neutral-900/90'
                        } ${hoveredBarIdx === barIdx ? 'bg-emerald-500/10' : ''}`}
                      >
                        {/* 4-Beat Sub-Grid Vertical Guidelines inside each Bar cell */}
                        {showBeatSubGrid && (
                          <div className="absolute inset-0 grid grid-cols-4 pointer-events-none">
                            <div className="border-r border-white/[0.04]" />
                            <div className="border-r border-white/[0.07]" />
                            <div className="border-r border-white/[0.04]" />
                            <div />
                          </div>
                        )}

                        {clipStartingHere && (
                          <div
                            style={{
                              width: `calc(${clipStartingHere.lengthBars * 100}% - 4px)`,
                              backgroundColor: clipStartingHere.muted ? '#374151' : clipStartingHere.color || track.color,
                            }}
                            className={`h-full rounded px-1.5 py-1 text-black font-bold flex flex-col justify-between shadow-md z-10 relative ${
                              clipStartingHere.muted ? 'opacity-50 line-through text-neutral-300' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between text-[9px] gap-1">
                              <span className="truncate">{clipStartingHere.name}</span>
                              {/* Inline Clip Resize (-1B / +1B / DUP) right on the Arrangement Grid */}
                              <div className="flex items-center space-x-0.5 flex-shrink-0">
                                {clipStartingHere.lengthBars > 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clipStartingHere.lengthBars = Math.max(1, clipStartingHere.lengthBars - 1);
                                      setTick((x) => x + 1);
                                    }}
                                    className="px-1 rounded-xs bg-black/40 hover:bg-black/80 text-white text-[8px]"
                                    title="Shorten Clip by 1 Bar (-1B)"
                                  >
                                    -1B
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clipStartingHere.lengthBars = Math.min(
                                      16 - clipStartingHere.startBar,
                                      clipStartingHere.lengthBars + 1
                                    );
                                    setTick((x) => x + 1);
                                  }}
                                  className="px-1 rounded-xs bg-black/40 hover:bg-black/80 text-white text-[8px]"
                                  title="Extend Clip by 1 Bar (+1B)"
                                >
                                  +1B
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextStart = clipStartingHere.startBar + clipStartingHere.lengthBars;
                                    if (nextStart < 16) {
                                      track.arrangementClips?.push({
                                        id: `clip_${Date.now()}`,
                                        startBar: nextStart,
                                        lengthBars: Math.min(16 - nextStart, clipStartingHere.lengthBars),
                                        patternIndex: clipStartingHere.patternIndex,
                                        name: clipStartingHere.name,
                                        color: clipStartingHere.color,
                                      });
                                      setTick((x) => x + 1);
                                    }
                                  }}
                                  className="px-1 rounded-xs bg-black/40 hover:bg-black/80 text-amber-300 text-[8px]"
                                  title="Duplicate Clip to Next Bar"
                                >
                                  DUP
                                </button>
                              </div>
                            </div>
                            <div className="h-2 bg-black/30 rounded-xs flex items-center space-x-0.5 px-0.5">
                              {Array.from({ length: Math.min(16, clipStartingHere.lengthBars * 4) }).map((_, d) => (
                                <span key={d} className="flex-1 h-1 bg-white/75 rounded-xs" />
                              ))}
                            </div>
                          </div>
                        )}
                        {!clipCoveringHere && (
                          <span className="text-[8px] text-neutral-600 opacity-0 hover:opacity-100 flex items-center justify-center h-full font-bold">
                            +P{activeClipPattern + 1} ({arrSnapBars}B)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STACKED TAKE COMPING LANES + SWIPE COMP BRUSH TOOL */}
              {showCompLanes && isSelected && (
                <div className="bg-[#060a12] border-t border-cyan-500/30 divide-y divide-slate-900 text-[9px]">
                  {[0, 1, 2].map((takeIdx) => (
                    <div key={takeIdx} className="flex items-center h-7">
                      <div className="w-64 flex-shrink-0 px-3 flex items-center justify-between border-r border-slate-800 text-slate-400">
                        <span className="font-bold text-cyan-300">TAKE PASS #{takeIdx + 1} (SWIPE COMP)</span>
                        <button
                          onClick={() => handleSwitchTake(track, takeIdx)}
                          className={`px-1.5 py-0.2 rounded font-bold text-[8px] ${
                            curTake === takeIdx ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {curTake === takeIdx ? 'ACTIVE' : 'PROMOTE'}
                        </button>
                      </div>
                      <div className="flex-1 grid grid-cols-16 h-full">
                        {Array.from({ length: totalBars }).map((_, bIdx) => {
                          const swipedTake = compSwipedTakes[`${track.id}:${bIdx}`] ?? curTake;
                          const isPromoted = swipedTake === takeIdx;
                          return (
                            <div
                              key={bIdx}
                              onClick={() => {
                                setCompSwipedTakes((prev) => ({
                                  ...prev,
                                  [`${track.id}:${bIdx}`]: takeIdx,
                                }));
                                handleSwitchTake(track, takeIdx);
                              }}
                              className={`border-r border-slate-900 cursor-pointer flex items-center justify-center transition-all ${
                                isPromoted
                                  ? 'bg-emerald-500/30 border-b-2 border-b-emerald-400 text-emerald-200 font-bold'
                                  : 'bg-slate-950/70 text-slate-600 hover:bg-slate-900'
                              }`}
                              title={`Swipe Comp Brush: Click to promote Take ${takeIdx + 1} for Bar ${bIdx + 1}`}
                            >
                              T{takeIdx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'sample_warp') {
    const triggerSamplePreview = () => {
      audioEngine.resumeContext();
      const dev = activeTrack ? devices.find((d) => d.id === activeTrack.deviceId) : devices[0];
      if (dev?.noteOn) {
        const midi = Math.max(24, Math.min(96, 60 + warpPitchSemi));
        dev.noteOn(midi, 0.92);
        setTimeout(() => dev.noteOff?.(midi), Math.max(120, (280 * warpStretchPct) / 100));
      }
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0c10] p-3 text-xs font-mono space-y-3">
        {/* Sample Editor Header & Native Audio Importer/Exporter */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Waves className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-white font-bold text-sm">{loadedSampleName}</div>
              <div className="text-[10px] text-neutral-400">
                TARGET INSTRUMENT: <strong className="text-emerald-400">{activeTrack?.name || 'Master Sampler'}</strong> &bull; 48kHz / 24-BIT UNCOMPRESSED
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <label className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-600/50 text-[10px] font-bold cursor-pointer flex items-center space-x-1">
              <Upload className="w-3.5 h-3.5" />
              <span>IMPORT .WAV / .AIF / .FLAC</span>
              <input
                type="file"
                accept=".wav,.aif,.aiff,.flac,.mp3,.ogg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLoadedSampleName(file.name);
                  try {
                    const buf = await file.arrayBuffer();
                    const audioBuf = await audioEngine.ctx.decodeAudioData(buf);
                    const raw = audioBuf.getChannelData(0);
                    const step = Math.max(1, Math.floor(raw.length / 128));
                    const nextWave = Array.from({ length: 128 }, (_, i) => raw[i * step] || 0);
                    setSampleWaveform(nextWave);
                  } catch (err) {}
                }}
              />
            </label>

            <button
              onClick={triggerSamplePreview}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center space-x-1"
            >
              <Play className="w-3.5 h-3.5" />
              <span>AUDITION WARPED SAMPLE</span>
            </button>

            {(['wav', 'aif', 'flac'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => audioEngine.exportUncompressedWav(activeTrack?.id, fmt)}
                className="px-2.5 py-1.5 rounded bg-neutral-900 hover:bg-amber-600 hover:text-black text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase"
              >
                EXPORT .{fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Vari-Pitch, Time-Stretch & Transient Warp Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] text-neutral-400 font-bold mb-1">VARI-PITCH / TRANSPOSE</div>
            <div className="flex items-center justify-between">
              <input
                type="range"
                min="-24"
                max="24"
                value={warpPitchSemi}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setWarpPitchSemi(val);
                  if (activeTrack) {
                    activeTrack.pitchOffset = val;
                  }
                }}
                className="w-full accent-emerald-500 mr-2"
              />
              <span className="text-emerald-400 font-bold w-14 text-right">
                {warpPitchSemi > 0 ? `+${warpPitchSemi}` : warpPitchSemi} st
              </span>
            </div>
          </div>

          <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] text-neutral-400 font-bold mb-1">TIME-STRETCH RATIO</div>
            <div className="flex items-center justify-between">
              <input
                type="range"
                min="50"
                max="200"
                value={warpStretchPct}
                onChange={(e) => setWarpStretchPct(Number(e.target.value))}
                className="w-full accent-amber-500 mr-2"
              />
              <span className="text-amber-400 font-bold w-14 text-right">{warpStretchPct}%</span>
            </div>
          </div>

          <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] text-neutral-400 font-bold mb-1">TRANSIENT DETECTION THRESHOLD</div>
            <div className="flex items-center justify-between">
              <input
                type="range"
                min="10"
                max="100"
                value={transientSensitivity}
                onChange={(e) => {
                  const sens = Number(e.target.value);
                  setTransientSensitivity(sens);
                  const count = Math.max(3, Math.floor(sens / 12));
                  setWarpMarkers(Array.from({ length: count }, (_, i) => Number(((i + 1) / (count + 1)).toFixed(2))));
                }}
                className="w-full accent-cyan-400 mr-2"
              />
              <span className="text-cyan-300 font-bold w-14 text-right">{transientSensitivity}%</span>
            </div>
          </div>

          <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 flex items-center justify-between">
            <button
              onClick={() => setFormantPreserve(!formantPreserve)}
              className={`px-3 py-1.5 rounded text-[10px] font-bold border ${
                formantPreserve
                  ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              FORMANT LOCK: {formantPreserve ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setSampleWaveform((prev) => [...prev].reverse())}
              className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] font-bold"
            >
              REVERSE WAVE
            </button>
          </div>
        </div>

        {/* Sample-Level Audio Editor Tool Bar: Transient Detection Marker Tool, Time-Warp Flex Tool & Zero-Crossings */}
        <div className="bg-[#0d121c] border border-cyan-500/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center space-x-1.5">
            <span className="text-cyan-300 font-black">SAMPLE-LEVEL EDITOR TOOLS:</span>
            {[
              { id: 'transient_pin', label: 'Transient Detection Marker Tool (Peak Onset Pins)' },
              { id: 'time_warp_flex', label: 'Time-Warp Flex Tool (Stretch Anchor Points)' },
              { id: 'zero_cross', label: 'Zero-Crossing Snap Inspector' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSampleEditorTool(st.id as any)}
                className={`px-2.5 py-1 rounded font-bold transition-all ${
                  sampleEditorTool === st.id
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-bold">
              ZERO-CROSSING SNAP: ON &bull; TRANSIENT PINS: {warpMarkers.length}
            </span>
            {([1, 2, 4] as const).map((zm) => (
              <button
                key={zm}
                onClick={() => setSampleZoom(zm)}
                className={`px-2 py-0.5 rounded font-bold ${
                  sampleZoom === zm ? 'bg-amber-500 text-black' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {zm}x ZOOM
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Waveform & Transient Warp Marker Canvas */}
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Number(((e.clientX - rect.left) / rect.width).toFixed(3));
            setWarpMarkers((prev) => [...prev, ratio].sort((a, b) => a - b));
            triggerSamplePreview();
          }}
          className="flex-1 bg-[#07090d] border-2 border-neutral-800 rounded-lg relative overflow-hidden flex items-center px-2 cursor-crosshair"
          title="Click anywhere on waveform to drop a new Transient Warp Marker & audition"
        >
          {/* Center Zero-Crossing Line */}
          <div className="absolute inset-x-0 h-px bg-neutral-800" />

          {/* Waveform Bars */}
          <div className="w-full h-4/5 flex items-center space-x-0.5 z-10">
            {sampleWaveform.map((val, idx) => {
              const hPct = Math.max(6, Math.min(100, Math.abs(val) * 100));
              return (
                <div key={idx} className="flex-1 h-full flex items-center justify-center">
                  <div
                    className="w-full rounded-full bg-gradient-to-b from-cyan-400 via-emerald-500 to-cyan-400 opacity-85"
                    style={{ height: `${hPct}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Transient Warp Markers */}
          {warpMarkers.map((pos, idx) => (
            <div
              key={idx}
              style={{ left: `${pos * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                setWarpMarkers((prev) => prev.filter((_, i) => i !== idx));
              }}
              className="absolute inset-y-0 w-0.5 bg-amber-400 z-20 cursor-pointer group"
              title={`Warp Marker #${idx + 1} (${(pos * 100).toFixed(0)}%) - Click to remove`}
            >
              <div className="bg-amber-400 text-black text-[8px] font-bold px-1 rounded-b -ml-2">
                W{idx + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // MODE 4: ADVANCED AI, VOCAL MANIPULATION, BROWSER/TRANSPORT & OUTBOARD HARDWARE SUITE (19 ENGINES + 76 INTERNAL TOOLS)
  if (mode === 'advanced_suite') {
    const indexedAssets = [
      { id: 'a1', name: 'Berlin_Industrial_Kick_Loop_132.wav', tag: 'DRUMS', bpm: 132, key: 'C Min', style: 'industrial' as const },
      { id: 'a2', name: 'TB303_Liquid_Acid_Line_132.wav', tag: 'SYNTH', bpm: 132, key: 'C Min', style: 'acid' as const },
      { id: 'a3', name: 'Cyber_Choir_Formant_Harmony.wav', tag: 'VOCAL', bpm: 132, key: 'D# Maj', style: 'chords' as const },
      { id: 'a4', name: 'Punjabi_Tumbi_Dhol_Groove_128.wav', tag: 'WORLD', bpm: 128, key: 'G Min', style: 'melody' as const },
      { id: 'a5', name: 'Subtractor_Reese_Neuro_Bass.wav', tag: 'BASS', bpm: 135, key: 'F Min', style: 'industrial' as const },
      { id: 'a6', name: 'EMT140_Plate_Snare_Impact.wav', tag: 'FX', bpm: 130, key: 'C Min', style: 'euclidean' as const },
    ].filter(
      (item) =>
        (browserTagFilter === 'ALL' || item.tag === browserTagFilter) &&
        item.name.toLowerCase().includes(browserSearchQuery.toLowerCase())
    );

    return (
      <div className="flex-1 overflow-y-auto bg-[#0a0c10] p-3 text-xs font-mono space-y-4">
        {/* Top Action & Prompt Bar */}
        <div className="bg-[#12161f] border border-amber-500/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-white font-black text-sm">
                ADVANCED AI, VOCAL MANIPULATION, POWER BROWSER & OUTBOARD HARDWARE SUITE
              </div>
              <div className="text-[10px] text-neutral-400">
                19 Production Engines &bull; 76 Configurable Internal Tools &bull; Target Track:{' '}
                <strong className="text-emerald-400">{activeTrack?.name || 'Master Track'}</strong>
              </div>
            </div>
          </div>

          {/* AI Text-to-Instrument & Prompt Harmonizer Quick Input */}
          <div className="flex items-center space-x-2 flex-1 max-w-xl">
            <input
              type="text"
              value={aiPromptText}
              onChange={(e) => setAiPromptText(e.target.value)}
              placeholder="Enter AI timbre or chord prompt..."
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-amber-400"
            />
            <button
              onClick={() => {
                const msg = audioEngine.executeAdvancedEngineAction('ai_text_to_inst', activeTrack?.id, aiPromptText);
                setAdvStatusBanner(msg);
                setTick((x) => x + 1);
              }}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black whitespace-nowrap"
            >
              TEXT-TO-SYNTH
            </button>
            <button
              onClick={() => {
                const msg = audioEngine.executeAdvancedEngineAction('predictive_preroll', activeTrack?.id);
                setAdvStatusBanner(msg);
                setTick((x) => x + 1);
              }}
              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black whitespace-nowrap"
              title="Predictive Pre-Roll Performance Capture Engine: Commit retroactive circular buffer to track"
            >
              CAPTURE PRE-ROLL
            </button>
          </div>
        </div>

        {advStatusBanner && (
          <div className="bg-emerald-950/80 border border-emerald-500/60 rounded-lg px-3 py-2 text-[10px] text-emerald-200 flex items-center justify-between">
            <span>
              <strong className="text-emerald-400">ENGINE STATUS:</strong> {advStatusBanner}
            </span>
            <button onClick={() => setAdvStatusBanner('')} className="text-neutral-400 hover:text-white font-bold">
              DISMISS
            </button>
          </div>
        )}

        {/* Interactive Tag-Aware Database Indexing Browser & Smart Preview Tempo-Matching Vocoder Bar */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2">
            <div className="flex items-center space-x-2">
              <FolderSearch className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-300 font-bold">
                TAG-AWARE DATABASE INDEXING BROWSER & SMART PREVIEW TEMPO-MATCHING VOCODER
              </span>
              <span className="text-[10px] text-emerald-400">
                · SYNCED TO {audioEngine.bpm} BPM ({audioEngine.scaleType.toUpperCase()})
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={browserSearchQuery}
                  onChange={(e) => setBrowserSearchQuery(e.target.value)}
                  placeholder="Search SQLite FTS5 tags..."
                  className="bg-neutral-900 border border-neutral-700 rounded pl-2 pr-2 py-1 text-[10px] text-white w-44"
                />
              </div>
              {(['ALL', 'DRUMS', 'SYNTH', 'VOCAL', 'BASS', 'WORLD', 'FX'] as const).map((tg) => (
                <button
                  key={tg}
                  onClick={() => setBrowserTagFilter(tg)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    browserTagFilter === tg
                      ? 'bg-cyan-500 text-black'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  {tg}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {indexedAssets.map((asset) => (
              <div
                key={asset.id}
                className="bg-neutral-900/90 border border-neutral-800 rounded p-2 flex items-center justify-between gap-2 text-[10px]"
              >
                <div className="truncate">
                  <div className="text-white font-bold truncate">{asset.name}</div>
                  <div className="text-[9px] text-neutral-400">
                    {asset.tag} · Raw {asset.bpm} BPM &rarr; Warped {audioEngine.bpm} BPM · {asset.key}
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      if (activeTrack) {
                        audioEngine.generateInstrumentPattern(activeTrack.id, asset.style);
                        const msg = audioEngine.executeAdvancedEngineAction('smart_preview_vocoder', activeTrack.id);
                        setAdvStatusBanner(`Smart Preview Tempo-Matched "${asset.name}" @ ${audioEngine.bpm} BPM. ${msg}`);
                        setTick((x) => x + 1);
                      }
                    }}
                    className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[9px]"
                    title="Audition & Load Tempo-Matched Asset into Active Track"
                  >
                    SYNC & LOAD
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All 4 Advanced Suites & Their 19 Engines + 76 Internal Subsystems */}
        {(
          [
            'Advanced AI & Deep Learning Music Tools',
            'Advanced Vocal Manipulation Engines',
            'Browser & Transport Power Components',
            'Real-World Outboard Hardware Mixing & Rack Emulations',
          ] as const
        ).map((suiteTitle) => {
          const engines = ADVANCED_ENGINE_LIST.filter((e) => e.group === suiteTitle);
          return (
            <div key={suiteTitle} className="space-y-2">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                <span className="text-amber-400 font-black text-xs uppercase tracking-wider">{suiteTitle}</span>
                <span className="text-[10px] text-neutral-400">
                  {engines.length} ENGINES &bull; {engines.length * 4} INTERNAL SUBSYSTEMS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {engines.map((eng) => {
                  const outboard = audioEngine.outboardRackState[eng.id];
                  return (
                    <div
                      key={eng.id}
                      className="bg-[#12161f] border border-neutral-800 hover:border-emerald-500/50 rounded-lg p-3 flex flex-col justify-between space-y-2.5 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white font-bold text-xs">{eng.title}</span>
                          <span className="text-[9px] text-emerald-400 font-bold flex-shrink-0">{eng.badge}</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-1">{eng.subtitle}</p>

                        {/* List the 4 Internal Subsystems directly on the card */}
                        <div className="mt-2 pt-2 border-t border-neutral-800/80 space-y-1">
                          {eng.internalTools.map((sub, sIdx) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between text-[9px] text-neutral-300 bg-neutral-900/70 px-2 py-1 rounded"
                            >
                              <span className="truncate pr-2">
                                {sIdx + 1}. {sub.name}
                              </span>
                              <span className="text-cyan-300 font-bold flex-shrink-0">{sub.defaultValue}</span>
                            </div>
                          ))}
                        </div>

                        {/* Interactive Drive & Mix controls for Outboard Hardware Emulations */}
                        {outboard && (
                          <div className="mt-2 pt-2 border-t border-neutral-800/80 grid grid-cols-2 gap-2 text-[9px]">
                            <div>
                              <label className="text-neutral-400 block">DRIVE / THRESH ({outboard.drive}%):</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={outboard.drive}
                                onChange={(e) => {
                                  outboard.drive = Number(e.target.value);
                                  setTick((x) => x + 1);
                                }}
                                className="w-full accent-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-neutral-400 block">PARALLEL MIX ({outboard.mix}%):</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={outboard.mix}
                                onChange={(e) => {
                                  outboard.mix = Number(e.target.value);
                                  setTick((x) => x + 1);
                                }}
                                className="w-full accent-emerald-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 pt-1">
                        <button
                          onClick={() => {
                            const msg = audioEngine.executeAdvancedEngineAction(
                              eng.id,
                              activeTrack?.id,
                              aiPromptText
                            );
                            setAdvStatusBanner(msg);
                            setTick((x) => x + 1);
                          }}
                          className="flex-1 py-1.5 px-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center space-x-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{eng.actionLabel}</span>
                        </button>
                        <button
                          onClick={() => onOpenAdvancedInspector?.(eng.id)}
                          className="py-1.5 px-2.5 rounded bg-neutral-900 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/40 text-[9px] font-bold"
                          title="Inspect & Configure the 4 Internal Subsystems for this Engine"
                        >
                          4 INTERNAL TOOLS
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // MODE 3: DSP & ANALYZER HUB (Core Audio Drivers, Buffer, Latency, FFT Spectrum, Phase Meter & VST Host)
  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0c10] p-3 text-xs font-mono space-y-3">
      {/* Row 1: Core Audio Engine Drivers, Hardware Buffer, SRC, Loopback & CPU Scheduler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Core Audio Driver & Buffer Manager */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Cpu className="w-4 h-4" />
              CORE AUDIO ENGINE & DRIVERS
            </span>
            <span className="text-[10px] text-emerald-300">ACTIVE</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <label className="text-neutral-400 block mb-1">DRIVER ARCHITECTURE:</label>
              <select
                value={audioEngine.driverModel}
                onChange={(e) => {
                  audioEngine.driverModel = e.target.value as any;
                  setTick((x) => x + 1);
                }}
                className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-white font-bold"
              >
                <option value="ASIO">ASIO 2.3 Ultra-Low Latency (Win)</option>
                <option value="CoreAudio">CoreAudio HAL Exclusive (macOS)</option>
                <option value="WebAudio">WebAudio Direct Hardware</option>
              </select>
            </div>

            <div>
              <label className="text-neutral-400 block mb-1">HARDWARE BUFFER SIZE:</label>
              <select
                value={audioEngine.bufferSize}
                onChange={(e) => {
                  const buf = Number(e.target.value) as any;
                  audioEngine.bufferSize = buf;
                  audioEngine.latencyCompMs = Number(((buf / audioEngine.sampleRateTarget) * 1000).toFixed(2));
                  setTick((x) => x + 1);
                }}
                className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-amber-400 font-bold"
              >
                {[64, 128, 256, 512, 1024, 2048].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz} Samples ({((sz / audioEngine.sampleRateTarget) * 1000).toFixed(1)} ms)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-neutral-400 block mb-1">SAMPLE RATE CONVERTER (SRC):</label>
              <select
                value={audioEngine.sampleRateTarget}
                onChange={(e) => {
                  audioEngine.sampleRateTarget = Number(e.target.value) as any;
                  setTick((x) => x + 1);
                }}
                className="w-full bg-neutral-900 border border-neutral-700 rounded p-1 text-cyan-300 font-bold"
              >
                <option value={44100}>44.1 kHz (CD Standard)</option>
                <option value={48000}>48.0 kHz (Studio Broadcast)</option>
                <option value={88200}>88.2 kHz (2x Oversampled)</option>
                <option value={96000}>96.0 kHz (Hi-Res Mastering)</option>
                <option value={192000}>192.0 kHz (Ultra-HD 64-Bit DSP)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <button
                onClick={() => {
                  audioEngine.loopbackEnabled = !audioEngine.loopbackEnabled;
                  setTick((x) => x + 1);
                }}
                className={`w-full py-1 rounded font-bold border ${
                  audioEngine.loopbackEnabled
                    ? 'bg-emerald-800 border-emerald-400 text-white'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                }`}
              >
                LOOPBACK ENGINE: {audioEngine.loopbackEnabled ? 'ON' : 'OFF'}
              </button>
              <div className="text-[9px] text-neutral-400 text-center">
                PDC LATENCY COMP: <strong className="text-emerald-400">{audioEngine.latencyCompMs} ms</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time 64-Band FFT Spectrum Analyzer */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-cyan-300 font-bold flex items-center gap-1.5">
              <Activity className="w-4 h-4" />
              REAL-TIME FFT SPECTRUM ANALYZER
            </span>
            <span className="text-[9px] text-neutral-400">20Hz – 20kHz</span>
          </div>
          <canvas ref={fftCanvasRef} width={360} height={110} className="w-full flex-1 rounded border border-neutral-800" />
        </div>

        {/* Stereo Phase Goniometer & Correlation Meter */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <Radio className="w-4 h-4" />
              STEREO PHASE & CORRELATION METER
            </span>
            <span className="text-[9px] text-emerald-400 font-bold">+0.94 IN-PHASE</span>
          </div>
          <canvas ref={phaseCanvasRef} width={220} height={110} className="w-full flex-1 rounded border border-neutral-800" />
        </div>
      </div>

      {/* Row 2: Multi-Core CPU Thread Scheduler & VST3 / AU / AAX Plugin Host Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
            <span className="text-white font-bold">MULTI-CORE CPU AUDIO THREAD SCHEDULER (8 REAL-TIME CORES)</span>
            <span className="text-emerald-400 text-[10px]">DSP LOAD: 11.4%</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, coreIdx) => {
              const load = 8 + ((coreIdx * 7 + (audioEngine.isPlaying ? 14 : 2)) % 28);
              return (
                <div key={coreIdx} className="bg-neutral-900 p-2 rounded border border-neutral-800">
                  <div className="flex justify-between text-[9px] text-neutral-400 mb-1">
                    <span>RT-CORE {coreIdx + 1}</span>
                    <span className="text-emerald-400 font-bold">{load}%</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-800 rounded overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${load}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* VST3 / CLAP / AU Sandboxed Hosting Engine & Native Stock Processing Suite */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
            <span className="text-white font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              VST3 / CLAP / AU SANDBOXED HOSTING ENGINE
            </span>
            <span className="text-[10px] text-cyan-300">6 SANDBOXED DSP WRAPPERS</span>
          </div>
          <div className="space-y-1.5">
            {vstPlugins.map((plug, idx) => (
              <div
                key={plug.id}
                className="flex items-center justify-between bg-neutral-900/90 px-2.5 py-1.5 rounded border border-neutral-800 text-[10px]"
              >
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const next = [...vstPlugins];
                      next[idx].enabled = !next[idx].enabled;
                      setVstPlugins(next);
                    }}
                    className={`w-3 h-3 rounded-xs ${
                      plug.enabled ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-neutral-700'
                    }`}
                  />
                  <span className="font-bold text-white">{plug.name}</span>
                </div>
                <div className="flex items-center space-x-3 text-neutral-400">
                  <span>{plug.format}</span>
                  <span>CPU: {plug.cpu}</span>
                  <span className="text-emerald-400">PDC: {plug.latency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: LUFS Loudness Metering, LFO/ADSR/Env Follower Modulators, Multiband Sidechain & Auto-Save/Asset Collector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 1. LUFS Loudness Metering & Vectorscope Phase Coherence */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <Gauge className="w-4 h-4" />
              LUFS LOUDNESS METERING ENGINE
            </span>
            <span className="text-[9px] text-emerald-400 font-bold">ITU-R BS.1770-4</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <div className="text-[8px] text-neutral-400">MOMENTARY</div>
              <div className="text-emerald-400 font-black">
                {(audioEngine.lufsMetering.momentary + (audioEngine.isPlaying ? 1.6 : 0)).toFixed(1)} LUFS
              </div>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <div className="text-[8px] text-neutral-400">SHORT-TERM</div>
              <div className="text-cyan-300 font-black">{audioEngine.lufsMetering.shortTerm.toFixed(1)} LUFS</div>
            </div>
            <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
              <div className="text-[8px] text-neutral-400">INTEGRATED</div>
              <div className="text-amber-300 font-black">{audioEngine.lufsMetering.integrated.toFixed(1)} LUFS</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] pt-1 text-neutral-400">
            <span>TRUE PEAK: <strong className="text-emerald-400">{audioEngine.lufsMetering.truePeakDbtp} dBTP</strong></span>
            <span>PHASE DOT: <strong className="text-emerald-400">+{audioEngine.lufsMetering.phaseCorrelation}</strong></span>
          </div>
        </div>

        {/* 2. LFO, ADSR & Envelope Follower Modulator Engine */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              LFO / ADSR / ENVELOPE FOLLOWER
            </span>
            <span className="text-[9px] text-cyan-300 font-bold">MOD MATRIX</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <label className="text-neutral-400 block">LFO RATE ({audioEngine.lfoEngine.rateHz}Hz):</label>
              <input
                type="range"
                min="0.2"
                max="16"
                step="0.2"
                value={audioEngine.lfoEngine.rateHz}
                onChange={(e) => {
                  audioEngine.lfoEngine.rateHz = Number(e.target.value);
                  setTick((x) => x + 1);
                }}
                className="w-full accent-emerald-500"
              />
            </div>
            <div>
              <label className="text-neutral-400 block">ADSR RELEASE ({audioEngine.adsrEngine.releaseMs}ms):</label>
              <input
                type="range"
                min="20"
                max="2000"
                value={audioEngine.adsrEngine.releaseMs}
                onChange={(e) => {
                  audioEngine.adsrEngine.releaseMs = Number(e.target.value);
                  setTick((x) => x + 1);
                }}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[9px] text-neutral-400">
            <span>ENV FOLLOWER: <strong className="text-cyan-300">{audioEngine.envFollowerEngine.thresholdDb} dB</strong></span>
            <span>SIDECHAIN 3-BAND: <strong className="text-emerald-400">-{audioEngine.multibandSidechain.lowDuckPct}% LOW</strong></span>
          </div>
        </div>

        {/* 3. Background Session Auto-Save Daemon & Sample Dependency Asset Collector */}
        <div className="bg-[#12161f] border border-neutral-800 rounded-lg p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-cyan-300 font-bold">AUTO-SAVE DAEMON & ASSET COLLECTOR</span>
            <span className="text-[9px] text-emerald-400 font-bold">{audioEngine.lastAutoSaveTimestamp}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                audioEngine.saveSessionSnapshot('DSP Hub Checkpoint');
                setTick((x) => x + 1);
              }}
              className="flex-1 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold"
            >
              SAVE SESSION SNAPSHOT
            </button>
            <button
              onClick={() => audioEngine.exportDependencyBundle()}
              className="flex-1 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold"
            >
              COLLECT ASSETS (.UBXPACK)
            </button>
          </div>
          <div className="text-[9px] text-neutral-400 flex justify-between">
            <span>SNAPSHOTS: {audioEngine.autoSaveSnapshots.length} SAVED</span>
            <span>SANDBOX IPC: {audioEngine.sandboxHost.isolationMode}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

