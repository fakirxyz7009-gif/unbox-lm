/** Audio asset ids referenced by project clips and sampled instruments. */
export function projectAudioIds(json: string): string[] {
  const ids = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.length > 0) ids.add(value);
  };
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

  try {
    const project = object(JSON.parse(json));
    const tracks = Array.isArray(project?.tracks) ? project.tracks : [];
    for (const rawTrack of tracks) {
      const track = object(rawTrack);
      const clips = Array.isArray(track?.arrangementClips) ? track.arrangementClips : [];
      for (const rawClip of clips) {
        const clip = object(rawClip);
        add(clip?.audioId);
        const takes = Array.isArray(clip?.takes) ? clip.takes : [];
        for (const rawTake of takes) add(object(rawTake)?.audioId);
      }
    }

    const blocks = Array.isArray(project?.songBlocks) ? project.songBlocks : [];
    for (const rawBlock of blocks) {
      const audioClipsByTrack = object(object(rawBlock)?.audioClipsByTrack);
      for (const rawClips of Object.values(audioClipsByTrack ?? {})) {
        if (!Array.isArray(rawClips)) continue;
        for (const rawClip of rawClips) {
          const clip = object(rawClip);
          add(clip?.audioId);
          const takes = Array.isArray(clip?.takes) ? clip.takes : [];
          for (const rawTake of takes) add(object(rawTake)?.audioId);
        }
      }
    }

    // Audio files loaded into instruments, including SF2 zones.
    const sections = object(project?.sections);
    const deviceSamples = object(sections?.deviceSamples);
    for (const rawState of Object.values(deviceSamples ?? {})) {
      const state = object(rawState);
      add(object(state?.keys)?.audioId);
      const pads = object(state?.pads);
      for (const rawPad of Object.values(pads ?? {})) add(object(rawPad)?.audioId);
      const zones = Array.isArray(state?.multiSample) ? state.multiSample : [];
      for (const rawZone of zones) add(object(rawZone)?.audioId);
    }
  } catch {
    // Not valid project JSON; the caller will handle project validation separately.
  }
  return [...ids];
}
