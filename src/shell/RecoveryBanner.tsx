/**
 * RecoveryBanner — offers the unsaved state that autosave stored before the last crash or tab
 * close. Restoring replaces the open project (and saves it); discarding deletes the copy.
 */
import { useEffect, useState } from 'react';
import { projectManager, type RecoveryRecord } from '../project/ProjectManager.ts';
import type { RecordingJournalManifest } from '../audio/recording/recordingJournal.ts';

export function RecoveryBanner() {
  const [rec, setRec] = useState<RecoveryRecord | null>(projectManager.recovery);
  const [takes, setTakes] = useState<RecordingJournalManifest[]>(projectManager.recordingJournals);
  const [busy, setBusy] = useState(false);

  useEffect(() => projectManager.subscribe(() => {
    setRec(projectManager.recovery);
    setTakes([...projectManager.recordingJournals]);
  }), []);
  const take = takes[0] ?? null;
  if (!rec && !take) return null;

  const when = rec ? new Date(rec.at) : null;
  const label = when ? `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  const takeLabel = take ? new Date(take.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const takeMatchesOpenProject = !take?.projectId || take.projectId === projectManager.currentId;

  return (
    <div className="fixed left-1/2 bottom-16 z-50 -translate-x-1/2 flex max-w-[min(96vw,860px)] flex-col gap-2 text-[13px]">
      {rec && <div className="flex items-center gap-3 rounded border border-[#6d5636] bg-[#221c14] px-3 py-2 shadow-2xl" role="status">
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
          onClick={() => {
            if (window.confirm(`Discard the unsaved changes from ${label}? They cannot be recovered afterwards.`)) void projectManager.discardRecovery();
          }}
          className="rounded border border-[#5a4a35] px-2 py-1 text-[11px] text-[#c2c9cf] hover:bg-white/5 disabled:opacity-50"
        >
          Discard
        </button>
      </div>}
      {take && <div className="flex items-center gap-3 rounded border border-[#3f6170] bg-[#102029] px-3 py-2 shadow-2xl" role="status">
        <span className="text-cyan-200 font-label font-bold uppercase tracking-wider text-[11px]">Recorded take</span>
        <span className="text-[#d5dade]">
          {take.completedAt ? 'Audio was placed before the last confirmed project save' : 'Interrupted audio take'} from {takeLabel}; {takeMatchesOpenProject
            ? `recover it as new audio track${take.tracks.length === 1 ? '' : 's'}.`
            : `open “${take.projectName}” before recovering it.`}
        </span>
        <button
          type="button"
          disabled={busy || !takeMatchesOpenProject}
          onClick={() => {
            setBusy(true);
            void projectManager.recoverRecordingJournal(take.sessionId).finally(() => setBusy(false));
          }}
          className="rounded bg-cyan-300 px-2 py-1 text-[11px] font-bold text-black disabled:opacity-50"
        >
          Recover audio
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Discard this recorded-take recovery? Its durable audio chunks cannot be restored afterwards.')) void projectManager.discardRecordingJournal(take.sessionId);
          }}
          className="rounded border border-[#42626d] px-2 py-1 text-[11px] text-[#c2c9cf] hover:bg-white/5 disabled:opacity-50"
        >
          Discard
        </button>
      </div>}
    </div>
  );
}
