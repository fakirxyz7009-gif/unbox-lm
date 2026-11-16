#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the first instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    id: 'vcsl-claves',
    folder: 'Idiophones/Struck Idiophones/Claves',
    files: [
      'Claves1_Hit_v1_rr1_Mid.wav',
      'Claves1_Hit_v2_rr1_Mid.wav',
      'Claves1_Hit_v3_rr1_Mid.wav',
      'Claves2_Hit_v1_rr1_Mid.wav',
      'Claves2_Hit_v2_rr1_Mid.wav',
      'Claves2_Hit_v3_rr1_Mid.wav',
    ],
  },
  {
    id: 'vcsl-darbuka',
    folder: 'Membranophones/Struck Membranophones/Darbuka',
    files: Array.from({ length: 5 }, (_, hit) =>
      [1, 2].flatMap((vel) => [1, 2].map((rr) => `Darbuka_${hit + 1}_hit_vl${vel}_rr${rr}.wav`))
    ).flat(),
  },
  {
    id: 'vcsl-agogo-bells',
    folder: 'Idiophones/Struck Idiophones/Agogo Bells',
    files: [1, 2, 3].map((vel) => `Agogo_High_v${vel}_rr1_Mid.wav`).concat([1, 2].map((vel) => `Agogo_Low_v${vel}_rr1_Mid.wav`)),
  },
  {
    id: 'vcsl-kalimba-kenya',
    folder: 'Idiophones/Plucked Idiophones/Kalimba, Kenya',
    files: [
      'Mbira6_Normal_MainSpirit_A4_k1_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_B2_k8_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_B3_k12_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_B3_k3_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_B4_k15_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_C#3_k7_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_C#4_k2_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_D#3_k6_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_D#3_k9_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_D#4_k13_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_F#3_k10_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_F#3_k5_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_F#4_k14_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_G#3_k11_vl3_rr2.wav',
      'Mbira6_Normal_MainSpirit_G#3_k4_vl3_rr2.wav',
    ],
  },
  {
    id: 'vcsl-woodblock',
    folder: 'Idiophones/Struck Idiophones/Woodblock',
    files: [
      'wood_click2_mp.wav',
      'wood_click3_vl1.wav',
      'wood_click3_vl2.wav',
      'wood_click_f_rr1.wav',
      'wood_click_f_rr2.wav',
      'wood_click_ff.wav',
      'wood_click_mp.wav',
      'wood_click_pp_rr1.wav',
      'wood_click_pp_rr2.wav',
      'wood_click_pp_rr3.wav',
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
