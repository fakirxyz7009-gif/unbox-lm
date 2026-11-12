import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createLocalAiRouter, ollamaUrl, readContext } from '../server/routes/localAiRoutes.ts';

const context = {
  bpm: 120,
  timeSignature: '4/4',
  stepsPerBar: 16,
  targetTrack: { id: 'bass-1', name: 'Bass' },
  patternLength: 16,
  focusedClip: null,
  tracks: [{ id: 'bass-1', name: 'Bass', muted: false }],
};

async function listen(): Promise<{ server: http.Server; base: string }> {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/local-ai', createLocalAiRouter());
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  return { server, base: `http://127.0.0.1:${port}` };
}

async function post(base: string, body: unknown) {
  const res = await fetch(`${base}/api/local-ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

test('the Ollama address must be on this computer, otherwise the default is used', () => {
  assert.equal(ollamaUrl(undefined), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('http://localhost:9999/'), 'http://localhost:9999');
  assert.equal(ollamaUrl('http://example.com:11434'), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('not a url'), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('ftp://127.0.0.1:21'), 'http://127.0.0.1:11434');
});

test('the song state is read leniently and malformed parts are dropped', () => {
  const ok = readContext({ ...context, tracks: [{ id: 'a', name: 'A', muted: true }, 42, { id: 3 }] });
  assert.ok(!('error' in ok));
  if ('error' in ok) return;
  assert.deepEqual(ok.tracks, [{ id: 'a', name: 'A', muted: true }]);
  assert.ok('error' in readContext(null));
  assert.ok('error' in readContext({ tracks: [] }));
});

test('chat refuses requests it cannot use before calling any model', async () => {
  const { server, base } = await listen();
  try {
    assert.equal((await post(base, { model: '', message: 'hi', context })).status, 400);
    assert.equal((await post(base, { model: 'bad model!', message: 'hi', context })).status, 400);
    assert.equal((await post(base, { model: 'qwen2.5-coder:3b', message: '   ', context })).status, 400);
    assert.equal((await post(base, { model: 'qwen2.5-coder:3b', message: 'x'.repeat(2000), context })).status, 400);
    assert.equal((await post(base, { model: 'qwen2.5-coder:3b', message: 'hi', context: { tracks: [] } })).status, 400);
  } finally {
    server.close();
  }
});

test('chat refuses audio generation and replacement requests before contacting a local model', async () => {
  const { server, base } = await listen();
  try {
    const { status, data } = await post(base, {
      model: 'qwen2.5-coder:3b',
      message: 'Generate a realistic vocal audio stem and replace the singer.',
      context,
    });
    assert.equal(status, 400);
    assert.match(String(data.error), /Audio generation and audio replacement are disabled/);
  } finally {
    server.close();
  }
});

test('a model that is not installed gets a clear message', async () => {
  const status = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
  if (!status) return;
  const { server, base } = await listen();
  try {
    const { status: code, data } = await post(base, { model: 'no-such-model-for-tests:1b', message: 'hi', context });
    assert.equal(code, 404);
    assert.match(String(data.error), /ollama pull no-such-model-for-tests:1b/);
  } finally {
    server.close();
  }
});

test('the status route reports the installed models, or that Ollama is offline', async (t) => {
  const { server, base } = await listen();
  try {
    const status = (await (await fetch(`${base}/api/local-ai/status`)).json()) as { online: boolean; models: string[] };
    if (!status.online) return t.skip('Ollama is not running on this computer');
    assert.ok(Array.isArray(status.models));
    assert.ok(status.models.length > 0, 'expected at least one installed model');
  } finally {
    server.close();
  }
});

test('a live request returns only checked actions', { timeout: 420_000 }, async (t) => {
  const ready = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
  if (!ready) return t.skip('Ollama is not running on this computer');
  const { server, base } = await listen();
  try {
    const { status, data } = await post(base, { model: 'qwen2.5-coder:3b', message: 'Reverse the notes of the bass pattern.', context });
    assert.equal(status, 200, JSON.stringify(data));
    assert.equal(typeof data.reply, 'string');
    assert.ok(Array.isArray(data.actions));
    const allowed = new Set(['set_tempo', 'transform_notes', 'write_notes', 'set_track_mute']);
    for (const action of data.actions as { type: string }[]) assert.ok(allowed.has(action.type), action.type);
  } finally {
    server.close();
  }
});
