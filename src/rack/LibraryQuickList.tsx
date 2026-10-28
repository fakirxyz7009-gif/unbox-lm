import React, { useEffect, useMemo } from 'react';
import { Music, Play, Plus, Square } from 'lucide-react';
import { useVstLibrary, vstLibrary } from '../vst/libraryClient.ts';
import { isMountable, type ItemKind, type ManifestItem, type MountableItem, type SampleItem } from '../../shared/vst/manifestTypes.ts';
import { MUSIC_KINDS, subtitle } from './LibraryBrowser.tsx';

interface LibraryQuickListProps {
  kinds: ItemKind[];
  query: string;
  filter?: (item: ManifestItem) => boolean;
  onMount: (item: MountableItem, presetId?: string) => void;
  /** Playable samples: put the sample in the song (audio track). */
  onAddToSong?: (item: SampleItem) => void;
  /** Playable samples: make the sample an instrument's sound (played on the keys). */
  onUseAsSound?: (item: SampleItem) => void;
  onError?: (message: string) => void;
}

/** Compact in-app library list for narrow panels (Studio view browser tabs). */
export const LibraryQuickList: React.FC<LibraryQuickListProps> = ({ kinds, query, filter, onMount, onAddToSong, onUseAsSound, onError }) => {
  const lib = useVstLibrary();
  useEffect(() => {
    void vstLibrary.load();
  }, []);
  const items = useMemo(
    () =>
      lib.manifest
        ? vstLibrary
            .search(query, { kinds: kinds.filter((k) => MUSIC_KINDS.includes(k)), limit: 150 })
            .map((h) => h.item)
            .filter((i) => (i.kind !== 'plugin' || i.primaryVariant) && (!filter || filter(i)))
        : [],
    [lib.manifest, query, kinds.join(','), filter]
  );

  if (!lib.manifest) {
    const text =
      lib.status === 'loading' || lib.status === 'idle' ? 'Loading the plugin library…'
      : lib.status === 'empty' ? lib.error ?? 'No plugin library is built into this app yet.'
      : lib.error ?? 'Library unavailable.';
    return <div className="text-slate-500 text-[11px] p-2">{text}</div>;
  }
  if (!items.length) return <div className="text-slate-500 text-[11px] p-2">No matches in the library.</div>;

  return (
    <>
      {items.map((item) => {
        const previewId = item.kind === 'sample' && item.playable ? item.id : 'previewId' in item ? item.previewId : undefined;
        const target = item.kind === 'preset' ? vstLibrary.item(item.targetId) : undefined;
        return (
          <div key={item.id} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-900/70 hover:bg-slate-800">
            <div className="flex-1 min-w-0">
              <div className="truncate">{item.name}</div>
              <div className="truncate text-[11px] text-slate-500">{subtitle(item)}</div>
            </div>
            {previewId && (
              <button
                type="button"
                aria-label="Play preview"
                className="text-slate-300 hover:text-white"
                onClick={() => void vstLibrary.toggleAudition(previewId).catch((e: Error) => onError?.(`Preview failed: ${e.message}`))}
              >
                {lib.auditioningId === previewId ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            )}
            {onAddToSong && item.kind === 'sample' && item.playable && (
              <button type="button" className="text-slate-500 hover:text-orange-400 text-[11px] flex items-center" title="Put this sample on an audio track at the playhead" onClick={() => onAddToSong(item)}>
                <Plus className="w-3 h-3" /> song
              </button>
            )}
            {onUseAsSound && item.kind === 'sample' && item.playable && (
              <button type="button" className="text-slate-500 hover:text-orange-400 text-[11px] flex items-center gap-0.5" title="Play this sample on the keys of the part" onClick={() => onUseAsSound(item)}>
                <Music className="w-3 h-3" /> keys
              </button>
            )}
            {isMountable(item) && (
              <button type="button" className="text-slate-500 hover:text-orange-400 text-[11px] flex items-center" onClick={() => onMount(item)}>
                <Plus className="w-3 h-3" /> add
              </button>
            )}
            {target && isMountable(target) && (
              <button type="button" className="text-slate-500 hover:text-orange-400 text-[11px] flex items-center" onClick={() => onMount(target, item.id)}>
                <Plus className="w-3 h-3" /> load
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};
