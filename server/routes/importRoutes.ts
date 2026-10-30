/**
 * Audio from a video or sound link. The server runs yt-dlp (installed separately; ffmpeg converts
 * the audio) and returns the extracted audio as WAV. It runs only for loopback clients, is left out
 * of the share build, and is meant for audio you have the rights to use: many sites' terms forbid
 * downloading. No shell is used: the link is passed as one argument after `--`.
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { guardAsync, rateLimit, requireLoopback } from './routeGuards.ts';

const MAX_LINK_LENGTH = 2048;
export const MAX_IMPORT_MEGABYTES = 200;
const DOWNLOAD_TIMEOUT_MS = 240_000;
const TOOL_TIMEOUT_MS = 15_000;
const TOOL_CACHE_MS = 60_000;
const AUDIO_EXTENSIONS = new Map([
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.opus', 'audio/ogg'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
  ['.webm', 'audio/webm'],
]);

export interface ToolStatus {
  ytDlp: boolean;
  ffmpeg: boolean;
}

function probe(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: TOOL_TIMEOUT_MS, windowsHide: true }, (error) => resolve(!error));
  });
}

let toolCache: { at: number; status: ToolStatus } | null = null;

export async function toolStatus(): Promise<ToolStatus> {
  if (toolCache && Date.now() - toolCache.at < TOOL_CACHE_MS) return toolCache.status;
  const [ytDlp, ffmpeg] = await Promise.all([probe('yt-dlp', ['--version']), probe('ffmpeg', ['-version'])]);
  const status = { ytDlp, ffmpeg };
  toolCache = { at: Date.now(), status };
  return status;
}

/** True for loopback, private and link-local hosts, and for names without a dot (such as `localhost`). */
export function isPrivateHost(host: string): boolean {
  if (host.includes(':')) return host === '::1' || /^(fc|fd|fe80)/.test(host);
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return !host.includes('.');
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Accepts only a public http(s) link; returns its normalized form or the reason it was refused. */
export function checkLink(raw: unknown): { url: string } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Paste a link first.' };
  const text = raw.trim();
  if (text.length > MAX_LINK_LENGTH) return { error: 'That link is too long.' };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { error: 'That is not a valid link.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Only http and https links can be imported.' };
  if (isPrivateHost(parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''))) {
    return { error: 'Local and private addresses cannot be imported.' };
  }
  return { url: parsed.href };
}

/** The last meaningful stderr line, with terminal colour codes removed. */
function summarize(stderr: string): string {
  const lines = stderr
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines.filter((line) => /error/i.test(line)).pop() ?? lines.pop() ?? 'yt-dlp could not read that link.';
  return last.slice(0, 240);
}

function newestAudio(dir: string): string | null {
  const files = fs
    .readdirSync(dir)
    .filter((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

export type DownloadResult = { file: string } | { error: string; status: number };

/** Runs yt-dlp for one link into `dir` and returns the path of the extracted audio file. */
export function downloadAudio(url: string, dir: string): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const args = [
      '--no-playlist',
      '--no-progress',
      '--no-warnings',
      '--windows-filenames',
      '--max-filesize',
      `${MAX_IMPORT_MEGABYTES}M`,
      '-x',
      '--audio-format',
      'wav',
      '--audio-quality',
      '0',
      '-P',
      dir,
      '-o',
      '%(title).80B [%(id)s].%(ext)s',
      '--print',
      'after_move:filepath',
      '--',
      url,
    ];
    const child = spawn('yt-dlp', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), DOWNLOAD_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ error: 'yt-dlp could not be started.', status: 424 });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return resolve({ error: 'The download took too long and was stopped.', status: 504 });
      if (code !== 0) return resolve({ error: summarize(stderr), status: 422 });
      const printed = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
      const file = printed && fs.existsSync(printed) ? printed : newestAudio(dir);
      if (!file) return resolve({ error: 'No audio was produced from that link.', status: 422 });
      resolve({ file });
    });
  });
}

export function createImportRouter(): Router {
  const router = Router();
  router.use(requireLoopback('Importing from links is only available on this computer.'));
  const limit = rateLimit(6, 60_000);

  router.get('/status', async (_req, res) => {
    res.json(await toolStatus());
  });

  router.post('/link', limit, guardAsync(async (req: Request, res: Response) => {
    const checked = checkLink((req.body as { url?: unknown } | undefined)?.url);
    if ('error' in checked) return res.status(400).json({ error: checked.error });
    const tools = await toolStatus();
    if (!tools.ytDlp || !tools.ffmpeg) {
      return res.status(424).json({ error: 'Install yt-dlp and ffmpeg on this computer, then try again.', tools });
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-import-'));
    const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
    try {
      const result = await downloadAudio(checked.url, dir);
      if ('error' in result) {
        cleanup();
        return res.status(result.status).json({ error: result.error });
      }
      const size = fs.statSync(result.file).size;
      if (size > MAX_IMPORT_MEGABYTES * 1024 * 1024) {
        cleanup();
        return res.status(413).json({ error: 'The audio is too large to import.' });
      }
      const extension = path.extname(result.file).toLowerCase();
      const name = path.basename(result.file, path.extname(result.file)).replace(/\s*\[[^\]]*\]$/, '').trim() || 'Linked audio';
      res.setHeader('Content-Type', AUDIO_EXTENSIONS.get(extension) ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(size));
      res.setHeader('X-Import-Name', encodeURIComponent(name));
      res.setHeader('Access-Control-Expose-Headers', 'X-Import-Name');
      const stream = fs.createReadStream(result.file);
      stream.on('error', cleanup);
      res.on('close', cleanup);
      stream.pipe(res);
    } catch {
      cleanup();
      res.status(500).json({ error: 'The import failed unexpectedly.' });
    }
  }));

  return router;
}
