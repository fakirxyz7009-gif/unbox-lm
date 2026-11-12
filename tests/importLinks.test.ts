import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { checkLink, downloadAudio, isPrivateHost, toolStatus } from '../server/routes/importRoutes.ts';

test('checkLink accepts public http and https links and trims them', () => {
  assert.deepEqual(checkLink('  https://example.com/watch?v=abc  '), { url: 'https://example.com/watch?v=abc' });
  assert.ok('url' in checkLink('http://media.example.org/clip.mp3'));
});

test('checkLink refuses other schemes, local and private hosts, and junk', () => {
  const refused: unknown[] = [
    'ftp://example.com/a',
    'file:///C:/music.wav',
    'http://localhost:3000/a',
    'http://127.0.0.1/a',
    'http://10.0.0.5/a',
    'http://192.168.1.2/a',
    'http://172.20.1.1/a',
    'http://169.254.10.1/a',
    'http://[::1]/a',
    'http://[fd00::5]/a',
    'not a link',
    '',
    42,
    `https://example.com/${'a'.repeat(3000)}`,
  ];
  for (const bad of refused) {
    assert.ok('error' in checkLink(bad), `expected a refusal for ${String(bad).slice(0, 40)}`);
  }
});

test('isPrivateHost separates public addresses from private and dotless names', () => {
  assert.equal(isPrivateHost('8.8.8.8'), false);
  assert.equal(isPrivateHost('172.32.0.1'), false);
  assert.equal(isPrivateHost('example.com'), false);
  assert.equal(isPrivateHost('intranet'), true);
  assert.equal(isPrivateHost('169.254.1.1'), true);
});

function toneWav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('a WAV served on this computer goes through yt-dlp and comes back as WAV', { timeout: 180_000 }, async (t) => {
  const tools = await toolStatus();
  if (!tools.ytDlp || !tools.ffmpeg) return t.skip('yt-dlp and ffmpeg are needed for this check');
  const body = toneWav(0.5);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': body.length });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-import-test-'));
  try {
    const result = await downloadAudio(`http://127.0.0.1:${port}/tone.wav`, dir);
    if ('error' in result) assert.fail(result.error);
    assert.ok(result.file.toLowerCase().endsWith('.wav'), result.file);
    assert.equal(fs.readFileSync(result.file).subarray(0, 4).toString('ascii'), 'RIFF');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
