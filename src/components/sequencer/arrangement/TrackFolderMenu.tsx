import React, { useState } from 'react';
import { Check, ChevronDown, FolderPlus } from 'lucide-react';
import type { TrackFolder } from '../../../audio/types.ts';

interface Props {
  folders: TrackFolder[];
  activeTrackId?: string;
  activeFolderId?: string;
  light?: boolean;
  onCreate: () => void;
  onAssign: (folderId?: string) => void;
}

export const TrackFolderMenu: React.FC<Props> = ({ folders, activeTrackId, activeFolderId, light = false, onCreate, onAssign }) => {
  const [open, setOpen] = useState(false);
  const current = folders.find((f) => f.id === activeFolderId);
  const buttonClass = light
    ? 'us-btn-light text-[#2c3137]'
    : 'bg-slate-800 text-amber-200 hover:bg-slate-700';
  const itemClass = 'w-full px-2 py-1 text-left hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="relative" onPointerDown={(e) => e.stopPropagation()} onPointerLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-[28px] px-2 rounded flex items-center gap-1 font-label font-bold text-[11px] ${buttonClass}`}
        title={activeTrackId ? `Arrange ${current ? `in ${current.name}` : 'in a track folder'}` : 'Select a track to manage folders'}
        data-testid="arr-track-folders"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        <span className="max-w-[90px] truncate">{current?.name ?? 'FOLDER'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-50 top-[32px] left-0 min-w-[190px] rounded border border-slate-600 bg-[#111826] shadow-xl py-1 text-[11px] text-slate-200" role="menu">
          <button type="button" className={itemClass} disabled={!activeTrackId || !!activeFolderId} onClick={() => run(onCreate)} role="menuitem">
            Create folder from selected track
          </button>
          {folders.length > 0 && <div className="my-1 border-t border-slate-700" />}
          {folders.map((folder) => (
            <button key={folder.id} type="button" className={`${itemClass} flex items-center justify-between gap-3`} disabled={!activeTrackId || activeFolderId === folder.id} onClick={() => run(() => onAssign(folder.id))} role="menuitem">
              <span className="truncate">Move track into {folder.name}</span>
              {activeFolderId === folder.id && <Check className="w-3 h-3 text-emerald-300" />}
            </button>
          ))}
          {activeFolderId && (
            <>
              <div className="my-1 border-t border-slate-700" />
              <button type="button" className={itemClass} onClick={() => run(() => onAssign(undefined))} role="menuitem">Remove from folder</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
