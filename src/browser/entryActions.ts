/**
 * What every browser host can do with an audio entry (stem, library sample, project audio): make it
 * an instrument's sound — played across the keys from its root (see keySampleDefaults) — or put it
 * on an audio track at the playhead. Library audio is copied into the project's audio store under
 * a stable id, so loading the same sample twice reuses one copy.
 */
import { audioEngine } from '../audio/AudioEngine.ts';
import { audioStore, type AudioAsset } from '../audio/clips/audioStore.ts';
import { keySampleDefaults, setKeySample } from '../audio/deviceSamples.ts';
import { applyStemToDevice, noteName, stemLibrary } from '../audio/stemLibraryClient.ts';
import { vstLibrary } from '../vst/libraryClient.ts';
import type { BrowserEntry } from './entries.ts';
import { unknownAudioProvenance } from '../../shared/audio/provenance.ts';

const decoding = new Map<string, Promise<AudioAsset>>();

/** The entry's audio in the audio store (decoded once). */
export function entryAsset(entry: BrowserEntry): Promise<AudioAsset> {
  const ref = entry.ref;
  if (ref.kind === 'asset') return Promise.resolve(ref.asset);
  if (ref.kind === 'stem') {
    const fileId = ref.item.kind === 'audio' ? ref.item.id : ref.item.previewId;
    if (!fileId) return Promise.reject(new Error(`${ref.item.name} has no audio file`));
    return stemLibrary.asset(fileId, `${ref.item.name} · ${ref.item.song}`.slice(0, 80), ref.item);
  }
  if (ref.kind === 'library' && ref.item.kind === 'sample') {
    const id = `lib_${ref.item.id}`;
    const have = audioStore.get(id);
    if (have) return Promise.resolve(have);
    let p = decoding.get(id);
    if (!p) {
      const item = ref.item;
      p = (async () => {
        const buffer = await vstLibrary.decode(item.id, audioEngine.ctx);
        return audioStore.add(item.name, buffer, {
          id,
          provenance: unknownAudioProvenance({ source: `In-app library item: ${item.name}` }),
        });
      })().finally(() => decoding.delete(id));
      decoding.set(id, p);
    }
    return p;
  }
  return Promise.reject(new Error(`${entry.name} is not audio`));
}

/** Makes an audio entry the instrument's sound (its notes, channel and effects stay). Returns a message. */
export async function loadAsSound(entry: BrowserEntry, deviceId: string): Promise<string> {
  if (entry.ref.kind === 'stem') return applyStemToDevice(entry.ref.item, deviceId);
  const asset = await entryAsset(entry);
  const sample = { ...keySampleDefaults(asset.buffer), audioId: asset.id };
  setKeySample(deviceId, sample);
  audioEngine.changed();
  return `${entry.name}: root ${noteName(sample.root)}, ${sample.loop ? 'loop' : sample.mode === 'oneShot' ? 'one-shot' : 'gate'}`;
}

/** Puts an audio entry on an audio track at the playhead bar (a new track when none is chosen). */
export async function addToSong(entry: BrowserEntry, trackId?: string): Promise<string> {
  const asset = await entryAsset(entry);
  const bar = Math.floor(audioEngine.getPlayheadPosition() / audioEngine.stepsPerBar);
  const placed = audioEngine.addAudioClip(asset.id, bar, trackId);
  if (!placed) throw new Error(`Could not place ${entry.name}`);
  return `${entry.name} is on an audio track at bar ${bar + 1}`;
}
