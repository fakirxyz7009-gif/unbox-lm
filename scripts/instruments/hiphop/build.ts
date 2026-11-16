/**
 * The hip-hop one-shot bank: 1000 playable sounds in eight kits of 125 pads, all synthesised here
 * (scripts/instruments/hiphop/synth.ts) — no recordings and no third-party audio, so the bank ships
 * under CC0 with no clearance work.
 *
 *   npx tsx scripts/instruments/hiphop/build.ts all
 *   npx tsx scripts/instruments/hiphop/build.ts hiphop-808
 *
 * Each kit is a normal recorded-pack device (`rec_hiphop_*`): pads 0–124, one lane per pad, one-shot
 * playback. buildPack() writes instrument.json, encodes the Ogg samples, and regenerates
 * public/instruments/index.json, CREDITS.md and shared/instruments/catalog.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DrumRole, PackLane } from '../../../shared/instruments/types.ts';
import { buildPack, type DraftZone, type Layer } from '../pack.ts';
import { PACK_RATE, writeWav16, type Pcm } from '../pcm.ts';
import * as synth from './synth.ts';

const SOUNDS_PER_KIT = 125;

interface SoundSpec {
  name: string;
  role?: DrumRole;
  render: () => Float32Array;
}

interface KitSpec {
  id: string;
  name: string;
  category: string;
  description: string;
  sounds: SoundSpec[];
}

/** Builds one variant group (`count` sounds) with numbered names. */
function series(
  count: number,
  prefix: string,
  role: DrumRole | undefined,
  seedBase: number,
  render: (seed: number, index: number) => Float32Array,
): SoundSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${String(index + 1).padStart(3, '0')}`,
    ...(role ? { role } : {}),
    render: () => render(seedBase + index * 977, index),
  }));
}

const license = {
  spdx: 'CC0-1.0',
  author: 'Unbox Studio — synthesised hip-hop bank',
  source: 'Synthesised in-repo by scripts/instruments/hiphop/build.ts',
  notes: 'No recordings or third-party samples: every one-shot is generated deterministically from a seed.',
} as const;

const KITS: readonly KitSpec[] = [
  {
    id: 'hiphop-kicks',
    name: 'Hip-Hop Kicks',
    category: 'drums',
    description: 'Synthesised hip-hop kick bank: 125 kick one-shots with tuned bodies, beater clicks and drive variants. Generated in-repo; no recordings.',
    sounds: series(SOUNDS_PER_KIT, 'Kick', 'kick', 1_000_003, (seed) => synth.kick(seed)),
  },
  {
    id: 'hiphop-snares',
    name: 'Hip-Hop Snares & Claps',
    category: 'drums',
    description: 'Synthesised hip-hop snare bank: 62 snares, 35 claps, 28 rims and clicks. Generated in-repo; no recordings.',
    sounds: [
      ...series(62, 'Snare', 'snare', 2_000_003, (seed) => synth.snare(seed)),
      ...series(35, 'Clap', 'clap', 2_100_003, (seed) => synth.clap(seed)),
      ...series(20, 'Rim', 'rim', 2_200_003, (seed) => synth.rim(seed)),
      ...series(8, 'Rim Click', 'rim', 2_300_003, (seed) => synth.woodblock(seed)),
    ],
  },
  {
    id: 'hiphop-hats',
    name: 'Hip-Hop Hats & Cymbals',
    category: 'drums',
    description: 'Synthesised hip-hop hat bank: 55 closed, 35 open and 15 pedal hats, 12 cymbals and 8 rides from inharmonic metal clusters. Generated in-repo; no recordings.',
    sounds: [
      ...series(55, 'Hat Closed', 'hatC', 3_000_003, (seed) => synth.hat(seed, 'closed')),
      ...series(35, 'Hat Open', 'hatO', 3_100_003, (seed) => synth.hat(seed, 'open')),
      ...series(15, 'Hat Pedal', 'hatP', 3_200_003, (seed) => synth.hat(seed, 'pedal')),
      ...series(12, 'Cymbal', 'cymbal', 3_300_003, (seed) => synth.cymbal(seed, false)),
      ...series(8, 'Ride', 'ride', 3_400_003, (seed) => synth.cymbal(seed, true)),
    ],
  },
  {
    id: 'hiphop-percussion',
    name: 'Hip-Hop Percussion',
    category: 'percussion',
    description: 'Synthesised hip-hop percussion: 30 shakers, 25 tambourines, 20 cowbells, 25 congas and 25 woodblocks. Generated in-repo; no recordings.',
    sounds: [
      ...series(30, 'Shaker', 'perc', 4_000_003, (seed) => synth.shaker(seed)),
      ...series(25, 'Tambourine', 'perc', 4_100_003, (seed) => synth.tambourine(seed)),
      ...series(20, 'Cowbell', 'perc', 4_200_003, (seed) => synth.cowbell(seed)),
      ...series(25, 'Conga', 'perc', 4_300_003, (seed) => synth.conga(seed)),
      ...series(25, 'Woodblock', 'perc', 4_400_003, (seed) => synth.woodblock(seed)),
    ],
  },
  {
    id: 'hiphop-808',
    name: '808 & Sub Bank',
    category: 'bass',
    description: 'Synthesised 808 bank: 70 sustained 808 hits across tuning and drive, 55 short sub hits. Generated in-repo; no recordings.',
    sounds: [
      ...series(70, '808', 'perc', 5_000_003, (seed) => synth.bass808(seed)),
      ...series(55, 'Sub', 'perc', 5_100_003, (seed) => synth.subHit(seed)),
    ],
  },
  {
    id: 'hiphop-bass',
    name: 'Hip-Hop Bass Plucks',
    category: 'bass',
    description: 'Synthesised hip-hop bass: 125 plucked bass one-shots from saw-plus-sine sources through moving low-pass tone. Generated in-repo; no recordings.',
    sounds: series(SOUNDS_PER_KIT, 'Bass Pluck', 'perc', 6_000_003, (seed) => synth.bassPluck(seed)),
  },
  {
    id: 'hiphop-keys',
    name: 'Hip-Hop Keys & Stabs',
    category: 'keys',
    description: 'Synthesised hip-hop keys: 75 chord hits (minor, major, sus, add9 shapes) and 50 short stabs. Generated in-repo; no recordings.',
    sounds: [
      ...series(75, 'Chord', 'perc', 7_000_003, (seed) => synth.chordHit(seed, false)),
      ...series(50, 'Stab', 'perc', 7_100_003, (seed) => synth.chordHit(seed, true)),
    ],
  },
  {
    id: 'hiphop-textures',
    name: 'Hip-Hop Plucks, Bells & Textures',
    category: 'percussion',
    description: 'Synthesised hip-hop colours: 45 plucked-string hits, 40 FM bells, 40 vinyl crackle / tape hiss / air textures. Generated in-repo; no recordings.',
    sounds: [
      ...series(45, 'Pluck', 'perc', 8_000_003, (seed) => synth.pluck(seed)),
      ...series(40, 'Bell', 'perc', 8_100_003, (seed) => synth.bell(seed)),
      ...series(40, 'Texture', 'perc', 8_200_003, (seed) => synth.texture(seed)),
    ],
  },
];

function layer(file: string): Layer {
  return { file, gain: 1, pan: 0, offsetSec: 0, endSec: null, reverse: false, filters: [], eqs: [], env: null };
}

function buildKit(kit: KitSpec): void {
  if (kit.sounds.length !== SOUNDS_PER_KIT) throw new Error(`${kit.id}: ${kit.sounds.length} sounds, expected ${SOUNDS_PER_KIT}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `unbox-hiphop-${kit.id}-`));
  try {
    const zones: DraftZone[] = [];
    const lanes: PackLane[] = [];
    kit.sounds.forEach((sound, index) => {
      const mono = sound.render();
      const pcm: Pcm = { rate: PACK_RATE, frames: mono.length, data: new Float32Array(mono.length * 2) };
      for (let frame = 0; frame < mono.length; frame++) {
        pcm.data[frame * 2] = mono[frame];
        pcm.data[frame * 2 + 1] = mono[frame];
      }
      const file = path.join(tmp, `${String(index).padStart(3, '0')}.wav`);
      writeWav16(file, pcm);
      zones.push({
        layers: [layer(file)],
        lokey: index,
        hikey: index,
        root: null,
        lovel: 1,
        hivel: 127,
        tune: 0,
        groups: [],
        offBy: [],
        attack: 0,
        release: 0.03,
      });
      lanes.push({ name: sound.name, note: index, ...(sound.role ? { role: sound.role } : {}) });
    });
    buildPack(
      {
        id: kit.id,
        name: kit.name,
        kind: 'drums',
        category: kit.category,
        description: kit.description,
        license,
        lanes,
        oneShot: true,
        release: 0.02,
      },
      zones,
      { format: 'ogg', quality: 5, maxSeconds: 3 },
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const requested = process.argv[2] ?? 'all';
const selected = requested === 'all' ? KITS : KITS.filter((kit) => kit.id === requested);
if (!selected.length) throw new Error(`unknown kit "${requested}"; use one of: ${KITS.map((kit) => kit.id).join(', ')}, or all`);
for (const kit of selected) {
  buildKit(kit);
  console.log(`built ${kit.id} (${kit.sounds.length} pads)`);
}
console.log(`hip-hop bank: ${KITS.length} kits, ${KITS.reduce((total, kit) => total + kit.sounds.length, 0)} playable sounds`);
