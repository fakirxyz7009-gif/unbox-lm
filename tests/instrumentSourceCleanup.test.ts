import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { githubSource } from '../scripts/instruments/sources.ts';

test('GitHub source cleanup preserves other instrument source caches', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unbox-instrument-cache-'));
  const cacheRoot = path.join(root, 'instrument-cache');
  const otherSource = path.join(cacheRoot, 'freepats.button-accordion-HN');
  const otherFile = path.join(otherSource, 'preserve.flac');
  mkdirSync(otherSource, { recursive: true });
  writeFileSync(otherFile, 'existing source cache');

  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify({ tree: [{ path: 'Program.sfz', type: 'blob', size: 0 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', { status: 200 });
    },
  });

  try {
    const source = await githubSource('github:fixture-owner/fixture-repo/Program.sfz', cacheRoot, () => undefined);
    assert.equal(source.read('Program.sfz'), '');
    source.cleanup?.();

    assert.equal(existsSync(path.join(cacheRoot, 'fixture-owner.fixture-repo')), false);
    assert.equal(readFileSync(otherFile, 'utf8'), 'existing source cache');
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
    rmSync(root, { recursive: true, force: true });
  }
});
