/**
 * Desktop server: the same Express app as server.ts plus the built dist/ folder.
 * Bundled by esbuild into electron/api-server.cjs (`npm run build:api`) and started by
 * electron/main.cjs on the loopback address assigned to the desktop profile.
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { listenOnFixedPort } from '../electron/listenOnFixedPort.cjs';
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

/** Uses only the supplied ordered candidates. Passing zero opts in to an ephemeral port. */
export async function startDesktopServer(opts: DesktopServerOptions, ports: number[] = [0]): Promise<number> {
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

  return listenOnFixedPort(createServer(app), ports);
}
