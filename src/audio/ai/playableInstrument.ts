/**
 * Turns an audio asset into instruments with piano-roll notes, chosen from what the clip holds:
 * - drums: a kit track with the hits;
 * - one pitched line: a sampler that plays the asset across the keys, its root the note the line sounds
 *   most, so the notes play back the recording;
 * - chords: a recorded piano track with the transcribed notes (a sampler would shift the whole chord on
 *   every key press).
 * A clip that is both percussion and pitch gets the kit and the piano track.
 */
import type { AudioEngine } from '../AudioEngine.ts';
import type { AudioAsset } from '../clips/audioStore.ts';
import type { ClipNote } from '../types.ts';
import { DEFAULT_KEY_SAMPLE, detectPitch, installSampleVoice, setKeySample } from '../deviceSamples.ts';
import { secondsToSteps } from '../../../shared/transcription/transcribe.ts';
import type { SourceKind } from '../../../shared/transcription/autoTranscribe.ts';
import { RECORDED_STEM_TARGETS } from '../../../shared/transcription/stemTargets.ts';
import { addNotesTrack, monoSamples, toClipNote, uniqueTrackName } from './stemNotes.ts';
import { transcribeInBackground } from './transcribeInBackground.ts';

export interface PlayableInstrumentResult {
  deviceId: string;
  /** The track's name, which is the instrument's name in the rack and on the piano roll. */
  instrumentName: string;
  /** What sounds the notes: the asset itself, or a recorded kit or piano. */
  sound: string;
  noteCount: number;
  /** The key a sampler's recording plays at its own pitch; null for a recorded instrument. */
  rootNote: number | null;
}

export interface AssetInstrumentsResult {
  kind: SourceKind;
  instruments: PlayableInstrumentResult[];
  tempo: number | null;
}

const PIANO = { deviceType: 'rec_meta_piano', sound: 'Meta Piano (transcribed notes)' } as const;
const SAMPLER_SOUND = 'Sampler (this audio)';

/** Adds the instruments an audio asset becomes, each with its notes on a new track (see the file comment). */
export async function createPlayableInstrumentFromAsset(
  engine: AudioEngine,
  asset: AudioAsset,
  customName?: string,
): Promise<AssetInstrumentsResult> {
  const base = (customName ?? asset.name.replace(/\.[^.]+$/, '')).slice(0, 34);
  const bpm = engine.bpm;
  const source = await transcribeInBackground('source', monoSamples(asset.buffer), asset.buffer.sampleRate);
  const instruments: PlayableInstrumentResult[] = [];
  const kit = RECORDED_STEM_TARGETS.drums;

  if (source.hits.length > 0) {
    const notes: ClipNote[] = source.hits.map((h) => ({
      step: secondsToSteps(h.time, bpm),
      note: kit.drumNotes[h.cls],
      velocity: h.velocity,
      length: 1,
    }));
    const trackName = uniqueTrackName(engine, `${base} · drums`.slice(0, 40));
    const deviceId = addNotesTrack(engine, kit.deviceType, trackName, notes);
    instruments.push({ deviceId, instrumentName: trackName, sound: kit.instrumentName, noteCount: notes.length, rootNote: null });
  }

  if (source.notes.length > 0) {
    const notes = source.notes.map((n) => toClipNote(bpm, n));
    const trackName = uniqueTrackName(engine, (source.hits.length > 0 ? `${base} · notes` : base).slice(0, 40));
    if (source.kind === 'pitched' && source.monophonic) {
      const root = source.rootNote ?? 60;
      const pitch = detectPitch(asset.buffer);
      const tune = pitch && pitch.note === root ? -pitch.cents : 0;
      const deviceId = addNotesTrack(engine, 'nnxt', trackName, notes, (device) => {
        setKeySample(device.id, {
          ...DEFAULT_KEY_SAMPLE,
          audioId: asset.id,
          root,
          tune,
          level: 1,
          loop: false,
          attack: 0.005,
          release: 0.1,
        });
        if ('noteOn' in device && typeof device.noteOn === 'function') installSampleVoice(device);
      });
      instruments.push({ deviceId, instrumentName: trackName, sound: SAMPLER_SOUND, noteCount: notes.length, rootNote: root });
    } else {
      const deviceId = addNotesTrack(engine, PIANO.deviceType, trackName, notes);
      instruments.push({ deviceId, instrumentName: trackName, sound: PIANO.sound, noteCount: notes.length, rootNote: null });
    }
  }

  return { kind: source.kind, instruments, tempo: source.tempo };
}
