import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createSeparationRouter, demucsAvailable, DEMUCS_MODELS } from '../server/routes/separationRoutes.ts';

function songWav(seconds: number, rate = 44100): Buffer {
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const v = Math.round((0.4 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 440 * t)) * 16000);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function listen(): Promise<{ server: http.Server; base: string }> {
  const app = express();
  app.use('/api/separate', createSeparationRouter());
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  return { server, base: `http://127.0.0.1:${port}` };
}

test('separation status reports whether demucs runs, and unknown stems are refused', async () => {
  const { server, base } = await listen();
  try {
    const status = (await (await fetch(`${base}/api/separate/status`)).json()) as { demucs: boolean; stems: string[] };
    assert.equal(status.demucs, await demucsAvailable());
    assert.deepEqual(status.stems, ['drums', 'bass', 'other', 'vocals']);
    const bad = await fetch(`${base}/api/separate/jobs/not-a-job/drums`);
    assert.equal(bad.status, 404);
  } finally {
    server.close();
  }
});

test('trained separation rejects an otherwise valid local WAV without explicit consent', async () => {
  const { server, base } = await listen();
  try {
    const denied = await fetch(`${base}/api/separate/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: new Uint8Array(songWav(0.05)),
    });
    assert.equal(denied.status, 403);
    assert.match((await denied.json() as { error: string }).error, /explicit consent/i);
  } finally {
    server.close();
  }
});

test('a short song is split into four WAV stems by the local demucs model', { timeout: 420_000 }, async (t) => {
  if (!(await demucsAvailable())) return t.skip('demucs is not installed on this computer');
  const { server, base } = await listen();
  try {
    const wav = songWav(3);
    const created = await fetch(`${base}/api/separate/jobs?consent=trained-model-separation`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: new Uint8Array(wav),
    });
    if (created.status !== 200) assert.fail(await created.text());
    const { id, stems } = (await created.json()) as { id: string; stems: string[] };
    assert.match(id, /^[a-f0-9]{32}$/);
    assert.deepEqual(stems.sort(), ['bass', 'drums', 'other', 'vocals']);
    for (const stem of ['drums', 'bass', 'other', 'vocals']) {
      const part = await fetch(`${base}/api/separate/jobs/${id}/${stem}`);
      assert.equal(part.status, 200);
      assert.equal(part.headers.get('content-type'), 'audio/wav');
      const bytes = Buffer.from(await part.arrayBuffer());
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.ok(bytes.length > 44 + 3 * 44100 * 4 - 4096, `${stem} is shorter than the input`);
    }
  } finally {
    server.close();
  }
});

test('the six-stem model also writes guitar and piano', { timeout: 420_000 }, async (t) => {
  if (!(await demucsAvailable())) return t.skip('demucs is not installed on this computer');
  const { server, base } = await listen();
  try {
    const created = await fetch(`${base}/api/separate/jobs?model=htdemucs_6s&consent=trained-model-separation`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: new Uint8Array(songWav(3)),
    });
    if (created.status !== 200) assert.fail(await created.text());
    const { id, stems } = (await created.json()) as { id: string; stems: string[] };
    assert.deepEqual([...stems].sort(), [...DEMUCS_MODELS.htdemucs_6s].sort());
    for (const stem of ['guitar', 'piano']) {
      const part = await fetch(`${base}/api/separate/jobs/${id}/${stem}`);
      assert.equal(part.status, 200, `${stem} stem`);
      assert.equal(Buffer.from(await part.arrayBuffer()).subarray(0, 4).toString('ascii'), 'RIFF');
    }
  } finally {
    server.close();
  }
});
