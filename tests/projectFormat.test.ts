import test from 'node:test';
import assert from 'node:assert/strict';
import { isImportableProject, parseImportableProject, PROJECT_FORMAT_VERSION } from '../src/project/projectFormat.ts';
import { normalizeTrackSequencerData } from '../src/audio/sequencer/model.ts';
import type { SequencerTrack } from '../src/audio/types.ts';

const validProject = {
  format: 'unbox-project',
  version: PROJECT_FORMAT_VERSION,
  devices: [{ id: 'piano-1', type: 'rec_meta_piano', params: { volume: 0.8 } }],
  tracks: [{ id: 'track-1', deviceId: 'piano-1' }],
  audioConnections: [{ s: 'piano-1', sp: 'out_l', t: 'master', tp: 'master_l' }],
  cvConnections: [],
  rackGroups: [{ id: 'group-1', deviceIds: ['piano-1'], macros: [{ targets: [] }] }],
  sections: { project: { notes: 'safe' } },
};

test('project preflight accepts current and versionless legacy envelopes', () => {
  assert.equal(isImportableProject(validProject), true);
  const legacy = { format: 'unbox-project', devices: [{ id: 'old-piano', type: 'subtractor' }] };
  assert.equal(isImportableProject(legacy), true);
  assert.equal(parseImportableProject(JSON.stringify(legacy))?.devices.length, 1);
});

test('project preflight rejects malformed JSON and unsupported envelopes', () => {
  assert.equal(parseImportableProject('{not json'), null);
  assert.equal(isImportableProject({ ...validProject, format: 'other' }), false);
  assert.equal(isImportableProject({ format: 'unbox-project', devices: {} }), false);
  assert.equal(isImportableProject({ ...validProject, version: PROJECT_FORMAT_VERSION + 1 }), false);
  assert.equal(isImportableProject({ ...validProject, version: 1.5 }), false);
});

test('project preflight rejects malformed device and iterated collection shapes', () => {
  assert.equal(isImportableProject({ ...validProject, devices: [null] }), false);
  assert.equal(isImportableProject({ ...validProject, devices: [{ id: 'piano-1' }] }), false);
  assert.equal(isImportableProject({ ...validProject, devices: [validProject.devices[0], validProject.devices[0]] }), false);
  assert.equal(isImportableProject({ ...validProject, tracks: {} }), false);
  assert.equal(isImportableProject({ ...validProject, tracks: [null] }), false);
  assert.equal(isImportableProject({ ...validProject, audioConnections: [null] }), false);
  assert.equal(isImportableProject({ ...validProject, cvConnections: {} }), false);
  assert.equal(isImportableProject({ ...validProject, sections: [] }), false);
  assert.equal(isImportableProject({ ...validProject, rackGroups: [{ deviceIds: 'piano-1' }] }), false);
  assert.equal(isImportableProject({ ...validProject, rackGroups: [{ macros: [{ targets: {} }] }] }), false);
});

test('project preflight rejects Combiners with more than eight front-panel macros', () => {
  const macros = Array.from({ length: 9 }, (_, index) => ({ id: `macro-${index}`, targets: [] }));
  assert.equal(isImportableProject({ ...validProject, rackGroups: [{ deviceIds: ['piano-1'], macros }] }), false);
});

test('project preflight requires VST devices to carry a matching rebuild snapshot', () => {
  const snapshot = {
    itemId: 'plugin-1', kind: 'plugin', name: 'Reverb', format: 'VST3', role: 'effect', category: 'reverb',
    macros: [], hostable: false, path: '', presets: [],
  };
  assert.equal(isImportableProject({ ...validProject, devices: [{ id: 'fx-1', type: 'vst_effect', vst: snapshot }] }), true);
  assert.equal(isImportableProject({ ...validProject, devices: [{ id: 'fx-1', type: 'vst_effect' }] }), false);
  assert.equal(isImportableProject({ ...validProject, devices: [{ id: 'fx-1', type: 'vst_effect', vst: { ...snapshot, role: 'instrument' } }] }), false);
  assert.equal(isImportableProject({ ...validProject, devices: [{ id: 'piano-1', type: 'subtractor', vst: snapshot }] }), false);
});

test('sequencer normalization preserves recorded audio clips across project reopen', () => {
  const clip = {
    id: 'audio-clip', kind: 'audio' as const, startBar: 0, lengthBars: 2,
    name: 'Recorded take', audioId: 'asset-1', audioOffset: 0.25, gainDb: -3,
  };
  const track = {
    id: 'audio-track', name: 'Mic', kind: 'audio', color: '#fff', deviceId: 'audio-device',
    arrangementClips: [clip], patternList: [], steps: [],
  } as unknown as SequencerTrack;
  normalizeTrackSequencerData(track, 16);
  assert.equal(track.arrangementClips?.[0]?.kind, 'audio');
  assert.equal(track.arrangementClips?.[0]?.audioId, 'asset-1');
  assert.equal(track.arrangementClips?.[0]?.audioOffset, 0.25);

  // Migrate the shape written by the old normalizer: it retained audioId but mislabeled the clip
  // as a pattern. Reopening must recover the audible source instead of silently losing it.
  track.arrangementClips = [{ ...clip, kind: 'pattern' }];
  normalizeTrackSequencerData(track, 16);
  assert.equal(track.arrangementClips?.[0]?.kind, 'audio');
  assert.equal(track.arrangementClips?.[0]?.audioId, 'asset-1');
});
