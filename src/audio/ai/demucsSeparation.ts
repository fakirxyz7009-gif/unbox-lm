/**
 * Stem separation with the Demucs model, run on this computer (server/routes/separationRoutes.ts).
 * The browser sends one WAV, the server returns four stems (drums, bass, other, vocals) as WAV.
 * Unlike the four-band split in MusicSeparator.ts, these come from a trained model.
 */
import type { AudioAsset } from '../clips/audioStore.ts';
import { encodeWav } from '../export/wav.ts';

export const DEMUCS_STEMS = ['drums', 'bass', 'other', 'vocals'] as const;
export type DemucsStem = (typeof DEMUCS_STEMS)[number];

export interface DemucsStatus {
  demucs: boolean;
}

/** Null when the separation route is not on this server (the share build) or cannot be reached. */
export async function fetchDemucsStatus(): Promise<DemucsStatus | null> {
  try {
    const res = await fetch('/api/separate/status');
    if (!res.ok) return null;
    return (await res.json()) as DemucsStatus;
  } catch {
    return null;
  }
}

/** The asset's audio as a 16-bit WAV, the format the separator reads. */
export function assetToWav(asset: AudioAsset): Blob {
  const { buffer } = asset;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return encodeWav(channels, buffer.sampleRate, { bitDepth: 16, dither: false });
}

export async function separateWithDemucs(wav: Blob, onStatus?: (text: string) => void): Promise<Record<DemucsStem, Blob>> {
  onStatus?.('Sending the audio to the local model…');
  const res = await fetch('/api/separate/jobs', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Separation failed (${res.status}).`);
  }
  const { id } = (await res.json()) as { id: string };
  const stems = {} as Record<DemucsStem, Blob>;
  for (const stem of DEMUCS_STEMS) {
    onStatus?.(`Downloading the ${stem} stem…`);
    const part = await fetch(`/api/separate/jobs/${id}/${stem}`);
    if (!part.ok) throw new Error(`Could not download the ${stem} stem.`);
    stems[stem] = await part.blob();
  }
  return stems;
}
