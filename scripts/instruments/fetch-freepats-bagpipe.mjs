import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.tmp', 'instrument-cache', 'freepats-bagpipe');
const archivePath = path.join(cache, 'Bagpipe-small-SFZ-FLAC-20260806.7z');
const unpackDirectory = path.join(cache, 'unpacked');
const sourceDirectory = path.join(unpackDirectory, 'Bagpipe small SFZ+FLAC-20260806');
const sfzPath = path.join(sourceDirectory, 'Bagpipe small 20260806.sfz');
const sourceUrl = 'https://github.com/freepats/bagpipe/releases/download/2026-08-06/Bagpipe-small-SFZ%2BFLAC-20260806.7z';
const sourceRevision = '496f2f6e82f226d650e270c0f0ad5febbebec249';
const archiveHash = '260B9D95BB73DA7502FAD8603CB7409C249046D1EAFB9BF7FDF3D3FC56102633';
const sevenZip = process.env.UNBOX_7ZIP_PATH ?? (process.platform === 'win32' && fs.existsSync('C:\\Program Files\\7-Zip\\7z.exe')
  ? 'C:\\Program Files\\7-Zip\\7z.exe' : '7z');
const samples = [
  'A#4_31.flac', 'A4_31.flac', 'B4_31.flac', 'C#5_31.flac', 'C5_32.flac',
  'D#5_31.flac', 'D5_31.flac', 'drone_G2_1.flac', 'drone_G3_3.flac', 'E5_32.flac',
  'F#5_31.flac', 'F5_31.flac', 'G4_31.flac', 'G5_31.flac',
];
const base = 'Bagpipe small SFZ+FLAC-20260806';
const expectedFiles = [
  `${base}/Bagpipe small 20260806.sfz`,
  `${base}/LICENSE.txt`,
  `${base}/README.txt`,
  `${base}/picture.jpg`,
  ...samples.map((sample) => `${base}/samples/small/${sample}`),
];
const expectedDirectories = [base, `${base}/samples`, `${base}/samples/small`];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function ensureArchive() {
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(archivePath)) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`FreePats download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== archiveHash) throw new Error('FreePats bagpipe archive SHA-256 mismatch; refusing to extract changed content.');
    fs.writeFileSync(archivePath, bytes);
  }
  if (sha256(fs.readFileSync(archivePath)) !== archiveHash) throw new Error('Cached FreePats bagpipe archive SHA-256 mismatch; delete the cache and retry.');
}

function validateAndExtract() {
  const listing = run(sevenZip, ['l', '-slt', archivePath]);
  const entries = listing.split(/\r?\n\r?\n/).map((block) => {
    const match = /^Path = (.+)$/m.exec(block);
    if (!match) return null;
    const name = match[1].replace(/\\/g, '/');
    if (path.resolve(root, name).toLowerCase() === archivePath.toLowerCase()) return null;
    return { name, directory: /^Attributes = D\b/m.test(block) };
  }).filter((entry) => entry !== null);
  const directories = entries.filter((entry) => entry.directory).map((entry) => entry.name).sort();
  const members = entries.filter((entry) => !entry.directory).map((entry) => entry.name).sort();
  for (const member of [...members, ...directories]) {
    if (path.posix.isAbsolute(member) || member.split('/').includes('..')) {
      throw new Error(`Unsafe path in FreePats archive: ${member}`);
    }
  }
  if (JSON.stringify(members) !== JSON.stringify([...expectedFiles].sort()) ||
      JSON.stringify(directories) !== JSON.stringify([...expectedDirectories].sort())) {
    throw new Error(`Unexpected members in FreePats bagpipe archive: ${[...members, ...directories].join(', ')}`);
  }

  fs.mkdirSync(unpackDirectory, { recursive: true });
  run(sevenZip, ['x', '-y', `-o${unpackDirectory}`, archivePath]);

  const readme = fs.readFileSync(path.join(sourceDirectory, 'README.txt'), 'utf8');
  const license = fs.readFileSync(path.join(sourceDirectory, 'LICENSE.txt'), 'utf8');
  if (!/Samples recorded on August 2020 by Gilles Sadowski/i.test(readme) ||
      !/bagpipe in G designed by Rémy Dubois and built by Olle Geris/i.test(readme) ||
      !/CC0 1\.0 Universal/i.test(license)) {
    throw new Error('FreePats metadata no longer confirms the performer, instrument credits, and CC0 terms.');
  }

  const sfz = fs.readFileSync(sfzPath, 'utf8');
  const lines = sfz.split(/\r?\n/).map((line) => line.trim());
  const loopStarts = sfz.match(/\bloop_start=\d+\b/gi) ?? [];
  const loopEnds = sfz.match(/\bloop_end=\d+\b/gi) ?? [];
  if (lines.filter((line) => line.toLowerCase() === '<region>').length !== samples.length ||
      lines.filter((line) => line.startsWith('sample=')).length !== samples.length ||
      loopStarts.length !== samples.length || loopEnds.length !== samples.length ||
      !lines.some((line) => /^loop_mode=loop_continuous$/i.test(line))) {
    throw new Error('FreePats Bagpipe SFZ mapping or loop points changed; review it before rebuilding the pack.');
  }
  for (const sample of samples) {
    const file = path.join(sourceDirectory, 'samples', 'small', sample);
    if (fs.readFileSync(file).toString('ascii', 0, 4) !== 'fLaC') throw new Error(`Invalid FLAC header in ${sample}`);
  }
}

async function main() {
  await ensureArchive();
  validateAndExtract();
  const args = [
    'scripts/local-temp.mjs', 'tsx', 'scripts/instruments/cli.ts', 'sfz', sfzPath,
    '--id', 'freepats-bagpipe', '--name', 'FreePats Bagpipe in G', '--kind', 'melodic', '--category', 'winds',
    '--spdx', 'CC0-1.0',
    '--author', 'Gilles Sadowski (performer and recording); Rémy Dubois (instrument designer); Olle Geris (instrument builder)',
    '--source', `https://github.com/freepats/bagpipe/tree/${sourceRevision}`,
    '--description', 'Real bagpipe in G recordings by Gilles Sadowski, with sustained note samples and two octave-specific drones.',
    '--notes', 'CC0 1.0. The FreePats source identifies Gilles Sadowski as recorder and performer, Rémy Dubois as instrument designer, and Olle Geris as builder. The small SFZ release maps G2 and G3 drones to MIDI 36–59 and chromatic bagpipe samples to MIDI 64–81; MIDI 60–63 is intentionally unmapped. Original SFZ loop points are retained.',
    '--release', '0.5', '--keys', '36-81',
  ];
  run(process.execPath, args, { stdio: 'inherit' });
  console.log(`Built the pinned FreePats Bagpipe pack from ${path.relative(root, archivePath)} (${sourceRevision}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
