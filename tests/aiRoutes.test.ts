import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRouter } from '../server/routes/aiRoutes.ts';
import type { ManifestStore } from '../server/vst/manifestStore.ts';

test('AI router exposes only symbolic plans, parameter suggestions, and text mix notes', () => {
  const router = createAiRouter({ library: {} as ManifestStore });
  const layers = (router as unknown as { stack: Array<{ route?: { path?: string | string[]; methods?: Record<string, boolean> } }> }).stack;
  const routes = layers.flatMap((layer) => layer.route ? [{ path: layer.route.path, methods: layer.route.methods }] : []);
  const paths = routes.map((route) => route.path).flat().sort();

  assert.deepEqual(paths, ['/ai/combinator', '/gemini/generate-preset', '/gemini/mix-master-assistant']);
  assert.ok(routes.every((route) => route.methods?.post === true && Object.keys(route.methods).filter((method) => route.methods?.[method]).length === 1));
});
