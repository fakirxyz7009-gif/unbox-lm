/**
 * Stem separation with Deezer Spleeter (https://github.com/deezer/spleeter) and Meta Demucs,
 * run locally on this computer. Extracts Vocals, Drums, Bass and Other (htdemucs), or those plus Guitar
 * and Piano (htdemucs_6s). It is non-generative source analysis, not verified human audio; the route
 * requires an explicit UI consent token before any model is run. No external cloud calls.
 */
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Router } from 'express';
import { guardAsync, rateLimit, requireLoopback } from './routeGuards.ts';

/** The stems each Demucs model writes. htdemucs_6s adds the guitar and piano stems. */
export const DEMUCS_MODELS = {
  htdemucs: ['drums', 'bass', 'other', 'vocals'],
  htdemucs_6s: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'],
  // The fine-tuned four-stem model: the same stems as htdemucs, slower and cleaner.
  htdemucs_ft: ['drums', 'bass', 'other', 'vocals'],
} as const;
export type DemucsModel = keyof typeof DEMUCS_MODELS;
export const SPLEETER_STEMS = ['drums', 'bass', 'other', 'vocals'] as const;
/** Every stem name a job can return. */
export const STEM_NAMES = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const;
export type StemName = (typeof STEM_NAMES)[number];

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const RUN_TIMEOUT_MS = 60 * 60_000;
const PROBE_TIMEOUT_MS = 120_000;
const PROBE_CACHE_MS = 5 * 60_000;
const JOB_TTL_MS = 60 * 60_000;
const JOB_ROOT = path.join(os.tmpdir(), 'unbox-stems');

let probeCache: { at: number; demucs: boolean; spleeter: boolean } | null = null;

/** Whether Deezer Spleeter CLI runs */
export function spleeterAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('spleeter', ['--help'], { timeout: 10000, windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

/** Whether Demucs CLI runs */
export function demucsAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('demucs', ['--help'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

/** Check cached AI status */
export async function getAiSeparationStatus(): Promise<{ demucs: boolean; spleeter: boolean; available: boolean }> {
  if (probeCache && Date.now() - probeCache.at < PROBE_CACHE_MS) {
    return { ...probeCache, available: probeCache.demucs || probeCache.spleeter };
  }
  const [demucs, spleeter] = await Promise.all([demucsAvailable(), spleeterAvailable()]);
  probeCache = { at: Date.now(), demucs, spleeter };
  return { demucs, spleeter, available: demucs || spleeter };
}

/** Resolves the extracted stem path across the Demucs models and the Spleeter directory structure */
export function stemPath(jobDir: string, stem: StemName): string {
  // Demucs writes out/<model>/input/<stem>.wav; Spleeter writes out/input/<stem>.wav.
  const folders = [
    path.join(jobDir, 'out', 'htdemucs_6s', 'input'),
    path.join(jobDir, 'out', 'htdemucs_ft', 'input'),
    path.join(jobDir, 'out', 'htdemucs', 'input'),
    path.join(jobDir, 'out', 'input'),
  ];
  for (const folder of folders) {
    const file = path.join(folder, `${stem}.wav`);
    if (fs.existsSync(file)) return file;
  }
  return path.join(folders[1], `${stem}.wav`);
}

function sweepJobs(): void {
  if (!fs.existsSync(JOB_ROOT)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(JOB_ROOT)) {
    const dir = path.join(JOB_ROOT, name);
    try {
      if (now - fs.statSync(dir).mtimeMs > JOB_TTL_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

export type SeparationRun = { ok: true } | { error: string; status: number };

/** Runs Deezer Spleeter (https://github.com/deezer/spleeter) into `outDir` */
export function runSpleeter(input: string, outDir: string): Promise<SeparationRun> {
  return new Promise((resolve) => {
    const child = spawn('spleeter', ['separate', '-p', 'spleeter:4stems', '-o', outDir, input], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    // Unread output fills the pipe and stalls the child, so it is drained even though it is not used.
    child.stdout.resume();
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ error: 'Deezer Spleeter could not be started.', status: 424 });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return resolve({ error: 'Separation took too long and was stopped.', status: 504 });
      if (code !== 0) {
        return resolve({ error: (stderr || 'Spleeter could not separate that file.').slice(0, 240), status: 422 });
      }
      resolve({ ok: true });
    });
  });
}

/** Runs Demucs with the given model into `outDir` */
export function runDemucs(input: string, outDir: string, model: DemucsModel): Promise<SeparationRun> {
  return new Promise((resolve) => {
    const child = spawn('demucs', ['-n', model, '--shifts', '1', '--overlap', '0.25', '-o', outDir, input], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ error: 'Demucs could not be started.', status: 424 });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return resolve({ error: 'Separation took too long and was stopped.', status: 504 });
      if (code !== 0) {
        const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const last = lines.filter((line) => /error/i.test(line)).pop() ?? lines.pop() ?? 'Demucs could not separate that file.';
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
    const status = await getAiSeparationStatus();
    res.json({
      available: status.available,
      demucs: status.demucs,
      spleeter: status.spleeter,
      engine: status.spleeter ? 'spleeter' : status.demucs ? 'demucs' : 'none',
      stems: DEMUCS_MODELS.htdemucs,
      models: Object.entries(DEMUCS_MODELS).map(([id, stems]) => ({ id, stems })),
    });
  });

  // Only audio/wav is accepted: that type needs a CORS preflight, so a page on another site cannot post here.
  router.post('/jobs', startLimit, express.raw({ type: 'audio/wav', limit: MAX_UPLOAD_BYTES }), guardAsync(async (req, res) => {
    if (req.query.consent !== 'trained-model-separation') {
      return res.status(403).json({ error: 'Explicit consent is required before a trained separation model can process audio.' });
    }
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length < 44) return res.status(400).json({ error: 'Send the audio as a WAV file.' });

    const status = await getAiSeparationStatus();
    if (!status.available) {
      return res.status(424).json({ error: 'Install Spleeter or Demucs on this computer first, then try again.' });
    }

    sweepJobs();
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(JOB_ROOT, id);
    fs.mkdirSync(path.join(dir, 'in'), { recursive: true });
    const input = path.join(dir, 'in', 'input.wav');
    fs.writeFileSync(input, body);

    const requestedEngine = (req.query.engine as string) || 'auto';
    const requestedModel = typeof req.query.model === 'string' ? req.query.model : '';
    const model: DemucsModel = Object.prototype.hasOwnProperty.call(DEMUCS_MODELS, requestedModel) ? (requestedModel as DemucsModel) : 'htdemucs';
    let run: SeparationRun;
    let expected: readonly StemName[];

    if (requestedEngine === 'spleeter' && status.spleeter) {
      expected = SPLEETER_STEMS;
      run = await runSpleeter(input, path.join(dir, 'out'));
    } else if (status.demucs) {
      expected = DEMUCS_MODELS[model];
      run = await runDemucs(input, path.join(dir, 'out'), model);
    } else if (status.spleeter) {
      expected = SPLEETER_STEMS;
      run = await runSpleeter(input, path.join(dir, 'out'));
    } else {
      return res.status(424).json({ error: 'No AI separation model found.' });
    }

    // The song is not needed once it is split, so its copy is removed now rather than when the job expires.
    fs.rmSync(path.join(dir, 'in'), { recursive: true, force: true });
    if ('error' in run) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
      return res.status(run.status).json({ error: run.error });
    }

    // The stems the model wrote, in the model's order; the client downloads exactly these.
    const stems = expected.filter((stem) => fs.existsSync(stemPath(dir, stem)));
    if (stems.length !== expected.length) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
      return res.status(422).json({ error: `AI model did not produce all ${expected.length} stems.` });
    }
    res.json({ id, stems });
  }));

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
