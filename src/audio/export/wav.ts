/**
 * WAV / AIFF writers (PCM 16 / 24 bit, 32-bit float WAV) with optional TPDF dither and metadata
 * (RIFF INFO list for WAV, NAME / AUTH / ANNO chunks for AIFF).
 */

export interface PcmOptions {
  bitDepth: 16 | 24 | 32;
  /** 32-bit only: IEEE float (true) or integer. */
  float?: boolean;
  /** TPDF dither when reducing to 16 / 24 bit. */
  dither?: boolean;
}

export interface AudioMeta {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  comment?: string;
  isrc?: string;
  software?: string;
}

/** Interleaved integer / float samples for one frame range. */
function quantize(channels: Float32Array[], opts: PcmOptions, write: (v: number, ch: number) => void): void {
  const n = channels[0]?.length ?? 0;
  const scale = opts.bitDepth === 16 ? 32768 : opts.bitDepth === 24 ? 8388608 : 2147483648;
  const lsb = 1 / scale;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < channels.length; c++) {
      let x = channels[c][i];
      if (!(opts.bitDepth === 32 && opts.float)) {
        if (opts.dither && opts.bitDepth < 32) x += (Math.random() - Math.random()) * lsb;
        x = Math.max(-1, Math.min(1 - lsb, x));
      }
      write(x, c);
    }
  }
}

function riffInfo(meta: AudioMeta | undefined): Uint8Array | null {
  if (!meta) return null;
  const tags: [string, string | undefined][] = [
    ['INAM', meta.title], ['IART', meta.artist], ['IPRD', meta.album], ['IGNR', meta.genre], ['ICRD', meta.year],
    ['ICMT', [meta.comment, meta.isrc ? `ISRC ${meta.isrc}` : ''].filter(Boolean).join(' · ') || undefined], ['ISFT', meta.software],
  ];
  const parts: Uint8Array[] = [];
  const enc = new TextEncoder();
  for (const [id, v] of tags) {
    if (!v) continue;
    const data = enc.encode(`${v}\0`);
    const pad = data.length % 2;
    const chunk = new Uint8Array(8 + data.length + pad);
    const dv = new DataView(chunk.buffer);
    for (let i = 0; i < 4; i++) chunk[i] = id.charCodeAt(i);
    dv.setUint32(4, data.length, true);
    chunk.set(data, 8);
    parts.push(chunk);
  }
  if (!parts.length) return null;
  const body = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + body);
  const dv = new DataView(out.buffer);
  out.set([76, 73, 83, 84], 0); // LIST
  dv.setUint32(4, 4 + body, true);
  out.set([73, 78, 70, 79], 8); // INFO
  let o = 12;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodeWav(channels: Float32Array[], sampleRate: number, opts: PcmOptions = { bitDepth: 24 }, meta?: AudioMeta): Blob {
  const nCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = opts.bitDepth / 8;
  const isFloat = opts.bitDepth === 32 && opts.float !== false;
  const dataSize = frames * nCh * bytes;
  const info = riffInfo(meta);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize + (info?.length ?? 0), true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, isFloat ? 3 : 1, true);
  v.setUint16(22, nCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nCh * bytes, true);
  v.setUint16(32, nCh * bytes, true);
  v.setUint16(34, opts.bitDepth, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  const data = new ArrayBuffer(dataSize);
  const dv = new DataView(data);
  let o = 0;
  quantize(channels, { ...opts, float: isFloat }, (x) => {
    if (isFloat) {
      dv.setFloat32(o, x, true);
      o += 4;
    } else if (opts.bitDepth === 16) {
      dv.setInt16(o, Math.round(x * 32767), true);
      o += 2;
    } else if (opts.bitDepth === 24) {
      const s = Math.round(x * 8388607);
      dv.setUint8(o, s & 0xff);
      dv.setUint8(o + 1, (s >> 8) & 0xff);
      dv.setUint8(o + 2, (s >> 16) & 0xff);
      o += 3;
    } else {
      dv.setInt32(o, Math.round(x * 2147483647), true);
      o += 4;
    }
  });
  const parts: BlobPart[] = [header, data];
  if (info) parts.push(info as Uint8Array<ArrayBuffer>);
  return new Blob(parts, { type: 'audio/wav' });
}

/** 80-bit IEEE extended for the AIFF sample rate field. */
function ext80(rate: number): Uint8Array {
  const out = new Uint8Array(10);
  let exp = 16383 + 31;
  let mant = rate;
  while (mant < 0x80000000) {
    mant *= 2;
    exp--;
  }
  out[0] = (exp >> 8) & 0x7f;
  out[1] = exp & 0xff;
  const hi = Math.floor(mant);
  out[2] = (hi >>> 24) & 0xff;
  out[3] = (hi >>> 16) & 0xff;
  out[4] = (hi >>> 8) & 0xff;
  out[5] = hi & 0xff;
  return out;
}

export function encodeAiff(channels: Float32Array[], sampleRate: number, opts: PcmOptions = { bitDepth: 24 }, meta?: AudioMeta): Blob {
  const depth = opts.bitDepth === 32 ? 24 : opts.bitDepth;
  const nCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = depth / 8;
  const enc = new TextEncoder();
  const text = (id: string, s: string | undefined): Uint8Array | null => {
    if (!s) return null;
    const d = enc.encode(s);
    const pad = d.length % 2;
    const c = new Uint8Array(8 + d.length + pad);
    for (let i = 0; i < 4; i++) c[i] = id.charCodeAt(i);
    new DataView(c.buffer).setUint32(4, d.length, false);
    c.set(d, 8);
    return c;
  };
  const extra = [text('NAME', meta?.title), text('AUTH', meta?.artist), text('ANNO', [meta?.comment, meta?.isrc && `ISRC ${meta.isrc}`].filter(Boolean).join(' · ') || undefined)].filter((x): x is Uint8Array => !!x);
  const extraLen = extra.reduce((n, c) => n + c.length, 0);
  const ssndSize = 8 + frames * nCh * bytes;
  const head = new ArrayBuffer(12 + 26 + 8 + 8);
  const v = new DataView(head);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'FORM');
  v.setUint32(4, 4 + 26 + 8 + ssndSize + extraLen, false);
  str(8, 'AIFF');
  str(12, 'COMM');
  v.setUint32(16, 18, false);
  v.setUint16(20, nCh, false);
  v.setUint32(22, frames, false);
  v.setUint16(26, depth, false);
  new Uint8Array(head, 28, 10).set(ext80(sampleRate));
  str(38, 'SSND');
  v.setUint32(42, ssndSize, false);
  v.setUint32(46, 0, false);
  v.setUint32(50, 0, false);
  const data = new ArrayBuffer(frames * nCh * bytes);
  const dv = new DataView(data);
  let o = 0;
  quantize(channels, { bitDepth: depth as 16 | 24, dither: opts.dither }, (x) => {
    if (depth === 16) {
      dv.setInt16(o, Math.round(x * 32767), false);
      o += 2;
    } else {
      const s = Math.round(x * 8388607);
      dv.setUint8(o, (s >> 16) & 0xff);
      dv.setUint8(o + 1, (s >> 8) & 0xff);
      dv.setUint8(o + 2, s & 0xff);
      o += 3;
    }
  });
  return new Blob([head, data, ...(extra as Uint8Array<ArrayBuffer>[])], { type: 'audio/aiff' });
}

/** Saves a blob as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export const safeFileName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
