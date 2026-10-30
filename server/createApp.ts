/**
 * Express app shared by the web server (server.ts) and the Electron desktop build
 * (server/electronEntry.ts → electron/api-server.cjs).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createAiRouter } from './routes/aiRoutes.ts';
import { createStemsRouter } from './routes/stemsRoutes.ts';
import { createImportRouter } from './routes/importRoutes.ts';
import { createSeparationRouter } from './routes/separationRoutes.ts';
import { createLocalAiRouter } from './routes/localAiRoutes.ts';
import { createVstRouter } from './routes/vstRoutes.ts';
import { ManifestStore, libraryConfigFromEnv } from './vst/manifestStore.ts';
import { SHARE_BUILD } from './buildMode.ts';

export interface AppOptions {
  baseDir: string;
  /** Writable in-app library folder (default <baseDir>/public/library). */
  bundleDir?: string;
  /** Read-only library shipped with the build (dist/library). */
  bundleFallbackDir?: string;
}

export function createApp({ baseDir, bundleDir, bundleFallbackDir }: AppOptions) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const config = libraryConfigFromEnv(baseDir, bundleDir);
  config.bundleFallbackDir = bundleFallbackDir;
  const library = new ManifestStore(config);
  // The in-app library (JSON + copied preview audio) is plain static content.
  app.use('/library', express.static(config.bundleDir, { maxAge: '1h' }));
  if (bundleFallbackDir) app.use('/library', express.static(bundleFallbackDir, { maxAge: '1h' }));

  // Multi-sampled real recordings (D:\samples high-capacity storage, SAMPLE_LIBRARY_PATH, or local public folder)
  const primarySamplesDir = process.env.SAMPLE_LIBRARY_PATH
    ? path.resolve(process.env.SAMPLE_LIBRARY_PATH)
    : fs.existsSync('D:\\samples')
      ? 'D:\\samples'
      : path.resolve(baseDir, 'public', 'samples');

  if (fs.existsSync(primarySamplesDir)) {
    app.use('/samples', express.static(primarySamplesDir, { maxAge: '1h' }));
  }

  // Fallback to public/samples if primary is external and a requested asset exists locally
  const pubSamples = path.resolve(baseDir, 'public', 'samples');
  if (primarySamplesDir !== pubSamples && fs.existsSync(pubSamples)) {
    app.use('/samples', express.static(pubSamples, { maxAge: '1h' }));
  }

  if (!SHARE_BUILD) {
    // Real acoustic stems and playable patches from D:\audio stems\daw_instruments
    const STEMS_DISK = 'D:\\audio stems\\daw_instruments';
    if (fs.existsSync(STEMS_DISK)) {
      app.use('/stems', express.static(STEMS_DISK, { maxAge: '1h' }));
    }
    const STEMS_PUB = path.resolve(baseDir, 'public', 'stems', 'daw_instruments');
    if (fs.existsSync(STEMS_PUB)) {
      app.use('/stems', express.static(STEMS_PUB, { maxAge: '1h' }));
    }
    app.use('/api/stems', createStemsRouter());
    // Links are downloaded only on this computer and only in the full build (see importRoutes.ts).
    app.use('/api/import', createImportRouter());
    // Stem separation with the local Demucs model (see separationRoutes.ts).
    app.use('/api/separate', createSeparationRouter());
  }

  app.use('/api/vst', createVstRouter(library));
  // The local assistant only talks to a model on this computer, so it is mounted in every build.
  app.use('/api/local-ai', createLocalAiRouter());
  app.use('/api', createAiRouter({ library }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  // Express would answer a failed request (a malformed JSON body, an oversized upload, a thrown error) with an
  // HTML page that includes a stack trace. The API answers with JSON and keeps the detail in the server log.
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const e = err as { status?: unknown; statusCode?: unknown };
    const status = [e.status, e.statusCode].find((s): s is number => typeof s === 'number' && s >= 400 && s < 600) ?? 500;
    if (status >= 500) console.error('[api]', err);
    const message = status === 413
      ? 'That upload is larger than the server accepts.'
      : status >= 500 ? 'The server could not finish that request.' : 'The request could not be read.';
    res.status(status).json({ error: message });
  });

  return { app, library };
}
