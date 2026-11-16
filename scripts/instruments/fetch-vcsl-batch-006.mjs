#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the sixth instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch-006.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    "id": "vcsl-baroque-soprano-recorder",
    "folder": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder",
    "files": [
      "Sustain/SopRecorder_Sus_A#4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_A#5_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_C4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_C5_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_C6_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_D4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_D5_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_E4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_E5_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_F#4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_F#5_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_G#4_rr1_Main.wav",
      "Sustain/SopRecorder_Sus_G5_rr1_Main.wav"
    ]
  },
  {
    "id": "vcsl-baroque-tenor-recorder",
    "folder": "Aerophones/Edge-blown Aerophones/Baroque Tenor Recorder",
    "files": [
      "Sustain/TenRecorder_Sus_A#3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_A4_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_C3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_C4_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_C5_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_D3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_D4_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_E3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_E4_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_F#3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_F#4_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_G#3_rr1_Main.wav",
      "Sustain/TenRecorder_Sus_G#4_rr1_Main.wav"
    ]
  },
  {
    "id": "vcsl-ocarina-typical",
    "folder": "Aerophones/Edge-blown Aerophones/Ocarina, Typical",
    "files": [
      "Sustains/Sus/StdOcarina_Sus_A#4.wav",
      "Sustains/Sus/StdOcarina_Sus_A3.wav",
      "Sustains/Sus/StdOcarina_Sus_A4.wav",
      "Sustains/Sus/StdOcarina_Sus_B3.wav",
      "Sustains/Sus/StdOcarina_Sus_C#4.wav",
      "Sustains/Sus/StdOcarina_Sus_C#5.wav",
      "Sustains/Sus/StdOcarina_Sus_C5.wav",
      "Sustains/Sus/StdOcarina_Sus_D4.wav",
      "Sustains/Sus/StdOcarina_Sus_E4.wav",
      "Sustains/Sus/StdOcarina_Sus_F#4.wav",
      "Sustains/Sus/StdOcarina_Sus_G#4.wav"
    ]
  },
  {
    "id": "vcsl-renaissance-organ",
    "folder": "Aerophones/Edge-blown Aerophones/Renaissance Organ",
    "files": [
      "8'/RenOrgan_8foot_Room_A#1_rr1.wav",
      "8'/RenOrgan_8foot_Room_A#2_rr1.wav",
      "8'/RenOrgan_8foot_Room_A#3_rr1.wav",
      "8'/RenOrgan_8foot_Room_A#4_rr1.wav",
      "8'/RenOrgan_8foot_Room_C1_rr1.wav",
      "8'/RenOrgan_8foot_Room_C2_rr1.wav",
      "8'/RenOrgan_8foot_Room_C3_rr1.wav",
      "8'/RenOrgan_8foot_Room_C4_rr1.wav",
      "8'/RenOrgan_8foot_Room_C5_rr1.wav",
      "8'/RenOrgan_8foot_Room_D1_rr1.wav",
      "8'/RenOrgan_8foot_Room_D2_rr1.wav",
      "8'/RenOrgan_8foot_Room_D3_rr1.wav",
      "8'/RenOrgan_8foot_Room_D4_rr1.wav",
      "8'/RenOrgan_8foot_Room_D5_rr1.wav",
      "8'/RenOrgan_8foot_Room_E1_rr1.wav",
      "8'/RenOrgan_8foot_Room_E2_rr1.wav",
      "8'/RenOrgan_8foot_Room_E3_rr1.wav",
      "8'/RenOrgan_8foot_Room_E4_rr1.wav",
      "8'/RenOrgan_8foot_Room_E5_rr1.wav",
      "8'/RenOrgan_8foot_Room_F#1_rr1.wav",
      "8'/RenOrgan_8foot_Room_F#2_rr1.wav",
      "8'/RenOrgan_8foot_Room_F#3_rr1.wav",
      "8'/RenOrgan_8foot_Room_F#4_rr1.wav",
      "8'/RenOrgan_8foot_Room_G#1_rr1.wav",
      "8'/RenOrgan_8foot_Room_G#2_rr1.wav",
      "8'/RenOrgan_8foot_Room_G#3_rr1.wav",
      "8'/RenOrgan_8foot_Room_G#4_rr1.wav"
    ]
  },
  {
    "id": "vcsl-siren",
    "folder": "Aerophones/Free Aerophones/Siren",
    "files": [
      "Main_SirenWhistle-002.wav",
      "Main_SirenWhistle-005.wav",
      "Main_SirenWhistle-008.wav",
      "Main_SirenWhistle-009.wav",
      "Main_SirenWhistle-010.wav"
    ]
  },
  {
    "id": "vcsl-bass-drum-1",
    "folder": "Membranophones/Struck Membranophones/Bass Drum 1",
    "files": [
      "BDrumNew_hit_v2_rr1_Sum.wav",
      "BDrumNew_hit_v2_rr2_Sum.wav",
      "BDrumNew_hit_v3_rr1_Sum.wav",
      "BDrumNew_hit_v3_rr2_Sum.wav",
      "BDrumNew_hit_v5_rr1_Sum.wav",
      "BDrumNew_hit_v5_rr2_Sum.wav",
      "BDrumNew_hit_v7_rr1_Sum.wav",
      "BDrumNew_hit_v7_rr2_Sum.wav"
    ]
  },
  {
    "id": "vcsl-cabasa",
    "folder": "Idiophones/Struck Idiophones/Cabasa",
    "files": [
      "Cabasa1_Hit_rr1_Mid.wav",
      "Cabasa1_Hit_rr2_Mid.wav",
      "Cabasa1_Rub_v1_rr1_Mid.wav",
      "Cabasa1_Rub_v1_rr2_Mid.wav",
      "Cabasa1_Rub_v2_rr1_Mid.wav",
      "Cabasa1_Rub_v2_rr2_Mid.wav"
    ]
  },
  {
    "id": "vcsl-claps",
    "folder": "Idiophones/Struck Idiophones/Claps",
    "files": [
      "Clap_rr1.wav",
      "Clap_rr2.wav",
      "Clap_rr3.wav",
      "Clap_rr4.wav",
      "Clap_rr5.wav",
      "Clap_rr6.wav",
      "SoloClap_vl1.wav",
      "SoloClap_vl2.wav",
      "SoloClap_vl3.wav",
      "SoloClap_vl4.wav"
    ]
  },
  {
    "id": "vcsl-cowbells",
    "folder": "Idiophones/Struck Idiophones/Cowbells",
    "files": [
      "Cowbell1_Hit_v2_rr1_Mid.wav",
      "Cowbell1_Hit_v3_rr1_Mid.wav",
      "Cowbell1_Hit_v4_rr1_Mid.wav",
      "Cowbell1_Muted_v2_rr1_Mid.wav",
      "Cowbell1_Muted_v3_rr1_Mid.wav",
      "Cowbell1_Normal_v2_rr1_Mid.wav",
      "Cowbell1_Normal_v3_rr1_Mid.wav",
      "Cowbell2_Double_v2_rr1_Mid.wav",
      "Cowbell2_Double_v3_rr1_Mid.wav",
      "Cowbell2_Muted_v2_rr1_Mid.wav",
      "Cowbell2_Muted_v3_rr1_Mid.wav",
      "Cowbell2_Normal_v2_rr1_Mid.wav",
      "Cowbell2_Normal_v3_rr1_Mid.wav"
    ]
  },
  {
    "id": "vcsl-guiro",
    "folder": "Idiophones/Struck Idiophones/Guiro",
    "files": [
      "Guiro_Fast_rr1_Mid.wav",
      "Guiro_Hit_rr1_Mid.wav",
      "Guiro_Hit_rr2_Mid.wav",
      "Guiro_Med_rr1_Mid.wav",
      "Guiro_Slow_rr2_Mid.wav",
      "Legacy/guiro_long.wav",
      "Legacy/guiro_short.wav",
      "Legacy/guiro_superlong.wav"
    ]
  },
  {
    "id": "vcsl-hand-bells-nepalese",
    "folder": "Idiophones/Struck Idiophones/Hand Bells, Nepalese",
    "files": [
      "HB_1.wav",
      "HB_2.wav",
      "HB_3.wav"
    ]
  },
  {
    "id": "vcsl-mark-trees",
    "folder": "Idiophones/Struck Idiophones/Mark Trees",
    "files": [
      "Legacy/windchimes_asc1.wav",
      "Legacy/windchimes_desc1.wav",
      "Legacy/windchimes_fastAsc1.wav",
      "Legacy/windchimes_random.wav",
      "Legacy/windchimes_slowAsc1.wav",
      "Legacy/windchimes_slowDesc1.wav"
    ]
  },
  {
    "id": "vcsl-ratchet",
    "folder": "Idiophones/Struck Idiophones/Ratchet",
    "files": [
      "Ratchet1_Crank_rr1_Mid.wav",
      "Ratchet1_Crank_rr3_Mid.wav",
      "Ratchet1_Fast_rr1_Mid.wav",
      "Ratchet1_Slow_rr1_Mid.wav",
      "Ratchet2_Crank_v1_rr1_Mid.wav",
      "Ratchet2_Crank_v1_rr2_Mid.wav",
      "Ratchet2_Fast_rr1_Mid.wav",
      "Ratchet2_Slow_rr1_Mid.wav"
    ]
  },
  {
    "id": "vcsl-shaker-large",
    "folder": "Idiophones/Struck Idiophones/Shaker, Large",
    "files": [
      "LShaker_Hit_rr1_Mid.wav",
      "LShaker_Hit_rr2_Mid.wav",
      "LShaker_Shake1D_rr2_Mid.wav",
      "LShaker_Shake1D_rr3_Mid.wav",
      "LShaker_Shake1U_rr1_Mid.wav",
      "LShaker_Shake1U_rr4_Mid.wav"
    ]
  },
  {
    "id": "vcsl-slapstick",
    "folder": "Idiophones/Struck Idiophones/Slapstick",
    "files": [
      "slapstick_quiet_rr1.wav",
      "slapstick_quiet_rr2.wav",
      "slapstick_rr1.wav",
      "slapstick_rr2.wav",
      "slapstick_rr3.wav"
    ]
  },
  {
    "id": "vcsl-sleigh-bells",
    "folder": "Idiophones/Struck Idiophones/Sleigh Bells",
    "files": [
      "Sleighbells_Hit_rr1_Mid.wav",
      "Sleighbells_Hit_rr2_Mid.wav",
      "sleighbell1_shake1.wav",
      "sleighbell2_hit_2.wav",
      "sleighbell2_hit_loud.wav",
      "sleighbell2_shake1.wav"
    ]
  },
  {
    "id": "vcsl-suspended-cymbal-2",
    "folder": "Idiophones/Struck Idiophones/Suspended Cymbal 2",
    "files": [
      "susCymb2_bowed_2.wav",
      "susCymb2_bowed_4.wav",
      "susCymb2_bowed_6.wav",
      "susCymb2_cresc_2.5s2.wav",
      "susCymb2_cresc_4s.wav",
      "susCymb2_cresc_7s.wav",
      "susCymb2_hit_bell_f1.wav",
      "susCymb2_hit_bell_p1.wav",
      "susCymb2_hit_f1.wav",
      "susCymb2_hit_fff1.wav",
      "susCymb2_hit_mf1.wav",
      "susCymb2_hit_mp1.wav",
      "susCymb2_hit_pp1.wav",
      "susCymb2_hit_stick_mf1.wav",
      "susCymb2_hit_stick_mp1.wav",
      "susCymb2_hit_stick_pp1.wav",
      "susCymb2_roll_f1_nloop.wav",
      "susCymb2_roll_fff1_nloop.wav",
      "susCymb2_roll_pp1_nloop.wav",
      "susCymb2_scrape_2.wav"
    ]
  },
  {
    "id": "vcsl-triangles",
    "folder": "Idiophones/Struck Idiophones/Triangles",
    "files": [
      "Triangle1_HitM_v1_rr2_Mid.wav",
      "Triangle1_Hit_v1_rr1_Mid.wav",
      "Triangle1_Roll_rr1_Mid.wav",
      "Triangle3_HitM_v1_rr1_Mid.wav",
      "Triangle3_Hit_v1_rr1_Mid.wav",
      "Triangle3_Roll_v2_rr1_Mid.wav",
      "Triangle6_HitM_v1_rr1_Mid.wav",
      "Triangle6_Hit_v1_rr1_Mid.wav",
      "Triangle6_Roll_v2_rr1_Mid.wav"
    ]
  },
  {
    "id": "vcsl-tubular-glockenspiel",
    "folder": "Idiophones/Struck Idiophones/Tubular Glockenspiel",
    "files": [
      "A0_loud1.wav",
      "A0_medium1.wav",
      "A0_quiet1.wav",
      "A1_loud1.wav",
      "A1_medium1.wav",
      "A1_quiet1.wav",
      "B0_loud1.wav",
      "B0_medium1.wav",
      "B0_quiet1.wav",
      "C1_loud1.wav",
      "C1_medium1.wav",
      "C1_quiet1.wav",
      "D1_loud1.wav",
      "D1_medium1.wav",
      "D1_quiet1.wav",
      "E1_loud1.wav",
      "E1_medium1.wav",
      "E1_quiet1.wav",
      "F#1_loud1.wav",
      "F#1_medium1.wav",
      "F#1_quiet1.wav",
      "G0_loud1.wav",
      "G0_medium1.wav",
      "G0_quiet1.wav",
      "G1_loud1.wav",
      "G1_medium1.wav",
      "G1_quiet1.wav"
    ]
  },
  {
    "id": "vcsl-vibraslap",
    "folder": "Idiophones/Struck Idiophones/Vibraslap",
    "files": [
      "Legacy/vibraslap_rr1.wav",
      "Legacy/vibraslap_rr2.wav",
      "Legacy/vibraslap_rr3.wav",
      "Legacy/vibraslap_rr4.wav"
    ]
  }
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
