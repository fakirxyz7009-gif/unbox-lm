/**
 * Compressed exports: MP3 (lamejs, loaded on demand; ID3v2.4 tags), Ogg Opus and AAC (ADTS) via
 * the browser's WebCodecs AudioEncoder (offered only when the browser supports the codec).
 */
import type { AudioMeta } from './wav.ts';

/* ------------------------------------------------------------ MP3 */

function id3(meta?: AudioMeta): Uint8Array {
  if (!meta) return new Uint8Array(0);
  const enc = new TextEncoder();
  const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
  const frames: Uint8Array[] = [];
  const text = (id: string, v?: string) => {
    if (!v) return;
    const body = new Uint8Array([3, ...enc.encode(v)]);
    frames.push(new Uint8Array([...enc.encode(id), ...syncsafe(body.length), 0, 0, ...body]));
  };
  text('TIT2', meta.title);
  text('TPE1', meta.artist);
  text('TALB', meta.album);
  text('TCON', meta.genre);
  text('TDRC', meta.year);
  text('TSRC', meta.isrc);
  text('TSSE', meta.software);
  if (meta.comment) {
    const body = new Uint8Array([3, ...enc.encode('eng'), 0, ...enc.encode(meta.comment)]);
    frames.push(new Uint8Array([...enc.encode('COMM'), ...syncsafe(body.length), 0, 0, ...body]));
  }
  const size = frames.reduce((n, f) => n + f.length, 0);
  if (!size) return new Uint8Array(0);
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, 4, 0, 0, ...syncsafe(size)]);
  let o = 10;
  for (const f of frames) {
    out.set(f, o);
    o += f.length;
  }
  return out;
}

export async function encodeMp3(channels: Float32Array[], sampleRate: number, kbps = 320, meta?: AudioMeta, onProgress?: (f: number) => void): Promise<Blob> {
  if (![32000, 44100, 48000].includes(sampleRate)) throw new Error('MP3 needs 32, 44.1 or 48 kHz.');
  if (!channels || channels.length === 0 || !channels[0] || channels[0].length === 0) {
    throw new Error('MP3 encoder received empty channel data.');
  }
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const nCh = Math.min(2, channels.length);
  const enc = new Mp3Encoder(nCh, sampleRate, kbps);
  const toInt = (f: Float32Array, from: number, to: number) => {
    const out = new Int16Array(to - from);
    for (let i = from; i < to; i++) {
      const raw = f[i];
      const samp = Number.isFinite(raw) ? raw : 0;
      const v = Math.max(-1, Math.min(1, samp + (Math.random() - Math.random()) / 32768));
      out[i - from] = v < 0 ? v * 32768 : v * 32767;
    }
    return out;
  };
  const parts: Uint8Array[] = [id3(meta)];
  const total = channels[0].length;
  const block = 1152 * 16;
  for (let i = 0; i < total; i += block) {
    const end = Math.min(total, i + block);
    const l = toInt(channels[0], i, end);
    const mp3 = nCh === 2 ? enc.encodeBuffer(l, toInt(channels[1], i, end)) : enc.encodeBuffer(l);
    if (mp3.length) parts.push(mp3.slice());
    if ((i / block) % 20 === 0) {
      onProgress?.(i / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  parts.push(enc.flush().slice());
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'audio/mpeg' });
}

/* ------------------------------------------------------------ WebCodecs */

type Codec = 'opus' | 'aac';
const UI_BITRATES = [96, 128, 160, 192, 256, 320] as const;

const configFor = (codec: Codec, sampleRate: number, channels: number, bitrate: number): AudioEncoderConfig =>
  codec === 'opus'
    ? { codec: 'opus', sampleRate, numberOfChannels: channels, bitrate }
    : ({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate, aac: { format: 'adts' } } as AudioEncoderConfig);

/** Bitrates this browser's WebCodecs implementation reports for the requested codec. */
export async function supportedBitrates(codec: Codec, sampleRate = 48000): Promise<number[]> {
  if (typeof AudioEncoder === 'undefined') return [];
  const rate = codec === 'opus' ? 48000 : sampleRate;
  const supported: number[] = [];
  for (const kbps of UI_BITRATES) {
    try {
      const result = await AudioEncoder.isConfigSupported(configFor(codec, rate, 2, kbps * 1000));
      if (result.supported) supported.push(kbps);
    } catch {
      // A rejected configuration is one unavailable bitrate, not a failed browser API.
    }
  }
  return supported;
}

/** True when this browser can encode at least one bitrate for the codec. */
export async function canEncode(codec: Codec, sampleRate = 48000): Promise<boolean> {
  return (await supportedBitrates(codec, sampleRate)).length > 0;
}

async function runEncoder(codec: Codec, channels: Float32Array[], sampleRate: number, bitrate: number, onProgress?: (f: number) => void): Promise<{ chunks: { data: Uint8Array; duration: number }[] }> {
  const nCh = Math.min(2, channels.length);
  const chunks: { data: Uint8Array; duration: number }[] = [];
  const failure: { error: Error | null } = { error: null };
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, duration: chunk.duration ?? 0 });
    },
    error: (e) => {
      failure.error = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(configFor(codec, sampleRate, nCh, bitrate));
  const total = channels[0].length;
  const frame = 4800;
  for (let i = 0; i < total; i += frame) {
    const n = Math.min(frame, total - i);
    const planar = new Float32Array(n * nCh);
    for (let c = 0; c < nCh; c++) planar.set(channels[c].subarray(i, i + n), c * n);
    const data = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: nCh, timestamp: Math.round((i / sampleRate) * 1e6), data: planar });
    try {
      if (failure.error) throw new Error(failure.error.message);
      encoder.encode(data);
    } catch (error) {
      const detail = failure.error?.message ?? (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      throw new Error(`${codec} encoder rejected frame ${i} at ${sampleRate} Hz: ${detail}`);
    } finally {
      data.close();
    }
    if (encoder.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0));
    if ((i / frame) % 50 === 0) onProgress?.(i / total);
  }
  await encoder.flush();
  encoder.close();
  if (failure.error) throw failure.error;
  return { chunks };
}

const OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function oggPage(packets: Uint8Array[], granule: number, serial: number, seq: number, flags: number): Uint8Array {
  const segs: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      segs.push(255);
      n -= 255;
    }
    segs.push(n);
  }
  const body = packets.reduce((n, p) => n + p.length, 0);
  const page = new Uint8Array(27 + segs.length + body);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
  dv.setUint32(6, granule >>> 0, true);
  dv.setUint32(10, Math.floor(granule / 2 ** 32), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  page[26] = segs.length;
  page.set(segs, 27);
  let o = 27 + segs.length;
  for (const p of packets) {
    page.set(p, o);
    o += p.length;
  }
  let crc = 0;
  for (let i = 0; i < page.length; i++) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
  dv.setUint32(22, crc, true);
  return page;
}

/** Ogg Opus at 48 kHz (the caller renders / resamples to 48 kHz). */
export async function encodeOggOpus(channels: Float32Array[], kbps = 192, meta?: AudioMeta, onProgress?: (f: number) => void): Promise<Blob> {
  const nCh = Math.min(2, channels.length);
  const { chunks } = await runEncoder('opus', channels, 48000, kbps * 1000, onProgress);
  const enc = new TextEncoder();
  const preSkip = 312;
  const head = new Uint8Array(19);
  head.set(enc.encode('OpusHead'));
  head[8] = 1;
  head[9] = nCh;
  new DataView(head.buffer).setUint16(10, preSkip, true);
  new DataView(head.buffer).setUint32(12, 48000, true);
  const comments = Object.entries({ TITLE: meta?.title, ARTIST: meta?.artist, ALBUM: meta?.album, GENRE: meta?.genre, DATE: meta?.year, ISRC: meta?.isrc, COMMENT: meta?.comment })
    .filter(([, v]) => !!v)
    .map(([k, v]) => enc.encode(`${k}=${v}`));
  const vendor = enc.encode('Unbox Studio (WebCodecs Opus)');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4 + comments.reduce((n, c) => n + 4 + c.length, 0));
  const tv = new DataView(tags.buffer);
  tags.set(enc.encode('OpusTags'));
  tv.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  let o = 12 + vendor.length;
  tv.setUint32(o, comments.length, true);
  o += 4;
  for (const c of comments) {
    tv.setUint32(o, c.length, true);
    tags.set(c, o + 4);
    o += 4 + c.length;
  }
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [oggPage([head], 0, serial, 0, 2), oggPage([tags], 0, serial, 1, 0)];
  const totalSamples = channels[0].length;
  let granule = preSkip;
  let seq = 2;
  let batch: Uint8Array[] = [];
  let segCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const segs = Math.floor(c.data.length / 255) + 1;
    if (segCount + segs > 255 && batch.length) {
      pages.push(oggPage(batch, granule, serial, seq++, 0));
      batch = [];
      segCount = 0;
    }
    batch.push(c.data);
    segCount += segs;
    granule += Math.round((c.duration / 1e6) * 48000);
  }
  if (batch.length) pages.push(oggPage(batch, Math.min(granule, preSkip + totalSamples), serial, seq++, 4));
  return new Blob(pages as Uint8Array<ArrayBuffer>[], { type: 'audio/ogg' });
}

/** AAC-LC in an ADTS stream (.aac). */
export async function encodeAac(channels: Float32Array[], sampleRate: number, kbps = 256, onProgress?: (f: number) => void): Promise<Blob> {
  const { chunks } = await runEncoder('aac', channels, sampleRate, kbps * 1000, onProgress);
  return new Blob(chunks.map((c) => c.data) as Uint8Array<ArrayBuffer>[], { type: 'audio/aac' });
}
