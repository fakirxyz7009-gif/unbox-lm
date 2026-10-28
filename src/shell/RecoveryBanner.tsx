/**
 * RecoveryBanner — offers the unsaved state that autosave stored before the last crash or tab
 * close. Restoring replaces the open project (and saves it); discarding deletes the copy.
 */
import { useEffect, useState } from 'react';
import { projectManager, type RecoveryRecord } from '../project/ProjectManager.ts';

export function RecoveryBanner() {
  const [rec, setRec] = useState<RecoveryRecord | null>(projectManager.recovery);
  const [busy, setBusy] = useState(false);

  useEffect(() => projectManager.subscribe(() => setRec(projectManager.recovery)), []);
  if (!rec) return null;

  const when = new Date(rec.at);
  const label = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div
      className="fixed left-1/2 bottom-16 z-50 -translate-x-1/2 flex items-center gap-3 rounded border border-[#6d5636] bg-[#221c14] px-3 py-2 shadow-2xl text-[13px]"
      role="status"
    >
      <span className="text-[#e0b266] font-label font-bold uppercase tracking-wider text-[11px]">Recovered</span>
      <span className="text-[#d5dade]">
        Unsaved changes from {label}
        {rec.name ? ` · ${rec.name}` : ''}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void projectManager.restoreRecovery().finally(() => setBusy(false));
        }}
        className="rounded bg-[#d6a358] px-2 py-1 text-[11px] font-bold text-black disabled:opacity-50"
      >
        Restore
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void projectManager.discardRecovery()}
        className="rounded border border-[#5a4a35] px-2 py-1 text-[11px] text-[#c2c9cf] hover:bg-white/5 disabled:opacity-50"
      >
        Discard
      </button>
    </div>
  );
}
