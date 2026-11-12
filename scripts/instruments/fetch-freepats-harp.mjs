import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.tmp', 'instrument-cache', 'freepats-harp');
const archivePath = path.join(cache, 'ConcertHarp-SFZ-FLAC-20200702.tar.gz');
const sourceDirectory = path.join(cache, 'ConcertHarp-SFZ+FLAC-20200702');
const sfzPath = path.join(sourceDirectory, 'ConcertHarp-20200702.sfz');
const sourceUrl = 'https://freepats.zenvoid.org/OrchestralStrings/ConcertHarp/ConcertHarp-SFZ%2BFLAC-20200702.tar.gz';
const archiveHash = '7D3A77E4E9501D733A032CB7D93BC7567F47E4078325328EFE7B45FB03AC48AD';
const samples = [
  'A2_f1.flac', 'A2_mf1.flac', 'A6_f1.flac', 'A6_mf1.flac', 'B1_f1.flac', 'B1_mf1.flac',
  'B3_f1.flac', 'B3_mf1.flac', 'B5_f1.flac', 'B5_mf1.flac', 'B6_f1.flac', 'B6_mf1.flac',
  'C3_f2.flac', 'C3_mf3.flac', 'C5_f1.flac', 'D2_f1.flac', 'D4_mf1.flac', 'D6_f1.flac',
  'D6_mf1.flac', 'D7_f1.flac', 'E1_f1.flac', 'E3_f1.flac', 'E3_mf1.flac', 'E5_f1.flac',
  'E5_mf1.flac', 'F2_f1.flac', 'F4_f1.flac', 'F4_mf1.flac', 'F6_f1.flac', 'F6_mf1.flac',
  'F7_f1.flac', 'G1_f1.flac', 'G3_f1.flac', 'G3_mf1.flac', 'G5_f1.flac', 'G5_mf1.flac',
];
const base = 'ConcertHarp-SFZ+FLAC-20200702';
const expectedMembers = [
  `${base}/ConcertHarp-20200702.sfz`,
  `${base}/readme.txt`,
  ...samples.map((sample) => `${base}/samples/${sample}`),
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
    if (!response.ok) throw new Error(`FreePats download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== archiveHash) throw new Error('FreePats harp archive SHA-256 mismatch; refusing to extract changed content.');
    fs.writeFileSync(archivePath, bytes);
  }
  if (sha256(fs.readFileSync(archivePath)) !== archiveHash) {
    throw new Error('Cached FreePats harp archive SHA-256 mismatch; delete the cache or pass --refresh.');
  }
}

function validateAndExtract() {
  const members = run('tar', ['-tzf', archivePath]).split(/\r?\n/).filter(Boolean).map((member) => member.replace(/\\/g, '/'));
  for (const member of members) {
    if (path.posix.isAbsolute(member) || member.split('/').includes('..')) {
      throw new Error(`Unsafe path in FreePats archive: ${member}`);
    }
  }
  const files = members.filter((member) => !member.endsWith('/')).sort();
  if (JSON.stringify(files) !== JSON.stringify([...expectedMembers].sort())) {
    throw new Error(`Unexpected members in FreePats harp archive: ${files.join(', ')}`);
  }
  run('tar', ['-xzf', archivePath, '-C', cache]);

  const readme = fs.readFileSync(path.join(sourceDirectory, 'readme.txt'), 'utf8');
  if (!/Performer:\s*K\. Smith\b/i.test(readme) ||
      !/Versilian Community Sample\s+Library/i.test(readme) ||
      !/sound bank is assembled by roberto/i.test(readme) ||
      !/Creative Commons CC0 public domain dedication/i.test(readme)) {
    throw new Error('FreePats readme no longer confirms the CC0 license, performer, and sample-bank credits.');
  }

  const sfz = fs.readFileSync(sfzPath, 'utf8');
  const regions = sfz.match(/^<region>\s*$/gim) ?? [];
  const referenced = [...sfz.matchAll(/^sample=(.+)$/gim)].map((match) => match[1].trim()).sort();
  const expectedSamples = samples.map((sample) => `samples/${sample}`).sort();
  if (regions.length !== samples.length || JSON.stringify(referenced) !== JSON.stringify(expectedSamples) ||
      (sfz.match(/\bhivel=90\b/gi) ?? []).length !== 14 || (sfz.match(/\blovel=91\b/gi) ?? []).length !== 14 ||
      !/\bampeg_release=5\b/i.test(sfz)) {
    throw new Error('FreePats Concert Harp SFZ mapping changed; review its ranges and velocity layers before rebuilding.');
  }
  for (const sample of samples) {
    const file = path.join(sourceDirectory, 'samples', sample);
    if (fs.readFileSync(file).toString('ascii', 0, 4) !== 'fLaC') throw new Error(`Invalid FLAC header in ${sample}`);
  }
}

async function main() {
  await ensureArchive();
  validateAndExtract();
  const args = [
    'scripts/local-temp.mjs', 'tsx', 'scripts/instruments/cli.ts', 'sfz', sfzPath,
    '--id', 'freepats-concert-harp', '--name', 'FreePats Concert Harp', '--kind', 'melodic', '--category', 'strings',
    '--spdx', 'CC0-1.0',
    '--author', 'K. Smith (performer); Roberto (sound-bank assembly); Versilian Studios LLC (sample source)',
    '--source', 'https://freepats.zenvoid.org/OrchestralStrings/harp.html',
    '--description', 'Recorded concert harp performed by K. Smith; CC0 samples from the Versilian Community Sample Library, assembled by FreePats.',
    '--notes', 'CC0 1.0. FreePats credits K. Smith as performer, Roberto for sound-bank assembly, and Versilian Studios LLC for the original VCSL recordings. Thirty-six source recordings include two velocity layers on part of the range and cover MIDI 28–102.',
    '--keys', '28-102',
  ];
  run(process.execPath, args, { stdio: 'inherit' });
  console.log(`Built the pinned FreePats Concert Harp pack from ${path.relative(root, archivePath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
