import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, readZip, writeZip } from '../src/project/zip.ts';

test('a project archive reads back its stored and deflated entries', async () => {
  const blob = await writeZip([
    { name: 'project.json', data: '{"format":"unbox-project"}', compress: true },
    { name: 'audio/a.wav', data: new Uint8Array([1, 2, 3, 4]) },
  ]);
  const files = await readZip(blob);
  assert.equal(new TextDecoder().decode(files.get('project.json')), '{"format":"unbox-project"}');
  assert.deepEqual([...(files.get('audio/a.wav') ?? [])], [1, 2, 3, 4]);
});

test('an altered byte in an entry is reported as damage, not read back as data', async () => {
  const name = 'audio/a.wav';
  const bytes = new Uint8Array(await (await writeZip([{ name, data: new Uint8Array(64).fill(7) }])).arrayBuffer());
  // Flip one payload byte: it sits right after the 30-byte local header and the file name.
  bytes[30 + name.length + 5] ^= 0xff;
  await assert.rejects(readZip(new Blob([bytes])), /checksum/);
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
