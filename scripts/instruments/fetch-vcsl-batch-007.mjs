#!/usr/bin/env node
/**
 * Download the VCSL recordings used by the seventh instrument batch.
 *
 * VCSL publishes WAV recordings but no SFZ programs. The recipes in this
 * folder point at this cache; keeping the download separate makes the source
 * commit and the exact file list explicit.
 *
 * Usage: node scripts/instruments/fetch-vcsl-batch-007.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'data', 'instrument-cache');

const PACKS = [
  {
    "id": "vcsl-ball-whistle",
    "folder": "Aerophones/Edge-blown Aerophones/Ball Whistle",
    "files": [
      "Main_BallWhistle_Long-001.wav",
      "Main_BallWhistle_Short-001.wav"
    ]
  },
  {
    "id": "vcsl-baroque-alto-recorder",
    "folder": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain",
    "files": [
      "AltRecorder_Sus_A#3_rr1_Main.wav",
      "AltRecorder_Sus_A#4_rr1_Main.wav",
      "AltRecorder_Sus_C4_rr1_Main.wav",
      "AltRecorder_Sus_C5_rr1_Main.wav",
      "AltRecorder_Sus_D4_rr1_Main.wav",
      "AltRecorder_Sus_D5_rr1_Main.wav",
      "AltRecorder_Sus_E4_rr1_Main.wav",
      "AltRecorder_Sus_E5_rr1_Main.wav",
      "AltRecorder_Sus_F#4_rr1_Main.wav",
      "AltRecorder_Sus_F3_rr1_Main.wav",
      "AltRecorder_Sus_G#3_rr1_Main.wav",
      "AltRecorder_Sus_G#4_rr1_Main.wav"
    ]
  },
  {
    "id": "vcsl-ocarina-small",
    "folder": "Aerophones/Edge-blown Aerophones/Ocarina, Small/Sustain",
    "files": [
      "ocarina_A#4_sustain0.wav",
      "ocarina_A#5_sustain0.wav",
      "ocarina_A5_sustain0.wav",
      "ocarina_B5_sustain0.wav",
      "ocarina_C5_sustain0.wav",
      "ocarina_D5_sustain0.wav",
      "ocarina_E5_sustain0.wav",
      "ocarina_F5_sustain0.wav",
      "ocarina_G#5_sustain0.wav",
      "ocarina_G5_sustain0.wav"
    ]
  },
  {
    "id": "vcsl-harmonica-chromatic",
    "folder": "Aerophones/Free Aerophones/Harmonica-Hohner-Super64/Sustains/Normal",
    "files": [
      "Hohner-Super64_Normal _C2.wav",
      "Hohner-Super64_Normal _C3.wav",
      "Hohner-Super64_Normal _C4.wav",
      "Hohner-Super64_Normal _C5.wav",
      "Hohner-Super64_Normal _C6.wav",
      "Hohner-Super64_Normal _E2.wav",
      "Hohner-Super64_Normal _E3.wav",
      "Hohner-Super64_Normal _E4.wav",
      "Hohner-Super64_Normal _E5.wav",
      "Hohner-Super64_Normal _G2.wav",
      "Hohner-Super64_Normal _G3.wav",
      "Hohner-Super64_Normal _G4.wav",
      "Hohner-Super64_Normal _G5.wav"
    ]
  },
  {
    "id": "vcsl-concert-harp",
    "folder": "Chordophones/Composite Chordophones/Concert Harp",
    "files": [
      "KSHarp_A2_f1.wav",
      "KSHarp_A2_mf1.wav",
      "KSHarp_A4_f1.wav",
      "KSHarp_A4_mf1.wav",
      "KSHarp_A6_f1.wav",
      "KSHarp_A6_mf1.wav",
      "KSHarp_B1_f1.wav",
      "KSHarp_B1_mf1.wav",
      "KSHarp_B3_f1.wav",
      "KSHarp_B3_mf1.wav",
      "KSHarp_C3_f2.wav",
      "KSHarp_C3_mf3.wav",
      "KSHarp_C5_f1.wav",
      "KSHarp_C5_mf1.wav",
      "KSHarp_D2_f1.wav",
      "KSHarp_D2_mf1.wav",
      "KSHarp_D4_f1.wav",
      "KSHarp_D4_mf1.wav",
      "KSHarp_E1_f1.wav",
      "KSHarp_E3_f1.wav",
      "KSHarp_E3_mf1.wav",
      "KSHarp_E5_f1.wav",
      "KSHarp_E5_mf1.wav",
      "KSHarp_F2_f1.wav",
      "KSHarp_F2_mf1.wav",
      "KSHarp_F4_f1.wav",
      "KSHarp_F4_mf1.wav",
      "KSHarp_G3_f1.wav",
      "KSHarp_G3_mf1.wav",
      "KSHarp_G5_f1.wav",
      "KSHarp_G5_mf1.wav"
    ]
  },
  {
    "id": "vcsl-grand-piano",
    "folder": "Chordophones/Zithers/Grand Piano, Kawai/Sustains",
    "files": [
      "GPiano_sus_A#-1_v3_rr1_Player.wav",
      "GPiano_sus_A#-1_v4_rr1_Player.wav",
      "GPiano_sus_C0_v3_rr1_Player.wav",
      "GPiano_sus_C0_v4_rr1_Player.wav",
      "GPiano_sus_C1_v3_rr1_Player.wav",
      "GPiano_sus_C1_v4_rr1_Player.wav",
      "GPiano_sus_C2_v3_rr1_Player.wav",
      "GPiano_sus_C2_v4_rr1_Player.wav",
      "GPiano_sus_C3_v3_rr1_Player.wav",
      "GPiano_sus_C3_v4_rr1_Player.wav",
      "GPiano_sus_C4_v3_rr1_Player.wav",
      "GPiano_sus_C4_v4_rr1_Player.wav",
      "GPiano_sus_C5_v3_rr1_Player.wav",
      "GPiano_sus_C5_v4_rr1_Player.wav",
      "GPiano_sus_C6_v3_rr1_Player.wav",
      "GPiano_sus_C6_v4_rr1_Player.wav",
      "GPiano_sus_C7_v3_rr1_Player.wav",
      "GPiano_sus_C7_v4_rr1_Player.wav",
      "GPiano_sus_F#0_v3_rr1_Player.wav",
      "GPiano_sus_F#0_v4_rr1_Player.wav",
      "GPiano_sus_F#1_v3_rr1_Player.wav",
      "GPiano_sus_F#1_v4_rr1_Player.wav",
      "GPiano_sus_F#2_v3_rr1_Player.wav",
      "GPiano_sus_F#2_v4_rr1_Player.wav",
      "GPiano_sus_F#3_v3_rr1_Player.wav",
      "GPiano_sus_F#3_v4_rr1_Player.wav",
      "GPiano_sus_F#4_v3_rr1_Player.wav",
      "GPiano_sus_F#4_v4_rr1_Player.wav",
      "GPiano_sus_F#5_v3_rr1_Player.wav",
      "GPiano_sus_F#5_v4_rr1_Player.wav"
    ]
  },
  {
    "id": "vcsl-harpsichord-flemish",
    "folder": "Chordophones/Zithers/Harpsichord, Flemish/Sustains/Low",
    "files": [
      "HarpsiRH_Low_Far_A#0_rr1.wav",
      "HarpsiRH_Low_Far_A#1_rr1.wav",
      "HarpsiRH_Low_Far_A#2_rr1.wav",
      "HarpsiRH_Low_Far_A#3_rr1.wav",
      "HarpsiRH_Low_Far_A#4_rr1.wav",
      "HarpsiRH_Low_Far_C1_rr1.wav",
      "HarpsiRH_Low_Far_C2_rr1.wav",
      "HarpsiRH_Low_Far_C3_rr1.wav",
      "HarpsiRH_Low_Far_C4_rr1.wav",
      "HarpsiRH_Low_Far_C5_rr1.wav",
      "HarpsiRH_Low_Far_D1_rr1.wav",
      "HarpsiRH_Low_Far_D2_rr1.wav",
      "HarpsiRH_Low_Far_D3_rr1.wav",
      "HarpsiRH_Low_Far_D4_rr1.wav",
      "HarpsiRH_Low_Far_E1_rr1.wav",
      "HarpsiRH_Low_Far_E2_rr1.wav",
      "HarpsiRH_Low_Far_E3_rr1.wav",
      "HarpsiRH_Low_Far_E4_rr1.wav",
      "HarpsiRH_Low_Far_F#0_rr1.wav",
      "HarpsiRH_Low_Far_F#1_rr1.wav",
      "HarpsiRH_Low_Far_F#2_rr1.wav",
      "HarpsiRH_Low_Far_F#3_rr1.wav",
      "HarpsiRH_Low_Far_F#4_rr1.wav",
      "HarpsiRH_Low_Far_G#0_rr1.wav",
      "HarpsiRH_Low_Far_G#1_rr1.wav",
      "HarpsiRH_Low_Far_G#2_rr1.wav",
      "HarpsiRH_Low_Far_G#3_rr1.wav",
      "HarpsiRH_Low_Far_G#4_rr1.wav"
    ]
  },
  {
    "id": "vcsl-harpsichord-english",
    "folder": "Chordophones/Zithers/Harpsichord, English/Sustains/Normal",
    "files": [
      "ZuckermannKitHarpsi_Normal_Sus_A#0_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_A#1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_A#2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_A#3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_A#4_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_C1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_C2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_C3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_C4_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_C5_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_D1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_D2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_D3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_D4_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_D5_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_E1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_E2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_E3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_E4_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_E5_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_F#1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_F#2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_F#3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_F#4_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_G#1_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_G#2_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_G#3_rr1.wav",
      "ZuckermannKitHarpsi_Normal_Sus_G#4_rr1.wav"
    ]
  },
  {
    "id": "vcsl-glockenspiel",
    "folder": "Idiophones/Struck Idiophones/Glockenspiel",
    "files": [
      "glock_loud_C5_01.wav",
      "glock_loud_C6_01.wav",
      "glock_loud_C7_01.wav",
      "glock_loud_G#6_01.wav",
      "glock_loud_G4_01.wav",
      "glock_loud_G5_01.wav",
      "glock_medium_C5_01.wav",
      "glock_medium_C6_01.wav",
      "glock_medium_C7_01.wav",
      "glock_medium_G4_01.wav",
      "glock_medium_G5_01.wav",
      "glock_medium_G6_01.wav",
      "glock_soft_C5_02.wav",
      "glock_soft_C6_01.wav",
      "glock_soft_C7_03.wav",
      "glock_soft_G4_01.wav",
      "glock_soft_G5_01.wav",
      "glock_soft_G6_01.wav"
    ]
  },
  {
    "id": "vcsl-xylophone",
    "folder": "Idiophones/Struck Idiophones/Xylophone",
    "files": [
      "Hard Mallets/Xylo_Hard_C4_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_C4_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_C5_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_C5_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_C6_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_C6_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_C7_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_C7_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_G3_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_G3_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_G4_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_G4_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_G5_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_G5_pp_01_far.wav",
      "Hard Mallets/Xylo_Hard_G6_ff_01_far.wav",
      "Hard Mallets/Xylo_Hard_G6_pp_01_far.wav"
    ]
  },
  {
    "id": "vcsl-tubular-bells-1",
    "folder": "Idiophones/Struck Idiophones/Tubular Bells 1",
    "files": [
      "chimes_A#3_ff_rr1.wav",
      "chimes_A#3_pp_rr1.wav",
      "chimes_C3_f_rr1.wav",
      "chimes_C3_pp_rr2.wav",
      "chimes_C4_ff_rr2.wav",
      "chimes_C4_p_rr1.wav",
      "chimes_D3_ff_rr1.wav",
      "chimes_D3_pp_rr3.wav",
      "chimes_D4_ff_rr2.wav",
      "chimes_D4_p_rr1.wav",
      "chimes_E3_ff_rr2.wav",
      "chimes_E3_pp_rr1.wav",
      "chimes_E4_ff_rr2.wav",
      "chimes_E4_pp_rr3.wav",
      "chimes_F#3_fff_rr1.wav",
      "chimes_F#3_p_rr1.wav",
      "chimes_G#3_ff_rr1.wav",
      "chimes_G#3_p_rr2.wav"
    ]
  },
  {
    "id": "vcsl-cajon",
    "folder": "Idiophones/Struck Idiophones/Cajon",
    "files": [
      "Cajon_hit1_f_rr1.wav",
      "Cajon_hit1_f_rr2.wav",
      "Cajon_hit1_fff_rr1.wav",
      "Cajon_hit1_fff_rr2.wav",
      "Cajon_hit1_mp_rr1.wav",
      "Cajon_hit1_mp_rr2.wav",
      "Cajon_hit2_f_rr1.wav",
      "Cajon_hit2_f_rr2.wav",
      "Cajon_hit2_mp_rr1.wav",
      "Cajon_hit2_mp_rr2.wav",
      "Cajon_hit2_pp_rr1.wav",
      "Cajon_hit2_pp_rr2.wav",
      "Cajon_hit3_f_rr1.wav",
      "Cajon_hit3_f_rr2.wav",
      "Cajon_hit3_mp_rr1.wav",
      "Cajon_hit3_mp_rr2.wav",
      "Cajon_hit3_p_rr1.wav",
      "Cajon_hit3_p_rr2.wav"
    ]
  },
  {
    "id": "vcsl-finger-cymbals",
    "folder": "Idiophones/Struck Idiophones/Finger Cymbals",
    "files": [
      "Fing_Cymb.wav"
    ]
  },
  {
    "id": "vcsl-hi-hat",
    "folder": "Idiophones/Struck Idiophones/Hi-Hat Cymbal",
    "files": [
      "HiHat_Close_rr1_Mid.wav",
      "HiHat_Close_rr2_Mid.wav",
      "HiHat_HitC_v1_rr1_Mid.wav",
      "HiHat_HitC_v1_rr2_Mid.wav",
      "HiHat_HitC_v2_rr1_Mid.wav",
      "HiHat_HitC_v2_rr2_Mid.wav",
      "HiHat_HitC_v3_rr1_Mid.wav",
      "HiHat_HitC_v3_rr2_Mid.wav",
      "HiHat_HitC_v4_rr1_Mid.wav",
      "HiHat_HitC_v4_rr2_Mid.wav",
      "HiHat_HitLoose_rr1_Mid.wav",
      "HiHat_HitLoose_rr2_Mid.wav",
      "HiHat_HitOC_rr5_Mid.wav",
      "HiHat_HitO_rr1_Mid.wav",
      "HiHat_HitO_rr2_Mid.wav"
    ]
  },
  {
    "id": "vcsl-shaker-small",
    "folder": "Idiophones/Struck Idiophones/Shaker, Small",
    "files": [
      "Mid_ShakerDouble_Down_rr1.wav",
      "Mid_ShakerDouble_Down_rr2.wav",
      "Mid_ShakerDouble_Up_rr1.wav",
      "Mid_ShakerDouble_Up_rr2.wav",
      "Mid_ShakerHighFaster_Down_rr1.wav",
      "Mid_ShakerHighFaster_Down_rr2.wav",
      "Mid_ShakerHighFaster_Up_rr1.wav",
      "Mid_ShakerHighFaster_Up_rr2.wav",
      "Mid_ShakerLowFaster_Down_rr1.wav",
      "Mid_ShakerLowFaster_Down_rr2.wav",
      "Mid_ShakerLowFaster_Up_rr1.wav",
      "Mid_ShakerLowFaster_Up_rr2.wav",
      "Mid_Shaker_Roll_Fast_rr1.wav",
      "Mid_Shaker_Roll_Fast_rr2.wav",
      "Mid_Shaker_Slap_rr1.wav",
      "Mid_Shaker_Slap_rr2.wav"
    ]
  },
  {
    "id": "vcsl-snare-modern-1",
    "folder": "Membranophones/Struck Membranophones/Snare Drum, Modern 1",
    "files": [
      "Snare2_HitNS_v2_rr1_Mid.wav",
      "Snare2_HitNS_v2_rr2_Mid.wav",
      "Snare2_HitNS_v4_rr1_Mid.wav",
      "Snare2_HitNS_v4_rr2_Mid.wav",
      "Snare2_HitNS_v5_rr1_Mid.wav",
      "Snare2_HitNS_v5_rr2_Mid.wav",
      "Snare2_HitNS_v6_rr1_Mid.wav",
      "Snare2_HitNS_v6_rr2_Mid.wav",
      "Snare2_HitSN_v3_rr1_Mid.wav",
      "Snare2_HitSN_v3_rr2_Mid.wav",
      "Snare2_HitSN_v5_rr1_Mid.wav",
      "Snare2_HitSN_v5_rr2_Mid.wav",
      "Snare2_HitSN_v6_rr1_Mid.wav",
      "Snare2_HitSN_v6_rr2_Mid.wav",
      "Snare2_HitSN_v7_rr1_Mid.wav",
      "Snare2_HitSN_v7_rr2_Mid.wav",
      "Snare2_HitSN_v9_rr1_Mid.wav",
      "Snare2_HitSN_v9_rr2_Mid.wav",
      "Snare2_rollNS_v2_rr1_Mid.wav",
      "Snare2_rollNS_v3_rr1_Mid.wav",
      "Snare2_rollNS_v4_rr1_Mid.wav",
      "Snare2_rollNS_v5_rr1_Mid.wav",
      "Snare2_rollSN_v2_rr1_Mid.wav",
      "Snare2_rollSN_v4_rr1_Mid.wav",
      "Snare2_rollSN_v5_rr2_Mid.wav",
      "Snare2_stick_v1_rr1_Mid.wav",
      "Snare2_stick_v1_rr2_Mid.wav",
      "Snare2_taps_v4_rr1_Mid.wav",
      "Snare2_taps_v4_rr2_Mid.wav"
    ]
  },
  {
    "id": "vcsl-snare-modern-2",
    "folder": "Membranophones/Struck Membranophones/Snare Drum, Modern 2",
    "files": [
      "Snare3M_HitNS_v2_rr1_Mid.wav",
      "Snare3M_HitNS_v2_rr2_Mid.wav",
      "Snare3M_HitNS_v4_rr1_Mid.wav",
      "Snare3M_HitNS_v4_rr2_Mid.wav",
      "Snare3M_HitNS_v5_rr1_Mid.wav",
      "Snare3M_HitNS_v5_rr2_Mid.wav",
      "Snare3M_HitSN_v2_rr1_Mid.wav",
      "Snare3M_HitSN_v2_rr2_Mid.wav",
      "Snare3M_HitSN_v3_rr1_Mid.wav",
      "Snare3M_HitSN_v3_rr2_Mid.wav",
      "Snare3M_HitSN_v4_rr1_Mid.wav",
      "Snare3M_HitSN_v4_rr2_Mid.wav",
      "Snare3M_HitSN_v5_rr1_Mid.wav",
      "Snare3M_HitSN_v5_rr2_Mid.wav",
      "Snare3M_Xstick_v2_rr1_Mid.wav",
      "Snare3M_Xstick_v2_rr2_Mid.wav",
      "Snare3M_rollNS_v3_rr1_Mid.wav",
      "Snare3M_rollNS_v4_rr1_Mid.wav",
      "Snare3M_rollSN_v3_rr1_Mid.wav",
      "Snare3M_rollSN_v4_rr1_Mid.wav",
      "Snare3M_stick_v3_rr1_Mid.wav",
      "Snare3M_stick_v3_rr2_Mid.wav",
      "Snare3M_taps_v4_rr1_Mid.wav",
      "Snare3M_taps_v4_rr2_Mid.wav"
    ]
  },
  {
    "id": "vcsl-snare-rope-tension",
    "folder": "Membranophones/Struck Membranophones/Snare Drum, Rope Tension",
    "files": [
      "Hi/RopeSnare_hi_sn_Main_vl1_rr1.wav",
      "Hi/RopeSnare_hi_sn_Main_vl1_rr2.wav",
      "Hi/RopeSnare_hi_sn_Main_vl2_rr1.wav",
      "Hi/RopeSnare_hi_sn_Main_vl2_rr2.wav",
      "Hi/RopeSnare_hi_sn_Main_vl3_rr1.wav",
      "Hi/RopeSnare_hi_sn_Main_vl3_rr3.wav",
      "Hi/RopeSnare_hi_sn_Main_vl4_rr1.wav",
      "Hi/RopeSnare_hi_sn_Main_vl4_rr2.wav",
      "Low/RopeSnare_low_ns_Main_vl1_rr2.wav",
      "Low/RopeSnare_low_ns_Main_vl1_rr3.wav",
      "Low/RopeSnare_low_ns_Main_vl2_rr1.wav",
      "Low/RopeSnare_low_ns_Main_vl2_rr2.wav",
      "Low/RopeSnare_low_ns_Main_vl3_rr1.wav",
      "Low/RopeSnare_low_ns_Main_vl3_rr2.wav",
      "Low/RopeSnare_low_sn_Main_vl1_rr1.wav",
      "Low/RopeSnare_low_sn_Main_vl1_rr2.wav",
      "Low/RopeSnare_low_sn_Main_vl2_rr1.wav",
      "Low/RopeSnare_low_sn_Main_vl2_rr2.wav",
      "Low/RopeSnare_low_sn_Main_vl3_rr1.wav",
      "Low/RopeSnare_low_sn_Main_vl3_rr3.wav",
      "Low/RopeSnare_low_tsn_Main_vl1_rr1.wav",
      "Low/RopeSnare_low_tsn_Main_vl1_rr2.wav",
      "Low/RopeSnare_low_tsn_Main_vl2_rr1.wav",
      "Low/RopeSnare_low_tsn_Main_vl2_rr2.wav",
      "Low/RopeSnare_low_tsn_Main_vl3_rr1.wav",
      "Low/RopeSnare_low_tsn_Main_vl3_rr2.wav",
      "Low/RopeSnare_low_tsn_Main_vl4_rr1.wav",
      "Low/RopeSnare_low_tsn_Main_vl4_rr4.wav",
      "RopeSnare_sidestick_Main_vl2_rr1.wav",
      "RopeSnare_sidestick_Main_vl2_rr2.wav",
      "RopeSnare_stick_Main_vl1_rr1.wav",
      "RopeSnare_stick_Main_vl1_rr2.wav"
    ]
  },
  {
    "id": "vcsl-timpani-1",
    "folder": "Membranophones/Struck Membranophones/Timpani 1",
    "files": [
      "Hit/Timpani1_Hit_v2_rr1_Sum.wav",
      "Hit/Timpani1_Hit_v2_rr2_Sum.wav",
      "Hit/Timpani1_Hit_v3_rr3_Sum.wav",
      "Hit/Timpani1_Hit_v3_rr4_Sum.wav",
      "Hit/Timpani1_Hit_v4_rr1_Sum.wav",
      "Hit/Timpani1_Hit_v4_rr2_Sum.wav",
      "Hit/Timpani2_Hit_v2_rr1_Sum.wav",
      "Hit/Timpani2_Hit_v2_rr2_Sum.wav",
      "Hit/Timpani2_Hit_v3_rr1_Sum.wav",
      "Hit/Timpani2_Hit_v3_rr2_Sum.wav",
      "Hit/Timpani2_Hit_v4_rr1_Sum.wav",
      "Hit/Timpani2_Hit_v4_rr2_Sum.wav",
      "Hit/Timpani3_Hit_v2_rr1_Sum.wav",
      "Hit/Timpani3_Hit_v2_rr2_Sum.wav",
      "Hit/Timpani3_Hit_v3_rr1_Sum.wav",
      "Hit/Timpani3_Hit_v3_rr2_Sum.wav",
      "Hit/Timpani3_Hit_v4_rr1_Sum.wav",
      "Hit/Timpani3_Hit_v4_rr2_Sum.wav",
      "Hit/Timpani4_Hit_v2_rr1_Sum.wav",
      "Hit/Timpani4_Hit_v2_rr2_Sum.wav",
      "Hit/Timpani4_Hit_v3_rr1_Sum.wav",
      "Hit/Timpani4_Hit_v3_rr2_Sum.wav",
      "Hit/Timpani4_Hit_v4_rr1_Sum.wav",
      "Hit/Timpani4_Hit_v4_rr2_Sum.wav",
      "Hit/Timpani5_Hit_v2_rr1_Sum.wav",
      "Hit/Timpani5_Hit_v2_rr2_Sum.wav",
      "Hit/Timpani5_Hit_v3_rr1_Sum.wav",
      "Hit/Timpani5_Hit_v3_rr2_Sum.wav",
      "Hit/Timpani5_Hit_v4_rr1_Sum.wav",
      "Hit/Timpani5_Hit_v4_rr2_Sum.wav",
      "Roll/Timpani1_Roll_v3_rr1_Sum.wav",
      "Roll/Timpani1_Roll_v5_rr1_Sum.wav",
      "Roll/Timpani2_Roll_v3_rr1_Sum.wav",
      "Roll/Timpani2_Roll_v5_rr1_Sum.wav",
      "Roll/Timpani3_Roll_v3_rr1_Sum.wav",
      "Roll/Timpani3_Roll_v5_rr1_Sum.wav",
      "Roll/Timpani4_Roll_v3_rr1_Sum.wav",
      "Roll/Timpani4_Roll_v5_rr1_Sum.wav",
      "Roll/Timpani5_Roll_v2_rr1_Sum.wav",
      "Roll/Timpani5_Roll_v4_rr1_Sum.wav"
    ]
  },
  {
    "id": "vcsl-tom-1",
    "folder": "Membranophones/Struck Membranophones/Tom 1",
    "files": [
      "Mallet/TomH_HitM_v2_rr1_Mid.wav",
      "Mallet/TomH_HitM_v2_rr2_Mid.wav",
      "Mallet/TomH_HitM_v3_rr1_Mid.wav",
      "Mallet/TomH_HitM_v3_rr2_Mid.wav",
      "Mallet/TomH_HitM_v4_rr1_Mid.wav",
      "Mallet/TomH_HitM_v4_rr2_Mid.wav",
      "Mallet/TomH_RollM_v1_rr1_Mid.wav",
      "Mallet/TomH_RollM_v2_rr1_Mid.wav",
      "Stick/TomH_HitS_v2_rr1_Mid.wav",
      "Stick/TomH_HitS_v2_rr2_Mid.wav",
      "Stick/TomH_HitS_v3_rr1_Mid.wav",
      "Stick/TomH_HitS_v3_rr2_Mid.wav",
      "Stick/TomH_HitS_v4_rr1_Mid.wav",
      "Stick/TomH_HitS_v4_rr2_Mid.wav",
      "Stick/TomH_RollS_v1_rr1_Mid.wav",
      "Stick/TomH_RollS_v2_rr1_Mid.wav",
      "TomH_rimFLS_rr2_Mid.wav",
      "TomH_rimFLS_rr4_Mid.wav",
      "TomH_rimS_v2_rr1_Mid.wav",
      "TomH_rimS_v2_rr2_Mid.wav",
      "TomH_rimS_v4_rr1_Mid.wav",
      "TomH_rimS_v4_rr2_Mid.wav"
    ]
  }
];

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

const tasks = PACKS.flatMap((pack) => pack.files.map((file) => ({ pack, file })));
let next = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= tasks.length) return;
    const { pack, file } = tasks[index];
    const outDir = path.join(ROOT, pack.id, 'samples');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, path.basename(file));
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`skip ${pack.id}/${path.basename(file)}`);
      continue;
    }
    const url = `https://raw.githubusercontent.com/sgossner/VCSL/${REF}/${encodePath(`${pack.folder}/${file}`)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'unbox-instrument-batch' },
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(out, bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    console.log(`${pack.id}/${path.basename(file)} ${bytes.length} bytes ${sha.slice(0, 16)}…`);
  }
}

await Promise.all(Array.from({ length: 10 }, () => worker()));

console.log(`VCSL ${REF}: ${PACKS.length} folders ready in ${ROOT}`);
