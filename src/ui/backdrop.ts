/**
 * The pixel scene behind a knight's picture (render/art/backdrops.ts) as a CSS background, at the
 * knight's own pixel size: a card's, a sheet's or the HUD face's frame gets the rarity's backdrop
 * painted to fill it, its feet on the floor where the knight stands. Painted once per size.
 */
import type { CSSProperties } from 'react';
import type { Rarity } from '../core/rarity';
import { paintBackdrop } from '../render/art/backdrops';

const urls = new Map<string, string>();

/** The backdrop as an image (a data URL): `w` x `h` knight pixels, the feet `feetUp` rows above its foot. */
export function backdropUrl(r: Rarity, w: number, h: number, feetUp = 5): string {
  w = Math.max(8, Math.round(w));
  h = Math.max(8, Math.round(h));
  feetUp = Math.round(feetUp);
  const key = `${r}|${w}|${h}|${feetUp}`;
  let url = urls.get(key);
  if (url) return url;
  const px = paintBackdrop(r, w, h, { feetUp });
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(px, w, h), 0, 0);
  url = c.toDataURL();
  urls.set(key, url);
  return url;
}

/**
 * A box's background: the backdrop for `r`, `pix` CSS pixels to a knight pixel, tall enough for a box
 * `boxH` CSS pixels high and `w` knight pixels wide (wider than any box it goes in: it's centred, and
 * a wider screen shows more of the room), the feet `feetUp` knight pixels above the box's foot.
 */
export function backdropStyle(r: Rarity, pix: number, boxH: number, feetUp: number, w = 96): CSSProperties {
  const h = Math.ceil(boxH / pix) + 1;
  return {
    backgroundImage: `url(${backdropUrl(r, w, h, feetUp)})`,
    backgroundSize: `${w * pix}px ${h * pix}px`,
    backgroundPosition: '50% 100%',
    backgroundRepeat: 'no-repeat',
  };
}
