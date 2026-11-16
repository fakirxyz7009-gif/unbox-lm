#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the second instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch-002.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const hits = (prefix, velocities, suffix = 'Mid') =>
  velocities.flatMap((vel) => [1, 2].map((rr) => `${prefix}${vel}_rr${rr}_${suffix}.wav`));

const PACKS = [
  {
    id: 'vcsl-bongos',
    folder: 'Membranophones/Struck Membranophones/Bongos',
    files: [
      ...hits('BongoH_Hit1_v', ['1', '2', '3']),
      ...hits('BongoH_HitMuted1_v', ['1', '2', '3']),
      ...hits('BongoL_Hit1_v', ['1', '2', '3']),
      ...hits('BongoL_HitMuted2_v', ['1', '2', '3']),
    ],
  },
  {
    id: 'vcsl-conga',
    folder: 'Membranophones/Struck Membranophones/Conga',
    files: [
      ...hits('Conga_HitN_v', ['1', '2', '3'], 'Sum'),
      ...hits('Conga_HitFM_v', ['1', '2'], 'Sum'),
      ...hits('Quinto_HitN_v', ['1', '2', '3'], 'Sum'),
      ...hits('Quinto_HitFM1_v', ['1', '2'], 'Sum'),
      ...hits('Tumba_HitN_v', ['1', '2', '3', '4'], 'Sum'),
      ...hits('Tumba_HitFM_v', ['2', '3', '4'], 'Sum'),
    ],
  },
  {
    id: 'vcsl-balafon',
    folder: 'Idiophones/Struck Idiophones/Balafon/Hard Mallet',
    files: ['C#3', 'F3', 'C4', 'F4', 'C5', 'F5'].flatMap((note) =>
      ['1', '2', '3'].map((vel) => `EthnicXylo_hardM_${note}_vl${vel}_rr1_Mid.wav`)
    ),
  },
  {
    id: 'vcsl-tambourine',
    folder: 'Idiophones/Struck Idiophones/Tambourine 1',
    files: [
      'Tamb1_Hit_v1_rr1_Mid.wav',
      'Tamb1_Hit_v2_rr1_Mid.wav',
      'Tamb1_Shake_rr1_Mid.wav',
      'Tamb1_Shake_rr2_Mid.wav',
      'Tamb1_Roll_v1_rr1_Mid.wav',
      'Tamb1_Roll_v2_rr1_Mid.wav',
      'Tamb1_Roll_v3_rr1_Mid.wav',
    ],
  },
  {
    id: 'vcsl-vibraphone',
    folder: 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets',
    files: ['A2', 'A4', 'B3', 'C3', 'C5', 'D4', 'E3', 'E5', 'F2', 'F4', 'G3'].flatMap((note) =>
      ['2', '3'].map((vel) => `Vibes_hard_${note}_v${vel}_rr1_Main.wav`)
    ),
  },
];

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

for (const pack of PACKS) {
  const outDir = path.join(ROOT, pack.id, 'samples');
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of pack.files) {
    const out = path.join(outDir, file);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`skip ${pack.id}/${file}`);
      continue;
    }
    const url = `https://raw.githubusercontent.com/sgossner/VCSL/${REF}/${encodePath(`${pack.folder}/${file}`)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'unbox-instrument-batch' } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(out, bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    console.log(`${pack.id}/${file} ${bytes.length} bytes ${sha.slice(0, 16)}…`);
  }
}

console.log(`VCSL ${REF}: ${PACKS.length} folders ready in ${ROOT}`);
