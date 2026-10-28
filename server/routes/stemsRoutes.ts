/**
 * Stems & Real Audio Instruments API:
 * Serves real acoustic instruments and multi-track stems from D:\audio stems\daw_instruments
 * (htdemucs song stems and Playable_Patches).
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const STEMS_ROOT = 'D:\\audio stems\\daw_instruments';
const FALLBACK_ROOT = path.resolve(process.cwd(), 'public', 'stems', 'daw_instruments');

function getRootDir(): string {
  if (fs.existsSync(STEMS_ROOT)) return STEMS_ROOT;
  if (fs.existsSync(FALLBACK_ROOT)) return FALLBACK_ROOT;
  return STEMS_ROOT;
}

export interface StemSong {
  name: string;
  folderName: string;
  stems: {
    bass?: string;
    drums?: string;
    other?: string;
    vocals?: string;
  };
}

export interface StemPatch {
  id: string;
  name: string;
  sfzFile?: string;
  wavFile: string;
  category: 'guitar' | 'percussion' | 'keys' | 'vocal';
}

export function createStemsRouter(): Router {
  const router = Router();

  router.get('/list', (_req, res) => {
    const root = getRootDir();
    const songs: StemSong[] = [];
    const patches: StemPatch[] = [
      {
        id: 'tumbi',
        name: 'Tumbi Folk Pluck',
        sfzFile: '/stems/Playable_Patches/Tumbi.sfz',
        wavFile: '/stems/Playable_Patches/tumbi_pluck.wav',
        category: 'guitar',
      },
      {
        id: 'dholak',
        name: 'Punjabi Dholak',
        sfzFile: '/stems/Playable_Patches/Dholak.sfz',
        wavFile: '/stems/Playable_Patches/dholak_hit.wav',
        category: 'percussion',
      },
      {
        id: 'harmonium',
        name: 'Chamkila Harmonium',
        sfzFile: '/stems/Playable_Patches/Harmonium.sfz',
        wavFile: '/stems/Playable_Patches/harmonium_note.wav',
        category: 'keys',
      },
      {
        id: 'vocal_chop',
        name: 'Chamkila Vocal Chops',
        sfzFile: '/stems/Playable_Patches/Vocal_Chop.sfz',
        wavFile: '/stems/Playable_Patches/chamkila_vocal_chop.wav',
        category: 'vocal',
      },
    ];

    const htdemucsDir = path.join(root, 'htdemucs');
    if (fs.existsSync(htdemucsDir)) {
      try {
        const entries = fs.readdirSync(htdemucsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const songDir = path.join(htdemucsDir, entry.name);
          const stemFiles = fs.readdirSync(songDir);
          const stemObj: StemSong['stems'] = {};
          if (stemFiles.includes('bass.wav')) stemObj.bass = `/stems/htdemucs/${encodeURIComponent(entry.name)}/bass.wav`;
          if (stemFiles.includes('drums.wav')) stemObj.drums = `/stems/htdemucs/${encodeURIComponent(entry.name)}/drums.wav`;
          if (stemFiles.includes('other.wav')) stemObj.other = `/stems/htdemucs/${encodeURIComponent(entry.name)}/other.wav`;
          if (stemFiles.includes('vocals.wav')) stemObj.vocals = `/stems/htdemucs/${encodeURIComponent(entry.name)}/vocals.wav`;

          songs.push({
            name: entry.name.replace(/\.mp4$/i, '').replace(/ - /g, ' — '),
            folderName: entry.name,
            stems: stemObj,
          });
        }
      } catch (err) {
        console.error('Error scanning htdemucs:', err);
      }
    }

    res.json({
      root,
      available: fs.existsSync(root),
      patches,
      songs,
    });
  });

  return router;
}

