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
import { Btn } from '../../studio/ui/controls.tsx';

interface Props {
  onImported: (asset: AudioAsset) => void;
  onMessage?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function LinkImport({ onImported, onMessage }: Props) {
  const [url, setUrl] = useState('');
  const [rights, setRights] = useState(false);
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
  const canImport = ready && !busy && rights && url.trim().length > 0;

  const submit = async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      const { name, file } = await downloadLinkAudio(url.trim());
      const asset = await audioStore.importFile(file, name);
      onImported(asset);
      onMessage?.(`Imported "${asset.name}" from the link`, 'success');
      setUrl('');
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'The import failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  let status = 'Checking for yt-dlp and ffmpeg…';
  if (tools === null) status = 'Links need the full build running on this computer.';
  else if (tools && !ready) status = `Missing on this computer: ${!tools.ytDlp ? 'yt-dlp ' : ''}${!tools.ffmpeg ? 'ffmpeg' : ''}.`.trim();
  else if (ready) status = 'Downloads run on this computer. Many sites forbid downloading in their terms.';

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
      <label className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-[#a7aeb5]">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} disabled={!ready || busy} className="mt-0.5" />
        I have the rights to use this audio.
      </label>
      <Btn className="mt-1.5 w-full justify-center" disabled={!canImport} onClick={() => void submit()} title="Download the audio from this link and add it to the samples">
        {busy ? 'Importing…' : 'Import audio'}
      </Btn>
      <p className="mt-1.5 text-[11px] leading-snug text-[#8b9299]">{status}</p>
    </div>
  );
}
