/**
 * One audition at a time for every browser source. Decoded audio (library samples, project audio)
 * plays through the monitor's click/audition input, so dim / mono / output device apply and it is
 * never exported; stem files stream through an audio element (a whole song stem is not decoded
 * just to listen to it).
 */
import { useSyncExternalStore } from 'react';
import { audioEngine } from '../audio/AudioEngine.ts';
import { stemLibrary } from '../audio/stemLibraryClient.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import type { PreviewRef } from './entries.ts';

let playingKey: string | null = null;
let stopCurrent: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

function finish(key: string): void {
  if (playingKey !== key) return;
  playingKey = null;
  stopCurrent = null;
  emit();
}

export function stopPreview(): void {
  const stop = stopCurrent;
  playingKey = null;
  stopCurrent = null;
  stop?.();
  emit();
}

function playBuffer(key: string, buffer: AudioBuffer): () => void {
  const ctx = audioEngine.ctx;
  if (ctx.state === 'suspended') void ctx.resume();
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.8;
  src.buffer = buffer;
  src.connect(gain).connect(audioEngine.monitor.clickInput);
  src.onended = () => {
    gain.disconnect();
    finish(key);
  };
  src.start();
  return () => {
    try {
      src.stop();
    } catch {
      // already ended
    }
  };
}

/** Starts the entry's preview, or stops it when it is the one playing. Errors reject. */
export async function togglePreview(key: string, ref: PreviewRef): Promise<void> {
  const same = playingKey === key;
  stopPreview();
  if (same) return;
  playingKey = key;
  emit();
  try {
    if (ref.kind === 'asset') stopCurrent = playBuffer(key, ref.asset.buffer);
    else if (ref.kind === 'library') {
      const buffer = await vstLibrary.decode(ref.id, audioEngine.ctx);
      if (playingKey !== key) return; // another preview started meanwhile
      stopCurrent = playBuffer(key, buffer);
    } else {
      const id = ref.item.previewId;
      if (!id) throw new Error('Nothing to preview');
      const el = new Audio(stemLibrary.fileUrl(id));
      el.volume = 0.8;
      el.onended = () => finish(key);
      stopCurrent = () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      };
      await el.play();
    }
  } catch (e) {
    if (playingKey === key) stopPreview();
    throw e;
  }
}

export function usePreviewKey(): string | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => playingKey,
    () => null,
  );
}
