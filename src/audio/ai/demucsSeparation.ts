/**
 * Optional trained, non-generative source separation with Deezer Spleeter and Demucs, run locally
 * on this computer (server/routes/separationRoutes.ts). The browser sends one selected-source WAV;
 * the server returns derived stems from the chosen model. A per-session explicit consent signal is
 * required in both the browser and loopback route; model output is never a verified recording.
 */
import type { AudioAsset } from '../clips/audioStore.ts';
import { encodeWav } from '../export/wav.ts';

export const DEMUCS_STEMS = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const;
export type DemucsStem = (typeof DEMUCS_STEMS)[number];

/** htdemucs and htdemucs_ft write four stems; htdemucs_6s also writes guitar and piano. htdemucs_ft is slower and cleaner. */
export type DemucsModel = 'htdemucs' | 'htdemucs_6s' | 'htdemucs_ft';

/** How each stem is named and drawn in the Source Separation panel. */
export const DEMUCS_STEM_INFO: Record<DemucsStem, { label: string; color: string; icon: string }> = {
  vocals: { label: 'Vocals', color: '#f43f5e', icon: 'mic' },
  drums: { label: 'Drums', color: '#0ea5e9', icon: 'drum' },
  bass: { label: 'Bass', color: '#10b981', icon: 'guitar' },
  other: { label: 'Other / Instruments', color: '#f59e0b', icon: 'keys' },
  guitar: { label: 'Guitar', color: '#a855f7', icon: 'guitar' },
  piano: { label: 'Piano', color: '#eab308', icon: 'keys' },
};

export interface DemucsStatus {
  available?: boolean;
  demucs: boolean;
  spleeter?: boolean;
  engine?: 'spleeter' | 'demucs' | 'none';
  models?: { id: DemucsModel; stems: DemucsStem[] }[];
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

/** The asset's audio as a 24-bit WAV to preserve full dynamic range without clipping. */
export function assetToWav(asset: AudioAsset): Blob {
  const { buffer } = asset;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return encodeWav(channels, buffer.sampleRate, { bitDepth: 24, dither: false });
}

/** Sends the audio to the separator and downloads each stem its model returned. */
export async function separateWithDemucs(
  wav: Blob,
  onStatus?: (text: string) => void,
  options: { engine?: 'spleeter' | 'demucs'; model?: DemucsModel; consent?: boolean } = {}
): Promise<Partial<Record<DemucsStem, Blob>>> {
  if (options.consent !== true) {
    throw new Error('Explicit consent is required before a trained Spleeter or Demucs model can process audio.');
  }
  onStatus?.('Sending source audio to the local Spleeter / Demucs separator…');
  const query = new URLSearchParams();
  query.set('consent', 'trained-model-separation');
  if (options.engine) query.set('engine', options.engine);
  if (options.model) query.set('model', options.model);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`/api/separate/jobs${suffix}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Separation failed (${res.status}).`);
  }
  const { id, stems: names } = (await res.json()) as { id: string; stems: DemucsStem[] };
  const stems: Partial<Record<DemucsStem, Blob>> = {};
  for (const stem of names) {
    onStatus?.(`Extracting ${DEMUCS_STEM_INFO[stem].label} stem…`);
    const part = await fetch(`/api/separate/jobs/${id}/${stem}`);
    if (!part.ok) throw new Error(`Could not download the ${stem} stem.`);
    stems[stem] = await part.blob();
  }
  return stems;
}
