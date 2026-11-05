// Throwaway cloud sheet for tuning (deleted when done).
import { hex } from './vista/pix';
import { cumulus, SKY, skyAt } from './vista/sky';

export function cloudSheet(c: HTMLCanvasElement): void {
  const g = c.getContext('2d')!;
  const W = 400;
  const H = 260;
  c.width = W * 3;
  c.height = H * 3;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  for (const [at, col] of SKY) if (at <= 1) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  const items: Array<[Parameters<typeof cumulus>[0], number, number]> = [
    [{ w: 190, h: 100, seed: 11, kind: 'tower', side: 1, sideK: 0.7, haze: skyAt(0.35), hazeK: 0.2, gain: 1 }, 5, 10],
    [{ w: 130, h: 40, seed: 12, kind: 'bank', side: -1, sideK: 0.2, haze: skyAt(0.4), hazeK: 0.25, gain: 1.15 }, 210, 20],
    [{ w: 60, h: 26, seed: 13, kind: 'puff', side: 1, sideK: 0.5, haze: skyAt(0.25), hazeK: 0.2, gain: 1 }, 210, 90],
    [{ w: 50, h: 22, seed: 14, kind: 'puff', side: 1, sideK: 0.9, haze: skyAt(0.5), hazeK: 0.3, gain: 1 }, 300, 90],
    [{ w: 150, h: 50, seed: 15, kind: 'bank', side: 1, sideK: 0.8, haze: skyAt(0.55), hazeK: 0.3, gain: 1 }, 220, 150],
    [{ w: 170, h: 90, seed: 16, kind: 'tower', side: -1, sideK: 0.4, haze: skyAt(0.5), hazeK: 0.25, gain: 1.1 }, 10, 140],
  ];
  for (const [o, x, y] of items) g.drawImage(cumulus(o).toCanvas(), x * 3, y * 3, Math.round(o.w) * 3, Math.round(o.h) * 3);
  void hex;
}
