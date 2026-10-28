/**
 * Desktop server: the same Express app as server.ts plus the built dist/ folder.
 * Bundled by esbuild into electron/api-server.cjs (`npm run build:api`) and started by
 * electron/main.cjs on a random loopback port.
 */
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createApp } from './createApp.ts';

export interface DesktopServerOptions {
  distDir: string;
  /** Folder relative paths (data/vsr-manifest.json) resolve against. */
  baseDir: string;
  /** .env candidates, first match wins per variable. */
  envFiles: string[];
  manifestPath?: string;
  /** Writable in-app library folder (user data in the packaged app). */
  bundleDir?: string;
}

/** Listens on the first free port of `ports` (a stable origin keeps IndexedDB data), else any port. */
export async function startDesktopServer(opts: DesktopServerOptions, ports: number[] = []): Promise<number> {
  for (const file of opts.envFiles) {
    if (existsSync(file)) dotenv.config({ path: file, quiet: true });
  }
  if (opts.manifestPath && !process.env.VST_MANIFEST_PATH) process.env.VST_MANIFEST_PATH = opts.manifestPath;

  const { app } = createApp({
    baseDir: opts.baseDir,
    bundleDir: opts.bundleDir,
    bundleFallbackDir: path.join(opts.distDir, 'library'),
  });
  app.use(express.static(opts.distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(opts.distDir, 'index.html')));

  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = app.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
      server.once('error', reject);
    });
  for (const port of ports) {
    try {
      return await listen(port);
    } catch {
      // port busy: try the next one
    }
  }
  return listen(0);
}
