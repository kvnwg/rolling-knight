/** Pixel sprites in the menus: knights, silhouettes and small icons drawn from the game's own art. */
import { useEffect, useRef } from 'react';
import { knightDef } from '../core/knights';
import type { MutationId } from '../core/state';
import { knightFrame, knightLook, shieldArt, weaponArt, CLASS_HAS_SHIELD, type View } from '../render/art/knights';
import { blank, blit, type PixelBuf } from '../render/pixel/buf';

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

/** A knight standing (with weapon and shield), as a data URL. */
export function knightUrl(id: string, mutation: MutationId | null, opts: { view?: View; frame?: number; silhouette?: string } = {}): string {
  const key = `${id}|${mutation}|${opts.view ?? 'down'}|${opts.frame ?? 0}|${opts.silhouette ?? ''}`;
  let url = cache.get(key);
  if (url) return url;
  const L = knightLook(id, mutation, 0);
  const fr = knightFrame(L, 'idle', opts.view ?? 'down', opts.frame ?? 0);
  const out = blank(fr.buf.w + 8, fr.buf.h + 2);
  blit(out, fr.buf, 4, 1);
  const wp = weaponArt(L);
  blit(out, wp.buf, 4 + fr.handR[0] - wp.px, 1 + fr.handR[1] - wp.py + 1);
  if (CLASS_HAS_SHIELD[knightDef(id).cls]) blit(out, shieldArt(L), 4 + fr.handL[0] - 4, 1 + fr.handL[1] - 5);
  url = bufToUrl(out, opts.silhouette);
  cache.set(key, url);
  return url;
}

export function KnightSprite({ id, mutation = null, scale = 3, silhouette, className, view, frame }: { id: string; mutation?: MutationId | null; scale?: number; silhouette?: string; className?: string; view?: View; frame?: number }) {
  const url = knightUrl(id, mutation, { silhouette, view, frame });
  return <img className={`px ${className ?? ''}`} src={url} alt={knightDef(id).name} draggable={false} style={{ width: 30 * scale, height: 24 * scale, objectFit: 'contain' }} />;
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
  return <img ref={ref} className="px" src={knightUrl(id, mutation)} alt="" draggable={false} style={{ width: 30 * scale, height: 24 * scale, objectFit: 'contain' }} />;
}
