/**
 * SampleBrowser — the audio side of the browser: every sample in the project, plus the
 * source-separation tools, multi-file importer, audio-to-playable-instrument engine,
 * and piano roll note transcription.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  FileAudio,
  Pause,
  Piano,
  Play,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { audioStore, type AudioAsset } from '../../audio/clips/audioStore.ts';
import {
  musicSeparator,
  type SeparatedStem,
  type SeparationProgress,
  type StemSplitMode,
  STEM_MODE_CONFIGS,
} from '../../audio/ai/MusicSeparator.ts';
import { Btn, Panel } from '../../studio/ui/controls.tsx';
import { LinkImport } from './LinkImport.tsx';
import { assetToWav, DEMUCS_STEM_INFO, DEMUCS_STEMS, fetchDemucsStatus, separateWithDemucs, type DemucsModel, type DemucsStem } from '../../audio/ai/demucsSeparation.ts';
import { addStemNotes } from '../../audio/ai/stemNotes.ts';
import { createPlayableInstrumentFromAsset } from '../../audio/ai/playableInstrument.ts';
import { deviceSampleAudioIds } from '../../audio/deviceSamples.ts';
import { derivedAudioProvenance } from '../../../shared/audio/provenance.ts';
import { showConfirm } from '../../shell/dialogService.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMessage?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type StemSet = Record<string, SeparatedStem>;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    const style = window.getComputedStyle(element);
    return element.tabIndex >= 0 && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

const AUTO_INSTRUMENT_KEY = 'unbox.autoInstrument';

/** Whether an imported audio file becomes an instrument with notes. On unless turned off. */
function readAutoInstrument(): boolean {
  try {
    return window.localStorage.getItem(AUTO_INSTRUMENT_KEY) !== 'off';
  } catch {
    return true;
  }
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Wave({ peaks, color = '#ff9f38' }: { peaks: Float32Array; color?: string }) {
  const bars = 24;
  const step = Math.max(1, Math.floor(peaks.length / (bars * 2)));
  const amps: number[] = [];
  for (let i = 0; i < bars; i++) {
    const lo = peaks[i * step * 2] || 0;
    const hi = peaks[i * step * 2 + 1] || 0;
    amps.push(Math.max(0, hi - lo));
  }
  const peak = Math.max(0.0001, ...amps);
  return (
    <svg width={bars * 3} height={22} aria-hidden className="shrink-0">
      {amps.map((a, i) => {
        const h = Math.max(1.5, (a / peak) * 20);
        return <rect key={i} x={i * 3} y={(22 - h) / 2} width={2} height={h} fill={color} opacity={0.8} />;
      })}
    </svg>
  );
}

export function SampleBrowser({ isOpen, onClose, onMessage }: Props) {
  const [samples, setSamples] = useState<AudioAsset[]>(() => audioStore.all());
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [source, setSource] = useState<AudioAsset | null>(null);
  const [stemMode, setStemMode] = useState<StemSplitMode>('4stem');
  const [algorithm, setAlgorithm] = useState<'neural_dsp' | 'demucs'>('neural_dsp');
  /** Deliberately per-session: a trained model is never selected or run merely because it is installed. */
  const [modelSeparationConsent, setModelSeparationConsent] = useState(false);
  const [stems, setStems] = useState<StemSet | null>(null);
  const [progress, setProgress] = useState<SeparationProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  
  // Demucs status: null = route unavailable, undefined = probing.
  const [demucsReady, setDemucsReady] = useState<boolean | null | undefined>(undefined);
  const [, setAiStems] = useState<Partial<Record<DemucsStem, AudioAsset>> | null>(null);
  const [aiModel, setAiModel] = useState<DemucsModel>('htdemucs');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [noteBusy, setNoteBusy] = useState<string | null>(null);
  const [autoInstrument, setAutoInstrument] = useState(readAutoInstrument);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Multi-track Synchronized Playback for Splitter AI
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const multiTrackRef = useRef<{
    sources: AudioBufferSourceNode[];
    gains: Record<string, GainNode>;
    startAudioTime: number;
    pauseOffset: number;
    rafId: number | null;
  }>({
    sources: [],
    gains: {},
    startAudioTime: 0,
    pauseOffset: 0,
    rafId: null,
  });

  const getAuditionDestination = (): AudioNode => {
    return audioEngine.monitor?.clickInput ?? audioEngine.ctx.destination;
  };

  const stopAllPlayback = () => {
    if (multiTrackRef.current.rafId !== null) {
      cancelAnimationFrame(multiTrackRef.current.rafId);
      multiTrackRef.current.rafId = null;
    }
    for (const src of multiTrackRef.current.sources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    for (const gain of Object.values(multiTrackRef.current.gains)) {
      try {
        gain.disconnect();
      } catch {}
    }
    multiTrackRef.current.sources = [];
    multiTrackRef.current.gains = {};
    setIsPlayingAll(false);
  };

  const getEffectiveGain = (stem: SeparatedStem, allStems: SeparatedStem[]): number => {
    const hasSolo = allStems.some((s) => s.solo);
    if (hasSolo) {
      return stem.solo ? stem.volume : 0;
    }
    return stem.muted ? 0 : stem.volume;
  };

  const updateAllGains = (newStems: Record<string, SeparatedStem>) => {
    const stemList = Object.values(newStems);
    const ctx = audioEngine.ctx;
    for (const stem of stemList) {
      const gNode = multiTrackRef.current.gains[stem.id];
      if (gNode) {
        const val = getEffectiveGain(stem, stemList);
        gNode.gain.setValueAtTime(val, ctx.currentTime);
      }
    }
  };

  const playAll = (offsetSec?: number) => {
    if (!stems) return;
    stopPreview();
    stopAllPlayback();

    const stemList = Object.values(stems);
    if (stemList.length === 0) return;

    const ctx = audioEngine.ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const offset = offsetSec !== undefined ? offsetSec : multiTrackRef.current.pauseOffset;
    const maxDur = Math.max(...stemList.map((s) => s.duration));

    const actualOffset = offset >= maxDur ? 0 : offset;
    const startAudioTime = ctx.currentTime - actualOffset;
    multiTrackRef.current.startAudioTime = startAudioTime;
    multiTrackRef.current.sources = [];
    multiTrackRef.current.gains = {};
    const dest = getAuditionDestination();

    for (const stem of stemList) {
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(getEffectiveGain(stem, stemList), ctx.currentTime);
      gainNode.connect(dest);
      multiTrackRef.current.gains[stem.id] = gainNode;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = stem.buffer;
      sourceNode.connect(gainNode);

      sourceNode.start(0, actualOffset);
      multiTrackRef.current.sources.push(sourceNode);
    }

    setIsPlayingAll(true);

    const updateTime = () => {
      const current = ctx.currentTime - startAudioTime;
      if (current >= maxDur) {
        stopAllPlayback();
        multiTrackRef.current.pauseOffset = 0;
        setPlaybackTime(0);
        return;
      }
      setPlaybackTime(current);
      multiTrackRef.current.rafId = requestAnimationFrame(updateTime);
    };
    multiTrackRef.current.rafId = requestAnimationFrame(updateTime);
  };

  const pauseAll = () => {
    const ctx = audioEngine.ctx;
    const elapsed = ctx.currentTime - multiTrackRef.current.startAudioTime;
    multiTrackRef.current.pauseOffset = elapsed;
    stopAllPlayback();
    setPlaybackTime(elapsed);
  };

  const togglePlayAll = () => {
    if (isPlayingAll) {
      pauseAll();
    } else {
      playAll();
    }
  };

  const seekPlayback = (timeSec: number) => {
    const wasPlaying = isPlayingAll;
    stopAllPlayback();
    multiTrackRef.current.pauseOffset = timeSec;
    setPlaybackTime(timeSec);
    if (wasPlaying) {
      playAll(timeSec);
    }
  };

  const toggleMute = (id: string) => {
    setStems((cur) => {
      if (!cur || !cur[id]) return cur;
      const updated = {
        ...cur,
        [id]: { ...cur[id], muted: !cur[id].muted },
      };
      updateAllGains(updated);
      return updated;
    });
  };

  const toggleSolo = (id: string) => {
    setStems((cur) => {
      if (!cur || !cur[id]) return cur;
      const updated = {
        ...cur,
        [id]: { ...cur[id], solo: !cur[id].solo },
      };
      updateAllGains(updated);
      return updated;
    });
  };

  const setStemVolume = (id: string, vol: number) => {
    setStems((cur) => {
      if (!cur || !cur[id]) return cur;
      const updated = {
        ...cur,
        [id]: { ...cur[id], volume: vol },
      };
      updateAllGains(updated);
      return updated;
    });
  };

  // Keyboard navigation & focus retention
  useEffect(() => {
    if (!isOpen) {
      const opener = returnFocusRef.current;
      returnFocusRef.current = null;
      if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      return;
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const first = dialog && focusableChildren(dialog)[0];
      (first ?? dialog)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchDemucsStatus().then((status) => {
      const isReady = status ? Boolean(status.demucs || status.spleeter) : false;
      setDemucsReady(isReady);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setSamples(audioStore.all());
    return audioStore.subscribe(() => setSamples(audioStore.all()));
  }, [isOpen]);

  // Auto-select first sample if active source is empty
  useEffect(() => {
    if (!source && samples.length > 0) {
      setSource(samples[0]);
    }
  }, [samples, source]);

  // Stop auditions when closed
  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      stopAllPlayback();
    }
  }, [isOpen]);

  // Reset drag state if drag is cancelled or leaves window
  useEffect(() => {
    const cancelDrag = () => setIsDragging(false);
    window.addEventListener('dragend', cancelDrag);
    window.addEventListener('mouseleave', cancelDrag);
    return () => {
      window.removeEventListener('dragend', cancelDrag);
      window.removeEventListener('mouseleave', cancelDrag);
    };
  }, []);

  function stopPreview() {
    if (srcRef.current) {
      try {
        srcRef.current.stop();
        srcRef.current.disconnect();
      } catch {}
      srcRef.current = null;
    }
    setPlayingId(null);
  }

  function closeDialog() {
    stopPreview();
    stopAllPlayback();
    onClose();
  }

  function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDialog();
      return;
    }
    if (e.key === 'Tab') {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const elements = focusableChildren(dialog);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function preview(buffer: AudioBuffer, id: string) {
    if (playingId === id) {
      stopPreview();
      return;
    }
    stopAllPlayback();
    stopPreview();
    const ctx = audioEngine.ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const dest = getAuditionDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    src.onended = () => setPlayingId((cur) => (cur === id ? null : cur));
    src.start();
    srcRef.current = src;
    setPlayingId(id);
  }

  const filtered = samples.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()));

  const addToSong = (asset: AudioAsset) => {
    const pos = audioEngine.getPlayheadPosition();
    const bar = Math.floor(pos / audioEngine.stepsPerBar);
    const placed = audioEngine.addAudioClip(asset.id, bar);
    onMessage?.(placed ? `Placed "${asset.name}" on a track at bar ${bar + 1}` : 'Could not place the sample', placed ? 'success' : 'error');
  };

  const toggleAutoInstrument = (on: boolean) => {
    setAutoInstrument(on);
    try {
      window.localStorage.setItem(AUTO_INSTRUMENT_KEY, on ? 'on' : 'off');
    } catch {
      // A private window keeps the choice for this session only.
    }
  };

  /** The instruments an asset becomes (a kit, a sampler, a recorded piano); null when it cannot be read. */
  const instrumentsFromAsset = async (asset: AudioAsset) => {
    try {
      return await createPlayableInstrumentFromAsset(audioEngine, asset);
    } catch (err) {
      console.warn('Could not make an instrument from', asset.name, err);
      return null;
    }
  };

  /** Imports multiple audio files into the project store; each becomes an instrument when auto-instrument is on */
  const loadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let importedCount = 0;
    let instrumentCount = 0;
    let firstNewAsset: AudioAsset | null = null;
    for (const f of list) {
      try {
        const asset = await audioStore.importFile(f);
        if (!firstNewAsset) firstNewAsset = asset;
        importedCount++;
        if (autoInstrument) {
          // The transcription runs in a worker; the yield lets the browser paint between files.
          await new Promise((resolve) => setTimeout(resolve, 0));
          instrumentCount += (await instrumentsFromAsset(asset))?.instruments.length ?? 0;
        }
      } catch (err) {
        console.warn('Could not decode file:', f.name, err);
      }
    }
    setBusy(false);
    if (firstNewAsset && !source) {
      setSource(firstNewAsset);
    }
    if (importedCount > 0) {
      const made = instrumentCount > 0 ? ` and ${instrumentCount} instrument${instrumentCount === 1 ? '' : 's'} with piano-roll notes` : '';
      onMessage?.(`Imported ${importedCount} audio file${importedCount === 1 ? '' : 's'}${made}.`, 'success');
    } else {
      onMessage?.('Could not decode selected audio files. Supported formats: WAV, MP3, FLAC, OGG, AIFF.', 'error');
    }
  };

  /** Whether an instrument or an audio clip of the song plays this asset. */
  const assetInUse = (asset: AudioAsset): boolean =>
    deviceSampleAudioIds().includes(asset.id) || audioEngine.tracks.some((t) => (t.arrangementClips ?? []).some((c) => c.audioId === asset.id));

  /** Removes an audio asset from the project */
  const deleteAsset = async (asset: AudioAsset) => {
    if (assetInUse(asset) && !(await showConfirm({
      title: 'Remove audio sample',
      message: `"${asset.name}" plays in the song. Remove it anyway? Those parts will go silent.`,
      confirmLabel: 'Remove',
    }))) return;
    stopPreview();
    if (playingId === asset.id) setPlayingId(null);
    await audioStore.remove(asset.id);
    if (source?.id === asset.id) {
      const remaining = audioStore.all();
      setSource(remaining[0] || null);
      setStems(null);
    }
    onMessage?.(`Removed "${asset.name}" from project.`, 'info');
  };

  /** Removes all audio samples from project */
  const clearAllAssets = async () => {
    if (!(await showConfirm({
      title: 'Clear all audio samples',
      message: 'Remove all audio samples from this project? Instruments and clips that play them will go silent.',
      confirmLabel: 'Remove all',
    }))) return;
    stopPreview();
    const all = audioStore.all();
    for (const a of all) {
      await audioStore.remove(a.id);
    }
    setSource(null);
    setStems(null);
    onMessage?.('Cleared all audio samples from project.', 'info');
  };

  /** Turns an audio asset into its instruments with piano roll notes, and reports what was made */
  const makePlayableInstrument = async (asset: AudioAsset) => {
    setNoteBusy(asset.id);
    const result = await instrumentsFromAsset(asset);
    setNoteBusy(null);
    if (!result) {
      onMessage?.(`Could not create an instrument from "${asset.name}".`, 'error');
    } else if (result.instruments.length === 0) {
      onMessage?.(`No notes or drum hits found in "${asset.name}".`, 'info');
    } else {
      const made = result.instruments.map((i) => `${i.instrumentName} (${i.sound}, ${i.noteCount} notes)`).join(' and ');
      onMessage?.(`"${asset.name}" became ${made} on the piano roll.`, 'success');
    }
  };

  /** Turns a separated stem into a playable instrument with piano roll notes */
  const stemToInstrument = async (stem: SeparatedStem) => {
    if (!source) return;
    const title = `${source.name.replace(/\.[^.]+$/, '')} · ${stem.label}`;
    try {
      const { asset } = await musicSeparator.transferToSamples(stem, title, source.provenance);
      await makePlayableInstrument(asset);
    } catch (err) {
      onMessage?.(`Failed to create instrument from stem: ${String(err)}`, 'error');
    }
  };

  const split = async (asset: AudioAsset, mode: StemSplitMode = stemMode) => {
    if (busy) return;
    setSource(asset);
    setStems(null);
    setBusy(true);
    const defs = STEM_MODE_CONFIGS[mode] || STEM_MODE_CONFIGS['4stem'];
    setProgress({ stage: `Preparing ${defs.length} derived source stems…`, percent: 1, timeRemainingSec: 0 });
    try {
      const result = await musicSeparator.separate(asset.buffer, mode, setProgress);
      setStems(result);
      onMessage?.(`${defs.length} stems derived from "${asset.name}". They add up to the source exactly; expect some bleed between them (no new audio was generated).`, 'success');
    } catch (err) {
      onMessage?.(`Split failed: ${String(err)}`, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const stemToRack = (stem: SeparatedStem) => {
    if (!source) return;
    const title = source.name.replace(/\.[^.]+$/, '');
    musicSeparator.transferToRack(audioEngine, stem, title, source.provenance);
    onMessage?.(`"${stem.label}" placed on its own audio track`, 'success');
  };

  const stemToSamples = async (stem: SeparatedStem) => {
    if (!source) return;
    const title = source.name.replace(/\.[^.]+$/, '');
    const { asset } = await musicSeparator.transferToSamples(stem, title, source.provenance);
    onMessage?.(`Saved "${asset.name}.wav" to the project samples`, 'success');
  };

  /** Transcribes ANY stem into piano roll notes using pitch tracking or drum onset classification */
  const notesFromSeparatedStem = async (stem: SeparatedStem) => {
    if (noteBusy) return;
    setNoteBusy(stem.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const result = await addStemNotes(audioEngine, stem.id, stem.buffer, stem.label);
      if (result.noteCount === 0) {
        onMessage?.(`No notes found in the ${stem.label} stem`, 'info');
      } else {
        onMessage?.(
          `${result.noteCount} notes from ${stem.label} transcribed to piano roll ("${result.trackName}") using ${result.instrumentName}${result.tempo ? ` (~${Math.round(result.tempo)} BPM)` : ''}`,
          'success'
        );
      }
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Transcription failed.', 'error');
    } finally {
      setNoteBusy(null);
    }
  };

  const separateAi = async (targetAsset?: AudioAsset) => {
    const assetToUse = targetAsset || source;
    if (!assetToUse || aiBusy) return;
    if (!modelSeparationConsent) {
      onMessage?.('Allow the trained local model explicitly before running Spleeter or Demucs.', 'info');
      return;
    }
    setSource(assetToUse);
    setAiBusy(true);
    stopAllPlayback();
    setStems(null);
    try {
      const blobs = await separateWithDemucs(assetToWav(assetToUse), setAiStatus, { model: aiModel, consent: true });
      const title = assetToUse.name.replace(/\.[^.]+$/, '');
      const assets: Partial<Record<DemucsStem, AudioAsset>> = {};
      const loadedStems: Record<string, SeparatedStem> = {};
      for (const stem of DEMUCS_STEMS) {
        const blob = blobs[stem];
        if (!blob) continue;
        const asset = await audioStore.importFile(blob, `${title} · ${stem}`, {
          provenance: derivedAudioProvenance(assetToUse.provenance, `Model source separation stem: ${stem}`),
        });
        assets[stem] = asset;
        const info = DEMUCS_STEM_INFO[stem];
        loadedStems[stem] = {
          id: stem,
          label: info.label,
          color: info.color,
          iconType: info.icon as SeparatedStem['iconType'],
          buffer: asset.buffer,
          peaks: asset.peaks,
          duration: asset.buffer.duration,
          durationFormatted: fmtDuration(asset.buffer.duration),
          volume: 1.0,
          muted: false,
          solo: false,
        };
      }
      setAiStems(assets);
      setStems(loadedStems);
      onMessage?.(
        `Source separation complete: ${Object.values(loadedStems).map((s) => s.label).join(', ')} derived from the selected audio; no new audio was generated.`,
        'success'
      );
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Separation failed.', 'error');
    } finally {
      setAiBusy(false);
      setAiStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
          void loadFiles(e.dataTransfer.files);
        }
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-browser-title"
    >
      <div className={`w-full max-w-[1280px] h-[760px] max-h-[94vh] bg-chrome-0 border ${isDragging ? 'border-sel ring-2 ring-sel/50' : 'border-chrome-line'} rounded-md shadow-2xl flex flex-col overflow-hidden text-chrome-ink relative transition-all`}>
        {/* Drag and Drop Banner */}
        {isDragging && (
          <div className="absolute inset-0 bg-sel/15 backdrop-blur-[2px] z-50 pointer-events-none flex flex-col items-center justify-center gap-2 border-2 border-dashed border-sel rounded-md text-white font-bold text-[16px]">
            <Upload className="w-8 h-8 animate-bounce text-sel" />
            <span>Drop multiple audio files here to import into project</span>
          </div>
        )}

        {/* Header */}
        <div className="h-12 shrink-0 border-b border-chrome-line bg-chrome-1 px-3 flex items-center gap-3">
          <AudioLines className="w-4 h-4 text-sel" />
          <h2 id="sample-browser-title" className="font-label font-bold text-[13px] tracking-wide">Samples &amp; Stems</h2>
          <span className="text-[11px] text-[#8b9299]">Audio in this project</span>
          <div className="flex-1" />
          <label className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-[#7d858c]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search samples"
              className="us-field h-[24px] w-[220px] pl-7 text-[13px]"
            />
          </label>
          <button type="button" onClick={closeDialog} className="us-btn w-7 h-7 grid place-items-center rounded" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[230px_1fr_490px]">
          {/* Sources / Project Samples Sidebar */}
          <aside className="border-r border-chrome-line p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-label font-bold uppercase tracking-wider text-[#8b9299]">Project samples</div>
              {samples.length > 1 && (
                <button
                  type="button"
                  onClick={() => void clearAllAssets()}
                  className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline transition-colors font-medium"
                  title="Remove all samples from project"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="text-[13px] text-[#b9c0c6]">
              {samples.length} sample{samples.length === 1 ? '' : 's'} · stored with the project
            </div>
            <Btn onClick={() => fileRef.current?.click()} className="justify-center py-1.5 font-medium">
              <Upload className="w-3.5 h-3.5" /> Add Audio Files…
            </Btn>
            <label className="flex items-start gap-2 text-[12px] leading-snug text-[#c2c9cf] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={autoInstrument}
                onChange={(e) => toggleAutoInstrument(e.target.checked)}
              />
              <span>Turn each new audio file into an instrument with piano-roll notes</span>
            </label>
            <LinkImport onImported={(asset) => setSource(asset)} onMessage={onMessage} />
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void loadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <p className="text-[11px] leading-snug text-[#8b9299]">
              Add as many audio tracks as you like. Turn any audio into a playable instrument with piano roll notes, or derive stems from the audio you selected.
            </p>
            <div className="mt-auto rounded border border-chrome-line bg-black/25 p-2 text-[11px] leading-snug text-[#8b9299]">
              Samples are bundled into <span className="text-[#c2c9cf]">.unbox</span> exports, so a project opens with its audio.
            </div>
          </aside>

          {/* Sample List */}
          <section className="min-w-0 flex flex-col">
            <div className="h-8 shrink-0 px-3 flex items-center justify-between text-[11px] font-label font-bold uppercase tracking-wider text-[#8b9299] border-b border-black/40">
              <span>{query ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : 'Samples'}</span>
              <span className="text-[10px] lowercase text-[#6c747a]">drag &amp; drop supported</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-[13px] text-[#8b9299] leading-relaxed">
                  <FileAudio className="w-5 h-5 mb-2 text-[#6d767d]" />
                  {samples.length === 0
                    ? 'No audio in this project yet. Click "Add Audio Files…" or drag and drop audio files here.'
                    : 'No sample matches that search.'}
                </div>
              ) : (
                <ul className="divide-y divide-black/30">
                  {filtered.map((asset) => (
                    <li
                      key={asset.id}
                      onClick={() => setSource(asset)}
                      className={`px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                        source?.id === asset.id ? 'bg-sel/10 ring-1 ring-sel/40' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          preview(asset.buffer, asset.id);
                        }}
                        className="us-btn w-7 h-7 grid place-items-center rounded shrink-0"
                        aria-label={playingId === asset.id ? `Stop ${asset.name}` : `Preview ${asset.name}`}
                        title={playingId === asset.id ? 'Stop' : 'Preview'}
                      >
                        {playingId === asset.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" title={asset.name}>{asset.name}</div>
                        <div className="text-[11px] text-[#8b9299] font-mono">
                          {fmtDuration(asset.buffer.duration)} · {asset.buffer.numberOfChannels === 1 ? 'mono' : 'stereo'} · {(asset.buffer.sampleRate / 1000).toFixed(1)} kHz
                        </div>
                      </div>
                      <Wave peaks={asset.peaks} />

                      {/* Timeline Placement */}
                      <Btn
                        onClick={() => addToSong(asset)}
                        title="Place at the playhead on a new audio track"
                      >
                        Timeline
                      </Btn>

                      {/* Turn into instruments with piano roll notes */}
                      <Btn
                        onClick={() => void makePlayableInstrument(asset)}
                        disabled={noteBusy !== null}
                        title="Turn into instruments with piano-roll notes: a kit for drums, a sampler for one pitched line, a recorded piano for chords"
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <Piano className="w-3 h-3" /> {noteBusy === asset.id ? 'Working…' : 'Instrument'}
                      </Btn>

                      {/* AI Split Action */}
                      <Btn
                        onClick={() => {
                          setSource(asset);
                          if (algorithm === 'demucs' && demucsReady) {
                            void separateAi(asset);
                          } else {
                            void split(asset, stemMode);
                          }
                        }}
                        title="Derive isolated stems from the selected source; no new audio is generated"
                        disabled={busy || aiBusy}
                      >
                        <Scissors className="w-3 h-3" /> Split
                      </Btn>

                      {/* Remove Audio File Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteAsset(asset);
                        }}
                        className="us-btn w-6 h-6 grid place-items-center rounded text-[#8b9299] hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                        title={`Remove "${asset.name}" from project`}
                        aria-label={`Remove ${asset.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Source separation — derives stems from the selected audio */}
          <aside className="border-l border-chrome-line p-3 min-h-0 overflow-y-auto flex flex-col gap-3">
            <Panel
              title="Source Separation"
              right={
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/40">
                  <Sparkles className="w-3 h-3" /> Source Stems
                </span>
              }
            >
              <p className="text-[11px] leading-snug text-[#b0b8bf]">
                Derive <strong>vocals, drums, bass and the other instruments</strong> from the audio you selected, then mute, solo and rebalance them. The built-in separator is quick signal processing with some bleed; the trained model is cleaner and can also give guitar and piano.
              </p>
              <p className="text-[11px] leading-snug text-[#7fe1bd]">
                Uses only your source audio. It does not generate a new song, performer, instrument, or replacement sound.
              </p>

              <div className="mt-2.5 flex items-center justify-between text-[11px] bg-black/30 p-2 rounded border border-chrome-line">
                <span className="text-[#8b9299]">Active Track:</span>
                <span className="text-[#d5dade] font-semibold truncate max-w-[280px]" title={source?.name}>
                  {source ? source.name : 'Select a sample from the list'}
                </span>
              </div>

              <label className="mt-2.5 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/[0.07] p-2 text-[11px] leading-snug text-[#d8c49d]" data-testid="trained-separation-consent">
                <input
                  type="checkbox"
                  checked={modelSeparationConsent}
                  onChange={(event) => {
                    setModelSeparationConsent(event.target.checked);
                    // allowing it is asking for it: the installed model becomes the separator in use
                    setAlgorithm(event.target.checked && demucsReady ? 'demucs' : 'neural_dsp');
                  }}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  I allow this session to use a <strong>trained local Spleeter/Demucs source-separation model</strong>. It is non-generative and derives only from my selected audio, but may bleed or artifact; it does not create verified human recordings or grant rights.
                </span>
              </label>

              {/* Engine Switcher */}
              <div className="mt-2.5 flex items-center gap-1 p-0.5 rounded bg-black/50 border border-chrome-line text-[11px]">
                <button
                  type="button"
                  onClick={() => setAlgorithm('neural_dsp')}
                  className={`flex-1 py-1 px-1.5 rounded text-center transition-colors font-medium ${
                    algorithm === 'neural_dsp'
                      ? 'bg-sel text-black font-semibold shadow-sm'
                      : 'text-[#8b9299] hover:text-[#e1e7ec] hover:bg-white/[0.04]'
                  }`}
                  title="Signal processing on this computer, no model: held notes against drum hits, stereo position and lows. Quick, with some bleed between the stems."
                >
                  Built-in (quick, some bleed)
                </button>
                <button
                  type="button"
                  onClick={() => setAlgorithm('demucs')}
                  disabled={!modelSeparationConsent}
                  aria-disabled={!modelSeparationConsent}
                  data-testid="trained-separation-mode"
                  className={`flex-1 py-1 px-1.5 rounded text-center transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-45 ${
                    algorithm === 'demucs'
                      ? 'bg-sel text-black font-semibold shadow-sm'
                      : 'text-[#8b9299] hover:text-[#e1e7ec] hover:bg-white/[0.04]'
                  }`}
                  title={modelSeparationConsent
                    ? 'Trained Spleeter/Demucs source-separation model running locally'
                    : 'Check the trained-model acknowledgement above before selecting this option'}
                >
                  Trained model (cleanest)
                </button>
              </div>
              {demucsReady !== undefined && (
                <p className="mt-1.5 text-[11px] leading-snug text-[#8b9299]" data-testid="trained-separation-availability">
                  {demucsReady
                    ? modelSeparationConsent
                      ? 'A trained separator is installed on this computer and selected.'
                      : 'A trained separator is installed on this computer: tick the box above to use it.'
                    : 'No trained separator (Demucs or Spleeter) was found on this computer, so the built-in one is used.'}
                </p>
              )}

              {/* Stem count selector for the fast local separator */}
              {algorithm === 'neural_dsp' && (
                <div className="mt-2 flex items-center gap-1 p-0.5 rounded bg-black/30 border border-chrome-line text-[11px]">
                  {(
                    [
                      { id: '4stem', label: '4 Stems', desc: 'Vocals / centre lead, drums, bass, other instruments' },
                      { id: '6stem', label: '6 Stems', desc: 'The drums in three: kick, snare, hats. Plus vocals / centre lead, bass, other instruments' },
                      { id: '8stem', label: '8 Stems', desc: 'As 6 stems, plus the near-centre layer and the wide, out-of-phase sound' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setStemMode(m.id)}
                      className={`flex-1 py-1 px-1.5 rounded text-center transition-colors font-medium ${
                        stemMode === m.id
                          ? 'bg-white/20 text-white font-semibold'
                          : 'text-[#8b9299] hover:text-[#e1e7ec]'
                      }`}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Trained local model: the 4-stem model, or the 6-stem model that adds guitar and piano. */}
              {algorithm === 'demucs' && (
                <div className="mt-2 flex items-center gap-1 p-0.5 rounded bg-black/30 border border-chrome-line text-[11px]" data-testid="trained-separation-options">
                  {(
                    [
                      { id: 'htdemucs', label: '4 Stems', desc: 'Vocals, Drums, Bass, Other (htdemucs)' },
                      { id: 'htdemucs_6s', label: '6 Stems', desc: 'Vocals, Drums, Bass, Other, Guitar, Piano (htdemucs_6s)' },
                      { id: 'htdemucs_ft', label: '4 Best', desc: 'Vocals, Drums, Bass, Other, fine-tuned for cleaner stems (htdemucs_ft): about four times slower' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAiModel(m.id)}
                      className={`flex-1 py-1 px-1.5 rounded text-center transition-colors font-medium ${
                        aiModel === m.id ? 'bg-white/20 text-white font-semibold' : 'text-[#8b9299] hover:text-[#e1e7ec]'
                      }`}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Action Trigger */}
              <div className="mt-3 flex items-center gap-2">
                {algorithm === 'neural_dsp' ? (
                  <Btn
                    on={!!source && !busy}
                    disabled={!source || busy}
                    onClick={() => source && void split(source, stemMode)}
                    className="flex-1 justify-center py-1.5 font-semibold text-[12px]"
                  >
                    <Scissors className="w-3.5 h-3.5" /> Derive Source Stems ({stemMode === '4stem' ? '4' : stemMode === '6stem' ? '6' : '8'})
                  </Btn>
                ) : (
                  <Btn
                    on={!!source && !aiBusy && demucsReady === true}
                    disabled={!source || aiBusy || demucsReady !== true || !modelSeparationConsent}
                    onClick={() => void separateAi()}
                    className="flex-1 justify-center py-1.5 font-semibold text-[12px]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Derive With Trained Local Model (~1 min)
                  </Btn>
                )}
                {(busy || aiBusy) && (
                  <span className="text-[11px] text-[#a7aeb5] font-mono shrink-0">
                    {busy ? `${progress?.percent ?? 0}%` : 'Processing…'}
                  </span>
                )}
              </div>

              {/* Live Progress Feedback */}
              {(busy || aiBusy) && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 rounded bg-black/60 overflow-hidden border border-chrome-line">
                    <div
                      className="h-full bg-sel transition-[width] duration-200"
                      style={{ width: busy ? `${progress?.percent ?? 0}%` : '75%' }}
                    />
                  </div>
                  <div className="text-[11px] text-[#8b9299] flex justify-between">
                    <span>{busy ? progress?.stage : aiStatus || 'Running local source separator…'}</span>
                    {busy && progress?.timeRemainingSec ? (
                      <span>~{progress.timeRemainingSec}s left</span>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Splitter AI Multi-Track Synchronized Mixer & Player */}
              {stems && (
                <div className="mt-4 flex flex-col gap-3">
                  {/* Master Transport & Seek Bar */}
                  <div className="p-3 rounded-md border border-chrome-line bg-black/60 flex flex-col gap-2 shadow-inner">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePlayAll}
                        className="us-btn w-10 h-10 grid place-items-center rounded-full bg-sel text-black hover:brightness-110 font-bold shrink-0 shadow-md transition-transform active:scale-95"
                        aria-label={isPlayingAll ? 'Pause all stems' : 'Play all stems in sync'}
                        title={isPlayingAll ? 'Pause (Space)' : 'Play all stems in sync'}
                      >
                        {isPlayingAll ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-white flex items-center justify-between">
                          <span>Multi-Track Synchronized Playback</span>
                          <span className="text-[11px] font-mono text-[#8b9299]">
                            {fmtDuration(playbackTime)} / {fmtDuration(Math.max(...Object.values(stems).map((s) => s.duration)))}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(...Object.values(stems).map((s) => s.duration)) || 1}
                          step={0.1}
                          value={playbackTime}
                          onChange={(e) => seekPlayback(Number(e.target.value))}
                          className="us-range w-full mt-1.5"
                          aria-label="Seek synchronized playback position"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multi-Track Channel Strips (Vocals, Drums, Bass, Other, etc.) */}
                  <div className="space-y-2">
                    {Object.values(stems).map((stem) => (
                      <div
                        key={stem.id}
                        className={`rounded-md border p-2.5 transition-colors ${
                          stem.solo
                            ? 'border-amber-400/60 bg-amber-500/10'
                            : stem.muted
                              ? 'border-white/5 bg-black/20 opacity-60'
                              : 'border-chrome-line bg-black/35 hover:bg-black/45'
                        }`}
                      >
                        {/* Channel Header: Dot, Label, Solo, Mute, Volume */}
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                            style={{ background: stem.color }}
                            title={`${stem.label} Track`}
                          />
                          <span className="text-[12px] font-bold text-[#e6ebf0] flex-1 truncate">
                            {stem.label}
                          </span>

                          {/* Solo Button [ S ] */}
                          <button
                            type="button"
                            onClick={() => toggleSolo(stem.id)}
                            className={`w-6 h-6 rounded text-[11px] font-extrabold grid place-items-center transition-all ${
                              stem.solo
                                ? 'bg-amber-400 text-black shadow-md ring-1 ring-amber-300'
                                : 'bg-white/5 text-[#8b9299] hover:text-white hover:bg-white/15 border border-white/10'
                            }`}
                            title={stem.solo ? `Un-solo ${stem.label}` : `Solo ${stem.label} only`}
                          >
                            S
                          </button>

                          {/* Mute Button [ M ] */}
                          <button
                            type="button"
                            onClick={() => toggleMute(stem.id)}
                            className={`w-6 h-6 rounded text-[11px] font-extrabold grid place-items-center transition-all ${
                              stem.muted
                                ? 'bg-rose-500 text-white shadow-md ring-1 ring-rose-400'
                                : 'bg-white/5 text-[#8b9299] hover:text-white hover:bg-white/15 border border-white/10'
                            }`}
                            title={stem.muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
                          >
                            M
                          </button>
                        </div>

                        {/* Volume Rebalancing Fader */}
                        <div className="mt-2.5 flex items-center gap-2">
                          {stem.volume === 0 || stem.muted ? (
                            <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-[#8b9299] shrink-0" />
                          )}
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={stem.volume}
                            onChange={(e) => setStemVolume(stem.id, Number(e.target.value))}
                            className="us-range flex-1"
                            aria-label={`${stem.label} Volume`}
                          />
                          <span className="text-[11px] font-mono w-10 text-right font-medium text-[#b0b8bf]">
                            {Math.round(stem.volume * 100)}%
                          </span>
                        </div>

                        {/* Channel Waveform & Export Actions */}
                        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between gap-1.5">
                          <div className="flex-1 min-w-0">
                            <Wave peaks={stem.peaks} color={stem.color} />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Btn onClick={() => stemToRack(stem)} title="Place track directly on arrangement timeline">
                              To rack
                            </Btn>
                            <Btn
                              onClick={() => void stemToInstrument(stem)}
                              title="Turn this isolated stem into a playable instrument with piano roll working"
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              <Piano className="w-3 h-3" /> Instrument
                            </Btn>
                            <Btn onClick={() => void stemToSamples(stem)} title="Save 16-bit WAV to project assets">
                              Save WAV
                            </Btn>
                            <Btn
                              onClick={() => void notesFromSeparatedStem(stem)}
                              disabled={noteBusy !== null}
                              title="Extract and transcribe notes to piano roll"
                            >
                              {noteBusy === stem.id ? 'MIDI…' : 'MIDI'}
                            </Btn>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Batch Transfer All Stems to Rack */}
                    <Btn
                      onClick={() => {
                        Object.values(stems).forEach((s) => stemToRack(s));
                        onMessage?.(`All ${Object.keys(stems).length} stems placed on individual timeline audio tracks`, 'success');
                      }}
                      className="w-full justify-center py-2 font-bold text-[12px] bg-sel/20 hover:bg-sel/30 border-sel/40 text-sel mt-2"
                    >
                      <ArrowRight className="w-4 h-4" /> All {Object.keys(stems).length} Stems to Rack (Timeline Tracks)
                    </Btn>
                  </div>
                </div>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

