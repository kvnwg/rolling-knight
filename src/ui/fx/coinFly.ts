/**
 * A knight sold: its picture flashes gold and shrinks away while a burst of coins springs out of it,
 * hangs a moment, then the coins fly one after another along a curve up into the gold counter, which
 * bumps as each one lands. Plain DOM and the Web Animations API on a layer over everything, so it
 * outlives the card it came from (the card is gone the moment the knight is).
 */
import { iconArt } from '../px';

export interface CoinFlyOpts {
  /** How many coins (more for a rarer knight). */
  coins: number;
  /** Each coin as it lands (i from 0), and once more with `last` after the final one. */
  onLand?: (i: number, last: boolean) => void;
  reduceMotion?: boolean;
}

export function coinFly(art: Element | null, target: Element | null, o: CoinFlyOpts): void {
  if (typeof document === 'undefined' || !art) {
    o.onLand?.(0, true);
    return;
  }
  const from = art.getBoundingClientRect();
  const to = target?.getBoundingClientRect() ?? new DOMRect(window.innerWidth - 60, 12, 40, 24);
  if (o.reduceMotion || typeof (art as HTMLElement).animate !== 'function') {
    o.onLand?.(0, true);
    return;
  }
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
  document.body.appendChild(layer);

  // The knight: a copy of its picture flashes gold and shrinks to a glint.
  const ghost = art.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  ghost.style.margin = '0';
  ghost.style.transformOrigin = '50% 60%';
  layer.appendChild(ghost);
  ghost.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
      { transform: 'scale(1.1)', filter: 'brightness(1.8) sepia(1) saturate(5) hue-rotate(-10deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(0.15)', filter: 'brightness(3) sepia(1) saturate(6)', opacity: 0 },
    ],
    { duration: 460, easing: 'cubic-bezier(.45,0,.85,.35)', fill: 'forwards' },
  );

  // The coins: the counter's own coin, at its size.
  const coin = iconArt('coin', 'md');
  const icon = target?.querySelector('img')?.getBoundingClientRect();
  const size = Math.max(14, Math.round(icon?.width ?? 20));
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height * 0.55;
  const tx = icon ? icon.left + icon.width / 2 : to.left + to.width / 2;
  const ty = icon ? icon.top + icon.height / 2 : to.top + to.height / 2;
  let landed = 0;
  const n = Math.max(1, o.coins);
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.src = coin.url;
    img.alt = '';
    img.draggable = false;
    img.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;image-rendering:pixelated;opacity:0;will-change:transform`;
    layer.appendChild(img);
    // Out of the knight in a ring, a little upward...
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const r = from.width * (0.35 + Math.random() * 0.4);
    const bx = cx + Math.cos(a) * r;
    const by = cy + Math.sin(a) * r * 0.75 - from.height * 0.15;
    // ...then up and over into the counter, faster as they go.
    const c1x = bx + (tx - bx) * 0.15 + (Math.random() - 0.5) * from.width * 0.6;
    const c1y = Math.min(by, ty) - 60 - Math.random() * 70;
    const at = (x: number, y: number, s: number) => `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) scale(${s.toFixed(2)})`;
    const frames: Keyframe[] = [
      { transform: at(cx, cy, 0.3), opacity: 0, offset: 0, easing: 'cubic-bezier(.15,.85,.35,1)' },
      { transform: at(bx, by, 1.15), opacity: 1, offset: 0.26 },
      { transform: at(bx, by - 4, 1.1), opacity: 1, offset: 0.36 },
    ];
    const N = 12;
    for (let k = 1; k <= N; k++) {
      const t = Math.pow(k / N, 1.7);
      const u = 1 - t;
      const x = u * u * bx + 2 * u * t * c1x + t * t * tx;
      const y = u * u * (by - 4) + 2 * u * t * c1y + t * t * ty;
      frames.push({ transform: at(x, y, 1.1 - 0.45 * t), opacity: 1, offset: 0.36 + 0.64 * (k / N) });
    }
    const anim = img.animate(frames, { duration: 980 + Math.random() * 160, delay: 140 + i * 55, fill: 'forwards' });
    anim.onfinish = () => {
      img.remove();
      landed++;
      const last = landed === n;
      o.onLand?.(i, last);
      if (target && typeof (target as HTMLElement).animate === 'function') {
        (target as HTMLElement).animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', filter: 'brightness(1.35)' }, { transform: 'scale(1)' }], { duration: 170, easing: 'ease-out' });
      }
      if (last) window.setTimeout(() => layer.remove(), 60);
    };
  }
  // (Never leave the layer behind, whatever happens to the animations.)
  window.setTimeout(() => layer.remove(), 3200 + n * 60);
}
