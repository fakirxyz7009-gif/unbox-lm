import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createStemsRouter } from '../server/routes/stemsRoutes.ts';
import { isInsideStemRoot, STEM_LIBRARY_MANIFEST, StemLibrary } from '../server/stems/stemLibrary.ts';

function wavBytes(): Buffer {
  const out = Buffer.alloc(48);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(40, 4);
  out.write('WAVEfmt ', 8, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(44_100, 24);
  out.writeUInt32LE(88_200, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(4, 40);
  return out;
}

function recording(rights: 'private' | 'redistributable', license: string) {
  return {
    sourceKind: 'recorded',
    rights,
    license,
    performer: 'Test performer',
    source: 'https://example.test/recording',
    ...(rights === 'redistributable' && /^CC-BY-/.test(license) ? { attribution: 'Test performer — CC BY 4.0' } : {}),
  };
}

function tempLibrary(): { base: string; root: string; config: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-stem-provenance-'));
  const root = path.join(base, 'recordings');
  fs.mkdirSync(root);
  const config = path.join(base, 'stem-folders.json');
  return {
    base,
    root,
    config,
    cleanup: () => {
      assert.ok(path.resolve(base).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

test('stem library admits only manifest-declared human recordings and retains private/share status', async () => {
  const temp = tempLibrary();
  try {
    for (const name of ['cleared.wav', 'private.wav', 'generated.wav', 'undeclared.wav']) fs.writeFileSync(path.join(temp.root, name), wavBytes());
    fs.writeFileSync(path.join(temp.root, STEM_LIBRARY_MANIFEST), JSON.stringify({
      files: {
        'cleared.wav': recording('redistributable', 'CC0-1.0'),
        'private.wav': recording('private', 'Custom'),
        'generated.wav': { ...recording('private', 'Custom'), sourceKind: 'generated' },
      },
    }, null, 2));
    const library = new StemLibrary(temp.config, [temp.root]);
    const index = await library.get();

    assert.deepEqual(index.items.map((item) => item.name), ['cleared', 'private']);
    // The computer may also have an undeclared default local stem folder. The
    // two fixture files must be blocked irrespective of its contents.
    assert.ok(index.blockedFiles >= 2);
    const cleared = index.items.find((item) => item.name === 'cleared')!;
    const privateItem = index.items.find((item) => item.name === 'private')!;
    assert.deepEqual(cleared.provenance, {
      status: 'verified', sourceKind: 'recorded', rights: 'redistributable', license: 'CC0-1.0',
      performer: 'Test performer', source: 'https://example.test/recording', attribution: null,
    });
    assert.equal(privateItem.provenance.rights, 'private');
    assert.match(index.issues.join('\n'), /generated or unknown audio is not eligible/);
    assert.match(index.issues.join('\n'), /undeclared\.wav: skipped/);
  } finally {
    temp.cleanup();
  }
});

test('stem library rejects unsafe manifest paths and does not expose a legacy raw-stem list route', async () => {
  const temp = tempLibrary();
  try {
    fs.writeFileSync(path.join(temp.root, 'approved.wav'), wavBytes());
    fs.writeFileSync(path.join(temp.base, 'outside.wav'), wavBytes());
    fs.writeFileSync(path.join(temp.root, STEM_LIBRARY_MANIFEST), JSON.stringify({
      files: {
        'approved.wav': recording('redistributable', 'CC-BY-4.0'),
        '../outside.wav': recording('redistributable', 'CC0-1.0'),
      },
    }, null, 2));
    const library = new StemLibrary(temp.config, [temp.root]);
    const index = await library.get();
    assert.equal(index.items.length, 1);
    assert.match(index.issues.join('\n'), /ignored unsafe file key/);

    const router = createStemsRouter(library);
    const paths = router.stack.flatMap((layer) => layer.route ? [String(layer.route.path)] : []);
    assert.ok(!paths.includes('/list'), 'legacy route must not reveal raw songs or static paths');
    assert.ok(paths.includes('/file/:id'));
    assert.equal(library.filePath(index.items[0].id), path.join(temp.root, 'approved.wav'));
    assert.equal(library.filePath('not-indexed'), undefined);
  } finally {
    temp.cleanup();
  }
});

test('SFZ includes use a path boundary rather than a vulnerable string prefix', () => {
  const temp = tempLibrary();
  try {
    assert.equal(isInsideStemRoot(temp.root, path.join(temp.root, 'program.sfz')), true);
    assert.equal(isInsideStemRoot(temp.root, `${temp.root}-escape${path.sep}program.sfz`), false);
    assert.equal(isInsideStemRoot(temp.root, temp.root), false);
  } finally {
    temp.cleanup();
  }
});

test('a folder declared in the app admits its files, stored outside the folder; the folder file still decides per file', async () => {
  const temp = tempLibrary();
  try {
    for (const name of ['take1.wav', 'take2.wav', 'generated.wav', 'sidecar.wav']) fs.writeFileSync(path.join(temp.root, name), wavBytes());
    fs.writeFileSync(path.join(temp.root, STEM_LIBRARY_MANIFEST), JSON.stringify({
      files: {
        'generated.wav': { ...recording('private', 'Custom'), sourceKind: 'generated' },
        'sidecar.wav': recording('redistributable', 'CC0-1.0'),
      },
    }, null, 2));
    const library = new StemLibrary(temp.config, [temp.root]);
    const before = await library.get();
    const rootBefore = before.roots.find((r) => path.resolve(r.path) === path.resolve(temp.root))!;
    assert.equal(rootBefore.blocked, 3, 'the undeclared takes and the generated file are blocked');
    assert.deepEqual(before.items.map((i) => i.name), ['sidecar']);

    await assert.rejects(library.declareFolder(temp.base, { rights: 'private', performer: 'Me', source: 'My sessions' }), /folder of the stem library/);
    await assert.rejects(library.declareFolder(temp.root, { rights: 'private', performer: '', source: 'My sessions' }), /required/);
    await assert.rejects(library.declareFolder(temp.root, { rights: 'redistributable', license: 'CC-BY-4.0', performer: 'Me', source: 'x' }), /attribution/);
    await assert.rejects(library.declareFolder(temp.root, { rights: 'redistributable', license: 'Custom', performer: 'Me', source: 'x' }), /CC0-1.0 or a CC-BY/);

    const after = await library.declareFolder(temp.root, { rights: 'private', performer: 'My band', source: 'Our own multitrack session' });
    assert.deepEqual(after.items.map((i) => i.name).sort(), ['sidecar', 'take1', 'take2']);
    const take = after.items.find((i) => i.name === 'take1')!;
    assert.deepEqual(take.provenance, {
      status: 'verified', sourceKind: 'recorded', rights: 'private', license: 'Custom',
      performer: 'My band', source: 'Our own multitrack session', attribution: null,
    });
    assert.equal(after.items.find((i) => i.name === 'sidecar')!.provenance.license, 'CC0-1.0', 'a per-file entry wins over the folder');
    const root = after.roots.find((r) => path.resolve(r.path) === path.resolve(temp.root))!;
    assert.equal(root.blocked, 1, 'a file its folder calls generated stays out');
    assert.equal(root.declaration?.performer, 'My band');

    // stored next to the folder list, never in the audio folder
    assert.ok(fs.existsSync(path.join(temp.base, 'stem-declarations.json')));
    assert.deepEqual(fs.readdirSync(temp.root).sort(), ['generated.wav', 'sidecar.wav', STEM_LIBRARY_MANIFEST, 'take1.wav', 'take2.wav'].sort());

    // a restart keeps it, withdrawing blocks the files again
    const reopened = new StemLibrary(temp.config, [temp.root]);
    assert.equal((await reopened.get()).items.length, 3);
    const withdrawn = await reopened.withdrawDeclaration(temp.root);
    assert.deepEqual(withdrawn.items.map((i) => i.name), ['sidecar']);
  } finally {
    temp.cleanup();
  }
});

test('the declaration route needs the confirmation that the files are recordings', async () => {
  const temp = tempLibrary();
  const app = express();
  app.use(express.json());
  const library = new StemLibrary(temp.config, [temp.root]);
  app.use('/api/stems', createStemsRouter(library));
  const server = app.listen(0, '127.0.0.1');
  try {
    fs.writeFileSync(path.join(temp.root, 'take.wav'), wavBytes());
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/api/stems/declarations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const refused = await post({ path: temp.root, rights: 'private', performer: 'Me', source: 'Mine' });
    assert.equal(refused.status, 400);
    assert.match(((await refused.json()) as { error: string }).error, /not generated audio/);
    const ok = await post({ path: temp.root, recordings: true, rights: 'private', performer: 'Me', source: 'Mine' });
    assert.equal(ok.status, 200);
    const index = (await ok.json()) as { items: { name: string }[] };
    assert.deepEqual(index.items.map((i) => i.name), ['take']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    temp.cleanup();
  }
});
