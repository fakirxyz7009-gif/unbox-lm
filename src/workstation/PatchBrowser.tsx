/**
 * LOAD: the browser (src/browser) in a dialog for one workstation part. Instruments replace the
 * part's instrument (its notes, clips, mixer settings and effects stay) or become a new part; effects
 * are inserted on the part; audio (stems, samples, project audio, an audio file) becomes the part's
 * sound, played across the keys; a SoundFont preset becomes its multisample map.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileAudio, Layers, X } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { DeviceType, SequencerTrack } from '../audio/types.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import { snapshotFromItem } from '../vst/VstPluginDevice.ts';
import { isMountable, type MountableItem } from '../../shared/vst/manifestTypes.ts';
import { swapPartInstrument } from './swapPatch.ts';
import { loadKeySampleFile, setMultiSample, type MultiSampleZone } from '../audio/deviceSamples.ts';
import { parseSf2, type ParsedSf2, type Sf2Preset, type Sf2Sample, type Sf2Zone } from '../audio/soundfont/sf2.ts';
import { isAudioFile } from '../rack/DeviceSampleBar.tsx';
import { createSamplerPart } from '../audio/stemLibraryClient.ts';
import { SpecDevice } from '../audio/spec/SpecDevice.ts';
import { Browser, type BrowserAction } from '../browser/Browser.tsx';
import type { BrowserEntry, BrowserSection } from '../browser/entries.ts';
import { addToSong, loadAsSound } from '../browser/entryActions.ts';
import { toast } from '../shell/toast.ts';
import { userFileProvenance } from '../../shared/audio/provenance.ts';

const LOAD_SECTIONS: BrowserSection[] = ['instruments', 'stems', 'samples', 'project', 'library', 'effects', 'utilities'];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    const style = window.getComputedStyle(element);
    return element.tabIndex >= 0 && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

interface Props {
  /** The part to replace; null = only "add as new part". */
  track: SequencerTrack | null;
  partNo: number;
  onClose: () => void;
  onChosen: (deviceId: string) => void;
}


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
      const asset = audioStore.add(`${fileName} · ${preset.name} · ${source.left.name || 'Sample'}`, buffer, {
        provenance: userFileProvenance(fileName),
      });
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
  const [mode, setMode] = useState<'replace' | 'add'>(track ? 'replace' : 'add');
  const replace = mode === 'replace' && !!track;
  const audioPicker = useRef<HTMLInputElement>(null);
  const sf2Picker = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // read during the first render: the browser's effect focuses its search before ours runs
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [sf2, setSf2] = useState<ParsedSf2 | null>(null);
  const [sf2Name, setSf2Name] = useState('');
  const [dropOver, setDropOver] = useState(false);

  useEffect(
    () => () => {
      if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    },
    [opener],
  );

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (sf2) setSf2(null);
      else onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const targets = focusableChildren(dialog);
    if (!targets.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const first = targets[0];
    const last = targets[targets.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  /** The device that gets a sound: this part, or a new sampler part. */
  const soundTarget = (name: string) => (replace && track ? track.deviceId : createSamplerPart(name));
  const done = (deviceId: string) => {
    onChosen(deviceId);
    onClose();
  };

  const chooseInstrument = (type: DeviceType, name: string) => {
    const dev = replace && track ? swapPartInstrument(track, type, name) : audioEngine.runStructuralEdit('Add part', () => audioEngine.createDevice(type, name));
    if (dev) done(dev.id);
  };

  const insertEffect = (create: () => { id: string; name: string }): string => {
    if (!track) throw new Error('Choose a part first: effects are inserted on a part');
    const dev = audioEngine.runStructuralEdit('Add effect', create);
    return audioEngine.insertEffectOnTrack(dev.id, track.deviceId) ? `${dev.name} inserted on part ${partNo}` : `${dev.name} is in the rack: patch it on the rear panel (Tab)`;
  };

  const mountLibrary = (item: MountableItem, presetId?: string): string | void => {
    const snap = snapshotFromItem(item, vstLibrary.manifest);
    if (snap.role === 'effect') return insertEffect(() => audioEngine.createVstDevice(snap, { presetId }));
    const dev = audioEngine.runStructuralEdit('Add part', () => audioEngine.createVstDevice(snap, { presetId }));
    done(dev.id);
  };

  const actionsFor = (e: BrowserEntry): BrowserAction[] => {
    const r = e.ref;
    if (r.kind === 'builtin') {
      if (r.role === 'instrument') return [{ label: replace ? 'Load' : '+ Part', title: replace ? `Play part ${partNo} with ${r.name} (its notes stay)` : 'Add a new part', run: () => chooseInstrument(r.type, r.name) }];
      if (r.role === 'effect') return track ? [{ label: 'Insert', title: `Insert on part ${partNo}`, run: () => insertEffect(() => audioEngine.createDevice(r.type, r.name)) }] : [];
      return [
        {
          label: 'Add',
          title: track ? `Add it; a player plays part ${partNo}` : 'Add it to the rack',
          run: () => {
            const dev = audioEngine.runStructuralEdit('Add device', () => audioEngine.createDevice(r.type, r.name));
            if (track && dev instanceof SpecDevice && dev.spec.kind === 'player') audioEngine.setPlayerTarget(dev.id, track.deviceId);
            return `Added ${dev.name}`;
          },
        },
      ];
    }
    if (r.kind === 'library' && r.item.kind !== 'sample') {
      const item = r.item;
      if (isMountable(item)) {
        const effect = item.kind === 'plugin' && item.role === 'effect';
        if (effect && !track) return [];
        return [{ label: effect ? 'Insert' : '+ Part', title: effect ? `Insert on part ${partNo} (proxy DSP)` : 'Add as a new part (proxy DSP)', run: () => mountLibrary(item) }];
      }
      const target = item.kind === 'preset' ? vstLibrary.item(item.targetId) : undefined;
      return target && isMountable(target) ? [{ label: 'Load', title: `Add ${target.name} with this preset`, run: () => mountLibrary(target, item.id) }] : [];
    }
    return [
      {
        label: replace ? 'Load' : '+ Part',
        title: replace ? `Part ${partNo} plays this sound across the keys (its notes stay)` : 'A new part that plays this sound across the keys',
        run: async () => {
          const id = soundTarget(e.name);
          const msg = await loadAsSound(e, id);
          done(id);
          return msg;
        },
      },
      { label: '+ Song', title: 'Put it on an audio track at the playhead', run: () => addToSong(e) },
    ];
  };

  const applyAudioFile = async (file: File) => {
    if (!isAudioFile(file)) {
      toast(`${file.name} is not an audio file`, 'error');
      return;
    }
    try {
      const id = soundTarget(file.name.replace(/\.[^.]+$/, ''));
      await loadKeySampleFile(id, file);
      audioEngine.changed();
      done(id);
    } catch {
      toast(`${file.name} could not be decoded (WAV, MP3, OGG, Opus, FLAC and M4A/AAC work)`, 'error');
    }
  };

  const readSf2File = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.sf2')) return toast('Choose a SoundFont 2 (.sf2) file', 'error');
    if (file.size > 512 * 1024 * 1024) return toast('SoundFont is larger than the 512 MB import limit', 'error');
    try {
      const parsed = parseSf2(await file.arrayBuffer());
      if (!parsed) throw new Error('No playable presets or valid sample zones were found');
      setSf2(parsed);
      setSf2Name(file.name);
    } catch (e) {
      setSf2(null);
      toast(`Could not import ${file.name}: ${(e as Error).message}`, 'error');
    }
  };

  const chooseSf2Preset = (preset: Sf2Preset) => {
    if (!sf2) return;
    try {
      const zones = materializeSf2Preset(sf2, preset, sf2Name);
      const id = replace && track ? track.deviceId : audioEngine.runStructuralEdit('Add part', () => audioEngine.createDevice('nn19', `${preset.name} (SF2)`)).id;
      setMultiSample(id, zones);
      audioEngine.changed();
      done(id);
    } catch (e) {
      toast(`Could not load "${preset.name}": ${(e as Error).message}`, 'error');
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-browser-title"
      data-testid="patch-browser"
    >
      <div
        className={`load-dialog w-[1040px] max-w-[95vw] h-[680px] max-h-[90vh] flex flex-col p-3 gap-2.5 ${dropOver ? 'ring-2 ring-[#d69b50]' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void (f.name.toLowerCase().endsWith('.sf2') ? readSf2File(f) : applyAudioFile(f));
        }}
      >
        <input ref={audioPicker} type="file" accept="audio/*,.wav,.mp3,.ogg,.opus,.flac,.m4a,.aac,.aif,.aiff" className="hidden" data-testid="load-audio-input" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void applyAudioFile(f);
        }} />
        <input ref={sf2Picker} type="file" accept=".sf2,application/octet-stream" className="hidden" data-testid="load-sf2-input" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void readSf2File(f);
        }} />
        <header className="flex items-center gap-3">
          <h2 id="patch-browser-title" className="font-label font-extrabold text-[22px] text-[#f2e8d6] tracking-wide">LOAD</h2>
          <div className="load-seg" role="group" aria-label="Load into">
            {track && (
              <button type="button" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>
                Replace part {partNo}
              </button>
            )}
            <button type="button" aria-pressed={mode === 'add'} onClick={() => setMode('add')}>
              Add as new part
            </button>
          </div>
          <span className="flex-1 font-label text-[13px] text-[#a39683] truncate">
            {replace ? `Part ${partNo} keeps its notes, mixer and effects.` : 'Each choice becomes a new part.'}
          </span>
          <button type="button" className="bw-act bw-act--secondary" onClick={() => audioPicker.current?.click()} title="Any audio file becomes the sound, played across the keys from its own pitch (or drop a file on this window)">
            <FileAudio className="w-3.5 h-3.5" /> Audio file…
          </button>
          <button type="button" className="bw-act bw-act--secondary" onClick={() => sf2Picker.current?.click()} title="Load a preset from a SoundFont 2 (.sf2) file">
            <Layers className="w-3.5 h-3.5" /> SoundFont…
          </button>
          <button type="button" onClick={onClose} className="bw-icon-btn" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        {sf2 ? (
          <div className="flex-1 min-h-0 flex flex-col gap-2" data-testid="patch-soundfont">
            <div className="flex items-center gap-2">
              <button type="button" className="bw-act bw-act--secondary" onClick={() => setSf2(null)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Browser
              </button>
              <span className="font-label font-bold text-[13px] text-[#e1bc7e] truncate">{sf2Name}</span>
              <span className="font-label text-[11px] text-[#a39683]">{sf2.presets.length} presets · stored with the project when you load one</span>
            </div>
            <div className="bw-list p-1 grid grid-cols-2 gap-1 content-start">
              {sf2.presets.map((preset, index) => (
                <button key={`${preset.bank}:${preset.program}:${index}`} type="button" onClick={() => chooseSf2Preset(preset)} className="bw-row text-left rounded-[5px]" data-testid="soundfont-preset">
                  <span className="flex-1 min-w-0">
                    <span className="bw-name">{preset.name}</span>
                    <span className="bw-detail">Bank {preset.bank} · Program {preset.program} · {preset.zones.length} sample zones</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Browser host="load" layout="wide" sections={LOAD_SECTIONS} actionsFor={actionsFor} className="flex-1" autoFocus />
        )}
      </div>
    </div>
  );
};
