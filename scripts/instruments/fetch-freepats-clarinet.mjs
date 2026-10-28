import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.tmp', 'instrument-cache', 'freepats-clarinet');
const archivePath = path.join(cache, 'Clarinet-SFZ-20190818.tar.xz');
const sourceDirectory = path.join(cache, 'Clarinet-SFZ-20190818');
const sfzPath = path.join(sourceDirectory, 'Clarinet-20190818.sfz');
const sourceUrl = 'https://freepats.zenvoid.org/Reed/Clarinet1/Clarinet-SFZ-20190818.tar.xz';
const archiveHash = '481FD688F003FC4930E49123199FD88E7430376CB80F3ECFA685D7F610D20A98';
const expectedMembers = [
  'Clarinet-SFZ-20190818/Clarinet-20190818.sfz',
  'Clarinet-SFZ-20190818/readme.txt',
  ...['Bb3', 'Bb4', 'Bb5', 'D3', 'D4', 'D5', 'F3', 'F4', 'F5'].map((name) => `Clarinet-SFZ-20190818/samples/${name}.wav`),
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
    if (sha256(bytes) !== archiveHash) throw new Error('FreePats archive SHA-256 mismatch; refusing to extract changed content.');
    fs.writeFileSync(archivePath, bytes);
  }
  const archive = fs.readFileSync(archivePath);
  if (sha256(archive) !== archiveHash) throw new Error('Cached FreePats archive SHA-256 mismatch; delete the cache or pass --refresh.');
}

function validateAndExtract() {
  const members = run('tar', ['-tJf', archivePath]).split(/\r?\n/).filter(Boolean);
  for (const member of members) {
    if (path.posix.isAbsolute(member) || member.split('/').includes('..')) {
      throw new Error(`Unsafe path in FreePats archive: ${member}`);
    }
  }
  const files = members.filter((member) => !member.endsWith('/')).sort();
  if (JSON.stringify(files) !== JSON.stringify([...expectedMembers].sort())) {
    throw new Error(`Unexpected members in FreePats archive: ${files.join(', ')}`);
  }
  run('tar', ['-xJf', archivePath, '-C', cache]);

  const readme = fs.readFileSync(path.join(sourceDirectory, 'readme.txt'), 'utf8');
  if (!/Kaili Dence \(Performer\)/i.test(readme) || !/Tyler Dence\s*<[^>]+>\s*\(Recording Engineer\)/i.test(readme) ||
      !/Sound bank, loops and modifications to the samples by Roberto/i.test(readme) ||
      !/Creative Commons CC0 public domain dedication/i.test(readme)) {
    throw new Error('FreePats readme no longer confirms the CC0 license and performer/recording credits.');
  }
  const sfz = fs.readFileSync(sfzPath, 'utf8');
  if ((sfz.match(/<region>/gi) ?? []).length !== 9 || (sfz.match(/sample=samples\//gi) ?? []).length !== 9) {
    throw new Error('FreePats Clarinet SFZ mapping changed; review its zones before rebuilding the pack.');
  }
  for (const member of expectedMembers.filter((item) => item.endsWith('.wav'))) {
    const sample = fs.readFileSync(path.join(cache, member));
    if (sample.toString('ascii', 0, 4) !== 'RIFF' || sample.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error(`Invalid WAV header in ${member}`);
    }
  }
}

async function main() {
  await ensureArchive();
  validateAndExtract();
  const args = [
    'scripts/local-temp.mjs', 'tsx', 'scripts/instruments/cli.ts', 'sfz', sfzPath,
    '--id', 'freepats-clarinet', '--name', 'FreePats Clarinet', '--kind', 'melodic', '--category', 'winds',
    '--spdx', 'CC0-1.0', '--author', 'Kaili Dence (performer); Tyler Dence (recording engineer); Roberto (looping and sound-bank modifications)',
    '--source', 'https://freepats.zenvoid.org/Reed/clarinet.html',
    '--description', 'Recorded clarinet performed by Kaili Dence and recorded by Tyler Dence for the FreePats project; processed and mapped by Roberto.',
    '--notes', 'CC0 1.0. The FreePats readme credits Kaili Dence as performer, Tyler Dence as recording engineer, and Roberto for loops and sample modifications. Original samples were recorded with an Audio-Technica AT873R. Mapped range MIDI 45-91 with nine looped source notes.',
    '--keys', '45-91', '--max-seconds', '11', '--release', '0.4',
  ];
  run(process.execPath, args, { stdio: 'inherit' });
  console.log(`Built the pinned FreePats Clarinet pack from ${path.relative(root, archivePath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
