/**
 * Paste a video or audio link and import its audio as a project sample. The download runs on this
 * computer through yt-dlp and ffmpeg (see server/routes/importRoutes.ts); the box is disabled until
 * both are found, and the user confirms they have the rights to the audio first.
 */
import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { AudioAsset } from '../../audio/clips/audioStore.ts';
import { audioStore } from '../../audio/clips/audioStore.ts';
import { downloadLinkAudio, fetchLinkToolStatus, type LinkToolStatus } from '../../audio/import/linkImport.ts';
import { linkImportProvenance, type AudioRights } from '../../../shared/audio/provenance.ts';
import { Btn } from '../../studio/ui/controls.tsx';

interface Props {
  onImported: (asset: AudioAsset) => void;
  onMessage?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function LinkImport({ onImported, onMessage }: Props) {
  const [url, setUrl] = useState('');
  const [rights, setRights] = useState<AudioRights | ''>('');
  const [attribution, setAttribution] = useState('');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  // undefined = still checking, null = the link route is not on this server.
  const [tools, setTools] = useState<LinkToolStatus | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void fetchLinkToolStatus().then((status) => {
      if (alive) setTools(status);
    });
    return () => {
      alive = false;
    };
  }, []);

  const ready = !!tools && tools.ytDlp && tools.ffmpeg;
  const canImport = ready && !busy && declared && rights !== '' && url.trim().length > 0 && (rights !== 'cc-by' || attribution.trim().length > 0);

  const submit = async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      const source = url.trim();
      const provenance = linkImportProvenance({
        origin: 'link-import',
        rights,
        source,
        ...(rights === 'cc0' ? { license: 'CC0-1.0' } : rights === 'cc-by' ? { license: 'CC-BY (declared by user)' } : { license: 'Owned / permission declared by user' }),
        ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
        declaredAt: new Date().toISOString(),
      });
      if (!provenance) throw new Error('Choose a rights basis and include the required CC-BY credit before importing.');
      const { name, file } = await downloadLinkAudio(source);
      const asset = await audioStore.importFile(file, name, { provenance });
      onImported(asset);
      onMessage?.(`Imported "${asset.name}" with its declared source and rights record.`, 'success');
      setUrl('');
      setAttribution('');
      setRights('');
      setDeclared(false);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'The import failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  let status = 'Checking for yt-dlp and ffmpeg…';
  if (tools === null) status = 'Links need the full build running on this computer.';
  else if (tools && !ready) status = `Missing on this computer: ${!tools.ytDlp ? 'yt-dlp ' : ''}${!tools.ffmpeg ? 'ffmpeg' : ''}.`.trim();
  else if (ready) status = 'Downloads run on this computer. Do not use commercial songs or material without permission; many sites forbid downloading in their terms.';

  return (
    <div className="rounded border border-chrome-line bg-black/20 p-2" data-testid="link-import">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-label font-bold uppercase tracking-wider text-[#8b9299]">
        <Link2 className="h-3 w-3" /> From a link
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        placeholder="Paste a video or audio link"
        aria-label="Link to import"
        disabled={!ready || busy}
        className="us-field h-[26px] w-full text-[12px]"
      />
      <label className="mt-1.5 block text-[11px] leading-snug text-[#a7aeb5]">
        Rights basis
        <select
          value={rights}
          onChange={(e) => setRights(e.target.value as AudioRights | '')}
          disabled={!ready || busy}
          aria-label="Rights basis for linked audio"
          className="us-field mt-0.5 h-[26px] w-full text-[12px]"
        >
          <option value="">Choose before importing…</option>
          <option value="owned">I own it or have direct permission (private project use)</option>
          <option value="cc0">CC0 / public-domain dedication</option>
          <option value="cc-by">CC BY (credit required)</option>
        </select>
      </label>
      {rights === 'cc-by' && (
        <input
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder="Required credit: creator, title, licence"
          aria-label="Required CC-BY credit for linked audio"
          disabled={!ready || busy}
          className="us-field mt-1 h-[26px] w-full text-[12px]"
        />
      )}
      <label className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-[#a7aeb5]">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} disabled={!ready || busy} className="mt-0.5" />
        I confirm this source and rights declaration is accurate. It is saved with the project, but Unbox cannot independently verify it or grant redistribution rights.
      </label>
      <Btn className="mt-1.5 w-full justify-center" disabled={!canImport} onClick={() => void submit()} title="Download the audio from this link and add it to the samples">
        {busy ? 'Importing…' : 'Import audio'}
      </Btn>
      <p className="mt-1.5 text-[11px] leading-snug text-[#8b9299]">{status}</p>
    </div>
  );
}
