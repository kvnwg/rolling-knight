/**
 * Every rarity's backdrop with a knight standing in it, at a card's size, a sheet's and the HUD's
 * face, for working on the art (dev server only):
 *   http://localhost:5173/backdrops-preview.html?s=4
 * `s` is screen pixels per knight pixel; `cls` the knights' class.
 */
import { CLASSES, KNIGHTS, knightId, type ClassId } from '../core/knights';
import { RARITIES } from '../core/rarity';
import { paintBackdrop } from '../render/art/backdrops';
import { pfLoad } from '../render/pf/assets';
import { knightFaceUrl, knightUrl, KNIGHT_PIC_H, KNIGHT_PIC_W, measureKnightPics } from './sprites';

const q = new URLSearchParams(location.search);
const S = Number(q.get('s') ?? 4);
const classes = (q.get('cls') ?? 'blade,ranger,arcanist,guardian,cleric').split(',') as ClassId[];
const root = document.getElementById('root')!;
root.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${S >= 6 ? 1000 : 520}px,1fr));gap:14px;padding:14px;background:#1a1012`;
document.body.style.margin = '0';

function canvasOf(px: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(px, w, h), 0, 0);
  return c;
}

function stack(bg: HTMLCanvasElement, src: string, w: number, h: number, feetUp: number, face = false): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = `position:relative;width:${w * S}px;height:${h * S}px;overflow:hidden;box-shadow:0 0 0 2px #000, 0 0 0 4px #c8a040`;
  bg.style.cssText = `position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated`;
  box.appendChild(bg);
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = face
    ? `position:absolute;left:${1 * S}px;top:${1 * S}px;width:${16 * S}px;height:${16 * S}px;image-rendering:pixelated`
    : `position:absolute;left:${(w / 2 - KNIGHT_PIC_W / 2) * S}px;bottom:${(feetUp - (KNIGHT_PIC_H - 24)) * S}px;width:${KNIGHT_PIC_W * S}px;height:${KNIGHT_PIC_H * S}px;image-rendering:pixelated`;
  box.appendChild(img);
  return box;
}

void pfLoad().then(() => {
  measureKnightPics();
  const only = q.get('only')?.split(',');
  RARITIES.forEach((r, i) => {
    if (only && !only.includes(r)) return;
    const cls = classes[i % classes.length] in CLASSES ? classes[i % classes.length] : 'blade';
    // (One knight lives in the top tier: whoever there is.)
    const id = KNIGHTS.some((k) => k.id === knightId(r, cls)) ? knightId(r, cls) : KNIGHTS.find((k) => k.rarity === r)!.id;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:flex-end;color:#f4e4c0;font:12px monospace';
    const label = document.createElement('div');
    label.textContent = r;
    label.style.width = '70px';
    row.appendChild(label);
    const t0 = performance.now();
    const card = paintBackdrop(r, 48, 34);
    const stage = paintBackdrop(r, 64, 32);
    const face = paintBackdrop(r, 18, 18, { feetUp: -8 });
    label.title = `${(performance.now() - t0).toFixed(1)} ms`;
    row.appendChild(stack(canvasOf(card, 48, 34), knightUrl(id, null), 48, 34, 5));
    row.appendChild(stack(canvasOf(stage, 64, 32), knightUrl(id, null), 64, 32, 5));
    row.appendChild(stack(canvasOf(face, 18, 18), knightFaceUrl(id, null), 18, 18, 0, true));
    root.appendChild(row);
  });
  document.body.dataset.ready = '1';
});
