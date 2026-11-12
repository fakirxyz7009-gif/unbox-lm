/**
 * Local, rights-cleared recorded-audio API. The index is an explicit allow-list
 * from StemLibrary; no path, song title, or raw stem folder is exposed directly.
 */
import { Router } from 'express';
import type { StemLibrary } from '../stems/stemLibrary.ts';
import path from 'node:path';
import { guardAsync, rateLimit, requireLoopback } from './routeGuards.ts';

const MIME: Record<string, string> = {
  wav: 'audio/wav', wave: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4',
};

export function createStemsRouter(library: StemLibrary): Router {
  const router = Router();
  router.use(requireLoopback('The stem library is only available on this computer.'));

  /** The index of every stem folder (scanned at start-up; ?rescan=1 reads the folders again). */
  router.get('/library', guardAsync(async (req, res) => {
    res.json(req.query.rescan === '1' ? await library.scan() : await library.get());
  }));

  /** An indexed audio file, by id only (never by path). */
  router.get('/file/:id', (req, res) => {
    const abs = library.filePath(String(req.params.id));
    if (!abs) return res.status(404).json({ error: 'Not in the stem library. Rescan if the folder changed.' });
    const ext = path.extname(abs).slice(1).toLowerCase();
    res.type(MIME[ext] ?? 'application/octet-stream');
    res.sendFile(abs, { dotfiles: 'allow', maxAge: '1h' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'The file is gone. Rescan the stem library.' });
    });
  });

  /** Extra folders to index (a folder chosen by the user on this computer; a valid provenance sidecar is required). */
  router.post('/folders', rateLimit(30, 60_000), guardAsync(async (req, res) => {
    const folder = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    if (!folder || !path.isAbsolute(folder)) return res.status(400).json({ error: 'Give the full path of a folder, for example D:\\Samples.' });
    try {
      res.json(await library.addFolder(folder));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }));
  router.delete('/folders', rateLimit(30, 60_000), guardAsync(async (req, res) => {
    const folder = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!folder) return res.status(400).json({ error: 'Which folder?' });
    res.json(await library.removeFolder(folder));
  }));

  /**
   * The user's declaration for every file of a library folder: recordings of real performances (or
   * stems separated from them), with rights, performer and source. `recordings: true` is the user's
   * confirmation; generated audio is never eligible.
   */
  router.post('/declarations', rateLimit(30, 60_000), guardAsync(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const folder = typeof body.path === 'string' ? body.path : '';
    if (!folder) return res.status(400).json({ error: 'Which folder?' });
    if (body.recordings !== true) {
      return res.status(400).json({ error: 'Confirm that the folder holds recordings of real performances (or stems separated from them), not generated audio.' });
    }
    try {
      res.json(await library.declareFolder(folder, body));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }));
  router.delete('/declarations', rateLimit(30, 60_000), guardAsync(async (req, res) => {
    const folder = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!folder) return res.status(400).json({ error: 'Which folder?' });
    res.json(await library.withdrawDeclaration(folder));
  }));

  return router;
}

