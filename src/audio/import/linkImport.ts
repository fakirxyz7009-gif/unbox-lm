/**
 * Browser side of the link import (server/routes/importRoutes.ts). The server does the download;
 * this module asks whether the tools are installed and turns the returned WAV into a File.
 */
export interface LinkToolStatus {
  ytDlp: boolean;
  ffmpeg: boolean;
}

/** Null when the server has no link route (the share build) or cannot be reached. */
export async function fetchLinkToolStatus(): Promise<LinkToolStatus | null> {
  try {
    const res = await fetch('/api/import/status');
    if (!res.ok) return null;
    return (await res.json()) as LinkToolStatus;
  } catch {
    return null;
  }
}

export interface LinkDownload {
  name: string;
  file: File;
}

export async function downloadLinkAudio(url: string): Promise<LinkDownload> {
  const res = await fetch('/api/import/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `The import failed (${res.status}).`);
  }
  const name = decodeURIComponent(res.headers.get('X-Import-Name') ?? '') || 'Linked audio';
  const blob = await res.blob();
  return { name, file: new File([blob], `${name}.wav`, { type: blob.type || 'audio/wav' }) };
}
