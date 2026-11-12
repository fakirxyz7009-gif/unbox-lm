import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdmittedRecordedManifest,
  recordedManifestAdmissionError,
  type MultiSampleManifest,
} from '../shared/instruments/sampleManifestTypes.ts';
import { runIngestionPipeline } from '../scripts/fetch-real-samples.ts';
import { RealMultiSampler } from '../src/audio/realSampler/RealMultiSampler.ts';

function manifest(provenance?: MultiSampleManifest['provenance']): MultiSampleManifest {
  return {
    version: 1,
    generatedAt: '2026-11-10T00:00:00.000Z',
    provenance,
    devices: {},
  };
}

test('recorded manifest admission requires an explicit human-recording provenance declaration', () => {
  assert.match(recordedManifestAdmissionError(manifest()) ?? '', /not declared/i);
  assert.match(recordedManifestAdmissionError(manifest({ sourceKind: 'synthesized', generator: 'test' })) ?? '', /not declared/i);
  assert.match(recordedManifestAdmissionError(manifest({ sourceKind: 'unknown' })) ?? '', /not declared/i);
  assert.match(recordedManifestAdmissionError(manifest({ sourceKind: 'recorded', source: 'Example library' })) ?? '', /license/i);
  assert.match(recordedManifestAdmissionError(manifest({
    sourceKind: 'recorded',
    source: 'Example library',
    license: 'CC-BY-4.0',
    performer: 'Example performer',
  })) ?? '', /attribution/i);
  assert.match(recordedManifestAdmissionError(manifest({
    sourceKind: 'recorded',
    source: 'Example library',
    license: 'CC0-1.0',
  })) ?? '', /performer/i);
});

test('only a source, licence and performer-attested recorded manifest is admitted', () => {
  const recorded = manifest({
    sourceKind: 'recorded',
    source: 'Example recording session',
    license: 'CC0-1.0',
    performer: 'Example performer',
  });

  assert.equal(recordedManifestAdmissionError(recorded), null);
  assert.equal(isAdmittedRecordedManifest(recorded), true);
});

test('legacy-named sample tool declares generated offline WAVs as synthesized', async () => {
  const generated = await runIngestionPipeline({
    dryRun: true,
    instruments: ['no matching instrument'],
    generateSyntheticTestSamples: true,
  });

  assert.equal(generated.provenance?.sourceKind, 'synthesized');
  assert.match(recordedManifestAdmissionError(generated) ?? '', /not declared/i);
});

test('RealMultiSampler refuses a synthetic cache before it can replace an instrument sound', async () => {
  const originalFetch = globalThis.fetch;
  const sampler = new RealMultiSampler();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => ({
      ok: true,
      status: 200,
      json: async () => manifest({ sourceKind: 'synthesized', generator: 'test fixture' }),
    }),
  });

  try {
    assert.equal(await sampler.getManifest(), null);
    assert.match(sampler.manifestAdmissionIssue ?? '', /not declared/i);
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});
