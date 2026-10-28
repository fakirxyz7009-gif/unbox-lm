import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.tmp', 'instrument-cache', 'freepats-recorder');
const archivePath = path.join(cache, 'Recorder-SFZ-20201205.7z');
const sourceDirectory = path.join(cache, 'Recorder-SFZ-20201205');
const sourceSfzPath = path.join(sourceDirectory, 'Recorder-20201205.sfz');
const sfzPath = path.join(sourceDirectory, 'Recorder-Unbox-C4-E6.sfz');
const sourceUrl = 'https://freepats.zenvoid.org/Wind/Recorder1/Recorder-SFZ-20201205.7z';
const archiveHash = '24975F5F168F4D98B9E2EF0ED77C32A800A1DA3203EC9AE26614F35F670DF693';
const sevenZip = process.env.UNBOX_7ZIP_PATH ?? (process.platform === 'win32' && fs.existsSync('C:\\Program Files\\7-Zip\\7z.exe')
  ? 'C:\\Program Files\\7-Zip\\7z.exe' : '7z');
const roots = ['C5', 'D5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5', 'C6', 'C#6', 'D6', 'E6', 'F6', 'G6', 'A6'];
const expectedFiles = [
  'Recorder-SFZ-20201205/Recorder-20201205.sfz',
  'Recorder-SFZ-20201205/RecorderN1-20201205.sfz',
  'Recorder-SFZ-20201205/RecorderN2-20201205.sfz',
  'Recorder-SFZ-20201205/cc0.txt',
  'Recorder-SFZ-20201205/readme.txt',
  'Recorder-SFZ-20201205/recorder.png',
  ...roots.flatMap((note) => [`Recorder-SFZ-20201205/samples/${note}_01.wav`, `Recorder-SFZ-20201205/samples/${note}_02.wav`]),
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
  if (sha256(fs.readFileSync(archivePath)) !== archiveHash) throw new Error('Cached FreePats archive SHA-256 mismatch; delete the cache or pass --refresh.');
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
  const members = entries.filter((entry) => !entry.directory).map((entry) => entry.name);
  for (const member of [...members, ...directories]) {
    if (path.posix.isAbsolute(member) || member.split('/').includes('..')) {
      throw new Error(`Unsafe path in FreePats archive: ${member}`);
    }
  }
  if (JSON.stringify(members.sort()) !== JSON.stringify([...expectedFiles].sort()) ||
      JSON.stringify(directories) !== JSON.stringify(['Recorder-SFZ-20201205', 'Recorder-SFZ-20201205/samples'])) {
    throw new Error(`Unexpected members in FreePats archive: ${[...members, ...directories].join(', ')}`);
  }
  run(sevenZip, ['x', '-y', `-o${cache}`, archivePath]);

  const readme = fs.readFileSync(path.join(sourceDirectory, 'readme.txt'), 'utf8');
  const cc0 = fs.readFileSync(path.join(sourceDirectory, 'cc0.txt'), 'utf8');
  if (!/wooden recorder performed and recorded by Eugene Vlaskin/i.test(readme) ||
      !/processed and modified by\s+roberto@zenvoid\.org/i.test(readme) ||
      !/Creative Commons CC0 public domain dedication/i.test(readme) ||
      !/CC0 1\.0 Universal/i.test(cc0)) {
    throw new Error('FreePats metadata no longer confirms the performer, processor and CC0 terms.');
  }

  const sfz = fs.readFileSync(sourceSfzPath, 'utf8');
  const sfzLines = sfz.split(/\r?\n/).map((line) => line.trim());
  if (sfzLines.filter((line) => line.toLowerCase() === '<region>').length !== 34 ||
      sfzLines.filter((line) => line.startsWith('sample=samples/')).length !== 34 ||
      !sfzLines.some((line) => /^loop_mode=loop_continuous$/i.test(line))) {
    throw new Error('FreePats Recorder SFZ mapping changed; review its regions before rebuilding the pack.');
  }
  let shiftedDirectives = 0;
  const shiftedSfz = sfz.replace(/\b(lokey|hikey|key)=(\d+)\b/gim, (_match, opcode, value) => {
    const original = Number(value);
    if (original < 69 || original > 100) throw new Error(`Unexpected source key ${value}; refusing to shift the SFZ mapping.`);
    shiftedDirectives++;
    return `${opcode}=${original - 12}`;
  });
  if (shiftedDirectives !== 23) {
    throw new Error(`Expected 23 recorder key-map values before building the octave-shifted playable range; found ${shiftedDirectives}.`);
  }
  fs.writeFileSync(sfzPath, shiftedSfz);

  for (const member of expectedFiles.filter((item) => item.endsWith('.wav'))) {
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
    '--id', 'freepats-recorder', '--name', 'FreePats Wooden Recorder', '--kind', 'melodic', '--category', 'winds',
    '--spdx', 'CC0-1.0',
    '--author', 'Eugene Vlaskin (performer and recording); Roberto (sample processing and sound bank)',
    '--source', 'https://freepats.zenvoid.org/Wind/recorder.html',
    '--description', 'Wooden recorder performed and recorded by Eugene Vlaskin; looped sustain samples with two randomized takes for each mapped pitch.',
    '--notes', 'CC0 1.0. FreePats credits Eugene Vlaskin for recorder performance and recording in March 2018, and Roberto for raw-sample processing and sound-bank modifications. The mapped source range is shifted down one octave for a playable MIDI 57-88 range (C4-E6); samples retain their original root pitches.',
    '--keys', '57-88', '--max-rr', '2', '--max-seconds', '8', '--release', '0.4',
  ];
  run(process.execPath, args, { stdio: 'inherit' });
  console.log(`Built the pinned FreePats Recorder pack from ${path.relative(root, archivePath)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
