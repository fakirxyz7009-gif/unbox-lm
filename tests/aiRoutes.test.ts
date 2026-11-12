import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('AI controls visibly promise suggestions only, never generated or replacement audio', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const sources = [
    'src/components/HardwareStatusBar.tsx',
    'src/components/LocalAiPanel.tsx',
    'src/components/panels/ToolWindowF8.tsx',
    'src/studio/pages/SettingsPage.tsx',
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  const text = sources.join('\n');

  assert.match(text, /never creates, renders or replaces audio/i);
  assert.match(text, /never generates or replaces audio/i);
  assert.match(text, /never generated audio or replacement instrument sounds/i);
});
