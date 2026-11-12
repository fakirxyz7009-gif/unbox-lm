import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAudioIds } from '../shared/project/audioAssets.ts';

test('RV7000 custom impulse assets are retained in the project audio manifest', () => {
  const ids = projectAudioIds(JSON.stringify({
    devices: [
      { type: 'rv7000', params: { impulseAssetId: 'room-response' } },
      { type: 'rv7000', params: { impulseAssetId: 'room-response' } },
      // An arbitrary plugin/device parameter must not make an unrelated audio asset part of a project.
      { type: 'subtractor', params: { impulseAssetId: 'not-an-ir' } },
    ],
    tracks: [{ arrangementClips: [{ audioId: 'lead-clip' }] }],
  }));

  assert.deepEqual(ids, ['lead-clip', 'room-response']);
});
