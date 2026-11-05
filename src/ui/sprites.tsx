/** Pixel sprites in the menus: knights, silhouettes and small icons drawn from the game's own art. */
import { useEffect, useRef } from 'react';
import { knightDef } from '../core/knights';
import type { MutationId } from '../core/state';
import { knightFrame, knightLook, shieldArt, weaponArt, CLASS_HAS_SHIELD, type View } from '../render/art/knights';
import { blank, blit, type PixelBuf } from '../render/pixel/buf';
import { pfReady } from '../render/pf/assets';
import { knightStill } from '../render/pf/frames';
import type { Dir } from '../render/pf/sheet';

/**
 * A knight picture is KNIGHT_PIC_W x KNIGHT_PIC_H image pixels: PixelForge's 32 px frame from the
 * halo's row down to the lowest weapon tip (the knight's feet sit on row KNIGHT_PIC_FEET).
 */
export const KNIGHT_PIC_W = 30;
export const KNIGHT_PIC_H = 28;
const PIC_X = 1;
const PIC_Y = 3;
export const KNIGHT_PIC_FEET = 27 - PIC_Y;

const cache = new Map<string, string>();

function bufToUrl(b: PixelBuf, silhouette?: string): string {
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(b.w, b.h);
  img.data.set(b.px);
  if (silhouette) {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(silhouette.slice(i, i + 2), 16));
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) [img.data[i], img.data[i + 1], img.data[i + 2]] = [r, g, bl];
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** A copy of part of a buffer, alpha and all (the soft ground shadow stays soft). */
function cut(b: PixelBuf, x0: number, y0: number, w: number, h: number): PixelBuf {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + x0;
      const sy = y + y0;
      if (sx < 0 || sy < 0 || sx >= b.w || sy >= b.h) continue;
      out.px.set(b.px.subarray((sy * b.w + sx) * 4, (sy * b.w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** The game's own knight (when PixelForge's sheets didn't load), on the same picture size. */
function legacyBuf(id: string, mutation: MutationId | null, view: View, frame: number): PixelBuf {
  const L = knightLook(id, mutation, 0);
  const fr = knightFrame(L, 'idle', view, frame);
  const out = blank(KNIGHT_PIC_W, KNIGHT_PIC_H);
  const oy = KNIGHT_PIC_H - fr.buf.h - 2;
  blit(out, fr.buf, 4, oy);
  const wp = weaponArt(L);
  blit(out, wp.buf, 4 + fr.handR[0] - wp.px, oy + fr.handR[1] - wp.py + 1);
  if (CLASS_HAS_SHIELD[knightDef(id).cls]) blit(out, shieldArt(L), 4 + fr.handL[0] - 4, oy + fr.handL[1] - 5);
  return out;
}

const DIR_OF: Record<View, Dir> = { down: 's', side: 'e', up: 'n' };

/** A knight standing (PixelForge's idle, in its rarity's colors, cape and halo and all), as a data URL. */
export function knightUrl(id: string, mutation: MutationId | null, opts: { view?: View; frame?: number; silhouette?: string } = {}): string {
  const key = `${id}|${mutation}|${opts.view ?? 'down'}|${opts.frame ?? 0}|${opts.silhouette ?? ''}|${pfReady() ? 'pf' : ''}`;
  let url = cache.get(key);
  if (url) return url;
  const view = opts.view ?? 'down';
  const buf = pfReady() ? cut(knightStill(id, mutation, DIR_OF[view], opts.frame ?? 0).buf, PIC_X, PIC_Y, KNIGHT_PIC_W, KNIGHT_PIC_H) : legacyBuf(id, mutation, view, opts.frame ?? 0);
  url = bufToUrl(buf, opts.silhouette);
  cache.set(key, url);
  return url;
}

/** Head and shoulders, 14 x 14 (the dungeon HUD's squad faces). */
export function knightFaceUrl(id: string, mutation: MutationId | null): string {
  const key = `face|${id}|${mutation}|${pfReady() ? 'pf' : ''}`;
  let url = cache.get(key);
  if (url) return url;
  if (pfReady()) {
    const { buf } = knightStill(id, mutation, 's', 0);
    // The head's top row, from the frame (helmets and hats differ in height).
    let top = 0;
    for (let y = 0; y < buf.h && !top; y++) for (let x = 0; x < buf.w; x++) if (buf.px[(y * buf.w + x) * 4 + 3] === 255 && y > 5) {
      top = y;
      break;
    }
    url = bufToUrl(cut(buf, 8, Math.max(0, top - 1), 14, 14));
  } else url = knightUrl(id, mutation);
  cache.set(key, url);
  return url;
}

export function KnightSprite({ id, mutation = null, scale = 3, silhouette, className, view, frame }: { id: string; mutation?: MutationId | null; scale?: number; silhouette?: string; className?: string; view?: View; frame?: number }) {
  const url = knightUrl(id, mutation, { silhouette, view, frame });
  return <img className={`px ${className ?? ''}`} src={url} alt={knightDef(id).name} draggable={false} style={{ width: KNIGHT_PIC_W * scale, height: KNIGHT_PIC_H * scale, objectFit: 'contain' }} />;
}

/** A small animated knight (idle bob) on a canvas. */
export function KnightLive({ id, mutation = null, scale = 4 }: { id: string; mutation?: MutationId | null; scale?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let f = 0;
    const t = setInterval(() => {
      f = (f + 1) % 2;
      if (ref.current) ref.current.src = knightUrl(id, mutation, { frame: f });
    }, 420);
    return () => clearInterval(t);
  }, [id, mutation]);
  return <img ref={ref} className="px" src={knightUrl(id, mutation)} alt="" draggable={false} style={{ width: KNIGHT_PIC_W * scale, height: KNIGHT_PIC_H * scale, objectFit: 'contain' }} />;
}
