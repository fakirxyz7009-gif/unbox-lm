import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.tmp', 'instrument-cache', 'freepats-bass');
const archivePath = path.join(cache, 'FingerBassYR-SFZ-FLAC-20190930.7z');
const sourceDirectory = path.join(cache, 'FingerBassYR SFZ+FLAC-20190930');
const sfzPath = path.join(sourceDirectory, 'FingerBassYR 20190930.sfz');
const sourceUrl = 'https://github.com/freepats/electric-bass-YR/releases/download/2019-09-30/FingerBassYR-SFZ%2BFLAC-20190930.7z';
const archiveHash = '36F87EC9EB086EF25050312522AACF71213C582F46989E0C5A12681304596587';
const samples = ['A#.flac', 'A.flac', 'B.flac', 'C#.flac', 'C.flac', 'D#.flac', 'D.flac', 'E.flac', 'F#.flac', 'F.flac', 'G#.flac', 'G.flac'];
const base = 'FingerBassYR SFZ+FLAC-20190930';
const expectedMembers = [
  `${base}/FingerBassYR 20190930.sfz`,
  `${base}/LICENSE.txt`,
  `${base}/README.txt`,
  ...samples.map((sample) => `${base}/samples/finger/${sample}`),
];

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
  if (process.argv.includes('--refresh') && fs.existsSync(archivePath)) fs.rmSync(archivePath);
  if (!fs.existsSync(archivePath)) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`FreePats bass download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== archiveHash) throw new Error('FreePats bass archive SHA-256 mismatch; refusing to extract changed content.');
    fs.writeFileSync(archivePath, bytes);
  }
  if (sha256(fs.readFileSync(archivePath)) !== archiveHash) {
    throw new Error('Cached FreePats bass archive SHA-256 mismatch; delete the cache or pass --refresh.');
  }
}

function validateAndExtract() {
  const members = run('tar', ['-tf', archivePath]).split(/\r?\n/).filter(Boolean).map((member) => member.replace(/\\/g, '/'));
  for (const member of members) {
    if (path.posix.isAbsolute(member) || member.split('/').includes('..')) {
      throw new Error(`Unsafe path in FreePats archive: ${member}`);
    }
  }
  const files = members.filter((member) => !member.endsWith('/')).sort();
  if (JSON.stringify(files) !== JSON.stringify([...expectedMembers].sort())) {
    throw new Error(`Unexpected members in FreePats bass archive: ${files.join(', ')}`);
  }
  run('tar', ['-xf', archivePath, '-C', cache]);

  const readme = fs.readFileSync(path.join(sourceDirectory, 'README.txt'), 'utf8');
  const license = fs.readFileSync(path.join(sourceDirectory, 'LICENSE.txt'), 'utf8');
  if (!/Sound samples created by Andrea Biasior/i.test(readme) ||
      !/Yamaha RBX bass guitar/i.test(readme) ||
      !/small edits to the samples and sound banks were made by <roberto@zenvoid\.org>/i.test(readme) ||
      !/Creative Commons CC0 public domain dedication/i.test(readme) ||
      !/CC0 1\.0 Universal/i.test(license)) {
    throw new Error('FreePats bass source no longer confirms the CC0 license and recording/bank credits.');
  }

  const sfz = fs.readFileSync(sfzPath, 'utf8');
  const regions = sfz.match(/^<region>\s*$/gim) ?? [];
  const referenced = [...sfz.matchAll(/^\s*sample=(.+)$/gim)].map((match) => match[1].trim().replace(/\\/g, '/')).sort();
  const expectedSamples = samples.map((sample) => `samples/finger/${sample}`).sort();
  if (regions.length !== 12 || JSON.stringify(referenced) !== JSON.stringify(expectedSamples) ||
      !/\blokey=26\s+hikey=28\b/i.test(sfz) || !/\bkey=29\b/i.test(sfz) ||
      !/\blokey=39\s+hikey=45\b/i.test(sfz) || !/\bkey=29\s+sample=samples\/finger\/F\.flac/i.test(sfz)) {
    throw new Error('FreePats finger-bass SFZ mapping changed; review its source key ranges before rebuilding.');
  }
  for (const sample of samples) {
    const file = path.join(sourceDirectory, 'samples', 'finger', sample);
    if (fs.readFileSync(file).toString('ascii', 0, 4) !== 'fLaC') throw new Error(`Invalid FLAC header in ${sample}`);
  }
}

async function main() {
  await ensureArchive();
  validateAndExtract();
  const args = [
    'scripts/local-temp.mjs', 'tsx', 'scripts/instruments/cli.ts', 'sfz', sfzPath,
    '--id', 'freepats-fingerstyle-bass', '--name', 'FreePats Fingerstyle Electric Bass', '--kind', 'melodic', '--category', 'bass',
    '--spdx', 'CC0-1.0',
    '--author', 'Andrea Biasior (recordings); Roberto (sound-bank processing)',
    '--source', 'https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html',
    '--description', 'Recorded fingerstyle Yamaha RBX electric bass from Andrea Biasior; CC0 samples assembled into an SFZ bank by FreePats.',
    '--notes', 'CC0 1.0. FreePats credits Andrea Biasior for creating the recordings and Roberto for small sample and sound-bank edits. Twelve chromatic source recordings cover MIDI 26–45; pitches between source roots use the nearest mapped sample.',
    '--keys', '26-45', '--max-seconds', '6',
  ];
  run(process.execPath, args, { stdio: 'inherit' });
  console.log(`Built the pinned FreePats fingerstyle-bass pack from ${path.relative(root, archivePath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
