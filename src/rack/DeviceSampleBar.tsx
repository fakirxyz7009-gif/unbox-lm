/**
 * "Load audio" strip on every instrument's panel (rack units and the workstation EDIT window).
 * Keys instruments: pick or drop an audio file and it becomes the instrument's sound, played across
 * the keyboard from its root note (detected from the file's pitch). Drum machines: one file per pad.
 * Remove the file to get the instrument's own sound back.
 */
import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Music, Upload, X } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine.ts';
import type { BaseDevice } from '../audio/BaseDevice.ts';
import { audioStore } from '../audio/clips/audioStore.ts';
import {
  clearPadSamples,
  deviceSample,
  deviceSamplesVersion,
  loadKeySampleFile,
  loadPadSampleFile,
  setKeySample,
  setPadSample,
  subscribeDeviceSamples,
  updateKeySample,
} from '../audio/deviceSamples.ts';
import { drumLanesFor } from '../audio/drumLanes.ts';
import { useAudioStoreVersion } from '../components/sequencer/arrangement/AudioClipWave.tsx';
import { RingKnob } from '../ui/skin/RingKnob.tsx';
import { LedButton } from '../ui/skin/panel.tsx';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|opus|flac|m4a|aac|mp4|webm|caf)$/i;
export const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
const save = () => audioEngine.changed();

export function DeviceSampleBar({ device }: { device: BaseDevice }) {
  useSyncExternalStore(subscribeDeviceSamples, deviceSamplesVersion);
  useAudioStoreVersion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<number | 'keys' | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickFor = useRef<number | null>(null);
  const st = deviceSample(device.id);
  const lanes = drumLanesFor(device);
  const keys = st?.keys;
  const asset = keys ? audioStore.get(keys.audioId) : undefined;
  const missing = keys ? audioStore.missing.has(keys.audioId) : false;

  const load = async (file: File, pad: number | null) => {
    if (!isAudioFile(file)) {
      setError(`${file.name} is not an audio file`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (pad === null) await loadKeySampleFile(device.id, file);
      else await loadPadSampleFile(device.id, pad, file);
      save();
    } catch {
      setError(`${file.name} could not be decoded (WAV, MP3, OGG, Opus, FLAC and M4A/AAC work)`);
    } finally {
      setBusy(false);
    }
  };
  const open = (pad: number | null) => {
    pickFor.current = pad;
    picker.current?.click();
  };
  const dropZone = (target: number | 'keys') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      if (over !== target) setOver(target);
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      const f = e.dataTransfer.files[0];
      if (f) void load(f, target === 'keys' ? null : target);
    },
  });

  const fileInput = (
    <input
      ref={picker}
      type="file"
      accept="audio/*,.wav,.mp3,.ogg,.opus,.flac,.m4a,.aac"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void load(f, pickFor.current);
      }}
    />
  );

  // ---- drum machines: one file per pad
  if (lanes) {
    const loaded = lanes.filter((l) => st?.pads?.[l.note]);
    return (
      <div className="ds-bar" onClick={(e) => e.stopPropagation()} data-testid="device-sample-bar">
        {fileInput}
        <span className="ds-label" title="Load an audio file onto a pad: it plays instead of the pad's own sound">
          <Music className="w-3 h-3" /> PAD AUDIO
        </span>
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {lanes.map((l) => {
            const pad = st?.pads?.[l.note];
            const name = pad ? audioStore.get(pad.audioId)?.name ?? 'audio' : null;
            return (
              <span key={l.note} className={`ds-pad ${pad ? 'ds-pad--on' : ''} ${over === l.note ? 'ds-pad--over' : ''}`} {...dropZone(l.note)}>
                <button type="button" onClick={() => open(l.note)} title={pad ? `${l.name}: ${name} (click to replace, drop a file to swap)` : `${l.name}: click or drop an audio file`} disabled={busy}>
                  {l.name}
                </button>
                {pad && (
                  <button
                    type="button"
                    className="ds-x"
                    aria-label={`Remove the audio from ${l.name}`}
                    title={`Back to ${l.name}'s own sound`}
                    onClick={() => {
                      setPadSample(device.id, l.note, null);
                      save();
                    }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {loaded.length > 1 && (
          <button
            type="button"
            className="ds-btn"
            onClick={() => {
              clearPadSamples(device.id);
              save();
            }}
          >
            Clear all
          </button>
        )}
        {error && <span className="ds-error">{error}</span>}
      </div>
    );
  }

  // ---- keys: one file across the keyboard
  if (!keys) {
    return (
      <div className={`ds-bar ${over === 'keys' ? 'ds-bar--over' : ''}`} onClick={(e) => e.stopPropagation()} {...dropZone('keys')} data-testid="device-sample-bar">
        {fileInput}
        <button type="button" className="ds-btn" onClick={() => open(null)} disabled={busy}>
          <Upload className="w-3 h-3" /> {busy ? 'Loading…' : 'Load audio'}
        </button>
        <span className="ds-hint">or drop an audio file here — it becomes this instrument's sound across the keyboard</span>
        {error && <span className="ds-error">{error}</span>}
      </div>
    );
  }
  return (
    <div className={`ds-bar ${over === 'keys' ? 'ds-bar--over' : ''}`} onClick={(e) => e.stopPropagation()} {...dropZone('keys')} data-testid="device-sample-bar">
      {fileInput}
      <span className="ds-file" title={asset ? `${asset.name} · ${asset.buffer.duration.toFixed(2)} s · ${asset.buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}` : undefined}>
        <Music className="w-3 h-3 shrink-0" />
        <span className="truncate">{missing ? 'audio missing' : asset ? asset.name : 'loading…'}</span>
      </span>
      <label className="ds-root" title="The note at which the file plays at its original pitch (detected when you load it)">
        ROOT
        <select
          value={keys.root}
          onChange={(e) => {
            updateKeySample(device.id, { root: Number(e.target.value) });
            save();
          }}
          className="us-field h-[20px] px-0.5 font-label text-[13px]"
        >
          {Array.from({ length: 97 }, (_, i) => i + 12).map((n) => (
            <option key={n} value={n}>
              {noteName(n)}
            </option>
          ))}
        </select>
      </label>
      <RingKnob tone="dark" size={22} label="Tune" min={-100} max={100} step={1} bipolar defaultValue={0} value={keys.tune} format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`} onChange={(v) => updateKeySample(device.id, { tune: v })} onCommit={save} />
      <RingKnob tone="dark" size={22} label="Level" min={0} max={2} defaultValue={1} value={keys.level} format={(v) => (v <= 0.001 ? '-∞ dB' : `${(20 * Math.log10(v)).toFixed(1)} dB`)} onChange={(v) => updateKeySample(device.id, { level: v })} onCommit={save} />
      <RingKnob tone="dark" size={22} label="Attack" min={0.001} max={2} curve="log" defaultValue={0.003} value={keys.attack} format={(v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)} onChange={(v) => updateKeySample(device.id, { attack: v })} onCommit={save} />
      <RingKnob tone="dark" size={22} label="Release" min={0.01} max={5} curve="log" defaultValue={0.25} value={keys.release} format={(v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)} onChange={(v) => updateKeySample(device.id, { release: v })} onCommit={save} />
      <LedButton
        on={keys.loop}
        onClick={() => {
          updateKeySample(device.id, { loop: !keys.loop });
          save();
        }}
        title="Loop the file while the key is held"
        className="w-[42px] h-[20px] text-[11px]"
        color="#7ff0ff"
      >
        LOOP
      </LedButton>
      <span className="flex-1" />
      <button type="button" className="ds-btn" onClick={() => open(null)} disabled={busy} title="Load another audio file">
        <Upload className="w-3 h-3" /> Replace
      </button>
      <button
        type="button"
        className="ds-btn"
        onClick={() => {
          setKeySample(device.id, null);
          save();
        }}
        title="Remove the file: back to the instrument's own sound"
      >
        <X className="w-3 h-3" /> Own sound
      </button>
      {error && <span className="ds-error">{error}</span>}
    </div>
  );
}
