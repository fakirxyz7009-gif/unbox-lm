/**
 * Read-only Windows PE (DLL/EXE) inspection. Reads a few header blocks with random-access reads;
 * it never loads or executes the binary.
 */
import { open, type FileHandle } from 'node:fs/promises';
import type { Arch } from '../../shared/vst/manifestTypes.ts';

export interface PeInfo {
  machine: Arch;
  isDll: boolean;
  exports: string[];
  /** StringFileInfo values: CompanyName, ProductName, FileDescription, FileVersion, … */
  version: Record<string, string>;
  /** VS_FIXEDFILEINFO file version (a.b.c.d). */
  fixedVersion?: string;
}

const MACHINES: Record<number, Arch> = { 0x8664: 'x64', 0x14c: 'x86', 0xaa64: 'arm64' };
const MAX_EXPORT_NAMES = 4096;
const MAX_VERSION_BLOB = 64 * 1024;

interface Section {
  va: number;
  vsize: number;
  rawPtr: number;
  rawSize: number;
}

interface DataDir {
  rva: number;
  size: number;
}

class RandomReader {
  constructor(private fh: FileHandle, private size: number) {}

  async read(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || offset >= this.size || length <= 0) return Buffer.alloc(0);
    const len = Math.min(length, this.size - offset);
    const buf = Buffer.alloc(len);
    const { bytesRead } = await this.fh.read(buf, 0, len, offset);
    return bytesRead === len ? buf : buf.subarray(0, bytesRead);
  }
}

function rvaToOffset(rva: number, sections: Section[]): number {
  for (const s of sections) {
    if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) {
      const delta = rva - s.va;
      return delta < s.rawSize ? s.rawPtr + delta : -1;
    }
  }
  return -1;
}

function cString(buf: Buffer, start: number): string {
  let end = start;
  while (end < buf.length && end - start < 255 && buf[end] !== 0) end++;
  return buf.toString('latin1', start, end);
}

const align4 = (n: number) => (n + 3) & ~3;

export async function readPeInfo(filePath: string): Promise<PeInfo | null> {
  let fh: FileHandle | null = null;
  try {
    fh = await open(filePath, 'r');
    const { size } = await fh.stat();
    if (size < 512) return null;
    const r = new RandomReader(fh, size);

    const dos = await r.read(0, 64);
    if (dos.length < 64 || dos.readUInt16LE(0) !== 0x5a4d) return null; // "MZ"
    const peOff = dos.readUInt32LE(0x3c);
    if (peOff <= 0 || peOff > size - 24) return null;

    const coff = await r.read(peOff, 24);
    if (coff.length < 24 || coff.readUInt32LE(0) !== 0x00004550) return null; // "PE\0\0"
    const machine = MACHINES[coff.readUInt16LE(4)] ?? 'unknown';
    const numSections = coff.readUInt16LE(6);
    const optSize = coff.readUInt16LE(20);
    const characteristics = coff.readUInt16LE(22);

    const opt = await r.read(peOff + 24, optSize);
    if (opt.length < 2) return null;
    const pe32Plus = opt.readUInt16LE(0) === 0x20b;
    const dirCountOff = pe32Plus ? 108 : 92;
    const dirBase = pe32Plus ? 112 : 96;
    const dirCount = opt.length >= dirCountOff + 4 ? opt.readUInt32LE(dirCountOff) : 0;
    const dataDir = (index: number): DataDir => {
      const at = dirBase + index * 8;
      if (index >= dirCount || opt.length < at + 8) return { rva: 0, size: 0 };
      return { rva: opt.readUInt32LE(at), size: opt.readUInt32LE(at + 4) };
    };

    const table = await r.read(peOff + 24 + optSize, Math.min(numSections, 96) * 40);
    const sections: Section[] = [];
    for (let i = 0; i + 40 <= table.length; i += 40) {
      sections.push({
        vsize: table.readUInt32LE(i + 8),
        va: table.readUInt32LE(i + 12),
        rawSize: table.readUInt32LE(i + 16),
        rawPtr: table.readUInt32LE(i + 20),
      });
    }

    const exports = await readExportNames(r, dataDir(0), sections);
    const versionInfo = await readVersionResource(r, dataDir(2), sections);
    return {
      machine,
      isDll: (characteristics & 0x2000) !== 0,
      exports,
      version: versionInfo.strings,
      fixedVersion: versionInfo.fixedVersion,
    };
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

async function readExportNames(r: RandomReader, dir: DataDir, sections: Section[]): Promise<string[]> {
  if (!dir.rva || !dir.size) return [];
  const off = rvaToOffset(dir.rva, sections);
  if (off < 0) return [];
  const block = await r.read(off, Math.max(40, Math.min(dir.size, 4 * 1024 * 1024)));
  if (block.length < 40) return [];
  const count = Math.min(block.readUInt32LE(24), MAX_EXPORT_NAMES);
  const namesOff = rvaToOffset(block.readUInt32LE(32), sections);
  if (count === 0 || namesOff < 0) return [];
  const pointers = await r.read(namesOff, count * 4);
  const names: string[] = [];
  for (let i = 0; i + 4 <= pointers.length; i += 4) {
    const nameRva = pointers.readUInt32LE(i);
    const inBlock = nameRva - dir.rva;
    if (inBlock >= 0 && inBlock < block.length) {
      names.push(cString(block, inBlock));
    } else {
      const at = rvaToOffset(nameRva, sections);
      if (at >= 0) names.push(cString(await r.read(at, 256), 0));
    }
  }
  return names.filter(Boolean);
}

interface ResourceEntry {
  id: number;
  offset: number;
}

async function readVersionResource(
  r: RandomReader,
  dir: DataDir,
  sections: Section[]
): Promise<{ strings: Record<string, string>; fixedVersion?: string }> {
  const none = { strings: {} };
  if (!dir.rva || !dir.size) return none;
  const base = rvaToOffset(dir.rva, sections);
  if (base < 0) return none;

  const readDirectory = async (rel: number): Promise<ResourceEntry[]> => {
    const head = await r.read(base + rel, 16);
    if (head.length < 16) return [];
    const total = Math.min(head.readUInt16LE(12) + head.readUInt16LE(14), 512);
    const raw = await r.read(base + rel + 16, total * 8);
    const entries: ResourceEntry[] = [];
    for (let i = 0; i + 8 <= raw.length; i += 8) {
      entries.push({ id: raw.readUInt32LE(i), offset: raw.readUInt32LE(i + 4) });
    }
    return entries;
  };
  const isDir = (e: ResourceEntry) => (e.offset & 0x80000000) !== 0;
  const dirOffset = (e: ResourceEntry) => e.offset & 0x7fffffff;

  // Root → RT_VERSION (16) → first name → first language → data entry.
  const versionType = (await readDirectory(0)).find((e) => e.id === 16 && isDir(e));
  if (!versionType) return none;
  const nameEntry = (await readDirectory(dirOffset(versionType))).find(isDir);
  if (!nameEntry) return none;
  const leaf = (await readDirectory(dirOffset(nameEntry))).find((e) => !isDir(e));
  if (!leaf) return none;
  const dataEntry = await r.read(base + leaf.offset, 16);
  if (dataEntry.length < 16) return none;
  const blobOff = rvaToOffset(dataEntry.readUInt32LE(0), sections);
  const blobSize = Math.min(dataEntry.readUInt32LE(4), MAX_VERSION_BLOB);
  if (blobOff < 0 || blobSize < 64) return none;
  return parseVersionBlob(await r.read(blobOff, blobSize));
}

interface VersionBlock {
  key: string;
  type: number;
  valueOff: number;
  valueBytes: number;
  childrenOff: number;
  end: number;
}

function readVersionBlock(buf: Buffer, off: number): VersionBlock | null {
  if (off + 6 > buf.length) return null;
  const length = buf.readUInt16LE(off);
  const valueLength = buf.readUInt16LE(off + 2);
  const type = buf.readUInt16LE(off + 4);
  if (length < 6) return null;
  const end = Math.min(buf.length, off + length);
  let p = off + 6;
  let key = '';
  while (p + 1 < end) {
    const c = buf.readUInt16LE(p);
    p += 2;
    if (c === 0) break;
    key += String.fromCharCode(c);
  }
  const valueOff = align4(p);
  // Text values count UTF-16 characters, binary values count bytes.
  const valueBytes = Math.min(type === 1 ? valueLength * 2 : valueLength, Math.max(0, end - valueOff));
  return { key, type, valueOff, valueBytes, childrenOff: align4(valueOff + valueBytes), end };
}

function utf16String(buf: Buffer, start: number, end: number): string {
  let s = '';
  for (let p = start; p + 1 < end; p += 2) {
    const c = buf.readUInt16LE(p);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function* childBlocks(buf: Buffer, parent: VersionBlock): Generator<VersionBlock> {
  let p = parent.childrenOff;
  while (p < parent.end) {
    const child = readVersionBlock(buf, p);
    if (!child || child.end <= p) return;
    yield child;
    p = align4(child.end);
  }
}

function parseVersionBlob(blob: Buffer): { strings: Record<string, string>; fixedVersion?: string } {
  const strings: Record<string, string> = {};
  const root = readVersionBlock(blob, 0);
  if (!root || root.key !== 'VS_VERSION_INFO') return { strings };
  let fixedVersion: string | undefined;
  if (root.valueBytes >= 52 && blob.readUInt32LE(root.valueOff) === 0xfeef04bd) {
    const ms = blob.readUInt32LE(root.valueOff + 8);
    const ls = blob.readUInt32LE(root.valueOff + 12);
    fixedVersion = `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
  }
  for (const child of childBlocks(blob, root)) {
    if (child.key !== 'StringFileInfo') continue;
    for (const table of childBlocks(blob, child)) {
      for (const entry of childBlocks(blob, table)) {
        if (entry.valueBytes === 0 || entry.key in strings) continue;
        const value = utf16String(blob, entry.valueOff, entry.valueOff + entry.valueBytes).trim();
        if (value) strings[entry.key] = value;
      }
    }
  }
  return { strings, fixedVersion };
}
