import type { AudioEngine } from '../AudioEngine.ts';
import { audioStore } from '../clips/audioStore.ts';
import { barsForSeconds } from '../clips/clipMath.ts';
import { installSampleVoice, setPadSample } from '../deviceSamples.ts';
import { audioPeak } from './renderDeviceNote.ts';
import { renderSong } from './renderSong.ts';
import { derivedAudioProvenance } from '../../../shared/audio/provenance.ts';

export type TrackAudioAction = 'split' | 'chop16' | 'chop8' | 'chop4' | 'chopToKeys';
export interface TrackAudioResult { trackId: string; clipId?: string; samplerDeviceId?: string; }

/** Audio edits use the actual track render and retain the track ID returned by audio-clip creation. */
export async function applyTrackAudioAction(engine: AudioEngine, trackId: string, action: TrackAudioAction): Promise<TrackAudioResult> {
  const source = engine.tracks.find((track) => track.id === trackId);
  if (!source || engine.recorder.busy) throw new Error('Choose a track after the current recording take has finished.');
  const existing = source.arrangementClips?.find((clip) => clip.kind === 'audio');
  const sourceProvenance = existing?.audioId ? audioStore.get(existing.audioId)?.provenance : undefined;
  let rendered: AudioBuffer | null = null;
  if (!existing || action === 'chopToKeys') {
    const startPos = existing ? Math.floor(existing.startBar * engine.stepsPerBar) : 0;
    const endPos = existing ? Math.ceil((existing.startBar + existing.lengthBars) * engine.stepsPerBar) : engine.renderLength16ths();
    rendered = await renderSong(engine, {
      startPos, endPos, sampleRate: engine.ctx.sampleRate,
      tailSec: action === 'chopToKeys' ? 0 : 0.4,
      onlyChannels: new Set([engine.mixer.ownerOf(source.deviceId)]),
      stemMode: 'wet', masterProcessing: false,
    });
    if (audioPeak(rendered) <= 1e-7) throw new Error('This track has no audible notes or clips to render.');
    if (engine.tracks.find((track) => track.id === trackId) !== source) throw new Error('The track changed while its audio was rendering.');
    if (engine.recorder.busy) throw new Error('Wait for the current recording take to finish before editing audio.');
  }

  const splitAt = action === 'split'
    ? engine.isPlaying ? engine.songPosition / engine.stepsPerBar
      : (existing?.startBar ?? 0) + (existing?.lengthBars ?? barsForSeconds(rendered!.duration, engine.bpm, engine.stepsPerBar)) / 2
    : null;
  if (splitAt !== null) {
    const start = existing?.startBar ?? 0;
    const length = existing?.lengthBars ?? barsForSeconds(rendered!.duration, engine.bpm, engine.stepsPerBar);
    if (splitAt <= start || splitAt >= start + length) throw new Error('The split position must be inside the audio clip.');
  }

  return engine.runStructuralEdit('Edit track audio', () => {
    if (action === 'chopToKeys') {
      if (!rendered) throw new Error('The track render is unavailable.');
      const asset = audioStore.add(`${source.name} Slices`, rendered, {
        provenance: derivedAudioProvenance(sourceProvenance, `Rendered slices of ${source.name}`, 'app-render'),
      });
      const sampler = engine.createDevice('nnxt', `${source.name} Audio Slices`);
      const samplerTrack = engine.tracks.find((track) => track.deviceId === sampler.id);
      if (!samplerTrack) throw new Error('The slice sampler did not create a track.');
      const span = rendered.duration / 16;
      for (let i = 0; i < 16; i++) {
        setPadSample(sampler.id, 60 + i, {
          audioId: asset.id, level: 1, offset: i * span, duration: span,
          pitch: 0, tune: 0, reverse: false, loop: false, attack: 0.002, release: 0.01,
        });
      }
      installSampleVoice(sampler);
      engine.changed();
      return { trackId: samplerTrack.id, samplerDeviceId: sampler.id };
    }

    let targetTrack = source;
    let clip = existing;
    if (!clip) {
      if (!rendered) throw new Error('The track render is unavailable.');
      const asset = audioStore.add(`${source.name} Audio`, rendered, {
        provenance: derivedAudioProvenance(sourceProvenance, `Rendered audio of ${source.name}`, 'app-render'),
      });
      const ref = engine.addAudioClip(asset.id, 0);
      const createdTrack = ref && engine.tracks.find((track) => track.id === ref.trackId);
      const createdClip = createdTrack?.arrangementClips?.find((candidate) => candidate.id === ref?.clipId);
      if (!createdTrack || !createdClip) throw new Error('The rendered audio could not be placed on a track.');
      targetTrack = createdTrack;
      clip = createdClip;
    }
    if (action === 'split') {
      const parts = engine.sequencer.splitClip(targetTrack.id, clip.id, splitAt!);
      if (!parts) throw new Error('The split position must be inside the audio clip.');
      return { trackId: targetTrack.id, clipId: parts[1].id };
    }
    const division = action === 'chop16' ? '1/16' : action === 'chop8' ? '1/8' : '1/4';
    const parts = engine.sequencer.chopClip(targetTrack.id, clip.id, division);
    if (!parts?.length) throw new Error('The audio clip could not be chopped at this division.');
    return { trackId: targetTrack.id, clipId: parts[0].id };
  });
}
