/**
 * Audio I/O for the instrument converter, through the ffmpeg / ffprobe executables on PATH:
 * decode anything to 32-bit float stereo at the pack rate, encode the result (Ogg Vorbis by
 * default — every Chromium decodes it), read WAV loop points.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const PACK_RATE = 44100;

/** Interleaved stereo float PCM. */
export interface Pcm {
  rate: number;
  frames: number;
  data: Float32Array;
}

function run(cmd: string, args: string[], input?: Buffer): Buffer {
  const r = spawnSync(cmd, args, { input, maxBuffer: 2 ** 31, windowsHide: true });
  if (r.error) throw new Error(`${cmd} could not start (${r.error.message}). Install ffmpeg and put it on PATH.`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.toString().trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout;
}

export function checkFfmpeg(): void {
  run('ffmpeg', ['-hide_banner', '-version']);
}

export function probeRate(file: string): number {
  const out = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', file]).toString().trim();
  const r = parseInt(out, 10);
  if (!Number.isFinite(r) || r <= 0) throw new Error(`no audio stream in ${file}`);
  return r;
}

export function decode(file: string, rate = PACK_RATE): Pcm {
  const buf = run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(rate), '-']);
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { rate, frames: data.length / 2, data };
}

export function emptyPcm(frames: number, rate = PACK_RATE): Pcm {
  return { rate, frames, data: new Float32Array(frames * 2) };
}

export function writeRaw(file: string, pcm: Pcm): void {
  fs.writeFileSync(file, Buffer.from(pcm.data.buffer, pcm.data.byteOffset, pcm.data.byteLength));
}

export type OutFormat = 'ogg' | 'flac';

/** Encodes a raw f32 stereo file, applying `gainDb` (pack normalisation); `mono` folds identical channels. */
export function encodeRaw(rawFile: string, outFile: string, rate: number, gainDb: number, format: OutFormat, quality: number, mono = false): void {
  const codec = format === 'ogg' ? ['-c:a', 'libvorbis', '-q:a', String(quality)] : ['-c:a', 'flac', '-sample_fmt', 's16'];
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', rawFile, '-af', `volume=${gainDb.toFixed(3)}dB`, ...(mono ? ['-ac', '1'] : []), ...codec, outFile]);
}

/** Writes 16-bit WAV (chop output). */
export function writeWav16(file: string, pcm: Pcm): void {
  const n = pcm.data.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(pcm.rate, 24);
  out.writeUInt32LE(pcm.rate * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm.data[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, out);
}

/** First loop of a WAV 'smpl' chunk (frames at the file's rate), if any. */
export function wavLoop(file: string): [number, number] | null {
  if (!/\.wav$/i.test(file)) return null;
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  for (let p = 12; p + 8 <= b.length; ) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'smpl' && size >= 36 + 24 && p + 8 + 36 + 16 <= b.length && b.readUInt32LE(p + 8 + 28) > 0) {
      const loop = p + 8 + 36;
      return [b.readUInt32LE(loop + 8), b.readUInt32LE(loop + 12)];
    }
    p += 8 + size + (size & 1);
  }
  return null;
}
