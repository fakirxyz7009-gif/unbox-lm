/**
 * FLAC encoder (16 / 24 bit, mono / stereo): fixed-predictor subframes (orders 0–4) with
 * partitioned Rice coding, best stereo decorrelation per frame, STREAMINFO and Vorbis comment
 * tags (TITLE, ARTIST, ALBUM, GENRE, DATE, ISRC, COMMENT). MD5 is left unset (allowed by spec).
 */
import type { AudioMeta } from './wav.ts';

class BitWriter {
  private buf = new Uint8Array(1 << 16);
  private len = 0;
  private acc = 0;
  private nacc = 0;

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  /** Writes the low `bits` bits of the non-negative `value` (bits ≤ 32), MSB first. */
  write(value: number, bits: number): void {
    while (bits > 0) {
      const take = Math.min(8 - this.nacc, bits);
      const shift = bits - take;
      const div = 2 ** shift;
      const part = Math.floor(value / div) & ((1 << take) - 1);
      value %= div;
      this.acc = (this.acc << take) | part;
      this.nacc += take;
      bits -= take;
      if (this.nacc === 8) {
        this.ensure(1);
        this.buf[this.len++] = this.acc;
        this.acc = 0;
        this.nacc = 0;
      }
    }
  }

  writeSigned(v: number, bits: number): void {
    this.write(v < 0 ? v + 2 ** bits : v, bits);
  }

  unary(q: number): void {
    while (q >= 24) {
      this.write(0, 24);
      q -= 24;
    }
    this.write(1, q + 1);
  }

  align(): void {
    if (this.nacc) this.write(0, 8 - this.nacc);
  }

  get byteLength(): number {
    return this.len;
  }

  bytes(from = 0, to = this.len): Uint8Array {
    return this.buf.subarray(from, to);
  }
}

const CRC8 = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();
const CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();
const crc8 = (b: Uint8Array) => b.reduce((c, x) => CRC8[c ^ x], 0);
const crc16 = (b: Uint8Array) => b.reduce((c, x) => ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ x], 0);

/** Residual of fixed predictor `order`. */
function fixedResidual(x: Int32Array, order: number): Int32Array {
  const n = x.length;
  const r = new Int32Array(n - order);
  for (let i = order; i < n; i++) {
    let p = 0;
    if (order === 1) p = x[i - 1];
    else if (order === 2) p = 2 * x[i - 1] - x[i - 2];
    else if (order === 3) p = 3 * x[i - 1] - 3 * x[i - 2] + x[i - 3];
    else if (order === 4) p = 4 * x[i - 1] - 6 * x[i - 2] + 4 * x[i - 3] - x[i - 4];
    r[i - order] = x[i] - p;
  }
  return r;
}

const zigzag = (v: number) => (v >= 0 ? v * 2 : -v * 2 - 1);

/** Best Rice parameter for a set of residuals and its cost in bits. */
function riceCost(r: Int32Array, from: number, to: number): { k: number; bits: number } {
  let sum = 0;
  for (let i = from; i < to; i++) sum += zigzag(r[i]);
  const count = Math.max(1, to - from);
  let k = 0;
  while (k < 30 && count * 2 ** (k + 1) < sum) k++;
  // estimate: unary parts ≈ sum / 2^k
  return { k, bits: count * (k + 1) + Math.floor(sum / 2 ** k) };
}

interface ResidualPlan {
  partitionOrder: number;
  params: number[];
  bits: number;
}

function planResidual(r: Int32Array, blockSize: number, order: number): ResidualPlan {
  let best: ResidualPlan | null = null;
  for (let po = 0; po <= 4; po++) {
    const parts = 1 << po;
    if (blockSize % parts || blockSize / parts <= order) break;
    const per = blockSize / parts;
    const params: number[] = [];
    let bits = 2 + 4;
    let start = 0;
    for (let p = 0; p < parts; p++) {
      const end = (p + 1) * per - order;
      const c = riceCost(r, start, end);
      if (c.k > 14) return best ?? { partitionOrder: 0, params: [14], bits: Infinity };
      params.push(c.k);
      bits += 4 + c.bits;
      start = end;
    }
    if (!best || bits < best.bits) best = { partitionOrder: po, params, bits };
  }
  return best ?? { partitionOrder: 0, params: [0], bits: Infinity };
}

interface SubframePlan {
  kind: 'constant' | 'verbatim' | 'fixed';
  order: number;
  residual?: Int32Array;
  rice?: ResidualPlan;
  bits: number;
}

function planSubframe(x: Int32Array, bps: number): SubframePlan {
  if (x.every((v) => v === x[0])) return { kind: 'constant', order: 0, bits: bps };
  let best: SubframePlan = { kind: 'verbatim', order: 0, bits: x.length * bps };
  for (let order = 0; order <= 4 && order < x.length; order++) {
    const residual = fixedResidual(x, order);
    const rice = planResidual(residual, x.length, order);
    const bits = order * bps + rice.bits;
    if (bits < best.bits) best = { kind: 'fixed', order, residual, rice, bits };
  }
  return best;
}

function writeSubframe(w: BitWriter, x: Int32Array, bps: number, plan: SubframePlan): void {
  w.write(0, 1);
  if (plan.kind === 'constant') {
    w.write(0, 6);
    w.write(0, 1);
    w.writeSigned(x[0], bps);
    return;
  }
  if (plan.kind === 'verbatim') {
    w.write(1, 6);
    w.write(0, 1);
    for (let i = 0; i < x.length; i++) w.writeSigned(x[i], bps);
    return;
  }
  w.write(8 | plan.order, 6);
  w.write(0, 1);
  for (let i = 0; i < plan.order; i++) w.writeSigned(x[i], bps);
  const rice = plan.rice!;
  const r = plan.residual!;
  w.write(0, 2); // Rice, 4-bit parameters
  w.write(rice.partitionOrder, 4);
  const parts = 1 << rice.partitionOrder;
  const per = x.length / parts;
  let idx = 0;
  for (let p = 0; p < parts; p++) {
    const k = rice.params[p];
    w.write(k, 4);
    const count = p === 0 ? per - plan.order : per;
    for (let i = 0; i < count; i++, idx++) {
      const u = zigzag(r[idx]);
      w.unary(Math.floor(u / 2 ** k));
      if (k) w.write(u % 2 ** k, k);
    }
  }
}

/** UTF-8-style "coded number" for the frame header. */
function codedNumber(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let len = 2;
  while (n >= 2 ** (5 * len + 1)) len++;
  for (let i = len - 1; i > 0; i--) {
    bytes.unshift(0x80 | (n & 0x3f));
    n = Math.floor(n / 64);
  }
  bytes.unshift(((0xff00 >> len) & 0xff) | n);
  return bytes;
}

const RATE_CODE: Record<number, number> = { 88200: 1, 176400: 2, 192000: 3, 8000: 4, 16000: 5, 22050: 6, 24000: 7, 32000: 8, 44100: 9, 48000: 10, 96000: 11 };

function vorbisComment(meta?: AudioMeta): Uint8Array {
  const enc = new TextEncoder();
  const vendor = enc.encode('Unbox Studio');
  const tags = Object.entries({ TITLE: meta?.title, ARTIST: meta?.artist, ALBUM: meta?.album, GENRE: meta?.genre, DATE: meta?.year, ISRC: meta?.isrc, COMMENT: meta?.comment })
    .filter(([, v]) => !!v)
    .map(([k, v]) => enc.encode(`${k}=${v}`));
  const size = 4 + vendor.length + 4 + tags.reduce((n, t) => n + 4 + t.length, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, vendor.length, true);
  out.set(vendor, (o += 4));
  o += vendor.length;
  dv.setUint32(o, tags.length, true);
  o += 4;
  for (const t of tags) {
    dv.setUint32(o, t.length, true);
    out.set(t, (o += 4));
    o += t.length;
  }
  return out;
}

export function encodeFlac(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24 = 16, meta?: AudioMeta, dither = true): Blob {
  const nCh = Math.min(2, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bs = 4096;
  const scale = bitDepth === 16 ? 32767 : 8388607;
  const lsb = 1 / scale;
  const ints = channels.slice(0, nCh).map((ch) => {
    const out = new Int32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      let v = ch[i];
      if (dither) v += (Math.random() - Math.random()) * lsb;
      out[i] = Math.round(Math.max(-1, Math.min(1, v)) * scale);
    }
    return out;
  });

  const w = new BitWriter();
  // "fLaC" + STREAMINFO
  w.write(0x664c6143, 32);
  w.write(0, 1);
  w.write(0, 7);
  w.write(34, 24);
  w.write(bs, 16);
  w.write(bs, 16);
  w.write(0, 24); // min frame size unknown
  w.write(0, 24); // max frame size unknown
  w.write(sampleRate, 20);
  w.write(nCh - 1, 3);
  w.write(bitDepth - 1, 5);
  w.write(Math.floor(frames / 2 ** 32), 4);
  w.write(frames >>> 0, 32);
  for (let i = 0; i < 4; i++) w.write(0, 32); // MD5 unset
  // VORBIS_COMMENT (last metadata block)
  const vc = vorbisComment(meta);
  w.write(1, 1);
  w.write(4, 7);
  w.write(vc.length, 24);
  for (const b of vc) w.write(b, 8);

  for (let f = 0, start = 0; start < frames; f++, start += bs) {
    const n = Math.min(bs, frames - start);
    const blocks = ints.map((c) => c.subarray(start, start + n));
    // choose channel assignment
    let assign = nCh === 2 ? 1 : 0;
    let subs: { data: Int32Array; bps: number }[] = blocks.map((d) => ({ data: d, bps: bitDepth }));
    if (nCh === 2) {
      const [l, r] = blocks;
      const side = new Int32Array(n);
      const mid = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        side[i] = l[i] - r[i];
        mid[i] = (l[i] + r[i]) >> 1;
      }
      // cheap estimate: magnitude of the order-2 residual
      const cost = (d: Int32Array, _bps: number) => {
        let sum = 0;
        for (let i = 2; i < d.length; i++) sum += Math.abs(d[i] - 2 * d[i - 1] + d[i - 2]);
        return sum;
      };
      const cl = cost(l, bitDepth);
      const cr = cost(r, bitDepth);
      const cs = cost(side, bitDepth + 1);
      const cm = cost(mid, bitDepth);
      const options = [
        { a: 1, bits: cl + cr, subs: [{ data: l, bps: bitDepth }, { data: r, bps: bitDepth }] },
        { a: 8, bits: cl + cs, subs: [{ data: l, bps: bitDepth }, { data: side, bps: bitDepth + 1 }] },
        { a: 9, bits: cs + cr, subs: [{ data: side, bps: bitDepth + 1 }, { data: r, bps: bitDepth }] },
        { a: 10, bits: cm + cs, subs: [{ data: mid, bps: bitDepth }, { data: side, bps: bitDepth + 1 }] },
      ];
      const best = options.reduce((a, b) => (b.bits < a.bits ? b : a));
      assign = best.a;
      subs = best.subs;
    }
    const frameStart = w.byteLength;
    w.write(0x3ffe, 14);
    w.write(0, 1);
    w.write(0, 1); // fixed blocksize
    const bsCode = n === bs ? 12 : 7; // 12 = 4096, 7 = 16-bit (n-1) follows
    w.write(bsCode, 4);
    w.write(RATE_CODE[sampleRate] ?? 0, 4);
    w.write(nCh === 2 ? assign : 0, 4);
    w.write(bitDepth === 16 ? 4 : 6, 3);
    w.write(0, 1);
    for (const b of codedNumber(f)) w.write(b, 8);
    if (bsCode === 7) w.write(n - 1, 16);
    w.write(crc8(w.bytes(frameStart)), 8);
    for (const s of subs) writeSubframe(w, s.data, s.bps, planSubframe(s.data, s.bps));
    w.align();
    w.write(crc16(w.bytes(frameStart)), 16);
  }
  return new Blob([w.bytes().slice()], { type: 'audio/flac' });
}
