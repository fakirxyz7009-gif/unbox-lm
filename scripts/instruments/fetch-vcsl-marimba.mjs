import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, 'data', 'instrument-cache', 'vcsl-marimba');
const revision = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const sourceDir = 'Idiophones/Struck Idiophones/Marimba';
const source = JSON.parse(fs.readFileSync(new URL('./vcsl-marimba-source.json', import.meta.url), 'utf8'));
const refresh = process.argv.includes('--refresh');
const pitches = ['F1', 'C2', 'G2', 'B2', 'F3', 'C4', 'G4', 'B4', 'F5', 'C6'];
const samples = pitches.flatMap((pitch) => ['soft', 'med', 'loud'].map((dynamic) => `Marimba_hit_Outrigger_${pitch}_${dynamic}_01.wav`));
const expected = new Map([
  ['LICENSE', 'LICENSE'], ['README.md', 'README.md'],
  ...samples.map((file) => [`samples/${file}`, `${sourceDir}/${file}`]),
]);

if (source.revision !== revision || source.sourceDir !== sourceDir || !Array.isArray(source.files) || source.files.length !== expected.size) {
  throw new Error('The VCSL marimba source manifest does not match the pinned instrument.');
}
const seen = new Set();
for (const entry of source.files) {
  if (!entry || expected.get(entry.file) !== entry.source || seen.has(entry.file) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error('The VCSL marimba source manifest contains an invalid file entry.');
  }
  seen.add(entry.file);
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const valid = (bytes, entry) => bytes.length === entry.bytes && hash(bytes) === entry.sha256;

async function getFile(entry) {
  const destination = path.join(cache, entry.file);
  if (!refresh && fs.existsSync(destination) && valid(fs.readFileSync(destination), entry)) return;
  const encoded = entry.source.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://raw.githubusercontent.com/sgossner/VCSL/${revision}/${encoded}`);
  if (!response.ok) throw new Error(`${entry.source}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes, entry)) throw new Error(`VCSL source size/SHA-256 mismatch: ${entry.file}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}

async function main() {
  for (const entry of source.files) await getFile(entry);
  const license = fs.readFileSync(path.join(cache, 'LICENSE'), 'utf8');
  const readme = fs.readFileSync(path.join(cache, 'README.md'), 'utf8');
  if (!license.includes('CC0 1.0 Universal') || !readme.includes('open CC0 general-purpose sample library created by Versilian Studios LLC')) {
    throw new Error('VCSL source metadata does not confirm the CC0 license and library creator.');
  }
  let seconds = 0;
  for (const file of samples) {
    const bytes = fs.readFileSync(path.join(cache, 'samples', file));
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Invalid WAV header: ${file}`);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,bits_per_sample,duration', '-of', 'json', path.join(cache, 'samples', file)], { encoding: 'utf8', windowsHide: true });
    if (probe.error || probe.status !== 0) throw new Error(`ffprobe could not validate ${file}: ${probe.error?.message ?? probe.stderr}`);
    const stream = JSON.parse(probe.stdout).streams?.[0];
    const duration = Number(stream?.duration);
    if (Number(stream?.sample_rate) !== 44100 || stream?.channels !== 2 || stream?.bits_per_sample !== 24 || !Number.isFinite(duration) || duration < 0.1 || duration > 12) {
      throw new Error(`Unexpected WAV format or duration for ${file}`);
    }
    seconds += duration;
  }
  console.log(`Verified ${samples.length} pinned CC0 stereo 24-bit / 44.1 kHz marimba recordings (${seconds.toFixed(2)} source seconds), license and library attribution in ${path.relative(root, cache)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
