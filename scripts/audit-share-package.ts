import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { isRedistributable } from '../shared/instruments/catalogTypes.ts';
import { parsePack } from '../shared/instruments/types.ts';

interface PackSummary {
  id: string;
  name: string;
  spdx: string;
  author: string;
  source: string;
}

interface PackIndex {
  format: string;
  version: number;
  packs: PackSummary[];
}

const archiveArg = process.argv[2];
if (!archiveArg) throw new Error('Usage: npm run audit:share-package -- <path-to-app.asar-or-share-dist> [share-api-bundle]');
const archivePath = path.resolve(archiveArg);
if (!fs.existsSync(archivePath)) throw new Error(`Share app archive does not exist: ${archivePath}`);

const isDirectory = fs.statSync(archivePath).isDirectory();
function listDirectory(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listDirectory(fullPath);
    if (!entry.isFile()) return [];
    return [`dist/${path.relative(archivePath, fullPath).replaceAll('\\', '/')}`];
  });
}

const archiveEntries = isDirectory ? listDirectory(archivePath) : listPackage(archivePath, { isPack: false });
const originalPathByNormalized = new Map(
  archiveEntries.map((entry) => [entry.replaceAll('\\', '/').replace(/^\/+/, ''), entry]),
);
const hasPath = (relative: string): boolean => originalPathByNormalized.has(relative.replaceAll('\\', '/').replace(/^\/+/, ''));
const extract = (relative: string): Buffer => {
  if (isDirectory) {
    const prefix = 'dist/';
    if (!relative.startsWith(prefix)) throw new Error(`Share directory read must stay under ${prefix}: ${relative}`);
    const filePath = path.resolve(archivePath, relative.slice(prefix.length));
    const rootPrefix = `${archivePath}${path.sep}`;
    if (!filePath.startsWith(rootPrefix)) throw new Error(`Unsafe share directory path: ${relative}`);
    return fs.readFileSync(filePath);
  }
  const original = originalPathByNormalized.get(relative.replaceAll('\\', '/').replace(/^\/+/, ''));
  if (!original) throw new Error(`Missing ${relative} in ${archivePath}`);
  const nativePath = original.replace(/^[/\\]+/, '').replaceAll('/', path.sep).replaceAll('\\', path.sep);
  return extractFile(archivePath, nativePath);
};

assert.ok(hasPath('dist/index.html'), 'Share archive is missing the DAW entry page');
assert.ok(hasPath('dist/instruments/index.json'), 'Share archive is missing its instrument index');
assert.ok(hasPath('dist/instruments/CREDITS.md'), 'Share archive is missing pack credits');
assert.ok(!archiveEntries.some((entry) => /^dist\/(library|stems)(\/|$)/i.test(entry.replaceAll('\\', '/').replace(/^\/+/, ''))), 'Share build contains the local plugin library or private song stems');

const sourceIndex = JSON.parse(fs.readFileSync(path.resolve('public/instruments/index.json'), 'utf8')) as PackIndex;
const bundleIndex = JSON.parse(extract('dist/instruments/index.json').toString('utf8')) as PackIndex;
assert.equal(sourceIndex.format, 'unbox-instrument-index');
assert.equal(bundleIndex.format, sourceIndex.format);
assert.equal(bundleIndex.version, sourceIndex.version);

const expected = sourceIndex.packs.filter((pack) => isRedistributable(pack.spdx));
const expectedIds = expected.map((pack) => pack.id).sort();
const actualIds = bundleIndex.packs.map((pack) => pack.id).sort();
assert.deepEqual(actualIds, expectedIds, 'Share index must contain every and only redistributable source pack');
assert.ok(bundleIndex.packs.every((pack) => isRedistributable(pack.spdx)), 'Share index contains a private or unsupported license');

const credits = extract('dist/instruments/CREDITS.md').toString('utf8');
const privatePacks = sourceIndex.packs.filter((entry) => !isRedistributable(entry.spdx));
const forbiddenContent = ['/stems/daw_instruments/', ...privatePacks.flatMap((pack) => [pack.id, `rec_${pack.id.replaceAll('-', '_')}`, pack.name])];
const scripts = [...originalPathByNormalized.keys()].filter((entry) => /\.c?js$/i.test(entry));
let checkedScripts = 0;
for (const script of scripts) {
  const code = extract(script).toString('utf8');
  for (const token of forbiddenContent) assert.ok(!code.includes(token), `Private content reference ${token} appears in ${script}`);
  checkedScripts += 1;
}
if (process.argv[3]) {
  const apiCode = fs.readFileSync(path.resolve(process.argv[3]), 'utf8');
  for (const token of forbiddenContent) assert.ok(!apiCode.includes(token), `Private content reference ${token} appears in the share API bundle`);
  checkedScripts += 1;
}
let checkedSamples = 0;
for (const pack of expected) {
  const packRoot = `dist/instruments/${pack.id}/`;
  assert.ok(hasPath(`${packRoot}instrument.json`), `Missing instrument metadata for ${pack.name}`);
  assert.ok(archiveEntries.some((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, '').startsWith(`${packRoot}samples/`)), `Missing recorded samples for ${pack.name}`);
  const instrument = parsePack(JSON.parse(extract(`${packRoot}instrument.json`).toString('utf8')) as unknown);
  assert.ok(instrument, `Invalid instrument metadata for ${pack.name}`);
  assert.equal(instrument.id, pack.id, `Instrument ID does not match the index for ${pack.name}`);
  assert.equal(instrument.license.spdx, pack.spdx, `Instrument license does not match the index for ${pack.name}`);
  assert.equal(instrument.license.author, pack.author, `Instrument attribution does not match the index for ${pack.name}`);
  assert.equal(instrument.license.source, pack.source, `Instrument source does not match the index for ${pack.name}`);

  const samplePaths = new Set(instrument.zones.map((zone) => zone.file).filter(Boolean));
  assert.ok(samplePaths.size > 0, `No recorded samples are referenced by ${pack.name}`);
  for (const samplePath of samplePaths) {
    assert.equal(path.posix.normalize(samplePath), samplePath, `Unsafe sample path in ${pack.name}: ${samplePath}`);
    assert.ok(samplePath.startsWith('samples/'), `Sample path is outside the pack sample directory for ${pack.name}: ${samplePath}`);
    assert.ok(hasPath(`${packRoot}${samplePath}`), `Missing sample ${samplePath} for ${pack.name}`);
    checkedSamples += 1;
  }

  assert.ok(pack.author.trim().length > 0, `Missing contributor attribution for ${pack.name}`);
  assert.ok(pack.source.trim().length > 0, `Missing source/license reference for ${pack.name}`);
  assert.ok(credits.includes(`## ${pack.name}\n`), `Missing share credit for ${pack.name}`);
}

for (const pack of privatePacks) {
  assert.ok(![...originalPathByNormalized.keys()].some((entry) => entry === `dist/instruments/${pack.id}` || entry.startsWith(`dist/instruments/${pack.id}/`)), `Private pack ${pack.id} appears in the share archive`);
  assert.ok(!credits.includes(`## ${pack.name}\n`), `Private pack ${pack.id} appears in share credits`);
}

for (const id of ['pianet-t', 'wurlitzer-ep200']) {
  const pack = bundleIndex.packs.find((entry) => entry.id === id);
  assert.ok(pack, `New CC-BY electric-piano pack ${id} is missing from the share archive`);
  assert.match(pack.spdx, /^CC-BY-/i, `${id} must retain its CC-BY license`);
}

const clarinet = bundleIndex.packs.find((entry) => entry.id === 'freepats-clarinet');
assert.ok(clarinet, 'FreePats Clarinet is missing from the share archive');
assert.equal(clarinet.spdx, 'CC0-1.0', 'FreePats Clarinet must retain its CC0 license');

const recorder = bundleIndex.packs.find((entry) => entry.id === 'freepats-recorder');
assert.ok(recorder, 'FreePats Wooden Recorder is missing from the share archive');
assert.equal(recorder.spdx, 'CC0-1.0', 'FreePats Wooden Recorder must retain its CC0 license');
assert.match(recorder.author, /Eugene Vlaskin \(performer and recording\)/, 'Recorder attribution must identify the performer');
const recorderPack = parsePack(JSON.parse(extract('dist/instruments/freepats-recorder/instrument.json').toString('utf8')) as unknown);
assert.ok(recorderPack, 'FreePats Wooden Recorder metadata is invalid in the share archive');
assert.equal(recorderPack.zones.length, 34, 'FreePats Wooden Recorder must keep all 34 randomized zones');
assert.ok(recorderPack.zones.every((zone) => zone.loop), 'FreePats Wooden Recorder must keep all sustain loops');
for (let note = 57; note <= 88; note++) {
  assert.ok(recorderPack.zones.some((zone) => zone.lokey <= note && zone.hikey >= note), `Recorder MIDI ${note} is missing from the share archive`);
}

console.log(`PASS · ${actualIds.length} redistributable packs, ${checkedSamples} referenced samples, and their credits are present; ${privatePacks.length} private packs, the local library, and stems are absent; ${checkedScripts} scripts contain no private pack references (${isDirectory ? 'share dist' : 'app.asar'}).`);
