/**
 * LOAD: instrument browser for a part. Recorded instruments first, then every playable built-in.
 * Choosing one replaces the part's instrument (its notes, clips, mixer settings and effects stay)
 * or adds it as a new part. Library tabs: plugin-library presets / instruments (new part),
 * effect plugins (inserted on the part) and samples (put on an audio track at the playhead, or
 * played on the part's keys). "Audio file": any audio file becomes the part's sound.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { DeviceType, SequencerTrack } from '../audio/types.ts';
import { PLAYABLE_INSTRUMENT_CATEGORIES } from '../audio/instrumentCatalog.ts';
import { filterRecordedInstrumentCategories, isRecordedInstrument } from '../studio/pages/deviceCatalogFilters.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import { LibraryQuickList } from '../rack/LibraryQuickList.tsx';
import { vstLibrary } from '../vst/libraryClient.ts';
import { snapshotFromItem } from '../vst/VstPluginDevice.ts';
import type { ManifestItem, MountableItem, SampleItem } from '../../shared/vst/manifestTypes.ts';
import { swapPartInstrument } from './swapPatch.ts';
import { loadKeySampleFile } from '../audio/deviceSamples.ts';
import { setMultiSample, type MultiSampleZone } from '../audio/deviceSamples.ts';
import { parseSf2, type ParsedSf2, type Sf2Preset, type Sf2Sample, type Sf2Zone } from '../audio/soundfont/sf2.ts';
import { isAudioFile } from '../rack/DeviceSampleBar.tsx';

type Source = 'built-in' | 'audio' | 'soundfont' | 'presets' | 'effects' | 'samples';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'built-in', label: 'Instruments' },
  { id: 'audio', label: 'Audio file' },
  { id: 'soundfont', label: 'SoundFont' },
  { id: 'presets', label: 'Library presets' },
  { id: 'effects', label: 'Library effects' },
  { id: 'samples', label: 'Samples' },
];
const isEffectPlugin = (i: ManifestItem) => i.kind === 'plugin' && i.role === 'effect';

interface Props {
  /** The part to replace; null = only "add as new part". */
  track: SequencerTrack | null;
  partNo: number;
  onClose: () => void;
  onChosen: (deviceId: string) => void;
}

const CATEGORIES = [...PLAYABLE_INSTRUMENT_CATEGORIES].sort((a, b) => Number(b.label.startsWith('Recorded')) - Number(a.label.startsWith('Recorded')));

interface Sf2BufferSource {
  left: Sf2Sample;
  right?: Sf2Sample;
  start: number;
  end: number;
  relativeStart: number;
  relativeEnd: number;
}

function sf2BufferSource(bank: ParsedSf2, zone: Sf2Zone): Sf2BufferSource | null {
  const sample = bank.samples[zone.sampleIndex];
  if (!sample || sample.end <= sample.start) return null;
  const sampleKind = sample.sampleType & 0x7fff;
  let left = sample;
  let right: Sf2Sample | undefined;
  if ((sampleKind === 2 || sampleKind === 4) && sample.sampleLink < bank.samples.length) {
    const linked = bank.samples[sample.sampleLink];
    const linkedKind = linked.sampleType & 0x7fff;
    if (sample.sampleRate === linked.sampleRate) {
      if (sampleKind === 4 && linkedKind === 2) {
        left = sample;
        right = linked;
      } else if (sampleKind === 2 && linkedKind === 4) {
        left = linked;
        right = sample;
      }
    }
  }
  const relativeStart = zone.start - sample.start;
  const relativeEnd = zone.end - sample.end;
  const start = Math.max(0, left.start + relativeStart);
  const end = Math.min(bank.pcm.length, left.end + relativeEnd);
  if (end - start < 64) return null;
  return { left, right, start, end, relativeStart, relativeEnd };
}

function materializeSf2Preset(bank: ParsedSf2, preset: Sf2Preset, fileName: string): MultiSampleZone[] {
  const sources = preset.zones.map((zone) => ({ zone, source: sf2BufferSource(bank, zone) })).filter(
    (entry): entry is { zone: Sf2Zone; source: Sf2BufferSource } => entry.source !== null,
  );
  if (!sources.length) throw new Error('This preset has no playable sample zones');
  const unique = new Map<string, { source: Sf2BufferSource; channels: number }>();
  for (const { zone, source } of sources) {
    const channels = source.right ? 2 : 1;
    const key = `${zone.sampleIndex}:${source.start}:${source.end}:${channels}`;
    unique.set(key, { source, channels });
  }
  const sampleFrames = [...unique.values()].reduce((total, { source, channels }) => total + (source.end - source.start) * channels, 0);
  if (sampleFrames > 60_000_000) throw new Error('Selected preset expands beyond the 60-million-frame import limit');

  const assetIds = new Map<string, string>();
  const result: MultiSampleZone[] = [];
  for (const { zone, source } of sources) {
    const channels = source.right ? 2 : 1;
    const cacheKey = `${zone.sampleIndex}:${source.start}:${source.end}:${channels}`;
    let audioId = assetIds.get(cacheKey);
    if (!audioId) {
      const length = source.end - source.start;
      const buffer = audioEngine.ctx.createBuffer(channels, length, source.left.sampleRate);
      const channelData = buffer.getChannelData(0);
      const leftStart = source.start;
      for (let i = 0; i < length; i++) channelData[i] = bank.pcm[leftStart + i] / 32768;
      if (source.right) {
        const rightStart = Math.max(0, source.right.start + source.relativeStart);
        const rightEnd = Math.min(bank.pcm.length, source.right.end + source.relativeEnd);
        if (rightEnd - rightStart < length) throw new Error(`Stereo sample pair for "${source.left.name}" is incomplete`);
        const rightData = buffer.getChannelData(1);
        for (let i = 0; i < length; i++) rightData[i] = bank.pcm[rightStart + i] / 32768;
      }
      const asset = audioStore.add(`${fileName} · ${preset.name} · ${source.left.name || 'Sample'}`, buffer);
      audioId = asset.id;
      assetIds.set(cacheKey, audioId);
    }
    const sample = bank.samples[zone.sampleIndex];
    const rate = sample?.sampleRate ?? source.left.sampleRate;
    result.push({
      audioId,
      keyLow: zone.keyLow,
      keyHigh: zone.keyHigh,
      velLow: zone.velLow,
      velHigh: zone.velHigh,
      root: zone.rootMidi,
      tune: zone.tuneCents,
      level: zone.level,
      delay: zone.delay,
      attack: zone.attack,
      hold: zone.hold,
      decay: zone.decay,
      sustain: zone.sustain,
      release: zone.release,
      keyToHold: zone.keyToHold,
      keyToDecay: zone.keyToDecay,
      ...(zone.scaleTuning !== undefined ? { scaleTuning: zone.scaleTuning } : {}),
      ...(zone.filterCutoffCents !== undefined ? { filterCutoffCents: zone.filterCutoffCents } : {}),
      sf2DefaultVelocityAttenuation: true,
      ...(zone.exclusiveClass !== undefined ? { exclusiveClass: zone.exclusiveClass } : {}),
      loop: zone.loop,
      ...(zone.loopUntilRelease ? { loopUntilRelease: true } : {}),
      ...(zone.loop ? {
        loopStart: Math.max(0, (zone.loopStart - zone.start) / rate),
        loopEnd: Math.max(0, (zone.loopEnd - zone.start) / rate),
      } : {}),
    });
  }
  return result;
}

export const PatchBrowser: React.FC<Props> = ({ track, partNo, onClose, onChosen }) => {
  const [cat, setCat] = useState(CATEGORIES[0]?.label ?? '');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'replace' | 'add'>(track ? 'replace' : 'add');
  const [source, setSource] = useState<Source>('built-in');
  const [recordedOnly, setRecordedOnly] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const visibleCategories = useMemo(
    () => filterRecordedInstrumentCategories(CATEGORIES, recordedOnly),
    [recordedOnly],
  );
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = needle ? visibleCategories.flatMap((c) => c.items.map((i) => ({ ...i, cat: c.label }))) : (visibleCategories.find((c) => c.label === cat)?.items ?? []).map((i) => ({ ...i, cat }));
    return pool.filter((i) => !needle || `${i.name} ${i.desc} ${i.cat}`.toLowerCase().includes(needle));
  }, [cat, q, visibleCategories]);

  const choose = (type: DeviceType, name: string) => {
    if (mode === 'replace' && track) {
      const dev = swapPartInstrument(track, type, name);
      if (dev) onChosen(dev.id);
    } else {
      const dev = audioEngine.createDevice(type, name);
      onChosen(dev.id);
    }
    onClose();
  };

  /** Library unit: instruments become a new part, effects go on the part's chain. */
  const mount = (item: MountableItem, presetId?: string) => {
    const dev = audioEngine.createVstDevice(snapshotFromItem(item, vstLibrary.manifest), { presetId });
    if (dev.role === 'effect') {
      if (track) audioEngine.insertEffectOnTrack(dev.id, track.deviceId);
      setNote(`${dev.name} inserted on part ${partNo}`);
      return;
    }
    onChosen(dev.id);
    onClose();
  };
  /** An audio file becomes the part's sound (replace) or a new part's (add, on the Zone One sampler). */
  const audioPicker = useRef<HTMLInputElement>(null);
  const sf2Picker = useRef<HTMLInputElement>(null);
  const [sf2, setSf2] = useState<ParsedSf2 | null>(null);
  const [sf2Name, setSf2Name] = useState('');
  const [dropOver, setDropOver] = useState(false);
  const applyAudioFile = async (file: File) => {
    if (!isAudioFile(file)) {
      setNote(`${file.name} is not an audio file`);
      return;
    }
    setNote(`Loading ${file.name}…`);
    try {
      const devId = mode === 'replace' && track ? track.deviceId : audioEngine.createDevice('nn19', file.name.replace(/\.[^.]+$/, '')).id;
      await loadKeySampleFile(devId, file);
      audioEngine.changed();
      onChosen(devId);
      onClose();
    } catch {
      setNote(`${file.name} could not be decoded (WAV, MP3, OGG, Opus, FLAC and M4A/AAC work)`);
    }
  };
  const sampleAsSound = async (item: SampleItem) => {
    try {
      const res = await fetch(vstLibrary.previewUrl(item.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await applyAudioFile(new File([blob], `${item.name}.${item.format}`, { type: blob.type || 'audio/ogg' }));
    } catch (e) {
      setNote(`Could not load "${item.name}": ${(e as Error).message}`);
    }
  };

  const readSf2File = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.sf2')) {
      setNote('Choose a SoundFont 2 (.sf2) file');
      return;
    }
    if (file.size > 512 * 1024 * 1024) {
      setNote('SoundFont is larger than the 512 MB import limit');
      return;
    }
    setNote(`Reading ${file.name}…`);
    try {
      const parsed = parseSf2(await file.arrayBuffer());
      if (!parsed) throw new Error('No playable presets or valid sample zones were found');
      setSf2(parsed);
      setSf2Name(file.name);
      setNote(`${parsed.presets.length} playable presets`);
    } catch (e) {
      setSf2(null);
      setSf2Name('');
      setNote(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  };

  const chooseSf2Preset = (preset: Sf2Preset) => {
    if (!sf2) return;
    try {
      const materialized = materializeSf2Preset(sf2, preset, sf2Name);
      const deviceId = mode === 'replace' && track
        ? track.deviceId
        : audioEngine.createDevice('nn19', `${preset.name} (SF2)`).id;
      setMultiSample(deviceId, materialized);
      audioEngine.changed();
      onChosen(deviceId);
      onClose();
    } catch (e) {
      setNote(`Could not load "${preset.name}": ${(e as Error).message}`);
    }
  };

  const addSample = async (item: SampleItem) => {
    try {
      const res = await fetch(vstLibrary.previewUrl(item.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const asset = await audioStore.importFile(await res.blob(), item.name);
      audioEngine.addAudioClip(asset.id, Math.floor(audioEngine.getPlayheadPosition() / audioEngine.stepsPerBar));
      setNote(`"${item.name}" is on an audio track at the playhead`);
    } catch (e) {
      setNote(`Could not add "${item.name}": ${(e as Error).message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center" onPointerDown={onClose} role="dialog" aria-label="Load instrument" data-testid="patch-browser">
      <div className="us-metal us-metal-frame w-[860px] max-w-[94vw] h-[560px] max-h-[86vh] flex flex-col p-3 gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="font-label font-extrabold text-[22px] text-ink tracking-wide">LOAD</span>
          <div className="flex rounded-[5px] overflow-hidden border border-[#8f959c]">
            {track && (
              <button type="button" onClick={() => setMode('replace')} className={`px-3 h-[28px] font-label font-bold text-[13px] ${mode === 'replace' ? 'bg-[#4b5159] text-white' : 'bg-[#e9ebee] text-[#4b5159]'}`}>
                Replace part {partNo}
              </button>
            )}
            <button type="button" onClick={() => setMode('add')} className={`px-3 h-[28px] font-label font-bold text-[13px] ${mode === 'add' ? 'bg-[#4b5159] text-white' : 'bg-[#e9ebee] text-[#4b5159]'}`}>
              Add as new part
            </button>
          </div>
          <label className="flex-1 flex items-center gap-1 us-btn-light rounded px-2 h-[28px]">
            <Search className="w-4 h-4 text-[#5b616a]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search instruments…" className="flex-1 bg-transparent outline-none text-[13px] text-ink" />
          </label>
          <button type="button" onClick={onClose} className="us-btn rounded w-8 h-8 grid place-items-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              aria-pressed={source === s.id}
              className={`px-3 h-[26px] rounded-[5px] font-label font-bold text-[13px] ${source === s.id ? 'bg-[#4b5159] text-white' : 'us-btn-light text-[#2c3137]'}`}
            >
              {s.label}
            </button>
          ))}
          {source === 'built-in' && (
            <button
              type="button"
              onClick={() => {
                const next = !recordedOnly;
                setRecordedOnly(next);
                if (next) {
                  const firstRecorded = CATEGORIES.find((category) => category.items.some((item) => isRecordedInstrument(item.type)));
                  if (firstRecorded) setCat(firstRecorded.label);
                }
              }}
              aria-pressed={recordedOnly}
              title="Show recorded sample packs only; synthesized and modeled instruments are hidden."
              className={`px-3 h-[26px] rounded-[5px] font-label font-bold text-[13px] ${recordedOnly ? 'bg-[#4b5159] text-white' : 'us-btn-light text-[#2c3137]'}`}
            >
              Recorded audio only
            </button>
          )}
          {note && <span className="ml-2 font-label text-[13px] text-ink" role="status">{note}</span>}
        </div>
        {source === 'audio' ? (
          <div
            className={`flex-1 min-h-0 us-lcd grid place-items-center p-6 ${dropOver ? 'ring-2 ring-sel' : ''}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDropOver(true);
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void applyAudioFile(f);
            }}
            data-testid="patch-audio-file"
          >
            <input
              ref={audioPicker}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.opus,.flac,.m4a,.aac"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void applyAudioFile(f);
              }}
            />
            <div className="flex flex-col items-center gap-3 text-center max-w-[520px]">
              <div className="font-lcd text-[22px] leading-none">PLAY ANY AUDIO FILE</div>
              <div className="font-label text-[13px] leading-snug">
                {mode === 'replace' && track
                  ? `The file becomes the sound of part ${partNo}, played across the keyboard from its own pitch. Its notes, mixer channel and effects stay.`
                  : 'The file becomes the sound of a new part, played across the keyboard from its own pitch.'}{' '}
                WAV, MP3, OGG, Opus, FLAC and M4A / AAC.
              </div>
              <button type="button" className="us-btn rounded-[6px] h-[34px] px-4 flex items-center gap-2 font-label font-bold text-[13px]" onClick={() => audioPicker.current?.click()}>
                <Upload className="w-4 h-4" /> Choose audio file…
              </button>
              <div className="font-label text-[13px] opacity-75">or drop it here</div>
            </div>
          </div>
        ) : source === 'soundfont' ? (
          <div className="flex-1 min-h-0 us-lcd p-3 flex flex-col gap-2" data-testid="patch-soundfont">
            <input
              ref={sf2Picker}
              type="file"
              accept=".sf2,application/octet-stream"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void readSf2File(file);
              }}
            />
            <div className="flex items-center gap-3">
              <div className="font-lcd text-[18px]">SOUNDFONT 2 PRESETS</div>
              <button type="button" className="us-btn rounded-[6px] h-[30px] px-3 flex items-center gap-2 font-label font-bold text-[13px]" onClick={() => sf2Picker.current?.click()}>
                <Upload className="w-4 h-4" /> Choose .sf2 file…
              </button>
              <span className="font-label text-[13px] truncate" title={sf2Name}>{sf2Name || 'Imported preset samples are stored with the project.'}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto us-lcd-box p-2">
              {sf2 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {sf2.presets.map((preset, index) => (
                    <button
                      key={`${preset.bank}:${preset.program}:${index}`}
                      type="button"
                      onClick={() => chooseSf2Preset(preset)}
                      className="text-left us-lcd-box px-2 py-1 hover:bg-[#0e2d33] hover:text-[#a8d6d9]"
                      data-testid="soundfont-preset"
                    >
                      <div className="font-lcd text-[18px] leading-[20px] truncate">{preset.name}</div>
                      <div className="font-label text-[13px] leading-tight opacity-80">Bank {preset.bank} · Program {preset.program} · {preset.zones.length} sample zones</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-full grid place-items-center font-label text-[13px] text-center">Choose a local SF2 file to inspect its real preset and sample-zone map. Imported presets are embedded in the project as audio assets.</div>
              )}
            </div>
          </div>
        ) : source !== 'built-in' ? (
          <div className="flex-1 min-h-0 overflow-y-auto us-bezel p-1 text-[#d5dae0]">
            <LibraryQuickList
              kinds={source === 'samples' ? ['sample'] : source === 'effects' ? ['plugin'] : ['preset', 'instrument']}
              filter={source === 'effects' ? isEffectPlugin : undefined}
              query={q}
              onMount={mount}
              onAddToSong={source === 'samples' ? (it) => void addSample(it) : undefined}
              onUseAsSound={source === 'samples' ? (it) => void sampleAsSound(it) : undefined}
              onError={setNote}
            />
          </div>
        ) : (
        <div className="flex-1 min-h-0 flex gap-2">
          <div className="w-[230px] overflow-y-auto us-bezel">
            <div className="flex flex-col gap-[2px] p-1">
              {visibleCategories.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setCat(c.label);
                    setQ('');
                  }}
                  className={`text-left px-2 py-1 rounded font-label font-semibold text-[13px] ${cat === c.label && !q ? 'us-sel-row' : 'text-[#c9ced4] hover:bg-white/10'}`}
                >
                  {c.label} <span className="opacity-60 text-[13px]">({c.items.length})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto us-lcd p-2">
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((i) => (
                <button
                  key={`${i.cat}:${i.type}:${i.name}`}
                  type="button"
                  onClick={() => choose(i.type, i.name)}
                  className="text-left us-lcd-box px-2 py-1 hover:bg-[#0e2d33] hover:text-[#a8d6d9] group"
                  title={i.desc}
                  data-testid="patch-item"
                >
                  <div className="font-lcd text-[18px] leading-[20px] truncate">{i.name}</div>
                  <div className="font-label text-[13px] leading-tight opacity-80 line-clamp-2">{i.desc}</div>
                </button>
              ))}
              {items.length === 0 && <div className="font-lcd text-[18px]">Nothing found.</div>}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
