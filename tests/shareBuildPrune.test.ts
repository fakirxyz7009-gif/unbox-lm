import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneShareBuild } from '../scripts/prune-share-build-core.ts';

test('share pruning removes private stems, previews, and non-redistributable pack files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-share-prune-'));
  const dist = path.join(tempRoot, 'dist');
  const instruments = path.join(dist, 'instruments');
  fs.mkdirSync(path.join(dist, 'library'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
  fs.mkdirSync(path.join(dist, 'stems'), { recursive: true });
  fs.mkdirSync(path.join(instruments, 'cc0-keys', 'samples'), { recursive: true });
  fs.mkdirSync(path.join(instruments, 'private-voice', 'samples'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'library', 'preview.ogg'), 'private preview');
  fs.writeFileSync(path.join(dist, 'stems', 'song.wav'), 'private stem');
  fs.writeFileSync(path.join(instruments, 'cc0-keys', 'samples', 'key.ogg'), 'redistributable sample');
  fs.writeFileSync(path.join(instruments, 'private-voice', 'samples', 'voice.ogg'), 'private sample');
  fs.writeFileSync(path.join(instruments, 'index.json'), JSON.stringify({ packs: [
    { id: 'cc0-keys', name: 'CC0 Keys', spdx: 'CC0-1.0' },
    { id: 'private-voice', name: 'Private Voice', spdx: 'Custom' },
  ] }));
  fs.writeFileSync(path.join(instruments, 'CREDITS.md'), '## CC0 Keys\nKeep this credit.\n\n## Private Voice\nDrop this credit.\n');

  try {
    const result = pruneShareBuild(dist);
    assert.deepEqual(result.dropped, [{ id: 'private-voice', name: 'Private Voice' }]);
    assert.equal(fs.existsSync(path.join(dist, 'library')), false);
    assert.equal(fs.existsSync(path.join(dist, 'stems')), false);
    assert.equal(fs.existsSync(path.join(instruments, 'cc0-keys', 'samples', 'key.ogg')), true);
    assert.equal(fs.existsSync(path.join(instruments, 'private-voice')), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(instruments, 'index.json'), 'utf8')).packs.map((pack: { id: string }) => pack.id), ['cc0-keys']);
    const credits = fs.readFileSync(path.join(instruments, 'CREDITS.md'), 'utf8');
    assert.match(credits, /CC0 Keys/);
    assert.doesNotMatch(credits, /Private Voice/);
  } finally {
    const tempPath = path.resolve(tempRoot);
    const safeBase = `${path.resolve(os.tmpdir())}${path.sep}`;
    assert.ok(tempPath.startsWith(safeBase), 'test cleanup must stay under the OS temp directory');
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
});

test('share pruning rejects traversal metadata before any files are removed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-share-prune-'));
  const dist = path.join(tempRoot, 'dist');
  const instruments = path.join(dist, 'instruments');
  fs.mkdirSync(instruments, { recursive: true });
  fs.mkdirSync(path.join(dist, 'library'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(dist, 'library', 'keep.ogg'), 'preserve until preflight passes');
  fs.writeFileSync(path.join(tempRoot, 'outside.txt'), 'source content');
  fs.writeFileSync(path.join(instruments, 'index.json'), JSON.stringify({ packs: [{ id: '../..', name: 'Escape', spdx: 'Custom' }] }));
  try {
    assert.throws(() => pruneShareBuild(dist), /Invalid or duplicate instrument pack id/);
    assert.equal(fs.readFileSync(path.join(dist, 'library', 'keep.ogg'), 'utf8'), 'preserve until preflight passes');
    assert.equal(fs.readFileSync(path.join(tempRoot, 'outside.txt'), 'utf8'), 'source content');
  } finally {
    assert.ok(path.resolve(tempRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('share pruning rejects an instrument-directory junction into source content', (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-share-prune-'));
  const dist = path.join(tempRoot, 'dist');
  const source = path.join(tempRoot, 'source-instruments');
  fs.mkdirSync(dist);
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(source, 'index.json'), JSON.stringify({ packs: [] }));
  fs.writeFileSync(path.join(source, 'preserve.ogg'), 'original recording');
  try {
    try {
      fs.symlinkSync(source, path.join(dist, 'instruments'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        context.skip('This process token cannot create the directory link needed by the junction scenario');
        return;
      }
      throw error;
    }
    assert.throws(() => pruneShareBuild(dist), /Resolved path is outside the share build/);
    assert.equal(fs.readFileSync(path.join(source, 'preserve.ogg'), 'utf8'), 'original recording');
  } finally {
    assert.ok(path.resolve(tempRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('share pruning refuses source-like folders without a built app entry page', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-share-prune-'));
  const instruments = path.join(tempRoot, 'instruments');
  fs.mkdirSync(path.join(instruments, 'private-source'), { recursive: true });
  fs.writeFileSync(path.join(instruments, 'index.json'), JSON.stringify({ packs: [{ id: 'private-source', name: 'Source', spdx: 'Custom' }] }));
  fs.writeFileSync(path.join(instruments, 'private-source', 'take.wav'), 'original recording');
  try {
    assert.throws(() => pruneShareBuild(tempRoot), /Share build entry page is missing/);
    assert.equal(fs.readFileSync(path.join(instruments, 'private-source', 'take.wav'), 'utf8'), 'original recording');
  } finally {
    assert.ok(path.resolve(tempRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
