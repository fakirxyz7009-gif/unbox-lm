/**
 * /api/vst — in-app library, search, rescan, preview audio and native-host status.
 * Loopback-only by default. Audio is served by manifest id from the in-app bundle only;
 * a request can never name a filesystem path.
 */
import path from 'node:path';
import express, { type Request } from 'express';
import { ITEM_KINDS, type ItemKind, type SoundCategory } from '../../shared/vst/manifestTypes.ts';
import { searchManifest } from '../../shared/vst/search.ts';
import type { ManifestStore } from '../vst/manifestStore.ts';
import { guardAsync, isLocalRequest } from './routeGuards.ts';

const AUDIO_TYPES: Record<string, string> = {
  wav: 'audio/wav', wave: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  flac: 'audio/flac', mp3: 'audio/mpeg', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4',
};

function insideDir(file: string, dir: string): boolean {
  return path.resolve(file).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
}

export function createVstRouter(store: ManifestStore): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    if (store.config.allowRemote || isLocalRequest(req)) return next();
    res.status(403).json({ error: 'The plugin library is only available on this computer (set VST_LIBRARY_ALLOW_REMOTE=1 to share it).' });
  });

  router.get('/manifest', guardAsync(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ manifest: await store.get(), roots: store.config.roots, rootsAvailable: store.rootsAvailable, scanning: store.isScanning });
  }));

  router.get('/status', (_req, res) => {
    res.json({ scanning: store.isScanning, progress: store.progress, roots: store.config.roots, rootsAvailable: store.rootsAvailable });
  });

  router.post('/rescan', async (_req, res) => {
    try {
      res.json({ manifest: await store.rescan() });
    } catch (e) {
      res.status(500).json({ error: `Scan failed: ${(e as Error).message}` });
    }
  });

  router.get('/search', guardAsync(async (req, res) => {
    const manifest = await store.get();
    if (!manifest) return res.json({ hits: [] });
    const kinds = String(req.query.kind ?? '')
      .split(',')
      .filter((k): k is ItemKind => (ITEM_KINDS as string[]).includes(k));
    const categories = String(req.query.category ?? '').split(',').filter(Boolean) as SoundCategory[];
    const hits = searchManifest(manifest.items, String(req.query.q ?? '').slice(0, 200), {
      kinds,
      categories,
      includeDuplicates: req.query.duplicates === '1',
      limit: Math.min(200, Math.max(1, Number(req.query.limit) || 50)),
    });
    res.json({ hits: hits.map((h) => ({ score: Math.round(h.score * 100) / 100, item: h.item })) });
  }));

  router.get('/file/:id', guardAsync(async (req, res) => {
    const item = await store.item(String(req.params.id));
    if (!item || item.kind !== 'sample' || !item.playable || !item.file) return res.status(404).json({ error: 'Not a playable library sample' });
    const type = AUDIO_TYPES[item.format];
    const dir = store.activeBundleDir;
    if (!type || !dir) return res.status(404).json({ error: 'Not available' });
    const file = path.resolve(dir, 'audio', path.basename(item.file));
    if (!insideDir(file, path.join(dir, 'audio'))) return res.status(404).json({ error: 'Not available' });
    res.type(type);
    res.sendFile(file, { maxAge: '1h' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not readable' });
    });
  }));

  router.get('/host/status', guardAsync(async (_req, res) => {
    const manifest = await store.get();
    const hostable = manifest?.items.filter((i) => i.kind === 'plugin' && i.hostable && i.primaryVariant).length ?? 0;
    res.json({
      available: false,
      hostablePlugins: hostable,
      reason: 'No native plugin host process is installed, so plugin binaries are not loaded. Mounted units run Web Audio proxy DSP.',
    });
  }));

  return router;
}
