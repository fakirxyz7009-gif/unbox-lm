/**
 * MusicSeparator.ts — the separator that needs no trained model.
 *
 * The split itself is spectralSeparator.ts (held notes against drum hits, stereo position, lows),
 * run in a worker. It is signal processing: the stems bleed more than the trained model's, and the
 * "vocals" stem is whatever held sound sits in the centre of the mix (usually the lead vocal). The
 * stems add up to the source exactly.
 *
 * Runs 100% locally. It derives stems from the supplied source; it never creates replacement
 * performances, new audio content, or a synthetic source track.
 */
import { sharedAudioContext } from '../AudioEngineGraph.ts';
import { audioStore, computePeaks, type AudioAsset } from '../clips/audioStore.ts';
import { encodeWav } from '../export/wav.ts';
import type { AudioEngine } from '../AudioEngine.ts';
import { derivedAudioProvenance, type AudioProvenance } from '../../../shared/audio/provenance.ts';
import { SPECTRAL_STEMS, separateSpectral, type StemChannels, type StemSplitMode } from './spectralSeparator.ts';

export type { StemSplitMode };

export interface SeparatedStem {
  id: string;
  label: string;
  color: string;
  iconType: 'mic' | 'guitar' | 'drum' | 'keys' | 'ambient';
  buffer: AudioBuffer;
  peaks: Float32Array;
  duration: number;
  durationFormatted: string;
  volume: number; // 0.0 to 1.5 (default 1.0)
  muted: boolean;
  solo?: boolean;
  sourceNode?: AudioBufferSourceNode;
  gainNode?: GainNode;
}

export interface SeparationProgress {
  stage: string;
  percent: number;
  timeRemainingSec: number;
}

export interface StemDefinition {
  id: string;
  label: string;
  color: string;
  iconType: 'mic' | 'guitar' | 'drum' | 'keys' | 'ambient';
}

/** What each stem of the spectral separator is, named for what the signal processing can tell apart. */
const STEM_LOOK: Record<string, Omit<StemDefinition, 'id'>> = {
  vocals: { label: 'Vocals / centre lead', color: '#f43f5e', iconType: 'mic' },
  backing: { label: 'Near-centre layer', color: '#fb7185', iconType: 'mic' },
  drums: { label: 'Drums & percussion', color: '#0ea5e9', iconType: 'drum' },
  kick: { label: 'Kick & low drums', color: '#38bdf8', iconType: 'drum' },
  snare: { label: 'Snare & mid drums', color: '#0ea5e9', iconType: 'drum' },
  hat: { label: 'Hats & cymbals', color: '#0284c7', iconType: 'drum' },
  bass: { label: 'Bass', color: '#10b981', iconType: 'guitar' },
  wide: { label: 'Wide & out of phase', color: '#06b6d4', iconType: 'ambient' },
  other: { label: 'Other instruments', color: '#f59e0b', iconType: 'keys' },
};

const definitionsOf = (mode: StemSplitMode): StemDefinition[] => SPECTRAL_STEMS[mode].map((id) => ({ id, ...STEM_LOOK[id] }));

export const STEM_MODE_CONFIGS: Record<StemSplitMode, StemDefinition[]> = {
  '4stem': definitionsOf('4stem'),
  '6stem': definitionsOf('6stem'),
  '8stem': definitionsOf('8stem'),
};

/** The split in a worker (the page keeps running); on this thread only where no worker can start. */
function runSeparation(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  mode: StemSplitMode,
  onProgress: (done: number) => void
): Promise<Record<string, StemChannels>> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./separatorWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(separateSpectral(left, right, sampleRate, mode, onProgress));
  }
  return new Promise((resolve, reject) => {
    const finish = (run: () => void) => {
      worker.terminate();
      run();
    };
    worker.onmessage = (event: MessageEvent<{ progress?: number; stems?: Record<string, StemChannels>; error?: string }>) => {
      const { progress, stems, error } = event.data;
      if (typeof progress === 'number') onProgress(progress);
      else if (stems) finish(() => resolve(stems));
      else finish(() => reject(new Error(error || 'The separator stopped.')));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'The separator stopped.')));
    worker.postMessage({ id: 1, left, right, sampleRate, mode }, [left.buffer as ArrayBuffer, right.buffer as ArrayBuffer]);
  });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class MusicSeparatorEngine {
  private ctx: AudioContext;

  constructor() {
    this.ctx = sharedAudioContext;
  }

  /**
   * Decodes an audio file into an AudioBuffer
   */
  async decodeFile(file: File | Blob): Promise<AudioBuffer> {
    const data = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(data);
  }

  /**
   * Splits the supplied mix into 4, 6 or 8 derived stems (spectralSeparator.ts). Their sum is the source.
   */
  async separate(
    sourceBuffer: AudioBuffer,
    modeOrProgress?: StemSplitMode | ((progress: SeparationProgress) => void),
    onProgress?: (progress: SeparationProgress) => void
  ): Promise<Record<string, SeparatedStem>> {
    let mode: StemSplitMode = '4stem';
    let progressCb: ((progress: SeparationProgress) => void) | undefined = onProgress;

    if (typeof modeOrProgress === 'string') {
      mode = modeOrProgress;
    } else if (typeof modeOrProgress === 'function') {
      progressCb = modeOrProgress;
    }

    const sampleRate = sourceBuffer.sampleRate;
    const length = sourceBuffer.length;
    const duration = sourceBuffer.duration;
    const durFmt = formatDuration(duration);

    if (!STEM_MODE_CONFIGS[mode]) mode = '4stem';
    const definitions = STEM_MODE_CONFIGS[mode];
    progressCb?.({ stage: `Analysing the audio for ${definitions.length} stems…`, percent: 0, timeRemainingSec: 0 });

    // copies: the worker takes its buffers, and the source asset must keep its own
    const srcL = sourceBuffer.getChannelData(0).slice();
    const srcR = sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1).slice() : srcL.slice();
    const startMs = performance.now();
    const split = await runSeparation(srcL, srcR, sampleRate, mode, (done) => {
      const elapsed = (performance.now() - startMs) / 1000;
      progressCb?.({
        stage: `Separating ${definitions.length} stems (${Math.round(done * 100)}%)…`,
        percent: Math.min(99, Math.max(1, Math.round(done * 100))),
        timeRemainingSec: done > 0 ? Math.max(0, Math.ceil((elapsed * (1 - done)) / done)) : 0,
      });
    });

    const result: Record<string, SeparatedStem> = {};
    for (const def of definitions) {
      const buf = this.ctx.createBuffer(2, length, sampleRate);
      buf.getChannelData(0).set(split[def.id].L);
      buf.getChannelData(1).set(split[def.id].R);
      result[def.id] = {
        id: def.id,
        label: def.label,
        color: def.color,
        iconType: def.iconType,
        buffer: buf,
        peaks: computePeaks(buf),
        duration,
        durationFormatted: durFmt,
        volume: 1.0,
        muted: false,
      };
    }

    progressCb?.({ stage: 'Separation complete', percent: 100, timeRemainingSec: 0 });
    return result;
  }

  /**
   * Converts a separated stem into a downloadable .wav Blob
   */
  encodeStemToWav(stem: SeparatedStem): Blob {
    const channels = Array.from({ length: stem.buffer.numberOfChannels }, (_, c) => stem.buffer.getChannelData(c));
    return encodeWav(channels, stem.buffer.sampleRate, { bitDepth: 16 });
  }

  /**
   * "Transfer to Samples":
   * Saves the separated stem as an individual audio file into audioStore & User Samples library
   */
  async transferToSamples(
    stem: SeparatedStem,
    songTitle = 'Separated',
    sourceProvenance?: AudioProvenance,
  ): Promise<{ asset: AudioAsset; blob: Blob }> {
    const filename = `${songTitle}_${stem.label.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const blob = this.encodeStemToWav(stem);
    const asset = audioStore.add(filename, stem.buffer, {
      provenance: derivedAudioProvenance(sourceProvenance, `Source separation stem: ${stem.label}`),
    });
    return { asset, blob };
  }

  /**
   * "Transfer to Rack":
   * Automatically adds a dedicated audio track and routing into the modular rack
   */
  transferToRack(
    audioEngine: AudioEngine,
    stem: SeparatedStem,
    songTitle = 'Separated',
    sourceProvenance?: AudioProvenance,
  ): string {
    const trackName = `${songTitle.slice(0, 16)} · ${stem.label}`;
    const track = audioEngine.createAudioTrack(trackName);
    track.color = stem.color;

    // Create audio clip on track at Bar 1
    const asset = audioStore.add(`${trackName}_Stem`, stem.buffer, {
      provenance: derivedAudioProvenance(sourceProvenance, `Source separation stem: ${stem.label}`),
    });
    audioEngine.addAudioClip(asset.id, 0, track.id);
    audioEngine.mixer.setVolume(track.deviceId, stem.volume);

    audioEngine.commitEdit();
    return track.id;
  }

  /**
   * Transfer all stems to individual rack tracks in one call
   */
  transferAllToRack(
    audioEngine: AudioEngine,
    stems: SeparatedStem[],
    songTitle = 'Separated',
    sourceProvenance?: AudioProvenance,
  ): string[] {
    const trackIds: string[] = [];
    for (const stem of stems) {
      const trackName = `${songTitle.slice(0, 16)} · ${stem.label}`;
      const track = audioEngine.createAudioTrack(trackName);
      track.color = stem.color;
      const asset = audioStore.add(`${trackName}_Stem`, stem.buffer, {
        provenance: derivedAudioProvenance(sourceProvenance, `Source separation stem: ${stem.label}`),
      });
      audioEngine.addAudioClip(asset.id, 0, track.id);
      audioEngine.mixer.setVolume(track.deviceId, stem.volume);
      trackIds.push(track.id);
    }
    audioEngine.commitEdit();
    return trackIds;
  }
}

export const musicSeparator = new MusicSeparatorEngine();
