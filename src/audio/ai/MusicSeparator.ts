/**
 * MusicSeparator.ts — Local source-separation DSP engine.
 *
 * Employs multi-band 4th-order Linkwitz-Riley crossovers, Mid-Side stereophonic
 * center extraction, fast-attack/slow-decay transient onset differentiation,
 * and adaptive Wiener power masking to isolate 4, 6, or 8 discrete stems with
 * maximum precision, surgical isolation, and exact unity-gain reconstruction.
 *
 * Runs 100% locally. It derives stems from the supplied source; it never creates replacement
 * performances, new audio content, or a synthetic source track.
 */
import { sharedAudioContext } from '../AudioEngineGraph.ts';
import { audioStore, computePeaks, type AudioAsset } from '../clips/audioStore.ts';
import { encodeWav } from '../export/wav.ts';
import type { AudioEngine } from '../AudioEngine.ts';
import {
  type StemSplitMode,
  type MultiStemBuffers,
  createPrecisionSplitState,
  processPrecisionSplitChunk,
} from './musicSeparatorDsp.ts';

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

export const STEM_MODE_CONFIGS: Record<StemSplitMode, StemDefinition[]> = {
  '4stem': [
    { id: 'vocals', label: 'Vocals (Center Mid)', color: '#f43f5e', iconType: 'mic' },
    { id: 'drums', label: 'Drums & Percussion', color: '#0ea5e9', iconType: 'drum' },
    { id: 'bass', label: 'Bassline & Lows', color: '#10b981', iconType: 'guitar' },
    { id: 'other', label: 'Instruments & Other', color: '#f59e0b', iconType: 'keys' },
  ],
  '6stem': [
    { id: 'vocals', label: 'Lead Vocals', color: '#f43f5e', iconType: 'mic' },
    { id: 'drums', label: 'Drums & Percussion', color: '#0ea5e9', iconType: 'drum' },
    { id: 'bass', label: 'Bass & Sub', color: '#10b981', iconType: 'guitar' },
    { id: 'guitars', label: 'Guitars & Strings', color: '#ec4899', iconType: 'guitar' },
    { id: 'keys', label: 'Keys & Synths', color: '#8b5cf6', iconType: 'keys' },
    { id: 'ambient', label: 'Ambient Space & FX', color: '#06b6d4', iconType: 'ambient' },
  ],
  '8stem': [
    { id: 'vocal_lead', label: 'Lead Vocals', color: '#f43f5e', iconType: 'mic' },
    { id: 'vocal_back', label: 'Backing Vocals', color: '#fb7185', iconType: 'mic' },
    { id: 'kick', label: 'Kick Drum & Sub', color: '#38bdf8', iconType: 'drum' },
    { id: 'snare', label: 'Snare & Claps', color: '#0ea5e9', iconType: 'drum' },
    { id: 'hihat', label: 'Hi-Hats & Cymbals', color: '#0284c7', iconType: 'drum' },
    { id: 'bass', label: 'Bassline & 808', color: '#10b981', iconType: 'guitar' },
    { id: 'instruments', label: 'Guitars / Keys / Leads', color: '#a855f7', iconType: 'keys' },
    { id: 'ambient', label: 'Reverb Wash & FX', color: '#06b6d4', iconType: 'ambient' },
  ],
};

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
   * Splits the supplied stereo mix into 4, 6, or 8 derived stems with local DSP.
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

    const definitions = STEM_MODE_CONFIGS[mode] || STEM_MODE_CONFIGS['4stem'];
    progressCb?.({ stage: `Analyzing source audio & preparing ${definitions.length} derived stems…`, percent: 0, timeRemainingSec: 0 });

    const stemBuffers: MultiStemBuffers = {};
    const audioBuffers: Record<string, AudioBuffer> = {};

    for (const def of definitions) {
      const buf = this.ctx.createBuffer(2, length, sampleRate);
      audioBuffers[def.id] = buf;
      stemBuffers[def.id] = {
        L: buf.getChannelData(0),
        R: buf.getChannelData(1),
      };
    }

    const srcL = sourceBuffer.getChannelData(0);
    const srcR = sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : srcL;

    const CHUNK_SIZE = 65536;
    const splitState = createPrecisionSplitState();
    const startMs = performance.now();

    for (let offset = 0; offset < length; offset += CHUNK_SIZE) {
      const end = Math.min(length, offset + CHUNK_SIZE);
      processPrecisionSplitChunk(srcL, srcR, sampleRate, mode, stemBuffers, splitState, offset, end);

      if (end < length) {
        const done = end / length;
        const elapsed = (performance.now() - startMs) / 1000;
        progressCb?.({
          stage: `Precision separation: ${definitions.length} stems (${Math.round(done * 100)}%)…`,
          percent: Math.min(99, Math.max(1, Math.round(done * 100))),
          timeRemainingSec: done > 0 ? Math.max(0, Math.ceil(elapsed * (1 - done) / done)) : 0,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const result: Record<string, SeparatedStem> = {};
    for (const def of definitions) {
      const buf = audioBuffers[def.id];
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
    songTitle = 'Separated'
  ): Promise<{ asset: AudioAsset; blob: Blob }> {
    const filename = `${songTitle}_${stem.label.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const blob = this.encodeStemToWav(stem);
    const asset = audioStore.add(filename, stem.buffer);
    return { asset, blob };
  }

  /**
   * "Transfer to Rack":
   * Automatically adds a dedicated audio track and routing into the modular rack
   */
  transferToRack(
    audioEngine: AudioEngine,
    stem: SeparatedStem,
    songTitle = 'Separated'
  ): string {
    const trackName = `${songTitle.slice(0, 16)} · ${stem.label}`;
    const track = audioEngine.createAudioTrack(trackName);
    track.color = stem.color;

    // Create audio clip on track at Bar 1
    const asset = audioStore.add(`${trackName}_Stem`, stem.buffer);
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
    songTitle = 'Separated'
  ): string[] {
    const trackIds: string[] = [];
    for (const stem of stems) {
      const trackName = `${songTitle.slice(0, 16)} · ${stem.label}`;
      const track = audioEngine.createAudioTrack(trackName);
      track.color = stem.color;
      const asset = audioStore.add(`${trackName}_Stem`, stem.buffer);
      audioEngine.addAudioClip(asset.id, 0, track.id);
      audioEngine.mixer.setVolume(track.deviceId, stem.volume);
      trackIds.push(track.id);
    }
    audioEngine.commitEdit();
    return trackIds;
  }
}

export const musicSeparator = new MusicSeparatorEngine();
