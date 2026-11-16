#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the third instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch-003.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    id: 'vcsl-harmonica',
    folder: 'Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal',
    files: ['C3', 'C4', 'C5', 'C6', 'E3', 'E4', 'E5', 'G4', 'G5'].map(
      (note) => `Hohner-Special20_Normal_${note}.wav`
    ),
  },
  {
    id: 'vcsl-dan-tranh',
    folder: 'Chordophones/Zithers/Dan Tranh/Normal',
    files: [
      'B1_f_1.wav', 'B2_f_1.wav', 'B3_f_1.wav', 'B4_f_1.wav',
      'C#2_f_1.wav', 'C#3_f_1.wav', 'C#4_f_1.wav',
      'D#2_f_1.wav', 'D#3_f_1.wav', 'D#4_f_1.wav',
      'F#2_f_1.wav', 'F#3_f_1.wav', 'F#4_f_1.wav',
      'G#2_f_1.wav', 'G#3_f_1.wav', 'G#4_f_1.wav',
    ],
  },
  {
    id: 'vcsl-harpsichord',
    folder: 'Chordophones/Zithers/Harpsichord, French/Sustains',
    files: [
      'Harpsi2_Normal_A#0_rr1_Main.wav', 'Harpsi2_Normal_A#1_rr1_Main.wav',
      'Harpsi2_Normal_A#2_rr1_Main.wav', 'Harpsi2_Normal_A#2_rr3_Main.wav',
      'Harpsi2_Normal_A#3_rr1_Main.wav', 'Harpsi2_Normal_A#4_rr1_Main.wav',
      'Harpsi2_Normal_C1_rr1_Main.wav', 'Harpsi2_Normal_C2_rr1_Main.wav',
      'Harpsi2_Normal_C3_rr1_Main.wav', 'Harpsi2_Normal_C4_rr1_Main.wav',
      'Harpsi2_Normal_C5_rr1_Main.wav', 'Harpsi2_Normal_D0_rr1_Main.wav',
      'Harpsi2_Normal_D1_rr1_Main.wav', 'Harpsi2_Normal_D2_rr1_Main.wav',
      'Harpsi2_Normal_D2_rr3_Main.wav', 'Harpsi2_Normal_D3_rr1_Main.wav',
      'Harpsi2_Normal_D4_rr1_Main.wav', 'Harpsi2_Normal_E1_rr1_Main.wav',
      'Harpsi2_Normal_E2_rr1_Main.wav', 'Harpsi2_Normal_E3_rr1_Main.wav',
      'Harpsi2_Normal_E4_rr1_Main.wav', 'Harpsi2_Normal_F#1_rr1_Main.wav',
      'Harpsi2_Normal_F#2_rr1_Main.wav', 'Harpsi2_Normal_F#3_rr1_Main.wav',
      'Harpsi2_Normal_F#4_rr1_Main.wav', 'Harpsi2_Normal_G#0_rr1_Main.wav',
      'Harpsi2_Normal_G#1_rr1_Main.wav', 'Harpsi2_Normal_G#2_rr1_Main.wav',
      'Harpsi2_Normal_G#3_rr1_Main.wav', 'Harpsi2_Normal_G#4_rr1_Main.wav',
    ],
  },
  {
    id: 'vcsl-psaltery',
    folder: 'Chordophones/Zithers/Psaltery, Bowed and Plucked/Pluck',
    files: [
      'BowedPsaltery_A#3_Main_Pluck_rr1.wav',
      'BowedPsaltery_A#4_Main_Pluck_rr1.wav',
      'BowedPsaltery_C4_Main_Pluck_rr1.wav',
      'BowedPsaltery_C5_Main_Pluck_rr1.wav',
      'BowedPsaltery_D4_Main_Pluck_rr1.wav',
      'BowedPsaltery_D5_Main_Pluck_rr1.wav',
      'BowedPsaltery_E4_Main_Pluck_rr2.wav',
      'BowedPsaltery_E5_Main_Pluck_rr1.wav',
      'BowedPsaltery_F#4_Main_Pluck_rr1.wav',
      'BowedPsaltery_F#5_Main_Pluck_rr3.wav',
      'BowedPsaltery_G#4_Main_Pluck_rr3.wav',
    ],
  },
  {
    id: 'vcsl-frame-drum',
    folder: 'Membranophones/Struck Membranophones/Frame Drum',
    files: [
      ...['2', '3'].flatMap((v) => ['1', '2'].map((rr) => `HDrumL_Hit_v${v}_rr${rr}_Sum.wav`)),
      ...['2', '3'].flatMap((v) => ['1', '2'].map((rr) => `HDrumL_HitMuted_v${v}_rr${rr}_Sum.wav`)),
      ...['2', '3'].flatMap((v) => ['1', '2'].map((rr) => `HDrumS_Hit_v${v}_rr${rr}_Sum.wav`)),
      ...['2', '3'].flatMap((v) => ['1', '2'].map((rr) => `HDrumS_HitMuted_v${v}_rr${rr}_Sum.wav`)),
    ],
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
