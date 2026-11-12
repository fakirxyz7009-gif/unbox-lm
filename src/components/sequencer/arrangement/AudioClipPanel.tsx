/** Inline editor for one audio clip: gain, fades, pitch, reverse, tempo follow, loop and takes. */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { AudioEngine } from '../../../audio/AudioEngine.ts';
import type { ArrangementClip, SequencerTrack } from '../../../audio/types.ts';
import { audioStore, detectTempoBpm, detectTransientTimes, removeDcOffset, calculateClipRms } from '../../../audio/clips/audioStore.ts';
import { monoSamples } from '../../../audio/ai/stemNotes.ts';
import { transcribeInBackground } from '../../../audio/ai/transcribeInBackground.ts';
import { denoiseBuffer } from '../../../audio/ai/denoise.ts';
import type { KeyEstimate } from '../../../../shared/analysis/keyDetection.ts';
import { audioClipRate, secPerBar } from '../../../audio/clips/clipMath.ts';
import { Btn, NumField } from '../../../studio/ui/controls.tsx';
import { AudioClipWave, useAudioStoreVersion } from './AudioClipWave.tsx';
import { derivedAudioProvenance } from '../../../../shared/audio/provenance.ts';

/** Peak (linear) of the part of the source a clip plays. */
export function clipSourcePeak(c: ArrangementClip, bpm: number, spb: number): number {
  const a = audioStore.get(c.audioId);
  if (!a) return 0;
  const sr = a.buffer.sampleRate;
  const base = c.audioOffset ?? 0;
  const span = c.loopAudio ? (c.loopSec ?? a.buffer.duration - base) : c.lengthBars * secPerBar(bpm, spb) * audioClipRate(c, bpm);
  const i0 = Math.max(0, Math.floor(base * sr));
  const i1 = Math.min(a.buffer.length, Math.ceil((base + span) * sr));
  let peak = 0;
  for (let ch = 0; ch < a.buffer.numberOfChannels; ch++) {
    const d = a.buffer.getChannelData(ch);
    for (let i = i0; i < i1; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

export function AudioClipPanel({
  audioEngine,
  track,
  clip,
  onClose,
  onComped,
  showWave = true,
}: {
  audioEngine: AudioEngine;
  track: SequencerTrack;
  clip: ArrangementClip;
  onClose: () => void;
  onComped?: (clipId: string) => void;
  /** The Clip Editor draws its own large waveform with handles. */
  showWave?: boolean;
}) {
  useAudioStoreVersion();
  const seq = audioEngine.sequencer;
  const asset = audioStore.get(clip.audioId);
  const [tempoMessage, setTempoMessage] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [keyFound, setKeyFound] = useState<KeyEstimate | null>(null);
  const [sliceMessage, setSliceMessage] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState('');
  const [selectedTakeId, setSelectedTakeId] = useState(clip.audioId ?? clip.takes?.[0]?.audioId ?? '');
  const [compStart, setCompStart] = useState(0);
  const [compEnd, setCompEnd] = useState(clip.lengthBars);
  const spb = audioEngine.stepsPerBar;
  const sourceSpan = asset
    ? clip.loopAudio
      ? Math.max(0.01, clip.loopSec ?? asset.buffer.duration)
      : clip.lengthBars * secPerBar(audioEngine.bpm, spb) * audioClipRate(clip, audioEngine.bpm)
    : 0;
  const maxSourceOffset = asset ? Math.max(0, asset.buffer.duration - sourceSpan) : 0;
  const set = (patch: Parameters<typeof seq.updateAudioClip>[2]) => seq.updateAudioClip(track.id, clip.id, patch);
  const normalize = () => {
    const peak = clipSourcePeak(clip, audioEngine.bpm, spb);
    if (peak > 0) set({ gainDb: Math.round((-0.3 - 20 * Math.log10(peak)) * 10) / 10 });
  };
  const normalizeRms = () => {
    if (!asset) return;
    const base = clip.audioOffset ?? 0;
    const span = clip.loopAudio
      ? (clip.loopSec ?? asset.buffer.duration - base)
      : clip.lengthBars * secPerBar(audioEngine.bpm, spb) * audioClipRate(clip, audioEngine.bpm);
    const rms = calculateClipRms(asset.buffer, base, span);
    if (rms > 0.00001) {
      const currentRmsDb = 20 * Math.log10(rms);
      const targetGain = -18 - currentRmsDb;
      set({ gainDb: Math.max(-60, Math.min(24, Math.round(targetGain * 10) / 10)) });
    }
  };
  const cleanDcOffset = () => {
    if (!asset) return;
    // A new asset, so other clips that play the original keep their audio; the clip change is one undo step.
    set({ audioId: audioStore.add(`${asset.name} (DC removed)`, removeDcOffset(asset.buffer), {
      provenance: derivedAudioProvenance(asset.provenance, 'DC offset removed'),
    }).id });
  };
  const cleanNoise = async () => {
    if (!asset || cleaning) return;
    setCleaning(true);
    setCleanMessage('Removing noise...');
    try {
      const cleaned = await denoiseBuffer(asset.buffer);
      // A new asset, like Remove DC: the original stays for other clips, and the clip change is one undo step.
      set({ audioId: audioStore.add(`${asset.name} (clean)`, cleaned, {
        provenance: derivedAudioProvenance(asset.provenance, 'RNNoise cleanup'),
      }).id });
      setCleanMessage('Noise removed with RNNoise. Check it against the original by ear: it can thin out music.');
    } catch (error) {
      setCleanMessage(`Noise removal failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCleaning(false);
    }
  };
  const detectTempo = () => {
    if (!asset) return;
    const bpm = asset.detectedBpm ?? detectTempoBpm(asset.buffer);
    if (!bpm) {
      setTempoMessage('No steady tempo found. Enter the source BPM manually.');
      return;
    }
    audioStore.update(asset.id, { detectedBpm: bpm });
    set({ sourceBpm: bpm });
    setTempoMessage(`Estimate: ${bpm} BPM. Check it before enabling tempo follow.`);
  };
  const detectKeyOfClip = async () => {
    if (!asset) return;
    setKeyMessage('Detecting the key...');
    const estimate = await transcribeInBackground('key', monoSamples(asset.buffer), asset.buffer.sampleRate);
    if (!estimate) {
      setKeyFound(null);
      setKeyMessage('No pitched content, so no key.');
      return;
    }
    audioStore.update(asset.id, { key: estimate.name });
    setKeyFound(estimate);
    setKeyMessage(`Key ${estimate.name}, clarity ${Math.round(estimate.clarity * 100)} %. Check it by ear before using it.`);
  };
  const useProjectKey = () => {
    if (!keyFound) return;
    audioEngine.rootKey = keyFound.root;
    audioEngine.scaleType = keyFound.mode === 'major' ? 'major' : 'minor';
    audioEngine.changed();
    setKeyMessage(`Project key set to ${keyFound.name}: the piano roll now snaps to ${keyFound.mode === 'major' ? 'major' : 'natural minor'}.`);
  };
  const useTakeRange = () => {
    if (!selectedTakeId) return;
    const start = Math.max(0, Math.min(clip.lengthBars, compStart));
    const end = Math.max(0, Math.min(clip.lengthBars, compEnd));
    const newClipId = seq.compAudioTakeRange(track.id, clip.id, selectedTakeId, clip.startBar + start, clip.startBar + end);
    if (newClipId) onComped?.(newClipId);
    else setTempoMessage('Choose a take and a range of at least one grid step.');
  };
  const sliceTransients = () => {
    if (!asset) return;
    const count = seq.sliceAudioAtTransients(track.id, clip.id, detectTransientTimes(asset.buffer));
    setSliceMessage(count === null ? 'Turn off Reverse and Loop before slicing this clip.' : count === 0 ? 'No clear transients landed inside this clip.' : `Split at ${count - 1} detected attacks; each cut moved to the nearest 16th-note line, so it is not exactly on the attack.`);
  };
  return (
    <div className="border-t border-[#796d5b] us-metal p-2.5 flex flex-col gap-2 text-[11px] text-ink select-none shadow-sm" data-testid="audio-clip-panel">
      <div className="flex items-center gap-2">
        <span className="font-label font-bold text-[#b87c32] text-[13px] tracking-wide">∼ AUDIO CLIP</span>
        <input
          defaultValue={clip.name}
          aria-label="Clip name"
          onBlur={(e) => set({ name: e.target.value })}
          className="bg-[#282016] text-[#ffc87a] border border-[#d69b50]/60 rounded px-1.5 py-0.5 w-48 font-mono outline-none"
        />
        <span className="text-ink/75 font-mono">
          {asset ? `${asset.name} · ${asset.buffer.duration.toFixed(2)} s · ${asset.buffer.sampleRate / 1000} kHz · ${asset.buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}` : 'audio not loaded'}
        </span>
        <div className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close clip editor" className="text-ink/60 hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      </div>
      {showWave && (
        <div className="relative h-20 rounded bg-black/70 border border-slate-800 overflow-hidden">
          <AudioClipWave clip={clip} width={Math.max(200, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 120)} height={80} color={track.color} bpm={audioEngine.bpm} spb={spb} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <NumField title="Clip gain (dB)" value={clip.gainDb ?? 0} min={-60} max={24} step={0.5} onChange={(v) => set({ gainDb: v })} suffix="dB gain" />
        <Btn onClick={normalize} title="Set the clip gain so its loudest peak sits at -0.3 dBFS">Normalize</Btn>
        <Btn onClick={normalizeRms} title="Normalize RMS energy to -18 dBFS target">Norm RMS</Btn>
        <Btn onClick={cleanDcOffset} title="Remove digital DC offset from source audio">Remove DC</Btn>
        <Btn onClick={() => void cleanNoise()} disabled={cleaning} title="Remove background noise with RNNoise (open source). Makes a new source; the original stays.">
          {cleaning ? 'Cleaning...' : 'Remove noise'}
        </Btn>
        <Btn
          on={!!clip.invertPhase}
          tone="yellow"
          onClick={() => set({ invertPhase: !clip.invertPhase })}
          title="Invert audio polarity (180° phase flip)"
        >
          Ø Invert
        </Btn>
        <div className="flex items-center gap-1">
          <span className="text-ink/60">Fade:</span>
          <select
            value={clip.fadeCurve ?? 'linear'}
            aria-label="Fade curve"
            onChange={(e) => set({ fadeCurve: e.target.value as any })}
            className="bg-[#282016] text-[#ffc87a] border border-[#d69b50]/60 rounded px-1.5 py-0.5 text-[11px] outline-none"
          >
            <option value="linear">Linear</option>
            <option value="equal_power">Equal Power (-3dB)</option>
            <option value="equal_gain">Equal Gain (-6dB)</option>
            <option value="s_curve">S-Curve</option>
          </select>
        </div>
        <NumField title="Fade in (seconds)" value={clip.fadeIn ?? 0} min={0} max={60} step={0.01} onChange={(v) => set({ fadeIn: v })} suffix="s fade in" />
        <NumField title="Fade out (seconds)" value={clip.fadeOut ?? 0} min={0} max={60} step={0.01} onChange={(v) => set({ fadeOut: v })} suffix="s fade out" />
        <NumField title="Transpose (semitones, varispeed)" value={clip.pitch ?? 0} min={-24} max={24} step={1} onChange={(v) => set({ pitch: v })} suffix="st" />
        <NumField title="Start position of the source region" value={clip.audioOffset ?? 0} min={0} max={maxSourceOffset} step={0.01} onChange={(v) => set({ audioOffset: v })} suffix="s source start" />
        <Btn on={!!clip.reverse} onClick={() => set({ reverse: !clip.reverse })} title="Play the clip backwards">Reverse</Btn>
        <Btn onClick={detectTempo} title="Analyze transient spacing for a source tempo estimate">Detect BPM</Btn>
        {asset?.detectedBpm && <span className="text-violet-300">Estimate {asset.detectedBpm} BPM</span>}
        <Btn onClick={() => void detectKeyOfClip()} title="Find the key of this clip from its harmony (Krumhansl-Kessler key profiles)">Detect key</Btn>
        {asset?.key && <span className="text-violet-300">Key {asset.key}</span>}
        {keyFound && <Btn onClick={useProjectKey} title="Set the piano roll's key and scale to this clip's key">Use as project key</Btn>}
        <Btn
          on={clip.warp === 'repitch'}
          tone="cyan"
          onClick={() => set({ warp: clip.warp === 'repitch' ? 'off' : 'repitch', sourceBpm: clip.sourceBpm ?? asset?.sourceBpm ?? audioEngine.bpm })}
          title="Follow the project tempo (speed and pitch change together, like a turntable)"
        >
          Follow tempo
        </Btn>
        <NumField title="Tempo the audio was recorded at" value={clip.sourceBpm ?? asset?.sourceBpm ?? 0} min={0} max={300} step={0.1} onChange={(v) => set({ sourceBpm: v })} suffix="source BPM" />
        <Btn on={!!clip.loopAudio} onClick={() => set({ loopAudio: !clip.loopAudio, loopSec: clip.loopSec ?? clip.lengthBars * secPerBar(audioEngine.bpm, spb) * audioClipRate(clip, audioEngine.bpm) })} title="Repeat the audio region across the clip">
          Loop
        </Btn>
        {clip.loopAudio && <NumField title="Loop length (seconds of audio)" value={Math.round((clip.loopSec ?? 0) * 1000) / 1000} min={0.01} step={0.01} onChange={(v) => set({ loopSec: v })} suffix="s loop" />}
        <Btn onClick={() => asset && seq.fitAudioClip(track.id, clip.id, asset.buffer.duration)} title="Make the clip end where the audio ends">Fit length</Btn>
        <Btn disabled={!asset || !!clip.reverse || !!clip.loopAudio} onClick={sliceTransients} title="Detect attacks in the audio and split the clip at the 16th-note line nearest to each one (cuts land on the grid, not exactly on the attack)">Slice at attacks</Btn>
      </div>
      {tempoMessage && <div className="text-violet-300" role="status">{tempoMessage}</div>}
      {keyMessage && <div className="text-violet-300" role="status">{keyMessage}</div>}
      {sliceMessage && <div className="text-emerald-300" role="status">{sliceMessage}</div>}
      {cleanMessage && <div className="text-sky-300" role="status">{cleanMessage}</div>}
      {clip.takes && clip.takes.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-2" data-testid="audio-take-comp">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-300 font-black">TAKE LANES</span>
            <span className="text-slate-500">Select a take and set a range; the highlighted waveform region is what gets comped into the arrangement.</span>
          </div>
          <div className="grid gap-1.5">
            {clip.takes.map((take) => {
              const preview = { ...clip, audioId: take.audioId, name: take.name };
              return (
                <div key={take.id} className={`flex items-center gap-2 rounded border px-2 py-1 ${selectedTakeId === take.audioId ? 'border-emerald-500/70 bg-emerald-950/20' : 'border-slate-800 bg-black/20'}`}>
                  <button type="button" aria-pressed={selectedTakeId === take.audioId} onClick={() => setSelectedTakeId(take.audioId)} className="w-24 truncate text-left text-[11px] font-bold text-slate-200" title={`Select ${take.name} for comping`}>{take.name}</button>
                  <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded bg-black/50" aria-label={`${take.name} waveform with selected comp range`}>
                    <AudioClipWave clip={preview} width={720} height={28} color={selectedTakeId === take.audioId ? '#34d399' : '#64748b'} bpm={audioEngine.bpm} spb={spb} />
                    <span
                      className="pointer-events-none absolute inset-y-0 border-x border-amber-200/90 bg-amber-300/20"
                      style={{
                        left: `${(Math.max(0, Math.min(clip.lengthBars, Math.min(compStart, compEnd))) / Math.max(clip.lengthBars, 1e-6)) * 100}%`,
                        width: `${(Math.max(0, Math.min(clip.lengthBars, Math.max(compStart, compEnd))) - Math.max(0, Math.min(clip.lengthBars, Math.min(compStart, compEnd)))) / Math.max(clip.lengthBars, 1e-6) * 100}%`,
                      }}
                    />
                  </div>
                  <Btn on={take.audioId === clip.audioId} tone="green" onClick={() => { setSelectedTakeId(take.audioId); set({ audioId: take.audioId }); }} title="Use this take for the entire selected clip">Use whole take</Btn>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumField title="Start in bars relative to the current clip" value={compStart} min={0} max={clip.lengthBars} step={1 / spb} onChange={setCompStart} suffix="bar start" />
            <NumField title="End in bars relative to the current clip" value={compEnd} min={0} max={clip.lengthBars} step={1 / spb} onChange={setCompEnd} suffix="bar end" />
            <Btn tone="green" onClick={useTakeRange} title="Split at the range edges and use the selected take for that section">Comp selected range</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
