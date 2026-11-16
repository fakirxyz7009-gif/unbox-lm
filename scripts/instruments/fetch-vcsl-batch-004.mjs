#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the fourth instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch-004.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    id: 'vcsl-didgeridoo',
    folder: 'Aerophones/Lip Aerophones/Didgeridoo',
    files: [
      'Didgeridoo1_Bark1_Main_rr3.wav',
      'Didgeridoo1_BarkDown2_Main.wav',
      'Didgeridoo1_Phrase1_Main.wav',
      'Didgeridoo1_Phrase3_Main.wav',
      'Didgeridoo1_Phrase5_Main.wav',
      'Didgeridoo1_Phrase6_Main.wav',
      'Didgeridoo1_Phrase8_Main.wav',
      'Didgeridoo1_Short1_Main_rr2.wav',
      'Didgeridoo1_Sus2_Main.wav',
      'Didgeridoo1_Sus3_Main.wav',
      'Didgeridoo1_Sus8_Main.wav',
      'Didgeridoo1_Tap1_Main_rr16.wav',
    ],
  },
  {
    id: 'vcsl-strumstick',
    folder: 'Chordophones/Composite Chordophones/Strumstick',
    files: [
      'Finger/Strumstick_Finger_Str1_Main_D2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_D2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_D2_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_E2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_E2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_E2_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_F#2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_F#2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_F#2_vl3_rr2.wav',
      'Finger/Strumstick_Finger_Str1_Main_G2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_G2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str1_Main_G2_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_A2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_A2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_A2_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_B2_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_B2_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_B2_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_C#3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_C#3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_C#3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_D3_vl1_rr2.wav',
      'Finger/Strumstick_Finger_Str2_Main_D3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str2_Main_D3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A4_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_A4_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_B3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_B3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_B3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_C#4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_C#4_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_C#4_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_D4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_D4_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_D4_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E4_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_E4_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#4_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_F#4_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_G3_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_G3_vl2_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_G3_vl3_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_G4_vl1_rr1.wav',
      'Finger/Strumstick_Finger_Str3_Main_G4_vl2_rr2.wav',
      'Finger/Strumstick_Finger_Str3_Main_G4_vl3_rr1.wav',
    ],
  },
  {
    id: 'vcsl-wine-glasses',
    folder: 'Idiophones/Friction Idiophones/Wine Glasses',
    files: [
      'Releases/Fast/glass1_D#4_Fast_1_Decay.wav',
      'Releases/Fast/glass2_F#4_Fast_1_Decay.wav',
      'Releases/Fast/glass3_A#4_Fast_1_Decay.wav',
      'Releases/Fast/glass4_D5_Fast_1_Decay.wav',
      'Releases/Slow/glass1_D#4_Slow_1_Decay.wav',
      'Releases/Slow/glass2_F#4_Slow_1_Decay.wav',
      'Releases/Slow/glass3_A#4_Slow_1_Decay.wav',
      'Releases/Slow/glass4_D5_Slow_2_Decay.wav',
      'Sustains/Fast/glass1_D#4_Fast_1_main.wav',
      'Sustains/Fast/glass2_F#4_Fast_1_Main.wav',
      'Sustains/Fast/glass3_A#4_Fast_1_Main.wav',
      'Sustains/Fast/glass4_D5_Fast_1_Main.wav',
      'Sustains/Slow/glass1_D#4_Slow_1_Main.wav',
      'Sustains/Slow/glass2_F#4_Slow_1_Main.wav',
      'Sustains/Slow/glass3_A#4_Slow_1_Main.wav',
      'Sustains/Slow/glass4_D5_Slow_2_Main.wav',
    ],
  },
  {
    id: 'vcsl-mbira-dzavadzimu',
    folder: 'Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B',
    files: [
      'MBira4_pluck_Main_A#1_14_50_100_rr1.wav',
      'MBira4_pluck_Main_A2_4_50_100_rr2.wav',
      'MBira4_pluck_Main_A3_5_50_100_rr1.wav',
      'MBira4_pluck_Main_A4_22_50_100_rr3.wav',
      'MBira4_pluck_Main_B2_13_50_100_rr3.wav',
      'MBira4_pluck_Main_B3_16_50_100_rr2.wav',
      'MBira4_pluck_Main_B3_3_50_100_rr2.wav',
      'MBira4_pluck_Main_B4_23_50_100_rr3.wav',
      'MBira4_pluck_Main_C#3_2_50_100_rr5.wav',
      'MBira4_pluck_Main_C#4_17_50_100_rr1.wav',
      'MBira4_pluck_Main_C#4_1_50_100_rr1.wav',
      'MBira4_pluck_Main_C#5_24_50_100_rr5.wav',
      'MBira4_pluck_Main_D#2_12_50_100_rr2.wav',
      'MBira4_pluck_Main_D#3_15_50_100_rr1.wav',
      'MBira4_pluck_Main_D#4_18_50_100_rr5.wav',
      'MBira4_pluck_Main_E2_10_50_100_rr3.wav',
      'MBira4_pluck_Main_E3_9_50_100_rr4.wav',
      'MBira4_pluck_Main_E4_19_50_100_rr2.wav',
      'MBira4_pluck_Main_F#2_8_50_100_rr2.wav',
      'MBira4_pluck_Main_F#3_11_50_100_rr2.wav',
      'MBira4_pluck_Main_F#4_20_50_100_rr3.wav',
      'MBira4_pluck_Main_G#2_6_50_100_rr1.wav',
      'MBira4_pluck_Main_G#3_7_50_100_rr2.wav',
      'MBira4_pluck_Main_G#4_21_50_100_rr3.wav',
    ],
  },
  {
    id: 'vcsl-clash-cymbals',
    folder: 'Idiophones/Struck Idiophones/Clash Cymbals 1',
    files: [
      'cymbal_crash1_ff2.wav',
      'cymbal_crash1_ff3.wav',
      'cymbal_crash1_mf1.wav',
      'cymbal_crash1_mf2.wav',
      'cymbal_crash1_mp1.wav',
      'cymbal_crash1_mp2.wav',
      'cymbal_crash1_pp1.wav',
      'cymbal_crash1_pp2.wav',
      'cymbal_crash1_short1.wav',
      'cymbal_crash1_short2.wav',
    ],
  },
];

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

for (const pack of PACKS) {
  const outDir = path.join(ROOT, pack.id, 'samples');
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of pack.files) {
    const out = path.join(outDir, path.basename(file));
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`skip ${pack.id}/${path.basename(file)}`);
      continue;
    }
    const url = `https://raw.githubusercontent.com/sgossner/VCSL/${REF}/${encodePath(`${pack.folder}/${file}`)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'unbox-instrument-batch' } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(out, bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    console.log(`${pack.id}/${path.basename(file)} ${bytes.length} bytes ${sha.slice(0, 16)}…`);
  }
}

console.log(`VCSL ${REF}: ${PACKS.length} folders ready in ${ROOT}`);
