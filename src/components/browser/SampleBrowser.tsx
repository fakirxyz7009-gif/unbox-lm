/**
 * SampleBrowser — the audio side of the browser: every sample in the project, plus the
 * four-band stem split (experimental).
 *
 * This panel only shows real audio that exists in the project. There is no factory bank and no
 * generated content: a list item is an AudioBuffer you can play, drop on the timeline, or split.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, FileAudio, Pause, Play, Scissors, Search, Upload, X } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine.ts';
import { audioStore, type AudioAsset } from '../../audio/clips/audioStore.ts';
import { musicSeparator, type SeparatedStem, type SeparationProgress } from '../../audio/ai/MusicSeparator.ts';
import { Btn, Panel } from '../../studio/ui/controls.tsx';
import { LinkImport } from './LinkImport.tsx';
import { assetToWav, DEMUCS_STEMS, fetchDemucsStatus, separateWithDemucs, type DemucsStem } from '../../audio/ai/demucsSeparation.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMessage?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type StemSet = Record<'vocals' | 'bass' | 'drums' | 'other', SeparatedStem>;
const STEM_ORDER: Array<'vocals' | 'bass' | 'drums' | 'other'> = ['vocals', 'bass', 'drums', 'other'];

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Compact waveform from the asset's stored min/max peaks. */
function Wave({ peaks, color = '#9aa3ad' }: { peaks: Float32Array; color?: string }) {
  const bars = 54;
  const step = Math.max(1, Math.floor(peaks.length / 2 / bars));
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
  const [stems, setStems] = useState<StemSet | null>(null);
  const [progress, setProgress] = useState<SeparationProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Demucs: null = the route is not on this server, undefined = still checking.
  const [demucsReady, setDemucsReady] = useState<boolean | null | undefined>(undefined);
  const [aiStems, setAiStems] = useState<Record<DemucsStem, AudioAsset> | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    void fetchDemucsStatus().then((status) => setDemucsReady(status ? status.demucs : null));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setSamples(audioStore.all());
    return audioStore.subscribe(() => setSamples(audioStore.all()));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopPreview();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Stop any audition when the panel closes.
  useEffect(() => {
    if (!isOpen) stopPreview();
  }, [isOpen]);

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

  function preview(buffer: AudioBuffer, id: string) {
    if (playingId === id) return stopPreview();
    stopPreview();
    const ctx = audioEngine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
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

  const loadFile = async (file: File) => {
    try {
      const asset = await audioStore.importFile(file);
      setSource(asset);
      onMessage?.(`Loaded "${asset.name}" — press Split to separate it into four bands`, 'info');
    } catch {
      onMessage?.('Could not decode that file. Try WAV, MP3, FLAC or OGG.', 'error');
    }
  };

  const split = async (asset: AudioAsset) => {
    if (busy) return;
    setSource(asset);
    setStems(null);
    setBusy(true);
    setProgress({ stage: 'Splitting bands (experimental)…', percent: 1, timeRemainingSec: 0 });
    try {
      const result = await musicSeparator.separate(asset.buffer, setProgress);
      setStems(result);
      onMessage?.('Split done. Expect bleed between the four bands — this is a DSP split, not a trained demixer.', 'info');
    } catch (err) {
      onMessage?.(`Split failed: ${String(err)}`, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const setStemLevel = (id: keyof StemSet, v: number) => {
    setStems((cur) => (cur ? { ...cur, [id]: { ...cur[id], volume: v } } : cur));
  };

  const stemToRack = (stem: SeparatedStem) => {
    if (!source) return;
    const title = source.name.replace(/\.[^.]+$/, '');
    musicSeparator.transferToRack(audioEngine, stem, title);
    onMessage?.(`"${stem.label}" placed on its own audio track`, 'success');
  };

  const stemToSamples = async (stem: SeparatedStem) => {
    if (!source) return;
    const title = source.name.replace(/\.[^.]+$/, '');
    const { asset } = await musicSeparator.transferToSamples(stem, title);
    onMessage?.(`Saved "${asset.name}.wav" to the project samples`, 'success');
  };

  const separateAi = async () => {
    if (!source || aiBusy) return;
    setAiBusy(true);
    setAiStems(null);
    try {
      const blobs = await separateWithDemucs(assetToWav(source), setAiStatus);
      const title = source.name.replace(/\.[^.]+$/, '');
      const assets = {} as Record<DemucsStem, AudioAsset>;
      for (const stem of DEMUCS_STEMS) assets[stem] = await audioStore.importFile(blobs[stem], `${title} · ${stem}`);
      setAiStems(assets);
      onMessage?.('Stems ready: drums, bass, other and vocals are in the project samples', 'success');
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Separation failed.', 'error');
    } finally {
      setAiBusy(false);
      setAiStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Samples and stems">
      <div className="w-full max-w-[1180px] h-[720px] max-h-[92vh] bg-chrome-0 border border-chrome-line rounded-md shadow-2xl flex flex-col overflow-hidden text-chrome-ink">
        {/* header */}
        <div className="h-12 shrink-0 border-b border-chrome-line bg-chrome-1 px-3 flex items-center gap-3">
          <AudioLines className="w-4 h-4 text-sel" />
          <h2 className="font-label font-bold text-[13px] tracking-wide">Samples &amp; Stems</h2>
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
          <button type="button" onClick={onClose} className="us-btn w-7 h-7 grid place-items-center rounded" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[240px_1fr_380px]">
          {/* sources */}
          <aside className="border-r border-chrome-line p-3 flex flex-col gap-3">
            <div className="text-[11px] font-label font-bold uppercase tracking-wider text-[#8b9299]">Project samples</div>
            <div className="text-[13px] text-[#b9c0c6]">
              {samples.length} sample{samples.length === 1 ? '' : 's'} · stored with the project
            </div>
            <Btn onClick={() => fileRef.current?.click()} className="justify-center">
              <Upload className="w-3.5 h-3.5" /> Load audio file…
            </Btn>
            <LinkImport onImported={(asset) => setSource(asset)} onMessage={onMessage} />
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = '';
              }}
            />
            <p className="text-[11px] leading-snug text-[#8b9299]">
              A sample can be placed on the timeline, or split into four bands. Nothing is generated.
            </p>
            <div className="mt-auto rounded border border-chrome-line bg-black/25 p-2 text-[11px] leading-snug text-[#8b9299]">
              Samples are bundled into <span className="text-[#c2c9cf]">.unbox</span> exports, so a project opens with its audio.
            </div>
          </aside>

          {/* list */}
          <section className="min-w-0 flex flex-col">
            <div className="h-8 shrink-0 px-3 flex items-center text-[11px] font-label font-bold uppercase tracking-wider text-[#8b9299] border-b border-black/40">
              {query ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : 'Samples'}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-[13px] text-[#8b9299] leading-relaxed">
                  <FileAudio className="w-5 h-5 mb-2 text-[#6d767d]" />
                  {samples.length === 0
                    ? 'No audio in this project yet. Load a file, record audio, or split a sample to fill this list.'
                    : 'No sample matches that search.'}
                </div>
              ) : (
                <ul className="divide-y divide-black/30">
                  {filtered.map((asset) => (
                    <li key={asset.id} className={`px-3 py-2 flex items-center gap-3 ${source?.id === asset.id ? 'bg-sel/10' : 'hover:bg-white/[0.03]'}`}>
                      <button
                        type="button"
                        onClick={() => preview(asset.buffer, asset.id)}
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
                      <Btn onClick={() => addToSong(asset)} title="Place at the playhead on a new audio track">Timeline</Btn>
                      <Btn onClick={() => void split(asset)} title="Split into four bands for this session" disabled={busy}>
                        <Scissors className="w-3 h-3" /> Split
                      </Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* split */}
          <aside className="border-l border-chrome-line p-3 min-h-0 overflow-y-auto">
            <Panel title="Stem split" right={<span className="text-[11px] uppercase tracking-wider text-[#a8916a]">experimental</span>}>
              <p className="text-[11px] leading-snug text-[#a7aeb5]">
                A four-band DSP estimate: low-pass bass, transient-driven drums, a centre mid-band for vocals and an
                exact residual. Unity-gain recombination preserves the source, but it is <span className="text-[#e0b266]">not</span> a trained
                separation model; expect bleed and do not treat these as isolated stems.
              </p>
              <div className="mt-2 text-[11px] text-[#8b9299]">
                Source:{' '}
                <span className="text-[#d5dade]" title={source?.name}>
                  {source ? source.name : 'pick a sample on the left'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Btn on={!!source && !busy} disabled={!source || busy} onClick={() => source && void split(source)}>
                  <Scissors className="w-3.5 h-3.5" /> Split into 4 bands
                </Btn>
                {busy && <span className="text-[11px] text-[#a7aeb5]">{progress?.percent ?? 0}%</span>}
              </div>
              {busy && (
                <div className="mt-2 h-1.5 rounded bg-black/50 overflow-hidden">
                  <div className="h-full bg-sel transition-[width]" style={{ width: `${progress?.percent ?? 0}%` }} />
                </div>
              )}

              {stems && (
                <div className="mt-4 space-y-2">
                  {STEM_ORDER.map((id) => {
                    const stem = stems[id];
                    return (
                      <div key={id} className="rounded border border-chrome-line bg-black/25 p-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => preview(stem.buffer, `stem_${id}`)}
                            className="us-btn w-6 h-6 grid place-items-center rounded shrink-0"
                            aria-label={`Preview ${stem.label}`}
                          >
                            {playingId === `stem_${id}` ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          </button>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stem.color }} />
                          <span className="text-[11px] font-semibold truncate flex-1">{stem.label}</span>
                          <span className="text-[11px] font-mono text-[#8b9299]">{stem.durationFormatted}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={stem.volume}
                            onChange={(e) => setStemLevel(id, Number(e.target.value))}
                            className="us-range flex-1"
                            aria-label={`${stem.label} level`}
                          />
                          <span className="text-[11px] font-mono w-9 text-right text-[#a7aeb5]">{Math.round(stem.volume * 100)}%</span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          <Btn onClick={() => stemToRack(stem)} className="flex-1">
                            To rack
                          </Btn>
                          <Btn onClick={() => void stemToSamples(stem)} className="flex-1">
                            Save sample
                          </Btn>
                        </div>
                      </div>
                    );
                  })}
                  <Btn
                    onClick={() => {
                      STEM_ORDER.forEach((id) => stemToRack(stems[id]));
                      onMessage?.('Four audio tracks created from the split', 'success');
                    }}
                    className="w-full justify-center"
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> All four to the rack
                  </Btn>
                </div>
              )}
            </Panel>
            <Panel title="Separate with a model" right={<span className="text-[11px] uppercase tracking-wider text-[#8fbf8f]">local</span>}>
              <p className="text-[11px] leading-snug text-[#a7aeb5]">
                Demucs (htdemucs) runs on this computer and returns drums, bass, other and vocals from a trained model. A song
                takes several minutes on a CPU.
              </p>
              {demucsReady === false && (
                <p className="mt-2 text-[11px] leading-snug text-[#e0b266]">
                  demucs is not installed on this computer. Install it with pip (pip install demucs), then reopen this panel.
                </p>
              )}
              {demucsReady === null && <p className="mt-2 text-[11px] text-[#8b9299]">Separation needs the full build running on this computer.</p>}
              <div className="mt-3 flex items-center gap-2">
                <Btn
                  on={!!source && !aiBusy && demucsReady === true}
                  disabled={!source || aiBusy || demucsReady !== true}
                  onClick={() => void separateAi()}
                >
                  Separate with the local model
                </Btn>
                {aiBusy && <span className="text-[11px] text-[#a7aeb5]">{aiStatus}</span>}
              </div>
              {aiStems && (
                <div className="mt-3 space-y-1.5">
                  {DEMUCS_STEMS.map((stem) => {
                    const asset = aiStems[stem];
                    return (
                      <div key={stem} className="flex items-center gap-2 rounded border border-chrome-line bg-black/25 p-2">
                        <button
                          type="button"
                          onClick={() => preview(asset.buffer, `ai_${stem}`)}
                          className="us-btn grid h-6 w-6 shrink-0 place-items-center rounded"
                          aria-label={`Preview ${stem}`}
                        >
                          {playingId === `ai_${stem}` ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                        <span className="flex-1 text-[11px] font-semibold capitalize">{stem}</span>
                        <span className="font-mono text-[11px] text-[#8b9299]">{fmtDuration(asset.buffer.duration)}</span>
                        <Btn onClick={() => addToSong(asset)} title="Place at the playhead on a new audio track">
                          Timeline
                        </Btn>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
