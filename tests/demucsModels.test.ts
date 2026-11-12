import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMUCS_MODELS } from '../server/routes/separationRoutes.ts';

test('the fine-tuned Demucs model writes the same four stems as the default model', () => {
  assert.deepEqual([...DEMUCS_MODELS.htdemucs_ft], [...DEMUCS_MODELS.htdemucs]);
  assert.deepEqual([...DEMUCS_MODELS.htdemucs_6s].slice(0, 4), [...DEMUCS_MODELS.htdemucs]);
});
