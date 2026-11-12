import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derivedAudioProvenance,
  linkImportProvenance,
  parseAudioProvenance,
  unknownAudioProvenance,
  userFileProvenance,
  userRecordingProvenance,
} from '../shared/audio/provenance.ts';

test('audio provenance retains bounded valid declarations and drops unknown fields', () => {
  assert.deepEqual(parseAudioProvenance({
    origin: 'link-import', rights: 'cc-by', source: ' https://example.org/recording ', attribution: ' Example Artist ', license: ' CC-BY-4.0 ', declaredAt: '2026-11-11T00:00:00.000Z', ignored: 'not retained',
  }), {
    origin: 'link-import', rights: 'cc-by', source: 'https://example.org/recording', attribution: 'Example Artist', license: 'CC-BY-4.0', declaredAt: '2026-11-11T00:00:00.000Z',
  });
  assert.equal(parseAudioProvenance({ origin: 'imaginary', rights: 'cc0' }), undefined);
  assert.equal(parseAudioProvenance({ origin: 'link-import', rights: 'imaginary' }), undefined);
});

test('linked audio requires an auditable source, declared license basis, and CC-BY credit', () => {
  assert.deepEqual(linkImportProvenance({ origin: 'link-import', rights: 'cc0', source: 'https://archive.example/item', license: 'CC0-1.0' }), {
    origin: 'link-import', rights: 'cc0', source: 'https://archive.example/item', license: 'CC0-1.0',
  });
  assert.equal(linkImportProvenance({ origin: 'link-import', rights: 'cc-by', source: 'https://archive.example/item' }), undefined);
  assert.equal(linkImportProvenance({ origin: 'link-import', rights: 'owned' }), undefined);
  assert.equal(linkImportProvenance({ origin: 'link-import', rights: 'private', source: 'https://archive.example/item' }), undefined);
});

test('origin constructors never turn an unverified file into licensed audio and derivatives retain declared obligations', () => {
  const at = '2026-11-11T12:00:00.000Z';
  assert.deepEqual(userFileProvenance('local-loop.wav', { declaredAt: at }), {
    origin: 'user-file', rights: 'unknown', source: 'local-loop.wav', declaredAt: at,
  });
  assert.deepEqual(userRecordingProvenance('Input take on vocal', { declaredAt: at }), {
    origin: 'user-recording', rights: 'private', source: 'Input take on vocal', license: 'Private recording', declaredAt: at,
  });
  assert.deepEqual(unknownAudioProvenance({ source: 'Legacy project asset', declaredAt: at }), {
    origin: 'unknown', rights: 'unknown', source: 'Legacy project asset', declaredAt: at,
  });

  const derivative = derivedAudioProvenance({
    origin: 'link-import', rights: 'cc-by', source: 'https://archive.example/recording', attribution: 'Artist Name', license: 'CC-BY-4.0',
  }, 'DC offset removed', 'derived', { declaredAt: at });
  assert.deepEqual(derivative, {
    origin: 'derived', rights: 'cc-by', source: 'DC offset removed from https://archive.example/recording',
    attribution: 'Artist Name', license: 'CC-BY-4.0', declaredAt: at,
  });
  assert.equal(derivedAudioProvenance(undefined, 'Frozen render', 'app-render', { declaredAt: at }).rights, 'unknown');
});
