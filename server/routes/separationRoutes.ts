/**
 * Stem separation with the Demucs model (htdemucs), run on this computer by the `demucs` command
 * (installed separately). A song takes minutes on a CPU. Loopback clients only, and left out of the
 * share build. The WAV goes into a job folder that is removed an hour after it was made. No shell:
 * the file path is passed as one argument.
 */
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Router } from 'express';
import { rateLimit, requireLoopback } from './routeGuards.ts';

export const STEM_NAMES = ['drums', 'bass', 'other', 'vocals'] as const;
export type StemName = (typeof STEM_NAMES)[number];

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const RUN_TIMEOUT_MS = 60 * 60_000;
const PROBE_TIMEOUT_MS = 120_000;
const PROBE_CACHE_MS = 5 * 60_000;
const JOB_TTL_MS = 60 * 60_000;
const JOB_ROOT = path.join(os.tmpdir(), 'unbox-stems');

let probeCache: { at: number; ok: boolean } | null = null;

/** Whether the `demucs` command runs; cached for a few minutes. */
export function demucsAvailable(): Promise<boolean> {
  if (probeCache && Date.now() - probeCache.at < PROBE_CACHE_MS) return Promise.resolve(probeCache.ok);
  return new Promise((resolve) => {
    execFile('demucs', ['--help'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (error) => {
      probeCache = { at: Date.now(), ok: !error };
      resolve(!error);
    });
  });
}

/** demucs writes out/htdemucs/<input name>/<stem>.wav; the input is always named input.wav. */
export function stemPath(jobDir: string, stem: StemName): string {
  return path.join(jobDir, 'out', 'htdemucs', 'input', `${stem}.wav`);
}

function sweepJobs(): void {
  if (!fs.existsSync(JOB_ROOT)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(JOB_ROOT)) {
    const dir = path.join(JOB_ROOT, name);
    if (now - fs.statSync(dir).mtimeMs > JOB_TTL_MS) fs.rmSync(dir, { recursive: true, force: true });
  }
}

export type SeparationRun = { ok: true } | { error: string; status: number };

/** Runs demucs on `input` with the htdemucs model into `outDir`. */
export function runDemucs(input: string, outDir: string): Promise<SeparationRun> {
  return new Promise((resolve) => {
    const child = spawn('demucs', ['-n', 'htdemucs', '-o', outDir, input], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ error: 'demucs could not be started.', status: 424 });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return resolve({ error: 'Separation took too long and was stopped.', status: 504 });
      if (code !== 0) {
        const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const last = lines.filter((line) => /error/i.test(line)).pop() ?? lines.pop() ?? 'demucs could not separate that file.';
        return resolve({ error: last.slice(0, 240), status: 422 });
      }
      resolve({ ok: true });
    });
  });
}

export function createSeparationRouter(): Router {
  const router = Router();
  router.use(requireLoopback('Stem separation is only available on this computer.'));
  const startLimit = rateLimit(3, 10 * 60_000);

  router.get('/status', async (_req, res) => {
    res.json({ demucs: await demucsAvailable(), stems: STEM_NAMES });
  });

  router.post('/jobs', startLimit, express.raw({ type: '*/*', limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length < 44) return res.status(400).json({ error: 'Send the audio as a WAV file.' });
    if (!(await demucsAvailable())) {
      return res.status(424).json({ error: 'Install demucs on this computer first (pip install demucs), then try again.' });
    }
    sweepJobs();
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(JOB_ROOT, id);
    fs.mkdirSync(path.join(dir, 'in'), { recursive: true });
    const input = path.join(dir, 'in', 'input.wav');
    fs.writeFileSync(input, body);
    const run = await runDemucs(input, path.join(dir, 'out'));
    if ('error' in run) return res.status(run.status).json({ error: run.error });
    const stems = STEM_NAMES.filter((stem) => fs.existsSync(stemPath(dir, stem)));
    if (stems.length !== STEM_NAMES.length) return res.status(422).json({ error: 'demucs did not produce all four stems.' });
    res.json({ id, stems });
  });

  router.get('/jobs/:id/:stem', (req, res) => {
    const id = String(req.params.id);
    const stem = String(req.params.stem);
    if (!/^[a-f0-9]{32}$/.test(id) || !(STEM_NAMES as readonly string[]).includes(stem)) {
      return res.status(404).json({ error: 'Unknown stem.' });
    }
    const file = stemPath(path.join(JOB_ROOT, id), stem as StemName);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Unknown stem.' });
    res.sendFile(file, { headers: { 'Content-Type': 'audio/wav' } });
  });

  return router;
}
