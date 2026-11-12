/**
 * Small read-only metadata readers for library files: audio headers, zip directory counts,
 * Native Instruments .nicnt product XML, changelogs and VST3 moduleinfo.json.
 */
import { open, readFile, stat, type FileHandle } from 'node:fs/promises';

const MAX_MODULE_INFO_BYTES = 1024 * 1024;

async function readRange(fh: FileHandle, offset: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(Math.max(0, length));
  const { bytesRead } = await fh.read(buf, 0, buf.length, Math.max(0, offset));
  return buf.subarray(0, bytesRead);
}

async function withFile<T>(path: string, fn: (fh: FileHandle, size: number) => Promise<T>): Promise<T | undefined> {
  let fh: FileHandle | null = null;
  try {
    fh = await open(path, 'r');
    const { size } = await fh.stat();
    return await fn(fh, size);
  } catch {
    return undefined;
  } finally {
    await fh?.close();
  }
}

export interface AudioInfo {
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
}

/** RIFF/WAVE: walks chunks in the first 1 MB for `fmt ` and `data`. */
export function readWavInfo(path: string): Promise<AudioInfo | undefined> {
  return withFile(path, async (fh, size) => {
    const head = await readRange(fh, 0, Math.min(size, 1024 * 1024));
    if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return undefined;
    let p = 12;
    let channels: number | undefined;
    let sampleRate: number | undefined;
    let byteRate: number | undefined;
    while (p + 8 <= head.length) {
      const id = head.toString('ascii', p, p + 4);
      const len = head.readUInt32LE(p + 4);
      if (id === 'fmt ' && p + 24 <= head.length) {
        channels = head.readUInt16LE(p + 10);
        sampleRate = head.readUInt32LE(p + 12);
        byteRate = head.readUInt32LE(p + 16);
      } else if (id === 'data') {
        const dataLen = Math.min(len, size - (p + 8));
        return { channels, sampleRate, durationSec: byteRate ? round2(dataLen / byteRate) : undefined };
      }
      p += 8 + len + (len % 2);
    }
    return { channels, sampleRate };
  });
}

/** Ogg Vorbis / Opus: rate from the identification header, length from the last granule position. */
export function readOggInfo(path: string): Promise<AudioInfo | undefined> {
  return withFile(path, async (fh, size) => {
    const head = await readRange(fh, 0, Math.min(size, 4096));
    if (head.toString('ascii', 0, 4) !== 'OggS') return undefined;
    let sampleRate: number | undefined;
    let channels: number | undefined;
    let preSkip = 0;
    let isOpus = false;
    const vorbis = head.indexOf('\x01vorbis', 0, 'latin1');
    const opus = head.indexOf('OpusHead', 0, 'latin1');
    if (vorbis >= 0 && vorbis + 16 <= head.length) {
      channels = head.readUInt8(vorbis + 11);
      sampleRate = head.readUInt32LE(vorbis + 12);
    } else if (opus >= 0 && opus + 12 <= head.length) {
      isOpus = true;
      channels = head.readUInt8(opus + 9);
      preSkip = head.readUInt16LE(opus + 10);
      sampleRate = 48000; // Opus granule positions always count 48 kHz samples
    }
    const tailLen = Math.min(size, 64 * 1024);
    const tail = await readRange(fh, size - tailLen, tailLen);
    const last = tail.lastIndexOf('OggS', tail.length, 'latin1');
    if (last < 0 || last + 14 > tail.length || !sampleRate) return { sampleRate, channels };
    const granule = Number(tail.readBigInt64LE(last + 6));
    const samples = isOpus ? granule - preSkip : granule;
    return { sampleRate, channels, durationSec: samples > 0 ? round2(samples / sampleRate) : undefined };
  });
}

/** Total entries from the zip (or zip64) end-of-central-directory record. Reads only the file tail. */
export function readZipEntryCount(path: string): Promise<number | undefined> {
  return withFile(path, async (fh, size) => {
    const tailLen = Math.min(size, 65_557);
    const tail = await readRange(fh, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return undefined;
    const entries = tail.readUInt16LE(eocd + 10);
    if (entries !== 0xffff) return entries;
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) return undefined;
    const zip64Offset = Number(tail.readBigUInt64LE(locator + 8));
    const record = await readRange(fh, zip64Offset, 56);
    if (record.length < 56 || record.readUInt32LE(0) !== 0x06064b50) return undefined;
    return Number(record.readBigUInt64LE(32));
  });
}

export interface NicntInfo {
  name?: string;
  company?: string;
  poweredBy?: string;
}

/** Native Instruments library registration file: product name / company from the embedded XML. */
export function readNicnt(path: string): Promise<NicntInfo | undefined> {
  return withFile(path, async (fh, size) => {
    const text = (await readRange(fh, 0, Math.min(size, 64 * 1024))).toString('latin1');
    const tag = (name: string) => text.match(new RegExp(`<${name}>([^<]{1,200})</${name}>`))?.[1]?.trim();
    const info = { name: tag('Name'), company: tag('Company'), poweredBy: tag('PoweredBy') };
    return info.name || info.company ? info : undefined;
  });
}

/** First version number in a changelog / readme ("2.2.3 Maintenance update" → "2.2.3"). */
export async function readChangelogVersion(path: string): Promise<string | undefined> {
  const text = await withFile(path, async (fh, size) => (await readRange(fh, 0, Math.min(size, 4096))).toString('utf8'));
  return text?.match(/(?:^|\n)\s*v?(\d+\.\d+(?:\.\d+){0,2})\b/)?.[1];
}

export interface ModuleInfo {
  name?: string;
  vendor?: string;
  version?: string;
  subCategories: string[];
}

/** VST3 bundle Contents/Resources/moduleinfo.json (SDK 3.7.5+). */
export async function readModuleInfo(path: string): Promise<ModuleInfo | undefined> {
  try {
    // The file comes from a plugin folder the user does not control, so a huge one is not read whole.
    if ((await stat(path)).size > MAX_MODULE_INFO_BYTES) return undefined;
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;
    const factory = (obj['Factory Info'] ?? {}) as Record<string, unknown>;
    const classes = Array.isArray(obj.Classes) ? (obj.Classes as Record<string, unknown>[]) : [];
    const audio = classes.find((c) => c.Category === 'Audio Module Class') ?? classes[0];
    const subs = audio && Array.isArray(audio['Sub Categories']) ? (audio['Sub Categories'] as unknown[]) : [];
    return {
      name: typeof obj.Name === 'string' ? obj.Name : undefined,
      vendor: typeof factory.Vendor === 'string' ? factory.Vendor : undefined,
      version: typeof obj.Version === 'string' ? obj.Version : undefined,
      subCategories: subs.filter((s): s is string => typeof s === 'string'),
    };
  } catch {
    return undefined;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
