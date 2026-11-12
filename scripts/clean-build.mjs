#!/usr/bin/env node
/**
 * Cross-platform replacement for `rm -rf dist server.js`.
 *
 * The targets are intentionally fixed to project-owned build artifacts. This
 * script is safe to invoke from npm on Windows, macOS, or Linux and never
 * accepts a caller-supplied path.
 */
import { rmSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const targets = [resolve(root, 'dist'), resolve(root, 'server.js')];

for (const target of targets) {
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`Refusing to clean a path outside the project: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

