/**
 * Folders of the stem library: status, add a folder by path, remove an added one, and declare what
 * a folder holds (its files load only once they are declared: see server/stems/stemLibrary.ts).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { stemLibrary, useStemLibrary } from '../audio/stemLibraryClient.ts';
import type { StemRoot } from '../../shared/audio/stemLibrary.ts';

const keepKeys = (e: React.KeyboardEvent) => {
  // letters typed here must not play notes or trigger shortcuts
  if (e.key !== 'Tab' && e.key !== 'Escape') e.stopPropagation();
};

type Basis = 'private' | 'cc0' | 'ccby';

/** The declaration of one folder: rights, performer, source, and the user's confirmation. */
function DeclareForm({ root, onDone }: { root: StemRoot; onDone: () => void }) {
  const [basis, setBasis] = useState<Basis>('private');
  const [performer, setPerformer] = useState('');
  const [source, setSource] = useState('');
  const [credit, setCredit] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmed && performer.trim() && source.trim() && (basis !== 'ccby' || credit.trim());
  return (
    <form
      className="flex flex-col gap-1 mt-1 p-1.5 rounded border border-[#5a4a33]"
      data-testid="stem-declare-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        void stemLibrary
          .declareFolder(root.path, {
            rights: basis === 'private' ? 'private' : 'redistributable',
            license: basis === 'cc0' ? 'CC0-1.0' : basis === 'ccby' ? 'CC-BY-4.0' : 'Custom',
            performer: performer.trim(),
            source: source.trim(),
            ...(basis === 'ccby' ? { attribution: credit.trim() } : {}),
          })
          .then(onDone)
          .catch((err: Error) => setError(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="flex items-center gap-1.5">
        <span className="w-[68px] shrink-0">Rights</span>
        <select value={basis} onChange={(e) => setBasis(e.target.value as Basis)} className="bw-input flex-1" aria-label="Rights of these recordings">
          <option value="private">Private (mine / permission)</option>
          <option value="cc0">CC0 / public domain</option>
          <option value="ccby">CC BY 4.0 (credit)</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="w-[68px] shrink-0">Performer</span>
        <input value={performer} onChange={(e) => setPerformer(e.target.value)} onKeyDown={keepKeys} maxLength={200} placeholder="Who plays / sings on these recordings" className="bw-input flex-1" aria-label="Performer" />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="w-[68px] shrink-0">Source</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} onKeyDown={keepKeys} maxLength={500} placeholder="Where they come from, e.g. my own sessions, stems of songs I own" className="bw-input flex-1" aria-label="Source" />
      </label>
      {basis === 'ccby' && (
        <label className="flex items-center gap-1.5">
          <span className="w-[68px] shrink-0">Credit</span>
          <input value={credit} onChange={(e) => setCredit(e.target.value)} onKeyDown={keepKeys} maxLength={300} placeholder="Attribution text the license asks for" className="bw-input flex-1" aria-label="Credit" />
        </label>
      )}
      <label className="flex items-start gap-1.5">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" data-testid="stem-declare-confirm" />
        <span>
          These files are recordings of real performances (or stems separated from them), not AI-generated audio, and the rights above are accurate. Unbox records this; it cannot check it. {basis === 'private' ? 'Private: recordings you own or may use; they stay on this computer and never go into a share build.' : ''}
        </span>
      </label>
      <div className="flex items-center gap-1">
        <button type="submit" className="bw-act" disabled={!ready || busy} data-testid="stem-declare-submit">
          {busy ? 'Declaring…' : `Declare ${root.blocked ? `${root.blocked} files` : 'the folder'}`}
        </button>
        <button type="button" className="bw-act bw-act--secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <div className="text-[#f08f8f]">{error}</div>}
    </form>
  );
}

export function StemFolders() {
  const lib = useStemLibrary();
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState<string | null>(null);
  if (!lib.index) return null;
  return (
    <div className="bw-sub" data-testid="stem-folders">
      {lib.index.roots.map((r) => (
        <div key={r.path}>
          <div className="flex items-center gap-1.5" title={r.path}>
            <span className={r.exists ? 'text-[#b9e07a]' : 'text-[#f08f8f]'} aria-label={r.exists ? 'found' : 'missing'}>
              {r.exists ? '●' : '○'}
            </span>
            <span className="truncate flex-1 font-bold">{r.label}</span>
            {r.declaration ? (
              <>
                <span className="shrink-0 text-[#b9e07a]" title={`${r.declaration.performer} · ${r.declaration.source}`}>
                  {r.declaration.rights === 'private' ? 'private' : r.declaration.license}
                </span>
                <button type="button" className="bw-act bw-act--secondary" onClick={() => void stemLibrary.withdrawDeclaration(r.path).catch((e: Error) => setError(e.message))} title="Withdraw the declaration: the folder's files stop loading">
                  Withdraw
                </button>
              </>
            ) : (
              r.exists &&
              (r.blocked ?? 0) > 0 &&
              declaring !== r.path && (
                <button type="button" className="bw-act" onClick={() => setDeclaring(r.path)} data-testid="stem-declare" title="Say what these files are, so they load">
                  Declare {r.blocked} files…
                </button>
              )
            )}
            {r.removable && (
              <button type="button" className="bw-icon-btn" aria-label={`Remove ${r.label} from the library`} onClick={() => void stemLibrary.removeFolder(r.path).catch((e: Error) => setError(e.message))}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {declaring === r.path && <DeclareForm root={r} onDone={() => setDeclaring(null)} />}
        </div>
      ))}
      <form
        className="flex items-center gap-1 mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!folder.trim()) return;
          setError(null);
          void stemLibrary
            .addFolder(folder.trim())
            .then(() => setFolder(''))
            .catch((err: Error) => setError(err.message));
        }}
      >
        <input value={folder} onChange={(e) => setFolder(e.target.value)} onKeyDown={keepKeys} placeholder="Add a folder: full path, e.g. D:\My recordings" aria-label="Folder to add to the stem library" className="bw-input flex-1" />
        <button type="submit" className="bw-act bw-act--secondary">Add</button>
      </form>
      {error && <div className="text-[#f08f8f]">{error}</div>}
      <p className="text-[#a39683] mt-1">
        Read-only: audio and .sfz files are indexed, nothing in these folders is changed. A folder's files load once it is declared here (or file by file in an <code>unbox-stem-library.json</code> inside it).
      </p>
    </div>
  );
}
