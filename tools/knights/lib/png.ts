/**
 * PNG in and out for the knight tools (Node only): indexed PNGs for the game's sheets, RGBA PNGs for
 * previews, and a small decoder (8-bit RGB/RGBA/gray and 1-8 bit indexed, every filter) to read
 * sheets back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface Rgba {
  w: number;
  h: number;
  /** RGBA, row-major. */
  px: Uint8ClampedArray;
}

/** An indexed PNG: `idx` per pixel into `pal` (RGBA per entry; entry 0 is usually transparent). */
export function encodeIndexed(w: number, h: number, idx: Uint8Array, pal: ReadonlyArray<readonly [number, number, number, number]>): Buffer {
  if (pal.length > 256) throw new Error(`palette has ${pal.length} colors`);
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = idx[y * w + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.alloc(pal.length * 3);
  const trns = Buffer.alloc(pal.length);
  pal.forEach(([r, g, b, a], i) => {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
    trns[i] = a;
  });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** An RGBA PNG, each pixel blown up to `scale` x `scale` (nearest neighbor). */
export function encodeRgba(img: Rgba, scale = 1): Buffer {
  const W = img.w * scale;
  const H = img.h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const i = (sy * img.w + Math.floor(x / scale)) * 4;
      raw.set(img.px.subarray(i, i + 4), y * (W * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function writeRgba(path: string, img: Rgba, scale = 1): void {
  writeFileSync(path, encodeRgba(img, scale));
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes a PNG file to RGBA. */
export function readPng(path: string): Rgba {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${path}: not a PNG`);
  let off = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 6;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const t = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      if (data[12]) throw new Error(`${path}: interlaced PNGs are not supported`);
    } else if (t === 'PLTE') plte = data;
    else if (t === 'tRNS') trns = data;
    else if (t === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const chans = type === 6 ? 4 : type === 2 ? 3 : type === 4 ? 2 : 1;
  const bpp = Math.max(1, (chans * depth) >> 3);
  const stride = Math.ceil((w * chans * depth) / 8);
  const rows = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rows[y * stride + i - bpp] : 0;
      const b = y ? rows[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? rows[(y - 1) * stride + i - bpp] : 0;
      const x = src[i];
      rows[y * stride + i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
  }
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const bit = x * depth;
        const v = (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        px[o] = plte![v * 3];
        px[o + 1] = plte![v * 3 + 1];
        px[o + 2] = plte![v * 3 + 2];
        px[o + 3] = trns && v < trns.length ? trns[v] : 255;
      } else if (depth !== 8) throw new Error(`${path}: ${depth}-bit PNGs are not supported`);
      else if (type === 6) px.set(rows.subarray(y * stride + x * 4, y * stride + x * 4 + 4), o);
      else if (type === 2) {
        px.set(rows.subarray(y * stride + x * 3, y * stride + x * 3 + 3), o);
        px[o + 3] = 255;
      } else {
        const v = rows[y * stride + x * chans];
        px[o] = px[o + 1] = px[o + 2] = v;
        px[o + 3] = type === 4 ? rows[y * stride + x * 2 + 1] : 255;
      }
    }
  }
  return { w, h, px };
}
