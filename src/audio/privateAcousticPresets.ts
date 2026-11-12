/**
 * Personal-build recorded packs. These are project-local Custom packs, never a
 * raw stem-directory endpoint: their audio remains subject to the pack's own
 * provenance and is removed by the share-build pruner.
 */
import type { SoundFontPresetBank } from './SoundFontEngine.ts';

const TUMBI_URLS = ['/instruments/tumbi-folk/samples/0000.ogg'];
const SOURCES: {
  presetId: string;
  name: string;
  program: number;
  category: SoundFontPresetBank['category'];
  zoneId: string;
  fileName: string;
  urls: string[];
  oneShot: boolean;
  loop?: [number, number];
}[] = [
  {
    presetId: 'dhol', name: 'Private Recorded Dholak (local only)', program: 117, category: 'indian_classical',
    zoneId: 'dholak_real_acoustic', fileName: 'dholak_hit.wav', oneShot: true,
    urls: ['/instruments/dholak-folk/samples/0000.ogg'],
  },
  {
    presetId: 'harmonium', name: 'Private Recorded Harmonium (local only)', program: 20, category: 'indian_classical',
    zoneId: 'harmonium_real_acoustic', fileName: 'harmonium_note.wav', oneShot: false, loop: [0.1, 1],
    urls: ['/instruments/chamkila-harmonium/samples/0000.ogg'],
  },
  {
    presetId: 'tumbi', name: 'Private Recorded Tumbi (local only)', program: 105, category: 'indian_classical',
    zoneId: 'tumbi_real_acoustic', fileName: 'tumbi_pluck.wav', oneShot: true, urls: TUMBI_URLS,
  },
  {
    presetId: 'vocal_chop', name: 'Private Recorded Vocal Chops (local only)', program: 54, category: 'vocals',
    zoneId: 'vocal_chop_real_acoustic', fileName: 'chamkila_vocal_chop.wav', oneShot: true,
    urls: ['/instruments/chamkila-vocal/samples/0000.ogg'],
  },
];

async function fetchBuffer(ctx: BaseAudioContext, urls: readonly string[]): Promise<AudioBuffer | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch { /* A personal source may be absent; the device keeps its local DSP model. */ }
  }
  return null;
}

export function loadPrivateTumbiBuffer(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  return fetchBuffer(ctx, TUMBI_URLS);
}

export async function loadPrivateAcousticPresets(ctx: BaseAudioContext, publish: (preset: SoundFontPresetBank) => void): Promise<void> {
  for (const source of SOURCES) {
    const buffer = await fetchBuffer(ctx, source.urls);
    if (!buffer) continue;
    publish({
      presetId: source.presetId,
      name: source.name,
      bank: 0,
      program: source.program,
      category: source.category,
      zones: [{
        id: source.zoneId, name: source.fileName,
        keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127,
        rootMidi: 60, fineTuneCents: 0, sampleRate: ctx.sampleRate || 48000,
        ...(source.loop ? { loopStart: source.loop[0], loopEnd: source.loop[1] } : {}),
        oneShot: source.oneShot, buffer,
      }],
    });
  }
}
