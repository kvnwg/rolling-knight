/**
 * For a canvas that's only drawn to be read back (a picture made into a data URL): keep it in
 * memory, off the graphics card. Left to itself the browser may put even a 9 by 9 icon on the card,
 * and each read back then waits on the card (behind the game's own frame): milliseconds a picture,
 * hundreds of pictures the first time a screen opens.
 */
import type { PixelBuf } from '../render/pixel/buf';

export const READ: CanvasRenderingContext2DSettings = { willReadFrequently: true };

/** A pixel buffer as a PNG data URL. */
export function bufUrl(b: PixelBuf): string {
  const c = document.createElement('canvas');
  c.width = Math.max(1, b.w);
  c.height = Math.max(1, b.h);
  const ctx = c.getContext('2d', READ)!;
  const img = ctx.createImageData(c.width, c.height);
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
