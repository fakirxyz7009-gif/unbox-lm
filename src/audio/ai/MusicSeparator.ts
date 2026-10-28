/**
 * MusicSeparator.ts — four-band spectral split (EXPERIMENTAL, not a separation model).
 *
 * This is a classic DSP split, not a trained demixer: a low-pass bass estimate, a transient
 * estimate for percussion, a centre mid-band estimate for "vocals", and an exact residual bus.
 * Unity-gain recombination preserves the original mix, but the estimates have heavy source bleed.
 * The UI must not present these as isolated stems.
 *
 * Provides:
 * - Audio file decoding
 * - Deterministic band split with progress
 * - Pre-computed waveform peaks for visual rendering
 * - Volume rebalancing (individual stem gain 0% to 150%)
 * - WAV encoding for "Save as sample"
 * - Direct integration with audioEngine.tracks & audioStore for "Transfer to Rack"
 */
import { sharedAudioContext } from '../AudioEngineGraph.ts';
import { audioStore, computePeaks, type AudioAsset } from '../clips/audioStore.ts';
import { encodeWav } from '../export/wav.ts';
import type { AudioEngine } from '../AudioEngine.ts';
import { createFourBandSplitState, processFourBandSplitChunk } from './musicSeparatorDsp.ts';

export interface SeparatedStem {
  id: 'vocals' | 'bass' | 'drums' | 'other';
  label: string;
  color: string;
  iconType: 'mic' | 'guitar' | 'drum' | 'keys';
  buffer: AudioBuffer;
  peaks: Float32Array;
  duration: number;
  durationFormatted: string;
  volume: number; // 0.0 to 1.5 (default 1.0)
  muted: boolean;
  sourceNode?: AudioBufferSourceNode;
  gainNode?: GainNode;
}

export interface SeparationProgress {
  stage: string;
  percent: number;
  timeRemainingSec: number;
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
   * Splits a stereo mix into four rough bands (see the file header). Honest progress: the
   * percentage tracks the samples actually processed, and there is no artificial delay.
   */
  async separate(
    sourceBuffer: AudioBuffer,
    onProgress?: (progress: SeparationProgress) => void
  ): Promise<Record<'vocals' | 'bass' | 'drums' | 'other', SeparatedStem>> {
    const sampleRate = sourceBuffer.sampleRate;
    const length = sourceBuffer.length;
    const duration = sourceBuffer.duration;
    const durFmt = formatDuration(duration);

    onProgress?.({ stage: 'Splitting bands (experimental)…', percent: 0, timeRemainingSec: 0 });

    // 1. Prepare 4 AudioBuffers
    const vocBuf = this.ctx.createBuffer(2, length, sampleRate);
    const basBuf = this.ctx.createBuffer(2, length, sampleRate);
    const drmBuf = this.ctx.createBuffer(2, length, sampleRate);
    const othBuf = this.ctx.createBuffer(2, length, sampleRate);

    const srcL = sourceBuffer.getChannelData(0);
    const srcR = sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : srcL;

    const vocL = vocBuf.getChannelData(0);
    const vocR = vocBuf.getChannelData(1);
    const basL = basBuf.getChannelData(0);
    const basR = basBuf.getChannelData(1);
    const drmL = drmBuf.getChannelData(0);
    const drmR = drmBuf.getChannelData(1);
    const othL = othBuf.getChannelData(0);
    const othR = othBuf.getChannelData(1);

    const CHUNK_SIZE = 65536;
    const splitState = createFourBandSplitState();
    const splitChannels = { vocalsL: vocL, vocalsR: vocR, bassL: basL, bassR: basR, drumsL: drmL, drumsR: drmR, otherL: othL, otherR: othR };
    const startMs = performance.now();
    for (let offset = 0; offset < length; offset += CHUNK_SIZE) {
      const end = Math.min(length, offset + CHUNK_SIZE);
      processFourBandSplitChunk(srcL, srcR, sampleRate, splitChannels, splitState, offset, end);

      // Yield each chunk so large imports remain responsive and progress reflects processed audio.
      if (end < length) {
        const done = end / length;
        const elapsed = (performance.now() - startMs) / 1000;
        onProgress?.({
          stage: 'Splitting bands (experimental)…',
          percent: Math.min(99, Math.max(1, Math.round(done * 100))),
          timeRemainingSec: done > 0 ? Math.max(0, Math.ceil(elapsed * (1 - done) / done)) : 0,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const result: Record<'vocals' | 'bass' | 'drums' | 'other', SeparatedStem> = {
      vocals: {
        id: 'vocals',
        label: 'Center mid (vocal estimate)',
        color: '#f43f5e', // Vibrant Pink
        iconType: 'mic',
        buffer: vocBuf,
        peaks: computePeaks(vocBuf),
        duration,
        durationFormatted: durFmt,
        volume: 1.0,
        muted: false,
      },
      bass: {
        id: 'bass',
        label: 'Low band (bass estimate)',
        color: '#10b981', // Neon Emerald Green
        iconType: 'guitar',
        buffer: basBuf,
        peaks: computePeaks(basBuf),
        duration,
        durationFormatted: durFmt,
        volume: 1.0,
        muted: false,
      },
      drums: {
        id: 'drums',
        label: 'Transients (drum estimate)',
        color: '#0ea5e9', // Cyber Blue
        iconType: 'drum',
        buffer: drmBuf,
        peaks: computePeaks(drmBuf),
        duration,
        durationFormatted: durFmt,
        volume: 1.0,
        muted: false,
      },
      other: {
        id: 'other',
        label: 'Residual (other)',
        color: '#f59e0b', // Warm Amber Gold
        iconType: 'keys',
        buffer: othBuf,
        peaks: computePeaks(othBuf),
        duration,
        durationFormatted: durFmt,
        volume: 1.0,
        muted: false,
      },
    };
    onProgress?.({ stage: 'Split ready', percent: 100, timeRemainingSec: 0 });
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
}

export const musicSeparator = new MusicSeparatorEngine();
