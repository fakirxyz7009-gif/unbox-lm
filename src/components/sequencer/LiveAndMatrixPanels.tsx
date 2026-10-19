import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../../audio/AudioEngine.ts';
import { BaseDevice } from '../../audio/BaseDevice.ts';
import { SequencerTrack } from '../../audio/types.ts';
import { VisualizerThemeProfile } from '../CommandAndStageOverlays.tsx';
import {
  Play,
  Square,
  Radio,
  Layers,
  Sliders,
  Video,
  Activity,
  Cpu,
  Disc,
  Repeat,
  Plus,
  Sparkles,
  Download,
  Gauge,
  Grid,
} from 'lucide-react';

interface LiveAndMatrixPanelsProps {
  mode: 'loop_tracker' | 'routing_mod_matrix' | 'video_visualizer';
  audioEngine: AudioEngine;
  devices: BaseDevice[];
  tracks: SequencerTrack[];
  activeTrack: SequencerTrack | undefined;
  onSelectTrack: (trackId: string) => void;
  activeVisualizerTheme: VisualizerThemeProfile;
  onChangeVisualizerTheme: (theme: VisualizerThemeProfile) => void;
  onOpenStageMode?: () => void;
  onOpenBatchExporter?: () => void;
}

const SCENE_NAMES = [
  'SCENE 01 // ATMOS INTRO',
  'SCENE 02 // SUB PULSE',
  'SCENE 03 // INDUSTRIAL DRIVE',
  'SCENE 04 // ACID PEAK',
  'SCENE 05 // BREAKDOWN',
  'SCENE 06 // WYVERN DROP',
  'SCENE 07 // EMBER CLIMAX',
  'SCENE 08 // OUTRO DUB',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const formatMidiNote = (midi: number) => {
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${oct}`;
};

export const LiveAndMatrixPanels: React.FC<LiveAndMatrixPanelsProps> = ({
  mode,
  audioEngine,
  devices,
  tracks,
  activeTrack,
  onSelectTrack,
  activeVisualizerTheme,
  onChangeVisualizerTheme,
  onOpenStageMode,
  onOpenBatchExporter,
}) => {
  const [subLayout, setSubLayout] = useState<'split' | 'launcher' | 'tracker'>('split');
  const [launchQuantize, setLaunchQuantize] = useState<'1 Bar' | '1 Beat' | 'Immediate'>('1 Bar');
  const [sosBanner, setSosBanner] = useState<string>('');

  // 128-Channel Visual Routing Matrix Bank State
  const [matrixBank, setMatrixBank] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>(0); // 8 banks of 16 channels = 128 channels
  const [customMatrixNodes, setCustomMatrixNodes] = useState<Record<string, boolean>>({
    '0:0': true,
    '1:1': true,
    '2:2': true,
    '3:3': true,
    '4:0': true,
    '5:2': true,
  });

  // LFO & Video Visualizer Canvases
  const lfoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vectorscopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRecordingMp4, setIsRecordingMp4] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [, setTick] = useState(0);

  // Animate Global LFO Canvas in routing_mod_matrix mode
  useEffect(() => {
    if (mode !== 'routing_mod_matrix') return;
    let rafId: number;
    let phase = 0;

    const drawLfo = () => {
      phase += 0.04 * (audioEngine.lfoEngine.rateHz / 2);
      const canvas = lfoCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.fillStyle = '#060a12';
          ctx.fillRect(0, 0, w, h);

          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const wf = audioEngine.lfoEngine.waveform;
          const depth = audioEngine.lfoEngine.depth;

          for (let x = 0; x < w; x++) {
            const t = (x / w) * Math.PI * 4 + phase;
            let val = 0;
            if (wf === 'sine') val = Math.sin(t);
            else if (wf === 'square') val = Math.sin(t) >= 0 ? 1 : -1;
            else if (wf === 'triangle') val = (2 / Math.PI) * Math.asin(Math.sin(t));
            else if (wf === 'sawtooth') val = 2 * ((t / (2 * Math.PI)) - Math.floor(0.5 + t / (2 * Math.PI)));
            else val = Math.sin(Math.floor(t * 2) * 12.9898) > 0 ? 0.8 : -0.8;

            const y = h / 2 - val * depth * (h * 0.42);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      rafId = requestAnimationFrame(drawLfo);
    };

    rafId = requestAnimationFrame(drawLfo);
    return () => cancelAnimationFrame(rafId);
  }, [mode, audioEngine]);

  // Animate Hardware Video Visualizer & Vectorscope in video_visualizer mode
  useEffect(() => {
    if (mode !== 'video_visualizer') return;
    let rafId: number;
    const freqData = new Uint8Array(audioEngine.analyserL.frequencyBinCount);
    const timeL = new Float32Array(audioEngine.analyserL.fftSize);
    const timeR = new Float32Array(audioEngine.analyserR.fftSize);
    let phase = 0;

    const renderVis = () => {
      phase += 0.035;
      audioEngine.analyserL.getByteFrequencyData(freqData);
      audioEngine.analyserL.getFloatTimeDomainData(timeL);
      audioEngine.analyserR.getFloatTimeDomainData(timeR);

      // 1. Hardware Video Visualizer Canvas
      const vCanvas = videoCanvasRef.current;
      if (vCanvas) {
        const ctx = vCanvas.getContext('2d');
        if (ctx) {
          const w = vCanvas.width;
          const h = vCanvas.height;
          const bass = (freqData[1] + freqData[2] + freqData[3]) / (3 * 255);

          if (activeVisualizerTheme === 'Synthwave') {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#090316');
            grad.addColorStop(0.55, '#2e094e');
            grad.addColorStop(1, '#050811');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Retro Sun
            const sunR = 45 + bass * 26;
            const sunG = ctx.createLinearGradient(0, h * 0.15, 0, h * 0.55);
            sunG.addColorStop(0, '#f43f5e');
            sunG.addColorStop(1, '#f59e0b');
            ctx.fillStyle = sunG;
            ctx.beginPath();
            ctx.arc(w / 2, h * 0.36, sunR, 0, Math.PI * 2);
            ctx.fill();

            // Perspective Neon Grid
            const hy = h * 0.56;
            ctx.strokeStyle = 'rgba(236, 72, 153, 0.55)';
            ctx.lineWidth = 1.2;
            for (let i = -8; i <= 8; i++) {
              ctx.beginPath();
              ctx.moveTo(w / 2 + i * 16, hy);
              ctx.lineTo(w / 2 + i * 85, h);
              ctx.stroke();
            }
            for (let r = 0; r < 7; r++) {
              const yo = ((r + (phase % 1)) / 7) ** 1.7 * (h - hy);
              ctx.beginPath();
              ctx.moveTo(0, hy + yo);
              ctx.lineTo(w, hy + yo);
              ctx.stroke();
            }
          } else if (activeVisualizerTheme === 'Neon') {
            ctx.fillStyle = 'rgba(4, 8, 16, 0.35)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            for (let i = 0; i < 64; i++) {
              const ang = (i / 64) * Math.PI * 2 + phase * 0.4;
              const rad = 50 + (freqData[i] / 255) * 90;
              const x = w / 2 + Math.cos(ang) * rad;
              const y = h / 2 + Math.sin(ang) * rad;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
          } else if (activeVisualizerTheme === 'Galaxy') {
            ctx.fillStyle = 'rgba(3, 6, 15, 0.3)';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 64; i++) {
              const arm = i % 3;
              const dist = (i / 64) * (Math.min(w, h) * 0.45);
              const ang = arm * ((Math.PI * 2) / 3) + dist * 0.03 - phase * 0.6;
              const sz = 1.5 + (freqData[i] / 255) * 5.5;
              ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#a855f7';
              ctx.beginPath();
              ctx.arc(w / 2 + Math.cos(ang) * dist, h / 2 + Math.sin(ang) * dist, sz, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (activeVisualizerTheme === 'Inferno') {
            ctx.fillStyle = 'rgba(15, 4, 4, 0.35)';
            ctx.fillRect(0, 0, w, h);
            const bars = 48;
            const bw = w / bars;
            for (let i = 0; i < bars; i++) {
              const v = freqData[i] / 255;
              const bh = Math.max(6, v * h * 0.85);
              const g = ctx.createLinearGradient(0, h, 0, h - bh);
              g.addColorStop(0, '#991b1b');
              g.addColorStop(0.5, '#ea580c');
              g.addColorStop(1, '#fde047');
              ctx.fillStyle = g;
              ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
            }
          } else {
            ctx.fillStyle = '#060a12';
            ctx.fillRect(0, 0, w, h);
            const playX = ((audioEngine.currentStep % 16) / 16) * w;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
            ctx.fillRect(playX, 0, w / 16, h);
          }

          // Dynamic Audio Waveform Overlay
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < timeL.length; i++) {
            const x = (i / (timeL.length - 1)) * w;
            const y = h / 2 + timeL[i] * (h * 0.32);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // 2. Precision Vectorscope Canvas
      const vecCanvas = vectorscopeCanvasRef.current;
      if (vecCanvas) {
        const ctx = vecCanvas.getContext('2d');
        if (ctx) {
          const w = vecCanvas.width;
          const h = vecCanvas.height;
          ctx.fillStyle = 'rgba(6, 10, 18, 0.35)';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w / 2, h);
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < timeL.length; i++) {
            const l = timeL[i];
            const r = timeR[i];
            const mid = (l + r) * 0.5;
            const side = (l - r) * 0.5;
            const x = w / 2 + side * (w * 0.44);
            const y = h / 2 - mid * (h * 0.44);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(renderVis);
    };

    rafId = requestAnimationFrame(renderVis);
    return () => cancelAnimationFrame(rafId);
  }, [mode, activeVisualizerTheme, audioEngine]);

  const handleRecordVisualizerVideo = () => {
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    if (!isRecordingMp4) {
      try {
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
        if (!stream) return;
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Unboxed_Visualizer_${activeVisualizerTheme}.webm`;
          a.click();
        };
        rec.start();
        mediaRecRef.current = rec;
        setIsRecordingMp4(true);
      } catch (e) {}
    } else {
      mediaRecRef.current?.stop();
      setIsRecordingMp4(false);
    }
  };

  // ============================================================================
  // MODE A: LOOP LAUNCHER (Live Scene Trigger Grid) & STEP TRACKER (Hex/List Data Entry)
  // ============================================================================
  if (mode === 'loop_tracker') {
    const len = Math.max(16, audioEngine.patternLength);

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#060a12] text-xs font-mono">
        {/* Top Control Bar: View Switcher + Sound-on-Sound Loop Recorder */}
        <div className="bg-[#0b111e] border-b border-cyan-500/25 px-3 py-2 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-black text-cyan-300 mr-1">VIEW MODE:</span>
            {[
              { id: 'split', label: 'SPLIT (LOOP LAUNCHER + STEP TRACKER)' },
              { id: 'launcher', label: 'LOOP LAUNCHER MATRIX' },
              { id: 'tracker', label: 'STEP TRACKER DATA ENTRY' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSubLayout(m.id as any)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  subLayout === m.id
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}

            <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[10px]">
              <span className="text-slate-400">QUANTIZE LAUNCH:</span>
              {(['1 Bar', '1 Beat', 'Immediate'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setLaunchQuantize(q)}
                  className={`px-1.5 py-0.5 rounded font-bold ${
                    launchQuantize === q ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Sound-on-Sound Loop Recorder Engine Strip */}
          <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-amber-500/40">
            <Disc className={`w-4 h-4 text-amber-400 ${audioEngine.soundOnSoundLooper.active ? 'animate-spin' : ''}`} />
            <span className="text-[10px] font-black text-amber-300">SOUND-ON-SOUND TAPE LOOPER:</span>
            <span className="text-[10px] text-slate-400">
              DECAY: <strong className="text-emerald-300">{audioEngine.soundOnSoundLooper.feedbackDecayPct}%</strong>
            </span>
            <input
              type="range"
              min={50}
              max={100}
              value={audioEngine.soundOnSoundLooper.feedbackDecayPct}
              onChange={(e) => {
                audioEngine.soundOnSoundLooper.feedbackDecayPct = Number(e.target.value);
                setTick((x) => x + 1);
              }}
              className="w-16 accent-amber-400"
              title="Tape Overdub Feedback Decay %"
            />
            <button
              onClick={() => {
                if (activeTrack) {
                  const msg = audioEngine.triggerSoundOnSoundOverdub(activeTrack.id);
                  setSosBanner(msg);
                  setTick((x) => x + 1);
                }
              }}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px]"
              title="Overdub a new harmonically locked layer onto the active loop with tape feedback decay"
            >
              + OVERDUB PASS (#{audioEngine.soundOnSoundLooper.overdubPasses})
            </button>
          </div>
        </div>

        {sosBanner && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/50 px-3 py-1 text-[10px] text-emerald-200 flex items-center justify-between">
            <span>{sosBanner}</span>
            <button onClick={() => setSosBanner('')} className="text-slate-400 hover:text-white font-bold">
              DISMISS
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* LEFT / TOP: LOOP LAUNCHER (Grid of Launchable Pattern Clips for Live Scene Triggering) */}
          {(subLayout === 'split' || subLayout === 'launcher') && (
            <div className={`${subLayout === 'split' ? 'lg:w-1/2' : 'w-full'} flex flex-col overflow-auto p-3 space-y-2`}>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-cyan-300 font-black text-xs flex items-center gap-1.5">
                  <Grid className="w-4 h-4" />
                  LOOP LAUNCHER // LIVE SCENE & CLIP MATRIX
                </span>
                <span className="text-[10px] text-emerald-400">
                  ACTIVE SCENE: SCENE 0{audioEngine.activePatternIndex + 1}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#0b111e] text-slate-300 border-b border-slate-800">
                      <th className="p-2 text-left w-44">MASTER SCENE LAUNCH</th>
                      {tracks.map((t) => (
                        <th
                          key={t.id}
                          onClick={() => onSelectTrack(t.id)}
                          className={`p-2 text-left cursor-pointer border-l border-slate-800 truncate max-w-[120px] ${
                            t.id === activeTrack?.id ? 'bg-cyan-950/60 text-cyan-300' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-xs" style={{ backgroundColor: t.color }} />
                            <span className="truncate font-bold">{t.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {SCENE_NAMES.map((sceneTitle, sceneIdx) => {
                      const isSceneActive = audioEngine.activePatternIndex === sceneIdx;
                      return (
                        <tr
                          key={sceneIdx}
                          className={isSceneActive ? 'bg-cyan-500/10' : 'hover:bg-slate-900/50'}
                        >
                          {/* Scene Master Trigger Button */}
                          <td className="p-1.5">
                            <button
                              onClick={() => {
                                audioEngine.switchPatternBank(sceneIdx);
                                if (!audioEngine.isPlaying) audioEngine.togglePlay();
                                setTick((x) => x + 1);
                              }}
                              className={`w-full px-2.5 py-2 rounded flex items-center justify-between font-black transition-all ${
                                isSceneActive
                                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
                              }`}
                            >
                              <span className="truncate">{sceneTitle}</span>
                              <Play className="w-3 h-3 fill-current flex-shrink-0 ml-1" />
                            </button>
                          </td>

                          {/* Individual Track Clip Pads for this Scene */}
                          {tracks.map((t) => {
                            const patSteps =
                              sceneIdx === audioEngine.activePatternIndex
                                ? t.steps
                                : t.patterns?.[sceneIdx] || [];
                            const noteCount = patSteps.filter(Boolean).length;

                            return (
                              <td key={t.id} className="p-1.5 border-l border-slate-800/80">
                                <button
                                  onClick={() => {
                                    onSelectTrack(t.id);
                                    audioEngine.switchPatternBank(sceneIdx);
                                    if (noteCount === 0) {
                                      const styles = ['industrial', 'acid', 'bass', 'melody', 'arp', 'chords'] as const;
                                      audioEngine.generateInstrumentPattern(t.id, styles[sceneIdx % styles.length]);
                                    }
                                    if (!audioEngine.isPlaying) audioEngine.togglePlay();
                                    setTick((x) => x + 1);
                                  }}
                                  style={{
                                    borderColor: isSceneActive ? t.color : 'rgba(30,41,59,0.9)',
                                  }}
                                  className={`w-full py-2 px-2 rounded border text-left transition-all flex items-center justify-between ${
                                    isSceneActive && !t.mute
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'bg-slate-950/90 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  <div className="truncate">
                                    <div className="font-bold text-[9px] truncate" style={{ color: t.color }}>
                                      CLIP {sceneIdx + 1}
                                    </div>
                                    <div className="text-[8px] text-slate-400">
                                      {noteCount > 0 ? `${noteCount} Events` : '+ Auto-Gen'}
                                    </div>
                                  </div>
                                  <Play className="w-2.5 h-2.5 opacity-75 flex-shrink-0" />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RIGHT / BOTTOM: STEP TRACKER / SEQUENCER (Grid and List-Based Pattern Data Entry View) */}
          {(subLayout === 'split' || subLayout === 'tracker') && activeTrack && (
            <div className={`${subLayout === 'split' ? 'lg:w-1/2' : 'w-full'} flex flex-col overflow-hidden p-3 space-y-2 bg-[#050810]`}>
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center space-x-2">
                  <span className="text-emerald-400 font-black text-xs">
                    STEP TRACKER // HEX & LIST PATTERN DATA ENTRY
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-cyan-300 font-bold">
                    TRACK: {activeTrack.name}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const msg = audioEngine.autoAlignTrackMidi(activeTrack.id, 100);
                    setSosBanner(msg);
                    setTick((x) => x + 1);
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-[10px]"
                >
                  AUTO-ALIGN MIDI
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-800 rounded-lg">
                <table className="w-full border-collapse text-[10px] font-mono">
                  <thead className="bg-[#0b111e] text-cyan-300 sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="p-1.5 text-left">ROW</th>
                      <th className="p-1.5 text-left">NOTE</th>
                      <th className="p-1.5 text-left">LEN</th>
                      <th className="p-1.5 text-left">VEL</th>
                      <th className="p-1.5 text-left">RATCHET</th>
                      <th className="p-1.5 text-left">MPE PITCH</th>
                      <th className="p-1.5 text-left">MPE PRESS</th>
                      <th className="p-1.5 text-left">MPE SLIDE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {Array.from({ length: Math.min(64, len) }).map((_, stepIdx) => {
                      const n = activeTrack.steps[stepIdx];
                      const isCurrent = audioEngine.currentStep === stepIdx;
                      const hexRow = stepIdx.toString(16).toUpperCase().padStart(2, '0');

                      return (
                        <tr
                          key={stepIdx}
                          className={`${
                            isCurrent
                              ? 'bg-amber-500/25 text-amber-200 font-bold'
                              : stepIdx % 4 === 0
                              ? 'bg-slate-900/70'
                              : 'bg-[#070b13]'
                          } hover:bg-cyan-950/40 transition-colors`}
                        >
                          <td className="p-1.5 text-slate-400">
                            {hexRow} <span className="text-[8px] opacity-60">({stepIdx + 1})</span>
                          </td>

                          {/* Note Trigger / Pitch Selector */}
                          <td className="p-1.5">
                            <button
                              onClick={() => {
                                if (n) {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, null);
                                } else {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    note: 60 + audioEngine.rootKey,
                                    velocity: 0.88,
                                    length: 1,
                                    ratchet: 1,
                                    mpePitch: 0,
                                    mpePressure: 0.75,
                                    mpeSlide: 0.5,
                                  });
                                }
                                setTick((x) => x + 1);
                              }}
                              className={`px-2 py-0.5 rounded font-bold ${
                                n
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {n ? formatMidiNote(n.note) : '---'}
                            </button>
                          </td>

                          {/* Step Duration Length */}
                          <td className="p-1.5">
                            {n ? (
                              <input
                                type="number"
                                min={1}
                                max={16}
                                value={n.length || 1}
                                onChange={(e) => {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    ...n,
                                    length: Math.max(1, Number(e.target.value)),
                                  });
                                  setTick((x) => x + 1);
                                }}
                                className="w-11 bg-slate-950 border border-slate-700 rounded px-1 text-cyan-300"
                              />
                            ) : (
                              <span className="text-slate-600">..</span>
                            )}
                          </td>

                          {/* Velocity */}
                          <td className="p-1.5">
                            {n ? (
                              <input
                                type="number"
                                min={10}
                                max={100}
                                step={5}
                                value={Math.round((n.velocity ?? 0.85) * 100)}
                                onChange={(e) => {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    ...n,
                                    velocity: Math.max(0.1, Math.min(1, Number(e.target.value) / 100)),
                                  });
                                  setTick((x) => x + 1);
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-emerald-300"
                              />
                            ) : (
                              <span className="text-slate-600">..</span>
                            )}
                          </td>

                          {/* Ratchet */}
                          <td className="p-1.5">
                            {n ? (
                              <button
                                onClick={() => {
                                  const nextR = ((n.ratchet || 1) % 4) + 1;
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, { ...n, ratchet: nextR });
                                  setTick((x) => x + 1);
                                }}
                                className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold"
                              >
                                {n.ratchet || 1}x
                              </button>
                            ) : (
                              <span className="text-slate-600">1x</span>
                            )}
                          </td>

                          {/* MPE Pitch Bend (-12..+12) */}
                          <td className="p-1.5">
                            {n ? (
                              <input
                                type="number"
                                min={-12}
                                max={12}
                                value={n.mpePitch ?? 0}
                                onChange={(e) => {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    ...n,
                                    mpePitch: Number(e.target.value),
                                    finePitch: Number(e.target.value) * 15,
                                  });
                                  setTick((x) => x + 1);
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-purple-300"
                              />
                            ) : (
                              <span className="text-slate-600">+0</span>
                            )}
                          </td>

                          {/* MPE Pressure */}
                          <td className="p-1.5">
                            {n ? (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={10}
                                value={Math.round((n.mpePressure ?? n.aftertouch ?? 0.7) * 100)}
                                onChange={(e) => {
                                  const v = Number(e.target.value) / 100;
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    ...n,
                                    mpePressure: v,
                                    aftertouch: v,
                                  });
                                  setTick((x) => x + 1);
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-cyan-300"
                              />
                            ) : (
                              <span className="text-slate-600">00</span>
                            )}
                          </td>

                          {/* MPE Slide */}
                          <td className="p-1.5">
                            {n ? (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={10}
                                value={Math.round((n.mpeSlide ?? 0.5) * 100)}
                                onChange={(e) => {
                                  audioEngine.setTrackStep(activeTrack.id, stepIdx, {
                                    ...n,
                                    mpeSlide: Number(e.target.value) / 100,
                                  });
                                  setTick((x) => x + 1);
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-amber-300"
                              />
                            ) : (
                              <span className="text-slate-600">50</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE B: 128-CHANNEL VISUAL ROUTING MATRIX, MODULATION CONTAINERS, GLOBAL LFO & MACROS
  // ============================================================================
  if (mode === 'routing_mod_matrix') {
    const startCh = matrixBank * 16 + 1;

    return (
      <div className="flex-1 overflow-y-auto bg-[#060a12] p-3 text-xs font-mono space-y-3">
        {/* Top Row: 128-Channel Visual Routing Matrix */}
        <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <div className="text-cyan-300 font-black text-sm">
                128-CHANNEL VISUAL ROUTING MATRIX // GRAPHIC PATCH-BAY NODE CONNECTION MAP
              </div>
              <div className="text-[10px] text-slate-400">
                Click any intersection node to patch Audio, CV, or Sidechain buses across 128 Studio Channels
              </div>
            </div>

            {/* 8 Banks x 16 Channels = 128 Channels Switcher */}
            <div className="flex items-center space-x-1">
              {Array.from({ length: 8 }).map((_, bIdx) => {
                const s = bIdx * 16 + 1;
                const e = s + 15;
                return (
                  <button
                    key={bIdx}
                    onClick={() => setMatrixBank(bIdx as any)}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                      matrixBank === bIdx
                        ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    CH {s}–{e}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 16x8 Interactive Graphic Node Matrix Grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="text-cyan-300 border-b border-slate-800">
                  <th className="p-1.5 text-left">SOURCE \ DEST BUS</th>
                  {Array.from({ length: 16 }).map((_, col) => (
                    <th key={col} className="p-1 text-center border-l border-slate-800/80">
                      CH {startCh + col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Array.from({ length: 8 }).map((_, row) => {
                  const trackLabel = tracks[row]?.name || `AUX / SUBMIX BUS ${row + 1}`;
                  return (
                    <tr key={row} className="hover:bg-slate-900/50">
                      <td className="p-1.5 font-bold text-white truncate max-w-[160px]">
                        {row + 1}. {trackLabel}
                      </td>
                      {Array.from({ length: 16 }).map((_, col) => {
                        const key = `${row}:${matrixBank * 16 + col}`;
                        const active = !!customMatrixNodes[key];
                        return (
                          <td
                            key={col}
                            onClick={() =>
                              setCustomMatrixNodes((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                            className="p-1 text-center border-l border-slate-800/60 cursor-pointer"
                          >
                            <div
                              className={`w-4 h-4 mx-auto rounded-full transition-all flex items-center justify-center ${
                                active
                                  ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] scale-110'
                                  : 'bg-slate-900 hover:bg-slate-700 border border-slate-700'
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Row: Global LFO Wave-Shape Generator, Modulation Container Slots & 8 Macro Control Knobs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 1. Global Low-Frequency Oscillator (LFO) Wave-Shape Generator */}
          <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-cyan-300 font-black">GLOBAL LFO WAVE-SHAPE GENERATOR</span>
              <span className="text-[9px] text-emerald-400 font-bold">{audioEngine.lfoEngine.rateHz} Hz</span>
            </div>

            <canvas ref={lfoCanvasRef} width={300} height={85} className="w-full rounded border border-slate-800" />

            <div className="flex items-center space-x-1">
              {(
                [
                  { id: 'sine', label: 'Sine' },
                  { id: 'square', label: 'Square' },
                  { id: 'triangle', label: 'Triangle' },
                  { id: 's_and_h', label: 'Random' },
                ] as const
              ).map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => {
                    audioEngine.lfoEngine.waveform = wf.id;
                    setTick((x) => x + 1);
                  }}
                  className={`flex-1 py-1 rounded text-[9px] font-bold ${
                    audioEngine.lfoEngine.waveform === wf.id
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {wf.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div>
                <label className="text-slate-400 block">RATE ({audioEngine.lfoEngine.rateHz} Hz):</label>
                <input
                  type="range"
                  min={0.2}
                  max={16}
                  step={0.2}
                  value={audioEngine.lfoEngine.rateHz}
                  onChange={(e) => {
                    audioEngine.lfoEngine.rateHz = Number(e.target.value);
                    setTick((x) => x + 1);
                  }}
                  className="w-full accent-cyan-400"
                />
              </div>
              <div>
                <label className="text-slate-400 block">DEPTH ({Math.round(audioEngine.lfoEngine.depth * 100)}%):</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={audioEngine.lfoEngine.depth}
                  onChange={(e) => {
                    audioEngine.lfoEngine.depth = Number(e.target.value);
                    setTick((x) => x + 1);
                  }}
                  className="w-full accent-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* 2. Modulation Container Slots */}
          <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-emerald-400 font-black">MODULATION CONTAINER SLOTS</span>
              <span className="text-[9px] text-cyan-300">4 ACTIVE SLOTS</span>
            </div>
            <div className="space-y-1.5">
              {audioEngine.modulationContainers.map((slot) => (
                <div key={slot.id} className="bg-slate-950 border border-slate-800 rounded p-2 text-[9px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-cyan-300">{slot.name}: {slot.source}</span>
                    <span className="text-emerald-400 font-bold">{Math.round(slot.depth * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 truncate">&rarr; {slot.target}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={slot.depth}
                      onChange={(e) => {
                        slot.depth = Number(e.target.value);
                        setTick((x) => x + 1);
                      }}
                      className="w-24 accent-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Macro Control Knobs (8 Bounded Rotary Dials) */}
          <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-amber-300 font-black">8 BOUNDED MACRO CONTROL KNOBS</span>
              <span className="text-[9px] text-emerald-400">MULTI-PARAM</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {audioEngine.macroKnobs.map((mc) => (
                <div key={mc.id} className="bg-slate-950 border border-slate-800 rounded p-1.5 text-[9px]">
                  <div className="flex justify-between font-bold text-white">
                    <span className="truncate">{mc.name}</span>
                    <span className="text-cyan-300">{Math.round(mc.value * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={mc.minBound}
                    max={mc.maxBound}
                    step={0.01}
                    value={mc.value}
                    onChange={(e) => {
                      mc.value = Number(e.target.value);
                      setTick((x) => x + 1);
                    }}
                    className="w-full accent-amber-400 my-0.5"
                  />
                  <div className="text-[8px] text-slate-400 truncate">
                    [{Math.round(mc.minBound * 100)}–{Math.round(mc.maxBound * 100)}%] {mc.targets.join(' + ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MODE C: HARDWARE VIDEO VISUALIZER, 5 THEME VIEWS & PRECISION DIAGNOSTIC SCOPES
  // ============================================================================
  return (
    <div className="flex-1 overflow-y-auto bg-[#060a12] p-3 text-xs font-mono space-y-3">
      {/* Header Strip with 5 Theme Profiles + MP4/WebM Recorder + Stage Mode */}
      <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Video className="w-5 h-5 text-cyan-400" />
          <div>
            <div className="text-white font-black text-sm">
              HARDWARE VIDEO VISUALIZER & PRECISION DIAGNOSTIC SCOPES
            </div>
            <div className="text-[10px] text-slate-400">
              Real-Time Audio-Reactive Video Engine &bull; 5 Visualizer Theme Profiles &bull; True Peak, Vectorscope & LUFS
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['Synthwave', 'Neon', 'Galaxy', 'Inferno', 'Timeline'] as VisualizerThemeProfile[]).map((theme) => (
            <button
              key={theme}
              onClick={() => onChangeVisualizerTheme(theme)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                activeVisualizerTheme === theme
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                  : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              {theme.toUpperCase()}
            </button>
          ))}

          <button
            onClick={handleRecordVisualizerVideo}
            className={`px-3 py-1 rounded text-[10px] font-black flex items-center space-x-1 ${
              isRecordingMp4
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{isRecordingMp4 ? 'STOP & DOWNLOAD VIDEO' : 'RENDER VIDEO (.WEBM/MP4)'}</span>
          </button>

          {onOpenStageMode && (
            <button
              onClick={onOpenStageMode}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px]"
            >
              STAGE MODE [F11]
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Main Hardware Video Visualizer Canvas */}
        <div className="lg:col-span-2 bg-black border border-cyan-500/40 rounded-xl overflow-hidden relative min-h-[290px]">
          <canvas ref={videoCanvasRef} width={820} height={340} className="w-full h-full object-cover" />
          <div className="absolute bottom-3 left-3 bg-black/75 px-2.5 py-1 rounded border border-cyan-500/40 text-[10px]">
            <span className="text-cyan-300 font-bold">ACTIVE PROFILE: {activeVisualizerTheme.toUpperCase()}</span>
            <span className="text-slate-400 ml-2">&bull; 60FPS GPU CANVAS STREAM</span>
          </div>
        </div>

        {/* Precision Diagnostic Scopes: True Peak Faders, Phase Vectorscope & Real-Time LUFS */}
        <div className="bg-[#0b111e] border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between space-y-3">
          <div className="text-emerald-400 font-black text-xs border-b border-slate-800 pb-1.5 flex justify-between">
            <span>PRECISION DIAGNOSTIC SCOPES</span>
            <span>ITU-R BS.1770-4</span>
          </div>

          <canvas
            ref={vectorscopeCanvasRef}
            width={260}
            height={130}
            className="w-full rounded border border-slate-800 bg-slate-950"
          />

          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-[8px] text-slate-400">MOMENTARY</div>
              <div className="text-cyan-300 font-black">{audioEngine.lufsMetering.momentary.toFixed(1)} LUFS</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-[8px] text-slate-400">INTEGRATED</div>
              <div className="text-emerald-400 font-black">{audioEngine.lufsMetering.integrated.toFixed(1)} LUFS</div>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800">
              <div className="text-[8px] text-slate-400">TRUE PEAK</div>
              <div className="text-amber-300 font-black">{audioEngine.lufsMetering.truePeakDbtp.toFixed(1)} dBTP</div>
            </div>
          </div>

          {onOpenBatchExporter && (
            <button
              onClick={onOpenBatchExporter}
              className="w-full py-2 rounded bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-black text-[10px]"
            >
              OPEN BATCH STEM EXPORTER & CLIP GAIN MAPS
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
