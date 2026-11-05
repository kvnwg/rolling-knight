/** Pixel sprites in the menus: knights, silhouettes and small icons drawn from the game's own art. */
import { useEffect, useRef } from 'react';
import { knightDef } from '../core/knights';
import type { MutationId } from '../core/state';
import { knightFrame, knightLook, shieldArt, weaponArt, CLASS_HAS_SHIELD, type View } from '../render/art/knights';
import { blank, blit, type PixelBuf } from '../render/pixel/buf';
import { pfReady, SHEETS, type SheetName } from '../render/pf/assets';
import { headTop, knightBounds, knightStill } from '../render/pf/frames';
import { KNIGHT_SHEET, KNIGHT_SHEET_BY_ID } from '../render/pf/knightLook';
import type { Dir } from '../render/pf/sheet';

/**
 * A knight picture is KNIGHT_PIC_W x KNIGHT_PIC_H image pixels, the knight's feet on row
 * KNIGHT_PIC_FEET. The size is measured from the knight sheets themselves (measureKnightPics, once
 * they load): the box every knight's standing frames fit in, halo and weapons included, so a sheet of
 * any cell size or shape is framed whole. Every picture is cut at the same place relative to the feet,
 * so knights of every class stand on the same line at the same scale. (The values below are the old
 * 32 px sheets', used until then.)
 */
export let KNIGHT_PIC_W = 30;
export let KNIGHT_PIC_H = 28;
export let KNIGHT_PIC_FEET = 24;
/** The picture's top-left relative to a sheet's pivot. */
let picLeft = -14;
let picTop = -24;

/** Every sheet a knight can be drawn from. */
export function knightSheetNames(): SheetName[] {
  return [...new Set<SheetName>([...Object.values(KNIGHT_SHEET), ...Object.values(KNIGHT_SHEET_BY_ID)])];
}

/** Measures the knight pictures from the loaded sheets (call once they're ready; main.tsx does). */
export function measureKnightPics(): void {
  const box = knightBounds(knightSheetNames());
  if (!box) return;
  const [l, t, r, b] = box;
  // A pixel of air all round, so outlines never touch the picture's edge.
  picLeft = l - 1;
  picTop = t - 1;
  KNIGHT_PIC_W = r - l + 3;
  KNIGHT_PIC_H = b - t + 3;
  KNIGHT_PIC_FEET = -picTop;
  cache.clear();
}

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
  let buf: PixelBuf;
  if (pfReady()) {
    const still = knightStill(id, mutation, DIR_OF[view], opts.frame ?? 0);
    buf = cut(still.buf, still.pivot[0] + picLeft, still.pivot[1] + picTop, KNIGHT_PIC_W, KNIGHT_PIC_H);
  } else buf = legacyBuf(id, mutation, view, opts.frame ?? 0);
  url = bufToUrl(buf, opts.silhouette);
  cache.set(key, url);
  return url;
}

/** Head and shoulders, 14 x 14 (the dungeon HUD's squad faces), centered on the top of the head. */
export function knightFaceUrl(id: string, mutation: MutationId | null): string {
  const key = `face|${id}|${mutation}|${pfReady() ? 'pf' : ''}`;
  let url = cache.get(key);
  if (url) return url;
  if (pfReady()) {
    const { buf, paint } = knightStill(id, mutation, 's', 0);
    // The head's top from the sheet's rig (helmets and hats differ in height).
    const k = SHEETS[paint.sheet].clip('idle', 's')[0][0];
    const [hx, hy] = headTop(paint.sheet, k);
    url = bufToUrl(cut(buf, hx - 7, Math.max(0, hy - 1), 14, 14));
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
