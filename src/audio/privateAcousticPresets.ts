/** Personal-build audio sources; imported only when private content is enabled. */
import type { SoundFontPresetBank } from './SoundFontEngine.ts';

const TUMBI_URLS = ['/stems/daw_instruments/Playable_Patches/tumbi_pluck.wav', '/instruments/tumbi-folk/samples/0000.ogg'];
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
    presetId: 'dhol', name: 'Punjabi Dholak (Real Acoustic Stems)', program: 117, category: 'indian_classical',
    zoneId: 'dholak_real_acoustic', fileName: 'dholak_hit.wav', oneShot: true,
    urls: ['/stems/daw_instruments/Playable_Patches/dholak_hit.wav', '/instruments/dholak-folk/samples/0000.ogg'],
  },
  {
    presetId: 'harmonium', name: 'Chamkila Harmonium (Real Acoustic Stems)', program: 20, category: 'indian_classical',
    zoneId: 'harmonium_real_acoustic', fileName: 'harmonium_note.wav', oneShot: false, loop: [0.1, 1],
    urls: ['/stems/daw_instruments/Playable_Patches/harmonium_note.wav', '/instruments/chamkila-harmonium/samples/0000.ogg'],
  },
  {
    presetId: 'tumbi', name: 'Tumbi Folk Pluck (Real Acoustic Stems)', program: 105, category: 'indian_classical',
    zoneId: 'tumbi_real_acoustic', fileName: 'tumbi_pluck.wav', oneShot: true, urls: TUMBI_URLS,
  },
  {
    presetId: 'vocal_chop', name: 'Chamkila Vocal Chops (Real Stems)', program: 54, category: 'vocals',
    zoneId: 'vocal_chop_real_acoustic', fileName: 'chamkila_vocal_chop.wav', oneShot: true,
    urls: ['/stems/daw_instruments/Playable_Patches/chamkila_vocal_chop.wav', '/instruments/chamkila-vocal/samples/0000.ogg'],
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
